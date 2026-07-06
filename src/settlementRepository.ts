import type { DbClient } from './db';
import type { SettlementRetraction } from './domain';

// ADR-0047: 定着取り下げの永続化。ユーザーが「最近やれてない」と感じたときに定着を
// 取り下げる「観測した事実」軸 (派生値ではない、ADR-0012 anchor_firings / ADR-0044 notes と同型)。
// 定着ステータス自体は保存せず派生 (latch)。保存するのは取り下げ事実のみ。
// retractedAt は呼び出し側で生成して渡す (domain/repository 層は Date 生成に依存しない、
// K-007 ドメイン層純粋性 / metricsRepository・notesRepository と同じ方針)。

type SettlementRetractionRow = {
  node_id: string;
  retracted_at: string;
};

const rowToRetraction = (r: SettlementRetractionRow): SettlementRetraction => ({
  nodeId: r.node_id,
  retractedAt: r.retracted_at,
});

// 取り下げを 1 件記録。同一 (node_id, retracted_at) の再実行は冪等 (PRIMARY KEY 衝突は無視)。
export const insertRetraction = async (
  db: DbClient,
  retraction: SettlementRetraction,
): Promise<void> => {
  await db.run(
    `INSERT OR IGNORE INTO settlement_retractions (node_id, retracted_at)
     VALUES (?, ?)`,
    [retraction.nodeId, retraction.retractedAt],
  );
};

// 全ノードの取り下げ事実を取得 (retracted_at 昇順)。domain 側 (isNodeSettled /
// nodeSettlementStage) がノード別・最新取り下げで解釈する。Today / ログ画面の両方で使う。
export const listRetractions = async (
  db: DbClient,
): Promise<SettlementRetraction[]> => {
  const rows = await db.all<SettlementRetractionRow>(
    `SELECT node_id, retracted_at FROM settlement_retractions ORDER BY retracted_at`,
  );
  return rows.map(rowToRetraction);
};
