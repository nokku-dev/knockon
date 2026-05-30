import { createBetterSqliteClient } from './db.bettersqlite';
import { initSchema } from './db';
import type { DbClient } from './db';
import {
  DEFAULT_RESET_TIME,
  DEFAULT_THEME_MODE,
  getAppSettings,
  updateAppSettings,
} from './settingsRepository';

// ADR-0028: app_settings シングルトン行 + reset_time のラウンドトリップ。
// schema migration (v4→v5) で table + default row が seed されている前提を検証。

const setup = async (): Promise<DbClient> => {
  const db = createBetterSqliteClient(':memory:');
  await initSchema(db);
  return db;
};

const teardown = async (db: DbClient) => {
  await db.close?.();
};

describe('settingsRepository', () => {
  test('初回起動: getAppSettings は DEFAULT_RESET_TIME を返す (= 00:00)', async () => {
    const db = await setup();
    const settings = await getAppSettings(db);
    expect(settings.resetTime).toBe(DEFAULT_RESET_TIME);
    expect(settings.resetTime).toBe('00:00');
    await teardown(db);
  });

  test('updateAppSettings で reset_time を変更 → getAppSettings で読み出せる', async () => {
    const db = await setup();
    await updateAppSettings(db, { resetTime: '03:30' });
    const settings = await getAppSettings(db);
    expect(settings.resetTime).toBe('03:30');
    await teardown(db);
  });

  test('複数回 update しても 1 行のまま (singleton 維持)', async () => {
    const db = await setup();
    await updateAppSettings(db, { resetTime: '02:00' });
    await updateAppSettings(db, { resetTime: '04:00' });
    await updateAppSettings(db, { resetTime: '06:00' });
    type CountRow = { count: number };
    const rows = await db.all<CountRow>(
      `SELECT COUNT(*) AS count FROM app_settings`,
    );
    expect(rows[0]?.count).toBe(1);
    const settings = await getAppSettings(db);
    expect(settings.resetTime).toBe('06:00');
    await teardown(db);
  });

  // ADR-0029 (Issue #53): theme_mode のラウンドトリップ。
  test('初回起動: getAppSettings は DEFAULT_THEME_MODE を返す (= auto)', async () => {
    const db = await setup();
    const settings = await getAppSettings(db);
    expect(settings.themeMode).toBe(DEFAULT_THEME_MODE);
    expect(settings.themeMode).toBe('auto');
    await teardown(db);
  });

  test('updateAppSettings で themeMode を light に変更 → 読み出せる', async () => {
    const db = await setup();
    await updateAppSettings(db, { themeMode: 'light' });
    const settings = await getAppSettings(db);
    expect(settings.themeMode).toBe('light');
    // resetTime は変わらない (= 部分更新)
    expect(settings.resetTime).toBe('00:00');
    await teardown(db);
  });

  test('updateAppSettings で themeMode を dark に変更 → 読み出せる', async () => {
    const db = await setup();
    await updateAppSettings(db, { themeMode: 'dark' });
    const settings = await getAppSettings(db);
    expect(settings.themeMode).toBe('dark');
    await teardown(db);
  });

  test('resetTime と themeMode を同時更新 → 両方反映される', async () => {
    const db = await setup();
    await updateAppSettings(db, { resetTime: '03:00', themeMode: 'dark' });
    const settings = await getAppSettings(db);
    expect(settings.resetTime).toBe('03:00');
    expect(settings.themeMode).toBe('dark');
    await teardown(db);
  });
});
