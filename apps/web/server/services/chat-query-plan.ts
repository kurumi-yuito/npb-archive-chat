import { z, type ChatRequest, type ChatStructuredQuery } from '@npb/schemas'
import type { IdentityResolutionMetadata, IdentityResolutionScope } from './player-identity'
import type { PlayerResolution } from './player-resolution'
import type { ChatCapabilityIntent, ChatCapabilityRoute } from './chat-capability'

export const chatDataRequirementSchema = z.enum([
  'events',
  'games',
  'batting_lines',
  'pitching_lines',
  'roster_entries',
  'player_affiliations',
  'game_details',
  'aggregate_batting',
  'aggregate_pitching',
  'aggregate_events',
  'aggregate_games',
  'source_snapshots',
  'award_winners',
])

export type ChatDataRequirement = z.infer<typeof chatDataRequirementSchema>

export const chatFollowUpTypeSchema = z.enum([
  'standalone',
  'detail_request',
  'reason_request',
  'summary_request',
  'correction_request',
  'doubt_request',
  'recheck_request',
  'comparison_request',
  'target_omission',
  'context_reference',
  'explanation_request',
  'scope_clarification',
  'team_context_correction',
  'timeframe_correction',
  'evaluation_request',
  'casual_followup',
])

export type ChatFollowUpType = z.infer<typeof chatFollowUpTypeSchema>

export const chatAnswerModeSchema = z.enum([
  'direct_answer',
  'detail_explanation',
  'reason_explanation',
  'summary_explanation',
  'comparison_explanation',
  'correction_explanation',
  'recheck_explanation',
  'contextual_answer',
  'clarification_request',
  'evaluation_explanation',
])

export type ChatAnswerMode = z.infer<typeof chatAnswerModeSchema>

export const chatReferencedContextSchema = z.object({
  source: z.enum([
    'none',
    'latest_assistant_entry',
    'latest_user_entry',
    'conversation_history',
    'explicit_phrase',
  ]),
  anchor: z.string().min(1).nullable(),
  ordinal: z.number().int().positive().nullable(),
  summary: z.string().min(1).nullable(),
}).nullable()

export type ChatReferencedContext = z.infer<typeof chatReferencedContextSchema>

export const chatTargetEntitySchema = z.object({
  kind: z.enum(['player', 'game', 'team', 'comparison', 'mixed', 'unknown']),
  label: z.string().min(1).nullable(),
  players: z.array(z.string().min(1)),
  teams: z.array(z.string().min(1)),
}).nullable()

export type ChatTargetEntity = z.infer<typeof chatTargetEntitySchema>

export const chatFollowUpContextMetadataSchema = z.object({
  contextKind: z.enum(['game', 'player_stats', 'team_stats', 'unknown']),
  inheritedPlayerId: z.string().min(1).nullable(),
  inheritedPlayerName: z.string().min(1).nullable(),
  inheritedTeam: z.string().min(1).nullable(),
  inheritedSeason: z.number().int().nullable(),
  inheritedScope: z.enum(['unspecified', 'current', 'historical']),
  inheritanceSource: z.enum([
    'none',
    'structured_query',
    'latest_assistant_entry',
    'conversation_history',
  ]),
  inheritanceConfidence: z.number().min(0).max(1),
  shouldApplyInheritance: z.literal(false),
})

export type ChatFollowUpContextMetadata = z.infer<typeof chatFollowUpContextMetadataSchema>

export const chatAppliedFollowUpContextSchema = z.object({
  applied: z.boolean(),
  fields: z.array(z.enum(['player', 'team', 'season', 'scope'])),
  reason: z.string().min(1).nullable(),
})

export type ChatAppliedFollowUpContext = z.infer<typeof chatAppliedFollowUpContextSchema>

export const chatCorrectionGuardReasonSchema = z.enum([
  'none',
  'ambiguous_correction',
  'player_replacement',
  'explicit_season_override',
  'explicit_scope_override',
  'game_context',
  'follow_up_type_excluded',
])

export type ChatCorrectionGuardReason = z.infer<typeof chatCorrectionGuardReasonSchema>

export const chatCorrectionGuardMetadataSchema = z.object({
  inheritanceBlockedReason: chatCorrectionGuardReasonSchema,
  hasAmbiguousCorrection: z.boolean(),
  hasPlayerReplacement: z.boolean(),
  hasExplicitSeasonOverride: z.boolean(),
  hasExplicitScopeOverride: z.boolean(),
  shouldBlockInheritance: z.boolean(),
})

export type ChatCorrectionGuardMetadata = z.infer<typeof chatCorrectionGuardMetadataSchema>

export const chatCorrectionValueSchema = z.object({
  kind: z.enum(['year', 'career', 'current', 'historical', 'farm', 'first_team', 'unknown']),
  year: z.number().int().optional(),
})

export type ChatCorrectionValue = z.infer<typeof chatCorrectionValueSchema>

export const chatCorrectionMetadataSchema = z.object({
  isCorrection: z.boolean(),
  target: z.enum(['season', 'scope', 'player', 'team', 'unknown']),
  value: chatCorrectionValueSchema,
  confidence: z.number().min(0).max(1),
})

export type ChatCorrectionMetadata = z.infer<typeof chatCorrectionMetadataSchema>

