import { describe, expect, it, vi } from 'vitest'
import { createChatQueryLlm } from '../server/services/chat-query-llm'

describe('chat-query-llm', () => {
  it('parses a valid OpenAI-compatible chat completions response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  intent: 'search_events',
                  filters: {
                    game_date: '2025-08-15',
                    inning: 8,
                    half: 'bottom',
                    batter_name: '山村',
                    event_subtype: 'pinch_hitter',
                  },
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )

    const llm = createChatQueryLlm(
      { baseUrl: 'https://example.test/v1', apiKey: 'secret', model: 'test-model' },
      { fetch: fetchMock },
    )

    await expect(
      llm.generateStructuredQuery('2025-08-15の8回裏の山村の代打イベントを教えて'),
    ).resolves.toEqual({
      intent: 'search_events',
      filters: {
        game_date: '2025-08-15',
        inning: 8,
        half: 'bottom',
        batter_name: '山村',
        event_subtype: 'pinch_hitter',
      },
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('rejects invalid structured query JSON so the caller can fall back', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  intent: 'search_events',
                  filters: {
                    inning: 'eighth',
                  },
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )

    const llm = createChatQueryLlm(
      { baseUrl: 'https://example.test/v1', apiKey: 'secret', model: 'test-model' },
      { fetch: fetchMock },
    )

    await expect(
      llm.generateStructuredQuery('8回裏のイベントを教えて'),
    ).rejects.toThrow()
  })

  it('normalizes pitchCount ranking outputs into search_pitching', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  intent: 'aggregate_pitching',
                  filters: {
                    year: 2026,
                    sort_by: 'pitchCount',
                  },
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )

    const llm = createChatQueryLlm(
      { baseUrl: 'https://example.test/v1', apiKey: 'secret', model: 'test-model' },
      { fetch: fetchMock },
    )

    await expect(
      llm.generateStructuredQuery('今シーズン最も球数が多かった登板を教えて'),
    ).resolves.toEqual({
      intent: 'search_pitching',
      filters: {
        year: 2026,
        sort_by: 'pitchCount',
        limit: 1,
      },
    })
  })
})
