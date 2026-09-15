import { describe, expect, it } from 'vitest'
import { migrateDatabase, openDatabase, sqliteDatabaseToQuery } from './index.js'
import { aggregateBattingLines } from './repository/aggregate-repository'

describe('batting aggregation record selection', () => {
  it('excludes imported headings before ranking legitimate season records', async () => {
    const database = openDatabase(':memory:')
    migrateDatabase(database)
    try {
      const insert = database.prepare(`INSERT INTO player_batting_stats
        (year, team_id, team_name, player_key, player_name, row_index, values_json, source_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      insert.run(2023, 't', '阪神タイガース', 'heading', '個人守備 |', 1,
        JSON.stringify({ 本塁打: '999' }), 'https://npb.jp/bis/2023/stats/idb1_t.html')
      insert.run(2023, 't', '阪神タイガース', 'batter', '打者 一郎', 2,
        JSON.stringify({ 試合: '100', 打数: '300', 安打: '90', 本塁打: '20' }),
        'https://npb.jp/bis/2023/stats/idb1_t.html')
      const rows = await aggregateBattingLines(sqliteDatabaseToQuery(database), {
        year_from: 2022, year_to: 2024, sort_by: 'homeRuns', limit: 1,
      })
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ label: '打者 一郎', stats: { homeRuns: 20, games: 100 } })
    } finally {
      database.close()
    }
  })
})