export const chatIdentityIntentMetadataSchema = z.object({
  scope: z.enum(['unspecified', 'current', 'historical']),
  explicitSeasonOverride: z.boolean(),
  explicitScopeOverride: z.boolean(),
})

export type ChatIdentityIntentMetadata = z.infer<typeof chatIdentityIntentMetadataSchema>

export const chatExecutionRepositorySchema = z.enum([
  'searchEvents',
  'searchGames',
  'searchBattingLines',
  'searchPitchingLines',
  'searchRosterEntries',
  'searchPlayerAffiliations',
  'searchGameDetails',
  'aggregateBattingLines',
  'aggregatePitchingLines',
  'aggregateEvents',
  'aggregateGameResults',
  'listSourceSnapshotsByGameIds',
  'searchAwardWinners',
])

export type ChatExecutionRepository = z.infer<typeof chatExecutionRepositorySchema>

export const chatPlannerOutputSchema = z.object({
  intent: z.string().min(1),
  structuredQuery: z.custom<ChatStructuredQuery>(),
  entities: z.record(z.unknown()),
  followUpType: chatFollowUpTypeSchema,
  referencedContext: chatReferencedContextSchema,
  targetEntity: chatTargetEntitySchema,
  followUpContext: chatFollowUpContextMetadataSchema,
  appliedFollowUpContext: chatAppliedFollowUpContextSchema.optional(),
  correctionGuard: chatCorrectionGuardMetadataSchema,
  correction: chatCorrectionMetadataSchema,
  identityIntent: chatIdentityIntentMetadataSchema,
  targetGameId: z.string().min(1).nullable(),
  targetPlayerId: z.string().min(1).nullable(),
  timeRange: z.record(z.unknown()).nullable(),
  dataRequirements: z.array(chatDataRequirementSchema),
  answerMode: chatAnswerModeSchema,
  identityResolutionScope: z.enum(['unspecified', 'current', 'historical']),
  confidence: z.number().min(0).max(1),
  clarificationRequired: z.boolean(),
  legacyStabilizationApplied: z.boolean(),
  questionIntent: z.enum([
    'historical_record',
    'analytical',
    'opinion',
    'news',
    'realtime',
  ]).optional(),
  capabilityRoute: z.enum([
    'repository_history',
    'repository_analysis',
    'analysis_then_opinion',
    'external_source_guidance',
  ]).optional(),
  capabilityRequiresAnalysis: z.boolean().optional(),
  capabilityUsesRepository: z.boolean().optional(),
  capabilityExternalSourceUrl: z.string().url().nullable().optional(),
})

export type ChatPlannerOutput = z.infer<typeof chatPlannerOutputSchema>

export type ChatExecutionMetadata = {
  dataRequirements: ChatDataRequirement[]
  repositories: ChatExecutionRepository[]
  playerResolution: PlayerResolution | null
  playerResolutions?: PlayerResolution[]
  identityResolution?: IdentityResolutionMetadata | null
  playerIdRequired: boolean
  playerIdSatisfied: boolean
  followUpType: ChatFollowUpType
  referencedContext: ChatReferencedContext
  targetEntity: ChatTargetEntity
  followUpContext: ChatFollowUpContextMetadata
  appliedFollowUpContext?: ChatAppliedFollowUpContext
  correctionGuard: ChatCorrectionGuardMetadata
  correction: ChatCorrectionMetadata
  identityIntent: ChatIdentityIntentMetadata
  targetGameId: string | null
  targetPlayerId: string | null
  answerMode: ChatAnswerMode
  identityResolutionScope: IdentityResolutionScope
  questionIntent?: ChatCapabilityIntent
  capabilityRoute?: ChatCapabilityRoute
  capabilityRequiresAnalysis?: boolean
  capabilityUsesRepository?: boolean
  capabilityExternalSourceUrl?: string | null
}

export function inferDataRequirements(query: ChatStructuredQuery): ChatDataRequirement[] {
  const base: ChatDataRequirement[] = (() => {
    switch (query.intent) {
      case 'search_events':
        return ['events'] as ChatDataRequirement[]
      case 'search_games':
        return ['games'] as ChatDataRequirement[]
      case 'search_batting':
        return ['batting_lines'] as ChatDataRequirement[]
      case 'search_pitching':
        return ['pitching_lines'] as ChatDataRequirement[]
      case 'search_roster':
        return ['roster_entries'] as ChatDataRequirement[]
      case 'player_affiliation':
        return ['player_affiliations'] as ChatDataRequirement[]
      case 'game_detail':
        return ['game_details', 'events', 'batting_lines', 'pitching_lines'] as ChatDataRequirement[]
      case 'aggregate_batting':
        return ['aggregate_batting'] as ChatDataRequirement[]
      case 'aggregate_pitching':
        return ['aggregate_pitching'] as ChatDataRequirement[]
      case 'aggregate_events':
        return ['aggregate_events'] as ChatDataRequirement[]
      case 'aggregate_games':
        return ['aggregate_games'] as ChatDataRequirement[]
      case 'award_winners':
        return ['award_winners'] as ChatDataRequirement[]
      case 'off_topic':
        return [] as ChatDataRequirement[]
    }
  })()
  return base.length > 0 ? [...base, 'source_snapshots'] : base
}

