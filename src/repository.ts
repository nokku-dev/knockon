import type { DbClient } from './db';
import type {
  Achievement,
  Action,
  Anchor,
  AnchorFiring,
  CatalogAction,
  CatalogSource,
  Category,
  CategoryType,
  Chain,
  IsoDate,
  Node,
  RecommendedItem,
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
  timer_seconds: number | null;
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
  active: number; // #73: 0/1
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
  timerSeconds: r.timer_seconds,
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
  active: r.active === 1,
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
  db.run(
    `INSERT INTO actions (id, title, variants_json, timer_seconds) VALUES (?, ?, ?, ?)`,
    [
      action.id,
      action.title,
      action.variants ? JSON.stringify(action.variants) : null,
      action.timerSeconds,
    ],
  );

export const updateAction = (db: DbClient, action: Action): Promise<void> =>
  db.run(
    `UPDATE actions SET title = ?, variants_json = ?, timer_seconds = ? WHERE id = ?`,
    [
      action.title,
      action.variants ? JSON.stringify(action.variants) : null,
      action.timerSeconds,
      action.id,
    ],
  );

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
    `INSERT INTO nodes (id, chain_id, order_index, kind, action_id, active)
     VALUES (?, ?, ?, ?, ?, ?)`,
    // active は #73: 未指定は 1 (通常表示) 既定。
    [
      node.id,
      node.chainId,
      node.orderIndex,
      node.kind,
      node.actionId,
      node.active === false ? 0 : 1,
    ],
  );

// #73 (SPEC §6): ノードの ON/OFF (一時停止) を切り替える。order_index / action_id は
// 触らない (= 停止は非破壊・可逆、UNIQUE(chain_id, order_index) にも干渉しない)。
export const updateNodeActive = (
  db: DbClient,
  nodeId: string,
  active: boolean,
): Promise<void> =>
  db.run(`UPDATE nodes SET active = ? WHERE id = ?`, [active ? 1 : 0, nodeId]);

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

// ADR-0039 (#154) / ADR-0040 (#160): テンプレートカタログ (新カテゴリモデル) の読み書き。
// 旧 modules/links テーブルと関連関数は ADR-0040 で撤去済み。catalog は採用前のテンプレ定義
// 専用。ここでは insert / seed (冪等) / list のみ (update/delete は後続トラックの編集 UI)。

type CategoryRow = {
  id: string;
  name: string;
  type: CategoryType;
  color: string;
  source: CatalogSource;
  order_index: number;
};

type CatalogActionRow = {
  id: string;
  title: string;
  category_id: string;
  default_on: number;
  position: number;
  source: CatalogSource;
  timer_seconds: number | null;
};

type RecommendedItemRow = {
  id: string;
  category_id: string;
  action_id: string;
  position: number;
};

const rowToCategory = (r: CategoryRow): Category => ({
  id: r.id,
  name: r.name,
  type: r.type,
  color: r.color,
  source: r.source,
  orderIndex: r.order_index,
});

const rowToCatalogAction = (r: CatalogActionRow): CatalogAction => ({
  id: r.id,
  title: r.title,
  categoryId: r.category_id,
  defaultOn: r.default_on === 1,
  position: r.position,
  source: r.source,
  timerSeconds: r.timer_seconds,
});

const rowToRecommendedItem = (r: RecommendedItemRow): RecommendedItem => ({
  id: r.id,
  categoryId: r.category_id,
  actionId: r.action_id,
  position: r.position,
});

export const insertCategory = (db: DbClient, category: Category): Promise<void> =>
  db.run(
    `INSERT INTO categories (id, name, type, color, source, order_index)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      category.id,
      category.name,
      category.type,
      category.color,
      category.source,
      category.orderIndex,
    ],
  );

export const insertCatalogAction = (
  db: DbClient,
  action: CatalogAction,
): Promise<void> =>
  db.run(
    `INSERT INTO catalog_actions (id, title, category_id, default_on, position, source, timer_seconds)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      action.id,
      action.title,
      action.categoryId,
      action.defaultOn ? 1 : 0,
      action.position,
      action.source,
      action.timerSeconds,
    ],
  );

export const insertRecommendedItem = (
  db: DbClient,
  item: RecommendedItem,
): Promise<void> =>
  db.run(
    `INSERT INTO recommended_items (id, category_id, action_id, position)
     VALUES (?, ?, ?, ?)`,
    [item.id, item.categoryId, item.actionId, item.position],
  );

