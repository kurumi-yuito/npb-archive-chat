import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { chatRequestSchema, queryContractSchema, type PlayerCandidate, type QueryContract } from '@npb/schemas'
import type { ChatQueryService } from '@npb/db'
import { createContractChatService } from '../server/services/chat-contract-service'

const base = queryContractSchema.parse(JSON.parse(readFileSync(new URL('../../../docs/eval-query-contracts.json', import.meta.url), 'utf8')).cases[0].meaning)
const contract: QueryContract = { ...base, requested_output: [{ kind: 'batting_statistics', fields: ['homeRuns'] }], predicates: [],
  entities: [{ kind: 'player', role: 'subject', mention: '検証同名' }, { kind: 'team', role: 'subject', mention: '巨人' }],
  competition_scope: { level: 'farm', competitions: [] } }
const candidates: PlayerCandidate[] = [
  { player_id: '11111111', name: '検証 同名', primary_team: '巨人', roles: ['profile'], teams: ['巨人'], years: [2025], positions: ['内野手'], uniform_numbers: ['6'], source_urls: ['https://npb.jp/announcement/2025/registered_g.html'] },
  { player_id: '22222222', name: '検証 同名', primary_team: '巨人', roles: ['official_registration'], teams: ['巨人'], years: [2025], positions: ['捕手'], uniform_numbers: ['006'], source_urls: ['https://npb.jp/announcement/2025/registereddev_g.html'] },
]

describe('official candidate selection without rewriting the question', () => {
  it('distinguishes namesakes, validates a selected ID against the same dated candidates and keeps IDs out of semantic parsing', async () => {
    const parse = vi.fn(async () => ({ domain: 'npb' as const, policy: 'execute' as const, query_contract: contract, clarification_reason: null, subject: null }))
    const query = { searchPlayerCandidates: vi.fn().mockResolvedValue(candidates), aggregateBattingLines: vi.fn().mockResolvedValue([]) }
    const service = createContractChatService(query as unknown as ChatQueryService, parse)
    const ambiguous = await service.answerQuestion('検証同名の指定年度の成績')
    expect(ambiguous.answer.resolved_player?.status).toBe('ambiguous')
    expect(ambiguous.answer.summary).toContain('内野手・背番号6')
    expect(ambiguous.answer.summary).toContain('捕手・背番号006')
    expect(ambiguous.answer.source_urls).toHaveLength(2)
    const selected = await service.answerQuestion('検証同名の指定年度の成績', { selectedPlayer: { mention: '検証同名', player_id: '22222222' } })
    expect(selected.answer.resolved_player).toMatchObject({ status: 'resolved', player_id: '22222222' })
    expect(query.aggregateBattingLines).toHaveBeenCalledWith(expect.objectContaining({ player_id: '22222222', year: 2025, team: '巨人', level: 'farm' }))
    expect(parse.mock.calls.every((call) => JSON.stringify(call).includes('22222222') === false)).toBe(true)
    query.aggregateBattingLines.mockClear()
    const forged = await service.answerQuestion('検証同名の指定年度の成績', { selectedPlayer: { mention: '検証同名', player_id: '99999999' } })
    expect(forged.answer.resolved_player?.status).toBe('not_found')
    expect(query.aggregateBattingLines).not.toHaveBeenCalled()
  })

  it('returns a bounded evidence limitation instead of a 503 or a partial statistic when source identities are incomplete', async () => {
    const sourceUrl = 'https://npb.jp/bis/2025/stats/idb2_g.html'
    const query = { searchPlayerCandidates: vi.fn().mockResolvedValue(candidates), aggregateBattingLines: vi.fn().mockResolvedValue([
      { kind: 'batting', label: '検証 同名', total: 3, stats: { homeRuns: 999, playerId: '11111111', year: 2025, level: 'farm', evidenceStatus: 'official_identity_incomplete', sourceUrls: JSON.stringify([sourceUrl]) } },
    ]) }
    const result = await createContractChatService(query as unknown as ChatQueryService, async () => ({ domain: 'npb', policy: 'execute', query_contract: contract, clarification_reason: null, subject: null }))
      .answerQuestion('指定選手の本塁打数', { selectedPlayer: { mention: '検証同名', player_id: '11111111' } })
    expect(result.answer.summary).toContain('未確認')
    expect(result.answer.summary).not.toContain('999')
    expect(result.results.aggregates).toEqual([])
    expect(result.answer.result_count).toBe(0)
    expect(result.answer.source_urls).toEqual([sourceUrl])
  })

  it('rejects a malformed selection ID at the public request boundary', () => {
    expect(chatRequestSchema.safeParse({ message: '質問', selected_player: { mention: '選手', player_id: '11111111 OR 1=1' } }).success).toBe(false)
  })
})