export function repositoriesForQuery(query: ChatStructuredQuery): ChatExecutionRepository[] {
  const repos: ChatExecutionRepository[] = (() => {
    switch (query.intent) {
      case 'search_events':
        return ['searchEvents'] as ChatExecutionRepository[]
      case 'search_games':
        return ['searchGames'] as ChatExecutionRepository[]
      case 'search_batting':
        return ['searchBattingLines'] as ChatExecutionRepository[]
      case 'search_pitching':
        return ['searchPitchingLines'] as ChatExecutionRepository[]
      case 'search_roster':
        return ['searchRosterEntries'] as ChatExecutionRepository[]
      case 'player_affiliation':
        return ['searchPlayerAffiliations'] as ChatExecutionRepository[]
      case 'game_detail':
        return ['searchGameDetails', 'searchEvents', 'searchBattingLines', 'searchPitchingLines'] as ChatExecutionRepository[]
      case 'aggregate_batting':
        return ['aggregateBattingLines'] as ChatExecutionRepository[]
      case 'aggregate_pitching':
        return ['aggregatePitchingLines'] as ChatExecutionRepository[]
      case 'aggregate_events':
        return ['aggregateEvents'] as ChatExecutionRepository[]
      case 'aggregate_games':
        return ['aggregateGameResults'] as ChatExecutionRepository[]
      case 'award_winners':
        return ['searchAwardWinners'] as ChatExecutionRepository[]
      case 'off_topic':
        return [] as ChatExecutionRepository[]
    }
  })()
  return repos.length > 0 ? [...repos, 'listSourceSnapshotsByGameIds'] : repos
}

export function extractPlannerEntities(query: ChatStructuredQuery): Record<string, unknown> {
  const filters = query.filters as Record<string, unknown>
  return {
    ...(filters.player_name ? { player: filters.player_name } : {}),
    ...(filters.pitcher_name ? { pitcher: filters.pitcher_name } : {}),
    ...(filters.batter_name ? { batter: filters.batter_name } : {}),
    ...(filters.runner_name ? { runner: filters.runner_name } : {}),
    ...(filters.team ? { team: filters.team } : {}),
    ...(filters.opponent ? { opponent: filters.opponent } : {}),
    ...(filters.game_id ? { game_id: filters.game_id } : {}),
    ...(filters.award_type ? { award_type: filters.award_type } : {}),
  }
}

export function extractPlannerTimeRange(query: ChatStructuredQuery): Record<string, unknown> | null {
  const filters = query.filters as Record<string, unknown>
  const value = {
    ...(filters.game_date ? { game_date: filters.game_date } : {}),
    ...(filters.year ? { year: filters.year } : {}),
    ...(filters.year_from ? { year_from: filters.year_from } : {}),
    ...(filters.year_to ? { year_to: filters.year_to } : {}),
    ...(filters.recent ? { type: 'recent', games: filters.limit ?? 5 } : {}),
  }
  return Object.keys(value).length > 0 ? value : null
}

export function queryHasPlayerName(query: ChatStructuredQuery): boolean {
  const filters = query.filters as Record<string, unknown>
  return typeof filters.player_name === 'string' ||
    (Array.isArray(filters.player_names) && filters.player_names.length > 0) ||
    typeof filters.pitcher_name === 'string' ||
    (Array.isArray(filters.pitcher_names) && filters.pitcher_names.length > 0) ||
    typeof filters.batter_name === 'string' ||
    typeof filters.runner_name === 'string'
}

export function queryHasPlayerId(query: ChatStructuredQuery): boolean {
  const filters = query.filters as Record<string, unknown>
  return typeof filters.player_id === 'string' ||
    (Array.isArray(filters.player_ids) && filters.player_ids.length > 0) ||
    typeof filters.pitcher_player_id === 'string' ||
    (Array.isArray(filters.pitcher_player_ids) && filters.pitcher_player_ids.length > 0) ||
    typeof filters.batter_player_id === 'string' ||
    typeof filters.runner_player_id === 'string'
}

export function classifyFollowUpContext(
  message: string,
  history: ChatRequest['history'] | undefined,
  query: ChatStructuredQuery,
): Pick<ChatPlannerOutput,
  'followUpType' |
  'referencedContext' |
  'targetEntity' |
  'targetGameId' |
  'targetPlayerId' |
  'answerMode'
> {
  const normalizedMessage = normalizeMessageForClassification(message)
  const hasHistory = Boolean(history?.length)
  const followUpType = classifyFollowUpType(normalizedMessage, hasHistory)
  const assistantEntry = extractReferencedAssistantEntry(normalizedMessage, history, followUpType)
  const filters = query.filters as Record<string, unknown>
  const targetGameId = typeof filters.game_id === 'string'
    ? filters.game_id
    : assistantEntry?.gameId ?? null
  const targetPlayerId = typeof filters.player_id === 'string'
    ? filters.player_id
    : typeof filters.pitcher_player_id === 'string'
      ? filters.pitcher_player_id
      : typeof filters.batter_player_id === 'string'
        ? filters.batter_player_id
        : typeof filters.runner_player_id === 'string'
          ? filters.runner_player_id
          : null
  const targetEntity = buildTargetEntity(query, assistantEntry, followUpType)
  const referencedContext = assistantEntry
    ? {
        source: assistantEntry.source,
        anchor: assistantEntry.anchor,
        ordinal: assistantEntry.ordinal,
        summary: assistantEntry.summary,
      }
    : normalizedMessage.length > 0 && followUpType !== 'standalone'
      ? {
          source: 'explicit_phrase' as const,
          anchor: normalizedMessage,
          ordinal: null,
          summary: null,
        }
      : {
          source: 'none' as const,
          anchor: null,
          ordinal: null,
          summary: null,
        }
  const answerMode = classifyAnswerMode(followUpType, query, normalizedMessage)
  return {
    followUpType,
    referencedContext,
    targetEntity,
    targetGameId,
    targetPlayerId,
    answerMode,
  }
}

