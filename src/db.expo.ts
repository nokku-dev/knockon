import * as SQLite from 'expo-sqlite';

import type { DbClient } from './db';

let cachedClient: Promise<DbClient> | null = null;

export const createExpoSqliteClient = async (
  databaseName = 'knockon.db',
): Promise<DbClient> => {
  const db = await SQLite.openDatabaseAsync(databaseName);
  // vanilla SQLite (expo-sqlite) は foreign_keys デフォルト OFF。
  // 接続単位の設定なので open 直後に毎回明示的に ON にする (PR-1.8a / K-018)。
  await db.execAsync('PRAGMA foreign_keys = ON;');
  return {
    exec: (sql) => db.execAsync(sql),
    run: async (sql, params) => {
      await db.runAsync(sql, ...((params ?? []) as SQLite.SQLiteBindValue[]));
    },
    all: async <T>(sql: string, params?: readonly unknown[]) =>
      db.getAllAsync<T>(sql, ...((params ?? []) as SQLite.SQLiteBindValue[])),
    close: () => db.closeAsync(),
  };
};

export const getExpoSqliteClient = (
  databaseName = 'knockon.db',
): Promise<DbClient> => {
  if (!cachedClient) {
    cachedClient = createExpoSqliteClient(databaseName);
  }
  return cachedClient;
};

export const resetExpoSqliteClientForTests = (): void => {
  cachedClient = null;
};
