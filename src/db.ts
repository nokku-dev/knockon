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
// - chains.anchor_id → anchors(id) (CASCADE 不要 / anchor は chain 1-1 専属の
//   運用前提で、chain 削除時に repository.deleteChain が anchor も続けて消す。
//   ただし 1-1 制約は SQL レベルでは未強制 (chains 側に UNIQUE(anchor_id) なし)。
//   Phase 2 以降で複数チェーンが anchor を共有する経路を後付けする余地を残す判断)
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

-- ADR-0024 (PR-Z3a): メトリクス (体重 / 運動時間 / 睡眠時間 等)。
-- 観測した事実として保存。 チェーン / アクション / ノードへの外部キーは持たない (疎結合)。
-- 派生値 (移動平均 / 達成率) は保存しない (ADR-0001 維持、 表示時派生計算)。
-- source: 'manual' (手入力) / 'notion' (Notion Body Metrics 連携、 PR-Z3b)。
CREATE TABLE IF NOT EXISTS metrics (
  id TEXT PRIMARY KEY,
  metric_key TEXT NOT NULL,
  value REAL NOT NULL,
  recorded_at TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('manual', 'notion'))
);

CREATE INDEX IF NOT EXISTS idx_nodes_chain_order ON nodes(chain_id, order_index);
CREATE INDEX IF NOT EXISTS idx_achievements_date ON achievements(date);
CREATE INDEX IF NOT EXISTS idx_anchor_firings_date ON anchor_firings(date);
CREATE INDEX IF NOT EXISTS idx_metrics_key_date ON metrics(metric_key, recorded_at);
`;

// スキーマバージョン管理。PR-1.8a で導入。
//
// 背景: PR-1.7 までは `CREATE TABLE IF NOT EXISTS` だけで対応していたが、
// PR-1.8a で `ON DELETE CASCADE` を追加したスキーマ変更は IF NOT EXISTS では
// 反映されない (既存テーブルがあれば skip)。古い CASCADE なしスキーマのまま
// PRAGMA foreign_keys=ON だけ有効化されると、チェーン削除が FK 違反で失敗する。
//
// Phase 1 N=1 開発中の判断: スキーマ変更時は drop + recreate で済ませる
// (試作データの再作成は許容範囲)。Phase 2 以降で migration 履歴を残す必要が
// 出てきたら ALTER TABLE 系に切替。
export const SCHEMA_VERSION = 2;

const DROP_SQL = `
DROP TABLE IF EXISTS metrics;
DROP TABLE IF EXISTS achievements;
DROP TABLE IF EXISTS anchor_firings;
DROP TABLE IF EXISTS nodes;
DROP TABLE IF EXISTS chains;
DROP TABLE IF EXISTS anchors;
DROP TABLE IF EXISTS actions;
`;

export const initSchema = async (client: DbClient): Promise<void> => {
  const rows = await client.all<{ user_version: number }>(`PRAGMA user_version`);
  const current = rows[0]?.user_version ?? 0;
  if (current < SCHEMA_VERSION) {
    // 古い schema を破棄して新規作成。CREATE IF NOT EXISTS だと CASCADE 句が
    // 反映されない問題への対応。
    await client.exec(DROP_SQL);
    await client.exec(SCHEMA_SQL);
    await client.exec(`PRAGMA user_version = ${SCHEMA_VERSION};`);
  } else {
    // 既に最新バージョン: 空 DB の保険として CREATE IF NOT EXISTS は通す
    await client.exec(SCHEMA_SQL);
  }
};