export function extractFollowUpContextMetadata({
  query,
  identityResolutionScope,
  followUpType,
  referencedContext,
  targetEntity,
  targetGameId,
  history,
}: {
  query: ChatStructuredQuery
  identityResolutionScope: IdentityResolutionScope
  followUpType: ChatFollowUpType
  referencedContext: ChatReferencedContext
  targetEntity: ChatTargetEntity
  targetGameId: string | null
  history?: ChatRequest['history']
}): ChatFollowUpContextMetadata {
  const filters = query.filters as Record<string, unknown>
  const inheritedPlayerId = extractPlannerPlayerId(filters)
  const historyCandidate = followUpType !== 'standalone' && !targetGameId
    ? extractPlayerStatsContextFromHistory(history)
    : null
  const inheritedPlayerName = extractPlannerPlayerName(filters) ?? historyCandidate?.playerName ?? null
  const inheritedTeam = typeof filters.team === 'string'
    ? filters.team
    : targetEntity?.teams[0] ?? historyCandidate?.team ?? null
  const querySeason = extractPlannerSeason(filters)
  const shouldPreferHistoryStatsContext =
    followUpType === 'evaluation_request' &&
    historyCandidate !== null
  const inheritedSeason = shouldPreferHistoryStatsContext
    ? historyCandidate.season ?? querySeason ?? null
    : querySeason ?? historyCandidate?.season ?? null
  const contextKind = inferFollowUpContextKind(query, {
    targetGameId,
    inheritedPlayerId,
    inheritedPlayerName,
    inheritedTeam,
  })
  const inheritanceSource = inferInheritanceSource({
    followUpType,
    referencedContext,
    hasStructuredContext: Boolean(
      inheritedPlayerId ||
      inheritedPlayerName ||
      inheritedTeam ||
      inheritedSeason !== null ||
      query.intent !== 'off_topic',
    ),
  })
  return {
    contextKind,
    inheritedPlayerId,
    inheritedPlayerName,
    inheritedTeam,
    inheritedSeason,
    inheritedScope: shouldPreferHistoryStatsContext && historyCandidate.scope !== 'unspecified'
      ? historyCandidate.scope
      : identityResolutionScope === 'unspecified'
        ? historyCandidate?.scope ?? identityResolutionScope
        : identityResolutionScope,
    inheritanceSource,
    inheritanceConfidence: inferInheritanceConfidence(inheritanceSource, contextKind),
    shouldApplyInheritance: false,
  }
}

const PLAYER_STATS_FOLLOW_UP_INHERITANCE_TYPES = new Set<ChatFollowUpType>([
  'target_omission',
  'timeframe_correction',
  'scope_clarification',
  'evaluation_request',
])

const EXCLUDED_FOLLOW_UP_INHERITANCE_TYPES = new Set<ChatFollowUpType>([
  'detail_request',
  'reason_request',
  'summary_request',
  'context_reference',
  'recheck_request',
  'casual_followup',
])

export function inferCorrectionGuardMetadata({
  message,
  query,
  followUpType,
  followUpContext,
  targetGameId,
  correction,
  identityIntent,
}: {
  message: string
  query: ChatStructuredQuery
  followUpType: ChatFollowUpType
  followUpContext: ChatFollowUpContextMetadata
  targetGameId: string | null
  correction?: ChatCorrectionMetadata | null
  identityIntent?: ChatIdentityIntentMetadata | null
}): ChatCorrectionGuardMetadata {
  const normalizedMessage = normalizeMessageForClassification(message)
  const fallbackHasPlayerReplacement = isPlayerReplacementFollowUp(normalizedMessage, query)
  const fallbackHasExplicitSeasonOverride = hasExplicitSeasonOverrideInMessage(normalizedMessage)
  const fallbackHasExplicitScopeOverride = hasExplicitScopeOverrideInMessage(normalizedMessage)
  const hasPlayerReplacement = correction?.target === 'player' || fallbackHasPlayerReplacement
  const hasExplicitSeasonOverride =
    correction?.target === 'season' ||
    identityIntent?.explicitSeasonOverride === true ||
    fallbackHasExplicitSeasonOverride
  const hasExplicitScopeOverride =
    correction?.target === 'scope' ||
    identityIntent?.explicitScopeOverride === true ||
    fallbackHasExplicitScopeOverride
  const hasAmbiguousCorrection =
    (followUpType === 'correction_request' || /いや|違う|ちがう|そうじゃなくて|そうではなく|訂正|修正/u.test(normalizedMessage)) &&
    /いや|違う|ちがう|そうじゃなくて|そうではなく|訂正|修正/u.test(normalizedMessage) &&
    !hasPlayerReplacement &&
    !hasExplicitSeasonOverride &&
    !hasExplicitScopeOverride
  const hasGameContext =
    query.intent === 'game_detail' ||
    followUpContext.contextKind === 'game' ||
    Boolean(targetGameId)
  const hasExcludedFollowUpType =
    followUpContext.contextKind === 'player_stats' &&
    followUpType !== 'standalone' &&
    !PLAYER_STATS_FOLLOW_UP_INHERITANCE_TYPES.has(followUpType) &&
    EXCLUDED_FOLLOW_UP_INHERITANCE_TYPES.has(followUpType)
  const inheritanceBlockedReason = firstCorrectionGuardReason([
    hasPlayerReplacement ? 'player_replacement' : null,
    hasAmbiguousCorrection ? 'ambiguous_correction' : null,
    hasExplicitSeasonOverride ? 'explicit_season_override' : null,
    hasExplicitScopeOverride ? 'explicit_scope_override' : null,
    hasGameContext ? 'game_context' : null,
    hasExcludedFollowUpType ? 'follow_up_type_excluded' : null,
  ])
  return {
    inheritanceBlockedReason,
    hasAmbiguousCorrection,
    hasPlayerReplacement,
    hasExplicitSeasonOverride,
    hasExplicitScopeOverride,
    shouldBlockInheritance: inheritanceBlockedReason !== 'none',
  }
}

