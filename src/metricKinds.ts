import type { MetricKind } from './metricKindsRepository';

// PR-Z3a (ADR-0024) で builtin 定数として宣言した METRIC_KINDS は
// PR-CC (ADR-0026) で DB seed 化に移行。 起動時に metric_kinds テーブルへ
// `INSERT OR IGNORE` で投入する初期値として残す。
//
// 互換性注意:
// - key ('weight' / 'exercise_minutes' / 'sleep_hours') は維持
//   → Notion 連携 (PR-Z3b) の property name 規約と一致
//   ([docs/notion-setup.md](../docs/notion-setup.md))
// - ユーザーが key を編集すると Notion sync が機能しなくなる (= 自己責任)

export type BuiltinMetricKindSeed = Omit<MetricKind, 'id'> & { id: string };

export const BUILTIN_METRIC_KINDS: ReadonlyArray<BuiltinMetricKindSeed> = [
  {
    id: 'metric-kind-weight',
    key: 'weight',
    label: '体重',
    unit: 'kg',
    orderIndex: 0,
    isBuiltin: true,
  },
  {
    id: 'metric-kind-exercise-minutes',
    key: 'exercise_minutes',
    label: '運動',
    unit: '分',
    orderIndex: 1,
    isBuiltin: true,
  },
  {
    id: 'metric-kind-sleep-hours',
    key: 'sleep_hours',
    label: '睡眠',
    unit: '時間',
    orderIndex: 2,
    isBuiltin: true,
  },
];
