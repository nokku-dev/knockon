import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { getExpoSqliteClient } from './db.expo';
import { recentDateRange, todayIsoDate } from './domain';
import type { IsoDate } from './domain';
import { newMetricId } from './ids';
import {
  deleteMetricKind,
  insertMetricKind,
  listMetricKinds,
  updateMetricKind,
} from './metricKindsRepository';
import type { MetricKind } from './metricKindsRepository';
import { newMetricKindId } from './ids';
import {
  deleteMetric,
  insertMetric,
  listMetricsInRange,
  listRecentMetrics,
} from './metricsRepository';
import type { Metric } from './metricsRepository';
import { NotionApiError, queryNotionDataSource } from './notionClient';
import { getNotionConfig, isNotionConfigured } from './notionConfig';
import {
  filterNewNotionMetrics,
  mapNotionPagesToMetrics,
} from './notionMetricsSync';

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

// PR-Z3b: Notion sync を非同期で実行 (UI loading に乗せない)。
// 設定が揃っていない (apiToken / dataSourceId が null) なら即 return (silently)。
// page size = 14 で 14D 分を取得 (Notion 側に古い record があっても 14 件目までで足りる前提)。
// 重複判定は (metricKey, recordedAt, source='notion') の組み合わせで、 既存 record と
// 一致するものは insert しない。 insert 件数を返す (UI 側で「新規取り込みあり」判定に使う)。
//
// 受容判断 (K-010 / K-024 同型):
// - 重複判定で listMetricsInRange を kind 数だけ実行 (N+1)。 Phase 1 N=1 で 3 kind ×
//   3 query = 数 ms、 体感問題なし。 Phase 2 で kind が増えたら listMetricsInRangeBulk 化判断
// - 401 (token 無効) は永続エラー扱い → NotionApiError を 401 で識別して再送出。
//   呼び出し側で「同セッション内では再 query しない」judgement
const syncNotionMetricsInBackground = async (
  today: IsoDate,
): Promise<number> => {
  const config = getNotionConfig();
  if (!isNotionConfigured(config)) return 0;
  // type narrowing 後の null チェック
  const pages = await queryNotionDataSource(
    config.apiToken!,
    config.bodyMetricsDataSourceId!,
    14,
  );
  const candidates = mapNotionPagesToMetrics(pages);
  if (candidates.length === 0) return 0;
  const db = await getExpoSqliteClient();
  // 既存の notion 由来 record を 14D 範囲で取得 (重複判定用)。 N+1 受容 (上記コメント)。
  const window = recentDateRange(today, ANALYTICS_WINDOW_DAYS);
  const windowStart = window[0] ?? today;
  const allExisting: Pick<Metric, 'metricKey' | 'recordedAt' | 'source'>[] = [];
  // PR-CC: DB の metric_kinds から取得 (= ユーザー追加分も sync 対象に含めない、
  // candidate の metric_key と一致するもののみ重複判定する)。
  const kinds = await listMetricKinds(db);
  for (const kind of kinds) {
    const records = await listMetricsInRange(
      db,
      kind.key,
      `${windowStart}T00:00:00`,
      `${today}T23:59:59`,
    );
    for (const r of records) {
      allExisting.push({
        metricKey: r.metricKey,
        recordedAt: r.recordedAt,
        source: r.source,
      });
    }
  }
  const fresh = filterNewNotionMetrics(candidates, allExisting);
  let inserted = 0;
  for (const m of fresh) {
    try {
      await insertMetric(db, { ...m, id: newMetricId() });
      inserted++;
    } catch {
      // 個別 insert 失敗は K-024 同型受容
    }
  }
  return inserted;
};

const loadMetrics = async (): Promise<MetricsData> => {
  const db = await getExpoSqliteClient();
  const today = todayIsoDate(new Date());
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
  addKind: (key: string, label: string, unit: string) => Promise<void>;
  updateKind: (id: string, patch: Partial<MetricKind>) => Promise<void>;
  removeKind: (kind: MetricKind) => Promise<void>;
};

export const useMetricsData = (): UseMetricsDataResult => {
  const [data, setData] = useState<MetricsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  // PR-Z3b: Notion sync は session 内で 1 度だけ。 useFocusEffect が再発火しても
  // 重複しないように ref で「今日 sync 済みか」を持つ (cold start ごとに再 sync)。
  // 失敗時も ref はそのまま保持 (= 同セッション中は再試行しない、 cold start で再試行する受容判断、 K-024 同型)。
  // 401 (token 無効) は永続エラー扱いで特別な値 '-disabled-' をセットして cold start 後でも再 query しない。
  const notionSyncedRef = useRef<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      loadMetrics()
        .then(async (d) => {
          if (cancelled) return;
          setData(d);
          setError(null);
          setLoading(false);
          // Notion sync を非同期で発火 (loading に乗せず、 backround 取り込み)。
          // 失敗時は silently fallback (UI に出さない、 K-024 同型 / ADR-0024 構造的策)。
          if (notionSyncedRef.current === d.today) return; // 既に今日 sync 済み
          if (notionSyncedRef.current === '-disabled-') return; // 401 で永続 disable
          notionSyncedRef.current = d.today;
          syncNotionMetricsInBackground(d.today)
            .then((inserted) => {
              if (cancelled || inserted === 0) return;
              setRefreshTick((t) => t + 1); // 新規 record があれば UI 再描画
            })
            .catch((e: unknown) => {
              // 401 (token 無効) は永続化 — 同セッション内では二度と query しない。
              // それ以外 (429 / 5xx / network) は今日中の同セッションでは再試行しない
              // (cold start で再試行)。 K-024 silently fallback と整合。
              if (e instanceof NotionApiError && e.status === 401) {
                notionSyncedRef.current = '-disabled-';
                // eslint-disable-next-line no-console
                console.warn('Notion API 401 — sync disabled for this session');
              } else {
                // eslint-disable-next-line no-console
                console.warn('Notion metrics sync failed, falling back to local');
              }
            });
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

  // PR-CC (ADR-0026): 種別 CRUD。 失敗時は K-024 同型 silently fallback + error set。
  // 成功で refreshTick を上げて loadMetrics を再走させる。
  const addKind = useCallback(
    async (key: string, label: string, unit: string) => {
      try {
        const db = await getExpoSqliteClient();
        const existing = await listMetricKinds(db);
        const nextOrder =
          existing.length === 0
            ? 0
            : Math.max(...existing.map((k) => k.orderIndex)) + 1;
        await insertMetricKind(db, {
          id: newMetricKindId(),
          key,
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
