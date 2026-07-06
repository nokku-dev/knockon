import { createBetterSqliteClient } from './db.bettersqlite';
import { initSchema } from './db';
import type { DbClient } from './db';
import {
  deleteNode,
  insertAction,
  insertAnchor,
  insertChain,
  insertNode,
} from './repository';
import { insertRetraction, listRetractions } from './settlementRepository';

const setup = async (): Promise<DbClient> => {
  const db = createBetterSqliteClient(':memory:');
  await initSchema(db);
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
  await insertChain(db, {
    id: 'chain-1',
    title: '朝のチェーン',
    anchorId: 'anchor-1',
    status: 'active',
    createdAt: '2026-07-06',
  });
  await insertNode(db, {
    id: 'node-1',
    chainId: 'chain-1',
    orderIndex: 0,
    kind: 'action',
    actionId: 'action-1',
  });
  return db;
};

const teardown = async (db: DbClient) => {
  await db.close?.();
};

describe('settlementRepository — ADR-0047 定着取り下げ', () => {
  test('取り下げを記録し取得できる (round-trip)', async () => {
    const db = await setup();
    await insertRetraction(db, {
      nodeId: 'node-1',
      retractedAt: '2026-07-06T09:00:00',
    });
    const retractions = await listRetractions(db);
    expect(retractions).toEqual([
      { nodeId: 'node-1', retractedAt: '2026-07-06T09:00:00' },
    ]);
    await teardown(db);
  });

  test('同一ノードの複数回取り下げを retracted_at 昇順で取得する', async () => {
    const db = await setup();
    await insertRetraction(db, {
      nodeId: 'node-1',
      retractedAt: '2026-07-10T09:00:00',
    });
    await insertRetraction(db, {
      nodeId: 'node-1',
      retractedAt: '2026-06-01T09:00:00',
    });
    const retractions = await listRetractions(db);
    expect(retractions.map((r) => r.retractedAt)).toEqual([
      '2026-06-01T09:00:00',
      '2026-07-10T09:00:00',
    ]);
    await teardown(db);
  });

  test('同一 (node_id, retracted_at) の再記録は冪等 (1 行のまま)', async () => {
    const db = await setup();
    await insertRetraction(db, {
      nodeId: 'node-1',
      retractedAt: '2026-07-06T09:00:00',
    });
    await insertRetraction(db, {
      nodeId: 'node-1',
      retractedAt: '2026-07-06T09:00:00',
    });
    const retractions = await listRetractions(db);
    expect(retractions).toHaveLength(1);
    await teardown(db);
  });

  test('ノード削除で取り下げ事実も CASCADE 削除される (node なしでは無意味)', async () => {
    const db = await setup();
    await insertRetraction(db, {
      nodeId: 'node-1',
      retractedAt: '2026-07-06T09:00:00',
    });
    await deleteNode(db, 'node-1');
    const retractions = await listRetractions(db);
    expect(retractions).toEqual([]);
    await teardown(db);
  });
});
