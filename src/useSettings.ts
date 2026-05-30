import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { getExpoSqliteClient } from './db.expo';
import {
  AppSettings,
  DEFAULT_RESET_TIME,
  getAppSettings,
  updateAppSettings,
} from './settingsRepository';

// ADR-0028 (PR-DD): app_settings の read/write 用 hook。
// useFocusEffect で開かれるたびに DB から最新値を読み出す (他経路で書き換えられた
// 場合に追従)。 書き込みは Promise を返して呼び出し側が await/エラー処理できる。

export type UseSettingsResult = {
  settings: AppSettings | null;
  error: string | null;
  loading: boolean;
  updateResetTime: (resetTime: string) => Promise<void>;
};

export const useSettings = (): UseSettingsResult => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      (async () => {
        try {
          const db = await getExpoSqliteClient();
          const s = await getAppSettings(db);
          if (!cancelled) {
            setSettings(s);
            setError(null);
          }
        } catch (e: unknown) {
          if (!cancelled) {
            setSettings({ resetTime: DEFAULT_RESET_TIME });
            setError(e instanceof Error ? e.message : String(e));
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const updateResetTime = useCallback(async (resetTime: string) => {
    try {
      const db = await getExpoSqliteClient();
      await updateAppSettings(db, { resetTime });
      setSettings((prev) =>
        prev ? { ...prev, resetTime } : { resetTime },
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    }
  }, []);

  return { settings, error, loading, updateResetTime };
};
