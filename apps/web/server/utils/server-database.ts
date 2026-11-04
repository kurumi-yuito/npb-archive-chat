import type { QueryDatabase } from '@npb/db/query-driver'
import { sqliteDatabaseToQuery } from '@npb/db/query-driver'
import {
  createMultiYearQueryService,
  createSingleDatabaseQueryService,
  type ChatQueryService,
} from '@npb/db'
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
let multiYearCache: { dir: string; service: ChatQueryService } | null = null

type RequestD1State = { database: QueryDatabase; validation?: Promise<void> }
function requestD1State(event: H3Event, binding: D1Database, category: 'repository' | 'meta'): RequestD1State {
  const key = category === 'meta' ? 'npbMetaD1State' : 'npbSearchD1State'
  const context = event.context as typeof event.context & Record<string, RequestD1State | unknown>
  if (!context[key]) context[key] = { database: createQueryDatabaseFromD1(binding, category) }
  return context[key] as RequestD1State
}

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
    const state = requestD1State(event, d1, 'repository')
    if (!state.validation) {
      const database = state.database
      state.validation = (async () => {
        // This binding requires the normalized schema; absence must fail closed.
        // Optional-table discovery scans sqlite_master and adds no information here.
        const rows = await database.prepare(
          "SELECT metadata_key AS key, metadata_value AS value FROM normalized_runtime_metadata WHERE metadata_key IN ('schema_version', 'runtime_contract')",
        ).all() as Array<{ key: string; value: string }>
        const metadata = Object.fromEntries(rows.map((row) => [row.key, row.value]))
        if (metadata.schema_version !== 'phase5-normalized-v1' || metadata.runtime_contract !== 'normalized-only') {
          throw new Error('NPB_DB must be normalized D1 runtime schema phase5-normalized-v1')
        }
      })().catch((error) => {
        state.validation = undefined
        throw error
      })
    }
    await state.validation
    return state.database
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
    return requestD1State(event, d1, 'meta').database
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
