import type { SqliteDatabase } from './sqlite'

/**
 * 検索・チャットで使う非同期 DB ドライバ（ローカル SQLite / Cloudflare D1 の共通形）。
 * loader / migrate は引き続き同期の {@link SqliteDatabase} のみを使う。
 */
export type QueryStatement = {
  run: (...params: Array<string | number | null>) => Promise<unknown>
  get: (...params: Array<string | number | null>) => Promise<unknown>
  all: (...params: Array<string | number | null>) => Promise<unknown[]>
}

export type QueryDatabase = {
  exec: (sql: string) => Promise<void>
  prepare: (sql: string) => QueryStatement
  close: () => void
}

export function sqliteDatabaseToQuery(database: SqliteDatabase): QueryDatabase {
  return {
    exec: async (sql) => {
      database.exec(sql)
    },
    prepare: (sql) => {
      const statement = database.prepare(sql)
      return {
        run: async (...params) => statement.run(...params),
        get: async (...params) => statement.get(...params),
        all: async (...params) => statement.all(...params),
      }
    },
    close: () => {
      database.close()
    },
  }
}

export async function withTransactionAsync<T>(
  database: QueryDatabase,
  fn: () => Promise<T>,
): Promise<T> {
  await database.exec('BEGIN')
  try {
    const result = await fn()
    await database.exec('COMMIT')
    return result
  } catch (error) {
    await database.exec('ROLLBACK')
    throw error
  }
}
