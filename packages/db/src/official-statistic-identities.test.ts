import { describe, expect, it } from 'vitest'
import { openDatabase } from './sqlite'
import { migrateDatabase } from './migrations'
import { officialStatisticIdentityIndex } from './official-statistic-identities'

describe('dated official statistic name candidates', () => {
  it('omits Latin initials only as a candidate key and keeps year/team ambiguity and same-year transfers', () => {
    const database = openDatabase()
    try {
      migrateDatabase(database)
      const insert = (id: string, name: string, years: Record<string, string>, extraTeams: string[] = []) => {
        const sourceUrl = `https://npb.jp/bis/players/${id}.html`
        const evidence = { version: 1, playerId: id, fullName: name, sourceUrl, fetchedAt: '2026-11-04T00:00:00Z', contentHash: 'a'.repeat(64),
          rawKey: `raw/bis-player-profiles/${id}/${'a'.repeat(64)}.html`, basisText: null,
          rows: extraTeams.map((team) => ({ kind: 'batting', scope: 'team_season', year: 2025, seasonLabel: '2025', team, metrics: { 試合: '1' } })) }
        database.prepare('INSERT INTO player_profiles(player_id,full_name,source_url,year_teams_json,metadata,fetched_at) VALUES(?,?,?,?,?,?)')
          .run(id, name, sourceUrl, JSON.stringify(years), JSON.stringify({ official_profile_evidence: evidence }), evidence.fetchedAt)
      }
      insert('11111111', 'Ａ．検証', { '2024': '巨人', '2025': '阪神' }, ['阪神', '巨人'])
      insert('22222222', 'Ｂ．検証', { '2024': '阪神', '2025': 'ソフトバンク' })
      let index = officialStatisticIdentityIndex(database)
      expect(index.resolve('検証', { year: 2025, teamName: '阪神' })).toBe('11111111')
      expect(index.resolve('検証', { year: 2024, teamName: '阪神' })).toBe('22222222')
      expect(index.resolve('検証', { year: 2025, teamName: '巨人' })).toBe('11111111')
      expect(index.resolve('検証', { year: 2026, teamName: '阪神' })).toBeNull()
      expect(index.resolve('検証', { year: 2025, teamName: 'ヤクルト' })).toBeNull()
      insert('33333333', 'Ｃ．検証', { '2025': '阪神' })
      insert('44444444', '別姓 甲', { '2025': '阪神' })
      index = officialStatisticIdentityIndex(database)
      expect(index.resolve('検証', { year: 2025, teamName: '阪神' })).toBeNull()
      expect(index.resolve('別姓', { year: 2025, teamName: '阪神' })).toBeNull()
      expect(index.resolve('A.検証', { year: 2025, teamName: '阪神' })).toBe('11111111')
      expect(index.resolve('検証', { year: 2025, teamName: '阪神', level: 'first' })).toBe('11111111')
      expect(index.resolve('検証', { year: 2025, teamName: '阪神', level: 'farm' })).toBeNull()
    } finally { database.close() }
  })
})
