import type { DbClient } from './db';

// PR-CC (ADR-0026): メトリクス種別マスタの CRUD。
// metrics テーブルとは疎結合 (FK なし)。 種別削除しても観測 record は残る。

export type MetricKind = {
  id: string;
  key: string;
  label: string;
  unit: string;
  orderIndex: number;
  isBuiltin: boolean;
};

type MetricKindRow = {
  id: string;
  key: string;
  label: string;
  unit: string;
  order_index: number;
  is_builtin: number; // SQLite には bool がないので 0/1
};

const rowToMetricKind = (r: MetricKindRow): MetricKind => ({
  id: r.id,
  key: r.key,
  label: r.label,
  unit: r.unit,
  orderIndex: r.order_index,
  isBuiltin: r.is_builtin === 1,
});

// 一覧 (order_index 昇順)。
export const listMetricKinds = async (db: DbClient): Promise<MetricKind[]> => {
  const rows = await db.all<MetricKindRow>(
    `SELECT * FROM metric_kinds ORDER BY order_index, key`,
  );
  return rows.map(rowToMetricKind);
};

// 新規追加。 key 重複は UNIQUE 制約で reject (呼び出し側でキャッチ)。
export const insertMetricKind = async (
  db: DbClient,
  kind: MetricKind,
): Promise<void> => {
  await db.run(
    `INSERT INTO metric_kinds (id, key, label, unit, order_index, is_builtin)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      kind.id,
      kind.key,
      kind.label,
      kind.unit,
      kind.orderIndex,
      kind.isBuiltin ? 1 : 0,
    ],
  );
};

// 「存在しなければ追加」(seed 用、 既存 key はそのまま)。
export const insertMetricKindIfMissing = async (
  db: DbClient,
  kind: MetricKind,
): Promise<void> => {
  await db.run(
    `INSERT OR IGNORE INTO metric_kinds (id, key, label, unit, order_index, is_builtin)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      kind.id,
      kind.key,
      kind.label,
      kind.unit,
      kind.orderIndex,
      kind.isBuiltin ? 1 : 0,
    ],
  );
};

// 編集 (key 含む)。 ID 指定。 key 変更時の Notion 連携影響は UI 側で警告。
export const updateMetricKind = async (
  db: DbClient,
  kind: MetricKind,
): Promise<void> => {
  await db.run(
    `UPDATE metric_kinds SET key = ?, label = ?, unit = ?, order_index = ?, is_builtin = ?
     WHERE id = ?`,
    [
      kind.key,
      kind.label,
      kind.unit,
      kind.orderIndex,
      kind.isBuiltin ? 1 : 0,
      kind.id,
    ],
  );
};

// 削除。 関連 metrics record はそのまま残る (= 疎結合 / データ保全、 ADR-0026 採用 X)。
export const deleteMetricKind = async (
  db: DbClient,
  kindId: string,
): Promise<void> => {
  await db.run(`DELETE FROM metric_kinds WHERE id = ?`, [kindId]);
};
