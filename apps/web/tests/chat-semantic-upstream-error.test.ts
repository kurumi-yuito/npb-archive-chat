import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { semanticUpstreamError } from '../server/services/chat-semantic-upstream-error'
import { createSemanticQueryLlm } from '../server/services/chat-semantic-llm'

const quota = () => new Response(JSON.stringify({ error: { type: 'insufficient_quota', code: 'credit_balance_exhausted', message: 'private provider prose', api_key: 'private-key' } }), { status: 429 })

describe('provider availability and bounded evaluation cost (Q-201)', () => {
  it('classifies billing errors without retaining provider prose or arbitrary fields', async () => {
    const error = await semanticUpstreamError(quota(), 'parser')
    expect(error.upstream).toEqual({ status: 429, reason: 'upstream_quota_exhausted', retryable: false, code: 'credit_balance_exhausted', type: 'insufficient_quota' })
    expect(error.message).toBe('Semantic parser upstream HTTP 429')
    expect(JSON.stringify(error)).not.toMatch(/private provider prose|private-key/u)
    const unknown = await semanticUpstreamError(new Response(JSON.stringify({ error: { code: 'private-key', type: 'private-type' } }), { status: 401 }), 'verifier')
    expect(unknown.upstream).toEqual({ status: 401, reason: 'upstream_authentication_failed', retryable: false })
  })

  it('distinguishes throttling and non-JSON server failures from exhausted credit', async () => {
    const rate = await semanticUpstreamError(new Response(JSON.stringify({ error: { type: 'rate_limit_error', code: 'slow_down' } }), { status: 429 }), 'parser')
    expect(rate.upstream).toMatchObject({ reason: 'upstream_rate_limited', retryable: true })
    const unavailable = await semanticUpstreamError(new Response('<html>private debug page</html>', { status: 502 }), 'verifier')
    expect(unavailable.upstream).toEqual({ status: 502, reason: 'upstream_unavailable', retryable: true })
    expect(unavailable.message).not.toContain('private debug page')
  })

  it.each(['facts', 'parser', 'verifier'] as const)('does not regenerate or retry a contract after %s credit exhaustion', async (stage) => {
    const meaning = JSON.parse(readFileSync(new URL('../../../docs/eval-query-contracts.json', import.meta.url), 'utf8')).cases[0].meaning
    const candidate = new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ domain: 'npb', policy: 'execute', query_contract: meaning, clarification_reason: null, subject: null }) } }] }))
    const fetch = vi.fn()
    if (stage !== 'facts') fetch.mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ entity_mentions: [], requires_causal_explanation: false, comparison_period: 'none' }) } }] })))
    if (stage === 'verifier') fetch.mockResolvedValueOnce(candidate)
    fetch.mockResolvedValueOnce(quota())
    await expect(createSemanticQueryLlm({ baseUrl: 'https://example.test/v1', apiKey: 'test', model: 'test' }, { fetch })('2025年にヤクルトの山田が打ったホームラン一覧'))
      .rejects.toMatchObject({ upstream: { reason: 'upstream_quota_exhausted', retryable: false } })
    expect(fetch).toHaveBeenCalledTimes(stage === 'facts' ? 1 : stage === 'parser' ? 2 : 3)
  })
})
