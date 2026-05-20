export interface DbClient {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: readonly unknown[]): Promise<void>;
  all<T>(sql: string, params?: readonly unknown[]): Promise<T[]>;
  close?(): Promise<void>;
}

// 外部キー (REFERENCES) は SQL 上で宣言し、PRAGMA foreign_keys=ON で強制する
// (test env / prod env 両方で db client factory が PRAGMA を発行する。
// K-018 の test/prod 乖離は PR-1.8a で構造的に解決済み)。
//
// CASCADE 設計:
// - nodes.chain_id → chains(id) ON DELETE CASCADE  (チェーン削除でノード全消し)
// - achievements.node_id → nodes(id) ON DELETE CASCADE (ノード削除で達成記録も削除)
// - anchor_firings.anchor_id → anchors(id) ON DELETE CASCADE (アンカー削除で発火記録も削除)
// - nodes.action_id → actions(id) (デフォルト = RESTRICT / 使用中アクションは削除拒否、PR-1.8b で意味を持つ)
// - chains.anchor_id → anchors(id) (CASCADE 不要 / anchor は chain 1-1 専属で、
//   chain 削除時に repository.deleteChain が anchor も同 TX で消す)
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS anchors (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('time', 'place', 'behavior')),
  time TEXT,
  latitude REAL,
  longitude REAL,
  radius_meters REAL
);

CREATE TABLE IF NOT EXISTS actions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  variants_json TEXT
);

CREATE TABLE IF NOT EXISTS chains (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  anchor_id TEXT NOT NULL REFERENCES anchors(id),
  status TEXT NOT NULL CHECK(status IN ('active', 'stocked')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  chain_id TEXT NOT NULL REFERENCES chains(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('action')),
  action_id TEXT NOT NULL REFERENCES actions(id),
  UNIQUE(chain_id, order_index)
);

CREATE TABLE IF NOT EXISTS achievements (
  node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  achieved INTEGER NOT NULL CHECK(achieved IN (0, 1)),
  PRIMARY KEY (node_id, date)
);

-- ADR-0012: アンカー発火イベント。1 日 1 回の不可逆事実。
-- 時刻/場所共通。発火 record があれば「今日発火済み」扱い (Today の発火中ピル表示)。
CREATE TABLE IF NOT EXISTS anchor_firings (
  anchor_id TEXT NOT NULL REFERENCES anchors(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  PRIMARY KEY (anchor_id, date)
);

CREATE INDEX IF NOT EXISTS idx_nodes_chain_order ON nodes(chain_id, order_index);
CREATE INDEX IF NOT EXISTS idx_achievements_date ON achievements(date);
CREATE INDEX IF NOT EXISTS idx_anchor_firings_date ON anchor_firings(date);
`;

export const initSchema = (client: DbClient): Promise<void> =>
  client.exec(SCHEMA_SQL);
