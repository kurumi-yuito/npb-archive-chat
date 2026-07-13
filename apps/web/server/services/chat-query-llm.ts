import { chatStructuredQuerySchema, type AggregatePitchingFilters, type ChatStructuredQuery } from '@npb/schemas'
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

export class ChatQueryLlmHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
    this.name = 'ChatQueryLlmHttpError'
  }
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

      const delays = [1000, 3000, 7000, 15000]
      let response: Response | undefined
      for (let attempt = 0; attempt <= delays.length; attempt++) {
        response = await fetchFn(url, { method: 'POST', headers, body })
        if (response.status !== 429 || attempt === delays.length) break
        await sleep(retryDelayMs(response, delays[attempt]))
      }

      if (!response!.ok) {
        const errorText = await response!.text().catch(() => '')
        throw new ChatQueryLlmHttpError(
          `LLM query generation failed with status ${response!.status}${errorText ? `: ${truncateErrorText(errorText)}` : ''}`,
          response!.status,
        )
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

function retryDelayMs(response: Response, fallbackMs: number): number {
  const retryAfter = response.headers.get('retry-after')
  if (!retryAfter) {
    return fallbackMs
  }
  const seconds = Number(retryAfter)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.max(fallbackMs, seconds * 1000)
  }
  const dateMs = Date.parse(retryAfter)
  if (Number.isFinite(dateMs)) {
    return Math.max(fallbackMs, dateMs - Date.now())
  }
  return fallbackMs
}

