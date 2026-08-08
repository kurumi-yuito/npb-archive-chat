import { describe, expect, it } from 'vitest'
import { CHAT_USAGE_CACHE_HEADERS } from '../server/utils/chat-usage-cache'

describe('/api/chat/usage cache policy', () => {
  it('prevents browser and shared CDN storage', () => {
    expect(CHAT_USAGE_CACHE_HEADERS['Cache-Control']).toContain('private')
    expect(CHAT_USAGE_CACHE_HEADERS['Cache-Control']).toContain('no-store')
    expect(CHAT_USAGE_CACHE_HEADERS['CDN-Cache-Control']).toBe('no-store')
    expect(CHAT_USAGE_CACHE_HEADERS['Cloudflare-CDN-Cache-Control']).toBe('no-store')
    expect(CHAT_USAGE_CACHE_HEADERS.Vary).toContain('Cookie')
  })
})
