import { persistChainDraft, validateChainDraft } from './chainEditPersist';
import { createBetterSqliteClient } from './db.bettersqlite';
import { initSchema } from './db';
import type { DbClient } from './db';
import {
  getAnchor,
  insertAction,
  listChains,
  listNodes,
} from './repository';
import type { ChainEditDraft, EditableNode } from './useChainEdit';

const setup = async (): Promise<DbClient> => {
  const db = createBetterSqliteClient(':memory:');
  await initSchema(db);
  // チェーン作成に必要なアクションを seed
  await insertAction(db, { id: 'act-water', title: '水を飲む', variants: null });
  await insertAction(db, { id: 'act-stretch', title: 'ストレッチ', variants: null });
  await insertAction(db, { id: 'act-desk', title: '机に向かう', variants: null });
  await insertAction(db, { id: 'act-coffee', title: 'コーヒー', variants: null });
  return db;
};

const teardown = async (db: DbClient) => {
  await db.close?.();
};

const buildDraft = (overrides: Partial<ChainEditDraft> = {}): ChainEditDraft => ({
  chainId: 'c1',
  isNew: true,
  title: '朝のルーティン',
  anchor: {
    id: 'a1',
    title: '起点',
    kind: 'behavior',
    time: null,
    latitude: null,
    longitude: null,
    radiusMeters: null,
  },
  nodes: [],
  ...overrides,
});

const node = (id: string, actionId: string, isNew = true): EditableNode => ({
  id,
  isNew,
  actionId,
  actionTitle: `action ${actionId}`,
});

describe('validateChainDraft', () => {
  test('タイトル空 → エラー', () => {
    expect(validateChainDraft(buildDraft({ title: '   ' }))).toMatch(
      /タイトル/,
    );
  });

  test('ノード 0 件 → エラー', () => {
    expect(validateChainDraft(buildDraft({ nodes: [] }))).toMatch(/ノード/);
  });

  test('kind=time で time=null → エラー (PR #20 review C-2)', () => {
    const d = buildDraft({
      nodes: [node('n1', 'act-water')],
      anchor: {
        id: 'a1',
        title: '起点',
        kind: 'time',
        time: null,
        latitude: null,
        longitude: null,
        radiusMeters: null,
      },
    });
    expect(validateChainDraft(d)).toMatch(/時刻/);
  });

  test('kind=time で time=不正フォーマット → エラー', () => {
    const d = buildDraft({
      nodes: [node('n1', 'act-water')],
      anchor: {
        id: 'a1',
        title: '起点',
        kind: 'time',
        time: 'abc',
        latitude: null,
        longitude: null,
        radiusMeters: null,
      },
    });
    expect(validateChainDraft(d)).toMatch(/時刻/);
  });

  test('kind=place で lat/lng=null → エラー', () => {
    const d = buildDraft({
      nodes: [node('n1', 'act-water')],
      anchor: {
        id: 'a1',
        title: '起点',
        kind: 'place',
        time: null,
        latitude: null,
        longitude: null,
        radiusMeters: 100,
      },
    });
    expect(validateChainDraft(d)).toMatch(/現在地/);
  });

  test('kind=behavior + タイトル + ノード 1 件以上 → null (OK)', () => {
    const d = buildDraft({
      nodes: [node('n1', 'act-water')],
    });
    expect(validateChainDraft(d)).toBeNull();
  });

  test('kind=time + 正しい時刻 + ノードあり → null (OK)', () => {
    const d = buildDraft({
      nodes: [node('n1', 'act-water')],
      anchor: {
        id: 'a1',
        title: '起点',
        kind: 'time',
        time: '07:30',
        latitude: null,
        longitude: null,
        radiusMeters: null,
      },
    });
    expect(validateChainDraft(d)).toBeNull();
  });
});

describe('persistChainDraft — 新規モード', () => {
  test('新規チェーン + 3 ノードが順序通り INSERT される', async () => {
    const db = await setup();
    const draft = buildDraft({
      isNew: true,
      nodes: [
        node('n1', 'act-water'),
        node('n2', 'act-stretch'),
        node('n3', 'act-desk'),
      ],
    });
    await persistChainDraft(db, draft);

    const chains = await listChains(db);
    expect(chains).toHaveLength(1);
    expect(chains[0]?.title).toBe('朝のルーティン');

    const nodes = await listNodes(db, 'c1');
    expect(nodes.map((n) => n.id)).toEqual(['n1', 'n2', 'n3']);
    expect(nodes.map((n) => n.orderIndex)).toEqual([0, 1, 2]);

    const anchor = await getAnchor(db, 'a1');
    expect(anchor?.kind).toBe('behavior');
    await teardown(db);
  });

  test('新規チェーン + 時刻アンカー → time が保存される', async () => {
    const db = await setup();
    const draft = buildDraft({
      isNew: true,
      nodes: [node('n1', 'act-water')],
      anchor: {
        id: 'a1',
        title: '起点',
        kind: 'time',
        time: '07:30',
        latitude: null,
        longitude: null,
        radiusMeters: null,
      },
    });
    await persistChainDraft(db, draft);
    const anchor = await getAnchor(db, 'a1');
    expect(anchor?.kind).toBe('time');
    expect(anchor?.time).toBe('07:30');
    await teardown(db);
  });
});

