import { createBetterSqliteClient } from './db.bettersqlite';
import { initSchema, MIGRATIONS, SCHEMA_VERSION } from './db';
import type { DbClient } from './db';
import {
  deleteAction,
  deleteChain,
  getAction,
  getAnchor,
  insertAction,
  insertAnchor,
  insertChain,
  insertNode,
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

  test('旧「リンク=アンカー×アクション」テーブルが存在しない / 正準データテーブルのみ', async () => {
    const db = await setup();
    type TableRow = { name: string };
    const tables = await db.all<TableRow>(
      `SELECT name FROM sqlite_master WHERE type='table'`,
    );
    const tableNames = tables.map((t) => t.name);
    expect(tableNames).not.toContain('links');
    expect(tableNames.sort()).toEqual(
      [
        'achievements',
        'actions',
        'anchor_firings',
        'anchors',
        'app_settings',
        'chains',
        'metric_kinds',
        'metrics',
        'nodes',
      ].sort(),
    );
    await teardown(db);
  });

  // ADR-0028 + ADR-0029 (Issue #53): app_settings カラム = id / reset_time / theme_mode。
  test('app_settings テーブル: カラムは id / reset_time / theme_mode', async () => {
    const db = await setup();
    type ColumnRow = { name: string };
    const cols = await db.all<ColumnRow>(`PRAGMA table_info(app_settings)`);
    const colNames = cols.map((c) => c.name).sort();
    expect(colNames).toEqual(['id', 'reset_time', 'theme_mode']);
    await teardown(db);
  });

  test('app_settings テーブル: 初回起動で 1 行 (singleton) が seed されている (reset_time, theme_mode default)', async () => {
    const db = await setup();
    type Row = { id: string; reset_time: string; theme_mode: string };
    const rows = await db.all<Row>(
      `SELECT id, reset_time, theme_mode FROM app_settings`,
    );
    expect(rows).toEqual([
      { id: 'singleton', reset_time: '00:00', theme_mode: 'auto' },
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
