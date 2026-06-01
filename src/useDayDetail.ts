import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { dayNodeStatuses, metricsOnDate } from './analyticsDerivation';
import type { DayMetricEntry, DayNodeStatus } from './analyticsDerivation';
import { getExpoSqliteClient } from './db.expo';
import {
  effectiveTodayIsoDate,
  isAnchorFiringToday,
  recentDateRange,
} from './domain';
import type { Action, IsoDate } from './domain';
import { listAllMetricsInRange } from './metricsRepository';
import { listMetricKinds } from './metricKindsRepository';
import {
  getAction,
  getAnchor,
  listAchievementsForNodes,
  listAnchorFiringsForDate,
  listChains,
  listNodes,
} from './repository';
import { getAppSettings } from './settingsRepository';

// #63: 分析タブの「日々の詳細」。選んだ 1 日について、各 active チェーンのノード達成
// スナップショット (達成/未達/休む日 + アンカー発火) + その日のメトリクスを組み立てる。
// 集計 (達成率) は useAnalyticsData の責務。本 hook は「1 日の事実」を表示時派生で返す。
// 派生は analyticsDerivation の純粋関数 (テスト済み) に委譲し、hook は DB 配線のみ。

const DAY_DETAIL_WINDOW_DAYS = 14; // 選べる範囲 (SPEC: v1 は 14D 単一ウィンドウ)。

export type DayChainDetail = {
  chainId: string;
  chainTitle: string;
  anchorTitle: string;
  anchorFired: boolean;
  nodes: DayNodeStatus[];
};

export type DayDetail = {
  date: IsoDate;
  chains: DayChainDetail[];
  metrics: DayMetricEntry[];
};

const loadDayDetail = async (date: IsoDate): Promise<DayDetail> => {
  const db = await getExpoSqliteClient();
  const chains = await listChains(db, 'active');
  const kinds = await listMetricKinds(db);
  const metrics = await listAllMetricsInRange(
    db,
    `${date}T00:00:00`,
    `${date}T23:59:59`,
  );

  const results = await Promise.all(
    chains.map(async (chain): Promise<DayChainDetail | null> => {
      const anchor = await getAnchor(db, chain.anchorId);
      if (!anchor) return null;
      const nodes = await listNodes(db, chain.id);
      const actionsById: Record<string, Action> = {};
      for (const node of nodes) {
        if (actionsById[node.actionId]) continue;
        const action = await getAction(db, node.actionId);
        if (action) actionsById[node.actionId] = action;
      }
      const achievements = await listAchievementsForNodes(
        db,
        nodes.map((n) => n.id),
        date,
        date,
      );
      const firings = await listAnchorFiringsForDate(db, anchor.id, date);
      return {
        chainId: chain.id,
        chainTitle: chain.title,
        anchorTitle: anchor.title,
        anchorFired: isAnchorFiringToday(firings, anchor.id, date),
        nodes: dayNodeStatuses(date, nodes, actionsById, achievements),
      };
    }),
  );
  // listChains(active) の自然順を維持 (集計タブと厳密に同順でなくても日別詳細では十分)。
  const valid = results.filter((x): x is DayChainDetail => x !== null);
  return {
    date,
    chains: valid,
    metrics: metricsOnDate(metrics, kinds, date),
  };
};

export type UseDayDetailResult = {
  today: IsoDate | null;
  dates: IsoDate[]; // 選べる日 (昇順 14D)
  selectedDate: IsoDate | null;
  detail: DayDetail | null;
  loading: boolean;
  error: string | null;
  selectDate: (date: IsoDate) => void;
};

export const useDayDetail = (): UseDayDetailResult => {
  const [today, setToday] = useState<IsoDate | null>(null);
  const [dates, setDates] = useState<IsoDate[]>([]);
  const [selectedDate, setSelectedDate] = useState<IsoDate | null>(null);
  const [detail, setDetail] = useState<DayDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // フォーカスのたびに「今日」を再計算し、未選択なら今日を選ぶ + 詳細をロード。
  // 既に選択済みなら、その日の詳細を取り直す (達成タップ後の反映)。
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      (async () => {
        try {
          const db = await getExpoSqliteClient();
          const settings = await getAppSettings(db);
          const t = effectiveTodayIsoDate(new Date(), settings.resetTime);
          const window = recentDateRange(t, DAY_DETAIL_WINDOW_DAYS);
          const target = selectedDate ?? t;
          const d = await loadDayDetail(target);
          if (cancelled) return;
          setToday(t);
          setDates(window);
          setSelectedDate(target);
          setDetail(d);
          setError(null);
        } catch (e: unknown) {
          if (!cancelled) setError(e instanceof Error ? e.message : String(e));
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [selectedDate]),
  );

  const selectDate = useCallback((date: IsoDate) => {
    setSelectedDate(date);
  }, []);

  return { today, dates, selectedDate, detail, loading, error, selectDate };
};
