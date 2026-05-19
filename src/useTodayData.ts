import { useCallback, useEffect, useState } from 'react';

import { getExpoSqliteClient } from './db.expo';
import {
  toAchievementMap,
  todayIsoDate,
  toggleAchievementInMap,
} from './domain';
import type { AchievementMap, Anchor, Chain } from './domain';
import {
  getAction,
  getAnchor,
  listAchievementsForNodes,
  listChains,
  listNodes,
  recordAchievement,
} from './repository';
import type { TodayNode } from './TodayScreen';

export type TodayData = {
  chain: Chain;
  anchor: Anchor;
  nodes: TodayNode[];
  achievements: AchievementMap;
  today: string;
};

const loadToday = async (): Promise<TodayData | null> => {
  const db = await getExpoSqliteClient();

  const chains = await listChains(db, 'active');
  const chain = chains[0];
  if (!chain) return null;

  const anchor = await getAnchor(db, chain.anchorId);
  if (!anchor) return null;

  const nodes = await listNodes(db, chain.id);
  const withActions = await Promise.all(
    nodes.map(async (node) => {
      const action = await getAction(db, node.actionId);
      return action ? { node, action } : null;
    }),
  );
  const validNodes = withActions.filter((x): x is TodayNode => x !== null);
  const today = todayIsoDate(new Date());
  const records = await listAchievementsForNodes(
    db,
    validNodes.map((n) => n.node.id),
    today,
    today,
  );

  return {
    chain,
    anchor,
    nodes: validNodes,
    achievements: toAchievementMap(records, today),
    today,
  };
};

export type UseTodayDataResult = {
  data: TodayData | null;
  error: string | null;
  loading: boolean;
  handleToggle: (nodeId: string) => Promise<void>;
};

export const useTodayData = (): UseTodayDataResult => {
  const [data, setData] = useState<TodayData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    loadToday()
      .then((d) => {
        if (!cancelled) setData(d);
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

  // 楽観更新: タップで UI を即時反転 → 非同期で永続化。
  // Phase 1.2 では DB エラー時の rollback を入れない (SQLite ローカル同期書込で
  // ほぼ失敗しない前提)。実使用で乖離が観測されたら rollback or リトライを判断 (K-010)。
  const handleToggle = useCallback(
    async (nodeId: string) => {
      if (!data) return;
      const nextAchievements = toggleAchievementInMap(
        data.achievements,
        nodeId,
      );
      setData({ ...data, achievements: nextAchievements });
      try {
        const db = await getExpoSqliteClient();
        await recordAchievement(db, {
          nodeId,
          date: data.today,
          achieved: nextAchievements[nodeId] ?? false,
        });
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [data],
  );

  return { data, error, loading, handleToggle };
};
