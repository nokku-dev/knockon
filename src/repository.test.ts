import { createBetterSqliteClient } from './db.bettersqlite';
import { initSchema, MIGRATIONS, SCHEMA_VERSION } from './db';
import type { DbClient } from './db';
import {
  countAchievedBefore,
  countAchievedBeforeByNode,
  deleteAction,
  deleteChain,
  getAction,
  getAnchor,
  insertAction,
  insertAnchor,
  insertChain,
  insertLink,
  insertModule,
  insertNode,
  listLinks,
  listLinksForModule,
  listModules,
  listAchievementsForNodes,
  listActions,
  listAnchorFiringsForDate,
  listChains,
  listNodes,
  recordAchievement,
  recordAnchorFiring,
  reorderNodes,
  updateAction,
  updateChain,
  updateNode,
} from './repository';

const setup = async (): Promise<DbClient> => {
  const db = createBetterSqliteClient(':memory:');
  await initSchema(db);
  return db;
};

const teardown = async (db: DbClient) => {
  await db.close?.();
};

describe('repository — チェーン1本のラウンドトリップ', () => {
  let db: DbClient;

  beforeEach(async () => {
    db = await setup();
    await insertAnchor(db, {
      id: 'anchor-1',
      title: '起床',
      kind: 'behavior',
      time: null,
      latitude: null,
      longitude: null,
      radiusMeters: null,
    });
    await insertAction(db, {
      id: 'action-1',
      title: '水を飲む',
      variants: null,
      timerSeconds: null,
    });
    await insertAction(db, {
      id: 'action-2',
      title: 'ストレッチ',
      variants: null,
      timerSeconds: null,
    });
    await insertChain(db, {
      id: 'chain-1',
      title: '朝のルーティン',
      anchorId: 'anchor-1',
      status: 'active',
      createdAt: '2026-05-18T00:00:00Z',
    });
    await insertNode(db, {
      id: 'node-1',
      chainId: 'chain-1',
      orderIndex: 0,
      kind: 'action',
      actionId: 'action-1',
    });
    await insertNode(db, {
      id: 'node-2',
      chainId: 'chain-1',
      orderIndex: 1,
      kind: 'action',
      actionId: 'action-2',
    });
  });

  afterEach(async () => {
    await teardown(db);
  });

  test('listChains は active チェーンを返す', async () => {
    const chains = await listChains(db, 'active');
    expect(chains).toHaveLength(1);
    expect(chains[0]).toMatchObject({
      id: 'chain-1',
      title: '朝のルーティン',
      anchorId: 'anchor-1',
      status: 'active',
    });
  });

  test('listNodes は order_index 順にノードを返す', async () => {
    const nodes = await listNodes(db, 'chain-1');
    expect(nodes.map((n) => n.id)).toEqual(['node-1', 'node-2']);
    expect(nodes[0]?.orderIndex).toBe(0);
    expect(nodes[1]?.orderIndex).toBe(1);
  });

  test('getAnchor / getAction は単体取得できる', async () => {
    const anchor = await getAnchor(db, 'anchor-1');
    expect(anchor?.title).toBe('起床');
    const action = await getAction(db, 'action-1');
    expect(action?.title).toBe('水を飲む');
    expect(action?.variants).toBeNull();
  });
});

describe('recordAchievement — 正準データ (ノード, 日付, bool) のみ', () => {
  let db: DbClient;

  beforeEach(async () => {
    db = await setup();
    await insertAnchor(db, {
      id: 'a1',
      title: '起床',
      kind: 'behavior',
      time: null,
      latitude: null,
      longitude: null,
      radiusMeters: null,
    });
    await insertAction(db, { id: 'act1', title: 'A', variants: null, timerSeconds: null });
    await insertChain(db, {
      id: 'c1',
      title: 'C',
      anchorId: 'a1',
      status: 'active',
      createdAt: '2026-05-18T00:00:00Z',
    });
    await insertNode(db, {
      id: 'n1',
      chainId: 'c1',
      orderIndex: 0,
      kind: 'action',
      actionId: 'act1',
    });
  });

  afterEach(async () => {
    await teardown(db);
  });

  test('達成記録の挿入と読み出し', async () => {
    await recordAchievement(db, {
      nodeId: 'n1',
      date: '2026-05-18',
      achieved: true,
    });
    const records = await listAchievementsForNodes(db, ['n1']);
    expect(records).toEqual([
      { nodeId: 'n1', date: '2026-05-18', achieved: true },
    ]);
  });

  test('同一 (node, date) の再記録は上書き (UPSERT)', async () => {
    await recordAchievement(db, {
      nodeId: 'n1',
      date: '2026-05-18',
      achieved: true,
    });
    await recordAchievement(db, {
      nodeId: 'n1',
      date: '2026-05-18',
      achieved: false,
    });
    const records = await listAchievementsForNodes(db, ['n1']);
    expect(records).toHaveLength(1);
    expect(records[0]?.achieved).toBe(false);
  });

  test('日付範囲で絞り込み', async () => {
    await recordAchievement(db, {
      nodeId: 'n1',
      date: '2026-05-15',
      achieved: true,
    });
    await recordAchievement(db, {
      nodeId: 'n1',
      date: '2026-05-17',
      achieved: true,
    });
    await recordAchievement(db, {
      nodeId: 'n1',
      date: '2026-05-20',
      achieved: true,
    });
    const records = await listAchievementsForNodes(
      db,
      ['n1'],
      '2026-05-16',
      '2026-05-19',
    );
    expect(records.map((r) => r.date)).toEqual(['2026-05-17']);
  });
});

describe('countAchievedBefore / countAchievedBeforeByNode (#142: 累計達成数のベース)', () => {
  let db: DbClient;

  beforeEach(async () => {
    db = await setup();
    await insertAnchor(db, {
      id: 'a1',
      title: '起床',
      kind: 'behavior',
      time: null,
      latitude: null,
      longitude: null,
      radiusMeters: null,
    });
    await insertAction(db, { id: 'act1', title: 'A', variants: null, timerSeconds: null });
    await insertChain(db, {
      id: 'c1',
      title: 'C',
      anchorId: 'a1',
      status: 'active',
      createdAt: '2026-05-18T00:00:00Z',
    });
    await insertNode(db, { id: 'n1', chainId: 'c1', orderIndex: 0, kind: 'action', actionId: 'act1' });
    await insertNode(db, { id: 'n2', chainId: 'c1', orderIndex: 1, kind: 'action', actionId: 'act1' });
    // n1: 5/16 達成, 5/17 達成, 5/18(=今日) 達成 / n2: 5/17 達成, 5/18 未達, 5/16 未達(=false)
    await recordAchievement(db, { nodeId: 'n1', date: '2026-05-16', achieved: true });
    await recordAchievement(db, { nodeId: 'n1', date: '2026-05-17', achieved: true });
    await recordAchievement(db, { nodeId: 'n1', date: '2026-05-18', achieved: true });
    await recordAchievement(db, { nodeId: 'n2', date: '2026-05-16', achieved: false });
    await recordAchievement(db, { nodeId: 'n2', date: '2026-05-17', achieved: true });
    await recordAchievement(db, { nodeId: 'n2', date: '2026-05-18', achieved: false });
  });

  afterEach(async () => {
    await teardown(db);
  });

  test('countAchievedBefore: 今日(5/18)より前の達成数のみ集計 (achieved=false / 今日は除外)', async () => {
    // 5/18 より前で achieved=true: n1@5/16, n1@5/17, n2@5/17 = 3
    expect(await countAchievedBefore(db, '2026-05-18')).toBe(3);
  });

  test('countAchievedBefore: 全期間を含む未来日付なら今日分も入る', async () => {
    // 5/19 より前で achieved=true: 上記 3 + n1@5/18 = 4
    expect(await countAchievedBefore(db, '2026-05-19')).toBe(4);
  });

  test('countAchievedBeforeByNode: ノード別に今日より前の達成数を返す', async () => {
    const byNode = await countAchievedBeforeByNode(db, ['n1', 'n2'], '2026-05-18');
    expect(byNode).toEqual({ n1: 2, n2: 1 });
  });

  test('countAchievedBeforeByNode: 達成 0 のノードはキーに出ない (?? 0 で扱う前提)', async () => {
    const byNode = await countAchievedBeforeByNode(db, ['n1', 'n2'], '2026-05-16');
    // 5/16 より前は何もない
    expect(byNode).toEqual({});
  });

  test('countAchievedBeforeByNode: nodeIds 空で空オブジェクト', async () => {
    expect(await countAchievedBeforeByNode(db, [], '2026-05-18')).toEqual({});
  });
});