export function inferCorrectionMetadata({
  query,
  followUpType,
  correctionGuard,
  identityResolutionScope,
}: {
  query: ChatStructuredQuery
  followUpType: ChatFollowUpType
  correctionGuard: ChatCorrectionGuardMetadata
  identityResolutionScope: IdentityResolutionScope
}): ChatCorrectionMetadata {
  const target = inferCorrectionTarget(correctionGuard)
  const isCorrection =
    target !== 'unknown' ||
    followUpType === 'correction_request' ||
    followUpType === 'timeframe_correction' ||
    followUpType === 'scope_clarification' ||
    followUpType === 'team_context_correction'
  return {
    isCorrection,
    target,
    value: inferCorrectionValue(query, target, identityResolutionScope),
    confidence: isCorrection ? 0.72 : 0,
  }
}

export function inferIdentityIntentMetadata({
  identityResolutionScope,
  correctionGuard,
}: {
  identityResolutionScope: IdentityResolutionScope
  correctionGuard: ChatCorrectionGuardMetadata
}): ChatIdentityIntentMetadata {
  return {
    scope: identityResolutionScope,
    explicitSeasonOverride: correctionGuard.hasExplicitSeasonOverride,
    explicitScopeOverride: correctionGuard.hasExplicitScopeOverride,
  }
}

function inferCorrectionTarget(correctionGuard: ChatCorrectionGuardMetadata): ChatCorrectionMetadata['target'] {
  if (correctionGuard.hasPlayerReplacement) {
    return 'player'
  }
  if (correctionGuard.hasExplicitSeasonOverride) {
    return 'season'
  }
  if (correctionGuard.hasExplicitScopeOverride) {
    return 'scope'
  }
  return 'unknown'
}

function inferCorrectionValue(
  query: ChatStructuredQuery,
  target: ChatCorrectionMetadata['target'],
  identityResolutionScope: IdentityResolutionScope,
): ChatCorrectionValue {
  const filters = query.filters as Record<string, unknown>
  if (target === 'season' && typeof filters.year === 'number') {
    return { kind: 'year', year: filters.year }
  }
  if (target === 'scope' && identityResolutionScope !== 'unspecified') {
    return { kind: identityResolutionScope }
  }
  return { kind: 'unknown' }
}

function firstCorrectionGuardReason(
  reasons: Array<ChatCorrectionGuardReason | null>,
): ChatCorrectionGuardReason {
  return reasons.find((reason): reason is ChatCorrectionGuardReason => Boolean(reason)) ?? 'none'
}

function isPlayerReplacementFollowUp(message: string, query: ChatStructuredQuery): boolean {
  return hasPlayerReplacementSurface(message) &&
    (queryHasPlayerName(query) || queryHasPlayerId(query))
}

function hasPlayerReplacementSurface(message: string): boolean {
  if (/別の選手/u.test(message)) {
    return true
  }
  const match = message.match(/(.{1,24})(?:じゃなくて|ではなく)(.{1,24})/u)
  if (!match) {
    return /違って/u.test(message)
  }
  const left = match[1]?.replace(/[、。！？!?]/gu, '').trim() ?? ''
  const right = match[2]?.replace(/[、。！？!?]/gu, '').trim() ?? ''
  if (/(今年|去年|昨年|今シーズン|昨シーズン|今季|通算|直近|最近|一軍|二軍|ファーム|そう|話)/u.test(`${left}${right}`)) {
    return false
  }
  return /[一-龯々ァ-ヶーA-Za-z]{2,}/u.test(left) && /[一-龯々ァ-ヶーA-Za-z]{2,}/u.test(right)
}

function hasExplicitSeasonOverrideInMessage(message: string): boolean {
  return /20\d{2}年|今年|今シーズン|今季|去年|昨年|昨シーズン|前シーズン|通算/u.test(message)
}

function hasExplicitScopeOverrideInMessage(message: string): boolean {
  return /現在|今の|現所属|今年|今シーズン|今季|去年|昨年|昨シーズン|時代|在籍時|移籍前|移籍後|一軍|二軍|ファーム|所属で見て|当時の所属/u.test(message)
}

type PlayerStatsContextCandidate = {
  playerName: string | null
  team: string | null
  season: number | null
  scope: IdentityResolutionScope
}

