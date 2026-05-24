import type { DbClient } from './db';
import type {
  Achievement,
  Action,
  Anchor,
  AnchorFiring,
  Chain,
  IsoDate,
  Node,
  VariantMap,
} from './domain';

type AnchorRow = {
  id: string;
  title: string;
  kind: 'time' | 'place' | 'behavior';
  time: string | null;
  latitude: number | null;
  longitude: number | null;
  radius_meters: number | null;
};

type ActionRow = {
  id: string;
  title: string;
  variants_json: string | null;
};

type ChainRow = {
  id: string;
  title: string;
  anchor_id: string;
  status: 'active' | 'stocked';
  created_at: string;
};

type NodeRow = {
  id: string;
  chain_id: string;
  order_index: number;
  kind: 'action';
  action_id: string;
};

type AchievementRow = {
  node_id: string;
  date: string;
  achieved: number;
};

type AnchorFiringRow = {
  anchor_id: string;
  date: string;
};

const rowToAnchor = (r: AnchorRow): Anchor => ({
  id: r.id,
  title: r.title,
  kind: r.kind,
  time: r.time,
  latitude: r.latitude,
  longitude: r.longitude,
  radiusMeters: r.radius_meters,
});

const rowToAction = (r: ActionRow): Action => ({
  id: r.id,
  title: r.title,
  variants: r.variants_json
    ? (JSON.parse(r.variants_json) as VariantMap)
    : null,
});

const rowToChain = (r: ChainRow): Chain => ({
  id: r.id,
  title: r.title,
  anchorId: r.anchor_id,
  status: r.status,
  createdAt: r.created_at,
});

const rowToNode = (r: NodeRow): Node => ({
  id: r.id,
  chainId: r.chain_id,
  orderIndex: r.order_index,
  kind: r.kind,
  actionId: r.action_id,
});

const rowToAchievement = (r: AchievementRow): Achievement => ({
  nodeId: r.node_id,
  date: r.date,
  achieved: r.achieved === 1,
});

const rowToAnchorFiring = (r: AnchorFiringRow): AnchorFiring => ({
  anchorId: r.anchor_id,
  date: r.date,
});

