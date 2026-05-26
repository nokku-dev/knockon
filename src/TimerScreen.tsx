import * as Notifications from 'expo-notifications';
import { useEffect, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  Vibration,
  View,
} from 'react-native';

import {
  COLOR_BG,
  COLOR_FG,
  COLOR_FG_FAINT,
  COLOR_FG_SOFT,
  COLOR_GROW,
  COLOR_LINE_BG,
} from './tokens';

// PR-BB (ADR-0025): ノードタイマーのフルスクリーン Modal。
// 起動 → カウントダウン → 完了で自動達成 + 通知音 + 振動 + 閉じる。
//
// 通知音: expo-notifications で trigger: null の即時通知 = OS デフォルト通知音
// (= 控えめ、 サイレント時は鳴らない)。 expo-av / アセット追加なしで依存ゼロ。
// 振動: react-native 標準 Vibration API (built-in、 依存追加なし)。

export type TimerScreenProps = {
  visible: boolean;
  durationSeconds: number;
  actionTitle: string;
  onCancel: () => void;
  onComplete: () => void;
};

export const TimerScreen = ({
  visible,
  durationSeconds,
  actionTitle,
  onCancel,
  onComplete,
}: TimerScreenProps) => {
  const [remaining, setRemaining] = useState(durationSeconds);
  const [paused, setPaused] = useState(false);
  // visible 遷移を検出して remaining をリセット (= モーダル再オープン時)
  const prevVisibleRef = useRef(visible);

  useEffect(() => {
    if (visible && !prevVisibleRef.current) {
      setRemaining(durationSeconds);
      setPaused(false);
    }
    prevVisibleRef.current = visible;
  }, [visible, durationSeconds]);

  // カウントダウン (1 秒間隔)。 paused or 非表示なら interval を回さない。
  useEffect(() => {
    if (!visible || paused) return;
    if (remaining <= 0) return;
    const id = setInterval(() => {
      setRemaining((r) => r - 1);
    }, 1000);
    return () => clearInterval(id);
  }, [visible, paused, remaining]);

  // 完了通知 + 振動 + onComplete 呼び出し。 remaining が 0 になった瞬間 1 回だけ発火。
  // 受容判断 (K-010 同型): JS timer は backgrounding で不正確になるが Phase 1 N=1 前提
  // (= タイマー使用中は前面表示) を受容。 実機検証で問題出たら BackgroundTask 検討。
  useEffect(() => {
    if (!visible) return;
    if (remaining > 0) return;
    // 即時通知 (banner なし、 音と振動のみ)。 設定は app/_layout.tsx の
    // setNotificationHandler が共通管理 (shouldPlaySound: true, shouldShowBanner: false)。
    Notifications.scheduleNotificationAsync({
      content: {
        title: 'タイマー完了',
        body: actionTitle,
        sound: true,
      },
      trigger: null,
    }).catch(() => {
      // 通知 schedule 失敗は silently fallback (K-024 同型)
    });
    Vibration.vibrate([100, 50, 100]);
    onComplete();
    // onComplete 内で visible=false に切替される前提のため、 再発火しないよう
    // dependency は [visible, remaining] にしてリセット時に再評価。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, remaining]);

  const minutes = Math.floor(Math.max(remaining, 0) / 60);
  const seconds = Math.max(remaining, 0) % 60;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={onCancel}
    >
      <View style={styles.root}>
        <View style={styles.body}>
          <Text style={styles.label}>{actionTitle}</Text>
          <Text style={styles.time} accessibilityLabel="残り時間">
            {String(minutes).padStart(2, '0')}:
            {String(seconds).padStart(2, '0')}
          </Text>
          <Text style={styles.hint}>
            {paused ? '一時停止中' : '実行中'}
          </Text>
        </View>
        <View style={styles.actions}>
          <Pressable
            onPress={() => setPaused((p) => !p)}
            accessibilityRole="button"
            accessibilityLabel={paused ? 'タイマー再開' : 'タイマー一時停止'}
            style={styles.actionBtn}
          >
            <Text style={styles.actionText}>{paused ? '再開' : '一時停止'}</Text>
          </Pressable>
          <Pressable
            onPress={onCancel}
            accessibilityRole="button"
            accessibilityLabel="タイマーキャンセル"
            style={[styles.actionBtn, styles.actionBtnCancel]}
          >
            <Text style={styles.actionTextCancel}>キャンセル</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLOR_BG,
    justifyContent: 'space-between',
    paddingBottom: 48,
    paddingTop: 64,
  },
  body: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  label: { color: COLOR_FG_SOFT, fontSize: 16 },
  time: {
    color: COLOR_FG,
    fontSize: 96,
    fontWeight: '700',
    letterSpacing: -2,
    fontVariant: ['tabular-nums'],
  },
  hint: { color: COLOR_FG_FAINT, fontSize: 13 },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 24,
  },
  actionBtn: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 999,
    backgroundColor: COLOR_GROW,
    minWidth: 120,
    alignItems: 'center',
  },
  actionText: { color: COLOR_BG, fontSize: 15, fontWeight: '700' },
  actionBtnCancel: {
    backgroundColor: COLOR_LINE_BG,
  },
  actionTextCancel: { color: COLOR_FG_SOFT, fontSize: 15, fontWeight: '600' },
});
