import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { getExpoSqliteClient } from './db.expo';
import { recentDateRange, todayIsoDate } from './domain';
import type { IsoDate } from './domain';
import { newMetricId } from './ids';
import { METRIC_KINDS } from './metricKinds';
import type { MetricKind } from './metricKinds';
import {
  deleteMetric,
  insertMetric,
  listMetricsInRange,
  listRecentMetrics,
} from './metricsRepository';
import type { Metric } from './metricsRepository';

// PR-Z3a (ADR-0024 §3c): メトリクス手入力 + 14D 系列の取得 hook。
// 全 METRIC_KINDS に対して、 最新値 + 14D 範囲記録をまとめて返す。

export type MetricSeries = {
  kind: MetricKind;
  latest: Metric | null;
  records14d: Metric[];
};

export type MetricsData = {
  today: IsoDate;
  windowDays: number;
  series: MetricSeries[];
};

const ANALYTICS_WINDOW_DAYS = 14;

const loadMetrics = async (): Promise<MetricsData> => {
  const db = await getExpoSqliteClient();
  const today = todayIsoDate(new Date());
  const window = recentDateRange(today, ANALYTICS_WINDOW_DAYS);
  const windowStart = window[0] ?? today;
  const series = await Promise.all(
    METRIC_KINDS.map(async (kind) => {
      const [latestList, range] = await Promise.all([
        listRecentMetrics(db, kind.key, 1),
        listMetricsInRange(
          db,
          kind.key,
          // 14D の開始日を 00:00:00 から見るために time 部を付与
          `${windowStart}T00:00:00`,
          `${today}T23:59:59`,
        ),
      ]);
      return {
        kind,
        latest: latestList[0] ?? null,
        records14d: range,
      };
    }),
  );
  return { today, windowDays: ANALYTICS_WINDOW_DAYS, series };
};

export type UseMetricsDataResult = {
  data: MetricsData | null;
  error: string | null;
  loading: boolean;
  addMetric: (metricKey: string, value: number) => Promise<void>;
  removeMetric: (metricId: string) => Promise<void>;
};

export const useMetricsData = (): UseMetricsDataResult => {
  const [data, setData] = useState<MetricsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      loadMetrics()
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
    }, [refreshTick]),
  );

  const addMetric = useCallback(async (metricKey: string, value: number) => {
    try {
      const db = await getExpoSqliteClient();
      await insertMetric(db, {
        id: newMetricId(),
        metricKey,
        value,
        // recorded_at は UTC ISO-like 文字列 (秒精度、 末尾 Z を剥がしただけ)。
        // ローカル時刻ではない点に注意 (Phase 1 N=1 で同 TZ 単機運用なので実害なし)。
        // PR-Z3b で Notion 連携を実装するとき、 Notion 側も UTC 想定なら整合する。
        // ローカル時刻に厳密に揃えたくなったら年/月/日/時/分/秒を個別取得して組む。
        recordedAt: new Date().toISOString().replace('Z', '').slice(0, 19),
        source: 'manual',
      });
      setRefreshTick((t) => t + 1);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const removeMetric = useCallback(async (metricId: string) => {
    try {
      const db = await getExpoSqliteClient();
      await deleteMetric(db, metricId);
      setRefreshTick((t) => t + 1);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  return { data, error, loading, addMetric, removeMetric };
};
