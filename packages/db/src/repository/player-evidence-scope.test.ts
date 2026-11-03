import { describe, expect, it } from 'vitest'
import { openDatabase } from '../sqlite'
import { migrateDatabase } from '../migrations'
import { sqliteDatabaseToQuery } from '../query-driver'
import { searchPlayerCandidates } from './player-repository'

describe('dated identity evidence', () => {
  it('does not reintroduce a retired namesake from profiles', async () => {
    const database = openDatabase()
    try {
      migrateDatabase(database)
      const profile = database.prepare(`INSERT INTO player_profiles
        (player_id, full_name, team_name, year_teams_json, source_url) VALUES (?, ?, ?, ?, ?)`)
      profile.run('91895133', '山田 哲人', 'ヤクルト', '{"2025":"ヤクルト"}', 'https://npb.jp/bis/players/91895133.html')
      profile.run('11815114', '山田 大樹', 'ヤクルト', '{"2020":"ヤクルト"}', 'https://npb.jp/bis/players/11815114.html')
      const stat = database.prepare(`INSERT INTO player_batting_stats
        (year, team_id, team_name, player_key, player_id, player_name, row_index, values_json, source_url)
        VALUES (?, 's', 'ヤクルト', ?, ?, ?, 0, '{}', 'https://npb.jp/bis/2025/stats/idb1_s.html')`)
      stat.run(2025, '91895133', '91895133', '山田')
      stat.run(2020, '11815114', '11815114', '山田')

      const candidates = await searchPlayerCandidates(sqliteDatabaseToQuery(database), {
        name: '山田', year: 2025, team: 'ヤクルト', searchDomain: 'batting', scopeToEvidence: true,
      })
      expect(candidates).toHaveLength(1)
      expect(candidates[0]).toMatchObject({ player_id: '91895133', years: [2025], teams: ['ヤクルト'] })
    } finally {
      database.close()
    }
  })

  it('keeps team and year paired, including two teams within one season', async () => {
    const database = openDatabase()
    try {
      migrateDatabase(database)
      database.prepare(`INSERT INTO player_profiles
        (player_id, full_name, team_name, year_teams_json, source_url)
        VALUES ('test-transfer', '検証 選手', '阪神', '{"2024":"ヤクルト","2025":"阪神"}',
        'https://npb.jp/bis/players/test-transfer.html')`).run()
      const stat = database.prepare(`INSERT INTO player_batting_stats
        (year, team_id, team_name, player_key, player_id, player_name, row_index, values_json, source_url)
        VALUES (?, ?, ?, 'test-transfer', 'test-transfer', '検証', 0, '{}', 'https://npb.jp/bis/')`)
      stat.run(2024, 's', 'ヤクルト')
      stat.run(2025, 't', '阪神')
      const query = sqliteDatabaseToQuery(database)
      const filters = { name: '検証', year: 2025, team: 'ヤクルト', searchDomain: 'batting' as const, scopeToEvidence: true }
      expect(await searchPlayerCandidates(query, filters)).toEqual([])
      stat.run(2025, 's', 'ヤクルト')
      expect(await searchPlayerCandidates(query, filters)).toMatchObject([{ player_id: 'test-transfer', teams: ['ヤクルト'], years: [2025] }])
      expect(await searchPlayerCandidates(query, { ...filters, team: '阪神' })).toMatchObject([{ player_id: 'test-transfer', teams: ['阪神'], years: [2025] }])
    } finally {
      database.close()
    }
  })
})
