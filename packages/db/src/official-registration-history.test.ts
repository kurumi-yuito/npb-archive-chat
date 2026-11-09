import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { openDatabase } from './sqlite'
import { migrateDatabase } from './migrations'
import { captureOfficialRegistrationHistory, verifiedOfficialRegistrationIdentities } from './official-registration-history'
import { officialStatisticIdentityIndex } from './official-statistic-identities'
import type { ObjectStorage } from './object-storage'
import { sqliteDatabaseToQuery } from './query-driver'
import { searchOfficialDictionary } from './repository/official-player-dictionary'
import { searchPlayerAffiliations } from './repository/player-affiliation-repository'
import { searchPlayerInformation } from './repository/player-information-repository'

describe('verified historical registration identity capture', () => {
  it('uses original ID links and target-year movements, and rejects a changed derived name', async () => {
    const database = openDatabase(), files = new Map<string, string>()
    const storage = { putText: async (key: string, value: string) => { files.set(key, value); return key }, getText: async (key: string) => files.get(key) ?? null } as unknown as ObjectStorage
    const html = readFileSync(new URL('../../parser/src/__fixtures__/registration-2025-yakult.html', import.meta.url), 'utf8')
    const index = '<title>2025年度公示</title><a href="registered_s.html">支配下選手登録</a>'
    const hash = createHash('sha256').update(index).digest('hex'), rawKey = `raw/official-registration-discovery/${hash}.html`
    files.set(rawKey, index)
    try {
      migrateDatabase(database)
      const result = await captureOfficialRegistrationHistory({ database, storage,
        scope: { year: 2025, teamId: 's', teamName: '東京ヤクルトスワローズ', kind: 'registered', sourceUrl: 'https://npb.jp/announcement/2025/registered_s.html' },
        discovery: { url: 'https://npb.jp/announcement/2025/', contentHash: hash, rawKey, fetchedAt: '2026-11-08T00:00:00Z' },
        fetch: vi.fn().mockResolvedValue(new Response(html)), now: () => new Date('2026-11-08T00:00:01Z') })
      expect(result.identities).toBe(70)
      expect(result.currentContractConfirmed).toBe(false)
      const proof = await verifiedOfficialRegistrationIdentities(database, storage)
      expect(proof).toHaveLength(70)
      const dictionary = officialStatisticIdentityIndex(database, proof)
      expect(dictionary.resolve('矢崎 拓也', { year: 2025, teamName: 'ヤクルト' })).toBe('71575134')
      expect(dictionary.resolve('柴田 大地', { year: 2025, teamName: 'ヤクルト' })).toBeNull()
      expect(dictionary.resolve('矢崎 拓也', { year: 2026, teamName: 'ヤクルト' })).toBeNull()
      const query = sqliteDatabaseToQuery(database)
      expect(await searchOfficialDictionary(query, { name: '矢崎', year: 2025, team: 'ヤクルト' })).toEqual([
        expect.objectContaining({ player_id: '71575134', years: [2025], roles: ['official_registration'] }),
      ])
      expect(await searchOfficialDictionary(query, { name: '柴田', year: 2025, team: 'ヤクルト' })).toEqual([])
      expect(await searchOfficialDictionary(query, { name: '矢崎', year: 2026, team: 'ヤクルト' })).toEqual([])
      const affiliations = await searchPlayerAffiliations(query, { player_id: '71575134', player_name: '矢崎 拓也', year: 2025, dictionaryOnly: true })
      expect(affiliations).toEqual([expect.objectContaining({ year: 2025, gameId: null, gameDate: null,
        sourceKind: 'official_registration', sourceUrl: 'https://npb.jp/announcement/2025/registered_s.html' })])
      expect(await searchPlayerInformation(query, { player_id: '71575134', year: 2025 })).toEqual([
        expect.objectContaining({ playerId: '71575134', profileAvailable: false, affiliations: [{ year: 2025, team: '東京ヤクルトスワローズ' }],
          sourceUrls: ['https://npb.jp/announcement/2025/registered_s.html'] }),
      ])
      database.prepare("UPDATE current_team_roster SET player_name='別人' WHERE player_id='71575134'").run()
      await expect(verifiedOfficialRegistrationIdentities(database, storage)).rejects.toThrow('identity projection differs')
    } finally { database.close() }
  })
})