function truncateErrorText(value: string): string {
  return value.replace(/\s+/gu, ' ').trim().slice(0, 500)
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

export function normalizeStructuredQueryFromLlmMessage(message: string, value: unknown): unknown {
  if (!value || typeof value !== 'object') {
    return value
  }

  const query = value as {
    intent?: unknown
    filters?: unknown
  }

  const comparisonTarget = extractMultiPlayerComparisonTarget(message)
  if (comparisonTarget && comparisonTarget.names.length >= 2) {
    const comparisonNameField = comparisonTarget.kind === 'pitching' ? 'pitcher_names' : 'player_names'
    const filters = query.filters && typeof query.filters === 'object'
      ? (query.filters as Record<string, unknown>)
      : {}
    const shouldUseAggregatePitching =
      comparisonTarget.kind === 'pitching' &&
      (
        isAggregatePitchingSortBy(filters.sort_by) ||
        /防御率|WHIP|奪三振|投球回|勝利|セーブ/u.test(message)
      )
    const nextFilters: Record<string, unknown> = {
      ...filters,
      [comparisonNameField]: comparisonTarget.names,
      limit: comparisonTarget.limit ?? (typeof filters.limit === 'number' ? filters.limit : 3),
    }
    if (!shouldUseAggregatePitching) {
      nextFilters.recent = true
    }
    delete nextFilters.player_name
    delete nextFilters.pitcher_name
    delete nextFilters.batter_name
    delete nextFilters.player_id
    delete nextFilters.pitcher_player_id
    delete nextFilters.batter_player_id
    if (shouldUseAggregatePitching) {
      return {
        intent: 'aggregate_pitching',
        filters: nextFilters,
      }
    }
    return {
      intent: comparisonTarget.kind === 'pitching' ? 'search_pitching' : 'search_batting',
      filters: nextFilters,
    }
  }

  if (query.intent === 'search_pitching' && query.filters && typeof query.filters === 'object') {
    const filters = query.filters as Record<string, unknown>
    const sortBy = typeof filters.sort_by === 'string' ? filters.sort_by : undefined
    if (sortBy === 'inningsPitched' || isAggregatePitchingSortBy(sortBy)) {
      return {
        intent: 'aggregate_pitching',
        filters: {
          ...filters,
          sort_by: sortBy,
        },
      }
    }
  }

  if (query.intent !== 'aggregate_pitching' || !query.filters || typeof query.filters !== 'object') {
    if (
      query.intent === 'search_pitching' &&
      query.filters &&
      typeof query.filters === 'object'
    ) {
      const filters = query.filters as Record<string, unknown>
      if (filters.sort_by === 'inningsPitched') {
        return {
          intent: 'aggregate_pitching',
          filters: {
            ...filters,
            sort_by: 'inningsPitched',
          },
        }
      }
    }
    return value
  }

  const filters = query.filters as Record<string, unknown>
  if (filters.sort_by !== 'pitchCount') {
    if (filters.sort_by === 'inningsPitched') {
      return {
        intent: 'aggregate_pitching',
        filters: {
          ...filters,
          sort_by: 'inningsPitched',
        },
      }
    }
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

function isAggregatePitchingSortBy(value: unknown): value is Exclude<AggregatePitchingFilters['sort_by'], undefined> {
  return value === 'era' ||
    value === 'whip' ||
    value === 'strikeouts' ||
    value === 'wins' ||
    value === 'saves' ||
    value === 'games' ||
    value === 'inningsPitched' ||
    value === 'hitsAllowed' ||
    value === 'walks' ||
    value === 'earnedRuns'
}

type MultiPlayerComparisonTarget = {
  kind: 'pitching' | 'batting'
  names: string[]
  limit?: number
}

function extractMultiPlayerComparisonTarget(message: string): MultiPlayerComparisonTarget | null {
  const normalizedMessage = message
    .normalize('NFKC')
    .replace(/[「」『』]/gu, '')
    .trim()
  if (!/(?:比較|比べ|それぞれ)/u.test(normalizedMessage)) {
    return null
  }

  const comparisonCues = [
    'のそれぞれ',
    'の直近',
    'の最近',
    'の最新',
    'の打撃成績',
    'の投球成績',
    'の成績',
    'の打撃内容',
    'の投球内容',
    'を比較して',
    'を比較',
    '比較して',
    '比較',
  ]
  const cueIndex = comparisonCues
    .map((cue) => normalizedMessage.indexOf(cue))
    .filter((index) => index > 0)
    .sort((a, b) => a - b)[0]
  const prefix = cueIndex !== undefined
    ? normalizedMessage.slice(0, cueIndex).trim()
    : undefined
  if (!prefix) {
    return null
  }

  const names = prefix
    .split(/\s*(?:と|・|、|,|\/|＆|&)\s*/u)
    .map((name) => normalizeComparisonPlayerName(name))
    .filter((name): name is string => Boolean(name))
  const uniqueNames = [...new Set(names)]
  if (uniqueNames.length < 2) {
    return null
  }

  return {
    kind: inferComparisonKind(normalizedMessage),
    names: uniqueNames,
    limit: extractComparisonLimit(normalizedMessage) ?? 3,
  }
}

function inferComparisonKind(message: string): 'pitching' | 'batting' {
  const battingSignal = /打撃|打率|安打|本塁打|ホームラン|打点|盗塁|OPS|出塁率|長打率|打数|打席|打者/u.test(message)
  const pitchingSignal = /投手|投球|登板|防御率|奪三振|自責点|球数|先発|完封|WHIP|イニング|失点/u.test(message)
  if (battingSignal && !pitchingSignal) {
    return 'batting'
  }
  if (pitchingSignal && !battingSignal) {
    return 'pitching'
  }
  if (/成績|試合/u.test(message) && !battingSignal) {
    return 'pitching'
  }
  return 'pitching'
}

function extractComparisonLimit(message: string): number | undefined {
  const match =
    message.match(/直近\s*(\d+)\s*試合/u) ??
    message.match(/直近\s*(\d+)\s*登板/u) ??
    message.match(/(\d+)\s*試合/u) ??
    message.match(/(\d+)\s*登板/u)
  if (!match?.[1]) {
    return undefined
  }
  const parsed = Number.parseInt(match[1], 10)
  return Number.isNaN(parsed) ? undefined : parsed
}

function normalizeComparisonPlayerName(value: string): string | undefined {
  const normalized = value
    .normalize('NFKC')
    .replace(/^[*＊+＋\s\u3000]+/u, '')
    .replace(/^(?:それぞれ|各|各々|両者|両方|双方)/u, '')
    .replace(/^(?:今シーズン|今季|今年|今期)(?:\(\d{4}年\))?(?:の|で)?/u, '')
    .replace(/^\d{4}年(?:の|の今シーズン|の今季|の今年|の今期)?/u, '')
    .replace(/(?:選手|投手|打者)$/u, '')
    .trim()
  return normalized.length > 0 ? normalized : undefined
}
