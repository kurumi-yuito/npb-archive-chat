import { describe, expect, it } from 'vitest'
import { parseChatRequestBody } from '../server/utils/parse-chat-request'

describe('parse-chat-request', () => {
  it('parses a valid chat request body', () => {
    expect(parseChatRequestBody({ message: '2025-08-15の代打イベントを教えて' })).toEqual({
      message: '2025-08-15の代打イベントを教えて',
    })
  })

  it('rejects an empty message', () => {
    expect(() => parseChatRequestBody({ message: '' })).toThrow()
  })
})
