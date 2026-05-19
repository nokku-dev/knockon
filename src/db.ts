export interface DbClient {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: readonly unknown[]): Promise<void>;
  all<T>(sql: string, params?: readonly unknown[]): Promise<T[]>;
  close?(): Promise<void>;
}

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
  chain_id TEXT NOT NULL REFERENCES chains(id),
  order_index INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('action')),
  action_id TEXT NOT NULL REFERENCES actions(id),
  UNIQUE(chain_id, order_index)
);

CREATE TABLE IF NOT EXISTS achievements (
  node_id TEXT NOT NULL REFERENCES nodes(id),
  date TEXT NOT NULL,
  achieved INTEGER NOT NULL CHECK(achieved IN (0, 1)),
  PRIMARY KEY (node_id, date)
);

-- ADR-0012: アンカー発火イベント。1 日 1 回の不可逆事実。
-- 時刻/場所共通。発火 record があれば「今日発火済み」扱い (Today の発火中ピル表示)。
CREATE TABLE IF NOT EXISTS anchor_firings (
  anchor_id TEXT NOT NULL REFERENCES anchors(id),
  date TEXT NOT NULL,
  PRIMARY KEY (anchor_id, date)
);

CREATE INDEX IF NOT EXISTS idx_nodes_chain_order ON nodes(chain_id, order_index);
CREATE INDEX IF NOT EXISTS idx_achievements_date ON achievements(date);
CREATE INDEX IF NOT EXISTS idx_anchor_firings_date ON anchor_firings(date);
`;

export const initSchema = (client: DbClient): Promise<void> =>
  client.exec(SCHEMA_SQL);