const TEAM_NAME_PATTERN =
  '横浜DeNAベイスターズ|横浜DeNA|DeNA|東京ヤクルトスワローズ|ヤクルト|阪神タイガース|阪神|読売ジャイアンツ|巨人|広島東洋カープ|広島|中日ドラゴンズ|中日|福岡ソフトバンクホークス|ソフトバンク|北海道日本ハムファイターズ|日本ハム|千葉ロッテマリーンズ|ロッテ|東北楽天ゴールデンイーグルス|楽天|オリックス・バファローズ|オリックス|埼玉西武ライオンズ|西武'

function extractPlayerStatsContextFromHistory(
  history: ChatRequest['history'] | undefined,
): PlayerStatsContextCandidate | null {
  const latestAssistant = [...(history ?? [])].reverse().find((item) => item.role === 'assistant')?.content
  if (!latestAssistant) {
    return null
  }
  const season = extractSeasonFromText(latestAssistant)
  const team = latestAssistant.match(new RegExp(TEAM_NAME_PATTERN, 'u'))?.[0] ?? null
  const playerName = extractPlayerNameFromAssistantSummary(latestAssistant, team)
  if (!playerName && !team && season === null) {
    return null
  }
  return {
    playerName,
    team,
    season,
    scope: season === null
      ? 'unspecified'
      : season >= currentJstYear()
        ? 'current'
        : 'historical',
  }
}

function extractPlayerNameFromAssistantSummary(text: string, team: string | null): string | null {
  const compactText = text.replace(/\r?\n/gu, ' ')
  const teamPrefix = team ? `${escapeRegExp(team)}\\s*` : `(?:${TEAM_NAME_PATTERN})?\\s*`
  const match = compactText.match(new RegExp(`${teamPrefix}([一-龯々ぁ-んァ-ヶーA-Za-z・･.\\s]{2,24}?)(?:の|は)`, 'u'))
  return match?.[1]?.replace(/\s+/gu, ' ').trim() ?? null
}

function extractSeasonFromText(text: string): number | null {
  const match = text.match(/(20\d{2})年/u)
  return match ? Number(match[1]) : null
}

function currentJstYear(): number {
  const year = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
  }).formatToParts(new Date()).find((part) => part.type === 'year')?.value
  return Number(year)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

function extractPlannerPlayerId(filters: Record<string, unknown>): string | null {
  return typeof filters.player_id === 'string'
    ? filters.player_id
    : typeof filters.pitcher_player_id === 'string'
      ? filters.pitcher_player_id
      : typeof filters.batter_player_id === 'string'
        ? filters.batter_player_id
        : typeof filters.runner_player_id === 'string'
          ? filters.runner_player_id
          : null
}

function extractPlannerPlayerName(filters: Record<string, unknown>): string | null {
  return typeof filters.player_name === 'string'
    ? filters.player_name
    : typeof filters.pitcher_name === 'string'
      ? filters.pitcher_name
      : typeof filters.batter_name === 'string'
        ? filters.batter_name
        : typeof filters.runner_name === 'string'
          ? filters.runner_name
          : null
}

function extractPlannerSeason(filters: Record<string, unknown>): number | null {
  if (typeof filters.year === 'number') {
    return filters.year
  }
  return typeof filters.year_from === 'number' &&
    typeof filters.year_to === 'number' &&
    filters.year_from === filters.year_to
    ? filters.year_from
    : null
}

function inferFollowUpContextKind(
  query: ChatStructuredQuery,
  context: {
    targetGameId: string | null
    inheritedPlayerId: string | null
    inheritedPlayerName: string | null
    inheritedTeam: string | null
  },
): ChatFollowUpContextMetadata['contextKind'] {
  if (query.intent === 'game_detail' || context.targetGameId) {
    return 'game'
  }
  if (
    (query.intent === 'search_batting' ||
      query.intent === 'search_pitching' ||
      query.intent === 'aggregate_batting' ||
      query.intent === 'aggregate_pitching') &&
    (context.inheritedPlayerId || context.inheritedPlayerName)
  ) {
    return 'player_stats'
  }
  if (
    (query.intent === 'search_games' ||
      query.intent === 'aggregate_games' ||
      query.intent === 'aggregate_batting' ||
      query.intent === 'aggregate_pitching') &&
    context.inheritedTeam
  ) {
    return 'team_stats'
  }
  return 'unknown'
}

function inferInheritanceSource({
  followUpType,
  referencedContext,
  hasStructuredContext,
}: {
  followUpType: ChatFollowUpType
  referencedContext: ChatReferencedContext
  hasStructuredContext: boolean
}): ChatFollowUpContextMetadata['inheritanceSource'] {
  if (referencedContext?.source === 'latest_assistant_entry') {
    return 'latest_assistant_entry'
  }
  if (followUpType !== 'standalone' && referencedContext?.source === 'explicit_phrase') {
    return 'conversation_history'
  }
  if (hasStructuredContext) {
    return 'structured_query'
  }
  return 'none'
}

function inferInheritanceConfidence(
  source: ChatFollowUpContextMetadata['inheritanceSource'],
  contextKind: ChatFollowUpContextMetadata['contextKind'],
): number {
  if (source === 'latest_assistant_entry' && contextKind === 'game') {
    return 0.9
  }
  if (source === 'latest_assistant_entry') {
    return 0.78
  }
  if (source === 'conversation_history') {
    return 0.62
  }
  if (source === 'structured_query') {
    return 0.55
  }
  return 0
}

