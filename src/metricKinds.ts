// PR-Z3a (ADR-0024 §3c): builtin メトリクス種別。
// 「メトリクスは任意 + チェーンと疎結合」(K-004 ANT 違反回避の構造的策) に基づき、
// ユーザー追加 UI は持たない (Phase 2 後半判断)。 既存 Notion Body Metrics の
// 主要項目を覆う最小セット (Z3b で Notion 連携時に key を一致させる)。
//
// 単位 (unit) は表示用ラベルのみ。 DB は数値のみ保存し、 単位は表示時に付ける。
export type MetricKind = {
  key: string;
  label: string;
  unit: string;
};

export const METRIC_KINDS: ReadonlyArray<MetricKind> = [
  { key: 'weight', label: '体重', unit: 'kg' },
  { key: 'exercise_minutes', label: '運動', unit: '分' },
  { key: 'sleep_hours', label: '睡眠', unit: '時間' },
];

export const findMetricKind = (key: string): MetricKind | undefined =>
  METRIC_KINDS.find((k) => k.key === key);
