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
  it('does not look up a manager in the player dictionary (B15)', async () => {
    const staff: QueryContract = { ...base, requested_output: [{ kind: 'staff_information', fields: ['name'] }],
      entities: [{ kind: 'team', role: 'subject', mention: '中日ドラゴンズ' }], predicates: [] }
    const query = new Proxy({}, { get: (_target, key) => { throw new Error(`Unexpected archive query: ${String(key)}`) } })
    const response = await createContractChatService(query as ChatQueryService, async () => ({ domain: 'npb', policy: 'execute',
      query_contract: staff, clarification_reason: null, subject: null })).answerQuestion('球団の監督は誰ですか')
    expect(response.answer.summary).toContain('監督・コーチの情報は収録対象外')
    expect(response.answer.query_contract).toEqual(staff)
    expect(response.results.playerInformation).toEqual([])
    expect(response.answer.source_urls).toEqual([])
  })
  it('keeps verified past matchup totals when a second operand asks for unsupported future fixtures (B23)', async () => {
    const { version: _version, requested_output: _outputs, ...scope } = base
    void _version; void _outputs
    const shared = { ...scope, entities: [{ kind: 'team' as const, role: 'subject' as const, mention: '巨人' },
      { kind: 'team' as const, role: 'opponent' as const, mention: '阪神' }], predicates: [], grouping: [], ordering: [],
    completeness: { mode: 'unspecified' as const, limit: null } }
    const past = { ...shared, temporal_scope: { ...base.temporal_scope, years: [2026] }, aggregation: [{ operation: 'count' as const, field: 'games' }] }
    const future = { ...shared, temporal_scope: { ...base.temporal_scope, years: [], date_from: '2026-11-16', date_to: '2026-11-22', relative: 'next_week' },
      aggregation: [], ordering: [{ field: 'gameDate', direction: 'asc' as const }] }
    const mixed: QueryContract = { ...base, ...shared, requested_output: [
      { kind: 'game_results', fields: ['wins', 'losses', 'draws'], scope: past },
      { kind: 'game_schedule', fields: ['gameDate', 'opponent'], scope: future },
    ] }
    const query = { aggregateGameResults: vi.fn().mockResolvedValue([{ kind: 'games', label: '巨人', total: 3,
      stats: { wins: 2, losses: 1, draws: 0, total_games: 3, evidenceGameIds: '["verified-game"]' } }]),
    listSourceSnapshotsByGameIds: vi.fn().mockResolvedValue([{ game_id: 'verified-game', source_key: 'index', source_url: 'https://npb.jp/scores/verified-game/score.html' }]),
    searchGames: vi.fn(), searchPlayerCandidates: vi.fn() }
    const response = await createContractChatService(query as unknown as ChatQueryService, async () => ({ domain: 'npb', policy: 'execute', query_contract: mixed, clarification_reason: null, subject: null })).answerQuestion('対戦成績と来週の日程')
    expect(query.aggregateGameResults).toHaveBeenCalledTimes(1)
    expect(query.aggregateGameResults).toHaveBeenCalledWith(expect.objectContaining({ year: 2026, team: '巨人', opponent: '阪神' }))
    expect(query.searchGames).not.toHaveBeenCalled()
    expect(query.searchPlayerCandidates).not.toHaveBeenCalled()
    expect(response.answer.summary).toContain('2勝1敗')
    expect(response.answer.summary).toContain('未来の試合日程・登板予定は収録対象外')
    expect(response.answer.query_contract).toEqual(mixed)
    expect(response.answer.source_urls).toEqual(['https://npb.jp/scores/verified-game/score.html', 'https://npb.jp/games/'])
    const scheduleOnly = await createContractChatService(query as unknown as ChatQueryService, async () => ({ domain: 'npb', policy: 'execute',
      query_contract: contractForOutput(mixed, mixed.requested_output[1]!), clarification_reason: null, subject: null })).answerQuestion('来週の日程')
    expect(scheduleOnly.results.games).toEqual([])
    expect(query.aggregateGameResults).toHaveBeenCalledTimes(1)
    expect(() => compileQueryContract(contractForOutput(mixed, mixed.requested_output[1]!))).toThrow('schedule_not_in_archive')
  })
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