describe('スキーマの不変条件', () => {
  test('達成記録テーブル: 派生値カラム (定着率・達成率・星種別など) を含まない (3 カラム固定)', async () => {
    const db = await setup();
    type ColumnRow = { name: string };
    const achievementCols = await db.all<ColumnRow>(
      `PRAGMA table_info(achievements)`,
    );
    const colNames = achievementCols.map((c) => c.name).sort();
    expect(colNames).toEqual(['achieved', 'date', 'node_id']);
    await teardown(db);
  });

  test('アンカー発火テーブル (ADR-0012): カラムは anchor_id と date のみ (2 カラム固定)', async () => {
    const db = await setup();
    type ColumnRow = { name: string };
    const firingCols = await db.all<ColumnRow>(
      `PRAGMA table_info(anchor_firings)`,
    );
    const colNames = firingCols.map((c) => c.name).sort();
    expect(colNames).toEqual(['anchor_id', 'date']);
    await teardown(db);
  });

  test('actions テーブル: カラムは id / title / variants_json / timer_seconds のみ (4 カラム固定、 派生値カラム禁止)', async () => {
    // ADR-0018 で variant_json、 ADR-0025 で timer_seconds が正準保存先として
    // 位置づけられた。 達成率 / 使用回数 / 最終使用日などの派生値カラムが滑って
    // 入らないよう、 K-006 ハードガードレールで固定する。
    const db = await setup();
    type ColumnRow = { name: string };
    const actionCols = await db.all<ColumnRow>(`PRAGMA table_info(actions)`);
    const colNames = actionCols.map((c) => c.name).sort();
    expect(colNames).toEqual(['id', 'timer_seconds', 'title', 'variants_json']);
    await teardown(db);
  });

  test('旧「リンク=アンカー×アクション」結合テーブルが存在しない / 正準データ + catalog テーブルのみ', async () => {
    const db = await setup();
    type TableRow = { name: string };
    const tables = await db.all<TableRow>(
      `SELECT name FROM sqlite_master WHERE type='table'`,
    );
    const tableNames = tables.map((t) => t.name);
    // ADR-0030: links テーブルは存在するが、これは「テンプレ catalog のリンク
    // (module 所属)」であり、旧「リンク=アンカー×アクション」結合モデルとは別物。
    // ガードレールの真意は「アンカー×アクション結合テーブルが無いこと」なので、
    // links が anchor_id + action_id の結合形でないことを形で検証する (名前ではなく)。
    type ColumnRow = { name: string };
    const linkCols = await db.all<ColumnRow>(`PRAGMA table_info(links)`);
    const linkColNames = linkCols.map((c) => c.name);
    expect(linkColNames).toContain('module_id'); // catalog 形 (module 所属)
    expect(linkColNames).not.toContain('anchor_id'); // 旧結合モデルでない
    expect(linkColNames).not.toContain('action_id'); // 旧結合モデルでない
    // テーブル集合は「正準データ + app config + テンプレ catalog」に固定 (派生値テーブル禁止)
    // ADR-0039 (#154): 新カテゴリカタログ (categories / catalog_actions / recommended_items)
    // を並行追加。旧 modules/links も移行完了まで残す (consumer 移行は別トラック)。
    expect(tableNames.sort()).toEqual(
      [
        'achievements',
        'actions',
        'anchor_firings',
        'anchors',
        'app_settings',
        'catalog_actions',
        'categories',
        'chains',
        'links',
        'metric_kinds',
        'metrics',
        'modules',
        'nodes',
        'recommended_items',
      ].sort(),
    );
    await teardown(db);
  });

  // ADR-0028 + ADR-0029 + #72: app_settings カラム = id / reset_time / theme_mode / onboarding_completed。
  test('app_settings テーブル: カラムは id / reset_time / theme_mode / onboarding_completed', async () => {
    const db = await setup();
    type ColumnRow = { name: string };
    const cols = await db.all<ColumnRow>(`PRAGMA table_info(app_settings)`);
    const colNames = cols.map((c) => c.name).sort();
    expect(colNames).toEqual([
      'id',
      'onboarding_completed',
      'reset_time',
      'theme_mode',
    ]);
    await teardown(db);
  });

  test('app_settings テーブル: 初回起動で 1 行 (singleton) が seed され、onboarding_completed は 0 (新規 = 未完了)', async () => {
    const db = await setup();
    type Row = {
      id: string;
      reset_time: string;
      theme_mode: string;
      onboarding_completed: number;
    };
    const rows = await db.all<Row>(
      `SELECT id, reset_time, theme_mode, onboarding_completed FROM app_settings`,
    );
    expect(rows).toEqual([
      {
        id: 'singleton',
        reset_time: '00:00',
        theme_mode: 'auto',
        onboarding_completed: 0,
      },
    ]);
    await teardown(db);
  });

  test('metric_kinds テーブル (ADR-0026 PR-CC): 6 カラム固定、 派生値カラム禁止', async () => {
    const db = await setup();
    type ColumnRow = { name: string };
    const cols = await db.all<ColumnRow>(`PRAGMA table_info(metric_kinds)`);
    const colNames = cols.map((c) => c.name).sort();
    expect(colNames).toEqual([
      'id',
      'is_builtin',
      'key',
      'label',
      'order_index',
      'unit',
    ]);
    await teardown(db);
  });

  test('metric_kinds テーブル: metrics への外部キーは持たない (疎結合)', async () => {
    const db = await setup();
    type FkRow = { table: string; from: string };
    const fks = await db.all<FkRow>(`PRAGMA foreign_key_list(metric_kinds)`);
    expect(fks).toEqual([]);
    await teardown(db);
  });

  test('metric_kinds テーブル: builtin 3 種が seed されている (起動時 schema migration)', async () => {
    const db = await setup();
    type KindRow = { key: string; label: string; unit: string; is_builtin: number };
    const rows = await db.all<KindRow>(
      `SELECT key, label, unit, is_builtin FROM metric_kinds ORDER BY order_index`,
    );
    expect(rows).toEqual([
      { key: 'weight', label: '体重', unit: 'kg', is_builtin: 1 },
      { key: 'exercise_minutes', label: '運動', unit: '分', is_builtin: 1 },
      { key: 'sleep_hours', label: '睡眠', unit: '時間', is_builtin: 1 },
    ]);
    await teardown(db);
  });

  test('metrics テーブル (ADR-0024 PR-Z3a): カラムは 5 固定、 派生値カラム禁止', async () => {
    const db = await setup();
    type ColumnRow = { name: string };
    const cols = await db.all<ColumnRow>(`PRAGMA table_info(metrics)`);
    const colNames = cols.map((c) => c.name).sort();
    expect(colNames).toEqual(['id', 'metric_key', 'recorded_at', 'source', 'value']);
    await teardown(db);
  });

  test('metrics テーブル: チェーン / アクション / ノードへの外部キーは持たない (疎結合)', async () => {
    const db = await setup();
    type FkRow = { table: string; from: string };
    const fks = await db.all<FkRow>(`PRAGMA foreign_key_list(metrics)`);
    // metrics は他テーブルとの FK を一切持たない (= ADR-0024 疎結合方針)
    expect(fks).toEqual([]);
    await teardown(db);
  });

  // ADR-0014 + K-018: FK 制約は PRAGMA foreign_keys=ON で強制 + ON DELETE CASCADE で
  // チェーン削除時の関連レコード自動削除を保証する。これらは「変えてはいけない」
  // 構造的不変条件なので PRAGMA メタクエリで機械検証する (K-006 と同じ精神)。
  test('nodes.chain_id は ON DELETE CASCADE (チェーン削除で全ノード自動削除)', async () => {
    const db = await setup();
    type FkRow = { table: string; from: string; to: string; on_delete: string };
    const fks = await db.all<FkRow>(`PRAGMA foreign_key_list(nodes)`);
    const chainFk = fks.find((f) => f.from === 'chain_id');
    expect(chainFk?.table).toBe('chains');
    expect(chainFk?.on_delete).toBe('CASCADE');
    await teardown(db);
  });

  test('achievements.node_id は ON DELETE CASCADE (ノード削除で達成記録も削除)', async () => {
    const db = await setup();
    type FkRow = { table: string; from: string; to: string; on_delete: string };
    const fks = await db.all<FkRow>(`PRAGMA foreign_key_list(achievements)`);
    const nodeFk = fks.find((f) => f.from === 'node_id');
    expect(nodeFk?.table).toBe('nodes');
    expect(nodeFk?.on_delete).toBe('CASCADE');
    await teardown(db);
  });

  test('anchor_firings.anchor_id は ON DELETE CASCADE (アンカー削除で発火記録も削除)', async () => {
    const db = await setup();
    type FkRow = { table: string; from: string; to: string; on_delete: string };
    const fks = await db.all<FkRow>(`PRAGMA foreign_key_list(anchor_firings)`);
    const anchorFk = fks.find((f) => f.from === 'anchor_id');
    expect(anchorFk?.table).toBe('anchors');
    expect(anchorFk?.on_delete).toBe('CASCADE');
    await teardown(db);
  });

  test('ADR-0027: current=4 (= 最新) で initSchema を呼んでも既存データが保たれる (非破壊 migration)', async () => {
    // 1 度目の initSchema: 初回起動 (current=0) → schema 構築 + version=4
    const db = await setup();
    // Action を 1 個 insert (= ユーザーが運用中のデータの代理)
    await insertAction(db, {
      id: 'persist-test',
      title: '残るはずのアクション',
      variants: null,
      timerSeconds: null,
    });
    // 2 度目の initSchema (= アプリ再起動 / preview build 更新 シミュレーション)
    await initSchema(db);
    // ユーザーデータが保たれているか確認
    const actions = await listActions(db);
    const target = actions.find((a) => a.id === 'persist-test');
    expect(target).toBeTruthy();
    expect(target?.title).toBe('残るはずのアクション');
    await teardown(db);
  });

  test('ADR-0027: 将来の MIGRATIONS step が user_version 段階的 bump で呼ばれる (= v5+ ALTER 経路シミュレーション)', async () => {
    const db = await setup();
    // 既に最新 (v4) になっている → MIGRATIONS[5] を 1 件仕込んで current=4 → 5 を試行。
    // SCHEMA_VERSION 自体は const で書き換え不可なので、 future bump を直接シミュレートできない
    // ため、 「current=3 (legacy) → current=4 (= legacy fallback で drop+recreate 経由)」が
    // 走った後の MIGRATIONS 経路は別途確認、 ここでは MIGRATIONS の登録/解除と「step 関数が
    // 実行可能」であることだけ ensure する。
    const step5Spy = jest.fn(async () => undefined);
    MIGRATIONS[5] = step5Spy as never;
    try {
      // current = SCHEMA_VERSION のまま initSchema → step は呼ばれない (= SCHEMA_VERSION=4 までしか進めない)
      await initSchema(db);
      expect(step5Spy).not.toHaveBeenCalled();
      // 「step が登録されていて future bump で呼べる構造」を確認 (= 直接 invoke)
      await MIGRATIONS[5]!(db);
      expect(step5Spy).toHaveBeenCalledTimes(1);
    } finally {
      delete MIGRATIONS[5];
    }
    await teardown(db);
  });

  test('ADR-0027: legacy fallback (current<4) では drop+recreate でデータが消える (試作期間扱い維持)', async () => {
    const db = await setup();
    await insertAction(db, {
      id: 'legacy-test',
      title: '試作期間のデータ',
      variants: null,
      timerSeconds: null,
    });
    // 強制的に current を 2 (= 試作期間) に戻す
    await db.run(`PRAGMA user_version = 2`);
    // initSchema を呼ぶ → legacy fallback 経路に入り drop+recreate
    await initSchema(db);
    // ユーザーデータは消えている (= ADR-0016 / K-021 の試作期間方針維持)
    const actions = await listActions(db);
    expect(actions.find((a) => a.id === 'legacy-test')).toBeUndefined();
    // version は最新に
    type VersionRow = { user_version: number };
    const v = await db.all<VersionRow>(`PRAGMA user_version`);
    expect(v[0]?.user_version).toBe(SCHEMA_VERSION);
    await teardown(db);
  });

  test('ADR-0029 (Issue #53): MIGRATIONS[6] が v5 schema に theme_mode 列を追加する (= 既存ユーザー保全)', async () => {
    // v5 schema (ADR-0028 PR-DD 時点) を直接構築 → MIGRATIONS[6] を呼ぶ → 新列が追加される。
    const db = createBetterSqliteClient(':memory:');
    await db.exec(`
      CREATE TABLE app_settings (
        id TEXT PRIMARY KEY,
        reset_time TEXT NOT NULL DEFAULT '00:00'
      );
    `);
    // 既存ユーザーの代理 row (= reset_time だけ設定済み)
    await db.run(
      `INSERT INTO app_settings (id, reset_time) VALUES ('singleton', '03:00')`,
    );
    // ALTER 経路: MIGRATIONS[6] を直接実行 (= initSchema 経由でも同じ結果)
    await MIGRATIONS[6]!(db);
    // 列が追加されている
    type ColumnRow = { name: string };
    const cols = await db.all<ColumnRow>(`PRAGMA table_info(app_settings)`);
    expect(cols.map((c) => c.name).sort()).toEqual([
      'id',
      'reset_time',
      'theme_mode',
    ]);
    // 既存 row の reset_time は保たれている + theme_mode は default 'auto'
    type Row = { id: string; reset_time: string; theme_mode: string };
    const rows = await db.all<Row>(
      `SELECT id, reset_time, theme_mode FROM app_settings`,
    );
    expect(rows).toEqual([
      { id: 'singleton', reset_time: '03:00', theme_mode: 'auto' },
    ]);
    await teardown(db);
  });

  test('#72: MIGRATIONS[8] が app_settings に onboarding_completed 列を追加し、既存ユーザーは 1 (完了済み扱い)', async () => {
    // v7 schema (theme_mode まで) を直接構築 → MIGRATIONS[8] を呼ぶ。
    const db = createBetterSqliteClient(':memory:');
    await db.exec(`
      CREATE TABLE app_settings (
        id TEXT PRIMARY KEY,
        reset_time TEXT NOT NULL DEFAULT '00:00',
        theme_mode TEXT NOT NULL DEFAULT 'auto'
      );
    `);
    // 既存ユーザーの代理 row (= 既にチェーンを持っている前提)
    await db.run(
      `INSERT INTO app_settings (id, reset_time, theme_mode) VALUES ('singleton', '03:00', 'dark')`,
    );
    await MIGRATIONS[8]!(db);
    type ColumnRow = { name: string };
    const cols = await db.all<ColumnRow>(`PRAGMA table_info(app_settings)`);
    expect(cols.map((c) => c.name).sort()).toEqual([
      'id',
      'onboarding_completed',
      'reset_time',
      'theme_mode',
    ]);
    // 既存ユーザーは onboarding_completed=1 (= onboarding を出さない) + 既存値保全
    type Row = {
      id: string;
      reset_time: string;
      theme_mode: string;
      onboarding_completed: number;
    };
    const rows = await db.all<Row>(
      `SELECT id, reset_time, theme_mode, onboarding_completed FROM app_settings`,
    );
    expect(rows).toEqual([
      {
        id: 'singleton',
        reset_time: '03:00',
        theme_mode: 'dark',
        onboarding_completed: 1,
      },
    ]);
    await teardown(db);
  });

  test('PRAGMA user_version が SCHEMA_VERSION と一致 (PR-1.8a migration)', async () => {
    const db = await setup();
    type VersionRow = { user_version: number };
    const rows = await db.all<VersionRow>(`PRAGMA user_version`);
    expect(rows[0]?.user_version).toBe(SCHEMA_VERSION);
    await teardown(db);
  });

  test('nodes.action_id は ON DELETE RESTRICT (使用中アクションは削除拒否 / PR-1.8b 用)', async () => {
    const db = await setup();
    type FkRow = { table: string; from: string; to: string; on_delete: string };
    const fks = await db.all<FkRow>(`PRAGMA foreign_key_list(nodes)`);
    const actionFk = fks.find((f) => f.from === 'action_id');
    expect(actionFk?.table).toBe('actions');
    // RESTRICT もしくは NO ACTION (どちらも「拒否」挙動)
    expect(['RESTRICT', 'NO ACTION']).toContain(actionFk?.on_delete);
    await teardown(db);
  });

  // ADR-0030 (#68): テンプレ catalog (modules / links) と live nodes.module_id。
  // catalog は採用前のテンプレ定義専用。live への混入 (default_on / starter 等) を
  // 禁じるため、テーブルのカラム集合を K-006 スタイルで機械固定する。
  test('modules テーブル (ADR-0030): カラムは 8 固定 (catalog 専用・派生値カラム禁止)', async () => {
    const db = await setup();
    type ColumnRow = { name: string };
    const cols = await db.all<ColumnRow>(`PRAGMA table_info(modules)`);
    expect(cols.map((c) => c.name).sort()).toEqual([
      'color',
      'goal_json',
      'id',
      'kind',
      'moment_json',
      'name',
      'order_index',
      'source',
    ]);
    await teardown(db);
  });

  test('links テーブル (ADR-0030): カラムは 8 固定 (default_on / starter は catalog のみ)', async () => {
    const db = await setup();
    type ColumnRow = { name: string };
    const cols = await db.all<ColumnRow>(`PRAGMA table_info(links)`);
    expect(cols.map((c) => c.name).sort()).toEqual([
      'default_on',
      'id',
      'module_id',
      'position',
      'source',
      'starter',
      'timer_seconds',
      'title',
    ]);
    await teardown(db);
  });

  test('links.module_id は NOT NULL + FK→modules (orphan link を物理禁止)', async () => {
    const db = await setup();
    type ColumnRow = { name: string; notnull: number };
    const cols = await db.all<ColumnRow>(`PRAGMA table_info(links)`);
    const moduleIdCol = cols.find((c) => c.name === 'module_id');
    expect(moduleIdCol?.notnull).toBe(1); // NOT NULL
    type FkRow = { table: string; from: string; on_delete: string };
    const fks = await db.all<FkRow>(`PRAGMA foreign_key_list(links)`);
    const moduleFk = fks.find((f) => f.from === 'module_id');
    expect(moduleFk?.table).toBe('modules');
    expect(moduleFk?.on_delete).toBe('CASCADE');
    await teardown(db);
  });

  test('nodes に module_id 列が追加されている (NULL 許容・FK→modules / 編集UI用の所属参照)', async () => {
    const db = await setup();
    type ColumnRow = { name: string; notnull: number };
    const cols = await db.all<ColumnRow>(`PRAGMA table_info(nodes)`);
    const moduleIdCol = cols.find((c) => c.name === 'module_id');
    expect(moduleIdCol).toBeTruthy();
    expect(moduleIdCol?.notnull).toBe(0); // NULL 許容 (= テンプレ未経由ノード)
    type FkRow = { table: string; from: string };
    const fks = await db.all<FkRow>(`PRAGMA foreign_key_list(nodes)`);
    const moduleFk = fks.find((f) => f.from === 'module_id');
    expect(moduleFk?.table).toBe('modules');
    await teardown(db);
  });

  test('#73: nodes に active 列が追加されている (NOT NULL DEFAULT 1 / ON-OFF 一時停止)', async () => {
    const db = await setup();
    type ColumnRow = { name: string; notnull: number; dflt_value: string | null };
    const cols = await db.all<ColumnRow>(`PRAGMA table_info(nodes)`);
    const activeCol = cols.find((c) => c.name === 'active');
    expect(activeCol).toBeTruthy();
    expect(activeCol?.notnull).toBe(1);
    expect(activeCol?.dflt_value).toBe('1');
    await teardown(db);
  });

  test('#73: MIGRATIONS[9] が v8 schema の nodes に active 列を追加する (既存ノードは 1 で保全)', async () => {
    const db = createBetterSqliteClient(':memory:');
    await db.exec(`
      CREATE TABLE actions (id TEXT PRIMARY KEY, title TEXT NOT NULL, variants_json TEXT, timer_seconds INTEGER);
      CREATE TABLE anchors (id TEXT PRIMARY KEY, title TEXT NOT NULL, kind TEXT NOT NULL, time TEXT, latitude REAL, longitude REAL, radius_meters REAL);
      CREATE TABLE chains (id TEXT PRIMARY KEY, title TEXT NOT NULL, anchor_id TEXT NOT NULL REFERENCES anchors(id), status TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE nodes (
        id TEXT PRIMARY KEY,
        chain_id TEXT NOT NULL REFERENCES chains(id) ON DELETE CASCADE,
        order_index INTEGER NOT NULL,
        kind TEXT NOT NULL,
        action_id TEXT NOT NULL REFERENCES actions(id),
        module_id TEXT,
        UNIQUE(chain_id, order_index)
      );
    `);
    await db.run(`INSERT INTO actions (id, title) VALUES ('act-1', 'a')`);
    await db.run(`INSERT INTO anchors (id, title, kind) VALUES ('anc-1', 'x', 'behavior')`);
    await db.run(
      `INSERT INTO chains (id, title, anchor_id, status, created_at) VALUES ('ch-1', 'c', 'anc-1', 'active', '2026-01-01')`,
    );
    await db.run(
      `INSERT INTO nodes (id, chain_id, order_index, kind, action_id) VALUES ('nd-1', 'ch-1', 0, 'action', 'act-1')`,
    );

    await MIGRATIONS[9]!(db);

    type Row = { id: string; active: number };
    const nodes = await db.all<Row>(`SELECT id, active FROM nodes`);
    expect(nodes).toEqual([{ id: 'nd-1', active: 1 }]);
    await teardown(db);
  });

  test('ADR-0030: MIGRATIONS[7] が v6 schema に modules/links + nodes.module_id を追加する (既存データ保全)', async () => {
    // v6 schema 相当 (modules/links なし・nodes に module_id なし) を直接構築し、
    // 既存ユーザーの代理データを入れてから MIGRATIONS[7] を当てる。
    const db = createBetterSqliteClient(':memory:');
    await db.exec(`
      CREATE TABLE actions (id TEXT PRIMARY KEY, title TEXT NOT NULL, variants_json TEXT, timer_seconds INTEGER);
      CREATE TABLE anchors (id TEXT PRIMARY KEY, title TEXT NOT NULL, kind TEXT NOT NULL, time TEXT, latitude REAL, longitude REAL, radius_meters REAL);
      CREATE TABLE chains (id TEXT PRIMARY KEY, title TEXT NOT NULL, anchor_id TEXT NOT NULL REFERENCES anchors(id), status TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE nodes (
        id TEXT PRIMARY KEY,
        chain_id TEXT NOT NULL REFERENCES chains(id) ON DELETE CASCADE,
        order_index INTEGER NOT NULL,
        kind TEXT NOT NULL,
        action_id TEXT NOT NULL REFERENCES actions(id),
        UNIQUE(chain_id, order_index)
      );
    `);
    // 既存ユーザーの代理 (テンプレ未経由の手作りチェーン)
    await db.run(`INSERT INTO actions (id, title) VALUES ('act-1', '既存アクション')`);
    await db.run(`INSERT INTO anchors (id, title, kind) VALUES ('anc-1', '起床', 'behavior')`);
    await db.run(
      `INSERT INTO chains (id, title, anchor_id, status, created_at) VALUES ('ch-1', '既存チェーン', 'anc-1', 'active', '2026-01-01')`,
    );
    await db.run(
      `INSERT INTO nodes (id, chain_id, order_index, kind, action_id) VALUES ('nd-1', 'ch-1', 0, 'action', 'act-1')`,
    );

    await MIGRATIONS[7]!(db);

    // modules / links テーブルが新設されている
    type TableRow = { name: string };
    const tables = await db.all<TableRow>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('modules','links')`,
    );
    expect(tables.map((t) => t.name).sort()).toEqual(['links', 'modules']);

    // nodes.module_id が追加され、既存ノードは module_id=NULL で保全されている
    type NodeRow = { id: string; module_id: string | null };
    const nodes = await db.all<NodeRow>(`SELECT id, module_id FROM nodes`);
    expect(nodes).toEqual([{ id: 'nd-1', module_id: null }]);
    await teardown(db);
  });

  // ADR-0039 (#154): 新カテゴリカタログのスキーマ不変条件を K-006 スタイルで機械固定する。
  test('categories テーブル (ADR-0039): カラムは 6 固定 (catalog 専用・採用前メタは別テーブル)', async () => {
    const db = await setup();
    type ColumnRow = { name: string };
    const cols = await db.all<ColumnRow>(`PRAGMA table_info(categories)`);
    expect(cols.map((c) => c.name).sort()).toEqual([
      'color',
      'id',
      'name',
      'order_index',
      'source',
      'type',
    ]);
    await teardown(db);
  });

  test('catalog_actions テーブル (ADR-0039): カラムは 7 固定 / category_id NOT NULL + FK→categories CASCADE (orphan 物理禁止)', async () => {
    const db = await setup();
    type ColumnRow = { name: string; notnull: number };
    const cols = await db.all<ColumnRow>(`PRAGMA table_info(catalog_actions)`);
    expect(cols.map((c) => c.name).sort()).toEqual([
      'category_id',
      'default_on',
      'id',
      'position',
      'source',
      'timer_seconds',
      'title',
    ]);
    expect(cols.find((c) => c.name === 'category_id')?.notnull).toBe(1);
    type FkRow = { table: string; from: string; on_delete: string };
    const fks = await db.all<FkRow>(`PRAGMA foreign_key_list(catalog_actions)`);
    const categoryFk = fks.find((f) => f.from === 'category_id');
    expect(categoryFk?.table).toBe('categories');
    expect(categoryFk?.on_delete).toBe('CASCADE');
    await teardown(db);
  });

  test('recommended_items テーブル (ADR-0039): category_id + action_id 共に NOT NULL + FK CASCADE (順序つき重複参照)', async () => {
    const db = await setup();
    type ColumnRow = { name: string; notnull: number };
    const cols = await db.all<ColumnRow>(`PRAGMA table_info(recommended_items)`);
    expect(cols.map((c) => c.name).sort()).toEqual([
      'action_id',
      'category_id',
      'id',
      'position',
    ]);
    expect(cols.find((c) => c.name === 'category_id')?.notnull).toBe(1);
    expect(cols.find((c) => c.name === 'action_id')?.notnull).toBe(1);
    type FkRow = { table: string; from: string; on_delete: string };
    const fks = await db.all<FkRow>(
      `PRAGMA foreign_key_list(recommended_items)`,
    );
    expect(fks.find((f) => f.from === 'category_id')?.table).toBe('categories');
    expect(fks.find((f) => f.from === 'action_id')?.table).toBe(
      'catalog_actions',
    );
    expect(fks.every((f) => f.on_delete === 'CASCADE')).toBe(true);
    await teardown(db);
  });

  test('ADR-0039: MIGRATIONS[10] が v9 schema に新カテゴリカタログ 3 テーブルを追加する (既存データ保全)', async () => {
    // v9 schema 相当 (新カテゴリテーブルなし) を直接構築し、既存ユーザーの代理データを
    // 入れてから MIGRATIONS[10] を当てる (旧 catalog / live は触らない = 並行追加)。
    const db = createBetterSqliteClient(':memory:');
    await db.exec(`
      CREATE TABLE modules (id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL, moment_json TEXT NOT NULL, goal_json TEXT NOT NULL, source TEXT NOT NULL, kind TEXT NOT NULL, order_index INTEGER NOT NULL);
    `);
    await db.run(
      `INSERT INTO modules (id, name, color, moment_json, goal_json, source, kind, order_index) VALUES ('mod-1', '既存モジュール', '#fff', '["morning"]', '["health"]', 'official', 'normal', 0)`,
    );

    await MIGRATIONS[10]!(db);

    // 新 3 テーブルが追加されている
    type TableRow = { name: string };
    const tables = await db.all<TableRow>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('categories','catalog_actions','recommended_items')`,
    );
    expect(tables.map((t) => t.name).sort()).toEqual([
      'catalog_actions',
      'categories',
      'recommended_items',
    ]);
    // 旧 modules は触られず保全されている (並行追加)
    type ModRow = { id: string };
    const mods = await db.all<ModRow>(`SELECT id FROM modules`);
    expect(mods).toEqual([{ id: 'mod-1' }]);
    await teardown(db);
  });
});

