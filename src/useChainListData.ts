import { useEffect, useState } from 'react';

import { getExpoSqliteClient } from './db.expo';
import type { Anchor, Chain } from './domain';
import { getAnchor, listChains, listNodes } from './repository';

export type ChainListItem = {
  chain: Chain;
  anchor: Anchor;
  nodeCount: number;
};

const loadChainList = async (): Promise<ChainListItem[]> => {
  const db = await getExpoSqliteClient();
  const chains = await listChains(db, 'active');
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

export const useChainListData = (): UseChainListDataResult => {
  const [items, setItems] = useState<ChainListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    loadChainList()
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
  }, []);

  return { items, error, loading };
};