type ReferencedAssistantEntry = {
  source: 'latest_assistant_entry'
  anchor: string
  ordinal: number | null
  summary: string | null
  gameId: string | null
  gameDate: string | null
  team: string | null
}

function classifyFollowUpType(message: string, hasAssistantHistory: boolean): ChatFollowUpType {
  if (message.length === 0 || !hasAssistantHistory) {
    return 'standalone'
  }
  if (/なんで|なぜ|どうして|理由|負けた|勝てた/u.test(message)) {
    return 'reason_request'
  }
  if (/つまり|結局|要するに|で結局|結論/u.test(message)) {
    return 'summary_request'
  }
  if (/比較|比べ|どっち|変化|移籍後|時代/u.test(message)) {
    return 'comparison_request'
  }
  if (/いや.+じゃなくて|藤浪じゃなくて|村上じゃなくて|選手じゃなくて/u.test(message)) {
    return 'team_context_correction'
  }
  if (/今年じゃなくて|去年じゃなくて|通算じゃなくて|直近じゃなくて|最近って何試合|何試合/u.test(message)) {
    return 'timeframe_correction'
  }
  if (/その前のやつ|その前|ひとつ前|一つ前|1つ前|前のやつ|前の試合/u.test(message)) {
    return 'context_reference'
  }
  if (/(?:\d+|[一二三四五六七八九十]+|[１２３４５６７８９]+)(?:つ目|番目|件目|本目)/u.test(message)) {
    return 'context_reference'
  }
  if (/違う|通算じゃなくて|今年の話|最近の話|訂正|修正|答えになってない|回答になってない/u.test(message)) {
    return 'correction_request'
  }
  if (/調べなおして|調べ直して|もう一回|再確認|見直して/u.test(message)) {
    return 'recheck_request'
  }
  if (/ちがうはず|おかしくない|本当|ほんとに|怪しくない|変じゃない/u.test(message)) {
    return 'doubt_request'
  }
  if (/一軍の話|二軍も含む|今の所属|当時の所属|所属で見て/u.test(message)) {
    return 'scope_clarification'
  }
  if (/それってどういう意味|ようわからん|もうちょい噛み砕いて|その数字どう見ればいい|で、結論は|他と比べてどう/u.test(message)) {
    return 'explanation_request'
  }
  if (/これ強い|やばい|微妙|良いの悪いの|どこがよかった|どこが悪かった|どっちがよかった/u.test(message)) {
    return 'evaluation_request'
  }
  if (/詳しく|もっと|その試合|試合教えて|教えて|ハイライト/u.test(message)) {
    return 'detail_request'
  }
  if (/やばくない|きつい|怖い|しんどい|微妙/u.test(message)) {
    return 'casual_followup'
  }
  if (/それ|これ|その|あの|さっき|前の|二つ目|2つ目|二番目|2番目|二件目|2件目|二本目|2本目/u.test(message)) {
    return 'context_reference'
  }
  if (/どう|どうですか|どうなん|今年|今シーズン|今季|通算|最近|調子/u.test(message)) {
    return 'target_omission'
  }
  return 'standalone'
}

function classifyAnswerMode(
  followUpType: ChatFollowUpType,
  query: ChatStructuredQuery,
  message: string,
): ChatAnswerMode {
  if (followUpType === 'comparison_request') {
    return 'comparison_explanation'
  }
  if (followUpType === 'reason_request') {
    return 'reason_explanation'
  }
  if (followUpType === 'summary_request') {
    return 'summary_explanation'
  }
  if (followUpType === 'detail_request' || followUpType === 'context_reference' || followUpType === 'explanation_request') {
    return query.intent === 'game_detail' ? 'detail_explanation' : 'contextual_answer'
  }
  if (followUpType === 'correction_request') {
    return 'correction_explanation'
  }
  if (followUpType === 'team_context_correction' || followUpType === 'timeframe_correction') {
    return 'correction_explanation'
  }
  if (followUpType === 'recheck_request') {
    return 'recheck_explanation'
  }
  if (followUpType === 'scope_clarification') {
    return 'clarification_request'
  }
  if (followUpType === 'evaluation_request' || followUpType === 'doubt_request' || followUpType === 'casual_followup') {
    return 'evaluation_explanation'
  }
  if (followUpType === 'target_omission') {
    return /対決|対戦|対した|当たった|比較/u.test(message) ? 'comparison_explanation' : 'contextual_answer'
  }
  return 'direct_answer'
}

