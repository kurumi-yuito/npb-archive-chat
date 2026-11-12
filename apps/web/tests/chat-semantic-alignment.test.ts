import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import type { SemanticFacts } from '../server/services/chat-semantic-facts'
import { createSemanticQueryLlm } from '../server/services/chat-semantic-llm'

const oracle = JSON.parse(readFileSync(new URL('../../../docs/eval-query-contracts.json', import.meta.url), 'utf8')).cases[0]
const config = { baseUrl: 'https://example.test/v1', apiKey: 'test', model: 'test' }
const candidate = { domain: 'npb', policy: 'execute', query_contract: oracle.meaning, clarification_reason: null, subject: null }
const completion = (value: unknown) => new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value) } }] }))
const independentFacts = (overrides: Partial<SemanticFacts> = {}) => completion({ entity_mentions: [], requires_causal_explanation: false, comparison_period: 'none', ...overrides })
const accepted = () => completion({ equivalent: true, issues: [] })
const rejected = () => completion({ equivalent: false, issues: [{ field: 'policy', reason: 'An event list is historical data, not external news.' }] })

describe('semantic meaning verification (Q-183)', () => {
  it('retains the NPB domain without inventing a competition filter (Q21/Q36)', async () => {
    const correct = { ...candidate, query_contract: { ...oracle.meaning, predicates: [],
      entities: [{ kind: 'player', role: 'pitcher', mention: '対象甲' }],
      competition_scope: { level: 'unspecified', competitions: [] },
      requested_output: [{ kind: 'pitching_records', fields: ['gameDate'] }],
      temporal_scope: { ...oracle.meaning.temporal_scope, years: [], relative: 'latest_appearance' },
      completeness: { mode: 'unspecified', limit: null } } }
    const wrong = { ...correct, query_contract: { ...correct.query_contract, competition_scope: { level: 'unspecified', competitions: ['NPB'] } } }
    const fetch = vi.fn().mockResolvedValueOnce(independentFacts({ entity_mentions: [{ kind: 'team', mention: 'NPB' }] }))
      .mockResolvedValueOnce(completion(wrong)).mockResolvedValueOnce(completion(correct)).mockResolvedValueOnce(accepted())
    const result = await createSemanticQueryLlm(config, { fetch })('対象甲の最後のNPB登板は？')
    expect(result.query_contract?.competition_scope.competitions).toEqual([])
    expect(fetch).toHaveBeenCalledTimes(4)
  })
  it('compares independent appearance windows without invented calendar cutoffs (Q109/Q111/Q112)', async () => {
    const recent = { ...candidate, query_contract: { ...oracle.meaning, predicates: [],
      entities: ['対象甲', '対象乙'].map((mention) => ({ kind: 'player', role: 'subject', mention })),
      requested_output: [{ kind: 'appearance_records', fields: [] }],
      temporal_scope: { ...oracle.meaning.temporal_scope, years: [], relative: 'recent_appearances' },
      completeness: { mode: 'bounded', limit: 3 } } }
    const fetch = vi.fn().mockResolvedValueOnce(independentFacts({ comparison_period: 'bounded_period' }))
      .mockResolvedValueOnce(completion(recent)).mockResolvedValueOnce(accepted())
    const result = await createSemanticQueryLlm(config, { fetch })('対象甲と対象乙のそれぞれ直近3試合の成績を比較して')
    expect(result.query_contract?.temporal_scope.date_to).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(3)
  })
  it.each(['選手', '投手', '打者', 'さん', '氏'])('compares player names without the %s suffix in independent extraction', async (suffix) => {
    const named = { ...candidate, query_contract: { ...oracle.meaning,
      entities: [{ kind: 'player', role: 'subject', mention: '対象甲' }],
    } }
    const fetch = vi.fn().mockResolvedValueOnce(independentFacts({ entity_mentions: [{ kind: 'player', mention: `対象甲${suffix}` }] }))
      .mockResolvedValueOnce(completion(named)).mockResolvedValueOnce(accepted())
    const result = await createSemanticQueryLlm(config, { fetch })(`対象甲${suffix}の成績は？`)
    expect(result.query_contract?.entities[0]?.mention).toBe('対象甲')
    expect(fetch).toHaveBeenCalledTimes(3)
  })
  it('still rejects a different player when independent extraction includes an honorific', async () => {
    const named = (mention: string) => ({ ...candidate, query_contract: { ...oracle.meaning,
      entities: [{ kind: 'player', role: 'subject', mention }],
    } })
    const fetch = vi.fn().mockResolvedValueOnce(independentFacts({ entity_mentions: [{ kind: 'player', mention: '対象甲選手' }] }))
      .mockResolvedValueOnce(completion(named('対象乙'))).mockResolvedValueOnce(accepted())
      .mockResolvedValueOnce(completion(named('対象甲'))).mockResolvedValueOnce(accepted())
    const result = await createSemanticQueryLlm(config, { fetch })('対象甲選手の成績は？', { history: [{ role: 'assistant', content: '対象乙について説明しました。' }] })
    expect(result.query_contract?.entities[0]?.mention).toBe('対象甲')
    expect(fetch).toHaveBeenCalledTimes(5)
  })
  it('rejects an added causal output independently of a positive review verdict', async () => {
    const added = { ...candidate, query_contract: { ...oracle.meaning, requested_output: [
      ...oracle.meaning.requested_output, { kind: 'causal_explanation', fields: [] },
    ] } }
    const fetch = vi.fn().mockResolvedValueOnce(independentFacts()).mockResolvedValueOnce(completion(added)).mockResolvedValueOnce(accepted())
      .mockResolvedValueOnce(completion(candidate)).mockResolvedValueOnce(accepted())
    const result = await createSemanticQueryLlm(config, { fetch })(oracle.question)
    expect(result.query_contract?.requested_output).toEqual(oracle.meaning.requested_output)
    const independentRequest = JSON.parse(fetch.mock.calls[0]![1].body)
    expect(independentRequest.response_format.json_schema.name).toBe('npb_semantic_facts')
    expect(JSON.parse(independentRequest.messages.at(-1).content)).not.toHaveProperty('candidate')
    expect(JSON.parse(JSON.parse(fetch.mock.calls[2]![1].body).messages.at(-1).content).independent_semantics.requires_causal_explanation).toBe(false)
    expect(JSON.parse(fetch.mock.calls[3]![1].body).messages.at(-1).content).toContain('exactly when a cause or reason was requested')
  })
  it.each(['whole_year', 'single_day'])('retains cumulative calendar windows when a candidate substitutes %s', async (shape) => {
    const scope = { ...oracle.meaning, entities: [{ kind: 'team', role: 'subject', mention: '巨人' }], predicates: [],
      temporal_scope: { years: [2024, 2025], year_from: null, year_to: null, date_from: null, date_to: null, relative: null } }
    const wrong = { ...candidate, query_contract: { ...scope, requested_output: [{ kind: 'team_statistics', fields: ['wins'] }] } }
    const { version: _version, requested_output: _outputs, ...baseScope } = wrong.query_contract
    void _version; void _outputs
    const scopedOutputs = [2024, 2025].map((year) => ({
      kind: 'team_statistics', fields: ['wins'], scope: { ...baseScope,
        temporal_scope: { ...baseScope.temporal_scope, years: [year], date_from: `${year}-01-01`, date_to: `${year}-06-30` } },
    }))
    const correct = { ...wrong, query_contract: { ...wrong.query_contract, requested_output: scopedOutputs } }
    const singleDays = { ...correct, query_contract: { ...correct.query_contract,
      requested_output: scopedOutputs.map((output) => ({ ...output,
        scope: { ...output.scope, temporal_scope: { ...output.scope.temporal_scope, date_from: output.scope.temporal_scope.date_to } },
      })),
    } }
    const verdict = accepted
    const fetch = vi.fn().mockResolvedValueOnce(independentFacts({ comparison_period: 'season_to_date' }))
      .mockResolvedValueOnce(completion(shape === 'whole_year' ? wrong : singleDays)).mockResolvedValueOnce(verdict())
      .mockResolvedValueOnce(completion(correct)).mockResolvedValueOnce(verdict())
    const result = await createSemanticQueryLlm(config, { fetch })('2024年と2025年の同じ6月末時点の巨人の勝利数を比較して')
    expect(result.query_contract?.requested_output.map((output) => output.scope?.temporal_scope.date_to)).toEqual(['2024-06-30', '2025-06-30'])
    expect(JSON.parse(fetch.mock.calls[3]![1].body).messages.at(-1).content).toContain(shape === 'whole_year' ? 'separate explicit end-date cutoff' : 'single day or current-month-only range')
    expect(fetch).toHaveBeenCalledTimes(5)
  })
  it('accepts league constraints in competition scope and excludes inherited names from latest-turn coverage', async () => {
    const contract = { ...oracle.meaning, entities: [{ kind: 'player', role: 'subject', mention: '対象甲' }], predicates: [],
      competition_scope: { level: 'first', competitions: ['セ・リーグ'] },
      requested_output: [{ kind: 'batting_statistics', fields: ['homeRuns'] }] }
    const fetch = vi.fn().mockResolvedValueOnce(independentFacts({ entity_mentions: [{ kind: 'team', mention: '巨人' }, { kind: 'team', mention: 'セリーグ' }, { kind: 'player', mention: '対象甲' }] })).mockResolvedValueOnce(completion({ ...candidate, query_contract: contract }))
      .mockResolvedValueOnce(accepted())
    const result = await createSemanticQueryLlm(config, { fetch })('2025年のセリーグの対象甲の本塁打数は？')
    expect(result.query_contract?.competition_scope.competitions).toEqual(['セ・リーグ'])
    expect(fetch).toHaveBeenCalledTimes(3)
  })
  it('requires independently extracted explicit club conditions even when the review verdict says equivalent', async () => {
    const player = { kind: 'player', role: 'subject', mention: '対象甲' }
    const club = { kind: 'team', role: 'subject', mention: '中日' }
    const wrong = { ...candidate, query_contract: { ...oracle.meaning, entities: [player], predicates: [],
      requested_output: [{ kind: 'batting_statistics', fields: ['battingAverage'] }] } }
    const correct = { ...wrong, query_contract: { ...wrong.query_contract, entities: [player, club] } }
    const verdict = accepted
    const fetch = vi.fn().mockResolvedValueOnce(independentFacts({ entity_mentions: [{ kind: 'player', mention: '対象甲' }, { kind: 'team', mention: '中日' }] })).mockResolvedValueOnce(completion(wrong)).mockResolvedValueOnce(verdict())
      .mockResolvedValueOnce(completion(correct)).mockResolvedValueOnce(verdict())
    const result = await createSemanticQueryLlm(config, { fetch })('2025年の中日の対象甲の打率は？')
    expect(result.query_contract?.entities).toEqual([player, club])
    expect(fetch).toHaveBeenCalledTimes(5)
    expect(JSON.parse(fetch.mock.calls[3]![1].body).messages.at(-1).content).toContain('Explicit team condition 中日')
  })
  it('retains the external topic instead of returning an unnamed capability refusal (B24)', async () => {
    const outside = { domain: 'non_npb', policy: 'outside_npb', query_contract: null, clarification_reason: null, subject: null }
    const fetch = vi.fn().mockResolvedValueOnce(independentFacts()).mockResolvedValueOnce(completion(outside))
      .mockResolvedValueOnce(completion({ ...outside, subject: '高校野球' })).mockResolvedValueOnce(accepted())
    const result = await createSemanticQueryLlm(config, { fetch })('高校野球の結果もわかりますか?')
    expect(result.subject).toBe('高校野球')
    expect(fetch).toHaveBeenCalledTimes(4)
    expect(JSON.parse(fetch.mock.calls[2]![1].body).messages.at(-1).content).toContain('requires a literal subject')
  })
  it('repairs a shared scope that would apply one club to both compared players', async () => {
    const { version: _version, requested_output: _outputs, ...scope } = oracle.meaning
    void _version; void _outputs
    const first = [{ kind: 'player', role: 'subject', mention: '検証甲' }, { kind: 'team', role: 'subject', mention: '巨人' }]
    const second = [{ kind: 'player', role: 'subject', mention: '検証乙' }, { kind: 'team', role: 'subject', mention: '阪神' }]
    const shared = { ...scope, entities: [...first, ...second], predicates: [], aggregation: [], grouping: [], ordering: [],
      completeness: { mode: 'unspecified', limit: null } }
    const wrong = { ...candidate, query_contract: { ...shared, version: 1, requested_output: [{ kind: 'batting_statistics', fields: ['battingAverage'] }] } }
    const correct = { ...wrong, query_contract: { ...wrong.query_contract, requested_output: [first, second].map((entities) => ({
      kind: 'batting_statistics', fields: ['battingAverage'], scope: { ...shared, entities },
    })) } }
    const fetch = vi.fn().mockResolvedValueOnce(independentFacts()).mockResolvedValueOnce(completion(wrong)).mockResolvedValueOnce(completion(correct)).mockResolvedValueOnce(accepted())
    const result = await createSemanticQueryLlm(config, { fetch })('2025年の巨人の検証甲と阪神の検証乙の打率を比較')
    expect(result.query_contract?.requested_output.map((output) => output.scope?.entities)).toEqual([first, second])
    expect(fetch).toHaveBeenCalledTimes(4)
    expect(JSON.parse(fetch.mock.calls[2]![1].body).messages.at(-1).content).toContain('multiple player-to-club associations')
  })
  it('does not block a valid clarification on an unused generated subject label', async () => {
    const contract = { ...oracle.meaning, entities: [], predicates: [], aggregation: [], grouping: [], ordering: [],
      requested_output: [{ kind: 'game_details', fields: ['starter'] }], unresolved_constraints: ['referenced_game_unavailable'] }
    const clarification = { ...candidate, policy: 'clarify', clarification_reason: 'history_target_unavailable',
      query_contract: contract, subject: 'an unused paraphrase not present in the conversation' }
    const fetch = vi.fn().mockResolvedValueOnce(independentFacts()).mockResolvedValueOnce(completion(clarification)).mockResolvedValueOnce(accepted())
    const result = await createSemanticQueryLlm(config, { fetch })('その試合の先発は？')
    expect(result.policy).toBe('clarify')
    expect(result.subject).toBeNull()
    expect(result.query_contract?.unresolved_constraints).toEqual(['referenced_game_unavailable'])
    expect(fetch).toHaveBeenCalledTimes(3)
  })
  it('does not let an executable scope bypass a declared unresolved condition', async () => {
    const blocked = { ...candidate, query_contract: { ...oracle.meaning, unresolved_constraints: ['specific unresolved semantic condition'] } }
    const fetch = vi.fn().mockResolvedValueOnce(independentFacts()).mockResolvedValueOnce(completion(blocked)).mockResolvedValueOnce(completion(candidate)).mockResolvedValueOnce(accepted())
    const result = await createSemanticQueryLlm(config, { fetch })(oracle.question)
    expect(result.query_contract?.unresolved_constraints).toEqual([])
    expect(fetch).toHaveBeenCalledTimes(4)
    expect(JSON.parse(fetch.mock.calls[2]![1].body).messages.at(-1).content).toContain('Execution cannot retain unresolved semantic conditions')
  })
  it.each(['セ・リーグ', 'パ・リーグ', '中日ドラゴンズ'])('checks the official catalog before attempting player resolution for %s', async (mention) => {
    const contract = { ...oracle.meaning, requested_output: [{ kind: 'batting_statistics', fields: ['homeRuns'] }], predicates: [],
      entities: [{ kind: 'team', role: 'subject', mention }], grouping: ['player'], ordering: [{ field: 'homeRuns', direction: 'desc' }], completeness: { mode: 'top_n', limit: 3 } }
    const correct = { ...candidate, query_contract: contract }
    const wrong = { ...correct, query_contract: { ...contract, entities: [{ ...contract.entities[0], kind: 'player' }] } }
    const fetch = vi.fn().mockResolvedValueOnce(independentFacts()).mockResolvedValueOnce(completion(wrong)).mockResolvedValueOnce(completion(correct)).mockResolvedValueOnce(accepted())
    const result = await createSemanticQueryLlm(config, { fetch })(`2025年の${mention}の本塁打上位3人`)
    expect(result.query_contract?.entities).toEqual(contract.entities)
    expect(fetch).toHaveBeenCalledTimes(4)
    expect(JSON.parse(fetch.mock.calls[2]![1].body).messages.at(-1).content).toContain('official club/league catalog')
  })
  it.each(['/山田/', '山田哲人'])('rejects an invented name span %s before official identity resolution', async (mention) => {
    const changed = { ...candidate, query_contract: { ...oracle.meaning, entities: oracle.meaning.entities.map((entity: { kind: string }) => entity.kind === 'player' ? { ...entity, mention } : entity) } }
    const fetch = vi.fn().mockResolvedValueOnce(independentFacts()).mockResolvedValueOnce(completion(changed)).mockResolvedValueOnce(completion(candidate)).mockResolvedValueOnce(accepted())
    const result = await createSemanticQueryLlm(config, { fetch })(oracle.question)
    expect(result.query_contract?.entities.find((entity) => entity.kind === 'player')?.mention).toBe('山田')
    expect(fetch).toHaveBeenCalledTimes(4)
    expect(JSON.parse(fetch.mock.calls[2]![1].body).messages.at(-1).content).toContain('literal name spans')
  })
  it('repairs a syntactically valid but semantically wrong policy before accepting a contract', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(independentFacts()).mockResolvedValueOnce(completion({ ...candidate, policy: 'news', query_contract: null }))
      .mockResolvedValueOnce(rejected()).mockResolvedValueOnce(completion(candidate)).mockResolvedValueOnce(accepted())
    const onParsed = vi.fn(), onReview = vi.fn()
    const history = [{ role: 'user' as const, content: '過去の公式戦記録を調べています。' }]
    const result = await createSemanticQueryLlm(config, { fetch, onParsed, onReview })(oracle.question, { history })
    expect(result.query_contract).toEqual(oracle.meaning)
    expect(fetch).toHaveBeenCalledTimes(5)
    expect(fetch.mock.contexts).toEqual([undefined, undefined, undefined, undefined, undefined])
    expect(onParsed).toHaveBeenCalledTimes(1)
    expect(onReview.mock.calls.map(([review]) => review.issues.length)).toEqual([1, 0])
    const reviewRequest = JSON.parse(fetch.mock.calls[2]![1].body)
    const reviewInput = JSON.parse(reviewRequest.messages[1].content)
    expect(reviewInput.history).toEqual(history)
    expect(reviewInput.message).toBe(oracle.question)
    expect(reviewInput.candidate.policy).toBe('news')
    expect(reviewRequest.response_format.json_schema.strict).toBe(true)
    expect(JSON.parse(fetch.mock.calls[3]![1].body).messages.at(-1).content).toContain('historical data')
    expect(JSON.parse(JSON.parse(fetch.mock.calls[3]![1].body).messages.at(-2).content).policy).toBe('news')
  })

  it('stops after two rejected candidates without returning a failed interpretation', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(independentFacts()).mockResolvedValueOnce(completion(candidate)).mockResolvedValueOnce(rejected())
      .mockResolvedValueOnce(completion(candidate)).mockResolvedValueOnce(rejected())
    const onParsed = vi.fn()
    await expect(createSemanticQueryLlm(config, { fetch, onParsed })(oracle.question)).rejects.toThrow('Meaning does not match')
    expect(fetch).toHaveBeenCalledTimes(5)
    expect(onParsed).not.toHaveBeenCalled()
  })

  it('does not bypass an unavailable verifier or retry an upstream quota error', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(independentFacts()).mockResolvedValueOnce(completion(candidate)).mockResolvedValueOnce(new Response('', { status: 429 }))
    await expect(createSemanticQueryLlm(config, { fetch })(oracle.question)).rejects.toThrow('Semantic verifier upstream HTTP 429')
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it.each([
    { equivalent: true, issues: [{ field: 'entities', reason: 'missing subject' }] },
    { equivalent: false, issues: [] },
  ])('rejects an inconsistent review verdict (%j)', async (verdict) => {
    const fetch = vi.fn().mockResolvedValueOnce(independentFacts()).mockResolvedValueOnce(completion(candidate)).mockResolvedValueOnce(completion(verdict))
    await expect(createSemanticQueryLlm(config, { fetch })(oracle.question)).rejects.toThrow('Inconsistent semantic review')
    expect(fetch).toHaveBeenCalledTimes(3)
  })
})