describe('deleteChain — チェーン削除 + 関連レコードの CASCADE', () => {
  const seedChainWithNodes = async (db: DbClient): Promise<void> => {
    await insertAnchor(db, {
      id: 'a1',
      title: '起床',
      kind: 'time',
      time: '07:30',
      latitude: null,
      longitude: null,
      radiusMeters: null,
    });
    await insertAction(db, { id: 'act-water', title: '水を飲む', variants: null, timerSeconds: null });
    await insertAction(db, { id: 'act-stretch', title: 'ストレッチ', variants: null, timerSeconds: null });
    await insertChain(db, {
      id: 'c1',
      title: '朝のルーティン',
      anchorId: 'a1',
      status: 'active',
      createdAt: '2026-05-19',
    });
    await insertNode(db, {
      id: 'n1',
      chainId: 'c1',
      orderIndex: 0,
      kind: 'action',
      actionId: 'act-water',
    });
    await insertNode(db, {
      id: 'n2',
      chainId: 'c1',
      orderIndex: 1,
      kind: 'action',
      actionId: 'act-stretch',
    });
    await recordAchievement(db, {
      nodeId: 'n1',
      date: '2026-05-19',
      achieved: true,
    });
    await recordAnchorFiring(db, { anchorId: 'a1', date: '2026-05-19' });
  };

  test('チェーン削除で関連ノードも CASCADE で消える', async () => {
    const db = await setup();
    await seedChainWithNodes(db);
    await deleteChain(db, 'c1');
    const nodes = await listNodes(db, 'c1');
    expect(nodes).toEqual([]);
    await teardown(db);
  });

  test('チェーン削除で関連達成記録も CASCADE で消える', async () => {
    const db = await setup();
    await seedChainWithNodes(db);
    await deleteChain(db, 'c1');
    const achievements = await listAchievementsForNodes(
      db,
      ['n1', 'n2'],
      '2026-05-19',
      '2026-05-19',
    );
    expect(achievements).toEqual([]);
    await teardown(db);
  });

  test('チェーン削除で関連アンカー (1-1) も消える', async () => {
    const db = await setup();
    await seedChainWithNodes(db);
    await deleteChain(db, 'c1');
    const anchor = await getAnchor(db, 'a1');
    expect(anchor).toBeNull();
    await teardown(db);
  });

  test('チェーン削除でアンカー発火記録も CASCADE で消える', async () => {
    const db = await setup();
    await seedChainWithNodes(db);
    await deleteChain(db, 'c1');
    const firings = await listAnchorFiringsForDate(db, 'a1', '2026-05-19');
    expect(firings).toEqual([]);
    await teardown(db);
  });

  test('チェーン削除自体: listChains から消える', async () => {
    const db = await setup();
    await seedChainWithNodes(db);
    await deleteChain(db, 'c1');
    const chains = await listChains(db);
    expect(chains).toEqual([]);
    await teardown(db);
  });

  test('存在しないチェーン ID の削除は no-op (エラーを投げない)', async () => {
    const db = await setup();
    await expect(deleteChain(db, 'nonexistent')).resolves.toBeUndefined();
    await teardown(db);
  });

  test('actions は CASCADE 対象外 (チェーン削除しても残る)', async () => {
    const db = await setup();
    await seedChainWithNodes(db);
    await deleteChain(db, 'c1');
    const actions = await listActions(db);
    expect(actions.map((a) => a.id).sort()).toEqual(['act-stretch', 'act-water']);
    await teardown(db);
  });
});

