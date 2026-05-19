import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { Anchor, Chain } from './domain';
import {
  COLOR_BG,
  COLOR_FG,
  COLOR_FG_FAINT,
  COLOR_FG_SOFT,
  COLOR_GROW,
  COLOR_SURFACE,
} from './tokens';

export type AnchorSettingsScreenProps = {
  chain: Chain;
  anchor: Anchor;
  saving: boolean;
  onCancel: () => void;
  onSave: (time: string) => void;
};

const pad2 = (n: number): string => String(n).padStart(2, '0');
const parseHM = (
  s: string,
): { hour: number; minute: number } | null => {
  const parts = s.split(':');
  if (parts.length !== 2) return null;
  const hour = parseInt(parts[0]!, 10);
  const minute = parseInt(parts[1]!, 10);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
};
const clampToHour = (raw: string): string => {
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) return '00';
  return pad2(Math.min(23, Math.max(0, n)));
};
const clampToMinute = (raw: string): string => {
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) return '00';
  return pad2(Math.min(59, Math.max(0, n)));
};

const defaultTimeFromAnchor = (anchor: Anchor): string =>
  parseHM(anchor.time ?? '') ? anchor.time! : '07:30';

export const AnchorSettingsScreen = ({
  chain,
  anchor,
  saving,
  onCancel,
  onSave,
}: AnchorSettingsScreenProps) => {
  const initial = defaultTimeFromAnchor(anchor);
  const initialParts = parseHM(initial)!;
  const [hour, setHour] = useState(pad2(initialParts.hour));
  const [minute, setMinute] = useState(pad2(initialParts.minute));
  const composed = `${hour}:${minute}`;
  const valid = parseHM(composed) !== null;

  const handleSave = () => {
    if (!valid || saving) return;
    onSave(composed);
  };

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <View style={styles.topbar}>
        <Pressable onPress={onCancel} accessibilityRole="button">
          <Text style={styles.cancel}>キャンセル</Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          起点アンカーを時刻に設定
        </Text>
        <Pressable
          onPress={handleSave}
          accessibilityRole="button"
          accessibilityState={{ disabled: !valid || saving }}
        >
          <Text style={[styles.save, !valid && styles.saveDisabled]}>
            {saving ? '保存中…' : '保存'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.sectionTime}>
        <Text style={styles.sectionLabel}>発火時刻</Text>
        <View style={styles.timeRow}>
          <TextInput
            value={hour}
            onChangeText={setHour}
            onBlur={() => setHour(clampToHour(hour))}
            keyboardType="number-pad"
            maxLength={2}
            style={styles.timeInput}
            accessibilityLabel="時"
            selectTextOnFocus
          />
          <Text style={styles.timeColon}>:</Text>
          <TextInput
            value={minute}
            onChangeText={setMinute}
            onBlur={() => setMinute(clampToMinute(minute))}
            keyboardType="number-pad"
            maxLength={2}
            style={styles.timeInput}
            accessibilityLabel="分"
            selectTextOnFocus
          />
        </View>
        <Text style={styles.timeHint}>
          {chain.title} を毎日この時刻に発火扱いします
        </Text>
      </View>

      <View style={styles.sectionFallback}>
        <Text style={styles.fallbackTitle}>通知は後送り</Text>
        <Text style={styles.fallbackBody}>
          v1 では時刻に達すると Today の起点アンカー横に「発火中」ピルが出ます。OS のローカル通知は Dev Build 移行後に追加します (Phase 1.5b)。Today からの手動チェックは常に可能なので運用は止まりません。
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scroll: {
    padding: 24,
    gap: 16,
  },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
  },
  cancel: {
    color: COLOR_FG_SOFT,
    fontSize: 14,
  },
  title: {
    color: COLOR_FG,
    fontSize: 14,
    fontWeight: '600',
  },
  save: {
    color: COLOR_GROW,
    fontSize: 14,
    fontWeight: '600',
  },
  saveDisabled: {
    color: COLOR_FG_FAINT,
  },
  sectionTime: {
    backgroundColor: COLOR_SURFACE,
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    gap: 8,
  },
  sectionLabel: {
    color: COLOR_FG_SOFT,
    fontSize: 12,
    fontWeight: '600',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timeInput: {
    color: COLOR_FG,
    fontSize: 56,
    fontWeight: '700',
    letterSpacing: -2,
    minWidth: 80,
    textAlign: 'center',
    backgroundColor: COLOR_BG,
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  timeColon: {
    color: COLOR_FG_FAINT,
    fontSize: 56,
    fontWeight: '700',
  },
  timeHint: {
    color: COLOR_FG_FAINT,
    fontSize: 11,
  },
  sectionFallback: {
    backgroundColor: COLOR_SURFACE,
    borderRadius: 14,
    padding: 16,
    gap: 4,
  },
  fallbackTitle: {
    color: COLOR_FG,
    fontSize: 13,
    fontWeight: '600',
  },
  fallbackBody: {
    color: COLOR_FG_SOFT,
    fontSize: 12,
    lineHeight: 18,
  },
});
