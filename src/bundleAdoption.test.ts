import { createBetterSqliteClient } from './db.bettersqlite';
import { initSchema } from './db';
import { buildV0Catalog } from './catalogSeed';
import { buildChainDraftFromBundle } from './domain';
import { adoptChainDraft } from './bundleAdoption';
import { listChains, listNodes, getAction, getAnchor } from './repository';
import type { DbClient } from './db';
import type { Link, Module } from './domain';

// テスト専用の小さな catalog (seed と非衝突の ID プレフィックス t- / K-033)。
const testModules: Module[] = [
  {
    id: 't-mod-a',
    name: 'A',
    color: '#111',
    moment: ['morning'],
    goal: ['health'],
    source: 'official',
    kind: 'normal',
    orderIndex: 0,
  },
  {
    id: 't-mod-b',
    name: 'B',
    color: '#222',
    moment: ['morning'],
    goal: ['meal'],
    source: 'official',
    kind: 'normal',
    orderIndex: 1,
  },
  {
    id: 't-mod-night',
    name: 'Night',
    color: '#333',
    moment: ['night'],
    goal: ['reflection'],
    source: 'official',
    kind: 'normal',
    orderIndex: 2,
  },
];

const mkLink = (over: Partial<Link> & Pick<Link, 'id' | 'moduleId' | 'position'>): Link => ({
  title: over.id,
  defaultOn: true,
  source: 'official',
  timerSeconds: null,
  starter: true,
  ...over,
});

const testLinks: Link[] = [
  // morning: A は starter、position 0 と 2 (非連続)。B は starter、position 1。
  mkLink({ id: 't-lnk-a1', moduleId: 't-mod-a', position: 0, title: 'A1' }),
  mkLink({ id: 't-lnk-b1', moduleId: 't-mod-b', position: 1, title: 'B1' }),
  mkLink({ id: 't-lnk-a2', moduleId: 't-mod-a', position: 2, title: 'A2' }),
  // morning: A の追加リンク (defaultOn false) → 採用されない
  mkLink({ id: 't-lnk-a3', moduleId: 't-mod-a', position: 3, title: 'A3', defaultOn: false }),
  // night の starter リンク → morning 採用では除外される
  mkLink({ id: 't-lnk-night', moduleId: 't-mod-night', position: 0, title: 'Night1' }),
];

describe('buildChainDraftFromBundle — 束→ドラフトの純粋変換 (#70)', () => {
  test('moment に属する starter かつ defaultOn のリンクのみ position 順に採用', () => {
    const draft = buildChainDraftFromBundle(testModules, testLinks, 'morning', '朝の束');
    expect(draft.title).toBe('朝の束');
    // a1(0) → b1(1) → a2(2)。a3 は defaultOn=false で除外、night は moment 違いで除外。
    expect(draft.nodes.map((n) => n.actionTitle)).toEqual(['A1', 'B1', 'A2']);
  });

  test('採用ノードは所属モジュール (moduleId) を保持する', () => {
    const draft = buildChainDraftFromBundle(testModules, testLinks, 'morning', '朝の束');
    expect(draft.nodes.map((n) => n.moduleId)).toEqual([
      't-mod-a',
      't-mod-b',
      't-mod-a',
    ]);
  });

  test('starter でないモジュールのリンクは採用されない', () => {
    const nonStarterLinks: Link[] = [
      mkLink({ id: 't-lnk-x', moduleId: 't-mod-a', position: 0, starter: false }),
    ];
    const draft = buildChainDraftFromBundle(testModules, nonStarterLinks, 'morning', 'X');
    expect(draft.nodes).toEqual([]);
  });

  test('該当 moment のモジュールが無ければ空ドラフト', () => {
    const draft = buildChainDraftFromBundle(testModules, testLinks, 'noon', 'なし');
    expect(draft.nodes).toEqual([]);
  });
});

describe('adoptChainDraft — ドラフトの live 永続化 (#70)', () => {
  const setup = async (): Promise<DbClient> => {
    const db = createBetterSqliteClient(':memory:');
    await initSchema(db);
    return db;
  };

  // genId を決定的にするカウンタ (テスト用)。
  const seqId = () => {
    let n = 0;
    return (prefix: string) => `${prefix}-${(n += 1)}`;
  };

  test('ドラフトから chain + anchor + nodes + actions が生成される', async () => {
    const db = await setup();
    const draft = buildChainDraftFromBundle(testModules, testLinks, 'morning', '朝の束');
    const chainId = await adoptChainDraft(db, draft, '2026-05-31T00:00:00Z', seqId());

    const chains = await listChains(db, 'active');
    const created = chains.find((c) => c.id === chainId)!;
    expect(created.title).toBe('朝の束');

    const anchor = await getAnchor(db, created.anchorId);
    expect(anchor?.kind).toBe('behavior');

    const nodes = await listNodes(db, chainId);
    expect(nodes).toHaveLength(3);
    expect(nodes.map((n) => n.orderIndex)).toEqual([0, 1, 2]); // 採用時の並べ替えなし
    await db.close?.();
  });

  test('採用ノードは module_id を保持して永続化される (catalog 由来の所属が live に残る)', async () => {
    const db = await setup();
    const draft = buildChainDraftFromBundle(testModules, testLinks, 'morning', '朝の束');
    const chainId = await adoptChainDraft(db, draft, '2026-05-31T00:00:00Z', seqId());

    const nodes = await listNodes(db, chainId);
    expect(nodes.map((n) => n.moduleId)).toEqual(['t-mod-a', 't-mod-b', 't-mod-a']);
    // 各ノードのアクション名も採用したリンクの title になっている
    const titles = await Promise.all(
      nodes.map(async (n) => (await getAction(db, n.actionId))?.title),
    );
    expect(titles).toEqual(['A1', 'B1', 'A2']);
    await db.close?.();
  });

  test('v0 catalog から morning 束を採用すると starter×defaultOn のリンクがチェーン化する', async () => {
    const db = await setup();
    const { modules, links } = buildV0Catalog();
    const draft = buildChainDraftFromBundle(modules, links, 'morning', '朝のルーティン');
    expect(draft.nodes.length).toBeGreaterThan(0);
    // 採用された全ノードが starter モジュール由来 (= moduleId が morning の starter モジュール)
    const starterMorningModuleIds = new Set(
      modules
        .filter((m) => m.moment.includes('morning'))
        .map((m) => m.id)
        .filter((id) =>
          links.some((l) => l.moduleId === id && l.starter && l.defaultOn),
        ),
    );
    expect(draft.nodes.every((n) => starterMorningModuleIds.has(n.moduleId))).toBe(true);

    const chainId = await adoptChainDraft(db, draft, '2026-05-31T00:00:00Z', seqId());
    const nodes = await listNodes(db, chainId);
    expect(nodes).toHaveLength(draft.nodes.length);
    await db.close?.();
  });
});
