import { describe, expect, it } from 'vitest'
import { openDatabase } from '../sqlite'
import { migrateDatabase } from '../migrations'
import { sqliteDatabaseToQuery } from '../query-driver'
import { aggregateOfficialPitchingSeason } from './official-pitching-aggregate'

describe('official season pitching evidence', () => {
  it('uses the requested level and exact outs, retaining an undefined ERA for zero innings', async () => {
    const database = openDatabase()
    try {
      migrateDatabase(database)
      const snapshot = database.prepare(`INSERT INTO official_statistic_snapshots
        (snapshot_id,source_url,target_year,team_id,team_name,level,statistic_kind,fetched_at,content_hash,raw_key,row_count)
        VALUES (?,?,2026,'h','ソフトバンク',?,'pitching','2026-11-04T00:00:00Z','hash','raw',2)`)
      const row = database.prepare(`INSERT INTO official_player_statistics
        (snapshot_id,row_index,player_id,player_name,normalized_name,metrics_json) VALUES (?,?,?,?,?,?)`)
      for (const level of ['first', 'farm'] as const) {
        snapshot.run(level, `https://npb.jp/bis/2026/stats/idp${level === 'first' ? 1 : 2}_h.html`, level)
        for (const [index, id] of ['pitcher-a', 'pitcher-b'].entries()) {
          row.run(level, index + 1, id, id, id, JSON.stringify({ 登板: '2', 勝利: '1', 敗北: '0', セーブ: '0', 三振: '2',
            安打: '3', 本塁打: '0', 四球: '1', 死球: '0', 自責点: '1', 失点: '1', 打者: '15',
            投球回: index === 1 ? '0+' : level === 'farm' ? '3.1' : '6.2' }))
        }
      }
      const query = sqliteDatabaseToQuery(database)
      const farm = await aggregateOfficialPitchingSeason(query, { year: 2026, team: 'ソフトバンク', level: 'farm', pitcher_player_ids: ['pitcher-a', 'pitcher-b'], sort_by: 'era' })
      expect(farm).toHaveLength(2)
      expect(farm![0]).toMatchObject({ stats: { playerId: 'pitcher-a', inningsPitched: 10 / 3, era: 2.7, whip: 1.2, level: 'farm' } })
      expect(farm![1]).toMatchObject({ stats: { playerId: 'pitcher-b', inningsPitched: 0, era: null, whip: null } })
      const first = await aggregateOfficialPitchingSeason(query, { year: 2026, team: 'ソフトバンク', pitcher_player_id: 'pitcher-a' })
      expect(first![0]!.stats.inningsPitched).toBe(20 / 3)
      expect(await aggregateOfficialPitchingSeason(query, { year: 2025, team: 'ソフトバンク', pitcher_player_id: 'pitcher-a' })).toBeNull()
      expect(await aggregateOfficialPitchingSeason(query, { year: 2026, team: 'ソフトバンク', pitcher_player_id: 'pitcher-a', date_from: '2026-05-01' })).toBeNull()
      const ordered = await aggregateOfficialPitchingSeason(query, { year: 2026, team: 'ソフトバンク', pitcher_player_ids: ['pitcher-a', 'pitcher-b'], sort_by: 'inningsPitched' })
      expect(ordered!.map((entry) => entry.stats.playerId)).toEqual(['pitcher-a', 'pitcher-b'])
    } finally { database.close() }
  })
})
