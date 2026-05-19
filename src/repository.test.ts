import { createBetterSqliteClient } from './db.bettersqlite';
import { initSchema } from './db';
import type { DbClient } from './db';
import {
  getAction,
  getAnchor,
  insertAction,
  insertAnchor,
  insertChain,
  insertNode,
  listAchievementsForNodes,
  listAnchorFiringsForDate,
  listChains,
  listNodes,
  recordAchievement,
  recordAnchorFiring,
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
    });
    await insertAction(db, {
      id: 'action-2',
      title: 'ストレッチ',
      variants: null,
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
    await insertAction(db, { id: 'act1', title: 'A', variants: null });
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
        'chains',
        'nodes',
      ].sort(),
    );
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
});