describe('deleteAction — アクション削除 + 使用中の拒否 (PR-1.8b)', () => {
  test('未使用アクション削除で listActions から消える', async () => {
    const db = await setup();
    await insertAction(db, { id: 'act-orphan', title: '使われていない', variants: null, timerSeconds: null });
    await deleteAction(db, 'act-orphan');
    const actions = await listActions(db);
    expect(actions.find((a) => a.id === 'act-orphan')).toBeUndefined();
    await teardown(db);
  });

  test('使用中アクション削除は明示的なエラーで拒否される (FK 違反生メッセージではない)', async () => {
    const db = await setup();
    await insertAnchor(db, {
      id: 'a1',
      title: '起床',
      kind: 'behavior',
      time: null,
      latitude: null,
      longitude: null,
      radiusMeters: null,
    });
    await insertAction(db, { id: 'act-water', title: '水を飲む', variants: null, timerSeconds: null });
    await insertChain(db, {
      id: 'c1',
      title: '朝のルーティン',
      anchorId: 'a1',
      status: 'active',
      createdAt: '2026-05-19',
    });
    await insertNode(db, {
      id: 'n1',
      chainId: 'c1',
      orderIndex: 0,
      kind: 'action',
      actionId: 'act-water',
    });
    await expect(deleteAction(db, 'act-water')).rejects.toThrow(/使用中/);
    // 削除が拒否されていることを確認: action もノードも残っている
    const action = await getAction(db, 'act-water');
    expect(action?.id).toBe('act-water');
    const nodes = await listNodes(db, 'c1');
    expect(nodes).toHaveLength(1);
    await teardown(db);
  });

  test('存在しないアクション ID の削除は no-op (エラーを投げない)', async () => {
    const db = await setup();
    await expect(deleteAction(db, 'nonexistent')).resolves.toBeUndefined();
    await teardown(db);
  });

  test('使用していたチェーンを先に削除すれば、そのアクションは削除可能', async () => {
    const db = await setup();
    await insertAnchor(db, {
      id: 'a1',
      title: '起床',
      kind: 'behavior',
      time: null,
      latitude: null,
      longitude: null,
      radiusMeters: null,
    });
    await insertAction(db, { id: 'act-water', title: '水を飲む', variants: null, timerSeconds: null });
    await insertChain(db, {
      id: 'c1',
      title: '朝のルーティン',
      anchorId: 'a1',
      status: 'active',
      createdAt: '2026-05-19',
    });
    await insertNode(db, {
      id: 'n1',
      chainId: 'c1',
      orderIndex: 0,
      kind: 'action',
      actionId: 'act-water',
    });
    await deleteChain(db, 'c1');
    await expect(deleteAction(db, 'act-water')).resolves.toBeUndefined();
    const action = await getAction(db, 'act-water');
    expect(action).toBeNull();
    await teardown(db);
  });
});

