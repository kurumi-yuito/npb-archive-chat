import { describe, expect, it } from 'vitest'
import { shouldRetryHttp } from '../../../scripts/qa-runner-retry.mjs'

describe('QA runner HTTP retries', () => {
  it('stops before the final attempt so a persistent 503 is recorded as an error', () => {
    expect(shouldRetryHttp({
      attempt: 2,
      fetchRetryCount: 3,
      httpRetryCount: 4,
      status: 503,
      code: 'chat_llm_unavailable',
    })).toBe(true)
    expect(shouldRetryHttp({
      attempt: 3,
      fetchRetryCount: 3,
      httpRetryCount: 4,
      status: 503,
      code: 'chat_llm_unavailable',
    })).toBe(false)
  })

  it('honors disabled HTTP retries', () => {
    expect(shouldRetryHttp({
      attempt: 0,
      fetchRetryCount: 3,
      httpRetryCount: 0,
      status: 503,
      code: 'chat_llm_unavailable',
    })).toBe(false)
  })
})
