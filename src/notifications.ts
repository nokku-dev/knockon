import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { getExpoSqliteClient } from './db.expo';
import type { Anchor, Chain } from './domain';
import { parseTimeString, shouldNotifyForChain } from './notificationHelpers';
import { getAnchor, listChains } from './repository';

export { parseTimeString, shouldNotifyForChain };

// 時刻アンカー + status='active' のチェーンに対し、 毎日 anchor.time の時刻に
// ローカル通知を出す。 variant の曜日違いは Today 側で表示する (= 通知は daily
// 1 つ、 variant=null の曜日は Today を開いたときに skip 表示が出る形)。
//
// 設計判断 (PR-1.5b-2 / ADR-0019):
// - weekday-specific スケジュールではなく Daily 1 つで十分
// - status='stocked' チェーンは通知出さない
// - 時刻アンカーなし (kind='behavior' / 'place') は通知出さない
// - 通知 ID = `chain-{chainId}` 形式で chain 単位 1 つだけ管理
// - 通知の cancel/再スケジュールはチェーン保存・削除・ステータス変更時に呼ぶ +
//   起動時 syncAllForActiveChains で safety net

// 各 chain ごとに 1 つの通知 ID を使う規約。
const notificationIdForChain = (chainId: string): string => `chain-${chainId}`;

// Android 用のチャンネル ID。 通知の音/振動/重要度を管理する単位。
const ANDROID_CHANNEL_ID = 'chains';

// 通知許可をリクエスト (まだ未決定なら聞く、 すでに decided なら現状を返す)。
// Android で必要に応じてチャンネルを作成。
// 返り値: 許可されているかどうか (true なら schedule 可)。
export const requestNotificationPermission = async (): Promise<boolean> => {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: 'チェーン通知',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  // NotificationPermissionsStatus は PermissionResponse 派生で granted: boolean を
  // 持つが、 tsc が型解決に失敗するため局所的に as キャストで突破。 expo-notifications
  // の types バージョン依存の問題で、 ランタイム挙動には影響なし。
  type PermShape = { granted: boolean };
  const existing = (await Notifications.getPermissionsAsync()) as unknown as PermShape;
  if (existing.granted) return true;
  // 拒否 (denied) + ユーザーが「もう聞かないで」を選んだ場合は requestPermissionsAsync
  // が即時 denied を返す挙動。 ADR-0003 の手動発火フォールバックで補う。
  const requested = (await Notifications.requestPermissionsAsync()) as unknown as PermShape;
  return requested.granted;
};

// 単一チェーン分の通知 (もしあれば) を cancel。
// 通知が存在しない場合でもエラーにならない (Expo SDK の仕様)。
export const cancelNotificationForChain = async (
  chainId: string,
): Promise<void> => {
  await Notifications.cancelScheduledNotificationAsync(
    notificationIdForChain(chainId),
  );
};

// 単一チェーン分の通知をスケジュール (条件を満たす場合のみ)。
// 既存の通知があれば事前に cancel して上書き。
// 権限なしならスケジュールせず silently 戻る (拒否時は手動発火フォールバック、 ADR-0003)。
export const scheduleNotificationForChain = async (
  chain: Chain,
  anchor: Anchor,
): Promise<void> => {
  await cancelNotificationForChain(chain.id);
  if (!shouldNotifyForChain(chain, anchor)) return;
  const parsed = parseTimeString(anchor.time!);
  if (!parsed) return;
  const granted = await requestNotificationPermission();
  if (!granted) return;
  await Notifications.scheduleNotificationAsync({
    identifier: notificationIdForChain(chain.id),
    content: {
      title: chain.title,
      body: `${anchor.time} 開始`,
      data: { chainId: chain.id },
      ...(Platform.OS === 'android'
        ? { channelId: ANDROID_CHANNEL_ID }
        : {}),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: parsed.hour,
      minute: parsed.minute,
    },
  });
};

// 全 active チェーンを fetch して通知を再スケジュール。
// app/_layout.tsx の起動時に呼ぶ safety net。 個別 schedule とは別に「全体一致」
// を担保する。 stocked チェーンや時刻アンカーなしのチェーンは shouldNotifyForChain
// で除外され、 通知は出ない。
export const syncAllNotifications = async (): Promise<void> => {
  const db = await getExpoSqliteClient();
  // 既存スケジュールを一旦全クリアしてから active チェーンだけ再登録 (drift 解消)。
  await Notifications.cancelAllScheduledNotificationsAsync();
  const activeChains = await listChains(db, 'active');
  for (const chain of activeChains) {
    const anchor = await getAnchor(db, chain.anchorId);
    if (!anchor) continue;
    await scheduleNotificationForChain(chain, anchor);
  }
};
