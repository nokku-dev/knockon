import * as Notifications from 'expo-notifications';
import { useEffect, useRef, useState } from 'react';
import {
  AppState,
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
// 起動 → カウントダウン → 完了で自動達成 + 通知音 + 振動。
//
// Issue #116: 完了 = 「すぐ閉じる」ではなく「完了表示のまま残る」+ 「閉じる」を明示操作に。
//   加えて、 規定時間に到達していなくても押せる「完了」(早期完了) ボタンを追加。
//   - 完了 (満了 or 早期完了) で onComplete を 1 回だけ呼び (= 親で達成記録 force set)、
//     内部状態 isCompleted=true に遷移して「完了」表示 + 「閉じる」のみを描画。
//   - 「閉じる」タップは onCancel を呼ぶ (= 親が setTimerState(null) で Modal を閉じる、
//     達成記録は親側で既に記録済みのため変更しない)。 「キャンセル」と semantic を分けず、
//     完了済みかどうかで親側の挙動も変わらないため onCancel を再利用する。
//   - 早期完了は scheduled 通知をキャンセル (= 後で OS alarm が鳴らないように)。
//
// Issue #86: バックグラウンドでもタイマーが動くように修正。 旧実装は setInterval
// ベースで background で JS が throttle されると残り時間が止まり alarm も鳴らない
// 問題があった (= ADR-0025 「注意点」で Phase 1 受容と書いた挙動)。 修正方針:
//   1. wall-clock 基準: 開始時に endTime = Date.now() + duration*1000 を確定。
//      毎 tick / AppState 'active' 復帰時に Date.now() で残り時間を再計算する
//      (= JS の setInterval が止まっていても foreground 復帰時点で正しい値に)。
//   2. 通知の事前スケジュール: 開始時に future trigger (= duration 秒後) で通知を
//      スケジュール。 OS タイマーで発火するため、 background で JS が止まっていても
//      alarm が鳴る。 pause / cancel / 通常完了時にキャンセル可。
//   3. AppState 'active' listener: foreground 復帰時に setNow(Date.now()) で
//      remaining を再評価 → 過ぎていたら onComplete (自動達成) を発火。
//
// 通知音: app/_layout.tsx の setNotificationHandler が data.kind === 'timer-complete'
//         のときだけ shouldPlaySound: true を返す (K-026 回避)。
// 振動: react-native 標準 Vibration API (built-in、 依存追加なし)。

export type TimerScreenProps = {
  visible: boolean;
  durationSeconds: number;
  actionTitle: string;
  onCancel: () => void;
  onComplete: () => void;
};

const NOTIFICATION_CONTENT = (actionTitle: string) => ({
  title: 'タイマー完了',
  body: actionTitle,
  sound: true,
  data: { kind: 'timer-complete' as const },
});

const scheduleCompletionNotification = (
  seconds: number,
  actionTitle: string,
): Promise<string | null> =>
  Notifications.scheduleNotificationAsync({
    content: NOTIFICATION_CONTENT(actionTitle),
    // future-trigger: OS 側で `seconds` 経過後に発火する。 background で JS が止まっていても
    // OS が発火するため alarm が鳴る (Issue #86)。
    // SDK 54 では `{ seconds, type: 'timeInterval' }` 形式を推奨。 mock では trigger
    // の中身は問われない (= 内容は OS API に委譲)。
    trigger: {
      seconds: Math.max(seconds, 1),
      type: 'timeInterval',
      repeats: false,
    } as unknown as Notifications.NotificationTriggerInput,
  })
    .then((id) => id)
    .catch(() => null);

const cancelNotification = (id: string | null) => {
  if (!id) return;
  Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined);
};

