import { createBetterSqliteClient } from './db.bettersqlite';
import { initSchema } from './db';
import { countAchievedNodesOn, isNodeAchievedOn } from './domain';
import {
  getAction,
  getAnchor,
  listAchievementsForNodes,
  listChains,
  listNodes,
  recordAchievement,
} from './repository';
import { buildPersonalChainSeed, seed } from './seed';

describe('seed — 自分のチェーン1本のラウンドトリップ (Phase 0 完了条件)', () => {
  test('シード投入後、コードからチェーン全体を読み出せる', async () => {
    const db = createBetterSqliteClient(':memory:');
    await initSchema(db);
    const payload = buildPersonalChainSeed();
    await seed(db, payload);

    const chains = await listChains(db, 'active');
    expect(chains).toHaveLength(1);
    const chain = chains[0]!;
    expect(chain.title).toBe('朝のルーティン');

    const anchor = await getAnchor(db, chain.anchorId);
    expect(anchor?.title).toBe('起床');
    expect(anchor?.kind).toBe('behavior');

    const nodes = await listNodes(db, chain.id);
    expect(nodes).toHaveLength(3);
    expect(nodes.map((n) => n.orderIndex)).toEqual([0, 1, 2]);

    const firstAction = await getAction(db, nodes[0]!.actionId);
    expect(firstAction?.title).toBe('水を飲む');

    await db.close?.();
  });

  test('達成記録の往復: 飛ばし達成でもゆるい連鎖判定で独立に集計される', async () => {
    const db = createBetterSqliteClient(':memory:');
    await initSchema(db);
    const payload = buildPersonalChainSeed();
    await seed(db, payload);

    const date = '2026-05-18';
    const [first, _skipped, third] = payload.nodes;
    await recordAchievement(db, {
      nodeId: first!.id,
      date,
      achieved: true,
    });
    await recordAchievement(db, {
      nodeId: third!.id,
      date,
      achieved: true,
    });

    const allNodeIds = payload.nodes.map((n) => n.id);
    const records = await listAchievementsForNodes(db, allNodeIds, date, date);
    expect(records).toHaveLength(2);

    expect(isNodeAchievedOn(records, first!.id, date)).toBe(true);
    expect(isNodeAchievedOn(records, payload.nodes[1]!.id, date)).toBe(false);
    expect(isNodeAchievedOn(records, third!.id, date)).toBe(true);
    expect(countAchievedNodesOn(records, allNodeIds, date)).toBe(2);

    await db.close?.();
  });
});
