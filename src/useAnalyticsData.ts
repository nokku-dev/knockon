import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import {
  chainAchievementStats,
  dailyChainAchievementSeries,
} from './analyticsDerivation';
import type { ChainStats, DailyChainPoint } from './analyticsDerivation';
import { getExpoSqliteClient } from './db.expo';
import {
  effectiveTodayIsoDate,
  recentDateRange,
  sortChainsForDisplay,
} from './domain';
import type { Action, Anchor, Chain, IsoDate } from './domain';
import {
  getAction,
  getAnchor,
  listAchievementsForNodes,
  listChains,
  listNodes,
} from './repository';
import { getAppSettings } from './settingsRepository';

// PR-Z2 (ADR-0024 §3b): 達成率ダッシュボード用のデータ集約。
// active な全チェーンの 14D 達成率 + 日別系列 + ノード数 をまとめて返す。

export type AnalyticsWindowDays = 14;
const ANALYTICS_WINDOW_DAYS: AnalyticsWindowDays = 14;

export type AnalyticsChainData = {
  chain: Chain;
  anchor: Anchor;
  nodeCount: number;
  stats: ChainStats;
  series: DailyChainPoint[];
};

export type AnalyticsData = {
  today: IsoDate;
  windowDays: AnalyticsWindowDays;
  chains: AnalyticsChainData[];
};

const loadAnalytics = async (): Promise<AnalyticsData> => {
  const db = await getExpoSqliteClient();
  const settings = await getAppSettings(db);
  const today = effectiveTodayIsoDate(new Date(), settings.resetTime);
  const window = recentDateRange(today, ANALYTICS_WINDOW_DAYS);
  const windowStart = window[0] ?? today;

  // active なチェーンだけ集計 (stocked は別軸の意思決定で休止中のため分析から除外)。
  const chains = await listChains(db, 'active');

  // K-010 同型の受容判断: chain 間は Promise.all で並列だが、 chain 内は逐次 (anchor →
   // nodes → 各 action → achievements)。 Phase 1 N=1 規模で集計 ~10ms / 体感問題なし。
   // 多人数 / 多チェーン (PR-Z3+ 出荷後レイヤー) で遅延が出たら chain 内も並列化 + action
   // を全チェーン横断キャッシュにする判断トリガー。
  const results = await Promise.all(
    chains.map(async (chain) => {
      const anchor = await getAnchor(db, chain.anchorId);
      if (!anchor) return null;
      const nodes = await listNodes(db, chain.id);
      // action を 1 回ずつだけ fetch (1 chain 内で重複しないので Map 経由)。
      const actionMap = new Map<string, Action>();
      for (const node of nodes) {
        if (actionMap.has(node.actionId)) continue;
        const action = await getAction(db, node.actionId);
        if (action) actionMap.set(node.actionId, action);
      }
      const records = await listAchievementsForNodes(
        db,
        nodes.map((n) => n.id),
        windowStart,
        today,
      );
      const stats = chainAchievementStats(
        records,
        nodes,
        actionMap,
        today,
        ANALYTICS_WINDOW_DAYS,
      );
      const series = dailyChainAchievementSeries(
        records,
        nodes,
        actionMap,
        today,
        ANALYTICS_WINDOW_DAYS,
      );
      return {
        chain,
        anchor,
        nodeCount: nodes.length,
        stats,
        series,
      } as AnalyticsChainData;
    }),
  );
  const valid = results.filter((x): x is AnalyticsChainData => x !== null);
  return {
    today,
    windowDays: ANALYTICS_WINDOW_DAYS,
    chains: sortChainsForDisplay(valid),
  };
};

export type UseAnalyticsDataResult = {
  data: AnalyticsData | null;
  error: string | null;
  loading: boolean;
};

export const useAnalyticsData = (): UseAnalyticsDataResult => {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      loadAnalytics()
        .then((d) => {
          if (!cancelled) {
            setData(d);
            setError(null);
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
    }, []),
  );

  return { data, error, loading };
};
