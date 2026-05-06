import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { chatStructuredQuerySchema, type ChatStructuredQuery } from '@npb/schemas'
import { createChatQueryParser } from '../server/services/chat-query-parser'
import { normalizeChatStructuredQuery } from '../server/services/chat-query-normalizer'

type EvalCase = {
  id: string
  message: string
  expected_raw: ChatStructuredQuery
  expected_normalized: ChatStructuredQuery
}

const evalCases = loadEvalCases()

describe('eval-chat-queries', () => {
  const parser = createChatQueryParser({
    baseUrl: process.env.CHAT_QUERY_LLM_BASE_URL,
    apiKey: process.env.CHAT_QUERY_LLM_API_KEY,
    model: process.env.CHAT_QUERY_LLM_MODEL,
  })

  it(`evaluates ${evalCases.length} manual chat-query cases`, async () => {
    const results: Array<{
      id: string
      rawPass: boolean
      normalizedPass: boolean
    }> = []

    for (const testCase of evalCases) {
      const actualRaw = stripUndefined(await parser(testCase.message))
      const actualNormalized = stripUndefined(normalizeChatStructuredQuery(actualRaw))
      const expectedRaw = stripUndefined(testCase.expected_raw)
      const expectedNormalized = stripUndefined(testCase.expected_normalized)

      const rawPass = equalsStructuredQuery(actualRaw, expectedRaw)
      const normalizedPass = equalsStructuredQuery(actualNormalized, expectedNormalized)

      results.push({
        id: testCase.id,
        rawPass,
        normalizedPass,
      })

      expect(actualRaw).toEqual(expectedRaw)
      expect(actualNormalized).toEqual(expectedNormalized)
    }

    const passed = results.filter((entry) => entry.rawPass && entry.normalizedPass).length
    const failed = results.length - passed
    console.table(results)
    console.log(
      `eval-chat-queries: ${passed}/${results.length} passed, ${failed}/${results.length} failed`,
    )
  })
})

function loadEvalCases(): EvalCase[] {
  const path = resolve(process.cwd(), '../../docs/eval-chat-queries.json')
  const payload = JSON.parse(readFileSync(path, 'utf8')) as EvalCase[]

  return payload.map((entry) => ({
    id: entry.id,
    message: entry.message,
    expected_raw: chatStructuredQuerySchema.parse(entry.expected_raw),
    expected_normalized: chatStructuredQuerySchema.parse(entry.expected_normalized),
  }))
}

function equalsStructuredQuery(
  left: ChatStructuredQuery,
  right: ChatStructuredQuery,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => stripUndefined(entry)) as T
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value).flatMap(([key, entry]) =>
      entry === undefined ? [] : [[key, stripUndefined(entry)]],
    )
    return Object.fromEntries(entries) as T
  }

  return value
}
