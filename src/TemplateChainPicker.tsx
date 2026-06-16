import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  COLOR_BG,
  COLOR_FG,
  COLOR_FG_FAINT,
  COLOR_FG_SOFT,
  COLOR_GROW,
  COLOR_LINE_BG,
  COLOR_SURFACE,
} from './tokens';
import type { TemplateChain } from './templateChains';

// PR-Y1 (ADR-0023) + #305: builtin テンプレを 2 ステップで末尾追加する Modal UI。
// step1 = テンプレ一覧 (タップで開く)、 step2 = アクション個別 checkbox 選択 + 「追加」。
// onSelect(template, selectedActionTitles) は step2 の「追加」でのみ呼ばれる。
// 旧仕様 (1-step・タップ即追加) は破棄: step2 初期 = 全選択にしておけば「そのまま追加」
// で旧仕様と等価な結果になる (互換は確保)。
export type TemplateChainPickerProps = {
  templates: ReadonlyArray<TemplateChain>;
  onSelect: (
    template: TemplateChain,
    selectedActionTitles: ReadonlyArray<string>,
  ) => void;
  onCancel: () => void;
};

export const TemplateChainPicker = ({
  templates,
  onSelect,
  onCancel,
}: TemplateChainPickerProps) => {
  // 開いているテンプレ (null = step1 表示)。
  const [openTemplate, setOpenTemplate] = useState<TemplateChain | null>(null);
  // 選択された index (Set)。 同タイトル重複を扱うため title ではなく index で持つ。
  const [selectedIndexes, setSelectedIndexes] = useState<ReadonlySet<number>>(
    new Set(),
  );

  const openStep2 = useCallback((t: TemplateChain) => {
    setOpenTemplate(t);
    // 初期は全件選択 (旧 1-step の「タップ = 全件追加」と等価)。
    setSelectedIndexes(new Set(t.actions.map((_, i) => i)));
  }, []);

  const backToStep1 = useCallback(() => {
    setOpenTemplate(null);
    setSelectedIndexes(new Set());
  }, []);

  const toggleIndex = useCallback((i: number) => {
    setSelectedIndexes((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    if (!openTemplate) return;
    setSelectedIndexes(new Set(openTemplate.actions.map((_, i) => i)));
  }, [openTemplate]);

  const deselectAll = useCallback(() => {
    setSelectedIndexes(new Set());
  }, []);

  const selectedTitles = useMemo<ReadonlyArray<string>>(() => {
    if (!openTemplate) return [];
    return openTemplate.actions.filter((_, i) => selectedIndexes.has(i));
  }, [openTemplate, selectedIndexes]);

  const handleSubmit = useCallback(() => {
    if (!openTemplate) return;
    if (selectedTitles.length === 0) return; // 0 件追加は不可
    onSelect(openTemplate, selectedTitles);
  }, [openTemplate, selectedTitles, onSelect]);

  if (openTemplate == null) {
    // ===== Step 1: テンプレ一覧 =====
    return (
      <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
        <View style={styles.topbar}>
          <Pressable onPress={onCancel} accessibilityRole="button">
            <Text style={styles.cancel}>キャンセル</Text>
          </Pressable>
          <Text style={styles.title} numberOfLines={1}>
            テンプレから追加
          </Text>
          <View style={styles.topbarSpacer} />
        </View>
        <Text style={styles.hint}>
          テンプレを開いて、追加したいアクションだけを選べます。
        </Text>
        <ScrollView contentContainerStyle={styles.list}>
          {templates.map((t) => (
            <Pressable
              key={t.id}
              onPress={() => openStep2(t)}
              accessibilityRole="button"
              accessibilityLabel={`テンプレ「${t.title}」を開く`}
              style={styles.card}
            >
              <Text style={styles.cardTitle}>{t.title}</Text>
              <Text style={styles.cardActions} numberOfLines={3}>
                {t.actions.join(' / ')}
              </Text>
              <Text style={styles.cardMeta}>{t.actions.length} ノード</Text>
            </Pressable>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ===== Step 2: アクション個別選択 =====
  const allSelected = selectedIndexes.size === openTemplate.actions.length;
  const toggleAllLabel = allSelected ? '全解除' : '全選択';
  const submitLabel = `${selectedTitles.length}件を追加`;
  const submitDisabled = selectedTitles.length === 0;

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <View style={styles.topbar}>
        <Pressable
          onPress={backToStep1}
          accessibilityRole="button"
          accessibilityLabel="テンプレ一覧に戻る"
        >
          <Text style={styles.cancel}>← 戻る</Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {openTemplate.title}
        </Text>
        <Pressable onPress={onCancel} accessibilityRole="button">
          <Text style={styles.cancel}>キャンセル</Text>
        </Pressable>
      </View>
      <View style={styles.step2Subbar}>
        <Text style={styles.hint}>
          追加したいアクションを選んでください。
        </Text>
        <Pressable
          onPress={allSelected ? deselectAll : selectAll}
          accessibilityRole="button"
          accessibilityLabel={toggleAllLabel}
          hitSlop={8}
        >
          <Text style={styles.toggleAllText}>{toggleAllLabel}</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.actionList}>
        {openTemplate.actions.map((title, i) => {
          const checked = selectedIndexes.has(i);
          return (
            <Pressable
              // 同タイトル重複に備えて index 込みの key を作る。
              key={`${i}:${title}`}
              onPress={() => toggleIndex(i)}
              accessibilityRole="checkbox"
              accessibilityLabel={`アクション「${title}」`}
              accessibilityState={{ checked }}
              style={[styles.actionRow, checked && styles.actionRowChecked]}
            >
              <View
                style={[
                  styles.checkbox,
                  checked && styles.checkboxChecked,
                ]}
              >
                {checked && <Text style={styles.checkboxMark}>✓</Text>}
              </View>
              <Text style={styles.actionTitle}>{title}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={styles.footer}>
        <Pressable
          onPress={handleSubmit}
          disabled={submitDisabled}
          accessibilityRole="button"
          accessibilityLabel={submitLabel}
          accessibilityState={{ disabled: submitDisabled }}
          style={[styles.submitBtn, submitDisabled && styles.submitBtnDisabled]}
        >
          <Text
            style={[
              styles.submitBtnText,
              submitDisabled && styles.submitBtnTextDisabled,
            ]}
          >
            {submitLabel}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLOR_BG },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  cancel: { color: COLOR_FG_SOFT, fontSize: 14 },
  title: { color: COLOR_FG, fontSize: 14, fontWeight: '600' },
  topbarSpacer: { width: 56 },
  hint: {
    color: COLOR_FG_FAINT,
    fontSize: 12,
    paddingHorizontal: 16,
    paddingBottom: 8,
    flex: 1,
  },
  list: { padding: 16, gap: 12 },
  card: {
    backgroundColor: COLOR_SURFACE,
    borderRadius: 14,
    padding: 16,
    gap: 6,
    marginBottom: 12,
  },
  cardTitle: { color: COLOR_FG, fontSize: 16, fontWeight: '700' },
  cardActions: { color: COLOR_FG_SOFT, fontSize: 13, lineHeight: 18 },
  cardMeta: { color: COLOR_GROW, fontSize: 11, fontWeight: '600', marginTop: 4 },
  // Step 2
  step2Subbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  toggleAllText: {
    color: COLOR_GROW,
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 8,
  },
  actionList: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 16, gap: 8 },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLOR_SURFACE,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  actionRowChecked: {
    backgroundColor: COLOR_LINE_BG,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: COLOR_FG_FAINT,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLOR_BG,
  },
  checkboxChecked: {
    backgroundColor: COLOR_GROW,
    borderColor: COLOR_GROW,
  },
  checkboxMark: { color: COLOR_BG, fontSize: 14, fontWeight: '700' },
  actionTitle: { color: COLOR_FG, fontSize: 15, flex: 1 },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
  submitBtn: {
    backgroundColor: COLOR_GROW,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitBtnDisabled: { backgroundColor: COLOR_LINE_BG },
  submitBtnText: { color: COLOR_BG, fontSize: 14, fontWeight: '700' },
  submitBtnTextDisabled: { color: COLOR_FG_FAINT },
});
