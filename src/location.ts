import * as Location from 'expo-location';

// expo-location の薄いラッパ。Phase 1.6 では前景位置取得のみ扱う。
// OS ジオフェンス (region monitoring) によるバックグラウンド発火検知は Phase 1.6b
// で EAS Dev Build 移行とセットで実装予定 (TODO.md §Phase 1.5b 参照)。
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
// 精度をもっと欲しいケースは Phase 1.6b で別 API を用意する判断とする。
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