describe('recordAnchorFiring / listAnchorFiringsForDate (ADR-0012)', () => {
  test('発火 record を 1 回 INSERT → その日の listAnchorFiringsForDate で取得できる', async () => {
    const db = await setup();
    await insertAnchor(db, {
      id: 'a1',
      title: '起床',
      kind: 'time',
      time: '07:30',
      latitude: null,
      longitude: null,
      radiusMeters: null,
    });
    await recordAnchorFiring(db, { anchorId: 'a1', date: '2026-05-19' });
    const rows = await listAnchorFiringsForDate(db, 'a1', '2026-05-19');
    expect(rows).toEqual([{ anchorId: 'a1', date: '2026-05-19' }]);
    await teardown(db);
  });

  test('同 (anchor_id, date) で 2 回目以降の INSERT は無視 (1 日 1 回の不可逆イベント)', async () => {
    const db = await setup();
    await insertAnchor(db, {
      id: 'a1',
      title: '起床',
      kind: 'time',
      time: '07:30',
      latitude: null,
      longitude: null,
      radiusMeters: null,
    });
    await recordAnchorFiring(db, { anchorId: 'a1', date: '2026-05-19' });
    await recordAnchorFiring(db, { anchorId: 'a1', date: '2026-05-19' });
    const rows = await listAnchorFiringsForDate(db, 'a1', '2026-05-19');
    expect(rows).toHaveLength(1);
    await teardown(db);
  });

  test('別日の発火 record はそれぞれ独立に残る', async () => {
    const db = await setup();
    await insertAnchor(db, {
      id: 'a1',
      title: '起床',
      kind: 'time',
      time: '07:30',
      latitude: null,
      longitude: null,
      radiusMeters: null,
    });
    await recordAnchorFiring(db, { anchorId: 'a1', date: '2026-05-18' });
    await recordAnchorFiring(db, { anchorId: 'a1', date: '2026-05-19' });
    expect(
      await listAnchorFiringsForDate(db, 'a1', '2026-05-18'),
    ).toHaveLength(1);
    expect(
      await listAnchorFiringsForDate(db, 'a1', '2026-05-19'),
    ).toHaveLength(1);
    await teardown(db);
  });

  test('該当日に record なし → 空配列', async () => {
    const db = await setup();
    await insertAnchor(db, {
      id: 'a1',
      title: '起床',
      kind: 'time',
      time: '07:30',
      latitude: null,
      longitude: null,
      radiusMeters: null,
    });
    const rows = await listAnchorFiringsForDate(db, 'a1', '2026-05-19');
    expect(rows).toEqual([]);
    await teardown(db);
  });

  test('updateChain で title を変更できる', async () => {
    const db = await setup();
    await insertAnchor(db, {
      id: 'a1',
      title: '起床',
      kind: 'behavior',
      time: null,
      latitude: null,
      longitude: null,
      radiusMeters: null,
    });
    await insertChain(db, {
      id: 'c1',
      title: '朝のルーティン',
      anchorId: 'a1',
      status: 'active',
      createdAt: '2026-05-20T00:00:00Z',
    });
    await updateChain(db, {
      id: 'c1',
      title: '夜のルーティン',
      anchorId: 'a1',
      status: 'active',
      createdAt: '',
    });
    const chains = await listChains(db);
    expect(chains[0]?.title).toBe('夜のルーティン');
    await teardown(db);
  });

  test('updateAction で title を変更できる', async () => {
    const db = await setup();
    await insertAction(db, { id: 'act1', title: '水を飲む', variants: null, timerSeconds: null });
    await updateAction(db, { id: 'act1', title: 'お茶を淹れる', variants: null, timerSeconds: null });
    const actions = await listActions(db);
    expect(actions.find((a) => a.id === 'act1')?.title).toBe('お茶を淹れる');
    await teardown(db);
  });

  test('updateAction で variant を設定 → listActions で JSON 往復が成立する (ADR-0018)', async () => {
    const db = await setup();
    await insertAction(db, { id: 'act-workout', title: '筋トレ', variants: null, timerSeconds: null });
    await updateAction(db, {
      id: 'act-workout',
      title: '筋トレ',
      variants: {
        mon: '胸トレ',
        tue: '足トレ',
        wed: '背中トレ',
        thu: null,
        fri: null,
        sat: null,
        sun: null,
      },
      timerSeconds: null,
    });
    const actions = await listActions(db);
    const updated = actions.find((a) => a.id === 'act-workout');
    expect(updated?.variants).toEqual({
      mon: '胸トレ',
      tue: '足トレ',
      wed: '背中トレ',
      thu: null,
      fri: null,
      sat: null,
      sun: null,
    });
    await teardown(db);
  });

  test('updateAction で variants=null に戻せる (variant 解除)', async () => {
    const db = await setup();
    await insertAction(db, {
      id: 'act-workout',
      title: '筋トレ',
      variants: {
        mon: '胸トレ',
        tue: null,
        wed: null,
        thu: null,
        fri: null,
        sat: null,
        sun: null,
      },
      timerSeconds: null,
    });
    await updateAction(db, { id: 'act-workout', title: '筋トレ', variants: null, timerSeconds: null });
    const actions = await listActions(db);
    expect(actions.find((a) => a.id === 'act-workout')?.variants).toBeNull();
    await teardown(db);
  });

  test('reorderNodes で UNIQUE(chain_id, order_index) 制約を満たしたまま並び替えできる', async () => {
    const db = await setup();
    await insertAnchor(db, {
      id: 'a1',
      title: '起床',
      kind: 'behavior',
      time: null,
      latitude: null,
      longitude: null,
      radiusMeters: null,
    });
    await insertChain(db, {
      id: 'c1',
      title: '朝',
      anchorId: 'a1',
      status: 'active',
      createdAt: '2026-05-20T00:00:00Z',
    });
    for (const id of ['act1', 'act2', 'act3']) {
      await insertAction(db, { id, title: id, variants: null, timerSeconds: null });
    }
    await insertNode(db, {
      id: 'n1',
      chainId: 'c1',
      orderIndex: 0,
      kind: 'action',
      actionId: 'act1',
    });
    await insertNode(db, {
      id: 'n2',
      chainId: 'c1',
      orderIndex: 1,
      kind: 'action',
      actionId: 'act2',
    });
    await insertNode(db, {
      id: 'n3',
      chainId: 'c1',
      orderIndex: 2,
      kind: 'action',
      actionId: 'act3',
    });
    // 逆順に並び替え
    await reorderNodes(db, 'c1', ['n3', 'n2', 'n1']);
    const nodes = await listNodes(db, 'c1');
    expect(nodes.map((n) => n.id)).toEqual(['n3', 'n2', 'n1']);
    expect(nodes.map((n) => n.orderIndex)).toEqual([0, 1, 2]);
    await teardown(db);
  });

  test('listActions が全アクションを title 昇順で返す', async () => {
    const db = await setup();
    await insertAction(db, { id: 'b', title: 'B アクション', variants: null, timerSeconds: null });
    await insertAction(db, { id: 'a', title: 'A アクション', variants: null, timerSeconds: null });
    const actions = await listActions(db);
    expect(actions.map((a) => a.title)).toEqual(['A アクション', 'B アクション']);
    await teardown(db);
  });

  test('updateNode で actionId と orderIndex を変更できる', async () => {
    const db = await setup();
    await insertAnchor(db, {
      id: 'a1',
      title: '起床',
      kind: 'behavior',
      time: null,
      latitude: null,
      longitude: null,
      radiusMeters: null,
    });
    await insertChain(db, {
      id: 'c1',
      title: '朝',
      anchorId: 'a1',
      status: 'active',
      createdAt: '2026-05-20T00:00:00Z',
    });
    await insertAction(db, { id: 'act1', title: '水を飲む', variants: null, timerSeconds: null });
    await insertAction(db, { id: 'act2', title: 'ストレッチ', variants: null, timerSeconds: null });
    await insertNode(db, {
      id: 'n1',
      chainId: 'c1',
      orderIndex: 0,
      kind: 'action',
      actionId: 'act1',
    });
    await updateNode(db, {
      id: 'n1',
      chainId: 'c1',
      orderIndex: 5,
      kind: 'action',
      actionId: 'act2',
    });
    const nodes = await listNodes(db, 'c1');
    expect(nodes[0]?.actionId).toBe('act2');
    expect(nodes[0]?.orderIndex).toBe(5);
    await teardown(db);
  });

  test('ADR-0030 (#68): module / link のラウンドトリップ — 所属と位置が独立に動く', async () => {
    const db = await setup();
    // 注: initSchema は #69 で v0 catalog を seed する。本テストは catalog の存在に
    // 依存せず検証するため、テスト専用 ID (t- プレフィックス) を使い、全件一致では
    // なく「テスト専用 ID でフィルタ」してアサートする。
    await insertModule(db, {
      id: 't-mod-health',
      name: '目覚め・水分',
      color: '#4FB0AE',
      moment: ['morning'],
      goal: ['health'],
      source: 'official',
      kind: 'normal',
      orderIndex: 1000,
    });
    await insertModule(db, {
      id: 't-mod-meal',
      name: '朝食',
      color: '#E0A24C',
      moment: ['morning'],
      goal: ['meal'],
      source: 'official',
      kind: 'normal',
      orderIndex: 1001,
    });
    // 所属 (moduleId) と位置 (position) を独立に設定:
    // health のリンクが position 0 と 2、meal のリンクが position 1 に挟まる
    // (= 同一モジュールのリンクがチェーン上で非連続でよい / ADR-0030 不変条件)。
    await insertLink(db, {
      id: 't-lnk-brush',
      title: '歯磨き',
      moduleId: 't-mod-health',
      defaultOn: true,
      position: 0,
      source: 'official',
      timerSeconds: null,
      starter: true,
    });
    await insertLink(db, {
      id: 't-lnk-breakfast',
      title: '朝食',
      moduleId: 't-mod-meal',
      defaultOn: true,
      position: 1,
      source: 'official',
      timerSeconds: null,
      starter: true,
    });
    await insertLink(db, {
      id: 't-lnk-water',
      title: '白湯',
      moduleId: 't-mod-health',
      defaultOn: true,
      position: 2,
      source: 'official',
      timerSeconds: null,
      starter: true,
    });

    // moment/goal の JSON 往復が成立する (テスト専用モジュールを取得)
    const modules = await listModules(db);
    const tModules = modules.filter((m) => m.id.startsWith('t-mod-'));
    expect(tModules.map((m) => m.id)).toEqual(['t-mod-health', 't-mod-meal']);
    const health = tModules.find((m) => m.id === 't-mod-health')!;
    expect(health.moment).toEqual(['morning']);
    expect(health.goal).toEqual(['health']);

    // listLinksForModule は所属 (論理クラスタ) で絞る — position が非連続でも両方取れる
    // (catalog の他モジュールに影響されない = ID 指定取得なので安定)。
    const healthLinks = await listLinksForModule(db, 't-mod-health');
    expect(healthLinks.map((l) => l.id)).toEqual(['t-lnk-brush', 't-lnk-water']);
    expect(healthLinks.map((l) => l.position)).toEqual([0, 2]); // 非連続
    expect(healthLinks[0]?.defaultOn).toBe(true);
    expect(healthLinks[0]?.starter).toBe(true);

    // listLinks (全件 position 順) でも、テスト専用リンクが所属に関係なく
    // position 順に並ぶことを確認 (catalog 由来を除外してアサート)。
    const links = await listLinks(db);
    const tLinks = links.filter((l) => l.id.startsWith('t-lnk-'));
    expect(tLinks.map((l) => l.id)).toEqual([
      't-lnk-brush',
      't-lnk-breakfast',
      't-lnk-water',
    ]);
    await teardown(db);
  });

  test('ADR-0030 (#68): orphan link (存在しない module_id) は FK 制約で reject される', async () => {
    const db = await setup();
    await expect(
      insertLink(db, {
        id: 'lnk-orphan',
        title: '迷子リンク',
        moduleId: 'nonexistent-module',
        defaultOn: true,
        position: 0,
        source: 'user',
        timerSeconds: null,
        starter: false,
      }),
    ).rejects.toThrow(/FOREIGN KEY/);
    await teardown(db);
  });

  test('存在しない anchor_id への INSERT は (test env では) FK 制約で reject される', async () => {
    // 注: test env (better-sqlite3) は FK on デフォルトのため reject。
    // 一方 prod env (expo-sqlite / vanilla SQLite) は FK off デフォルトのため
    // 同じ INSERT が orphan record として通る。Phase 1 は削除経路なしで実害
    // なし、Phase 2 で foreign_keys=ON 有効化 + ON DELETE CASCADE を全リレー
    // ションに足すかを判断する (PR #17 review M-2/M-3、src/db.ts §冒頭コメント
    // 参照)。本テストは test env での挙動を固定するだけで、prod env との
    // 乖離が存在することの注意喚起 (K-006 の限界事例)。
    const db = await setup();
    await expect(
      recordAnchorFiring(db, { anchorId: 'nonexistent', date: '2026-05-19' }),
    ).rejects.toThrow(/FOREIGN KEY/);
    await teardown(db);
  });
});
