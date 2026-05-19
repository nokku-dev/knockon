import { useCallback, useEffect, useState } from 'react';

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
  saveTimeAnchor: (time: string) => Promise<void>;
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

  useEffect(() => {
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
    };
  }, [chainId]);

  const saveTimeAnchor = useCallback(
    async (time: string) => {
      if (!data) return;
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
        setData({ ...data, anchor: nextAnchor });
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setSaving(false);
      }
    },
    [data],
  );

  return { data, error, loading, saving, saveTimeAnchor };
};
