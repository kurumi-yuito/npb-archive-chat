import type { ChatResponseCore, ChatStructuredQuery } from '@npb/schemas'
import type { ChatPlannerOutput } from './chat-query-plan'
import { buildChatExecutionMetadata } from './chat-executor'

export const SPORTS_NAVI_NPB_URL = 'https://baseball.yahoo.co.jp/npb/'

export const CHAT_CAPABILITY_INTENTS = [
  'historical_record',
  'analytical',
  'opinion',
  'news',
  'realtime',
] as const

export type ChatCapabilityIntent = typeof CHAT_CAPABILITY_INTENTS[number]

export type ChatCapabilityRoute =
  | 'repository_history'
  | 'repository_analysis'
  | 'analysis_then_opinion'
  | 'external_source_guidance'

export type ChatCapabilityClassification = {
  intent: ChatCapabilityIntent
  route: ChatCapabilityRoute
  requiresAnalysis: boolean
  usesRepository: boolean
  externalSourceUrl: string | null
}

export function classifyChatCapability(
  message: string,
  structuredQuery: ChatStructuredQuery,
  plannerOutput?: Pick<ChatPlannerOutput, 'followUpType' | 'answerMode'>,
): ChatCapabilityClassification {
  const normalized = normalizeQuestionText(message)
  const route = classifyCapabilityIntent(normalized, structuredQuery, plannerOutput)
  if (route === 'news' || route === 'realtime') {
    return {
      intent: route,
      route: 'external_source_guidance',
      requiresAnalysis: false,
      usesRepository: false,
      externalSourceUrl: SPORTS_NAVI_NPB_URL,
    }
  }
  if (route === 'opinion') {
    return {
      intent: 'opinion',
      route: 'analysis_then_opinion',
      requiresAnalysis: true,
      usesRepository: true,
      externalSourceUrl: null,
    }
  }
  if (route === 'analytical') {
    return {
      intent: 'analytical',
      route: 'repository_analysis',
      requiresAnalysis: true,
      usesRepository: true,
      externalSourceUrl: null,
    }
  }
  return {
    intent: 'historical_record',
    route: 'repository_history',
    requiresAnalysis: false,
    usesRepository: true,
    externalSourceUrl: null,
  }
}

export function buildCapabilityFailureResponse(
  message: string,
  structuredQuery: ChatStructuredQuery,
  plannerOutput: ChatPlannerOutput,
): ChatResponseCore {
  if (!plannerOutput.capability) {
    throw new Error('Planner capability is required for capability routing')
  }
  const capability = {
    intent: plannerOutput.capability.kind,
    route: plannerOutput.capability.route,
    requiresAnalysis: plannerOutput.capability.requiresAnalysis,
    usesRepository: plannerOutput.capability.usesRepository,
    externalSourceUrl: plannerOutput.capability.externalSourceUrl,
  }
  const executionMetadata = {
    ...buildChatExecutionMetadata(structuredQuery, null, {
      ...plannerOutput,
      capability: {
        kind: capability.intent,
        route: capability.route,
        requiresAnalysis: capability.requiresAnalysis,
        usesRepository: capability.usesRepository,
        externalSourceUrl: capability.externalSourceUrl,
      },
    }),
    questionIntent: capability.intent,
    capabilityRoute: capability.route,
    capabilityRequiresAnalysis: capability.requiresAnalysis,
    capabilityUsesRepository: capability.usesRepository,
    capabilityExternalSourceUrl: capability.externalSourceUrl,
  }
  const summary = capability.intent === 'realtime'
    ? realtimeGuidanceSummary(message)
    : newsGuidanceSummary()

  return {
    message,
    structured_query: structuredQuery,
    answer: {
      summary,
      result_count: 0,
      source_urls: [SPORTS_NAVI_NPB_URL],
      applied_filters: structuredQuery.filters,
      execution_metadata: {
        data_requirements: executionMetadata.dataRequirements,
        repositories: [],
        player_id_required: executionMetadata.playerIdRequired,
        player_id_satisfied: executionMetadata.playerIdSatisfied,
        follow_up_type: executionMetadata.followUpType,
        referenced_context: executionMetadata.referencedContext,
        target_entity: executionMetadata.targetEntity,
        follow_up_context: executionMetadata.followUpContext,
        correction_guard: executionMetadata.correctionGuard,
        correction: executionMetadata.correction,
        identity_intent: executionMetadata.identityIntent,
        target_game_id: executionMetadata.targetGameId,
        target_player_id: executionMetadata.targetPlayerId,
        answer_mode: executionMetadata.answerMode,
        identity_resolution_scope: executionMetadata.identityResolutionScope,
        domain: executionMetadata.domain,
        planner_validation: executionMetadata.validation,
        question_intent: capability.intent,
        capability_route: capability.route,
        capability_requires_analysis: capability.requiresAnalysis,
        capability_uses_repository: false,
        external_source_url: capability.externalSourceUrl,
      },
    },
    results: emptyResults(),
    sources: [],
  }
}

