// #69 (ADR-0030): v0 catalog の seed。initSchema 末尾で毎起動投入 (INSERT OR IGNORE で冪等)。
// catalogSeed → repository → (db の型のみ) なので実行時循環なし (型 import は erase される)。
// initSchema が全 seed (metric_kinds / app_settings / catalog) を担う一貫性を保つ。
// ADR-0039 (#154) / ADR-0040 (#160): カタログ seed は新カテゴリモデルのみ
// (旧 module/link カタログ seedCatalog は撤去)。
import { seedCategoryCatalog } from './categoryCatalogSeed';

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
  -- #73 (SPEC §6): ON/OFF = 一時停止。1 = 通常 (Today に出る) / 0 = 停止 (チェーンから
  -- 外すが残す)。「停止」と「削除/外す」を 2 系統に分ける (= 停止は非破壊・可逆)。
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
  UNIQUE(chain_id, order_index)
);

CREATE TABLE IF NOT EXISTS achievements (
  node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  achieved INTEGER NOT NULL CHECK(achieved IN (0, 1)),
  PRIMARY KEY (node_id, date)
);

-- ADR-0039 (#154): 新カタログモデル (module 廃止 → カテゴリ2型)。
-- ADR-0040 (#160): 旧 modules / links テーブルは撤去済み (編集 UI も新カテゴリ非依存に簡素化)。
-- type: 'genre' (ジャンル別・個別アクション束) / 'recommended' (朝/夜の完成ルーティン束)。
-- moment は持たない (採用後にチェーン側で決まる、ADR-0039)。採用前メタ (default_on) は
-- catalog_actions が持ち live に混入させない (ADR-0001 維持 / K-002 / K-030)。
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('genre', 'recommended')),
  color TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('official', 'user')),
  order_index INTEGER NOT NULL
);

-- ジャンル別カテゴリ内の個別アクション (採用単位)。各アクションは 1 つの genre カテゴリに
-- 属す (一意)。category_id NOT NULL + FK→categories (orphan 物理禁止)。
-- default_on: 採用時の既定 ON (●=1 / 「(任意)」=0、「初期全選択」の既定集合判定)。
-- position: カテゴリ内の表示順。timer_seconds: NULL = タイマーなし (actions と同型)。
CREATE TABLE IF NOT EXISTS catalog_actions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  default_on INTEGER NOT NULL CHECK(default_on IN (0, 1)),
  position INTEGER NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('official', 'user')),
  timer_seconds INTEGER
);

-- おすすめカテゴリの順序つきアイテム。genre アクションを順序つきで重複参照する
-- (同じ action_id を複数カテゴリ / 同カテゴリ内で参照可、ADR-0039 の「重複参照 OK」)。
-- category_id → recommended カテゴリ、action_id → genre アクション (どちらも CASCADE)。
CREATE TABLE IF NOT EXISTS recommended_items (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  action_id TEXT NOT NULL REFERENCES catalog_actions(id) ON DELETE CASCADE,
  position INTEGER NOT NULL
);

