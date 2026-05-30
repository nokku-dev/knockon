import type { DbClient } from './db';

// ADR-0028 (PR-DD): app_settings (singleton) のラウンドトリップ。
// id='singleton' で 1 行固定。 新規設定は将来 ALTER TABLE で列追加 (ADR-0027 ALTER 経路)。

export type AppSettings = {
  resetTime: string; // 'HH:MM' 形式。 デフォルト '00:00'。
};

type AppSettingsRow = {
  id: string;
  reset_time: string;
};

const SINGLETON_ID = 'singleton';
export const DEFAULT_RESET_TIME = '00:00';

const rowToSettings = (r: AppSettingsRow): AppSettings => ({
  resetTime: r.reset_time,
});

// schema seed で必ず 1 行入っている前提だが、 万一 row が無い場合は default を返す
// (= 起動 race / 手動 DB 改ざんに対する silent fallback、 K-024 同型受容)。
export const getAppSettings = async (db: DbClient): Promise<AppSettings> => {
  const rows = await db.all<AppSettingsRow>(
    `SELECT id, reset_time FROM app_settings WHERE id = ?`,
    [SINGLETON_ID],
  );
  const row = rows[0];
  if (!row) return { resetTime: DEFAULT_RESET_TIME };
  return rowToSettings(row);
};

// Partial<AppSettings> で部分更新。 UPSERT で「行が無ければ insert / あれば update」
// を同時に表現する (= seed と独立に動く)。
export const updateAppSettings = async (
  db: DbClient,
  patch: Partial<AppSettings>,
): Promise<void> => {
  const current = await getAppSettings(db);
  const next: AppSettings = { ...current, ...patch };
  await db.run(
    `INSERT INTO app_settings (id, reset_time) VALUES (?, ?)
     ON CONFLICT(id) DO UPDATE SET reset_time = excluded.reset_time`,
    [SINGLETON_ID, next.resetTime],
  );
};