function classifyCapabilityIntent(
  normalized: string,
  structuredQuery: ChatStructuredQuery,
  plannerOutput?: Pick<ChatPlannerOutput, 'followUpType' | 'answerMode'>,
): ChatCapabilityIntent {
  if (isRealtimeQuestion(normalized)) {
    return 'realtime'
  }
  if (isNewsQuestion(normalized)) {
    return 'news'
  }
  if (isOpinionQuestion(normalized, plannerOutput)) {
    return 'opinion'
  }
  if (isAnalyticalQuestion(normalized, structuredQuery, plannerOutput)) {
    return 'analytical'
  }
  return 'historical_record'
}

function isRealtimeQuestion(text: string): boolean {
  if (hasExplicitHistoricalDateScope(text)) {
    return false
  }
  return /(今日|本日|現在).*(試合|スタメン|先発メンバー|途中経過|速報|ライブ|何対何|どうなって|結果)|今(?:の)?試合|今どうなって|今何対何|試合速報|途中経過|ライブ中継|リアルタイム/u.test(text)
}

function hasExplicitHistoricalDateScope(text: string): boolean {
  return /(?:19|20)\d{2}年|(?:19|20)\d{2}-\d{1,2}-\d{1,2}/u.test(text)
}

function isNewsQuestion(text: string): boolean {
  return /(ニュース|記事|公示|登録抹消|登録された|抹消された|ケガ|怪我|故障|契約|移籍(した|する|先|発表|ニュース|報道)|トレード|コメント|会見|発表|最新情報|報道)/u.test(text)
}

function isOpinionQuestion(
  text: string,
  plannerOutput?: Pick<ChatPlannerOutput, 'followUpType' | 'answerMode'>,
): boolean {
  return plannerOutput?.followUpType === 'evaluation_request' ||
    plannerOutput?.answerMode === 'evaluation_explanation' ||
    /(どう思う|どう見る|評価|期待でき|期待して|見込み|展望|予想|いけそう|やばくない|すごくない|強いと思う|弱いと思う)/u.test(text)
}

function isAnalyticalQuestion(
  text: string,
  structuredQuery: ChatStructuredQuery,
  plannerOutput?: Pick<ChatPlannerOutput, 'followUpType' | 'answerMode'>,
): boolean {
  if (plannerOutput?.answerMode === 'reason_explanation' || plannerOutput?.answerMode === 'comparison_explanation') {
    return true
  }
  if (/傾向|分析|最近|直近|調子|好調|不調|改善|課題|強み|弱み|良かった|よかった|悪かった|どこが|なんで|なぜ|比べ|比較/u.test(text)) {
    return true
  }
  const filters = structuredQuery.filters as Record<string, unknown>
  return filters.recent === true ||
    structuredQuery.intent === 'aggregate_batting' ||
    structuredQuery.intent === 'aggregate_pitching' ||
    structuredQuery.intent === 'aggregate_events' ||
    structuredQuery.intent === 'aggregate_games'
}

function normalizeQuestionText(message: string): string {
  return message.replace(/\s+/gu, '')
}

function realtimeGuidanceSummary(message: string): string {
  if (/スタメン|先発メンバー/u.test(message)) {
    return [
      'この質問は最新の試合情報・スタメン情報に関する内容です。',
      '',
      '最新情報はスポーツナビ プロ野球をご確認ください。',
      '',
      SPORTS_NAVI_NPB_URL,
      '',
      '過去の試合データや成績分析については引き続き回答できます。',
    ].join('\n')
  }
  return [
    '試合速報・途中経過などのリアルタイム情報には対応していません。',
    '',
    '最新情報はスポーツナビ プロ野球をご確認ください。',
    '',
    SPORTS_NAVI_NPB_URL,
    '',
    '過去の試合データや成績分析については引き続き回答できます。',
  ].join('\n')
}

function newsGuidanceSummary(): string {
  return [
    'ケガ・公示・契約・移籍などの最新情報は、このAIのデータベースでは扱っていません。',
    '',
    '最新情報はスポーツナビ プロ野球をご確認ください。',
    '',
    SPORTS_NAVI_NPB_URL,
    '',
    '過去の試合データや成績分析については引き続き回答できます。',
  ].join('\n')
}

function emptyResults(): ChatResponseCore['results'] {
  return {
    events: [],
    games: [],
    pitching: [],
    batting: [],
    roster: [],
    affiliations: [],
    gameDetails: [],
    aggregates: [],
  }
}
