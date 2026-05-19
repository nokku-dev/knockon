import { useCallback, useEffect, useRef, useState } from 'react';

import { getExpoSqliteClient } from './db.expo';
import type { Anchor, Chain } from './domain';
import {
  getCurrentPosition,
  getLocationPermissionStatus,
  requestLocationPermission,
} from './location';
import type { CurrentPosition, LocationPermissionStatus } from './location';
import { getAnchor, listChains, updateAnchor } from './repository';

// Phase 1.5/1.6 のスコープ:
// - 時刻 / 場所アンカーの DB 保存
// - Today 側で発火状態を派生計算 (TodayScreen の発火中ピル)
//
// 後送り (Phase 1.5b / 1.6b):
// - expo-notifications によるローカル通知スケジュール (時刻)
// - OS ジオフェンス region monitoring によるバックグラウンド発火検知 (場所)
// - 通知 / 位置情報の Always 権限フロー
// Expo Go (SDK 53+) で expo-notifications / Always 位置情報が制限されているため、
// EAS Dev Build 移行とセットで別 PR にする (K-008 で予測済み)。

export type AnchorSettingsData = {
  chain: Chain;
  anchor: Anchor;
};

export type PlaceAnchorSavePayload = {
  latitude: number;
  longitude: number;
  radiusMeters: number;
};

export type UseAnchorSettingsResult = {
  data: AnchorSettingsData | null;
  error: string | null;
  loading: boolean;
  saving: boolean;
  // 成功なら true / 失敗なら false。呼び出し側はこれを見て router.back() を出し分け
  // (失敗時にモーダルを閉じると沈黙の失敗になるため)。
  saveTimeAnchor: (time: string) => Promise<boolean>;
  savePlaceAnchor: (payload: PlaceAnchorSavePayload) => Promise<boolean>;
  // 現在地取得 + 位置情報権限管理。場所アンカー設定の "現在地を取得" 用。
  locationPermission: LocationPermissionStatus;
  fetchCurrentLocation: () => Promise<CurrentPosition | null>;
  locating: boolean;
};

const findChain = async (chainId: string): Promise<Chain | null> => {
  const db = await getExpoSqliteClient();
  const chains = await listChains(db);
  return chains.find((c) => c.id === chainId) ?? null;
};

export const useAnchorSettings = (
  chainId: string,
): UseAnchorSettingsResult => {
  const [data, setData] = useState<AnchorSettingsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locationPermission, setLocationPermission] =
    useState<LocationPermissionStatus>('undetermined');
  const [locating, setLocating] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const chain = await findChain(chainId);
        if (!chain) {
          if (!cancelled) setError('チェーンが見つかりません');
          return;
        }
        const db = await getExpoSqliteClient();
        const anchor = await getAnchor(db, chain.anchorId);
        if (!anchor) {
          if (!cancelled) setError('起点アンカーが見つかりません');
          return;
        }
        const permission = await getLocationPermissionStatus();
        if (!cancelled) {
          setData({ chain, anchor });
          setLocationPermission(permission);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      mountedRef.current = false;
    };
  }, [chainId]);

  // 現在地取得。未許可なら request する。拒否されたら null を返し permission
  // 状態だけ更新 (ADR-0003 §「Always 拒否時は手動発火にフォールバック」)。
  const fetchCurrentLocation = useCallback(
    async (): Promise<CurrentPosition | null> => {
      setLocating(true);
      try {
        let permission = locationPermission;
        if (permission !== 'granted') {
          permission = await requestLocationPermission();
          if (mountedRef.current) setLocationPermission(permission);
        }
        if (permission !== 'granted') return null;
        return await getCurrentPosition();
      } catch (e: unknown) {
        if (mountedRef.current) {
          setError(e instanceof Error ? e.message : String(e));
        }
        return null;
      } finally {
        if (mountedRef.current) setLocating(false);
      }
    },
    [locationPermission],
  );

  // 他 kind の値 (lat/lng/radius) は上書きせずに残す。kind 切替時に
  // 前回値を保持するためのメモリとして機能。判定側 (isTimeAnchorFiringNow 等)
  // は kind を先にチェックするので、他 kind のフィールドが値持ちでも誤動作しない。
  const saveTimeAnchor = useCallback(
    async (time: string): Promise<boolean> => {
      if (!data) return false;
      setSaving(true);
      try {
        const db = await getExpoSqliteClient();
        const nextAnchor: Anchor = {
          ...data.anchor,
          kind: 'time',
          time,
        };
        await updateAnchor(db, nextAnchor);
        if (mountedRef.current) setData({ ...data, anchor: nextAnchor });
        return true;
      } catch (e: unknown) {
        if (mountedRef.current) {
          setError(e instanceof Error ? e.message : String(e));
        }
        return false;
      } finally {
        if (mountedRef.current) setSaving(false);
      }
    },
    [data],
  );

  const savePlaceAnchor = useCallback(
    async (payload: PlaceAnchorSavePayload): Promise<boolean> => {
      if (!data) return false;
      setSaving(true);
      try {
        const db = await getExpoSqliteClient();
        const nextAnchor: Anchor = {
          ...data.anchor,
          kind: 'place',
          latitude: payload.latitude,
          longitude: payload.longitude,
          radiusMeters: payload.radiusMeters,
        };
        await updateAnchor(db, nextAnchor);
        if (mountedRef.current) setData({ ...data, anchor: nextAnchor });
        return true;
      } catch (e: unknown) {
        if (mountedRef.current) {
          setError(e instanceof Error ? e.message : String(e));
        }
        return false;
      } finally {
        if (mountedRef.current) setSaving(false);
      }
    },
    [data],
  );

  return {
    data,
    error,
    loading,
    saving,
    saveTimeAnchor,
    savePlaceAnchor,
    locationPermission,
    fetchCurrentLocation,
    locating,
  };
};
