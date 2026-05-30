import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  COLOR_BG,
  COLOR_FG,
  COLOR_FG_FAINT,
  COLOR_FG_SOFT,
  COLOR_GROW,
  COLOR_SURFACE,
} from './tokens';

// ADR-0028 (PR-DD): アプリ設定モーダル。 当面はリセット時刻のみ。
// HH:MM 入力 UI は AnchorEditor のスタイルを踏襲 (整合性、 学習コストなし)。

export type SettingsModalProps = {
  open: boolean;
  resetTime: string; // 'HH:MM'
  onClose: () => void;
  onSave: (resetTime: string) => Promise<void> | void;
};

const pad2 = (n: number): string => String(n).padStart(2, '0');

const parseHM = (s: string): { hour: number; minute: number } | null => {
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

const initialParts = (resetTime: string): { hour: string; minute: string } => {
  const p = parseHM(resetTime);
  if (p) return { hour: pad2(p.hour), minute: pad2(p.minute) };
  return { hour: '00', minute: '00' };
};

export const SettingsModal = ({
  open,
  resetTime,
  onClose,
  onSave,
}: SettingsModalProps) => {
  const init = initialParts(resetTime);
  const [hour, setHour] = useState(init.hour);
  const [minute, setMinute] = useState(init.minute);
  const [saving, setSaving] = useState(false);

  // モーダルを open し直したとき / 外部から resetTime が変わったとき、 ローカル状態も同期。
  useEffect(() => {
    const p = initialParts(resetTime);
    setHour(p.hour);
    setMinute(p.minute);
  }, [resetTime, open]);

  const handleHourBlur = () => setHour(clampToHour(hour));
  const handleMinuteBlur = () => setMinute(clampToMinute(minute));

  const handleSave = async () => {
    const h = clampToHour(hour);
    const m = clampToMinute(minute);
    const next = `${h}:${m}`;
    setHour(h);
    setMinute(m);
    setSaving(true);
    try {
      await onSave(next);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={open}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.root}
      >
        <View style={styles.topbar}>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="設定を閉じる"
          >
            <Text style={styles.cancel}>閉じる</Text>
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>
            設定
          </Text>
          <Pressable
            onPress={handleSave}
            accessibilityRole="button"
            accessibilityLabel="設定を保存"
            accessibilityState={{ disabled: saving }}
            disabled={saving}
            style={styles.saveBtn}
          >
            <Text style={styles.saveBtnText}>{saving ? '保存中…' : '保存'}</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          <View style={styles.card}>
            <Text style={styles.fieldLabel}>1 日のリセット時刻</Text>
            <View style={styles.timeRow}>
              <TextInput
                value={hour}
                onChangeText={setHour}
                onBlur={handleHourBlur}
                keyboardType="number-pad"
                maxLength={2}
                style={styles.timeInput}
                accessibilityLabel="リセット時刻 時"
                selectTextOnFocus
              />
              <Text style={styles.timeColon}>:</Text>
              <TextInput
                value={minute}
                onChangeText={setMinute}
                onBlur={handleMinuteBlur}
                keyboardType="number-pad"
                maxLength={2}
                style={styles.timeInput}
                accessibilityLabel="リセット時刻 分"
                selectTextOnFocus
              />
            </View>
            <Text style={styles.fieldHint}>
              この時刻でノードのチェック状態が「翌日」に切り替わります。{'\n'}
              例: 03:00 にすると、 深夜 0-3 時の操作は当日 (= 昨日の日付) 扱い。{'\n'}
              デフォルト 00:00 (深夜 0 時)。
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
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
  headerTitle: { color: COLOR_FG, fontSize: 14, fontWeight: '600' },
  saveBtn: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: COLOR_GROW,
  },
  saveBtnText: { color: COLOR_BG, fontSize: 13, fontWeight: '700' },
  body: { padding: 16, gap: 16, paddingBottom: 48 },
  card: {
    backgroundColor: COLOR_SURFACE,
    borderRadius: 14,
    padding: 16,
    gap: 12,
    alignItems: 'center',
  },
  fieldLabel: {
    color: COLOR_FG_SOFT,
    fontSize: 12,
    fontWeight: '600',
    alignSelf: 'flex-start',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timeInput: {
    color: COLOR_FG,
    fontSize: 48,
    fontWeight: '700',
    letterSpacing: -1.5,
    minWidth: 72,
    textAlign: 'center',
    backgroundColor: COLOR_BG,
    borderRadius: 10,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  timeColon: {
    color: COLOR_FG_FAINT,
    fontSize: 48,
    fontWeight: '700',
  },
  fieldHint: {
    color: COLOR_FG_FAINT,
    fontSize: 11,
    lineHeight: 16,
    alignSelf: 'stretch',
  },
});
