import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { PROMOTE_COLORS, validatePromotion } from './editLayout';
import {
  COLOR_BG,
  COLOR_FG,
  COLOR_FG_FAINT,
  COLOR_FG_SOFT,
  COLOR_GROW,
  COLOR_LINE_BG,
  COLOR_SURFACE,
} from './tokens';

// #93 (SPEC §6): カスタムインボックスのアクションを複数選択 → 命名 + 色付けで
// ユーザーモジュールに昇格するパネル。props 駆動で hook 非依存 = RTL テスト可能。

export type PromoteCandidate = { nodeId: string; title: string };

export type PromoteModulePanelProps = {
  candidates: readonly PromoteCandidate[];
  onPromote: (nodeIds: string[], name: string, color: string) => void;
  onCancel: () => void;
};

export const PromoteModulePanel = ({
  candidates,
  onPromote,
  onCancel,
}: PromoteModulePanelProps) => {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [name, setName] = useState('');
  const [colorIndex, setColorIndex] = useState(0);

  const toggle = (nodeId: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });

  const error = validatePromotion(name, selected.size);
  const canPromote = error === null;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>モジュールに昇格</Text>
        <Pressable onPress={onCancel} accessibilityRole="button">
          <Text style={styles.cancel}>閉じる</Text>
        </Pressable>
      </View>
      <Text style={styles.hint}>
        まとめたいアクションを選んで、名前と色をつけるとモジュールになります。
      </Text>

      <Text style={styles.sectionLabel}>アクションを選ぶ</Text>
      <View style={styles.list}>
        {candidates.map((c) => {
          const checked = selected.has(c.nodeId);
          return (
            <Pressable
              key={c.nodeId}
              onPress={() => toggle(c.nodeId)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              accessibilityLabel={c.title}
              style={[styles.row, checked && styles.rowChecked]}
            >
              <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                {checked && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.rowText}>{c.title}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.sectionLabel}>モジュール名</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="朝食まわり"
        placeholderTextColor={COLOR_FG_FAINT}
        style={styles.nameInput}
        accessibilityLabel="モジュール名"
      />

      <Text style={styles.sectionLabel}>色</Text>
      <View style={styles.colorRow}>
        {PROMOTE_COLORS.map((c, i) => (
          <Pressable
            key={c}
            onPress={() => setColorIndex(i)}
            accessibilityRole="button"
            accessibilityLabel={`色 ${i + 1}`}
            accessibilityState={{ selected: colorIndex === i }}
            style={[
              styles.colorDot,
              { backgroundColor: c },
              colorIndex === i && styles.colorDotSelected,
            ]}
          />
        ))}
      </View>

      <Pressable
        onPress={() =>
          onPromote(Array.from(selected), name, PROMOTE_COLORS[colorIndex]!)
        }
        disabled={!canPromote}
        accessibilityRole="button"
        accessibilityLabel="昇格する"
        accessibilityState={{ disabled: !canPromote }}
        style={[styles.promoteBtn, !canPromote && styles.promoteBtnDisabled]}
      >
        <Text style={styles.promoteBtnText}>昇格する</Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { backgroundColor: COLOR_BG, padding: 16, gap: 10, flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { color: COLOR_FG, fontSize: 16, fontWeight: '700' },
  cancel: { color: COLOR_FG_SOFT, fontSize: 14 },
  hint: { color: COLOR_FG_SOFT, fontSize: 12, lineHeight: 18 },
  sectionLabel: {
    color: COLOR_FG_SOFT,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
  },
  list: { gap: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: COLOR_SURFACE,
    minHeight: 44,
  },
  rowChecked: { backgroundColor: COLOR_LINE_BG },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: COLOR_FG_FAINT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: COLOR_GROW, borderColor: COLOR_GROW },
  checkmark: { color: COLOR_BG, fontSize: 14, fontWeight: '700' },
  rowText: { color: COLOR_FG, fontSize: 15, flex: 1 },
  nameInput: {
    color: COLOR_FG,
    fontSize: 16,
    backgroundColor: COLOR_SURFACE,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  colorDot: {
    width: 32,
    height: 32,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorDotSelected: { borderColor: COLOR_FG },
  promoteBtn: {
    marginTop: 12,
    backgroundColor: COLOR_GROW,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  promoteBtnDisabled: { opacity: 0.5 },
  promoteBtnText: { color: COLOR_BG, fontSize: 15, fontWeight: '700' },
});
