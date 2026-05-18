import type { ChatRequest, ChatResponseCore } from '@npb/schemas'

export type ChatFinalAnswerLlmConfig = {
  baseUrl?: string
  apiKey?: string
  model?: string
}

export type ChatFinalAnswerInput = ChatResponseCore & {
  history?: ChatRequest['history']
}

export type ChatFinalAnswerGenerator = (input: ChatFinalAnswerInput) => Promise<string>

export function hasChatFinalAnswerLlmConfig(config: ChatFinalAnswerLlmConfig): boolean {
  return Boolean(config.apiKey?.trim() && config.model?.trim())
}

export function createChatFinalAnswerLlm(config: ChatFinalAnswerLlmConfig): ChatFinalAnswerGenerator {
  const baseUrl = (config.baseUrl?.trim() || 'https://api.openai.com/v1').replace(/\/$/, '')
  const apiKey = config.apiKey?.trim()
  const model = config.model?.trim()
  if (!apiKey || !model) {
    throw new Error('CHAT_ANSWER_LLM_API_KEY and CHAT_ANSWER_LLM_MODEL must be set')
  }

  return async (input) => {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content: [
              'You draft the final Japanese answer for an NPB specialist chat service.',
              'The product goal is expert-level conversational NPB answers grounded only in official NPB-derived evidence supplied in the payload.',
              'Use only the supplied DB answer, DB results, resolved player data, conversation history, and sourceUrl values.',
              'Do not add facts, teams, players, scores, counts, or dates that are not present in the payload.',
              'You may compute simple derived metrics from supplied values, such as OPS = OBP + SLG, but show the source values used.',
              'Write naturally in Japanese and preserve the user’s conversational context.',
              'If evidence is insufficient, say exactly what is missing instead of guessing.',
              'Keep sourceUrl references when relevant.',
            ].join('\n'),
          },
          {
            role: 'user',
            content: JSON.stringify({
              question: input.message,
              history: input.history ?? [],
              structured_query: input.structured_query,
              deterministic_answer: input.answer,
              results: input.results,
              sources: input.sources,
            }),
          },
        ],
      }),
    })

    if (!response.ok) {
      throw new Error(`Final answer LLM failed with HTTP ${response.status}`)
    }

    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const content = body.choices?.[0]?.message?.content?.trim()
    if (!content) {
      throw new Error('Final answer LLM returned empty content')
    }
    return content
  }
}
