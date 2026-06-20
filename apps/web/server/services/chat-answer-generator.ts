import { formatChatAnswer } from './chat-answer-formatter'

export type ChatAnswerGeneratorInput = Parameters<typeof formatChatAnswer>[0]
export type ChatAnswerGeneratorOutput = ReturnType<typeof formatChatAnswer>

export function generateAnswerFromEvidence(input: ChatAnswerGeneratorInput): ChatAnswerGeneratorOutput {
  return formatChatAnswer(input)
}
