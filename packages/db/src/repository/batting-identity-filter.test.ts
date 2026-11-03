import { describe, expect, it } from 'vitest'
import { openDatabase } from '../sqlite'
import { migrateDatabase } from '../migrations'
import { sqliteDatabaseToQuery } from '../query-driver'
import { searchBattingLines } from './batting-repository'

describe('BIS batting identity constraint without roster evidence', () => {
  it('retains the player ID when the roster lookup has no row', async () => {
    const database = openDatabase()
    try {
      migrateDatabase(database)
      const insert = database.prepare(`INSERT INTO player_batting_stats
        (year, team_id, team_name, player_key, player_id, player_name, row_index, values_json, source_url)
        VALUES (2025, 's', 'ヤクルト', ?, ?, ?, 0, '{}', 'https://npb.jp/bis/2025/stats/idb1_s.html')`)
      insert.run('first', 'first', '検証 一郎')
      insert.run('second', 'second', '検証 二郎')
      const query = sqliteDatabaseToQuery(database)
      const rows = await searchBattingLines(query, { year: 2025, player_id: 'first' })
      expect(rows).toHaveLength(1)
      expect(rows[0]?.playerId).toBe('first')
      expect(await searchBattingLines(query, { year: 2025, player_id: 'missing' })).toEqual([])
    } finally {
      database.close()
    }
  })
})
