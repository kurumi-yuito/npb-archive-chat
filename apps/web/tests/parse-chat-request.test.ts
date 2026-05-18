import { describe, expect, it } from 'vitest'
import { parseChatRequestBody } from '../server/utils/parse-chat-request'

describe('parse-chat-request', () => {
  it('parses a valid chat request body', () => {
    expect(parseChatRequestBody({ message: '2025-08-15の代打イベントを教えて' })).toEqual({
      message: '2025-08-15の代打イベントを教えて',
    })
  })

  it('parses bounded conversation history', () => {
    expect(parseChatRequestBody({
      message: 'てことは捕手層も厚いの？',
      history: [
        { role: 'user', content: '巨人の大城って今どんな感じ' },
        { role: 'assistant', content: '大城は打者として怖い状態です。' },
      ],
    })).toEqual({
      message: 'てことは捕手層も厚いの？',
      history: [
        { role: 'user', content: '巨人の大城って今どんな感じ' },
        { role: 'assistant', content: '大城は打者として怖い状態です。' },
      ],
    })
  })

  it('rejects an empty message', () => {
    expect(() => parseChatRequestBody({ message: '' })).toThrow()
  })
})
