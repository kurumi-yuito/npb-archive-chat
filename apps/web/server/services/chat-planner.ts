import type { ChatRequest, ChatStructuredQuery } from '@npb/schemas'
import type { ChatQueryParser } from './chat-query-parser'
import type { normalizeChatStructuredQuery } from './chat-query-normalizer'
import {
  chatPlannerOutputSchema,
  extractPlannerEntities,
  extractPlannerTimeRange,
  inferDataRequirements,
  type ChatPlannerOutput,
} from './chat-query-plan'

export type ChatPlanner = (
  message: string,
  context?: { history?: ChatRequest['history'] },
) => Promise<ChatPlannerOutput>

type CreateChatPlannerOptions = {
  parseStructuredQueryFromMessage: ChatQueryParser
  normalizeStructuredQuery: typeof normalizeChatStructuredQuery
}

export function createChatPlanner({
  parseStructuredQueryFromMessage,
  normalizeStructuredQuery,
}: CreateChatPlannerOptions): ChatPlanner {
  return async (message, context = {}) => {
    const structuredQuery = normalizeStructuredQuery(
      await parseStructuredQueryFromMessage(message, {
        history: context.history,
      }),
    )
    return buildPlannerOutput(structuredQuery, false)
  }
}

export function buildPlannerOutput(
  structuredQuery: ChatStructuredQuery,
  legacyStabilizationApplied: boolean,
): ChatPlannerOutput {
  return chatPlannerOutputSchema.parse({
    intent: structuredQuery.intent,
    structuredQuery,
    entities: extractPlannerEntities(structuredQuery),
    timeRange: extractPlannerTimeRange(structuredQuery),
    dataRequirements: inferDataRequirements(structuredQuery),
    confidence: legacyStabilizationApplied ? 0.72 : 0.86,
    clarificationRequired: false,
    legacyStabilizationApplied,
  })
}