function buildTargetEntity(
  query: ChatStructuredQuery,
  assistantEntry: ReferencedAssistantEntry | null,
  followUpType: ChatFollowUpType,
): ChatTargetEntity {
  const filters = query.filters as Record<string, unknown>
  const players = [
    typeof filters.player_name === 'string' ? filters.player_name : null,
    ...(Array.isArray(filters.player_names) ? filters.player_names : []),
    typeof filters.pitcher_name === 'string' ? filters.pitcher_name : null,
    ...(Array.isArray(filters.pitcher_names) ? filters.pitcher_names : []),
    typeof filters.batter_name === 'string' ? filters.batter_name : null,
    typeof filters.runner_name === 'string' ? filters.runner_name : null,
  ].filter((value): value is string => Boolean(value))
  const teams = [
    typeof filters.team === 'string' ? filters.team : null,
    assistantEntry?.team ?? null,
  ].filter((value): value is string => Boolean(value))

  if (players.length >= 2 || followUpType === 'comparison_request') {
    return {
      kind: players.length >= 2 ? 'comparison' : 'mixed',
      label: players.join(' と ') || (assistantEntry?.summary ?? null),
      players,
      teams,
    }
  }
  if (players.length === 1) {
    return {
      kind: 'player',
      label: players[0] ?? assistantEntry?.summary ?? null,
      players,
      teams,
    }
  }
  if (
    query.intent === 'game_detail' ||
    (assistantEntry?.gameId && (
      followUpType === 'detail_request' ||
      followUpType === 'reason_request' ||
      followUpType === 'summary_request' ||
      followUpType === 'recheck_request' ||
      followUpType === 'context_reference' ||
      followUpType === 'explanation_request' ||
      followUpType === 'scope_clarification' ||
      followUpType === 'team_context_correction' ||
      followUpType === 'timeframe_correction' ||
      followUpType === 'evaluation_request' ||
      followUpType === 'doubt_request' ||
      followUpType === 'casual_followup'
    ))
  ) {
    return {
      kind: 'game',
      label: assistantEntry?.summary ?? assistantEntry?.anchor ?? null,
      players,
      teams,
    }
  }
  if (teams.length > 0) {
    return {
      kind: 'team',
      label: teams.join(' / '),
      players,
      teams,
    }
  }
  if (assistantEntry) {
    return {
      kind: assistantEntry.gameId ? 'game' : 'unknown',
      label: assistantEntry.summary ?? assistantEntry.anchor,
      players,
      teams,
    }
  }
  return {
    kind: 'unknown',
    label: null,
    players,
    teams,
  }
}

function normalizeMessageForClassification(message: string): string {
  return message.replace(/\s+/gu, '').trim()
}

function extractReferencedAssistantEntry(
  message: string,
  history: ChatRequest['history'] | undefined,
  followUpType: ChatFollowUpType,
): ReferencedAssistantEntry | null {
  if (!history?.length) {
    return null
  }
  const assistantEntries = extractRecentAssistantEntries(history)
  if (assistantEntries.length === 0) {
    return null
  }
  const ordinalIndex = extractOrdinalIndex(message)
  const relativeIndex = extractRelativeIndex(message, assistantEntries.length)
  const selectedEntry = ordinalIndex !== null
    ? assistantEntries[ordinalIndex] ?? assistantEntries.at(-1)
    : relativeIndex !== null
      ? assistantEntries[relativeIndex] ?? assistantEntries.at(-1)
      : followUpType !== 'standalone'
        ? assistantEntries.at(-1)
        : null
  if (!selectedEntry) {
    return null
  }
  const gameId = selectedEntry.match(/\b[rf]\d{8}[a-z0-9-]+\b/iu)?.[0] ?? null
  const gameDate = extractGameDateFromText(selectedEntry)
  const team = extractGameTeamFromText(selectedEntry)
  return {
    source: 'latest_assistant_entry',
    anchor: selectedEntry,
    ordinal: ordinalIndex !== null ? ordinalIndex + 1 : null,
    summary: selectedEntry,
    gameId,
    gameDate,
    team,
  }
}

function extractRecentAssistantEntries(history: NonNullable<ChatRequest['history']>): string[] {
  for (const item of [...history].reverse()) {
    if (item.role !== 'assistant') {
      continue
    }
    const numberedEntries = item.content
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => /^\d+\.\s/.test(line))
    if (numberedEntries.length > 0) {
      return numberedEntries
    }
  }
  return []
}

function extractOrdinalIndex(message: string): number | null {
  const normalized = message.replace(/[０-９]/gu, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0xFEE0),
  )
  const ordinalPatterns: Array<[RegExp, number]> = [
    [/(?:最初|一つ目|1つ目|一番目|1番目|一件目|1件目|一本目|1本目)/u, 0],
    [/(?:二つ目|2つ目|二番目|2番目|二件目|2件目|二本目|2本目)/u, 1],
    [/(?:三つ目|3つ目|三番目|3番目|三件目|3件目|三本目|3本目)/u, 2],
    [/(?:四つ目|4つ目|四番目|4番目|四件目|4件目|四本目|4本目)/u, 3],
    [/(?:五つ目|5つ目|五番目|5番目|五件目|5件目|五本目|5本目)/u, 4],
  ]
  for (const [pattern, index] of ordinalPatterns) {
    if (pattern.test(normalized)) {
      return index
    }
  }
  return null
}

function extractRelativeIndex(message: string, entryCount: number): number | null {
  if (entryCount < 2) {
    return null
  }
  if (/その前のやつ|その前|ひとつ前|一つ前|1つ前|前のやつ|前の試合/u.test(message)) {
    return Math.max(0, entryCount - 2)
  }
  return null
}

function extractGameDateFromText(text: string): string | null {
  const match = text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/u)
  if (!match) {
    return null
  }
  const [, year, month, day] = match
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}

function extractGameTeamFromText(text: string): string | null {
  const match = text.match(/^\d+\.\s+\d{4}年\d{1,2}月\d{1,2}日(?:\s+[^\s]+)?\s+([^\s:]+)\s+[^\s:]+:/u)
  if (!match) {
    return null
  }
  return match[1] ?? null
}
