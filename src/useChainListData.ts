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

type LoadResult = {
  items: ChainListItem[];
  activeCount: number;
  stockedCount: number;
};

const loadChainList = async (status: ChainStatus): Promise<LoadResult> => {
  const db = await getExpoSqliteClient();
  // 両タブの count 表示用に全件取得し、 active/stocked それぞれカウント。
  // Phase 2 N=1 規模 (チェーン数十件程度) では性能問題なし。
  const allChains = await listChains(db);
  const activeCount = allChains.filter((c) => c.status === 'active').length;
  const stockedCount = allChains.filter((c) => c.status === 'stocked').length;
  const filtered = allChains.filter((c) => c.status === status);
  const items = await Promise.all(
    filtered.map(async (chain) => {
      const anchor = await getAnchor(db, chain.anchorId);
      if (!anchor) return null;
      const nodes = await listNodes(db, chain.id);
      return { chain, anchor, nodeCount: nodes.length };
    }),
  );
  return {
    items: items.filter((x): x is ChainListItem => x !== null),
    activeCount,
    stockedCount,
  };
};

export type UseChainListDataResult = {
  items: ChainListItem[];
  activeCount: number;
  stockedCount: number;
  error: string | null;
  loading: boolean;
};

// Phase 2 前倒し-2: status フィルタ ('active' | 'stocked') を受け取って
// その status のチェーンだけリスト化。 切替で再 fetch する。
export const useChainListData = (
  status: ChainStatus,
): UseChainListDataResult => {
  const [items, setItems] = useState<ChainListItem[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [stockedCount, setStockedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // タブが focus されるたびに再読み込み (アンカー編集モーダル後に戻ったとき
  // 時刻表示などを最新化するため)。 status 変化でも再 fetch。
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      loadChainList(status)
        .then((result) => {
          if (!cancelled) {
            setItems(result.items);
            setActiveCount(result.activeCount);
            setStockedCount(result.stockedCount);
          }
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

  return { items, activeCount, stockedCount, error, loading };
};
