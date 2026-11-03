import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { queryContractSchema, type ChatStructuredQuery } from '@npb/schemas'
import { normalizeChatStructuredQuery } from '../server/services/chat-query-normalizer'
import { createChatPlanner } from '../server/services/chat-planner'
import { validateChatPlannerOutput } from '../server/services/chat-planner-validator'
import { requirementsForContract, validateQueryContractExecution } from '../server/services/chat-query-contract'
import { createChatQueryLlm, normalizeStructuredQueryFromLlmMessage } from '../server/services/chat-query-llm'

const oracle = JSON.parse(readFileSync(new URL('../../../docs/eval-query-contracts.json', import.meta.url), 'utf8')).cases[0]
const meaning = queryContractSchema.parse(oracle.meaning)
const query: ChatStructuredQuery = {
  intent: 'search_events',
  filters: { year: 2025, team: 'ヤクルト', batter_name: '山田', result_text_contains: 'ホームラン' },
  query_contract: meaning,
}

describe('independent semantic contract', () => {
  it('preserves the human-specified mention, without resolving identity in parsing', () => {
    expect(meaning.entities[0]).toEqual({ kind: 'player', role: 'batter', mention: '山田' })
    expect(queryContractSchema.safeParse({ ...meaning, entities: [{ ...meaning.entities[0], player_id: '91895133' }] }).success).toBe(false)
    expect(normalizeChatStructuredQuery(query).query_contract).toEqual(oracle.meaning)
    expect((normalizeStructuredQueryFromLlmMessage(oracle.question, query) as ChatStructuredQuery).query_contract).toEqual(oracle.meaning)
  })

  it('plans event data independently of the legacy operation label', () => {
    expect(requirementsForContract(meaning)).toEqual(['events', 'source_snapshots'])
    expect(validateQueryContractExecution(meaning, { intent: 'player_affiliation', filters: { year: 2025, player_name: '山田' } }, ['player_affiliations', 'source_snapshots'])).toContain('missing_data:events')
    expect(validateQueryContractExecution(meaning, { ...query, filters: { ...query.filters, year: 2024 } }, requirementsForContract(meaning))).toContain('year_mismatch')
    expect(validateQueryContractExecution(meaning, { ...query, filters: { ...query.filters, result_text_contains: undefined } }, requirementsForContract(meaning))).toContain('predicate_not_preserved:result_text')
  })

  it('accepts equivalent single-year bounds and date ordering without discarding constraints', () => {
    const equivalent = {
      ...meaning,
      temporal_scope: { ...meaning.temporal_scope, year_from: 2025, year_to: 2025 },
      ordering: [{ field: 'game_date', direction: 'asc' as const }],
    }
    expect(validateQueryContractExecution(equivalent, query, requirementsForContract(meaning))).toEqual([])
    expect(validateQueryContractExecution({ ...equivalent, temporal_scope: { ...equivalent.temporal_scope, year_from: 2024 } }, query, requirementsForContract(meaning))).toContain('year_from_mismatch')
  })

  it('distinguishes statistical summaries from per-game records without an explicit sum operation', () => {
    expect(requirementsForContract({ ...meaning, requested_output: [{ kind: 'batting_statistics', fields: ['battingAverage'] }], aggregation: [] }))
      .toEqual(['aggregate_batting', 'source_snapshots'])
    expect(requirementsForContract({ ...meaning, requested_output: [{ kind: 'pitching_records', fields: ['gameDate', 'strikeouts'] }] }))
      .toEqual(['pitching_lines', 'source_snapshots'])
  })

  it('stops inconsistent execution before entity resolution or retrieval', async () => {
    const planner = createChatPlanner({
      parseStructuredQueryFromMessage: async () => ({ ...query, filters: { ...query.filters, year: 2024 } }),
      normalizeStructuredQuery: normalizeChatStructuredQuery,
    })
    expect(validateChatPlannerOutput(await planner(oracle.question))).toEqual({
      status: 'planner_output_inconsistent', issues: ['query_contract_not_preserved'],
    })
  })

  it('retains provider semantics even when the compatibility adapter rewrites filters', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(query) } }] })))
    const llm = createChatQueryLlm({ baseUrl: 'https://example.test', apiKey: 'test', model: 'test' }, { fetch })
    const parsed = await llm.generateStructuredQuery(oracle.question)
    expect(parsed.query_contract).toEqual(oracle.meaning)
    const request = JSON.parse(fetch.mock.calls[0]![1].body)
    expect(request.response_format.json_schema.schema.required).toContain('query_contract')
  })
})