describe('persistChainDraft — 編集モード で DnD 後の任意順序が永続化される (PR-1.7a)', () => {
  test('DnD で 1→3→2 の順に並び替えた状態を保存すると DB もその順序になる', async () => {
    const db = await setup();
    const buildSeed = buildDraft({
      isNew: true,
      nodes: [
        node('n1', 'act-water'),
        node('n2', 'act-stretch'),
        node('n3', 'act-desk'),
      ],
    });
    await persistChainDraft(db, buildSeed);
    // DnD 結果として n1 → n3 → n2 の順に並び替えたドラフトを保存
    await persistChainDraft(
      db,
      buildDraft({
        isNew: false,
        nodes: [
          node('n1', 'act-water', false),
          node('n3', 'act-desk', false),
          node('n2', 'act-stretch', false),
        ],
      }),
    );
    const nodes = await listNodes(db, 'c1');
    expect(nodes.map((n) => n.id)).toEqual(['n1', 'n3', 'n2']);
    expect(nodes.map((n) => n.orderIndex)).toEqual([0, 1, 2]);
    await teardown(db);
  });
});

describe('persistChainDraft — 編集モード (PR #20 review C-1 リグレッションテスト)', () => {
  const seedChain = async (db: DbClient): Promise<void> => {
    await persistChainDraft(
      db,
      buildDraft({
        isNew: true,
        nodes: [
          node('n1', 'act-water'),
          node('n2', 'act-stretch'),
          node('n3', 'act-desk'),
        ],
      }),
    );
  };

  test('既存 3 ノードの順序を逆順に並び替えて保存できる (UNIQUE 衝突しない)', async () => {
    const db = await setup();
    await seedChain(db);
    // 既存 3 ノードを逆順に並べた編集ドラフト
    const editDraft = buildDraft({
      isNew: false,
      nodes: [
        node('n3', 'act-desk', false),
        node('n2', 'act-stretch', false),
        node('n1', 'act-water', false),
      ],
    });
    await expect(persistChainDraft(db, editDraft)).resolves.toBeUndefined();
    const nodes = await listNodes(db, 'c1');
    expect(nodes.map((n) => n.id)).toEqual(['n3', 'n2', 'n1']);
    expect(nodes.map((n) => n.orderIndex)).toEqual([0, 1, 2]);
    await teardown(db);
  });

  test('既存 3 ノード + 新規 2 ノード追加で保存できる (UNIQUE 衝突しない)', async () => {
    const db = await setup();
    await seedChain(db);
    const editDraft = buildDraft({
      isNew: false,
      nodes: [
        node('n1', 'act-water', false),
        node('n2', 'act-stretch', false),
        node('n3', 'act-desk', false),
        node('n4', 'act-coffee', true),
        node('n5', 'act-water', true),
      ],
    });
    await expect(persistChainDraft(db, editDraft)).resolves.toBeUndefined();
    const nodes = await listNodes(db, 'c1');
    expect(nodes.map((n) => n.id)).toEqual(['n1', 'n2', 'n3', 'n4', 'n5']);
    expect(nodes.map((n) => n.orderIndex)).toEqual([0, 1, 2, 3, 4]);
    await teardown(db);
  });

  test('既存ノードの actionId を差し替えて保存できる', async () => {
    const db = await setup();
    await seedChain(db);
    const editDraft = buildDraft({
      isNew: false,
      nodes: [
        node('n1', 'act-coffee', false), // act-water → act-coffee に差し替え
        node('n2', 'act-stretch', false),
        node('n3', 'act-desk', false),
      ],
    });
    await persistChainDraft(db, editDraft);
    const nodes = await listNodes(db, 'c1');
    expect(nodes.find((n) => n.id === 'n1')?.actionId).toBe('act-coffee');
    await teardown(db);
  });

  test('既存チェーンのタイトル変更が反映される', async () => {
    const db = await setup();
    await seedChain(db);
    await persistChainDraft(
      db,
      buildDraft({
        isNew: false,
        title: '夜のルーティン',
        nodes: [
          node('n1', 'act-water', false),
          node('n2', 'act-stretch', false),
          node('n3', 'act-desk', false),
        ],
      }),
    );
    const chains = await listChains(db);
    expect(chains[0]?.title).toBe('夜のルーティン');
    await teardown(db);
  });
});
