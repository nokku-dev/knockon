import type { DbClient } from './db';

// PR-Z3a (ADR-0024 §3c): メトリクスの観測値 (= 観測した事実)。
// チェーン / アクション / ノードへの外部キーは持たない (疎結合)。
// source: 'manual' (手入力) のみが現行。'notion' は ADR-0052 で連携撤去後も
// 型と CHECK 制約に残置 (既存行の互換のため。詳細は db.ts のスキーマコメント)。
export type Metric = {
  id: string;
  metricKey: string;
  value: number;
  recordedAt: string; // ISO-like, e.g. '2026-05-26T09:00:00'
  source: 'manual' | 'notion';
};

type MetricRow = {
  id: string;
  metric_key: string;
  value: number;
  recorded_at: string;
  source: 'manual' | 'notion';
};

const rowToMetric = (r: MetricRow): Metric => ({
  id: r.id,
  metricKey: r.metric_key,
  value: r.value,
  recordedAt: r.recorded_at,
  source: r.source,
});

// 手入力で 1 件保存。 id は呼び出し側で newMetricId() で生成して渡す
// (domain/repository 層は expo-crypto に依存しない、 K-007 ドメイン層純粋性維持)。
export const insertMetric = async (
  db: DbClient,
  input: Metric,
): Promise<void> => {
  await db.run(
    `INSERT INTO metrics (id, metric_key, value, recorded_at, source) VALUES (?, ?, ?, ?, ?)`,
    [input.id, input.metricKey, input.value, input.recordedAt, input.source],
  );
};

// 指定 key の最近 N 件を取得 (recorded_at 降順)。 UI で「最新値 + 過去」を表示する用。
export const listRecentMetrics = async (
  db: DbClient,
  metricKey: string,
  limit: number,
): Promise<Metric[]> => {
  const rows = await db.all<MetricRow>(
    `SELECT * FROM metrics WHERE metric_key = ? ORDER BY recorded_at DESC LIMIT ?`,
    [metricKey, limit],
  );
  return rows.map(rowToMetric);
};

// 指定 key の指定日時範囲を取得 (折れ線グラフ用、 recorded_at 昇順)。
export const listMetricsInRange = async (
  db: DbClient,
  metricKey: string,
  fromDate: string,
  toDate: string,
): Promise<Metric[]> => {
  const rows = await db.all<MetricRow>(
    `SELECT * FROM metrics WHERE metric_key = ? AND recorded_at >= ? AND recorded_at <= ? ORDER BY recorded_at`,
    [metricKey, fromDate, toDate],
  );
  return rows.map(rowToMetric);
};

// id 指定で削除 (手入力ミスのやり直し用)。
export const deleteMetric = async (
  db: DbClient,
  metricId: string,
): Promise<void> => {
  await db.run(`DELETE FROM metrics WHERE id = ?`, [metricId]);
};
