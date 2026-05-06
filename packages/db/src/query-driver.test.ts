import { describe, expect, it } from 'vitest'
import { migrateDatabase, openDatabase, searchGames } from './index.js'
import { sqliteDatabaseToQuery } from './query-driver'

describe('sqliteDatabaseToQuery', () => {
  it('matches sync SQLite results for searchGames', async () => {
    const database = openDatabase()
    try {
      migrateDatabase(database)
      const direct = database
        .prepare('SELECT games.game_id AS gameId FROM games LIMIT 1')
        .all() as Array<{ gameId: string }>

      const q = sqliteDatabaseToQuery(database)
      const viaDriver = await searchGames(q, { limit: 1 })
      if (direct.length === 0) {
        expect(viaDriver.length).toBe(0)
      } else {
        expect(viaDriver[0]?.gameId).toBe(direct[0]?.gameId)
      }
    } finally {
      database.close()
    }
  })
})
