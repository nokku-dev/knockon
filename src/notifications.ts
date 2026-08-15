import * as Notifications from 'expo-notifications';

import { track } from './analytics';
import { PERMISSION_KIND } from './analyticsEvents';
import { Platform } from 'react-native';

import type { DbClient } from './db';
import { getExpoSqliteClient } from './db.expo';
import type { Action, Anchor, Chain, Node } from './domain';
import { effectiveTodayIsoDate } from './domain';
import { parseTimeString, shouldNotifyForChain } from './notificationHelpers';
import {
  computeNightSummary,
  formatNightSummaryBody,
  NIGHT_SUMMARY_HOUR,
  NIGHT_SUMMARY_MINUTE,
  NIGHT_SUMMARY_NOTIFICATION_ID,
  type NightSummaryChainSnapshot,
} from './nightSummary';
import {
  getAction,
  getAnchor,
  listAchievementsForNodes,
  listChains,
  listNodes,
} from './repository';
import { getAppSettings } from './settingsRepository';

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
  // ADR-0053: 実際にダイアログを出した回だけ送る (既に許可済みの早期 return は
  // 通っていない = 「要求の結果」だけが観測対象)。
  track('permission_result', {
    kind: PERMISSION_KIND.notification,
    granted: requested.granted,
  });
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

// #301 (Phase 1.6b): 場所アンカーの到達通知。OS ジオフェンスの Enter イベントから
// `geofencing.ts` が呼ぶ。時刻アンカーの daily 通知と違い **その場で 1 回出す**
// (trigger: null = 即時) ので、スケジュール一覧には残らない。
//
// 通知 ID は `place-{chainId}` (時刻アンカーの `chain-{id}` / 夜サマリの
// `night-summary` と衝突しない)。data.chainId は通知タップの deeplink 用で、
// 既存の extractChainIdFromResponse がそのまま拾う。
//
// ⚠ 権限が無ければ silently 出ない。ADR-0003 の劣化動作 (Today 表示は不変) と整合。
export const presentPlaceArrivalNotification = async (
  chain: Chain,
  anchor: Anchor,
): Promise<void> => {
  await Notifications.scheduleNotificationAsync({
    identifier: `place-${chain.id}`,
    content: {
      title: chain.title,
      // 煽らない / マイナスを指差さない (DESIGN-SYSTEM §0)。到着した事実だけを置く。
      body: `${anchor.title} に到着`,
      data: { chainId: chain.id, kind: 'place-arrival' },
      ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : {}),
    },
    trigger: null,
  });
};

// Issue #169 / ADR-0042: 夜の達成サマリ通知をスケジュール。
// DAILY trigger で 21:00 に発火し、 本文は「今日は N 個アクションを達成済み。
// M 個の達成チャンスがあります。」(4 象限分岐は formatNightSummaryBody 参照)。
//
// 受容判断 (Phase 1 N=1):
// - body は schedule 時点の達成数で固定される (DAILY trigger の content は同一)。
//   ユーザーが 21:00 までに状態を変えると body が古くなるが、 syncAllNotifications
//   は app 起動 + データ変更で都度呼ばれるため drift は限定的。 Phase 2 で N が増
//   えたら notification handler 内で再計算 + 即時 present への変更を判断する。
// - N=0 / M=0 のとき (= 今日 active な fire ノードが 1 件も無い、 もしくは 全達成済かつ
//   未達 0 件) は通知を出さない (formatNightSummaryBody が null を返す)。
// - 通知 ID は `'night-summary'` 固定 (per-chain `chain-{id}` と衝突しない)。
const buildNightSummarySnapshots = async (
  db: DbClient,
  today: string,
): Promise<NightSummaryChainSnapshot[]> => {
  const activeChains = await listChains(db, 'active');
  const snapshots: NightSummaryChainSnapshot[] = [];
  for (const chain of activeChains) {
    const nodes = await listNodes(db, chain.id);
    const items: { node: Node; action: Action }[] = [];
    for (const node of nodes) {
      const action = await getAction(db, node.actionId);
      if (action) items.push({ node, action });
    }
    const nodeIds = items.map((i) => i.node.id);
    const achievements = await listAchievementsForNodes(
      db,
      nodeIds,
      today,
      today,
    );
    const achievementsToday: Record<string, boolean> = {};
    for (const a of achievements) achievementsToday[a.nodeId] = a.achieved;
    snapshots.push({ nodes: items, achievementsToday });
  }
  return snapshots;
};

export const scheduleNightSummaryNotification = async (
  db: DbClient,
  now: Date,
): Promise<void> => {
  await Notifications.cancelScheduledNotificationAsync(
    NIGHT_SUMMARY_NOTIFICATION_ID,
  );
  const settings = await getAppSettings(db);
  const today = effectiveTodayIsoDate(now, settings.resetTime);
  const snapshots = await buildNightSummarySnapshots(db, today);
  const summary = computeNightSummary(snapshots, today);
  const body = formatNightSummaryBody(
    summary.achievedCount,
    summary.remainingCount,
  );
  if (!body) return;
  const granted = await requestNotificationPermission();
  if (!granted) return;
  await Notifications.scheduleNotificationAsync({
    identifier: NIGHT_SUMMARY_NOTIFICATION_ID,
    content: {
      title: 'knockon',
      body,
      data: { kind: 'night-summary' },
      ...(Platform.OS === 'android'
        ? { channelId: ANDROID_CHANNEL_ID }
        : {}),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: NIGHT_SUMMARY_HOUR,
      minute: NIGHT_SUMMARY_MINUTE,
    },
  });
};

// 全 active チェーンを fetch して通知を再スケジュール。
// app/_layout.tsx の起動時に呼ぶ safety net。 個別 schedule とは別に「全体一致」
// を担保する。 stocked チェーンや時刻アンカーなしのチェーンは shouldNotifyForChain
// で除外され、 通知は出ない。
// Issue #169: 夜の達成サマリ通知も同じ sync で再スケジュール (body は schedule
// 時点の達成数で派生)。
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
  await scheduleNightSummaryNotification(db, new Date());
};
