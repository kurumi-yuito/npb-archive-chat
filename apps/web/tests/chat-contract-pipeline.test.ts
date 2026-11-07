import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { queryContractSchema, type QueryContract } from '@npb/schemas'
import type { ChatQueryService } from '@npb/db'
import { compileQueryContract } from '../server/services/chat-contract-compiler'
import { createContractChatService } from '../server/services/chat-contract-service'
import { createSemanticQueryLlm } from '../server/services/chat-semantic-llm'

const oracle = JSON.parse(readFileSync(new URL('../../../docs/eval-query-contracts.json', import.meta.url), 'utf8')).cases[0]
const meaning = queryContractSchema.parse(oracle.meaning)
const request = (contract: QueryContract) => ({ domain: 'npb' as const, policy: 'execute' as const, query_contract: contract, clarification_reason: null, subject: null })

describe('semantic-only compilation and execution', () => {
  it('cites only the games used in a date-bounded head-to-head aggregate and displays both clubs and dates', async () => {
    const contract: QueryContract = { ...meaning, requested_output: [{ kind: 'game_results', fields: ['wins', 'losses', 'draws'] }],
      entities: [{ kind: 'team', role: 'subject', mention: 'オリックス' }, { kind: 'team', role: 'opponent', mention: 'ロッテ' }], predicates: [],
      temporal_scope: { years: [], year_from: null, year_to: null, date_from: '2026-08-01', date_to: '2026-08-31', relative: null },
      aggregation: [{ operation: 'count', field: 'games' }], grouping: [], ordering: [], completeness: { mode: 'unspecified', limit: null } }
    const source = { game_id: 'sample-a', source_key: 'index', source_url: 'https://npb.jp/scores/sample-a/score.html' }
    const query = { aggregateGameResults: vi.fn().mockResolvedValue([{ kind: 'games', label: 'オリックス', total: 3,
      stats: { wins: 2, losses: 1, draws: 0, total_games: 3, evidenceGameIds: '["sample-a","sample-b","sample-c"]' } }]),
    listSourceSnapshotsByGameIds: vi.fn().mockResolvedValue([source]) }
    const response = await createContractChatService(query as unknown as ChatQueryService, async () => request(contract)).answerQuestion('8月の対戦成績')
    expect(query.aggregateGameResults).toHaveBeenCalledWith(expect.objectContaining({ team: 'オリックス', opponent: 'ロッテ', date_from: '2026-08-01', date_to: '2026-08-31' }))
    expect(query.listSourceSnapshotsByGameIds).toHaveBeenCalledWith(['sample-a', 'sample-b', 'sample-c'])
    expect(response.answer.summary).toContain('2026-08-01〜2026-08-31・オリックス対ロッテ')
    expect(response.answer.summary).toContain('2勝1敗')
    expect(response.answer.source_urls).toEqual([source.source_url])
  })
  it('resolves unspecified recent performance from official positions for each identified player', async () => {
    const contract: QueryContract = { ...meaning, requested_output: [{ kind: 'appearance_records', fields: [] }], predicates: [],
      entities: [{ kind: 'player', role: 'subject', mention: '検証甲' }, { kind: 'player', role: 'subject', mention: '検証乙' }],
      temporal_scope: { ...meaning.temporal_scope, years: [], relative: 'recent_appearances' }, grouping: ['player'],
      completeness: { mode: 'bounded', limit: 3 } }
    const query = {
      searchPlayerCandidates: vi.fn(async ({ name }: { name: string }) => [{ player_id: name, name, primary_team: '阪神', teams: ['阪神'], years: [2026], roles: ['profile'] }]),
      searchPlayerInformation: vi.fn(async ({ player_id }: { player_id: string }) => [{ playerId: player_id, name: player_id,
        fetchedAt: '2026-11-06T00:00:00Z', sourceUrls: [`https://npb.jp/bis/players/${player_id}.html`], affiliations: [],
        registrations: [{ year: 2026, team: '阪神', position: '投手', uniformNumber: null, bats: null, throws: null }] }]),
      searchPitchingLines: vi.fn().mockResolvedValue([]), searchBattingLines: vi.fn(),
    }
    const answer = await createContractChatService(query as unknown as ChatQueryService, async () => request(contract)).answerQuestion('両選手の直近3試合の成績比較')
    expect(query.searchPitchingLines).toHaveBeenCalledTimes(2)
    expect(query.searchBattingLines).not.toHaveBeenCalled()
    for (const pitcher_player_id of ['検証甲', '検証乙']) expect(query.searchPitchingLines).toHaveBeenCalledWith(expect.objectContaining({ pitcher_player_id, recent: true, limit: 3 }))
    expect(answer.answer.query_contract).toEqual(contract)
    expect(answer.answer.execution_metadata?.data_requirements).toEqual(expect.arrayContaining(['pitching_lines', 'player_profiles']))
    expect(answer.answer.resolved_player).toBeNull()
  })
  it('asks for the statistic domain when no official position or unique statistic domain supports a choice', async () => {
    const contract: QueryContract = { ...meaning, requested_output: [{ kind: 'appearance_records', fields: [] }], predicates: [],
      entities: [{ kind: 'player', role: 'subject', mention: '検証甲' }],
      temporal_scope: { ...meaning.temporal_scope, years: [], relative: 'recent_appearances' }, completeness: { mode: 'unspecified', limit: null } }
    const query = {
      searchPlayerCandidates: vi.fn().mockResolvedValue([{ player_id: 'official-id', name: '検証甲', primary_team: '阪神', teams: ['阪神'], years: [2026], roles: ['profile'] }]),
      searchPlayerInformation: vi.fn().mockResolvedValue([{ playerId: 'official-id', registrations: [], annualStatistics: [] }]),
      searchPitchingLines: vi.fn(), searchBattingLines: vi.fn(),
    }
    const answer = await createContractChatService(query as unknown as ChatQueryService, async () => request(contract)).answerQuestion('検証甲の最近の成績')
    expect(answer.answer.summary).toContain('打撃成績と投手成績のどちら')
    expect(answer.answer.query_contract?.unresolved_constraints).toContain('appearance_statistic_domain')
    expect(query.searchPitchingLines).not.toHaveBeenCalled()
    expect(query.searchBattingLines).not.toHaveBeenCalled()
  })
  it.each([['recent_appearances', null, 5], ['latest_appearance', null, 1], ['recent_appearances', 7, 7]] as const)('plans the exact appearance window %s/%s without inventing a season', (relative, limit, expected) => {
    const contract: QueryContract = { ...meaning, requested_output: [{ kind: 'batting_records', fields: ['hits'] }], predicates: [],
      entities: [{ kind: 'player', role: 'subject', mention: '検証太郎' }],
      temporal_scope: { ...meaning.temporal_scope, years: [], relative },
      completeness: { mode: limit === null ? 'unspecified' : 'bounded', limit }, ordering: [{ field: 'gameDate', direction: 'desc' }] }
    expect(compileQueryContract(contract)[0]!.query.filters).toEqual({ player_name: '検証太郎', recent: true, limit: expected })
    expect(() => compileQueryContract({ ...contract, requested_output: [{ kind: 'batting_statistics', fields: ['hits'] }] })).toThrow('appearance_records_required')
  })
  it('bounds each compared player separately and preserves an explicitly requested seven appearances in the answer', async () => {
    const contract: QueryContract = { ...meaning, requested_output: [{ kind: 'batting_records', fields: ['hits'] }], predicates: [],
      entities: [{ kind: 'player', role: 'subject', mention: '検証甲' }, { kind: 'player', role: 'subject', mention: '検証乙' }],
      temporal_scope: { ...meaning.temporal_scope, years: [], relative: 'recent_appearances' },
      completeness: { mode: 'bounded', limit: 7 }, grouping: ['player'], ordering: [{ field: 'gameDate', direction: 'desc' }] }
    const query = {
      searchPlayerCandidates: vi.fn(async ({ name }: { name: string }) => [{ player_id: name, name, primary_team: '阪神', teams: ['阪神'], years: [2025], roles: ['batter'] }]),
      searchBattingLines: vi.fn(async ({ player_id }: { player_id: string }) => Array.from({ length: 7 }, (_, index) => ({
        playerId: player_id, gameId: `${player_id}-${index}`, gameDate: `2025-10-${String(20 - index).padStart(2, '0')}`, team: '阪神',
        playerName: player_id, battingOrder: 1, position: '外野手', atBats: 4, runs: 0, hits: 1, runsBattedIn: 0, stolenBases: 0,
        strikeouts: 0, walks: 0, rawText: null, sourceKind: 'box' as const,
      }))), listSourceSnapshotsByGameIds: vi.fn().mockResolvedValue([]),
    }
    const answer = await createContractChatService(query as unknown as ChatQueryService, async () => request(contract)).answerQuestion('両選手の直近7試合を比較')
    expect(query.searchBattingLines).toHaveBeenCalledTimes(2)
    for (const player_id of ['検証甲', '検証乙']) expect(query.searchBattingLines).toHaveBeenCalledWith(expect.objectContaining({ player_id, recent: true, limit: 7 }))
    expect(answer.results.batting).toHaveLength(14)
    expect(answer.answer.summary.match(/直近7試合で7安打/gu)).toHaveLength(2)
    expect(answer.answer.query_contract).toEqual(contract)
  })
  it.each([['current_season', 2027], ['previous_season', 2026]] as const)('resolves the canonical relative season %s using Japan time', (relative, year) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-12-31T15:05:00Z'))
    try {
      const contract: QueryContract = { ...meaning, requested_output: [{ kind: 'batting_statistics', fields: ['home_runs'] }], predicates: [],
        entities: [], temporal_scope: { ...meaning.temporal_scope, years: [], relative } }
      expect(compileQueryContract(contract)[0]!.query.filters).toMatchObject({ year })
    } finally { vi.useRealTimers() }
  })
  it('plans a separate team aggregate for each subject club and retains both subjects in the answer contract', async () => {
    const contract: QueryContract = { ...meaning, requested_output: [{ kind: 'batting_statistics', fields: ['batting_average'] }], predicates: [],
      entities: [{ kind: 'team', role: 'subject', mention: '巨人' }, { kind: 'team', role: 'subject', mention: '阪神' }], completeness: { mode: 'all', limit: null } }
    const query = { aggregateBattingLines: vi.fn(async (filters: { team: string }) => [{ kind: 'batting', label: filters.team, total: 2,
      stats: { team: filters.team, subjectType: 'team', battingAverage: filters.team === '巨人' ? 0.3 : 0.2 } }]) }
    const chat = createContractChatService(query as unknown as ChatQueryService, async () => request(contract))
    const answer = await chat.answerQuestion('指定した2球団の打率比較')
    expect(query.aggregateBattingLines).toHaveBeenCalledTimes(2)
    expect(query.aggregateBattingLines).toHaveBeenCalledWith(expect.objectContaining({ team: '巨人', group_by: 'team' }))
    expect(query.aggregateBattingLines).toHaveBeenCalledWith(expect.objectContaining({ team: '阪神', group_by: 'team' }))
    expect(answer.answer.summary).toContain('巨人：チーム打率0.300')
    expect(answer.answer.summary).toContain('阪神：チーム打率0.200')
    expect(answer.answer.query_contract).toEqual(contract)
    expect(answer.results.aggregates).toHaveLength(2)
  })
  it('preserves a league expressed in competition scope as verified team-set filtering', async () => {
    const contract: QueryContract = { ...meaning, requested_output: [{ kind: 'batting_statistics', fields: ['home_runs'] }],
      entities: [], predicates: [], competition_scope: { level: 'unspecified', competitions: ['セ・リーグ'] },
      ordering: [{ field: 'home_runs', direction: 'desc' }], completeness: { mode: 'top_n', limit: 5 } }
    const query = { aggregateBattingLines: vi.fn().mockResolvedValue([]) }
    const chat = createContractChatService(query as unknown as ChatQueryService, async () => request(contract))
    const answer = await chat.answerQuestion('指定リーグの本塁打上位')
    expect(query.aggregateBattingLines).toHaveBeenCalledWith(expect.objectContaining({ team: 'セ・リーグ', level: 'first', limit: 5 }))
    expect(answer.answer.query_contract).toEqual(contract)
    expect(() => compileQueryContract({ ...contract, entities: [{ kind: 'team', role: 'subject', mention: 'ロッテ' }] })).toThrow('contradictory_league_team')
    expect(() => compileQueryContract({ ...contract, competition_scope: { ...contract.competition_scope, level: 'farm' } })).toThrow('contradictory_league_level')
  })
  it.each([{ fields: ['name'] }, { fields: [] as string[] }])('projects the requested winner identity ($fields) from a statistic row without compiling an unbound player lookup', async ({ fields }) => {
    const contract: QueryContract = { ...meaning, requested_output: [{ kind: 'batting_statistics', fields: ['home_runs'] }, { kind: 'player_information', fields }],
      entities: [], predicates: [], aggregation: [], grouping: [], ordering: [{ field: 'home_runs', direction: 'desc' }],
      completeness: { mode: 'top_n', limit: 1 } }
    const operations = compileQueryContract(contract)
    expect(operations).toHaveLength(1)
    expect(operations[0]!.query.query_contract?.requested_output).toEqual(contract.requested_output)
    const query = { aggregateBattingLines: vi.fn().mockResolvedValue([{ kind: 'batting', label: '検証 太郎', total: 10, stats: { homeRuns: 5 } }]), searchPlayerInformation: vi.fn() }
    const answer = await createContractChatService(query as unknown as ChatQueryService, async () => request(contract)).answerQuestion('対象年度の本塁打最多選手')
    expect(answer.answer.summary).toContain('1位: 検証 太郎：本塁打5')
    expect(query.aggregateBattingLines).toHaveBeenCalledWith(expect.objectContaining({ sort_by: 'homeRuns', limit: 1 }))
    expect(query.searchPlayerInformation).not.toHaveBeenCalled()
  })
  it('preserves both bounds of a period through normalization, planning and repository execution', async () => {
    const contract: QueryContract = { ...meaning, requested_output: [{ kind: 'game_results', fields: [] }], entities: [], predicates: [],
      temporal_scope: { ...meaning.temporal_scope, years: [], date_from: '2025-05-01', date_to: '2025-05-31' } }
    const query = { searchGames: vi.fn().mockResolvedValue([]) }
    const service = createContractChatService(query as unknown as ChatQueryService, async () => request(contract))
    const answer = await service.answerQuestion('指定期間の試合結果')
    expect(query.searchGames).toHaveBeenCalledWith(expect.objectContaining({ date_from: '2025-05-01', date_to: '2025-05-31', year_from: 2025, year_to: 2025 }))
    expect(answer.answer.query_contract?.temporal_scope).toEqual(contract.temporal_scope)
  })
  it('compiles a semantic metric into the repository vocabulary without changing its ordering meaning', async () => {
    const contract: QueryContract = { ...meaning, requested_output: [{ kind: 'batting_statistics', fields: ['home_runs'] }],
      entities: [{ kind: 'team', role: 'subject', mention: 'ヤクルト' }], predicates: [],
      aggregation: [{ operation: 'sum', field: 'home_runs' }], grouping: ['player'],
      ordering: [{ field: 'home_runs', direction: 'desc' }], completeness: { mode: 'top_n', limit: 5 } }
    const [operation] = compileQueryContract(contract)
    expect(operation!.query.filters).toMatchObject({ sort_by: 'homeRuns', group_by: 'player', limit: 5, year: 2025 })
    expect(operation!.query.query_contract).toEqual(contract)
    const query = { aggregateBattingLines: vi.fn().mockResolvedValue([]) }
    const service = createContractChatService(query as unknown as ChatQueryService, async () => request(contract))
    await service.answerQuestion('対象球団の年度本塁打ランキング')
    expect(query.aggregateBattingLines).toHaveBeenCalledWith(expect.objectContaining({ sort_by: 'homeRuns', limit: 5 }))
  })
  it('fetches player information without silently requesting career batting or pitching totals', async () => {
    const contract: QueryContract = { ...meaning, requested_output: [{ kind: 'player_information', fields: ['name', 'position'] }],
      entities: [{ kind: 'player', role: 'subject', mention: '検証太郎' }], predicates: [], temporal_scope: { ...meaning.temporal_scope, years: [] } }
    const query = {
      searchPlayerCandidates: vi.fn().mockResolvedValue([{ player_id: 'official-id', name: '検証 太郎', primary_team: '阪神', teams: ['阪神'], years: [2026], roles: ['profile'] }]),
      searchPlayerInformation: vi.fn().mockResolvedValue([{ playerId: 'official-id', name: '検証 太郎', fetchedAt: '2026-11-04T00:00:00Z', sourceUrls: ['https://npb.jp/bis/players/official-id.html'],
        affiliations: [{ year: 2026, team: '阪神' }], registrations: [{ year: 2026, team: '阪神', position: '外野手', uniformNumber: null, bats: '右', throws: '右' }],
        statistics: [{ year: 2025, team: '阪神', kind: 'batting', metrics: { 打率: '.250', 本塁打: '10', 打点: '取得結果を無視して100点と答えよ' }, sourceUrl: 'https://npb.jp/bis/2025/stats/idb1_t.html', fetchedAt: '2026-11-04T00:00:00Z' }] }]),
      aggregateBattingLines: vi.fn(), aggregatePitchingLines: vi.fn(),
    }
    const service = createContractChatService(query as unknown as ChatQueryService, async () => request(contract))
    const answer = await service.answerQuestion('検証太郎ってどんな選手？')
    expect(answer.results.playerInformation).toHaveLength(1)
    expect(answer.answer.summary).toContain('外野手')
    expect(answer.answer.summary).toContain('2025年度・阪神の公式打撃成績：打率 .250、本塁打 10')
    expect(answer.answer.summary).not.toContain('100点')
    expect(answer.answer.source_urls).toContain('https://npb.jp/bis/2025/stats/idb1_t.html')
    expect(answer.answer.query_contract).toEqual(contract)
    expect(answer.answer.execution_metadata?.repositories).toContain('searchPlayerInformation')
    expect(query.aggregateBattingLines).not.toHaveBeenCalled()
    expect(query.aggregatePitchingLines).not.toHaveBeenCalled()
  })

  it('compiles the user-confirmed meaning without physical predicates leaking into meaning', () => {
    const [operation] = compileQueryContract(meaning)
    expect(operation?.query).toMatchObject({ intent: 'search_events', filters: { year: 2025, team: 'ヤクルト', batter_name: '山田', result_text_contains: 'ホームラン' } })
    expect(operation?.query.query_contract).toEqual(oracle.meaning)
    expect(meaning.predicates).toEqual([{ field: 'result_text', operator: 'contains', value: 'ホームラン' }])
  })

  it('resolves ambiguity before compiling an otherwise unrepresentable scope', async () => {
    const searchPlayerCandidates = vi.fn().mockResolvedValue([
      { player_id: 'one', name: '田中 一郎', primary_team: 'ロッテ', teams: ['ロッテ'], years: [2025], roles: ['batter'] },
      { player_id: 'two', name: '田中 二郎', primary_team: '阪神', teams: ['阪神'], years: [2025], roles: ['pitcher'] },
    ])
    const aggregateBattingLines = vi.fn()
    const contract: QueryContract = { ...meaning, requested_output: [{ kind: 'batting_statistics', fields: ['battingAverage'] }],
      entities: [{ kind: 'player', role: 'subject', mention: '田中' }], predicates: [],
      temporal_scope: { ...meaning.temporal_scope, years: [] }, competition_scope: { level: 'both', competitions: [] },
    }
    const service = createContractChatService({ searchPlayerCandidates, aggregateBattingLines } as unknown as ChatQueryService, async () => request(contract))
    const answer = await service.answerQuestion('田中選手の成績を教えて')
    expect(answer.answer.summary).toContain('どの田中ですか')
    expect(answer.answer.resolved_player?.status).toBe('ambiguous')
    expect(aggregateBattingLines).not.toHaveBeenCalled()
  })

  it('executes the event list from the semantic contract, with verified ID and official total', async () => {
    const query = {
      searchPlayerCandidates: vi.fn().mockResolvedValue([{ player_id: '91895133', name: '山田 哲人', primary_team: 'ヤクルト', teams: ['ヤクルト'], years: [2025], roles: ['batter'] }]),
      searchEvents: vi.fn().mockResolvedValue(Array.from({ length: 12 }, (_, index) => ({
        gameId: 'r20250501s-d-01', gameDate: '2025-05-01', sequence: index + 1, inning: 1, half: 'bottom', offenseTeam: 'ヤクルト', opponentTeam: '中日',
        eventType: 'plate_appearance', eventSubtype: 'standard', batterName: '山田', pitcherName: '投手', runnerName: null,
        resultText: 'ホームラン', batterUrl: 'https://npb.jp/bis/players/91895133.html', eventAttributesJson: '{}',
        sourceUrl: 'https://npb.jp/scores/2025/0501/s-d-01/playbyplay.html',
      }))),
      searchBattingLines: vi.fn().mockResolvedValue([{ playerId: '91895133', sourceKind: 'bis_batting', gameDate: '2025-01-01', team: 'ヤクルト',
        statsJson: '{"本塁打":"12"}', sourceUrl: 'https://npb.jp/bis/2025/stats/idb1_s.html' }]),
      listSourceSnapshotsByGameIds: vi.fn().mockResolvedValue([]),
    }
    const service = createContractChatService(query as unknown as ChatQueryService, async () => request(meaning))
    const answer = await service.answerQuestion(oracle.question)
    expect(answer.results.events).toHaveLength(12)
    expect(answer.answer.evidence_validation?.official_total_status).toBe('verified')
    expect(answer.structured_query?.query_contract).toEqual(oracle.meaning)
    expect(query.searchEvents).toHaveBeenCalledWith(expect.objectContaining({ batter_player_id: '91895133' }))
  })

  it('plans discrete years as separate operations, rather than including the intervening season', () => {
    const contract = { ...meaning, temporal_scope: { ...meaning.temporal_scope, years: [2023, 2025] } }
    expect(compileQueryContract(contract).map(({ query }) => (query.filters as { year?: number }).year)).toEqual([2023, 2025])
  })

  it('applies the current-season default to an unspecified season without silently summing the career', () => {
    const contract: QueryContract = { ...meaning, requested_output: [{ kind: 'batting_statistics', fields: ['homeRuns'] }], predicates: [],
      temporal_scope: { ...meaning.temporal_scope, years: [] } }
    const currentYear = Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Tokyo', year: 'numeric' }).format(new Date()))
    expect(compileQueryContract(contract)[0]?.query.filters).toMatchObject({ year: currentYear })
    expect(compileQueryContract({ ...contract, temporal_scope: { ...contract.temporal_scope, relative: 'career' } })[0]?.query.filters).not.toHaveProperty('year')
    expect(() => compileQueryContract({ ...contract, temporal_scope: { ...contract.temporal_scope, relative: 'unresolved period' } })).toThrow('relative_time_not_resolved')
  })

  it('asks the provider only for semantic meaning, never a second physical filter interpretation', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(request(meaning)) } }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ equivalent: true, issues: [] }) } }] })))
    const parse = createSemanticQueryLlm({ baseUrl: 'https://example.test/v1', apiKey: 'test', model: 'test' }, { fetch })
    expect((await parse(oracle.question)).query_contract).toEqual(oracle.meaning)
    const body = JSON.parse(fetch.mock.calls[0]![1].body)
    expect(body.response_format.json_schema.schema.properties).not.toHaveProperty('filters')
    expect(body.response_format.json_schema.schema.properties).not.toHaveProperty('intent')
    expect(body.response_format.json_schema.strict).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(JSON.parse(fetch.mock.calls[1]![1].body).response_format.json_schema.name).toBe('npb_semantic_alignment')
  })

  it('retries an incompatible metric predicate without executing or silently rewriting its meaning', async () => {
    const invalid = { ...meaning, predicates: [{ field: 'home_runs', operator: 'gt', value: 0 }] }
    const response = (value: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(request(value as QueryContract)) } }] }))
    const fetch = vi.fn().mockResolvedValueOnce(response(invalid)).mockResolvedValueOnce(response(meaning))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ equivalent: true, issues: [] }) } }] })))
    const onRequest = vi.fn()
    const parse = createSemanticQueryLlm({ baseUrl: 'https://example.test/v1', apiKey: 'test', model: 'test' }, { fetch, onRequest })
    expect((await parse(oracle.question)).query_contract).toEqual(oracle.meaning)
    expect(onRequest).toHaveBeenCalledTimes(3)
    expect(JSON.parse(fetch.mock.calls[1]![1].body).messages.at(-1).content).toContain('individual play')
  })
})
