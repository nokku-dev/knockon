import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { MetricKind } from './metricKindsRepository';
import {
  COLOR_BG,
  COLOR_FG,
  COLOR_FG_FAINT,
  COLOR_FG_SOFT,
  COLOR_GROW,
  COLOR_LINE_BG,
  COLOR_SURFACE,
} from './tokens';

// PR-Z3a (ADR-0024 §3c): メトリクス手入力モーダル。
// 既存 Notion Body Metrics と二重記録を強制しないため、 任意入力。
// open=false なら何もレンダリングしない (Modal の visible で隠れる)。
//
// UX:
// 1. kind タブ (体重 / 運動 / 睡眠) で対象を切替
// 2. 数値入力 (numeric keyboard) → 「保存」ボタン
// 3. 単位は kind 由来 (kg / 分 / 時間)
//
// initialKind で初期選択を指定可能 (= section 側で「体重 +記録」を押したら weight を選択済みで開く)。
export type MetricInputModalProps = {
  open: boolean;
  // PR-CC (ADR-0026): kinds は DB の metric_kinds から動的取得 (親 useMetricsData)。
  kinds: readonly MetricKind[];
  initialKind?: string;
  onCancel: () => void;
  onSubmit: (metricKey: string, value: number) => Promise<void> | void;
};

export const MetricInputModal = ({
  open,
  kinds,
  initialKind,
  onCancel,
  onSubmit,
}: MetricInputModalProps) => {
  const [kind, setKind] = useState<MetricKind | null>(
    () => kinds.find((k) => k.key === initialKind) ?? kinds[0] ?? null,
  );
  const [valueText, setValueText] = useState('');

  // 親が Modal を永続マウントして open でトグルする構造のため、 useState(initial!)
  // の初期値は初回マウント時しか評価されない。 「+ 体重」→キャンセル→「+ 運動」と続けて
  // 開いたとき initialKind props は変わるが kind state が前回値のまま残るバグ対応。
  // open 遷移ごとに initialKind に再同期 + 値もクリア (キャンセル時も値が残らない)。
  useEffect(() => {
    if (open) {
      const next = kinds.find((k) => k.key === initialKind) ?? kinds[0] ?? null;
      setKind(next);
      setValueText('');
    }
  }, [open, initialKind, kinds]);

  const handleSubmit = async () => {
    const value = parseFloat(valueText);
    if (!isFinite(value) || value < 0) return; // 簡易バリデーション (負の値 / NaN を弾く)
    if (!kind) return; // 種別が 1 件もない (= ユーザーが全削除した) ケース防御
    await onSubmit(kind.key, value);
    setValueText('');
    onCancel();
  };

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.kav}
      >
        <Pressable style={styles.overlay} onPress={onCancel}>
          <Pressable
            style={styles.sheet}
            onPress={(e) => e.stopPropagation()}
            accessibilityLabel="メトリクス入力"
          >
            <Text style={styles.title}>メトリクスを記録</Text>
            {kind == null ? (
              <Text style={styles.emptyHint}>
                メトリクス種別がありません。 種別管理から追加してください。
              </Text>
            ) : (
              <>
                <View style={styles.kindRow}>
                  {kinds.map((k) => (
                    <Pressable
                      key={k.key}
                      onPress={() => setKind(k)}
                      accessibilityRole="button"
                      accessibilityLabel={`${k.label} を選択`}
                      accessibilityState={{ selected: kind.key === k.key }}
                      style={[
                        styles.kindTab,
                        kind.key === k.key && styles.kindTabActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.kindTabText,
                          kind.key === k.key && styles.kindTabTextActive,
                        ]}
                      >
                        {k.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.inputRow}>
                  <TextInput
                    value={valueText}
                    onChangeText={setValueText}
                    placeholder="0"
                    placeholderTextColor={COLOR_FG_FAINT}
                    keyboardType="numeric"
                    style={styles.input}
                    accessibilityLabel={`${kind.label} の値`}
                    autoFocus
                  />
                  <Text style={styles.unit}>{kind.unit}</Text>
                </View>
              </>
            )}
            <View style={styles.actions}>
              <Pressable
                onPress={onCancel}
                accessibilityRole="button"
                accessibilityLabel="キャンセル"
                style={styles.cancelBtn}
              >
                <Text style={styles.cancelText}>キャンセル</Text>
              </Pressable>
              <Pressable
                onPress={handleSubmit}
                accessibilityRole="button"
                accessibilityLabel="保存"
                style={styles.submitBtn}
              >
                <Text style={styles.submitText}>保存</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  // KeyboardAvoidingView は素の flex:1 で全画面を埋めるだけ (中央寄せ/背景は付けない)。
  // ここに alignItems:'center' を付けると子 (overlay) の幅が中身サイズに縮んで
  // バックドロップが縦長の帯になるため分離する。
  kav: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: COLOR_SURFACE,
    borderRadius: 16,
    padding: 20,
    gap: 14,
  },
  title: {
    color: COLOR_FG,
    fontSize: 16,
    fontWeight: '700',
  },
  emptyHint: {
    color: COLOR_FG_FAINT,
    fontSize: 13,
    paddingVertical: 8,
  },
  kindRow: {
    flexDirection: 'row',
    gap: 8,
  },
  kindTab: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: COLOR_LINE_BG,
  },
  kindTabActive: {
    backgroundColor: COLOR_FG,
  },
  kindTabText: {
    color: COLOR_FG_SOFT,
    fontSize: 13,
    fontWeight: '600',
  },
  kindTabTextActive: {
    color: COLOR_BG,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    borderBottomWidth: 1,
    borderBottomColor: COLOR_LINE_BG,
    paddingBottom: 6,
  },
  input: {
    flex: 1,
    color: COLOR_FG,
    fontSize: 28,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  unit: {
    color: COLOR_FG_FAINT,
    fontSize: 14,
    marginLeft: 8,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  cancelText: {
    color: COLOR_FG_SOFT,
    fontSize: 14,
  },
  submitBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: COLOR_GROW,
  },
  submitText: {
    color: COLOR_BG,
    fontSize: 14,
    fontWeight: '700',
  },
});
