import { createBetterSqliteClient } from './db.bettersqlite';
import { initSchema } from './db';
import { adoptChainDraft } from './bundleAdoption';
import type { IdGen } from './bundleAdoption';
import { listChains, listNodes, getAction, getAnchor } from './repository';
import type { DbClient } from './db';
import type { ChainDraft } from './domain';

// ADR-0040 (#160): 旧 module/link モデル撤去後の採用永続化テスト。
// ChainDraft は actionTitle / timerSeconds のみ (由来参照なし)。

const setup = async (): Promise<DbClient> => {
  const db = createBetterSqliteClient(':memory:');
  await initSchema(db);
  return db;
};

// 決定的な ID 生成 (型ごとにカウンタ)。テストで採用結果を安定検証するため。
const seqIdGen = (): IdGen => {
  const counters: Record<string, number> = {};
  const next = (prefix: string) => {
    counters[prefix] = (counters[prefix] ?? 0) + 1;
    return `${prefix}-${counters[prefix]}`;
  };
  return {
    anchor: () => next('anchor'),
    chain: () => next('chain'),
    action: () => next('action'),
    node: () => next('node'),
  };
};

const sampleDraft: ChainDraft = {
  title: '朝のルーティン',
  nodes: [
    { actionTitle: '歯磨き', timerSeconds: null },
    { actionTitle: '洗顔', timerSeconds: null },
    { actionTitle: 'ストレッチ', timerSeconds: 60 },
  ],
};

describe('adoptChainDraft — ドラフトの live 永続化', () => {
  test('ドラフトから chain + anchor + nodes + actions が生成される (並べ替えなし)', async () => {
    const db = await setup();
    const chainId = await adoptChainDraft(
      db,
      sampleDraft,
      '2026-05-31T00:00:00Z',
      seqIdGen(),
    );

    const chains = await listChains(db, 'active');
    const created = chains.find((c) => c.id === chainId)!;
    expect(created.title).toBe('朝のルーティン');

    const anchor = await getAnchor(db, created.anchorId);
    expect(anchor?.kind).toBe('behavior'); // 既定は行動アンカー

    const nodes = await listNodes(db, chainId);
    expect(nodes).toHaveLength(3);
    expect(nodes.map((n) => n.orderIndex)).toEqual([0, 1, 2]);
    const titles = await Promise.all(
      nodes.map(async (n) => (await getAction(db, n.actionId))?.title),
    );
    expect(titles).toEqual(['歯磨き', '洗顔', 'ストレッチ']);
    await db.close?.();
  });

  test('anchorSpec=time を渡すと時刻アンカーが生成される (onboarding)', async () => {
    const db = await setup();
    const chainId = await adoptChainDraft(
      db,
      sampleDraft,
      '2026-05-31T00:00:00Z',
      seqIdGen(),
      { kind: 'time', time: '07:30' },
    );
    const chains = await listChains(db, 'active');
    const created = chains.find((c) => c.id === chainId)!;
    const anchor = await getAnchor(db, created.anchorId);
    expect(anchor?.kind).toBe('time');
    expect(anchor?.time).toBe('07:30');
    await db.close?.();
  });

  test('ノードのタイマー秒数が採用先 action に保持される', async () => {
    const db = await setup();
    const chainId = await adoptChainDraft(
      db,
      sampleDraft,
      '2026-05-31T00:00:00Z',
      seqIdGen(),
    );
    const nodes = await listNodes(db, chainId);
    const stretch = await getAction(db, nodes[2]!.actionId);
    expect(stretch?.timerSeconds).toBe(60);
    await db.close?.();
  });
});
