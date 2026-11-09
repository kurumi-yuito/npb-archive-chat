import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { queryContractSchema, type QueryContract } from '@npb/schemas'
import type { ChatQueryService } from '@npb/db'
import { compileQueryContract, contractForOutput } from '../server/services/chat-contract-compiler'
import { createContractChatService } from '../server/services/chat-contract-service'
import { formatScopedStatisticComparison } from '../server/services/chat-statistic-answer'

const base = queryContractSchema.parse(JSON.parse(readFileSync(new URL('../../../docs/eval-query-contracts.json', import.meta.url), 'utf8')).cases[0].meaning)
const operand = (name: string, team: string, year: number) => {
  const { version: _version, requested_output: _outputs, ...common } = base
  void _version; void _outputs
  return { ...common, entities: [{ kind: 'player' as const, role: 'subject' as const, mention: name }, { kind: 'team' as const, role: 'subject' as const, mention: team }],
    temporal_scope: { ...base.temporal_scope, years: [year] }, predicates: [], grouping: [], completeness: { mode: 'unspecified' as const, limit: null } }
}
const first = operand('検証甲', '阪神', 2024), second = operand('検証乙', '巨人', 2025)
const contract: QueryContract = { ...base, entities: [...first.entities, ...second.entities], predicates: [],
  temporal_scope: { ...base.temporal_scope, years: [2024, 2025] },
  requested_output: [{ kind: 'batting_statistics', fields: ['homeRuns'], scope: first }, { kind: 'batting_statistics', fields: ['homeRuns'], scope: second }] }

describe('independent semantic output scopes', () => {
  it('keeps each player paired with the requested club and year during resolution, retrieval and transport', async () => {
    const parse = vi.fn(async () => ({ domain: 'npb' as const, policy: 'execute' as const, query_contract: contract, clarification_reason: null, subject: null }))
    const service = {
      searchPlayerCandidates: vi.fn(async (filters: { name: string; team?: string; year?: number }) => {
        const expected = filters.name === '検証甲' ? { team: '阪神', year: 2024 } : { team: '巨人', year: 2025 }
        expect(filters).toMatchObject(expected)
        return [{ player_id: filters.name, name: filters.name, primary_team: expected.team, roles: ['profile'], teams: [expected.team], years: [expected.year] }]
      }),
      aggregateBattingLines: vi.fn(async (filters: { player_id?: string; team?: string; year?: number }) => {
        const isFirst = filters.player_id === '検証甲'
        expect(filters).toMatchObject(isFirst ? { team: '阪神', year: 2024 } : { team: '巨人', year: 2025 })
        return [{ kind: 'batting', label: filters.player_id, total: 1, stats: { playerId: filters.player_id, year: filters.year,
          level: 'first', team: filters.team, homeRuns: isFirst ? 3 : 8 } }]
      }),
    }
    const response = await createContractChatService(service as unknown as ChatQueryService, parse).answerQuestion('それぞれの条件で成績を比較')
    expect(parse).toHaveBeenCalledTimes(1)
    expect(service.searchPlayerCandidates).toHaveBeenCalledTimes(2)
    expect(service.aggregateBattingLines).toHaveBeenCalledTimes(2)
    expect(response.results.aggregates.map((row) => [row.stats.playerId, row.stats.year, row.stats.homeRuns])).toEqual([['検証甲', 2024, 3], ['検証乙', 2025, 8]])
    expect(response.answer.query_contract).toEqual(contract)
    expect(response.answer.summary).toContain('2024年・検証甲・阪神')
    expect(response.answer.summary).toContain('2025年・検証乙・巨人')
    expect(response.answer.summary).toContain('本塁打の数値が最も高いのは2025年・検証乙')
    expect(response.answer.execution_metadata?.scoped_query_contracts).toEqual(contract.requested_output.map((output) => contractForOutput(contract, output)))
    expect(response.answer.execution_metadata?.resolved_players?.map((player) => player.player_id)).toEqual(['検証甲', '検証乙'])
    expect(compileQueryContract(contract).map((operation) => operation.query.filters)).toEqual([
      expect.objectContaining({ player_name: '検証甲', team: '阪神', year: 2024 }),
      expect.objectContaining({ player_name: '検証乙', team: '巨人', year: 2025 }),
    ])
    const independentResponses = contract.requested_output.map((_, index) => ({ ...response,
      answer: { ...response.answer, resolved_player: response.answer.execution_metadata!.resolved_players![index]! },
      results: { ...response.results, aggregates: [response.results.aggregates[index]!] } }))
    independentResponses[0]!.results.aggregates[0]!.stats.year = 2023
    expect(formatScopedStatisticComparison(contract, independentResponses)).toContain('比較の結論は確定できません')
  })

  it('strips a provider null scope without changing the existing meaning oracle, and never erases unresolved conditions', () => {
    expect(queryContractSchema.parse({ ...base, requested_output: base.requested_output.map((output) => ({ ...output, scope: null })) })).toEqual(base)
    const { version: _version, requested_output: _outputs, ...sharedScope } = base
    void _version; void _outputs
    expect(queryContractSchema.parse({ ...base, requested_output: base.requested_output.map((output) => ({ ...output, scope: sharedScope })) })).toEqual(base)
    const unresolved = { ...contract, unresolved_constraints: ['unresolved_explicit_condition'] }
    expect(() => compileQueryContract(unresolved)).toThrow('unresolved_constraints')
  })
})
