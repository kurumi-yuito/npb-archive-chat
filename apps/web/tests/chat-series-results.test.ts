import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { queryContractSchema, type QueryContract } from '@npb/schemas'
import { createSingleDatabaseQueryService } from '../../../packages/db/src/multi-year-query-service'
import { sqliteDatabaseToQuery } from '../../../packages/db/src/query-driver'
import { openDatabase } from '../../../packages/db/src/sqlite'
import { migrateDatabase } from '../../../packages/db/src/migrations'
import { saveOfficialSeriesCapture, OFFICIAL_SERIES_ENTRY_URL } from '../../../packages/db/src/official-series-history'
import type { ObjectStorage } from '../../../packages/db/src/object-storage'
import { createContractChatService } from '../server/services/chat-contract-service'
import { compileQueryContract } from '../server/services/chat-contract-compiler'
import { formatContractSeriesResults } from '../server/services/chat-series-answer'

const base = queryContractSchema.parse(JSON.parse(readFileSync(new URL('../../../docs/eval-query-contracts.json', import.meta.url), 'utf8')).cases[0].meaning)
const contract: QueryContract = { ...base, requested_output: [{ kind: 'series_result', fields: ['winner', 'loser', 'wins', 'losses', 'draws'] }],
  entities: [], predicates: [], aggregation: [], grouping: ['year'], ordering: [{ field: 'year', direction: 'asc' }],
  temporal_scope: { years: [2025], year_from: null, year_to: null, date_from: null, date_to: null, relative: null },
  competition_scope: { competitions: ['日本シリーズ'], level: 'first' }, completeness: { mode: 'all', limit: null },
  context_references: [], unresolved_constraints: [] }

describe('official overall series results (B16, Q203/Q204)', () => {
  it('executes the contract against archived official HTML and returns the overall winner with supporting source', async () => {
    const database = openDatabase(), objects = new Map<string, string>()
    const html = readFileSync(new URL('../../../packages/parser/src/__fixtures__/series-history-2020.html', import.meta.url), 'utf8')
    const fetchedAt = JSON.parse(readFileSync(new URL('../../../packages/parser/src/__fixtures__/series-history-2020.source.json', import.meta.url), 'utf8')).fetchedAt
    const storage = { getText: async (key: string) => objects.get(key) ?? null, putText: async (key: string, text: string) => { objects.set(key, text); return key } } as ObjectStorage
    try {
      migrateDatabase(database)
      await saveOfficialSeriesCapture({ database, storage, html, fetchedAt, sourceUrl: OFFICIAL_SERIES_ENTRY_URL, discovery: { url: OFFICIAL_SERIES_ENTRY_URL, html, fetchedAt } })
      let current = contract
      const service = createContractChatService(createSingleDatabaseQueryService(sqliteDatabaseToQuery(database)), async () => ({
        domain: 'npb', policy: 'execute', query_contract: current, clarification_reason: null, subject: null,
      }))
      const answer = await service.answerQuestion('独立して定義した意味契約の実行検証')
      expect(answer.answer.summary).toContain('2025年：ソフトバンクが優勝。阪　神との対戦は4勝1敗')
      expect(answer.answer.result_count).toBe(1)
      expect(answer.answer.source_urls).toEqual([OFFICIAL_SERIES_ENTRY_URL])
      expect(answer.results.games).toEqual([])
      expect(answer.answer.execution_metadata?.data_requirements).toContain('official_series_results')
      current = { ...contract, temporal_scope: { ...contract.temporal_scope, years: [], year_from: 2020, year_to: 2026 } }
      const list = await service.answerQuestion('同じ意味契約による全年度の取得検証')
      expect(list.answer.result_count).toBe(7)
      expect(list.results.aggregates).toHaveLength(7)
      expect(list.answer.summary).toContain('2022年：オリックスが優勝')
      expect(list.answer.summary).toContain('1分')
      expect(() => formatContractSeriesResults(current, list.results.aggregates.slice(1))).toThrow('incomplete_series_answer')
      expect(() => formatContractSeriesResults(current, [...list.results.aggregates, list.results.aggregates[0]!])).toThrow('invalid_series_answer_evidence')
    } finally { database.close() }
  })

  it('retains unsupported restrictions as errors instead of relaxing the requested scope', () => {
    expect(compileQueryContract(contract)[0]!.query.filters).toEqual({ year: 2025, official_series_result: true, group_by: 'year', series_order: 'asc', competition: '日本シリーズ' })
    expect(() => compileQueryContract({ ...contract, entities: [{ kind: 'team', role: 'subject', mention: '阪神' }] })).toThrow('official_series_scope_required')
    expect(() => compileQueryContract({ ...contract, competition_scope: { ...contract.competition_scope, level: 'farm' } })).toThrow('official_series_scope_required')
    expect(() => compileQueryContract({ ...contract, aggregation: [{ operation: 'count', field: 'games' }] })).toThrow('official_series_scope_required')
  })
})
