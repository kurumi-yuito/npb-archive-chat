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
