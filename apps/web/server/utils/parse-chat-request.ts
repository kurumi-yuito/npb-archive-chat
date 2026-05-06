import { chatRequestSchema, type ChatRequest } from '@npb/schemas'

export function parseChatRequestBody(body: unknown): ChatRequest {
  return chatRequestSchema.parse(body)
}