export const insertAnchor = (db: DbClient, anchor: Anchor): Promise<void> =>
  db.run(
    `INSERT INTO anchors (id, title, kind, time, latitude, longitude, radius_meters)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      anchor.id,
      anchor.title,
      anchor.kind,
      anchor.time,
      anchor.latitude,
      anchor.longitude,
      anchor.radiusMeters,
    ],
  );

export const updateAnchor = (db: DbClient, anchor: Anchor): Promise<void> =>
  db.run(
    `UPDATE anchors
        SET title = ?,
            kind = ?,
            time = ?,
            latitude = ?,
            longitude = ?,
            radius_meters = ?
      WHERE id = ?`,
    [
      anchor.title,
      anchor.kind,
      anchor.time,
      anchor.latitude,
      anchor.longitude,
      anchor.radiusMeters,
      anchor.id,
    ],
  );

// アクション削除。nodes.action_id REFERENCES actions(id) は RESTRICT (デフォルト)
// なので、使用中のアクションを直接 DELETE すると FK 違反で reject される。
// UX 上は「使用中」を明示的なエラーにしたいので、削除前に使用数をチェックして
// 0 件のときだけ DELETE する。
// 存在しないアクション ID は no-op (UI からの誤呼び出し対策、deleteChain と整合)。
//
// TOCTOU レース受容判断 (K-010 / K-018 継承): COUNT と DELETE の間に別経路が
// アクションを使い始めると「使用 0 → DELETE 通る → 直後に orphan」が理論上ありうる。
// test env は FK on で DELETE 側が二重防壁、prod env (expo-sqlite) は PR-1.8a で
// PRAGMA foreign_keys=ON 有効化済みで同様。さらに Phase 1 N=1 では並行操作経路が
// なく実害なし。Phase 2 でマルチデバイス同期 / 並行操作が出るタイミングで
// BEGIN/COMMIT で囲むか判断する。
//
// 責務越境受容判断: throw 文の error.message が UI 文面そのままになっている
// (Phase 1 N=1 では i18n / 複数 UI なしで実害なし)。Phase 2 で i18n や通知文面
// が必要になったら error code 化 ({ kind: 'in_use', count: N }) に refactor。
export const deleteAction = async (
  db: DbClient,
  actionId: string,
): Promise<void> => {
  const usedRows = await db.all<{ count: number }>(
    `SELECT COUNT(*) AS count FROM nodes WHERE action_id = ?`,
    [actionId],
  );
  const usedCount = usedRows[0]?.count ?? 0;
  if (usedCount > 0) {
    throw new Error(
      `このアクションは ${usedCount} 個のノードで使用中のため削除できません`,
    );
  }
  await db.run(`DELETE FROM actions WHERE id = ?`, [actionId]);
};

export const insertAction = (db: DbClient, action: Action): Promise<void> =>
  db.run(`INSERT INTO actions (id, title, variants_json) VALUES (?, ?, ?)`, [
    action.id,
    action.title,
    action.variants ? JSON.stringify(action.variants) : null,
  ]);

export const updateAction = (db: DbClient, action: Action): Promise<void> =>
  db.run(`UPDATE actions SET title = ?, variants_json = ? WHERE id = ?`, [
    action.title,
    action.variants ? JSON.stringify(action.variants) : null,
    action.id,
  ]);

export const insertChain = (db: DbClient, chain: Chain): Promise<void> =>
  db.run(
    `INSERT INTO chains (id, title, anchor_id, status, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [chain.id, chain.title, chain.anchorId, chain.status, chain.createdAt],
  );

export const updateChain = (db: DbClient, chain: Chain): Promise<void> =>
  db.run(
    `UPDATE chains SET title = ?, anchor_id = ?, status = ? WHERE id = ?`,
    [chain.title, chain.anchorId, chain.status, chain.id],
  );

// チェーン削除。関連 nodes / achievements / anchor_firings はスキーマの
// ON DELETE CASCADE で自動削除される。anchor は chains.anchor_id 1-1 専属で
// CASCADE 対象外なので、chain 削除前に anchor_id を取得 → chain 削除 →
// anchor 削除 の順で続けて発行する。
//
// 注: BEGIN/COMMIT で囲んでいない (リポジトリ全体に TX 抽象なし、persistChainDraft と
// 整合)。2 段目 DELETE anchors が失敗すると orphan anchor が残るが、Phase 1 規模
// (SQLite ローカル書込) では実害なしで受容する判断 (K-010: 同時実行 / 失敗時挙動を
// 暗黙にしない)。本気でアトミックにしたい局面が出たら DbClient に transaction を
// 生やす (expo-sqlite の withTransactionAsync 相当) 判断は Phase 2 で再検討。
//
// 存在しないチェーン ID は no-op (エラーを投げない、UI からの誤呼び出し対策)。
export const deleteChain = async (
  db: DbClient,
  chainId: string,
): Promise<void> => {
  const rows = await db.all<{ anchor_id: string }>(
    `SELECT anchor_id FROM chains WHERE id = ?`,
    [chainId],
  );
  const anchorId = rows[0]?.anchor_id;
  if (anchorId == null) return; // 存在しないチェーン ID
  await db.run(`DELETE FROM chains WHERE id = ?`, [chainId]);
  await db.run(`DELETE FROM anchors WHERE id = ?`, [anchorId]);
};

export const insertNode = (db: DbClient, node: Node): Promise<void> =>
  db.run(
    `INSERT INTO nodes (id, chain_id, order_index, kind, action_id)
     VALUES (?, ?, ?, ?, ?)`,
    [node.id, node.chainId, node.orderIndex, node.kind, node.actionId],
  );

// ノード 1 つを物理削除。 関連 achievements は schema の ON DELETE CASCADE で
// 自動削除 (PR-1.8a)。 nodes 削除に対応する CASCADE は actions/anchors と違い
// 派生記録のみが消えるため、 副作用は限定的。
// 存在しないノード ID の DELETE は no-op (SQLite の挙動、 deleteChain と整合)。
export const deleteNode = (db: DbClient, nodeId: string): Promise<void> =>
  db.run(`DELETE FROM nodes WHERE id = ?`, [nodeId]);

export const updateNode = (db: DbClient, node: Node): Promise<void> =>
  db.run(
    `UPDATE nodes SET order_index = ?, action_id = ? WHERE id = ?`,
    [node.orderIndex, node.actionId, node.id],
  );

// アクション差し替えのみ。order_index は触らない (UNIQUE(chain_id, order_index)
// 制約下で複数ノードを一括更新する経路 = useChainEdit.persistChainDraft 編集
// モードで使う。並び替えは reorderNodes に任せて衝突を防ぐ)。
export const updateNodeAction = (
  db: DbClient,
  nodeId: string,
  actionId: string,
): Promise<void> =>
  db.run(`UPDATE nodes SET action_id = ? WHERE id = ?`, [actionId, nodeId]);

// ノード並び替え用ヘルパ: 同チェーン内の orderIndex をまとめて書き換える。
// (chainId, order_index) の UNIQUE 制約があるため一旦負数に逃がしてから本値を入れる
// 2 段階更新で衝突を回避する。
export const reorderNodes = async (
  db: DbClient,
  chainId: string,
  orderedNodeIds: readonly string[],
): Promise<void> => {
  for (let i = 0; i < orderedNodeIds.length; i++) {
    await db.run(`UPDATE nodes SET order_index = ? WHERE id = ? AND chain_id = ?`, [
      -1 - i,
      orderedNodeIds[i],
      chainId,
    ]);
  }
  for (let i = 0; i < orderedNodeIds.length; i++) {
    await db.run(`UPDATE nodes SET order_index = ? WHERE id = ? AND chain_id = ?`, [
      i,
      orderedNodeIds[i],
      chainId,
    ]);
  }
};

export const listActions = async (db: DbClient): Promise<Action[]> => {
  const rows = await db.all<ActionRow>(`SELECT * FROM actions ORDER BY title`);
  return rows.map(rowToAction);
};

export const recordAchievement = (
  db: DbClient,
  achievement: Achievement,
): Promise<void> =>
  db.run(
    `INSERT INTO achievements (node_id, date, achieved)
     VALUES (?, ?, ?)
     ON CONFLICT(node_id, date) DO UPDATE SET achieved=excluded.achieved`,
    [achievement.nodeId, achievement.date, achievement.achieved ? 1 : 0],
  );

export const listChains = async (
  db: DbClient,
  status?: Chain['status'],
): Promise<Chain[]> => {
  const rows = status
    ? await db.all<ChainRow>(
        `SELECT * FROM chains WHERE status = ? ORDER BY created_at`,
        [status],
      )
    : await db.all<ChainRow>(`SELECT * FROM chains ORDER BY created_at`);
  return rows.map(rowToChain);
};

export const getAnchor = async (
  db: DbClient,
  anchorId: string,
): Promise<Anchor | null> => {
  const rows = await db.all<AnchorRow>(`SELECT * FROM anchors WHERE id = ?`, [
    anchorId,
  ]);
  return rows[0] ? rowToAnchor(rows[0]) : null;
};

export const listNodes = async (
  db: DbClient,
  chainId: string,
): Promise<Node[]> => {
  const rows = await db.all<NodeRow>(
    `SELECT * FROM nodes WHERE chain_id = ? ORDER BY order_index`,
    [chainId],
  );
  return rows.map(rowToNode);
};

export const getAction = async (
  db: DbClient,
  actionId: string,
): Promise<Action | null> => {
  const rows = await db.all<ActionRow>(`SELECT * FROM actions WHERE id = ?`, [
    actionId,
  ]);
  return rows[0] ? rowToAction(rows[0]) : null;
};

export const listAchievementsForNodes = async (
  db: DbClient,
  nodeIds: readonly string[],
  fromDate?: IsoDate,
  toDate?: IsoDate,
): Promise<Achievement[]> => {
  if (nodeIds.length === 0) return [];
  const placeholders = nodeIds.map(() => '?').join(',');
  const conditions: string[] = [`node_id IN (${placeholders})`];
  const params: unknown[] = [...nodeIds];
  if (fromDate) {
    conditions.push('date >= ?');
    params.push(fromDate);
  }
  if (toDate) {
    conditions.push('date <= ?');
    params.push(toDate);
  }
  const rows = await db.all<AchievementRow>(
    `SELECT * FROM achievements WHERE ${conditions.join(' AND ')} ORDER BY date, node_id`,
    params,
  );
  return rows.map(rowToAchievement);
};

// ADR-0012: アンカー発火イベントの記録。1 日 1 回の不可逆事実。
// 同 (anchor_id, date) で 2 回目以降の INSERT は OR IGNORE で握り潰す。
export const recordAnchorFiring = (
  db: DbClient,
  firing: AnchorFiring,
): Promise<void> =>
  db.run(
    `INSERT OR IGNORE INTO anchor_firings (anchor_id, date) VALUES (?, ?)`,
    [firing.anchorId, firing.date],
  );

// 指定アンカーの指定日付の発火 record を取得 (今日発火済み判定に使う)。
export const listAnchorFiringsForDate = async (
  db: DbClient,
  anchorId: string,
  date: IsoDate,
): Promise<AnchorFiring[]> => {
  const rows = await db.all<AnchorFiringRow>(
    `SELECT * FROM anchor_firings WHERE anchor_id = ? AND date = ?`,
    [anchorId, date],
  );
  return rows.map(rowToAnchorFiring);
};
