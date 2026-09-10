import type { QueryDatabase } from '@npb/db'
import type { D1Database } from '@cloudflare/workers-types'
import { measureD1, type D1ReadCategory } from './d1-read-audit'

/**
 * Cloudflare D1 を {@link QueryDatabase} に適合させる（binding 名は wrangler の `NPB_DB`）。
 */
export function createQueryDatabaseFromD1(d1: D1Database, category: D1ReadCategory = 'repository'): QueryDatabase {
  return {
    exec: async (sql) => {
      await measureD1(category, sql, [], async () => {
        await d1.exec(sql)
        // D1 exec does not expose rows_read. Record it as unmeasured if used.
        return { meta: undefined }
      })
    },
    prepare: (sql) => ({
      run: async (...params) => {
        const stmt = d1.prepare(sql)
        return await measureD1(category, sql, params, () => stmt.bind(...params).run())
      },
      get: async (...params) => {
        const stmt = d1.prepare(sql)
        const result = await measureD1(category, sql, params, () => stmt.bind(...params).all())
        return result.results[0] ?? null
      },
      all: async (...params) => {
        const stmt = d1.prepare(sql)
        const result = await measureD1(category, sql, params, () => stmt.bind(...params).all())
        return result.results as unknown[]
      },
    }),
    close: () => {},
  }
}
