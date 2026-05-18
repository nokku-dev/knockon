import Database from 'better-sqlite3';

import type { DbClient } from './db';

export const createBetterSqliteClient = (
  filename: string = ':memory:',
): DbClient => {
  const db = new Database(filename);
  db.pragma('foreign_keys = ON');
  return {
    exec: async (sql) => {
      db.exec(sql);
    },
    run: async (sql, params = []) => {
      db.prepare(sql).run(...(params as unknown[]));
    },
    all: async <T>(sql: string, params: readonly unknown[] = []) =>
      db.prepare(sql).all(...(params as unknown[])) as T[],
    close: async () => {
      db.close();
    },
  };
};
