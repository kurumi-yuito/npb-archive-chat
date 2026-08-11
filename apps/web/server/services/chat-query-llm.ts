import { chatStructuredQuerySchema, type AggregatePitchingFilters, type ChatStructuredQuery } from '@npb/schemas'
import { z } from 'zod'
import {
  type ChatQueryParserContext,
  buildChatQueryParserUserPrompt,
  chatQueryParserSystemPrompt,
} from './chat-query-parser-prompt'
import { inferRecentAppearanceLimit } from './chat-recent-scope'
import { messageMentionsTeam } from './chat-query-normalizer'

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

const plannerIntentValues = [
  'search_events',
  'search_games',
  'search_batting',
  'search_pitching',
  'search_roster',
  'player_affiliation',
  'game_detail',
  'aggregate_batting',
  'aggregate_pitching',
  'aggregate_events',
  'aggregate_games',
  'award_winners',
  'off_topic',
] as const

const plannerResponseFormat = {
  type: 'json_schema',
  json_schema: {
    name: 'npb_chat_structured_query',
    strict: false,
    schema: {
      type: 'object',
      properties: {
        intent: { type: 'string', enum: plannerIntentValues },
        filters: { type: 'object' },
      },
      required: ['intent', 'filters'],
      additionalProperties: false,
    },
  },
} as const

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
  logger?: Pick<Console, 'error'>
}

export class ChatQueryLlmContractError extends Error {
  constructor(
    message: string,
    public readonly plannerIntent: unknown,
    public readonly rawResponse: string,
    public readonly openAiRequestId: string | null,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'ChatQueryLlmContractError'
  }
}

export function hasChatQueryLlmConfig(config: Partial<ChatQueryLlmConfig>): config is ChatQueryLlmConfig {
  return Boolean(config.baseUrl && config.apiKey && config.model)
}

