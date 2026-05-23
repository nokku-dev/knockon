import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { getExpoSqliteClient } from './db.expo';
import type { Anchor, Chain, ChainStatus } from './domain';
import { getAnchor, listChains, listNodes } from './repository';

export type ChainListItem = {
  chain: Chain;
  anchor: Anchor;
  nodeCount: number;
};

const loadChainList = async (
  status: ChainStatus,
): Promise<ChainListItem[]> => {
  const db = await getExpoSqliteClient();
  const chains = await listChains(db, status);
  const items = await Promise.all(
    chains.map(async (chain) => {
      const anchor = await getAnchor(db, chain.anchorId);
      if (!anchor) return null;
      const nodes = await listNodes(db, chain.id);
      return { chain, anchor, nodeCount: nodes.length };
    }),
  );
  return items.filter((x): x is ChainListItem => x !== null);
};

export type UseChainListDataResult = {
  items: ChainListItem[];
  error: string | null;
  loading: boolean;
};

// Phase 2 前倒し-2: status フィルタ ('active' | 'stocked') を受け取って
// その status のチェーンだけリスト化。 切替で再 fetch する。
export const useChainListData = (
  status: ChainStatus,
): UseChainListDataResult => {
  const [items, setItems] = useState<ChainListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // タブが focus されるたびに再読み込み (アンカー編集モーダル後に戻ったとき
  // 時刻表示などを最新化するため)。 status 変化でも再 fetch。
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      loadChainList(status)
        .then((list) => {
          if (!cancelled) setItems(list);
        })
        .catch((e: unknown) => {
          if (!cancelled) {
            setError(e instanceof Error ? e.message : String(e));
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [status]),
  );

  return { items, error, loading };
};
