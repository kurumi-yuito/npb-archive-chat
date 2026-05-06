import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

type SqliteStatement = {
  run: (...params: Array<string | number | null>) => unknown
  get: (...params: Array<string | number | null>) => unknown
  all: (...params: Array<string | number | null>) => unknown[]
}

export type SqliteDatabase = {
  exec: (sql: string) => void
  prepare: (sql: string) => SqliteStatement
  close: () => void
}

export function openDatabase(databasePath = ':memory:'): SqliteDatabase {
  const require = createRequire(import.meta.url)
  const { DatabaseSync } = require('node:sqlite') as {
    DatabaseSync: new (path: string) => SqliteDatabase
  }

  if (databasePath !== ':memory:') {
    mkdirSync(path.dirname(databasePath), { recursive: true })
  }

  const database = new DatabaseSync(databasePath)
  database.exec('PRAGMA foreign_keys = ON')
  if (databasePath !== ':memory:') {
    database.exec('PRAGMA journal_mode = WAL')
    database.exec('PRAGMA synchronous = NORMAL')
    database.exec('PRAGMA busy_timeout = 60000')
  }
  return database
}

export function withTransaction<T>(database: SqliteDatabase, fn: () => T): T {
  database.exec('BEGIN')

  try {
    const result = fn()
    database.exec('COMMIT')
    return result
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}