export function createChatQueryLlm(
  config: ChatQueryLlmConfig,
  dependencies: ChatQueryLlmDependencies = {},
) {
  const fetchFn = dependencies.fetch ?? globalThis.fetch
  const logger = dependencies.logger ?? console

  return {
    async generateStructuredQuery(
      message: string,
      context: ChatQueryParserContext = {},
    ): Promise<ChatStructuredQuery> {
      const body = JSON.stringify({
        model: config.model,
        temperature: 0,
        response_format: plannerResponseFormat,
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

      const openAiRequestId = response!.headers.get('x-request-id') ?? response!.headers.get('openai-request-id')
      const payload = openAiCompatibleChatCompletionSchema.parse(await response!.json())
      const rawContent = payload.choices[0]?.message.content
      const text = Array.isArray(rawContent)
        ? rawContent.map((part) => part.text ?? '').join('\n').trim()
        : rawContent.trim()

      const parsed = JSON.parse(extractJsonObject(text))
      const normalized = normalizeStructuredQueryFromLlmMessage(message, parsed)
      const validated = chatStructuredQuerySchema.safeParse(normalized)
      if (!validated.success) {
        const plannerIntent = parsed && typeof parsed === 'object'
          ? (parsed as { intent?: unknown }).intent
          : undefined
        const evidence = {
          plannerIntent,
          openAiRequestId,
          rawResponse: text,
          validation: validated.error.issues,
        }
        logger.error('[chat-query-llm] planner contract violation', evidence)
        throw new ChatQueryLlmContractError(
          `Planner contract violation: intent=${JSON.stringify(plannerIntent)}; openai_request_id=${openAiRequestId ?? 'unavailable'}; validation=${validated.error.message}`,
          plannerIntent,
          text,
          openAiRequestId,
          { cause: validated.error },
        )
      }
      return validated.data
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

  const contractNormalized = normalizeExplicitPlannerContract(message, query)
  if (contractNormalized !== value) {
    return normalizeStructuredQueryFromLlmMessage(message, contractNormalized)
  }

  const ellipticalRecentTarget = extractEllipticalRecentTarget(message)
  if (query.intent === 'off_topic' && ellipticalRecentTarget) {
    return {
      intent: 'search_pitching',
      filters: { pitcher_name: ellipticalRecentTarget, recent: true, limit: 5 },
    }
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
    const recentAppearanceLimit = inferRecentAppearanceLimit(message)
    if (recentAppearanceLimit !== undefined) {
      return {
        intent: 'search_pitching',
        filters: {
          ...filters,
          recent: true,
          limit: recentAppearanceLimit,
        },
      }
    }
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

function normalizeExplicitPlannerContract(
  message: string,
  query: { intent?: unknown; filters?: unknown },
): unknown {
  if (!query.filters || typeof query.filters !== 'object') {
    return query
  }

  const originalFilters = query.filters as Record<string, unknown>
  const filters: Record<string, unknown> = { ...originalFilters }
  let intent = query.intent
  let changed = false

  for (const field of ['player_name', 'pitcher_name', 'batter_name', 'runner_name'] as const) {
    const parsedName = filters[field]
    if (typeof parsedName !== 'string') continue
    const playerIdField = playerIdFieldForNameField(field)
    if (playerIdField in filters) {
      delete filters[playerIdField]
      changed = true
    }
    if (typeof filters.team === 'string' && !messageMentionsTeam(message, filters.team)) {
      delete filters.team
      changed = true
    }
    const restoredName = restoreExplicitPersonName(message, parsedName)
    if (restoredName && restoredName !== parsedName) {
      filters[field] = restoredName
      changed = true
    }
  }

  const yearRange = extractExplicitYearRange(message)
  if (yearRange) {
    if (filters.year_from !== yearRange.yearFrom || filters.year_to !== yearRange.yearTo || 'year' in filters) {
      delete filters.year
      filters.year_from = yearRange.yearFrom
      filters.year_to = yearRange.yearTo
      changed = true
    }
  }

  const isTeamPitchingStats =
    /投手成績/u.test(message) &&
    !/(?:と|・|、).*(?:比較|比べ)/u.test(message) &&
    !['player_name', 'pitcher_name', 'batter_name', 'runner_name'].some((field) => typeof filters[field] === 'string')
  if (isTeamPitchingStats && intent !== 'aggregate_pitching') {
    intent = 'aggregate_pitching'
    delete filters.player_name
    delete filters.player_id
    changed = true
  }

  const isSeasonPitchingAggregate =
    /(?:防御率|登板数|投球回|奪三振|勝敗).*(?:教えて|詳しく|成績)|(?:成績).*(?:防御率|登板数|投球回|奪三振|勝敗)/u.test(message) &&
    !/(?:最近|直近|最新|最後|どんな投球)/u.test(message)
  if (isSeasonPitchingAggregate && intent === 'search_pitching') {
    intent = 'aggregate_pitching'
    changed = true
  }

  const isSeasonBattingAggregate =
    (/(?:打率|本塁打|ホームラン|打点).*(?:教えて|どのくらい|何本|成績)|(?:成績).*(?:打率|本塁打|ホームラン|打点)/u.test(message) ||
      (/(?:19|20)\d{2}年|今シーズン|今季|今期|今年/u.test(message) && /成績/u.test(message))) &&
    !/(?:最近|直近|最新|最後|打席内容)/u.test(message)
  if (isSeasonBattingAggregate && intent === 'search_batting') {
    intent = 'aggregate_batting'
    changed = true
  }

  if (/年別/u.test(message) && /本塁打|ホームラン/u.test(message)) {
    if (intent !== 'aggregate_batting' || filters.group_by !== 'year' || typeof filters.limit !== 'number' || filters.limit < 100) {
      intent = 'aggregate_batting'
      filters.group_by = 'year'
      filters.limit = Math.max(typeof filters.limit === 'number' ? filters.limit : 0, 100)
      changed = true
    }
  }

  if (/IsoP|長打率マイナス打率/iu.test(message)) {
    if (intent !== 'aggregate_batting' || filters.sort_by !== 'isoP' || filters.limit !== 5) {
      intent = 'aggregate_batting'
      filters.sort_by = 'isoP'
      filters.limit = 5
      changed = true
    }
  }

  if (/四球率|BB%/iu.test(message)) {
    if (intent !== 'aggregate_batting' || filters.sort_by !== 'bbRate' || filters.limit !== 5) {
      intent = 'aggregate_batting'
      filters.sort_by = 'bbRate'
      filters.limit = 5
      changed = true
    }
  }

  if (/(?:捕手|キャッチャー)/u.test(message) && /最も多|最多/u.test(message)) {
    if (intent !== 'aggregate_batting' || filters.position !== '捕' || filters.sort_by !== 'games' || filters.limit !== 3) {
      intent = 'aggregate_batting'
      filters.position = '捕'
      filters.sort_by = 'games'
      filters.limit = 3
      changed = true
    }
  }

  if (/スタメン(?:を|は|一覧|教えて)/u.test(message)) {
    if (intent !== 'search_batting' || filters.limit !== 100) {
      intent = 'search_batting'
      delete filters.starter
      filters.limit = Math.max(typeof filters.limit === 'number' ? filters.limit : 0, 100)
      changed = true
    }
  }

  if (/(?:ショート|遊撃)/u.test(message) && /[1-9１-９]番/u.test(message)) {
    if (intent !== 'search_batting' || filters.position !== '遊') {
      intent = 'search_batting'
      filters.position = '遊'
      delete filters.starter
      filters.limit = Math.max(typeof filters.limit === 'number' ? filters.limit : 0, 100)
      changed = true
    }
    if (/最近|直近|最新/u.test(message)) {
      filters.year = currentJstYear()
      filters.recent = true
      filters.limit = 1
      changed = true
    }
  }

  return changed ? { intent, filters } : query
}

function currentJstYear(): number {
  const year = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
  }).formatToParts(new Date()).find((part) => part.type === 'year')?.value
  return Number(year)
}

function playerIdFieldForNameField(
  field: 'player_name' | 'pitcher_name' | 'batter_name' | 'runner_name',
): 'player_id' | 'pitcher_player_id' | 'batter_player_id' | 'runner_player_id' {
  if (field === 'pitcher_name') return 'pitcher_player_id'
  if (field === 'batter_name') return 'batter_player_id'
  if (field === 'runner_name') return 'runner_player_id'
  return 'player_id'
}

function restoreExplicitPersonName(message: string, parsedName: string): string | null {
  const normalizedMessage = message.normalize('NFKC')
  const compactParsedName = parsedName.normalize('NFKC').replace(/\s/gu, '')
  if (compactParsedName.length === 0) return null
  const compactMessage = normalizedMessage.replace(/\s/gu, '')
  const index = compactMessage.indexOf(compactParsedName)
  if (index < 0) return null
  const tail = compactMessage.slice(index)
  const candidate = tail.split(/(?:について|登板|出場|試合|って|から|まで|時代|選手|投手|打者|は|が|の|を|で|と|対|・|、|,|。|！|？|\?|\(|（)/u, 1)[0]
  if (!candidate || !candidate.startsWith(compactParsedName)) return null
  if (!/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u.test(candidate)) return null
  return candidate.length > compactParsedName.length ? candidate : null
}

function extractExplicitYearRange(message: string): { yearFrom: number; yearTo: number } | null {
  const match = message.normalize('NFKC').match(/((?:19|20)\d{2})年?(?:から|[-–—])((?:19|20)\d{2})年?(?:まで)?/u)
  if (!match?.[1] || !match[2]) return null
  return {
    yearFrom: Number.parseInt(match[1], 10),
    yearTo: Number.parseInt(match[2], 10),
  }
}

function extractEllipticalRecentTarget(message: string): string | null {
  const match = message.normalize('NFKC').trim().match(
    /^([^\s、。！？?]+?)(?:選手|投手)?の(?:直近|最新)の内容(?:は|を教えて(?:ください)?)?[？?。]?$/u,
  )
  const name = match?.[1]?.trim()
  return name && !/試合|チーム|球団|リーグ/u.test(name) ? name : null
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
