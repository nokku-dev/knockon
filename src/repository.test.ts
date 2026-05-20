import { createBetterSqliteClient } from './db.bettersqlite';
import { initSchema } from './db';
import type { DbClient } from './db';
import {
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
    await insertAction(db, { id: 'act-water', title: '水を飲む', variants: null });
    await insertAction(db, { id: 'act-stretch', title: 'ストレッチ', variants: null });
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
    await insertAction(db, { id: 'act1', title: '水を飲む', variants: null });
    await updateAction(db, { id: 'act1', title: 'お茶を淹れる', variants: null });
    const actions = await listActions(db);
    expect(actions.find((a) => a.id === 'act1')?.title).toBe('お茶を淹れる');
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
      await insertAction(db, { id, title: id, variants: null });
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
    await insertAction(db, { id: 'b', title: 'B アクション', variants: null });
    await insertAction(db, { id: 'a', title: 'A アクション', variants: null });
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
    await insertAction(db, { id: 'act1', title: '水を飲む', variants: null });
    await insertAction(db, { id: 'act2', title: 'ストレッチ', variants: null });
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
