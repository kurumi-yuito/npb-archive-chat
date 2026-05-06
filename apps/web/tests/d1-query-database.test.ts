import { describe, expect, it } from 'vitest'
import type { D1Database } from '@cloudflare/workers-types'
import { searchGames } from '@npb/db'
import { createQueryDatabaseFromD1 } from '../server/utils/d1-query-database'

function createMockD1(rows: Record<string, unknown>[]): D1Database {
  return {
    exec: async () => {},
    prepare: (_sql: string) => ({
      bind: (..._params: unknown[]) => ({
        first: async () => rows[0] ?? null,
        all: async () => ({ results: rows }),
        run: async () => ({ success: true }),
      }),
    }),
  } as unknown as D1Database
}

describe('createQueryDatabaseFromD1', () => {
  it('routes searchGames through QueryDatabase', async () => {
    const row = {
      gameId: 'x-y-01',
      date: '2025-01-01',
      awayTeamName: 'A',
      homeTeamName: 'B',
      matchupText: 'A vs B',
    }
    const d1 = createMockD1([row])
    const q = createQueryDatabaseFromD1(d1)
    const result = await searchGames(q, { limit: 5 })
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      gameId: 'x-y-01',
      date: '2025-01-01',
    })
  })
})
