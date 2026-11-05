import { describe, expect, it } from 'vitest'
import { openDatabase } from '../sqlite'
import { migrateDatabase } from '../migrations'
import { sqliteDatabaseToQuery } from '../query-driver'
import { aggregateOfficialBattingSeason } from './official-batting-aggregate'
import { canonicalLeagueTeamNames } from './team-name-utils'

describe('official whole-season batting aggregation', () => {
  it('requires every team source, combines only matching official IDs and keeps equal names separate', async () => {
    const database = openDatabase()
    try {
      migrateDatabase(database)
      const teams = canonicalLeagueTeamNames()
      const ids = ['g', 's', 'db', 'd', 't', 'c', 'f', 'e', 'l', 'm', 'b', 'h']
      const snapshot = database.prepare(`INSERT INTO official_statistic_snapshots
        (snapshot_id,source_url,target_year,team_id,team_name,level,statistic_kind,fetched_at,content_hash,raw_key,row_count)
        VALUES (?,?,2026,?,?,'first','batting','2026-11-04T00:00:00Z','hash','raw',1)`)
      const statistic = database.prepare(`INSERT INTO official_player_statistics(snapshot_id,row_index,player_id,player_name,normalized_name,metrics_json)
        VALUES (?,1,?,'検証 同名','検証同名',?)`)
      const query = sqliteDatabaseToQuery(database)
      for (const [index, team] of teams.entries()) {
        const id = ids[index]!
        snapshot.run(id, `https://npb.jp/bis/2026/stats/idb1_${id}.html`, id, team)
        const homeRuns = index === 0 ? 3 : index === 1 ? 4 : index === 11 ? 6 : 0
        statistic.run(id, index < 2 ? 'transfer-id' : `different-${id}`, JSON.stringify({ 試合: '10', 打席: '100', 打数: '100', 得点: '10', 安打: '30', 二塁打: '0', 三塁打: '0', 本塁打: String(homeRuns), 塁打: String(30 + 3 * homeRuns), 打点: '10', 盗塁: '0', 四球: '0', 死球: '0', 犠飛: '0', 三振: '10' }))
        if (index === 0) expect(await aggregateOfficialBattingSeason(query, { year: 2026, sort_by: 'homeRuns' })).toBeNull()
      }
      const rows = await aggregateOfficialBattingSeason(query, { year: 2026, sort_by: 'homeRuns', limit: 2 })
      expect(rows).toHaveLength(2)
      expect(rows![0]).toMatchObject({ total: 20, stats: { playerId: 'transfer-id', homeRuns: 7, evidenceStatus: 'official_complete_scope' } })
      expect(rows![1]).toMatchObject({ total: 10, stats: { playerId: 'different-h', homeRuns: 6 } })
      expect(JSON.parse(rows![0]!.stats.sourceUrls as string)).toHaveLength(2)
      expect(await aggregateOfficialBattingSeason(query, { year: 2026, level: 'farm' })).toBeNull()
      expect(await aggregateOfficialBattingSeason(query, { year: 2025 })).toBeNull()
      expect(await aggregateOfficialBattingSeason(query, { year: 2026, date_from: '2026-05-01' })).toBeNull()
      database.prepare("DELETE FROM official_player_statistics WHERE snapshot_id='h'").run()
      await expect(aggregateOfficialBattingSeason(query, { year: 2026 })).rejects.toThrow('completeness mismatch')
    } finally { database.close() }
  })
})
