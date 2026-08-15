import * as Location from 'expo-location';

import { track } from './analytics';
import { PERMISSION_KIND } from './analyticsEvents';

// expo-location の薄いラッパ。前景の現在地取得と、OS ジオフェンス用の
// バックグラウンド権限を扱う。region monitoring の登録そのものは `geofencing.ts`。
//
// ADR-0003 §「Always 拒否時は手動発火にフォールバック」: 位置情報の権限が
// 拒否されても、アプリは劣化動作で機能する (Today からの手動チェック / 発火中ピル
// 非表示)。本モジュールはエラー時に呼び出し側が握り潰せるよう例外を投げる方針
// (silent fallback は呼び出し側の責務)。

export type LocationPermissionStatus = 'granted' | 'denied' | 'undetermined';

const toStatus = (raw: string): LocationPermissionStatus => {
  if (raw === 'granted') return 'granted';
  if (raw === 'denied') return 'denied';
  return 'undetermined';
};

export const getLocationPermissionStatus =
  async (): Promise<LocationPermissionStatus> => {
    const { status } = await Location.getForegroundPermissionsAsync();
    return toStatus(status);
  };

export const requestLocationPermission =
  async (): Promise<LocationPermissionStatus> => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    const result = toStatus(status);
    // ADR-0053: 権限拒否がコア体験の利用率に効いているかを見る。
    // ADR-0003 の「拒否されても手動運用で成立する」設計が実際に機能しているかの検証。
    track('permission_result', {
      kind: PERMISSION_KIND.location,
      granted: result === 'granted',
    });
    return result;
  };

// #301 (Phase 1.6b): OS ジオフェンス (region monitoring) には「常時」権限が要る。
// 前景権限とは別のダイアログ・別のステータスなので、専用の関数を分けている。
export const getBackgroundLocationPermissionStatus =
  async (): Promise<LocationPermissionStatus> => {
    const { status } = await Location.getBackgroundPermissionsAsync();
    return toStatus(status);
  };

// ⚠ ADR-0003 §決定 第 5 項: **Always の再要求ループ・許可誘導 UI は禁止**。
// 呼び出し側は status === 'undetermined' のときだけ 1 度呼ぶこと。拒否されたら
// そのまま劣化動作 (通知が出ないだけ / Today 表示は不変) に落とす。
//
// ⚠ expo-location の既知の挙動: 前景権限で「今回のみ許可 (Allow Once)」を選んだ
// セッション中に本関数を呼ぶと、**ダイアログを出さずに silently denied を返す**。
// 「拒否された」と「聞けなかった」を区別できないので、結果を恒久的な拒否として
// 保存しない (毎回 status を読み直す)。
export const requestBackgroundLocationPermission =
  async (): Promise<LocationPermissionStatus> => {
    const { status } = await Location.requestBackgroundPermissionsAsync();
    return toStatus(status);
  };

export type CurrentPosition = {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
};

// 精度は Low (~5km まで許容、実際は数十〜数百 m が出ることが多い) で速度優先。
// ジオフェンス用途では半径 50-200m を扱うので Balanced (~10m 精度) でも過剰。
// AnchorSettingsScreen の「現在地を取得」と Today の発火判定で共通利用。
// 精度をもっと欲しいケースが出たら別 API を用意する判断とする (現時点で要件なし)。
export const getCurrentPosition = async (): Promise<CurrentPosition> => {
  const pos = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Low,
  });
  return {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    accuracyMeters: pos.coords.accuracy,
  };
};
