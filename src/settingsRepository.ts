import type { DbClient } from './db';

// ADR-0028 (PR-DD): app_settings (singleton) のラウンドトリップ。
// id='singleton' で 1 行固定。 新規設定は ALTER TABLE で列追加 (ADR-0027 ALTER 経路)。
// ADR-0029 (Issue #53): theme_mode 追加 ('auto' | 'light' | 'dark')。

export type ThemeMode = 'auto' | 'light' | 'dark';

export type AppSettings = {
  resetTime: string; // 'HH:MM' 形式。 デフォルト '00:00'。
  themeMode: ThemeMode; // 'auto' = OS の colorScheme 追従、 'light' / 'dark' = 固定。
  // #72 (SPEC §5): 初回ルート (onboarding) を通したか。新規ユーザーは false で起動 →
  // onboarding へ誘導、完了で true。既存ユーザーは MIGRATIONS[8] で true 初期化。
  onboardingCompleted: boolean;
};

type AppSettingsRow = {
  id: string;
  reset_time: string;
  theme_mode: ThemeMode;
  onboarding_completed: number; // SQLite は 0/1 で保持
};

const SINGLETON_ID = 'singleton';
export const DEFAULT_RESET_TIME = '00:00';
export const DEFAULT_THEME_MODE: ThemeMode = 'auto';

const rowToSettings = (r: AppSettingsRow): AppSettings => ({
  resetTime: r.reset_time,
  themeMode: r.theme_mode,
  onboardingCompleted: r.onboarding_completed === 1,
});

// schema seed で必ず 1 行入っている前提だが、 万一 row が無い場合は default を返す
// (= 起動 race / 手動 DB 改ざんに対する silent fallback、 K-024 同型受容)。
// 行が無い fallback は「新規ユーザー扱い」= onboardingCompleted false (= onboarding へ誘導)。
export const getAppSettings = async (db: DbClient): Promise<AppSettings> => {
  const rows = await db.all<AppSettingsRow>(
    `SELECT id, reset_time, theme_mode, onboarding_completed FROM app_settings WHERE id = ?`,
    [SINGLETON_ID],
  );
  const row = rows[0];
  if (!row) {
    return {
      resetTime: DEFAULT_RESET_TIME,
      themeMode: DEFAULT_THEME_MODE,
      onboardingCompleted: false,
    };
  }
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
    `INSERT INTO app_settings (id, reset_time, theme_mode, onboarding_completed) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET reset_time = excluded.reset_time, theme_mode = excluded.theme_mode, onboarding_completed = excluded.onboarding_completed`,
    [SINGLETON_ID, next.resetTime, next.themeMode, next.onboardingCompleted ? 1 : 0],
  );
};
