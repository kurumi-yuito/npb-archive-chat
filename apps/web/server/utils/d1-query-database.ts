import type { QueryDatabase } from '@npb/db'
import type { D1Database } from '@cloudflare/workers-types'

/**
 * Cloudflare D1 を {@link QueryDatabase} に適合させる（binding 名は wrangler の `NPB_DB`）。
 */
export function createQueryDatabaseFromD1(d1: D1Database): QueryDatabase {
  return {
    exec: async (sql) => {
      await d1.exec(sql)
    },
    prepare: (sql) => ({
      run: async (...params) => {
        const stmt = d1.prepare(sql)
        return await stmt.bind(...params).run()
      },
      get: async (...params) => {
        const stmt = d1.prepare(sql)
        return await stmt.bind(...params).first()
      },
      all: async (...params) => {
        const stmt = d1.prepare(sql)
        const result = await stmt.bind(...params).all()
        return result.results as unknown[]
      },
    }),
    close: () => {},
  }
}
