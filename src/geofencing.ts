import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import type { DbClient } from './db';
import { getExpoSqliteClient } from './db.expo';
import { effectiveTodayIsoDate, isAnchorFiringToday } from './domain';
import { planGeofences, type GeofenceSource } from './geofenceRegions';
import { getBackgroundLocationPermissionStatus } from './location';
import { presentPlaceArrivalNotification } from './notifications';
import {
  getAnchor,
  listAnchorFiringsForDate,
  listChains,
  recordAnchorFiring,
} from './repository';
import { getAppSettings } from './settingsRepository';

// #301 (Phase 1.6b): OS ジオフェンス (region monitoring) の登録と到達ハンドリング。
//
// PLAN の PR-1.6 のうち未実装だった部分。これまでは Today にフォーカスしたときに
// `getCurrentPositionAsync` を 1 回呼ぶだけで、アプリを開かない限り場所発火が
// 起きなかった。
//
// 「何を登録すべきか」の決定は `geofenceRegions.ts` の純関数に分離してある (K-007)。
// 本ファイルは OS API と DB に触る側。
//
// ⚠ **iOS では `UIBackgroundModes` に `location` が無いと `startGeofencingAsync` が
// throw する。** Apple の region monitoring 自体は background mode を要求しないが、
// expo-location の実装 (`LocationModule.swift`) が
// `guard try taskManager.hasBackgroundModeEnabled("location")` で弾く。
// よって `app.json` の expo-location plugin で `isIosBackgroundLocationEnabled: true`
// が必須 (Android は `isAndroidBackgroundLocationEnabled` で ACCESS_BACKGROUND_LOCATION)。
// この対応は `src/appJsonLocationPlugin.test.ts` で固定している。

export const GEOFENCE_TASK_NAME = 'knockon-place-anchor-arrival';

// 到達時の処理。**この関数が正準の事実を書く唯一の場所**で、
// バックグラウンドのタスクからも前景の検出からも同じ経路を通す。
//
// ADR-0012: アンカー発火は「1 日 1 回の不可逆事実」。ジオフェンスは出入りを
// 繰り返すたびに Enter を投げてくるので、**記録済みなら何もしない**。
// これがないと 1 日に何度も通知が出る (半径の境界上にいると特に頻発する)。
export const handlePlaceArrival = async (
  db: DbClient,
  anchorId: string,
  now: Date,
): Promise<void> => {
  const settings = await getAppSettings(db);
  const today = effectiveTodayIsoDate(now, settings.resetTime);
  const firings = await listAnchorFiringsForDate(db, anchorId, today);
  if (isAnchorFiringToday(firings, anchorId, today)) return;

  const anchor = await getAnchor(db, anchorId);
  // アンカーが消えている (チェーン削除直後に OS からイベントが来た等) なら
  // 記録も通知もしない。次の sync で region 自体が外れる。
  if (!anchor) return;

  // ADR-0055: OS の region Enter = ジオフェンス経路。この経路だけが通知を出す。
  await recordAnchorFiring(db, { anchorId, date: today, source: 'geofence' });

  // このアンカーを起点にする active チェーンにだけ通知する。
  // stocked は planGeofences で登録対象外だが、登録後に stocked へ変わった場合に
  // 次の sync までの隙間があるため、ここでも active で絞る。
  const chains = (await listChains(db, 'active')).filter(
    (c) => c.anchorId === anchorId,
  );
  for (const chain of chains) {
    await presentPlaceArrivalNotification(chain, anchor);
  }
};

// バックグラウンドタスク本体。**module scope で定義する必要がある** —
// OS がアプリを起こしたときに JS のこの行が評価されていないとタスクが解決できない。
// そのため `app/_layout.tsx` が本ファイルを import している (副作用としての登録)。
TaskManager.defineTask<{
  eventType: Location.GeofencingEventType;
  region: Location.LocationRegion;
}>(GEOFENCE_TASK_NAME, async ({ data, error }) => {
  // error は権限剥奪 / OS 側の失敗。握り潰す (次の sync で復旧を試みる) が、
  // 「エラーだった」を「到達しなかった」として記録しない = 何も書かない。
  if (error) return;
  if (!data) return;
  if (data.eventType !== Location.GeofencingEventType.Enter) return;
  const anchorId = data.region.identifier;
  if (!anchorId) return;
  try {
    const db = await getExpoSqliteClient();
    await handlePlaceArrival(db, anchorId, new Date());
  } catch {
    // バックグラウンド実行中の例外でアプリを落とさない。記録も通知も起きないだけで、
    // 次に Today を開いたときの前景判定 (detectPlaceFiringByGps) が拾い直す。
  }
});

// 登録結果。⚠ void を返さない: 「登録できなかった」を「登録した」に潰さないため
// (ADR-0073)。呼び出し側は started を見て判断できる。
export type GeofenceSyncResult =
  | { started: true; regionCount: number; droppedForLimit: number }
  | {
      started: false;
      reason: 'no-regions' | 'permission-denied' | 'unavailable';
    };

const stopIfStarted = async (): Promise<void> => {
  if (await Location.hasStartedGeofencingAsync(GEOFENCE_TASK_NAME)) {
    await Location.stopGeofencingAsync(GEOFENCE_TASK_NAME);
  }
};

// active な全チェーンの場所アンカーを OS に登録し直す。
// `startGeofencingAsync` は同じタスク名で呼び直すと region 集合を**置き換える**ので、
// 差分計算は不要 (通知の syncAllNotifications と同じ「全体一致」方式)。
//
// 呼ぶ場所: 起動時 (app/_layout.tsx) と チェーン保存 / 削除後 (useChainEdit)。
export const syncGeofences = async (): Promise<GeofenceSyncResult> => {
  const db = await getExpoSqliteClient();
  const chains = await listChains(db, 'active');
  const items: GeofenceSource[] = [];
  for (const chain of chains) {
    const anchor = await getAnchor(db, chain.anchorId);
    if (anchor) items.push({ chain, anchor });
  }
  const plan = planGeofences(items);

  // 場所アンカーが 1 つも無ければ監視を止める (OS の電池消費を残さない)。
  if (plan.regions.length === 0) {
    await stopIfStarted();
    return { started: false, reason: 'no-regions' };
  }

  // ⚠ 権限要求はここでしない (ADR-0003 §決定 第 5 項: 再要求ループ / 許可誘導 UI の禁止)。
  // 要求は「場所アンカーを保存した」というユーザーの明示的な操作の直後に 1 度だけ行う
  // (useChainEdit.save)。ここは現在の状態を読むだけ。
  const permission = await getBackgroundLocationPermissionStatus();
  if (permission !== 'granted') {
    await stopIfStarted();
    // ADR-0003: Always 拒否時は「通知が出ないだけ」。Today 表示は不変で、
    // 前景の detectPlaceFiringByGps は動き続ける (= 手動フォールバック)。
    return { started: false, reason: 'permission-denied' };
  }

  try {
    await Location.startGeofencingAsync(GEOFENCE_TASK_NAME, plan.regions);
    return {
      started: true,
      regionCount: plan.regions.length,
      droppedForLimit: plan.droppedForLimit,
    };
  } catch {
    // 端末が region monitoring 非対応 / UIBackgroundModes 未設定 / 権限剥奪の途中など。
    // 落とさないが「登録できた」とも言わない。
    return { started: false, reason: 'unavailable' };
  }
};
