import { describe, expect, it } from 'vitest'
import { openDatabase } from '../sqlite'
import { migrateDatabase } from '../migrations'
import { sqliteDatabaseToQuery } from '../query-driver'
import { searchPlayerCandidates } from './player-repository'
import { searchPlayerAffiliations } from './player-affiliation-repository'
import { searchPlayerInformation } from './player-information-repository'

describe('official dictionary identity planning', () => {
  it('preserves both same-year team stints despite a legacy last-team value and an annual subtotal', async () => {
    const database = openDatabase()
    try {
      migrateDatabase(database)
      const sourceUrl = 'https://npb.jp/bis/players/transfer.html', fetchedAt = '2026-11-08T00:00:00.000Z'
      const evidence = { version: 1, playerId: 'transfer', fullName: '移籍 検証', sourceUrl, fetchedAt,
        contentHash: 'a'.repeat(64), rawKey: 'raw/profile.html', basisText: null,
        rows: [
          { kind: 'batting', scope: 'team_season', year: 2023, team: '中日', metrics: { 試合: '10' } },
          { kind: 'batting', scope: 'team_season', year: 2023, team: '日本ハム', metrics: { 試合: '40' } },
          { kind: 'batting', scope: 'season_total', year: 2023, team: null, metrics: { 試合: '50' } },
        ] }
      database.prepare(`INSERT INTO player_profiles(player_id,full_name,canonical_name,year_teams_json,source_url,fetched_at,metadata)
        VALUES ('transfer','移籍 検証','移籍 検証','{"2023":"日本ハム"}',?,?,?)`).run(sourceUrl, fetchedAt, JSON.stringify({ official_profile_evidence: evidence }))
      const query = sqliteDatabaseToQuery(database)
      expect(await searchPlayerCandidates(query, { name: '移籍', year: 2023, team: '中日', dictionaryOnly: true })).toMatchObject([{ player_id: 'transfer', teams: ['中日'], years: [2023] }])
      expect(await searchPlayerCandidates(query, { name: '移籍', year: 2024, team: '中日', dictionaryOnly: true })).toEqual([])
      const affiliations = await searchPlayerAffiliations(query, { player_id: 'transfer', player_name: '移籍 検証', year: 2023, dictionaryOnly: true })
      expect(affiliations.map((row) => row.team).sort()).toEqual(['中日', '日本ハム'])
      expect((await searchPlayerInformation(query, { player_id: 'transfer', year: 2023 }))[0]!.affiliations.map((row) => row.team).sort()).toEqual(['中日', '日本ハム'])
      database.prepare("UPDATE player_profiles SET metadata=? WHERE player_id='transfer'").run(JSON.stringify({ official_profile_evidence: 'malformed' }))
      expect(await searchPlayerCandidates(query, { name: '移籍', year: 2023, team: '日本ハム', dictionaryOnly: true })).toEqual([])
      expect(await searchPlayerAffiliations(query, { player_id: 'transfer', player_name: '移籍 検証', dictionaryOnly: true })).toEqual([])
    } finally { database.close() }
  })
  it('returns dated official affiliation proof without inventing a game or a transfer date', async () => {
    const database = openDatabase()
    try {
      migrateDatabase(database)
      database.prepare(`INSERT INTO player_profiles(player_id,full_name,year_teams_json,source_url)
        VALUES ('one','検証 太郎','{"2024":"ヤクルト","2025":["ヤクルト","阪神"]}','https://npb.jp/bis/players/one.html')`).run()
      const driver = sqliteDatabaseToQuery(database)
      const queries: string[] = []
      const query = { ...driver, prepare: (sql: string) => { queries.push(sql); return driver.prepare(sql) } }
      const rows = await searchPlayerAffiliations(query, { player_name: '検証 太郎', player_id: 'one', year: 2025, dictionaryOnly: true })
      expect(rows).toHaveLength(2)
      expect(rows.every((row) => row.gameDate === null && row.gameId === null && row.year === 2025 && row.sourceKind === 'official_profile')).toBe(true)
      expect(queries.every((sql) => !/\b(?:games|roster_entries|batting_lines|pitching_lines|events)\b/u.test(sql))).toBe(true)
      expect(await searchPlayerAffiliations(query, { player_name: '検証 太郎', player_id: 'one', year: 2024, team: '阪神', dictionaryOnly: true })).toEqual([])
    } finally { database.close() }
  })

  it('uses indexed official names and paired season/team proof without reading appearance facts', async () => {
    const database = openDatabase()
    try {
      migrateDatabase(database)
      const insert = database.prepare(`INSERT INTO player_profiles(player_id,full_name,canonical_name,team_name,year_teams_json,source_url)
        VALUES (?,?,?,?,?,?)`)
      insert.run('one', '検証 太郎', '検証 太郎', '阪神', '{"2024":"ヤクルト","2025":["ヤクルト","阪 神"]}', 'https://npb.jp/bis/players/one.html')
      insert.run('two', '検証 次郎', '検証 次郎', 'ヤクルト', '{"2020":"ヤクルト"}', 'https://npb.jp/bis/players/two.html')
      insert.run('unverified', '検証 三郎', '検証 三郎', 'ヤクルト', '{"2025":"ヤクルト"}', 'https://example.test/')
      const driver = sqliteDatabaseToQuery(database)
      const query = { ...driver, prepare: (sql: string) => {
        expect(sql).not.toMatch(/\b(?:person_names|\w+_facts|events|batting_lines|pitching_lines|roster_entries)\b/u)
        return driver.prepare(sql)
      } }
      const filters = { name: '検証', year: 2025, team: 'ヤクルト', dictionaryOnly: true }
      expect(await searchPlayerCandidates(query, filters)).toMatchObject([{ player_id: 'one', teams: ['ヤクルト'], years: [2025] }])
      expect(await searchPlayerCandidates(query, { ...filters, year: 2024, team: '阪神' })).toEqual([])
      expect(await searchPlayerCandidates(query, { ...filters, team: '阪神' })).toMatchObject([{ player_id: 'one', teams: ['阪 神'], years: [2025] }])
      expect(await searchPlayerCandidates(query, { name: '検証', dictionaryOnly: true })).toHaveLength(2)
      // A code-only release must also work against the older published schema.
      database.exec('DROP INDEX idx_player_profiles_identity_key')
      expect(await searchPlayerCandidates(query, filters)).toMatchObject([{ player_id: 'one', teams: ['ヤクルト'], years: [2025] }])
      expect(await searchPlayerCandidates(query, { ...filters, year: 2024, team: '阪神' })).toEqual([])
    } finally { database.close() }
  })

  it('keeps a verified registered-name alias attached to its ID without merging namesakes', async () => {
    const database = openDatabase()
    try {
      migrateDatabase(database)
      for (const id of ['one', 'two']) {
        database.prepare(`INSERT INTO player_profiles(player_id,full_name,canonical_name,year_teams_json,source_url)
          VALUES (?,?,?,'{"2025":"ヤクルト"}',?)`).run(id, `正式 ${id}`, `正式 ${id}`, `https://npb.jp/bis/players/${id}.html`)
        database.prepare(`INSERT INTO player_aliases(player_id,alias,normalized_alias,alias_type,source_type)
          VALUES (?,'登録名','登録名','registered_name','player_profile')`).run(id)
      }
      const rows = await searchPlayerCandidates(sqliteDatabaseToQuery(database), { name: '登録名', dictionaryOnly: true, year: 2025 })
      expect(rows).toHaveLength(2)
      expect(rows.map((row) => row.player_id)).toEqual(['one', 'two'])
      expect(rows.every((row) => row.matched_aliases?.includes('登録名'))).toBe(true)
    } finally { database.close() }
  })
})