// seed 用の冪等版 (INSERT OR IGNORE)。固定 ID + 毎起動投入で 2 回目以降は PK 衝突を握り潰す
// (builtin metric kinds の seed と同じ精神。official 削除後の復活挙動も同じ Phase 1 受容 / K-024)。
export const seedCategory = (db: DbClient, category: Category): Promise<void> =>
  db.run(
    `INSERT OR IGNORE INTO categories (id, name, type, color, source, order_index)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      category.id,
      category.name,
      category.type,
      category.color,
      category.source,
      category.orderIndex,
    ],
  );

export const seedCatalogAction = (
  db: DbClient,
  action: CatalogAction,
): Promise<void> =>
  db.run(
    `INSERT OR IGNORE INTO catalog_actions (id, title, category_id, default_on, position, source, timer_seconds)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      action.id,
      action.title,
      action.categoryId,
      action.defaultOn ? 1 : 0,
      action.position,
      action.source,
      action.timerSeconds,
    ],
  );

export const seedRecommendedItem = (
  db: DbClient,
  item: RecommendedItem,
): Promise<void> =>
  db.run(
    `INSERT OR IGNORE INTO recommended_items (id, category_id, action_id, position)
     VALUES (?, ?, ?, ?)`,
    [item.id, item.categoryId, item.actionId, item.position],
  );

export const listCategories = async (db: DbClient): Promise<Category[]> => {
  const rows = await db.all<CategoryRow>(
    `SELECT * FROM categories ORDER BY order_index`,
  );
  return rows.map(rowToCategory);
};

// 全アクションを「カテゴリ順 → カテゴリ内 position 順」で返す (= category_id, position)。
// 全体を通した単一 position 昇順ではない (K-022: コメントの保証を実装と一致させる)。
export const listCatalogActions = async (
  db: DbClient,
): Promise<CatalogAction[]> => {
  const rows = await db.all<CatalogActionRow>(
    `SELECT * FROM catalog_actions ORDER BY category_id, position`,
  );
  return rows.map(rowToCatalogAction);
};

export const listCatalogActionsForCategory = async (
  db: DbClient,
  categoryId: string,
): Promise<CatalogAction[]> => {
  const rows = await db.all<CatalogActionRow>(
    `SELECT * FROM catalog_actions WHERE category_id = ? ORDER BY position`,
    [categoryId],
  );
  return rows.map(rowToCatalogAction);
};

// recommended カテゴリの順序つきアイテムを position 昇順で返す。
export const listRecommendedItemsForCategory = async (
  db: DbClient,
  categoryId: string,
): Promise<RecommendedItem[]> => {
  const rows = await db.all<RecommendedItemRow>(
    `SELECT * FROM recommended_items WHERE category_id = ? ORDER BY position`,
    [categoryId],
  );
  return rows.map(rowToRecommendedItem);
};

// 全 recommended_item を「カテゴリ順 → カテゴリ内 position 順」で返す
// (= category_id, position)。useDiscovery が全カテゴリ分を一括ロードして
// preview をメモ化するため (catalog_actions と同型の一括ロード)。
export const listRecommendedItems = async (
  db: DbClient,
): Promise<RecommendedItem[]> => {
  const rows = await db.all<RecommendedItemRow>(
    `SELECT * FROM recommended_items ORDER BY category_id, position`,
  );
  return rows.map(rowToRecommendedItem);
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

// #142 (ADR-0041): アプリ全体の累計達成ノード数のベース。 beforeDate より前 (= 今日を含まない) で
// achieved=1 の record 総数を SQL COUNT で返す。 今日分を含めないのは、 表示側で
// 「今日の達成数 (楽観更新で即時反映)」を別途合算するため (今日の record を二重計上しない)。
// ADR-0001: 派生値は永続化せず、 表示時に都度集計する。
// ADR-0041: ノード単位の累計表示は撤回したため、 アプリ全体集計の 1 API のみ残す
// (旧 countAchievedBeforeByNode は死にコードを残さない原則で同 PR で削除)。
export const countAchievedBefore = async (
  db: DbClient,
  beforeDate: IsoDate,
): Promise<number> => {
  const rows = await db.all<{ n: number }>(
    `SELECT COUNT(*) AS n FROM achievements WHERE achieved = 1 AND date < ?`,
    [beforeDate],
  );
  return rows[0]?.n ?? 0;
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
