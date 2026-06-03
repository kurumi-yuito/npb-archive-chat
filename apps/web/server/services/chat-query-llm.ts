import { chatStructuredQuerySchema, type ChatStructuredQuery } from '@npb/schemas'
import { z } from 'zod'
import {
  type ChatQueryParserContext,
  buildChatQueryParserUserPrompt,
  chatQueryParserSystemPrompt,
} from './chat-query-parser-prompt'

const openAiCompatibleChatCompletionSchema = z.object({
  choices: z.array(
    z.object({
      message: z.object({
        content: z.union([
          z.string(),
          z.array(
            z.object({
              text: z.string().optional(),
            }).passthrough(),
          ),
        ]),
      }),
    }),
  ).min(1),
})

export type ChatQueryLlmConfig = {
  baseUrl: string
  apiKey: string
  model: string
}

type ChatQueryLlmDependencies = {
  fetch?: typeof fetch
}

export function hasChatQueryLlmConfig(config: Partial<ChatQueryLlmConfig>): config is ChatQueryLlmConfig {
  return Boolean(config.baseUrl && config.apiKey && config.model)
}

export function createChatQueryLlm(
  config: ChatQueryLlmConfig,
  dependencies: ChatQueryLlmDependencies = {},
) {
  const fetchFn = dependencies.fetch ?? globalThis.fetch

  return {
    async generateStructuredQuery(
      message: string,
      context: ChatQueryParserContext = {},
    ): Promise<ChatStructuredQuery> {
      const body = JSON.stringify({
        model: config.model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: chatQueryParserSystemPrompt },
          { role: 'user', content: buildChatQueryParserUserPrompt(message, context) },
        ],
      })
      const headers = {
        'content-type': 'application/json',
        authorization: `Bearer ${config.apiKey}`,
      }
      const url = buildChatCompletionsUrl(config.baseUrl)

      const delays = [1000, 2000]
      let response: Response | undefined
      for (let attempt = 0; attempt <= delays.length; attempt++) {
        response = await fetchFn(url, { method: 'POST', headers, body })
        if (response.status !== 429 || attempt === delays.length) break
        await sleep(delays[attempt])
      }

      if (!response!.ok) {
        throw new Error(`LLM query generation failed with status ${response!.status}`)
      }

      const payload = openAiCompatibleChatCompletionSchema.parse(await response!.json())
      const rawContent = payload.choices[0]?.message.content
      const text = Array.isArray(rawContent)
        ? rawContent.map((part) => part.text ?? '').join('\n').trim()
        : rawContent.trim()

      const parsed = JSON.parse(extractJsonObject(text))
      return chatStructuredQuerySchema.parse(normalizeStructuredQueryFromLlmMessage(message, parsed))
    },
  }
}

function buildChatCompletionsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, '')}/chat/completions`
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function extractJsonObject(content: string): string {
  const fencedMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/iu)
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim()
  }

  const start = content.indexOf('{')
  const end = content.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) {
    throw new Error('LLM response did not include a JSON object')
  }

  return content.slice(start, end + 1)
}

function normalizeStructuredQueryFromLlmMessage(message: string, value: unknown): unknown {
  if (!value || typeof value !== 'object') {
    return value
  }

  const query = value as {
    intent?: unknown
    filters?: unknown
  }

  if (query.intent !== 'aggregate_pitching' || !query.filters || typeof query.filters !== 'object') {
    return value
  }

  const filters = query.filters as Record<string, unknown>
  if (filters.sort_by !== 'pitchCount') {
    return value
  }

  return {
    intent: 'search_pitching',
    filters: {
      ...filters,
      limit: typeof filters.limit === 'number'
        ? filters.limit
        : /最も|最多|一番|トップ|最大/u.test(message)
          ? 1
          : 10,
    },
  }
}
