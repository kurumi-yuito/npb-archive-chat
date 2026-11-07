import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { queryContractSchema, type QueryContract } from '@npb/schemas'
import { createSingleDatabaseQueryService } from '@npb/db'
import { openDatabase } from '../../../packages/db/src/sqlite'
import { migrateDatabase } from '../../../packages/db/src/migrations'
import { sqliteDatabaseToQuery } from '../../../packages/db/src/query-driver'
import { captureOfficialTeamHistory } from '../../../packages/db/src/official-team-history'
import type { ObjectStorage } from '../../../packages/db/src/object-storage'
import { createContractChatService } from '../server/services/chat-contract-service'

const meaning = queryContractSchema.parse(JSON.parse(readFileSync(new URL('../../../docs/eval-query-contracts.json', import.meta.url), 'utf8')).cases[0].meaning)
const contract: QueryContract = { ...meaning, requested_output: [{ kind: 'team_statistics', fields: ['wins'] }],
  entities: [{ kind: 'team', role: 'subject', mention: '巨人' }], predicates: [],
  temporal_scope: { ...meaning.temporal_scope, years: [2026] }, completeness: { mode: 'all', limit: null } }
const parse = (request: QueryContract) => async () => ({ domain: 'npb' as const, policy: 'execute' as const, query_contract: request, clarification_reason: null, subject: null })

describe('B28/B18 official club history to contract answer', () => {
  it('answers official club wins even with no archived game facts, and never substitutes individual pitchers', async () => {
    const database = openDatabase()
    try {
      migrateDatabase(database)
      const html = readFileSync(new URL('../../../packages/parser/src/__fixtures__/bis-team-yearly-giants.html', import.meta.url), 'utf8')
      await captureOfficialTeamHistory({ database, team: { teamId: 'g', teamName: '読売ジャイアンツ' }, targetYear: 2026,
        storage: { putText: vi.fn().mockResolvedValue('stored') } as unknown as ObjectStorage,
        fetch: vi.fn(async (url: string) => new Response(url.endsWith('yearly_g.html') ? html : '<a href="yearly_g.html">年度別成績</a>')) as unknown as typeof fetch })
      const driver = sqliteDatabaseToQuery(database), sql: string[] = []
      const service = createSingleDatabaseQueryService({ ...driver, prepare(text) { sql.push(text); return driver.prepare(text) } })
      const result = await createContractChatService(service, parse(contract)).answerQuestion('巨人 今年 何勝?')
      expect(result.answer.summary).toContain('2026年 巨人：76勝')
      expect(result.results.aggregates).toHaveLength(1)
      expect(result.results.aggregates[0]!.stats).toMatchObject({ wins: 76, losses: 64, draws: 3, games: 143, rank: 2 })
      expect(result.answer.source_urls).toEqual(['https://npb.jp/bis/teams/yearly_g.html'])
      expect(result.answer.execution_metadata?.data_requirements).toContain('official_team_statistics')
      expect(result.answer.query_contract).toEqual(contract)
      expect(sql.some((text) => /\bFROM\s+(?:games|game_facts|pitching_lines|pitching_line_facts)\b/iu.test(text))).toBe(false)
      const ranking: QueryContract = { ...contract, requested_output: [{ kind: 'team_statistics', fields: ['rank'] }], grouping: ['team'],
        ordering: [{ field: 'rank', direction: 'asc' }], competition_scope: { level: 'first', competitions: ['公式戦'] } }
      const ranked = await createContractChatService(service, parse(ranking)).answerQuestion('対象球団のリーグ順位')
      expect(ranked.answer.summary).toContain('2位')
      expect(ranked.structured_query?.filters).toMatchObject({ official_season: true, sort_by: 'rank', sort_direction: 'asc' })
      const years: QueryContract = { ...contract, requested_output: [{ kind: 'team_statistics', fields: ['wins', 'losses', 'win_rate'] }],
        temporal_scope: { ...contract.temporal_scope, years: [], year_from: 2025, year_to: 2026 }, grouping: ['team', 'year'] }
      const yearly = await createContractChatService(service, parse(years)).answerQuestion('2年度の球団成績を比較')
      expect(yearly.results.aggregates.map((row) => [row.stats.year, row.stats.wins])).toEqual([[2025, 70], [2026, 76]])
      expect(yearly.answer.query_contract?.grouping).toEqual(['team', 'year'])
      const allClubs = { ...contract, entities: [] }
      const missing = await createContractChatService(service, parse(allClubs)).answerQuestion('全12球団の勝敗')
      expect(missing.answer.result_count).toBe(0)
      expect(missing.answer.summary).toContain('一部試合を年度全体の勝敗・順位としては回答しません')
      database.prepare("UPDATE official_team_seasons SET metrics_json=json_set(metrics_json,'$.勝利','75') WHERE season_label='2026'").run()
      await expect(createContractChatService(service, parse(contract)).answerQuestion('巨人の勝利数')).rejects.toThrow('decisions disagree')
    } finally { database.close() }
  })
  it('compares each named club against its own official source and gives a numeric criterion', async () => {
    const database = openDatabase()
    try {
      migrateDatabase(database)
      for (const [teamId, teamName, fixture] of [['g', '読売ジャイアンツ', 'giants'], ['h', '福岡ソフトバンクホークス', 'hawks']]) {
        const html = readFileSync(new URL(`../../../packages/parser/src/__fixtures__/bis-team-yearly-${fixture}.html`, import.meta.url), 'utf8')
        await captureOfficialTeamHistory({ database, team: { teamId: teamId!, teamName: teamName! }, targetYear: 2026,
          storage: { putText: vi.fn().mockResolvedValue('stored') } as unknown as ObjectStorage,
          fetch: vi.fn(async (url: string) => new Response(url.includes('/yearly_') ? html : `<a href="yearly_${teamId}.html">年度別成績</a>`)) as unknown as typeof fetch })
      }
      const comparison: QueryContract = { ...contract, requested_output: [{ kind: 'team_statistics', fields: ['win_rate'] }],
        entities: [...contract.entities, { kind: 'team', role: 'subject', mention: 'ソフトバンク' }] }
      const result = await createContractChatService(createSingleDatabaseQueryService(sqliteDatabaseToQuery(database)), parse(comparison)).answerQuestion('2球団の勝率比較')
      expect(result.results.aggregates).toHaveLength(2)
      expect(result.answer.summary).toContain('2026年 巨人：勝率0.543')
      expect(result.answer.summary).toContain('2026年 ソフトバンク：勝率0.650')
      expect(result.answer.summary).toContain('勝率が最も高いのは2026年のソフトバンク')
      expect(result.answer.source_urls).toHaveLength(2)
      expect(result.answer.query_contract).toEqual(comparison)
      const multiYear: QueryContract = { ...comparison, temporal_scope: { ...comparison.temporal_scope, years: [], year_from: 2025, year_to: 2026 }, grouping: ['team', 'year'] }
      const allYears = await createContractChatService(createSingleDatabaseQueryService(sqliteDatabaseToQuery(database)), parse(multiYear)).answerQuestion('2球団の2年度の勝率比較')
      expect(allYears.results.aggregates).toHaveLength(4)
      expect(allYears.results.aggregates.map((row) => row.stats.year).sort()).toEqual([2025, 2025, 2026, 2026])
      expect(allYears.answer.query_contract).toEqual(multiYear)
    } finally { database.close() }
  })
})
