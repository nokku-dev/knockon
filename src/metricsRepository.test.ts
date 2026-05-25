import { createBetterSqliteClient } from './db.bettersqlite';
import { initSchema } from './db';
import type { DbClient } from './db';
import {
  deleteMetric,
  insertMetric,
  listMetricsInRange,
  listRecentMetrics,
} from './metricsRepository';

const setup = async (): Promise<DbClient> => {
  const db = createBetterSqliteClient(':memory:');
  await initSchema(db);
  return db;
};

describe('metricsRepository (ADR-0024 PR-Z3a)', () => {
  let db: DbClient;

  beforeEach(async () => {
    db = await setup();
  });

  afterEach(async () => {
    await db.close?.();
  });

  test('insertMetric: id 明示指定で挿入 → 1 件として保存される', async () => {
    await insertMetric(db, {
      id: 'm1',
      metricKey: 'weight',
      value: 72.5,
      recordedAt: '2026-05-26T09:00:00',
      source: 'manual',
    });
    const rows = await listRecentMetrics(db, 'weight', 10);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.value).toBe(72.5);
    expect(rows[0]?.source).toBe('manual');
    expect(rows[0]?.id).toBe('m1');
  });

  test('listRecentMetrics: 指定 key + recorded_at 降順 + limit', async () => {
    await insertMetric(db, {
      id: 'm1',
      metricKey: 'weight',
      value: 72,
      recordedAt: '2026-05-24T09:00:00',
      source: 'manual',
    });
    await insertMetric(db, {
      id: 'm2',
      metricKey: 'weight',
      value: 72.5,
      recordedAt: '2026-05-25T09:00:00',
      source: 'manual',
    });
    await insertMetric(db, {
      id: 'm3',
      metricKey: 'weight',
      value: 73,
      recordedAt: '2026-05-26T09:00:00',
      source: 'manual',
    });
    // 別 key は除外される
    await insertMetric(db, {
      id: 'm4',
      metricKey: 'sleep_hours',
      value: 6.5,
      recordedAt: '2026-05-26T07:00:00',
      source: 'manual',
    });
    const recent = await listRecentMetrics(db, 'weight', 2);
    expect(recent.map((m) => m.value)).toEqual([73, 72.5]);
  });

  test('listMetricsInRange: 指定 key + 期間内 + 昇順', async () => {
    await insertMetric(db, {
      id: 'r1',
      metricKey: 'weight',
      value: 71,
      recordedAt: '2026-05-10T09:00:00',
      source: 'manual',
    });
    await insertMetric(db, {
      id: 'r2',
      metricKey: 'weight',
      value: 72,
      recordedAt: '2026-05-20T09:00:00',
      source: 'manual',
    });
    await insertMetric(db, {
      id: 'r3',
      metricKey: 'weight',
      value: 73,
      recordedAt: '2026-05-26T09:00:00',
      source: 'manual',
    });
    const inRange = await listMetricsInRange(
      db,
      'weight',
      '2026-05-15',
      '2026-05-27',
    );
    expect(inRange.map((m) => m.value)).toEqual([72, 73]);
  });

  test('deleteMetric: 指定 id を削除', async () => {
    await insertMetric(db, {
      id: 'del-1',
      metricKey: 'weight',
      value: 72,
      recordedAt: '2026-05-26T09:00:00',
      source: 'manual',
    });
    await deleteMetric(db, 'del-1');
    const rows = await listRecentMetrics(db, 'weight', 10);
    expect(rows).toHaveLength(0);
  });

  test('source: notion を保存可能 (Z3b 連携用)', async () => {
    await insertMetric(db, {
      id: 'n1',
      metricKey: 'weight',
      value: 72,
      recordedAt: '2026-05-26T09:00:00',
      source: 'notion',
    });
    const rows = await listRecentMetrics(db, 'weight', 10);
    expect(rows[0]?.source).toBe('notion');
  });
});
