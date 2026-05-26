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
  variants_json TEXT,
  -- ADR-0025 (PR-BB): タイマー秒数 (NULL = タイマーなし、 既存挙動)。
  -- 入力単位は分 / DB は秒で精度確保。 action 単位 (= 同じアクションを別チェーンで使っても同じ時間)
  timer_seconds INTEGER
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
-- recorded_at format: 'YYYY-MM-DDTHH:MM:SS' (秒精度の ISO-like 文字列、 UTC ベース、
-- timezone 標識なし)。 PR-Z3b で Notion 連携も同フォーマットに揃える。 日付のみ
-- ('YYYY-MM-DD') は禁止 (listMetricsInRange の境界比較が壊れる)。
CREATE TABLE IF NOT EXISTS metrics (
  id TEXT PRIMARY KEY,
  metric_key TEXT NOT NULL,
  value REAL NOT NULL,
  recorded_at TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('manual', 'notion'))
);

-- ADR-0026 (PR-CC): メトリクス種別マスタ。 ユーザーがカスタマイズ可能 (追加/編集/削除)。
-- metrics テーブルとは疎結合 (FK なし)。 種別削除しても観測 record は残る (= データ保全)。
-- is_builtin = 1: 起動時 seed の builtin (weight / exercise_minutes / sleep_hours)。
-- key UNIQUE: アプリ内識別子、 metric_key と一致。 編集可だが Notion 連携の互換性に影響。
CREATE TABLE IF NOT EXISTS metric_kinds (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  unit TEXT NOT NULL,
  order_index INTEGER NOT NULL,
  is_builtin INTEGER NOT NULL CHECK(is_builtin IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_nodes_chain_order ON nodes(chain_id, order_index);
CREATE INDEX IF NOT EXISTS idx_achievements_date ON achievements(date);
CREATE INDEX IF NOT EXISTS idx_anchor_firings_date ON anchor_firings(date);
CREATE INDEX IF NOT EXISTS idx_metrics_key_date ON metrics(metric_key, recorded_at);
CREATE INDEX IF NOT EXISTS idx_metric_kinds_order ON metric_kinds(order_index);
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
export const SCHEMA_VERSION = 4;

const DROP_SQL = `
DROP TABLE IF EXISTS metric_kinds;
DROP TABLE IF EXISTS metrics;
DROP TABLE IF EXISTS achievements;
DROP TABLE IF EXISTS anchor_firings;
DROP TABLE IF EXISTS nodes;
DROP TABLE IF EXISTS chains;
DROP TABLE IF EXISTS anchors;
DROP TABLE IF EXISTS actions;
`;

// ADR-0027: schema migration を ALTER ベースに切替 (v4 → 以降)。
// v4 までは drop+recreate (= ADR-0016 / K-021 試作期間方針)、 v5 以降は MIGRATIONS の
// 段階関数を順に実行してデータ保全。 将来 schema 変更時はここに step を追加する。
//
// 例:
//   5: async (client) => { await client.exec(`ALTER TABLE actions ADD COLUMN xxx TEXT`); },
//
// 各 step は **冪等にしない** (= user_version で 1 度だけ実行される前提)。
// 列削除 / 型変更が必要になったら、 SQLite の制約から「テーブルコピー方式」を採用 (= 新テーブル
// 作成 → INSERT SELECT → 旧 drop → ALTER RENAME)。 1 トランザクション内に閉じる責務を
// コメントで明示 (K-022 同型)。
type Migration = (client: DbClient) => Promise<void>;
// export しているのはテスト経由で MIGRATIONS step の発火を検証するため。
// production code から直接書き換える用途ではない (= 将来 SCHEMA_VERSION bump 時に
// 本ファイル内で step を追加するのが正規ルート)。
export const MIGRATIONS: Record<number, Migration> = {
  // 将来の SCHEMA_VERSION bump 時にここに追加
};

// schema 構築済み状態 (= ADR-0026 PR-CC で確定した v4) の番号。
// これ未満なら drop+recreate (= legacy 試作期間)、 これ以上は MIGRATIONS で段階的 ALTER。
const LEGACY_FALLBACK_VERSION = 4;

export const initSchema = async (client: DbClient): Promise<void> => {
  const rows = await client.all<{ user_version: number }>(`PRAGMA user_version`);
  const current = rows[0]?.user_version ?? 0;

  if (current === 0) {
    // 初回起動: 最新 schema を構築 + builtin seed
    await client.exec(SCHEMA_SQL);
    await client.exec(BUILTIN_METRIC_KINDS_SEED_SQL);
    await client.exec(`PRAGMA user_version = ${SCHEMA_VERSION};`);
    return;
  }

  if (current < LEGACY_FALLBACK_VERSION) {
    // legacy 試作期間 (v1-v3): drop+recreate でデータ消失受容 (ADR-0016 / K-021)。
    // この経路は「PR-CC マージ前から起動していたユーザー」のみ通過、
    // 通過後は v4 = ALTER ベース migration の対象になる。
    await client.exec(DROP_SQL);
    await client.exec(SCHEMA_SQL);
    await client.exec(BUILTIN_METRIC_KINDS_SEED_SQL);
    await client.exec(`PRAGMA user_version = ${SCHEMA_VERSION};`);
    return;
  }

  // v4 以降 (= 検証期間以降): ALTER ベース migration でデータ保全 (ADR-0027)。
  // current = LEGACY_FALLBACK_VERSION の場合は MIGRATIONS が空ならループも回らず、
  // **完全に noop** (= データ保全の保証)。
  //
  // safety net としての SCHEMA_SQL 実行は意図的に**入れない**: K-021 の罠
  // (= CREATE TABLE IF NOT EXISTS で新 schema が反映されない) を再導入する素地になる。
  // テーブル欠損は MIGRATIONS step で明示的に書く責務 (= 「SCHEMA_SQL と MIGRATIONS の
  // 二重 truth source」を作らない)。
  for (let v = current + 1; v <= SCHEMA_VERSION; v++) {
    const migration = MIGRATIONS[v];
    if (migration) {
      await migration(client);
    }
    await client.exec(`PRAGMA user_version = ${v};`);
  }
};

// PR-CC (ADR-0026): builtin メトリクス種別の DB seed SQL。
// 初回起動 + legacy fallback drop+recreate のときだけ走る。 INSERT OR IGNORE で key 衝突回避。
// key 維持 (weight / exercise_minutes / sleep_hours) で Notion 連携 (PR-Z3b) 互換性確保。
const BUILTIN_METRIC_KINDS_SEED_SQL = `
INSERT OR IGNORE INTO metric_kinds (id, key, label, unit, order_index, is_builtin) VALUES
  ('metric-kind-weight', 'weight', '体重', 'kg', 0, 1),
  ('metric-kind-exercise-minutes', 'exercise_minutes', '運動', '分', 1, 1),
  ('metric-kind-sleep-hours', 'sleep_hours', '睡眠', '時間', 2, 1);
`;
