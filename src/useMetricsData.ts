import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { getExpoSqliteClient } from './db.expo';
import {
  effectiveTodayIsoDate,
  localIsoTimestamp,
  recentDateRange,
} from './domain';
import type { IsoDate } from './domain';
import { newMetricId, newMetricKindId } from './ids';
import { BUILTIN_METRIC_KINDS } from './metricKinds';
import {
  deleteMetricKind,
  insertMetricKind,
  listMetricKinds,
  updateMetricKind,
} from './metricKindsRepository';
import type { MetricKind } from './metricKindsRepository';
import {
  deleteMetric,
  insertMetric,
  listMetricsInRange,
  listRecentMetrics,
} from './metricsRepository';
import type { Metric } from './metricsRepository';
import { getAppSettings } from './settingsRepository';

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
  const settings = await getAppSettings(db);
  const today = effectiveTodayIsoDate(new Date(), settings.resetTime);
  const window = recentDateRange(today, ANALYTICS_WINDOW_DAYS);
  const windowStart = window[0] ?? today;
  // PR-CC (ADR-0026): DB の metric_kinds テーブルから動的取得 (= ユーザー編集反映)。
  const kinds = await listMetricKinds(db);
  const series = await Promise.all(
    kinds.map(async (kind) => {
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
  // PR-CC (ADR-0026): メトリクス種別 CRUD
  // #184: addKind 引数から key を削除。 key は呼び出し側で kind ID と同値で自動生成。
  addKind: (label: string, unit: string) => Promise<void>;
  updateKind: (id: string, patch: Partial<MetricKind>) => Promise<void>;
  removeKind: (kind: MetricKind) => Promise<void>;
};

export const useMetricsData = (): UseMetricsDataResult => {
  const [data, setData] = useState<MetricsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  // ADR-0050 追補: タブ再訪の読み込み表示を減らす。 初回のみスピナー、 2 回目以降は前回データを
  // 見せたまま背景更新 (stale-while-revalidate、 useAnalyticsData と同型)。
  const loadedOnceRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      if (!loadedOnceRef.current) setLoading(true);
      loadMetrics()
        .then((d) => {
          if (cancelled) return;
          setData(d);
          setError(null);
          setLoading(false);
          loadedOnceRef.current = true;
        })
        .catch((e: unknown) => {
          if (!cancelled) {
            setError(e instanceof Error ? e.message : String(e));
            setLoading(false);
          }
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
        // Issue #109: recorded_at はローカルの壁時計 (秒精度)。
        // 旧実装は toISOString() = UTC を保存しており、 JST の 00:00〜08:59 に
        // 記録すると metricTrend の日付キー (recordedAt.slice(0, 10)) が前日になって
        // いた。 loadMetrics の `today` は effectiveTodayIsoDate (ローカル) なので
        // 暦がズレていたのが原因。 localIsoTimestamp は日付部が todayIsoDate と
        // 一致することを保証する。
        recordedAt: localIsoTimestamp(new Date()),
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

  // PR-CC (ADR-0026): 種別 CRUD。 失敗時は K-024 同型 silently fallback + error set。
  // 成功で refreshTick を上げて loadMetrics を再走させる。
  // UNIQUE 違反 (key 重複) は SQLite 生 error.message が error state に乗る。
  // Phase 1 N=1 受容 (= UX 改善は Phase 2 で error code 化判断、 K-024 同型)。
  const addKind = useCallback(
    async (label: string, unit: string) => {
      try {
        const db = await getExpoSqliteClient();
        const existing = await listMetricKinds(db);
        const nextOrder =
          existing.length === 0
            ? 0
            : Math.max(...existing.map((k) => k.orderIndex)) + 1;
        // #184: key は kind ID と同値で自動生成。 ID は UUID なので UNIQUE 制約衝突なし。
        // ユーザー入力なしで一意性を担保しつつ、 metrics.metric_key 経由の参照整合も維持。
        const id = newMetricKindId();
        await insertMetricKind(db, {
          id,
          key: id,
          label,
          unit,
          orderIndex: nextOrder,
          isBuiltin: false,
        });
        setRefreshTick((t) => t + 1);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [],
  );

  const updateKind = useCallback(
    async (id: string, patch: Partial<MetricKind>) => {
      try {
        const db = await getExpoSqliteClient();
        const existing = await listMetricKinds(db);
        const target = existing.find((k) => k.id === id);
        if (!target) return;
        await updateMetricKind(db, { ...target, ...patch });
        setRefreshTick((t) => t + 1);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [],
  );

  const removeKind = useCallback(async (kind: MetricKind) => {
    try {
      const db = await getExpoSqliteClient();
      await deleteMetricKind(db, kind.id);
      setRefreshTick((t) => t + 1);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  return {
    data,
    error,
    loading,
    addMetric,
    removeMetric,
    addKind,
    updateKind,
    removeKind,
  };
};
