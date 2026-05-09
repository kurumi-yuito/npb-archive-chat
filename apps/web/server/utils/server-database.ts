import type { QueryDatabase } from '@npb/db/query-driver'
import { sqliteDatabaseToQuery } from '@npb/db/query-driver'
import { createMultiYearQueryService, createSingleDatabaseQueryService, type ChatQueryService } from '@npb/db'
import type { D1Database } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import path from 'node:path'
import { createQueryDatabaseFromD1 } from './d1-query-database'

type CloudflareContext = {
  env?: {
    NPB_DB?: D1Database
    NPB_META_DB?: D1Database
  }
}

let sqliteCache: { path: string; db: QueryDatabase } | null = null
let d1Cache: QueryDatabase | null = null
let metaD1Cache: QueryDatabase | null = null
let multiYearCache: { dir: string; service: ChatQueryService } | null = null

async function getSqlite() {
  await import('node:sqlite')
  return import('@npb/db/sqlite-stack')
}

/**
 * ローカル: `NPB_SQLITE_PATH` で SQLite を開き migrate してから Query にラップ。
 * Workers: `event.context.cloudflare.env.NPB_DB`（D1）を使用。マイグレーションはデプロイ時に wrangler 等で適用済み想定。
 */
export async function getServerDatabase(
  event: H3Event,
  sqlitePath: string,
): Promise<QueryDatabase> {
  const cloudflare = event.context.cloudflare as CloudflareContext | undefined
  const d1 = cloudflare?.env?.NPB_DB
  if (d1) {
    if (!d1Cache) {
      d1Cache = createQueryDatabaseFromD1(d1)
    }
    return d1Cache
  }

  if (!sqlitePath) {
    throw new Error('NPB_SQLITE_PATH / runtimeConfig.npbSqlitePath is not set (no D1 binding)')
  }

  if (sqliteCache && sqliteCache.path === sqlitePath) {
    return sqliteCache.db
  }

  const { openDatabase, migrateDatabase } = await getSqlite()
  const raw = openDatabase(sqlitePath)
  migrateDatabase(raw)
  const db = sqliteDatabaseToQuery(raw)
  sqliteCache = { path: sqlitePath, db }
  return db
}

export async function getServerMetaDatabase(
  event: H3Event,
  sqlitePath: string,
): Promise<QueryDatabase> {
  const cloudflare = event.context.cloudflare as CloudflareContext | undefined
  const d1 = cloudflare?.env?.NPB_META_DB
  if (d1) {
    if (!metaD1Cache) {
      metaD1Cache = createQueryDatabaseFromD1(d1)
    }
    return metaD1Cache
  }

  return getServerDatabase(event, sqlitePath)
}

export async function getServerChatQueryService(
  event: H3Event,
  sqlitePath: string,
  sqliteDir = '',
): Promise<ChatQueryService> {
  const cloudflare = event.context.cloudflare as CloudflareContext | undefined
  const d1 = cloudflare?.env?.NPB_DB
  if (d1) {
    return createSingleDatabaseQueryService(await getServerDatabase(event, sqlitePath))
  }

  const resolvedDir = sqliteDir || (sqlitePath ? path.dirname(sqlitePath) : '')
  if (!resolvedDir) {
    throw new Error('NPB_SQLITE_DIR or NPB_SQLITE_PATH is not set (no D1 binding)')
  }

  if (multiYearCache && multiYearCache.dir === resolvedDir) {
    return multiYearCache.service
  }

  const service = createMultiYearQueryService({ sqliteDir: resolvedDir })
  multiYearCache = { dir: resolvedDir, service }
  return service
}
