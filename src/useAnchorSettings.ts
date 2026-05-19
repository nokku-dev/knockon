import { useCallback, useEffect, useRef, useState } from 'react';

import { getExpoSqliteClient } from './db.expo';
import type { Anchor, Chain } from './domain';
import { getAnchor, listChains, updateAnchor } from './repository';

// PR-1.5 のスコープ:
// - 時刻アンカーの DB 保存
// - Today 側で発火状態を派生計算 (TodayScreen の発火中ピル)
//
// 後送り (Phase 1.5b):
// - expo-notifications によるローカル通知スケジュール
// - 通知許可フロー
// Expo Go (SDK 53+) で expo-notifications が制限されているため、EAS Dev Build
// 移行とセットで別 PR にする (K-008 で予測した通り)。

export type AnchorSettingsData = {
  chain: Chain;
  anchor: Anchor;
};

export type UseAnchorSettingsResult = {
  data: AnchorSettingsData | null;
  error: string | null;
  loading: boolean;
  saving: boolean;
  // 成功なら true / 失敗なら false。呼び出し側はこれを見て router.back() を出し分け
  // (失敗時にモーダルを閉じると沈黙の失敗になるため)。
  saveTimeAnchor: (time: string) => Promise<boolean>;
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
        if (!cancelled) setData({ chain, anchor });
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

  // 成功なら true / 失敗なら false を返す。呼び出し側 (AnchorRoute) は
  // 成功時のみ router.back() でモーダルを閉じる方針 (失敗時に閉じると
  // 沈黙の失敗になるため)。unmount 後の setState は mountedRef でガード。
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
          latitude: null,
          longitude: null,
          radiusMeters: null,
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

  return { data, error, loading, saving, saveTimeAnchor };
};
