import { describe, expect, it } from 'vitest'
import { openDatabase } from '../sqlite'
import { migrateDatabase } from '../migrations'
import { sqliteDatabaseToQuery } from '../query-driver'
import { searchPlayerInformation } from './player-information-repository'

describe('official player introduction evidence', () => {
  it('keeps the latest annual basic statistics separate from the current roster year and excludes another player', async () => {
    const database = openDatabase()
    try {
      migrateDatabase(database)
      database.prepare(`INSERT INTO player_profiles(player_id,full_name,source_url,year_teams_json)
        VALUES ('proof-id','検証 太郎','https://npb.jp/bis/players/proof-id.html','{"2024":"阪神","2025":"阪神"}')`).run()
      const snapshot = database.prepare(`INSERT INTO official_statistic_snapshots
        (snapshot_id,source_url,target_year,team_id,team_name,level,statistic_kind,fetched_at,content_hash,raw_key,row_count)
        VALUES (?,?,?,'t','阪神タイガース','first','batting',?,'hash','raw',2)`)
      const row = database.prepare(`INSERT INTO official_player_statistics
        (snapshot_id,row_index,player_id,player_name,normalized_name,metrics_json) VALUES (?,? ,?,?,?,?)`)
      for (const [id, year, rate] of [['old', 2024, '.200'], ['new', 2025, '.300']] as const) {
        snapshot.run(id, `https://npb.jp/bis/${year}/stats/idb1_t.html`, year, `${year}-12-01T00:00:00Z`)
        row.run(id, 1, 'proof-id', '検証 太郎', '検証太郎', JSON.stringify({ 打率: rate, 本塁打: '10' }))
        row.run(id, 2, 'namesake-id', '検証 太郎', '検証太郎', JSON.stringify({ 打率: '.999' }))
      }
      const query = sqliteDatabaseToQuery(database)
      const [profile] = await searchPlayerInformation(query, { player_id: 'proof-id', player_name: '登録名' })
      expect(profile!.statistics).toHaveLength(1)
      expect(profile!.statistics![0]).toMatchObject({ year: 2025, metrics: { 打率: '.300' }, sourceUrl: 'https://npb.jp/bis/2025/stats/idb1_t.html' })
      expect(profile!.sourceUrls).toContain('https://npb.jp/bis/2025/stats/idb1_t.html')
      const [historical] = await searchPlayerInformation(query, { player_id: 'proof-id', player_name: '登録名', year: 2024 })
      expect(historical!.statistics![0]).toMatchObject({ year: 2024, metrics: { 打率: '.200' } })
      expect(await searchPlayerInformation(query, { player_id: 'unknown-id', player_name: '検証' })).toEqual([])
    } finally { database.close() }
  })
})