export const TimerScreen = ({
  visible,
  durationSeconds,
  actionTitle,
  onCancel,
  onComplete,
}: TimerScreenProps) => {
  // wall-clock model:
  //   - running: endTimeMs != null, pausedRemainingMs == null
  //   - paused:  endTimeMs == null, pausedRemainingMs != null
  //   - idle (visible=false): どちらも null
  const [endTimeMs, setEndTimeMs] = useState<number | null>(null);
  const [pausedRemainingMs, setPausedRemainingMs] = useState<number | null>(
    null,
  );
  // now を state で持つことで setInterval tick / AppState 'active' のどちらからも
  // setNow(Date.now()) を呼ぶだけで残り時間表示が再評価される。
  const [now, setNow] = useState<number>(() => Date.now());
  // Issue #116: 完了表示状態。 true で「完了」ラベル + 「閉じる」のみを描画。
  const [isCompleted, setIsCompleted] = useState(false);
  const notifIdRef = useRef<string | null>(null);
  const completedRef = useRef(false);
  // 初期値は false 固定: 初回マウント時に visible=true なら init effect を発火させるため
  // (useRef(visible) だと初回 prev=true で init が skip される)。
  const prevVisibleRef = useRef(false);

  // visible 遷移を検出して新規 timer を開始 / 終了。
  useEffect(() => {
    const wasVisible = prevVisibleRef.current;
    prevVisibleRef.current = visible;

    if (visible && !wasVisible) {
      // open: 新規タイマー開始
      const start = Date.now();
      setEndTimeMs(start + durationSeconds * 1000);
      setPausedRemainingMs(null);
      setNow(start);
      setIsCompleted(false);
      completedRef.current = false;
      scheduleCompletionNotification(durationSeconds, actionTitle).then((id) => {
        notifIdRef.current = id;
      });
    } else if (!visible && wasVisible) {
      // close: scheduled 通知をキャンセル + state リセット
      cancelNotification(notifIdRef.current);
      notifIdRef.current = null;
      setEndTimeMs(null);
      setPausedRemainingMs(null);
      setIsCompleted(false);
      completedRef.current = false;
    }
  }, [visible, durationSeconds, actionTitle]);

  // 1 秒間隔の tick: now を Date.now() で更新 → remaining が再計算される。
  // dep を [visible, endTimeMs, isCompleted] に絞り、 paused / completed 中は interval を回さない。
  useEffect(() => {
    if (!visible || endTimeMs == null || isCompleted) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [visible, endTimeMs, isCompleted]);

  // Issue #86: AppState 'active' で foreground 復帰を検出 → now を再評価。
  // background 中に JS が止まっていても wall-clock で remaining が正しく更新される。
  // 復帰時点で remainingMs <= 0 なら下の完了 effect が onComplete を発火する。
  useEffect(() => {
    if (!visible || isCompleted) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(Date.now());
    });
    return () => sub.remove();
  }, [visible, isCompleted]);

  const remainingMs =
    endTimeMs != null
      ? Math.max(endTimeMs - now, 0)
      : pausedRemainingMs != null
      ? pausedRemainingMs
      : durationSeconds * 1000;
  const remainingSec = Math.ceil(remainingMs / 1000);

  // 完了検出 (remainingMs が 0 に到達した瞬間 1 回だけ発火)。
  // completedRef で再発火を防ぐ (= 親が visible=false にする前のレンダで再評価されても OK)。
  useEffect(() => {
    if (!visible) return;
    if (endTimeMs == null) return; // paused or idle
    if (remainingMs > 0) return;
    if (completedRef.current) return;
    completedRef.current = true;
    // 事前スケジュール済み通知は OS が発火している (or もう発火した) ので個別の
    // 即時通知は再発しない。 cancel もしない (= 既に発火済みの想定で OS に委ねる)。
    notifIdRef.current = null;
    Vibration.vibrate([100, 50, 100]);
    // Issue #116: Modal は閉じず完了表示に遷移。 onComplete は親側で達成記録 (force set true)
    // を行うが、 setTimerState(null) は呼ばれなくなった (= Modal は閉じない)。
    setIsCompleted(true);
    onComplete();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, endTimeMs, remainingMs]);

  const paused = pausedRemainingMs != null;

  const handleTogglePause = () => {
    if (endTimeMs != null) {
      // running → paused: 残り時間を保存、 scheduled 通知をキャンセル
      const remaining = Math.max(endTimeMs - Date.now(), 0);
      setPausedRemainingMs(remaining);
      setEndTimeMs(null);
      cancelNotification(notifIdRef.current);
      notifIdRef.current = null;
    } else if (pausedRemainingMs != null) {
      // paused → running: 新しい endTime を計算 + 通知を再スケジュール
      const start = Date.now();
      setEndTimeMs(start + pausedRemainingMs);
      setPausedRemainingMs(null);
      setNow(start);
      const seconds = Math.max(Math.ceil(pausedRemainingMs / 1000), 1);
      scheduleCompletionNotification(seconds, actionTitle).then((id) => {
        notifIdRef.current = id;
      });
    }
  };

  const handleCancel = () => {
    cancelNotification(notifIdRef.current);
    notifIdRef.current = null;
    onCancel();
  };

  // Issue #116: 規定時間到達前の早期完了。 scheduled 通知をキャンセル + 自然完了と同じ
  // 副作用 (= Vibration + isCompleted=true + onComplete) を発火。 completedRef ガードで
  // 自然完了 effect の再発火を防ぐ。
  const handleEarlyComplete = () => {
    if (completedRef.current) return;
    completedRef.current = true;
    cancelNotification(notifIdRef.current);
    notifIdRef.current = null;
    Vibration.vibrate([100, 50, 100]);
    setIsCompleted(true);
    onComplete();
  };

  const minutes = Math.floor(Math.max(remainingSec, 0) / 60);
  const seconds = Math.max(remainingSec, 0) % 60;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={handleCancel}
    >
      <View style={styles.root}>
        <View style={styles.body}>
          <Text style={styles.label}>{actionTitle}</Text>
          <Text style={styles.time} accessibilityLabel="残り時間">
            {String(minutes).padStart(2, '0')}:
            {String(seconds).padStart(2, '0')}
          </Text>
          <Text style={styles.hint}>
            {isCompleted ? '完了' : paused ? '一時停止中' : '実行中'}
          </Text>
        </View>
        {/* Issue #116: 完了表示中は「閉じる」のみ。 それ以外は「一時停止 / 完了 / キャンセル」。 */}
        {isCompleted ? (
          <View style={styles.actions}>
            <Pressable
              onPress={handleCancel}
              accessibilityRole="button"
              accessibilityLabel="タイマー画面を閉じる"
              style={styles.actionBtn}
            >
              <Text style={styles.actionText}>閉じる</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.actions}>
            <Pressable
              onPress={handleTogglePause}
              accessibilityRole="button"
              accessibilityLabel={paused ? 'タイマー再開' : 'タイマー一時停止'}
              style={[styles.actionBtn, styles.actionBtnCancel]}
            >
              <Text style={styles.actionTextCancel}>
                {paused ? '再開' : '一時停止'}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleEarlyComplete}
              accessibilityRole="button"
              accessibilityLabel="タイマー早期完了"
              style={styles.actionBtn}
            >
              <Text style={styles.actionText}>完了</Text>
            </Pressable>
            <Pressable
              onPress={handleCancel}
              accessibilityRole="button"
              accessibilityLabel="タイマーキャンセル"
              style={[styles.actionBtn, styles.actionBtnCancel]}
            >
              <Text style={styles.actionTextCancel}>キャンセル</Text>
            </Pressable>
          </View>
        )}
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
    gap: 12,
    paddingHorizontal: 24,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: COLOR_GROW,
    alignItems: 'center',
  },
  actionText: { color: COLOR_BG, fontSize: 15, fontWeight: '700' },
  actionBtnCancel: {
    backgroundColor: COLOR_LINE_BG,
  },
  actionTextCancel: { color: COLOR_FG_SOFT, fontSize: 15, fontWeight: '600' },
});
