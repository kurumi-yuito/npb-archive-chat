import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { createSemanticQueryLlm } from '../server/services/chat-semantic-llm'

const oracle = JSON.parse(readFileSync(new URL('../../../docs/eval-query-contracts.json', import.meta.url), 'utf8')).cases[0]
const config = { baseUrl: 'https://example.test/v1', apiKey: 'test', model: 'test' }
const candidate = { domain: 'npb', policy: 'execute', query_contract: oracle.meaning, clarification_reason: null, subject: null }
const completion = (value: unknown) => new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value) } }] }))
const accepted = () => completion({ equivalent: true, issues: [] })
const rejected = () => completion({ equivalent: false, issues: [{ field: 'policy', reason: 'An event list is historical data, not external news.' }] })

describe('semantic meaning verification (Q-183)', () => {
  it('does not let an executable scope bypass a declared unresolved condition', async () => {
    const blocked = { ...candidate, query_contract: { ...oracle.meaning, unresolved_constraints: ['specific unresolved semantic condition'] } }
    const fetch = vi.fn().mockResolvedValueOnce(completion(blocked)).mockResolvedValueOnce(completion(candidate)).mockResolvedValueOnce(accepted())
    const result = await createSemanticQueryLlm(config, { fetch })(oracle.question)
    expect(result.query_contract?.unresolved_constraints).toEqual([])
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(JSON.parse(fetch.mock.calls[1]![1].body).messages.at(-1).content).toContain('Execution cannot retain unresolved semantic conditions')
  })
  it.each(['セ・リーグ', 'パ・リーグ', '中日ドラゴンズ'])('checks the official catalog before attempting player resolution for %s', async (mention) => {
    const contract = { ...oracle.meaning, requested_output: [{ kind: 'batting_statistics', fields: ['homeRuns'] }], predicates: [],
      entities: [{ kind: 'team', role: 'subject', mention }], grouping: ['player'], ordering: [{ field: 'homeRuns', direction: 'desc' }], completeness: { mode: 'top_n', limit: 3 } }
    const correct = { ...candidate, query_contract: contract }
    const wrong = { ...correct, query_contract: { ...contract, entities: [{ ...contract.entities[0], kind: 'player' }] } }
    const fetch = vi.fn().mockResolvedValueOnce(completion(wrong)).mockResolvedValueOnce(completion(correct)).mockResolvedValueOnce(accepted())
    const result = await createSemanticQueryLlm(config, { fetch })(`2025年の${mention}の本塁打上位3人`)
    expect(result.query_contract?.entities).toEqual(contract.entities)
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(JSON.parse(fetch.mock.calls[1]![1].body).messages.at(-1).content).toContain('official club/league catalog')
  })
  it.each(['/山田/', '山田哲人'])('rejects an invented name span %s before official identity resolution', async (mention) => {
    const changed = { ...candidate, query_contract: { ...oracle.meaning, entities: oracle.meaning.entities.map((entity: { kind: string }) => entity.kind === 'player' ? { ...entity, mention } : entity) } }
    const fetch = vi.fn().mockResolvedValueOnce(completion(changed)).mockResolvedValueOnce(completion(candidate)).mockResolvedValueOnce(accepted())
    const result = await createSemanticQueryLlm(config, { fetch })(oracle.question)
    expect(result.query_contract?.entities.find((entity) => entity.kind === 'player')?.mention).toBe('山田')
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(JSON.parse(fetch.mock.calls[1]![1].body).messages.at(-1).content).toContain('literal name spans')
  })
  it('repairs a syntactically valid but semantically wrong policy before accepting a contract', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(completion({ ...candidate, policy: 'news', query_contract: null }))
      .mockResolvedValueOnce(rejected()).mockResolvedValueOnce(completion(candidate)).mockResolvedValueOnce(accepted())
    const onParsed = vi.fn(), onReview = vi.fn()
    const history = [{ role: 'user' as const, content: '過去の公式戦記録を調べています。' }]
    const result = await createSemanticQueryLlm(config, { fetch, onParsed, onReview })(oracle.question, { history })
    expect(result.query_contract).toEqual(oracle.meaning)
    expect(fetch).toHaveBeenCalledTimes(4)
    expect(fetch.mock.contexts).toEqual([undefined, undefined, undefined, undefined])
    expect(onParsed).toHaveBeenCalledTimes(1)
    expect(onReview.mock.calls.map(([review]) => review.issues.length)).toEqual([1, 0])
    const reviewRequest = JSON.parse(fetch.mock.calls[1]![1].body)
    const reviewInput = JSON.parse(reviewRequest.messages[1].content)
    expect(reviewInput.history).toEqual(history)
    expect(reviewInput.message).toBe(oracle.question)
    expect(reviewInput.candidate.policy).toBe('news')
    expect(reviewRequest.response_format.json_schema.strict).toBe(true)
    expect(JSON.parse(fetch.mock.calls[2]![1].body).messages.at(-1).content).toContain('historical data')
    expect(JSON.parse(JSON.parse(fetch.mock.calls[2]![1].body).messages.at(-2).content).policy).toBe('news')
  })

  it('stops after two rejected candidates rather than returning the last failed interpretation', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(completion(candidate)).mockResolvedValueOnce(rejected())
      .mockResolvedValueOnce(completion(candidate)).mockResolvedValueOnce(rejected())
    const onParsed = vi.fn()
    await expect(createSemanticQueryLlm(config, { fetch, onParsed })(oracle.question)).rejects.toThrow('Meaning does not match')
    expect(fetch).toHaveBeenCalledTimes(4)
    expect(onParsed).not.toHaveBeenCalled()
  })

  it('does not bypass an unavailable verifier or retry an upstream quota error', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(completion(candidate)).mockResolvedValueOnce(new Response('', { status: 429 }))
    await expect(createSemanticQueryLlm(config, { fetch })(oracle.question)).rejects.toThrow('Semantic verifier upstream HTTP 429')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it.each([
    { equivalent: true, issues: [{ field: 'entities', reason: 'missing subject' }] },
    { equivalent: false, issues: [] },
  ])('rejects an inconsistent review verdict (%j)', async (verdict) => {
    const fetch = vi.fn().mockResolvedValueOnce(completion(candidate)).mockResolvedValueOnce(completion(verdict))
    await expect(createSemanticQueryLlm(config, { fetch })(oracle.question)).rejects.toThrow('Inconsistent semantic review')
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
