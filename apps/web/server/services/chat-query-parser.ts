import type { ChatStructuredQuery } from '@npb/schemas'
import {
  createChatQueryLlm,
  hasChatQueryLlmConfig,
  normalizeStructuredQueryFromLlmMessage,
  type ChatQueryLlmConfig,
} from './chat-query-llm'
import { parseStructuredQueryFromMessageStub } from './chat-query-parser-stub'
import type { ChatQueryParserContext } from './chat-query-parser-prompt'

export type ChatQueryParser = (
  message: string,
  context?: ChatQueryParserContext,
) => Promise<ChatStructuredQuery>

type ChatQueryParserDependencies = {
  allowFallback?: boolean
  fallbackParser?: (message: string) => ChatStructuredQuery
  llmGenerator?: {
    generateStructuredQuery: (
      message: string,
      context?: ChatQueryParserContext,
    ) => Promise<ChatStructuredQuery>
  }
  logger?: Pick<Console, 'warn'>
}

export class ChatQueryParserUnavailableError extends Error {
  constructor(message = 'Chat query LLM is not configured or unavailable') {
    super(message)
    this.name = 'ChatQueryParserUnavailableError'
  }
}

export function createChatQueryParser(
  llmConfig?: Partial<ChatQueryLlmConfig>,
  dependencies: ChatQueryParserDependencies = {},
): ChatQueryParser {
  const allowFallback = dependencies.allowFallback ?? true
  const fallbackParser = dependencies.fallbackParser ?? parseStructuredQueryFromMessageStub
  const llmGenerator =
    dependencies.llmGenerator ??
    (llmConfig && hasChatQueryLlmConfig(llmConfig)
      ? createChatQueryLlm(llmConfig)
      : undefined)
  const logger = dependencies.logger ?? console

  return async (message: string, context?: ChatQueryParserContext) => {
    if (!llmGenerator) {
      if (!allowFallback) {
        throw new ChatQueryParserUnavailableError('CHAT_QUERY_LLM_API_KEY and CHAT_QUERY_LLM_MODEL must be set')
      }
      return fallbackParser(message)
    }

    try {
      const structuredQuery = await llmGenerator.generateStructuredQuery(message, context)
      return normalizeStructuredQueryFromLlmMessage(message, structuredQuery) as ChatStructuredQuery
    } catch (error) {
      if (!allowFallback) {
        const detail = error instanceof Error ? error.message : String(error)
        throw new ChatQueryParserUnavailableError(`Chat query LLM call failed: ${detail}`)
      }
      logger.warn('chat-query-parser: falling back to stub parser', error)
      return fallbackParser(fallbackMessageForParser(message, context))
    }
  }
}

export async function parseStructuredQueryFromMessage(message: string): Promise<ChatStructuredQuery> {
  return parseStructuredQueryFromMessageStub(message)
}

function fallbackMessageForParser(message: string, context?: ChatQueryParserContext): string {
  const previousUserMessage = [...(context?.history ?? [])]
    .reverse()
    .find((item) => item.role === 'user')?.content
  return previousUserMessage ? `${previousUserMessage}\n${message}` : message
}
