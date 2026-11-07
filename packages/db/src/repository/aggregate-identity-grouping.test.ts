import { describe, expect, it } from 'vitest'
import { migrateDatabase } from '../migrations'
import { openDatabase } from '../sqlite'
import { sqliteDatabaseToQuery } from '../query-driver'
import { aggregateBattingLines } from './aggregate-repository'
import { resolveSeasonFactIdentities } from './resolve-season-fact-identities'

describe('verified identity grouping in appearance aggregates', () => {
  it('combines linked and unlinked lines only with a unique official identity for that season and team', async () => {
    const database = openDatabase()
    try {
      migrateDatabase(database, new URL('../../migrations-normalized/', import.meta.url).pathname)
      database.exec(`INSERT INTO teams(team_id,team_name) VALUES(1,'阪神');
        INSERT INTO person_names(name_id,name) VALUES(1,'検証');
        INSERT INTO game_facts(game_id,schema_version,year,mmdd,game_date,loaded_at) VALUES
          ('sample-a',1,2025,'0501','2025-05-01','2026-11-06'),('sample-b',1,2025,'0502','2025-05-02','2026-11-06');
        INSERT INTO batting_line_facts(game_id,team_id,row_index,player_id,player_name_id,at_bats,runs,hits,runs_batted_in,stolen_bases) VALUES
          ('sample-a',1,1,'11111111',1,4,1,2,1,0),('sample-b',1,1,NULL,1,3,0,1,0,0);`)
      const profile = database.prepare(`INSERT INTO player_profiles(player_id,full_name,canonical_name,team_name,year_teams_json,source_url,fetched_at,metadata) VALUES(?,?,?,'阪神',?,?, '2026-11-06',?)`)
      const insert = (id: string, name: string, membership: Record<string, string>) => profile.run(id, name, name, JSON.stringify(membership),
        `https://npb.jp/bis/players/${id}.html`, JSON.stringify({ official_profile_evidence: { playerId: id, rows: Object.entries(membership).map(([year, team]) => ({ scope: 'team_season', year: Number(year), team })) } }))
      insert('11111111', '検証 甲', { '2025': '阪神' })
      const query = sqliteDatabaseToQuery(database), filters = { date_from: '2025-05-01', date_to: '2025-05-31', sort_by: 'hits' as const }
      const combined = await aggregateBattingLines(query, filters)
      expect(combined).toHaveLength(1)
      expect(combined[0]!.stats).toMatchObject({ games: 2, atBats: 7, hits: 3, playerId: '11111111' })
      expect(combined[0]!.label).toBe('検証 甲')
      database.prepare('UPDATE player_profiles SET metadata=? WHERE player_id=?').run(JSON.stringify({ official_profile_evidence: { playerId: '11111111', rows: [
        { scope: 'team_season', year: 2025, team: '阪神' }, { scope: 'team_season', year: 2025, team: '巨人' },
      ] } }), '11111111')
      const transferred = await resolveSeasonFactIdentities(query, [{ player_name_id: 1, team_id: 2, year: 2025, name: '検証', team: '巨人' }])
      expect(transferred.map((row) => row.player_id)).toEqual(['11111111'])
      insert('22222222', '検証 乙', { '2024': '阪神', '2025': '巨人' })
      expect(await aggregateBattingLines(query, filters)).toHaveLength(1)
      database.prepare('UPDATE player_profiles SET year_teams_json=?,metadata=? WHERE player_id=?').run(JSON.stringify({ '2025': '阪神' }), JSON.stringify({ official_profile_evidence: { playerId: '22222222', rows: [{ scope: 'team_season', year: 2025, team: '阪神' }] } }), '22222222')
      const ambiguous = await aggregateBattingLines(query, filters)
      expect(ambiguous).toHaveLength(2)
      expect(ambiguous.map((row) => row.stats.hits).sort()).toEqual([1, 2])
      database.prepare('DELETE FROM player_profiles WHERE player_id=?').run('22222222')
      database.prepare('UPDATE player_profiles SET metadata=? WHERE player_id=?').run('{}', '11111111')
      expect(await aggregateBattingLines(query, filters)).toHaveLength(2)
    } finally { database.close() }
  })
})
