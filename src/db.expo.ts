import * as SQLite from 'expo-sqlite';

import type { DbClient } from './db';

export const createExpoSqliteClient = async (
  databaseName = 'knockon.db',
): Promise<DbClient> => {
  const db = await SQLite.openDatabaseAsync(databaseName);
  return {
    exec: (sql) => db.execAsync(sql),
    run: async (sql, params) => {
      await db.runAsync(sql, ...(params as SQLite.SQLiteBindValue[] ?? []));
    },
    all: async <T>(sql: string, params?: readonly unknown[]) =>
      db.getAllAsync<T>(sql, ...(params as SQLite.SQLiteBindValue[] ?? [])),
    close: () => db.closeAsync(),
  };
};
