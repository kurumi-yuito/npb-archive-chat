import type { ChatStructuredQuery } from '@npb/schemas'
import {
  createChatQueryLlm,
  hasChatQueryLlmConfig,
  type ChatQueryLlmConfig,
} from './chat-query-llm'
import { parseStructuredQueryFromMessageStub } from './chat-query-parser-stub'
import type { ChatQueryParserContext } from './chat-query-parser-prompt'

export type ChatQueryParser = (
  message: string,
  context?: ChatQueryParserContext,
) => Promise<ChatStructuredQuery>

type ChatQueryParserDependencies = {
  fallbackParser?: (message: string) => ChatStructuredQuery
  llmGenerator?: {
    generateStructuredQuery: (
      message: string,
      context?: ChatQueryParserContext,
    ) => Promise<ChatStructuredQuery>
  }
  logger?: Pick<Console, 'warn'>
}

export function createChatQueryParser(
  llmConfig?: Partial<ChatQueryLlmConfig>,
  dependencies: ChatQueryParserDependencies = {},
): ChatQueryParser {
  const fallbackParser = dependencies.fallbackParser ?? parseStructuredQueryFromMessageStub
  const llmGenerator =
    dependencies.llmGenerator ??
    (llmConfig && hasChatQueryLlmConfig(llmConfig)
      ? createChatQueryLlm(llmConfig)
      : undefined)
  const logger = dependencies.logger ?? console

  return async (message: string, context?: ChatQueryParserContext) => {
    if (!llmGenerator) {
      return fallbackParser(message)
    }

    try {
      return await llmGenerator.generateStructuredQuery(message, context)
    } catch (error) {
      logger.warn('chat-query-parser: falling back to stub parser', error)
      return fallbackParser(message)
    }
  }
}

export async function parseStructuredQueryFromMessage(message: string): Promise<ChatStructuredQuery> {
  return parseStructuredQueryFromMessageStub(message)
}