-- ADR-0012: アンカー発火イベント。1 日 1 回の不可逆事実。
-- 時刻/場所共通。発火 record があれば「今日発火済み」扱い (Today の発火中ピル表示)。
-- ADR-0055 (#301): source = その発火をどちらの経路が観測したか。
-- 経路が残らないと「通知が来ない」の切り分け (ジオフェンスが壊れているのか、
-- 前景判定が先に書いただけなのか) ができない。
--
-- ⚠ DEFAULT 'foreground' は MIGRATIONS[19] と **値を一致させる**ために必要
-- (K-021 の二重 truth source)。ALTER TABLE ADD COLUMN に NOT NULL を付けるには
-- DEFAULT が必須 (K-034) なので migration 側からは外せない。ここに付けないと
-- 「既存ユーザーは source 省略の INSERT が黙って通り、新規ユーザーは NOT NULL 違反で
-- 落ちる」というユーザー母集団で割れる乖離になる (K-018 同型・より気付きにくい)。
-- 渡し忘れは DEFAULT ではなく **AnchorFiring 型の必須フィールド**で止める。
CREATE TABLE IF NOT EXISTS anchor_firings (
  anchor_id TEXT NOT NULL REFERENCES anchors(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'foreground' CHECK(source IN ('foreground', 'geofence')),
  PRIMARY KEY (anchor_id, date)
);

-- ADR-0024 (PR-Z3a): メトリクス (体重 / 運動時間 / 睡眠時間 等)。
-- 観測した事実として保存。 チェーン / アクション / ノードへの外部キーは持たない (疎結合)。
-- 派生値 (移動平均 / 達成率) は保存しない (ADR-0001 維持、 表示時派生計算)。
-- source: 'manual' (手入力) のみが現行。
-- 'notion' は ADR-0052 で Notion 連携を撤去した後も CHECK 制約に残している:
-- (1) 制約から外すには table-copy migration (ADR-0027) が必要で、開発中に入った
--     source='notion' の既存行があると移行が壊れる、(2) 値が使われないだけで害が無い。
-- 新規に 'notion' が書かれることは無い (書き手が存在しない)。
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

-- ADR-0028: アプリ全体の設定 (singleton 行)。 ユーザーが「正準データ軸」とは
-- 別の「app 動作設定軸」を保持する場所。 id = 'singleton' で 1 行固定。
-- 将来の設定追加は ALTER TABLE app_settings ADD COLUMN ... で対応 (ADR-0027)。
-- ADR-0029 (Issue #53): theme_mode 追加。 'auto' (OS の colorScheme に追従) / 'light' / 'dark' の 3 値。
-- #72 (SPEC §5): onboarding_completed。初回ルート (onboarding) を通したか。
--   新規ユーザーは 0 (= 初回起動で onboarding へ誘導)。既存ユーザーは MIGRATIONS[8] で
--   1 にセット (= 既にチェーンを持っているので onboarding を出さない、別軸の app 動作設定)。
-- #165 (ADR-0042 P1): checklist_dismissed_at。立ち上げチェックリストをユーザーが閉じた時刻
--   (ISO8601 文字列、NULL = 未 dismiss)。一度閉じたら戻らない静かな UX (ADR-0042 §5論点2)。
-- #165: checklist_added_action。立ち上げチェックリストの「アクションを 1 つ追加した」
--   マイルストーン。編集画面でアクションを追加保存したら 1 (one-way、戻さない = 失われない指標)。
--   新規ユーザーは 0、既存ユーザーは MIGRATIONS[13] で 1 (= すでにカスタムしている前提)。
CREATE TABLE IF NOT EXISTS app_settings (
  id TEXT PRIMARY KEY,
  reset_time TEXT NOT NULL DEFAULT '00:00',
  theme_mode TEXT NOT NULL DEFAULT 'auto' CHECK(theme_mode IN ('auto', 'light', 'dark')),
  onboarding_completed INTEGER NOT NULL DEFAULT 0 CHECK(onboarding_completed IN (0, 1)),
  checklist_dismissed_at TEXT DEFAULT NULL,
  checklist_added_action INTEGER NOT NULL DEFAULT 0 CHECK(checklist_added_action IN (0, 1))
);

-- ADR-0044 (#181): 手動メモ。ユーザーが書いた「観測した事実」軸 (派生値ではない、
-- ADR-0012 anchor_firings / ADR-0024 metrics と同型の別軸)。
-- node_id: 紐付け先ノード。NULL = 汎用メモ (= チェーン/アクション未選択で書いたメモ)。
-- ON DELETE SET NULL: ノード (やチェーン経由 CASCADE) 削除時もメモ本文は残し node_id だけ
--   外す (= 汎用メモに格下げ)。ユーザーが書いた記録を勝手に消さない (Augmentation 原則)。
-- created_at / updated_at: ISO-like (秒精度、metrics.recorded_at と同フォーマット)。
-- 派生値カラムは持たない (ADR-0001 維持)。表示時の chain/action 解決は派生で引く。
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  node_id TEXT REFERENCES nodes(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- ADR-0047: 定着取り下げ。ユーザーが「最近やれてない」と感じたときに定着を取り下げる
-- 観測した事実軸 (派生値ではない、ADR-0012 anchor_firings / ADR-0044 notes と同型)。
-- 1 ノードが生涯で複数回 取り下げ↔再定着しうるため PRIMARY KEY (node_id, retracted_at)。
-- 定着ステータス自体は保存しない (派生・latch)。保存するのは取り下げ事実のみ (ADR-0001 維持)。
-- retracted_at: ISO-like (秒精度)。ON DELETE CASCADE: ノード削除で取り下げ事実も無意味 =
--   一緒に消す (achievements / anchor_firings と同型、notes の SET NULL とは別: 本文がない)。
CREATE TABLE IF NOT EXISTS settlement_retractions (
  node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  retracted_at TEXT NOT NULL,
  PRIMARY KEY (node_id, retracted_at)
);

CREATE INDEX IF NOT EXISTS idx_nodes_chain_order ON nodes(chain_id, order_index);
CREATE INDEX IF NOT EXISTS idx_notes_node ON notes(node_id);
CREATE INDEX IF NOT EXISTS idx_notes_created ON notes(created_at);
CREATE INDEX IF NOT EXISTS idx_settlement_retractions_node ON settlement_retractions(node_id);
CREATE INDEX IF NOT EXISTS idx_achievements_date ON achievements(date);
CREATE INDEX IF NOT EXISTS idx_anchor_firings_date ON anchor_firings(date);
CREATE INDEX IF NOT EXISTS idx_metrics_key_date ON metrics(metric_key, recorded_at);
CREATE INDEX IF NOT EXISTS idx_metric_kinds_order ON metric_kinds(order_index);
CREATE INDEX IF NOT EXISTS idx_categories_order ON categories(order_index);
CREATE INDEX IF NOT EXISTS idx_catalog_actions_category ON catalog_actions(category_id, position);
CREATE INDEX IF NOT EXISTS idx_recommended_items_category ON recommended_items(category_id, position);
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
export const SCHEMA_VERSION = 19;

const DROP_SQL = `
DROP TABLE IF EXISTS settlement_retractions;
DROP TABLE IF EXISTS notes;
DROP TABLE IF EXISTS recommended_items;
DROP TABLE IF EXISTS catalog_actions;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS app_settings;
DROP TABLE IF EXISTS metric_kinds;
DROP TABLE IF EXISTS metrics;
DROP TABLE IF EXISTS achievements;
DROP TABLE IF EXISTS anchor_firings;
DROP TABLE IF EXISTS links;
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
  // ADR-0028 (PR-DD): app_settings テーブル追加 + singleton 行 seed。
  // v4 (PR-CC) からのアップグレードユーザー向け。 新規ユーザーは SCHEMA_SQL +
  // APP_SETTINGS_SEED_SQL で同じ状態が初回起動で作られる (= 二重 truth source 回避は
  // INSERT OR IGNORE で吸収)。
  5: async (client) => {
    await client.exec(`
      CREATE TABLE IF NOT EXISTS app_settings (
        id TEXT PRIMARY KEY,
        reset_time TEXT NOT NULL DEFAULT '00:00'
      );
    `);
    await client.exec(APP_SETTINGS_SEED_SQL);
  },
  // ADR-0029 (Issue #53): app_settings に theme_mode 列を追加。 既存 row は
  // DEFAULT 'auto' が ALTER TABLE で適用される (= 既存ユーザーは Auto に初期化)。
  // CHECK 制約は ALTER TABLE ADD COLUMN では SQLite の制約上後付け不可なため
  // 列宣言に含める。 SCHEMA_SQL 側も同じ CHECK を持つので、 新規ユーザー / 既存
  // ユーザーで列定義が一致する (= 二重 truth source は値で一致を担保)。
  6: async (client) => {
    await client.exec(
      `ALTER TABLE app_settings ADD COLUMN theme_mode TEXT NOT NULL DEFAULT 'auto' CHECK(theme_mode IN ('auto', 'light', 'dark'));`,
    );
  },
  // ADR-0030 (#68): テンプレ catalog (modules / links) 新設 + nodes.module_id 追加。
  // 既存ユーザー (v6) のチェーン / ノードは ALTER ADD COLUMN で保全され、
  // 既存ノードは module_id=NULL (テンプレ未経由) になる。
  // SCHEMA_SQL 側にも同じ定義を持たせ、新規ユーザー / 既存ユーザーで列定義を一致させる
  // (= MIGRATIONS[5]/[6] と同じ二重 truth source は値で一致を担保するパターン)。
  // catalog の v0 seed 投入は #69 の責務 (本 step ではテーブル作成のみ)。
  7: async (client) => {
    await client.exec(`
      CREATE TABLE IF NOT EXISTS modules (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        moment_json TEXT NOT NULL,
        goal_json TEXT NOT NULL,
        source TEXT NOT NULL CHECK(source IN ('official', 'user')),
        kind TEXT NOT NULL CHECK(kind IN ('normal', 'custom')),
        order_index INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS links (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
        default_on INTEGER NOT NULL CHECK(default_on IN (0, 1)),
        position INTEGER NOT NULL,
        source TEXT NOT NULL CHECK(source IN ('official', 'user')),
        timer_seconds INTEGER,
        starter INTEGER NOT NULL CHECK(starter IN (0, 1))
      );
      CREATE INDEX IF NOT EXISTS idx_links_module ON links(module_id, position);
      CREATE INDEX IF NOT EXISTS idx_modules_order ON modules(order_index);
    `);
    // SQLite 制約: ALTER ADD COLUMN で REFERENCES 付きカラムを足すには明示的な
    // DEFAULT NULL が必要 (省略すると「non-NULL default の REFERENCES 列は追加不可」で
    // reject される)。SCHEMA_SQL 側 (新規ユーザー) は CREATE 時定義なので DEFAULT 不要。
    await client.exec(
      `ALTER TABLE nodes ADD COLUMN module_id TEXT REFERENCES modules(id) DEFAULT NULL;`,
    );
  },
  // #72 (SPEC §5): app_settings に onboarding_completed 列を追加。
  // ALTER の DEFAULT 0 で既存 row も一旦 0 になるが、続けて UPDATE で 1 にセットする
  // (= 既存ユーザーは既にチェーンを持っており onboarding は不要)。新規ユーザーは
  // initSchema の current===0 経路で SCHEMA_SQL の DEFAULT 0 のまま = onboarding へ誘導。
  // CHECK 制約は ALTER ADD COLUMN では後付け不可なため列宣言に含める (MIGRATIONS[6] と同型)。
  8: async (client) => {
    await client.exec(
      `ALTER TABLE app_settings ADD COLUMN onboarding_completed INTEGER NOT NULL DEFAULT 0 CHECK(onboarding_completed IN (0, 1));`,
    );
    await client.exec(`UPDATE app_settings SET onboarding_completed = 1;`);
  },
  // #73 (SPEC §6): nodes に active 列 (ON/OFF = 一時停止) を追加。
  // 既存ノードは DEFAULT 1 (= 通常表示) で保全される。CHECK は ALTER で後付け不可なため
  // 列宣言に含める (MIGRATIONS[6]/[8] と同型)。
  9: async (client) => {
    await client.exec(
      `ALTER TABLE nodes ADD COLUMN active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1));`,
    );
  },
  // ADR-0039 (#154): 新カタログモデル (categories / catalog_actions / recommended_items)
  // を新設。旧 modules/links と並行追加 (consumer 移行は別トラック)。既存ユーザー (v9) の
  // チェーン / ノード / 旧 catalog はそのまま保全 (新テーブル CREATE のみで ALTER なし)。
  // SCHEMA_SQL 側にも同じ定義を持たせ、新規 / 既存ユーザーで列定義を一致させる
  // (= MIGRATIONS[5]/[6]/[7] と同じ二重 truth source は値で一致を担保するパターン)。
  // v0 カテゴリ seed 投入は initSchema 末尾の seedCategoryCatalog (本 step ではテーブル作成のみ)。
  10: async (client) => {
    await client.exec(`
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('genre', 'recommended')),
        color TEXT NOT NULL,
        source TEXT NOT NULL CHECK(source IN ('official', 'user')),
        order_index INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS catalog_actions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
        default_on INTEGER NOT NULL CHECK(default_on IN (0, 1)),
        position INTEGER NOT NULL,
        source TEXT NOT NULL CHECK(source IN ('official', 'user')),
        timer_seconds INTEGER
      );
      CREATE TABLE IF NOT EXISTS recommended_items (
        id TEXT PRIMARY KEY,
        category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
        action_id TEXT NOT NULL REFERENCES catalog_actions(id) ON DELETE CASCADE,
        position INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_categories_order ON categories(order_index);
      CREATE INDEX IF NOT EXISTS idx_catalog_actions_category ON catalog_actions(category_id, position);
      CREATE INDEX IF NOT EXISTS idx_recommended_items_category ON recommended_items(category_id, position);
    `);
  },
  // ADR-0040 (#160): 旧 module/link モデルを撤去。
  // (a) nodes.module_id 列を削除。FK 列 (REFERENCES modules) は DROP COLUMN 不可なため
  //     SQLite 公式の table-copy 手順 (新テーブル作成 → INSERT SELECT → drop → rename)。
  //     achievements.node_id (CASCADE) / nodes.chain_id (CASCADE) の関係は id を保つことで
  //     名前ベースに維持される。foreign_keys=OFF + 単一 TX で原子的に行う (K-018 / K-021)。
  // (b) links → modules の順で drop (links.module_id FK→modules を先に消す)。
  11: async (client) => {
    await client.exec(`PRAGMA foreign_keys=OFF;`);
    await client.exec(`
      BEGIN;
      CREATE TABLE nodes_new (
        id TEXT PRIMARY KEY,
        chain_id TEXT NOT NULL REFERENCES chains(id) ON DELETE CASCADE,
        order_index INTEGER NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('action')),
        action_id TEXT NOT NULL REFERENCES actions(id),
        active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
        UNIQUE(chain_id, order_index)
      );
      INSERT INTO nodes_new (id, chain_id, order_index, kind, action_id, active)
        SELECT id, chain_id, order_index, kind, action_id, active FROM nodes;
      DROP TABLE nodes;
      ALTER TABLE nodes_new RENAME TO nodes;
      CREATE INDEX IF NOT EXISTS idx_nodes_chain_order ON nodes(chain_id, order_index);
      DROP TABLE IF EXISTS links;
      DROP TABLE IF EXISTS modules;
      COMMIT;
    `);
    await client.exec(`PRAGMA foreign_keys=ON;`);
  },
  // #165 (ADR-0042 P1): 立ち上げチェックリストの dismiss 時刻を app_settings に追加。
  // DEFAULT NULL 明示 (= 既存ユーザーは未 dismiss = チェックリスト表示対象)。
  12: async (client) => {
    await client.exec(
      `ALTER TABLE app_settings ADD COLUMN checklist_dismissed_at TEXT DEFAULT NULL;`,
    );
  },
  // #165 (ADR-0042 P1): 「アクションを 1 つ追加した」マイルストーン用の列を追加。
  // 既存ユーザーは UPDATE で 1 に backfill (= すでにカスタム済みとみなしチェックリストを
  // 再出現させない、MIGRATIONS[8] の onboarding_completed と同じ手法)。新規ユーザーは
  // SCHEMA_SQL の DEFAULT 0 で始まる (= 未追加)。
  13: async (client) => {
    await client.exec(
      `ALTER TABLE app_settings ADD COLUMN checklist_added_action INTEGER NOT NULL DEFAULT 0 CHECK(checklist_added_action IN (0, 1));`,
    );
    await client.exec(`UPDATE app_settings SET checklist_added_action = 1;`);
  },
  // ADR-0044 (#181): 手動メモ用 notes テーブルを新設 (新規テーブル CREATE のみ、 既存
  // データへの ALTER なし)。既存ユーザー (v13) のチェーン / ノード / 達成記録は無影響。
  // SCHEMA_SQL 側にも同じ定義を持たせ、新規 / 既存ユーザーで列定義を一致させる
  // (= MIGRATIONS[5]/[6]/[7]/[10] と同じ二重 truth source は値で一致を担保するパターン)。
  14: async (client) => {
    await client.exec(`
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        node_id TEXT REFERENCES nodes(id) ON DELETE SET NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_notes_node ON notes(node_id);
      CREATE INDEX IF NOT EXISTS idx_notes_created ON notes(created_at);
    `);
  },
  // #196 (テンプレアクション文法統一 / #192): catalog_actions.title を「1 動作性名詞」
  // ルールに寄せてリネームする。seedCatalogAction は INSERT OR IGNORE のため、既存 DB
  // (Taku 本人のローカル含む) では seed 経由で title が更新されない。ID 不変・title のみ
  // UPDATE で追随させる (live 側 nodes.title は分離済 = 無影響 / ADR-0039)。
  // categoryCatalogSeed.ts の新 title と 1:1 で一致させること。UPDATE ... WHERE id は
  // 再実行安全 (冪等)。
  15: async (client) => {
    const renames: [string, string][] = [
      ['act-weigh', '体重測定'],
      ['act-drink-protein', 'プロテイン摂取'],
      ['act-style-hair', 'ヘアセット'],
      ['act-dry-hair', 'ヘアドライ'],
      ['act-put-away-dishes', '食器収納'],
      ['act-fold-laundry', '洗濯物たたみ'],
      ['act-todo-today', '予定整理'],
      ['act-online-course', 'オンライン学習'],
      ['act-review-notes', 'ノート復習'],
    ];
    for (const [id, title] of renames) {
      await client.run(`UPDATE catalog_actions SET title = ? WHERE id = ?`, [
        title,
        id,
      ]);
    }
  },
  // #201 (テンプレ重複解消): cat-exercise で act-light-walk「軽い散歩」が act-walking
  // 「ウォーキング」と重複し両方 defaultOn だった。ウォーキングに一本化するため
  // act-light-walk をカタログから撤去する。seed は DELETE しないので既存 DB (Taku
  // ローカル含む) からも DELETE で撤去する。recommended_items から参照されていないため
  // 後始末不要。live 側 nodes は actions テーブル参照で catalog_actions と別 = 無影響
  // (ADR-0039)。存在しない行の DELETE は no-op なので再実行安全 (冪等)。
  16: async (client) => {
    await client.run(`DELETE FROM catalog_actions WHERE id = ?`, [
      'act-light-walk',
    ]);
  },
  // ADR-0047: 定着取り下げ用 settlement_retractions テーブルを新設 (新規テーブル CREATE のみ、
  // 既存データ無変更 = 非破壊)。定着ライフサイクル再設計で「取り下げ」を観測事実軸として保存する。
  17: async (client) => {
    await client.exec(`
      CREATE TABLE IF NOT EXISTS settlement_retractions (
        node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
        retracted_at TEXT NOT NULL,
        PRIMARY KEY (node_id, retracted_at)
      );
      CREATE INDEX IF NOT EXISTS idx_settlement_retractions_node ON settlement_retractions(node_id);
    `);
  },
  // #292: chains.created_at のタイムゾーン統一。
  //
  // 書き込み経路が 3 つあり、`chainEditPersist.ts` (手動作成) はローカル壁時計、
  // `app/discover.tsx` / `app/onboarding.tsx` (テンプレ採用 / onboarding) は
  // `new Date().toISOString()` = UTC を書いていた。同じカラムに 2 つの規約が入るため、
  // `sortChainsForDisplay` (domain.ts) と `ORDER BY created_at` (listChains) の
  // 並び順が JST で 9 時間ずれる。#292 で書き込み側は揃えたが、**壊れる原因は
  // 「UTC だから」ではなく「混在しているから」**なので、既存行も 1 度だけ揃える。
  //
  // ⚠ `WHERE created_at LIKE '%Z'` は飾りではない: この変換をローカル値に当てると
  // JST では +9h して壊れる。変換後の行は Z を持たないので、再実行しても no-op。
  //
  // ⚠ `strftime` は解釈できない入力に NULL を返す。created_at は NOT NULL なので
  // そのまま UPDATE すると migration ごと落ちて**起動不能**になる。壊れた値は
  // 変換対象から外して残す (ADR-0073: 「取れなかった」を安全側に倒す)。
  18: async (client) => {
    await client.exec(`
      UPDATE chains
         SET created_at = strftime('%Y-%m-%dT%H:%M:%S', created_at, 'localtime')
       WHERE created_at LIKE '%Z'
         AND strftime('%Y-%m-%dT%H:%M:%S', created_at, 'localtime') IS NOT NULL;
    `);
  },
  // ADR-0055 (#301): anchor_firings に観測経路を追加。
  //
  // 既存行は 'foreground' で埋める。#301 以前はジオフェンス経路が存在しなかったので、
  // これは **デフォルト値による埋め合わせではなく事実の確定**。
  //
  // ⚠ K-034: ALTER TABLE ADD COLUMN に NOT NULL を付けるには DEFAULT が必須。
  // ここでは既存行を埋める目的も兼ねる。新規作成側 (SCHEMA_SQL) には DEFAULT を
  // 置かない — 呼び出し側に必ず渡させるため (二重 truth source の値は CHECK 制約で一致)。
  19: async (client) => {
    await client.exec(
      `ALTER TABLE anchor_firings ADD COLUMN source TEXT NOT NULL DEFAULT 'foreground' CHECK(source IN ('foreground', 'geofence'));`,
    );
  },
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
    await client.exec(APP_SETTINGS_SEED_SQL);
    await client.exec(`PRAGMA user_version = ${SCHEMA_VERSION};`);
  } else if (current < LEGACY_FALLBACK_VERSION) {
    // legacy 試作期間 (v1-v3): drop+recreate でデータ消失受容 (ADR-0016 / K-021)。
    // この経路は「PR-CC マージ前から起動していたユーザー」のみ通過、
    // 通過後は v4 = ALTER ベース migration の対象になる。
    await client.exec(DROP_SQL);
    await client.exec(SCHEMA_SQL);
    await client.exec(BUILTIN_METRIC_KINDS_SEED_SQL);
    await client.exec(APP_SETTINGS_SEED_SQL);
    await client.exec(`PRAGMA user_version = ${SCHEMA_VERSION};`);
  } else {
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
  }

  // ADR-0039 (#154): v0 カテゴリカタログを全経路の最後で投入。INSERT OR IGNORE で冪等なので
  // 毎起動・全経路 (初回 / legacy fallback / ALTER) で安全。この時点で categories /
  // catalog_actions / recommended_items は全経路で存在する (初回・legacy は SCHEMA_SQL、
  // ALTER 経路は MIGRATIONS[10] が作成済み)。
  await seedCategoryCatalog(client);
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

// ADR-0028 (PR-DD): app_settings singleton 行の seed SQL。
// 初回起動 + legacy fallback drop+recreate + MIGRATIONS[5] のいずれの経路でも、
// INSERT OR IGNORE で 'singleton' 行が存在することを保証する (= 二重実行安全)。
const APP_SETTINGS_SEED_SQL = `
INSERT OR IGNORE INTO app_settings (id, reset_time) VALUES ('singleton', '00:00');
`;
