import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { getChatUsageBucket, migrateDatabase, openDatabase, sqliteDatabaseToQuery } from '@npb/db'

const mocks = vi.hoisted(() => ({ metaDatabase: vi.fn(), queryService: vi.fn() }))
vi.mock('../server/utils/server-database', () => ({ getServerMetaDatabase: mocks.metaDatabase, getServerChatQueryService: mocks.queryService }))
vi.mock('../server/utils/parse-chat-identity', () => ({ parseChatIdentity: () => ({ userId: 'contract-refund-user', guestGuardEligible: false }) }))
vi.mock('h3', () => ({
  createError: (options: { statusCode: number; statusMessage: string; data: unknown }) => Object.assign(new Error(options.statusMessage), options),
  readBody: async (event: { body: unknown }) => event.body,
  getHeader: (event: { headers: Record<string, string> }, name: string) => event.headers[name],
  setResponseHeader: vi.fn(),
}))

describe('chat contract failures and quota accounting', () => {
  const database = openDatabase()
  const query = sqliteDatabaseToQuery(database)
  let handler: (event: unknown) => Promise<unknown>
  beforeAll(async () => {
    vi.stubGlobal('defineEventHandler', (value: unknown) => value)
    handler = (await import('../server/api/chat.post')).default as unknown as (event: unknown) => Promise<unknown>
  }, 30_000)
  afterAll(() => database.close())
  beforeEach(() => {
    migrateDatabase(database)
    mocks.metaDatabase.mockReset().mockResolvedValue(query)
    mocks.queryService.mockReset()
    vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
    vi.stubGlobal('useRuntimeConfig', () => ({
      npbDefaultPlan: 'free', npbFreeTokenCapacity: '10', npbFreeTokenRefillMinutes: '120',
      npbAuthSharedSecret: 'test-secret', npbAuthHeaderFallback: 'false', npbGuestGuardEnabled: 'false',
    }))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('rejects a forged candidate choice before account lookup or quota writes', async () => {
    await expect(handler({ context: {}, headers: {}, body: {
      message: '2025年の坂本勇人について教えて',
      selected_player: { mention: '坂本勇人', player_id: '71075153', challenge: 'forged.invalid' },
    } })).rejects.toMatchObject({ statusCode: 400, data: { code: 'player_selection_invalid' } })
    expect(mocks.metaDatabase).not.toHaveBeenCalled()
    expect(mocks.queryService).not.toHaveBeenCalled()
  })

  it('refunds a consumed token when the semantic contract prevents execution', async () => {
    const meaning = JSON.parse(readFileSync(new URL('../../../docs/eval-query-contracts.json', import.meta.url), 'utf8')).cases[0].meaning
    const event = {
      context: { cloudflare: { env: { NPB_QA_REPLAY_TOKEN: 'test-token' } } },
      headers: { 'x-npb-qa-mode': 'fixture', 'x-npb-qa-token': 'test-token' },
      body: { message: '2025年にヤクルトの山田が打ったホームラン一覧', fixture_structured_query: {
        intent: 'search_events', query_contract: meaning,
        filters: { year: 2024, team: 'ヤクルト', batter_name: '山田', result_text_contains: 'ホームラン' },
      } },
    }
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 503, data: { code: 'query_contract_invalid' } })
    const bucket = await getChatUsageBucket(query, 'account:contract-refund-user', { capacity: 10, refillIntervalSeconds: 7200 }, Math.floor(Date.now() / 1000))
    expect(bucket.tokens).toBe(10)
    expect(mocks.queryService).not.toHaveBeenCalled()
  })

  it('does not continue to chat when account persistence is unavailable', async () => {
    mocks.metaDatabase.mockRejectedValue(new Error('storage unavailable'))
    await expect(handler({ context: {}, headers: {}, body: { message: '成績を教えて' } })).rejects.toMatchObject({ statusCode: 503, data: { code: 'account_unavailable' } })
    expect(mocks.queryService).not.toHaveBeenCalled()
  })
})
