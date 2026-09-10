import { expect, it, vi } from 'vitest'
import type { ChatQueryService } from '@npb/db'
import { lazyChatQueryService } from '../server/utils/lazy-chat-query-service'
import { createChatService } from '../server/services/chat-service'

it('does no initialization until a query and shares initialization for concurrent queries', async () => {
  const searchGames = vi.fn(async () => [])
  const load = vi.fn(async () => ({ searchGames }) as unknown as ChatQueryService)
  const service = await lazyChatQueryService(load)
  expect('searchBattingLines' in service && 'aggregateEvents' in service).toBe(true)
  expect('prepare' in service).toBe(false)
  expect(load).not.toHaveBeenCalled()
  await Promise.all([service.searchGames({ year: 2025 }), service.searchGames({ year: 2026 })])
  expect(load).toHaveBeenCalledTimes(1)
  expect(searchGames.mock.calls).toHaveLength(2)
})

it('is consumed as a query service by the chat service, not as a raw database', async () => {
  const searchGames = vi.fn(async () => [])
  const load = vi.fn(async () => ({
    searchGames,
    listSourceSnapshotsByGameIds: async () => [],
  }) as unknown as ChatQueryService)
  const service = createChatService(lazyChatQueryService(load), {
    parseStructuredQueryFromMessage: async () => ({ intent: 'search_games', filters: { year: 2025, team: '巨人' } }),
  })
  await service.answerQuestion('2025年の巨人の試合結果を教えて')
  expect(load).toHaveBeenCalledTimes(1)
  expect(searchGames).toHaveBeenCalled()
})
