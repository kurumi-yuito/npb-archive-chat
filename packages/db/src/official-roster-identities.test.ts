import { describe, expect, it, vi } from 'vitest'
import { emptyBisCurrentDataset } from '@npb/parser'
import { openDatabase } from './sqlite'
import { migrateDatabase } from './migrations'
import { captureOfficialRoster } from './official-roster'
import { loadBisCurrentDataset } from './bis-current'
import { verifiedOfficialRosterIdentities } from './official-roster-identities'
import { officialStatisticIdentityIndex } from './official-statistic-identities'
import type { ObjectStorage } from './object-storage'
import { sqliteDatabaseToQuery } from './query-driver'
import { searchPlayerCandidates } from './repository/player-repository'

describe('dated official roster identity proof', () => {
  it('uses an archived official ID/name pair for its published year and rejects a backdated current page', async () => {
    const database = openDatabase()
    const files = new Map<string, string>()
    const storage = { putText: async (key: string, text: string) => { files.set(key, text); return key }, getText: async (key: string) => files.get(key) ?? null } as unknown as ObjectStorage
    const html = `<title>2026年度 選手一覧 東京ヤクルトスワローズ</title><table><tr><th>No.</th><th>投手</th></tr>
      <tr><td>10</td><td><a href="/bis/players/11111111.html">Ａ 検証</a></td></tr></table>`
    try {
      migrateDatabase(database)
      database.prepare(`INSERT INTO player_profiles(player_id,full_name,source_url,year_teams_json)
        VALUES ('11111111','異なる公式表記','https://npb.jp/bis/players/11111111.html','{}')`).run()
      const captured = await captureOfficialRoster({ year: 2026, team: { teamId: 's', teamName: '東京ヤクルトスワローズ' }, storage,
        fetch: vi.fn(async (url: string | URL | Request) => new Response(String(url).includes('index_') ? '<a href="rst_s.html">一覧</a>' : html)) as unknown as typeof fetch })
      const dataset = emptyBisCurrentDataset(2026)
      dataset.sourceSnapshots.push(captured.snapshot)
      dataset.currentTeamRoster.push(...captured.entries)
      loadBisCurrentDataset(database, dataset)
      const proof = await verifiedOfficialRosterIdentities(database, storage)
      const index = officialStatisticIdentityIndex(database, proof)
      expect(index.resolve('A検証', { year: 2026, teamName: 'ヤクルト' })).toBe('11111111')
      expect(index.resolve('異なる公式表記', { year: 2026, teamName: 'ヤクルト' })).toBe('11111111')
      expect(index.resolve('異なる公式表記', { year: 2025, teamName: 'ヤクルト' })).toBeNull()
      expect(index.resolve('A検証', { year: 2025, teamName: 'ヤクルト' })).toBeNull()
      expect(index.resolve('A検証', { year: 2026, teamName: '阪神' })).toBeNull()
      const query = sqliteDatabaseToQuery(database)
      for (const name of ['A検証', '異なる公式表記']) {
        expect(await searchPlayerCandidates(query, { name, year: 2026, team: 'ヤクルト', dictionaryOnly: true })).toMatchObject([{ player_id: '11111111', years: [2026] }])
        expect(await searchPlayerCandidates(query, { name, year: 2025, team: 'ヤクルト', dictionaryOnly: true })).toEqual([])
      }
      const oldKey = captured.snapshot.rawPath!.slice('data/'.length)
      const newKey = oldKey.replace('/2026/', '/2025/')
      files.set(newKey, html)
      database.prepare("UPDATE current_team_roster SET year=2025").run()
      database.prepare("UPDATE bis_source_snapshots SET year=2025,source_key=REPLACE(source_key,':2026:',':2025:'),raw_path=REPLACE(raw_path,'/2026/','/2025/')").run()
      await expect(verifiedOfficialRosterIdentities(database, storage)).rejects.toThrow('published year/team')
    } finally { database.close() }
  })
})
