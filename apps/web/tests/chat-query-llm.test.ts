import { describe, expect, it, vi } from 'vitest'
import {
  ChatQueryLlmContractError,
  createChatQueryLlm,
  normalizeStructuredQueryFromLlmMessage,
} from '../server/services/chat-query-llm'

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
    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(request.response_format).toMatchObject({
      type: 'json_schema',
      json_schema: {
        schema: {
          properties: {
            intent: {
              enum: expect.arrayContaining(['search_events', 'off_topic']),
            },
          },
        },
      },
    })
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

  it('does not retry a credit balance exhausted response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: {
        message: 'You have no credits remaining.',
        type: 'insufficient_quota',
        code: 'credit_balance_exhausted',
      },
    }), { status: 429, headers: { 'content-type': 'application/json' } }))
    const llm = createChatQueryLlm(
      { baseUrl: 'https://example.test/v1', apiKey: 'secret', model: 'test-model' },
      { fetch: fetchMock },
    )

    await expect(llm.generateStructuredQuery('牧の成績を教えて')).rejects.toThrow('status 429')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('records the raw planner intent and OpenAI request id on contract violations', async () => {
    const logger = { error: vi.fn() }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({ intent: 'recheck_request', filters: {} }),
            },
          }],
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'x-request-id': 'req_planner_contract',
          },
        },
      ),
    )
    const llm = createChatQueryLlm(
      { baseUrl: 'https://example.test/v1', apiKey: 'secret', model: 'test-model' },
      { fetch: fetchMock, logger },
    )

    const error = await llm.generateStructuredQuery('調べなおして').catch((value: unknown) => value)
    expect(error).toBeInstanceOf(ChatQueryLlmContractError)
    expect(error).toMatchObject({
      plannerIntent: 'recheck_request',
      rawResponse: '{"intent":"recheck_request","filters":{}}',
      openAiRequestId: 'req_planner_contract',
    })
    expect(logger.error).toHaveBeenCalledWith(
      '[chat-query-llm] planner contract violation',
      expect.objectContaining({
        plannerIntent: 'recheck_request',
        openAiRequestId: 'req_planner_contract',
      }),
    )
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

  it('normalizes pitching ranking outputs with era sort into aggregate_pitching', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  intent: 'search_pitching',
                  filters: {
                    year: 2026,
                    pitcher_names: ['山本由伸', '佐々木朗希'],
                    sort_by: 'era',
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
      llm.generateStructuredQuery('今シーズン（2026年）の山本由伸と佐々木朗希を比較してください。防御率・奪三振・投球回の3つの観点で。'),
    ).resolves.toEqual({
      intent: 'aggregate_pitching',
      filters: {
        year: 2026,
        pitcher_names: ['山本由伸', '佐々木朗希'],
        limit: 3,
        sort_by: 'era',
      },
    })
  })

  it('normalizes multi-player recent comparison outputs into player arrays', () => {
    expect(
      normalizeStructuredQueryFromLlmMessage(
        '石田裕太郎と東克樹のそれぞれ直近3試合の成績を比較して',
        {
          intent: 'search_batting',
          filters: {
            player_name: 'それぞれ直近3試合',
            recent: true,
          },
        },
      ),
    ).toEqual({
      intent: 'search_pitching',
      filters: {
        pitcher_names: ['石田裕太郎', '東克樹'],
        recent: true,
        limit: 3,
      },
    })
  })

  it.each([
    [
      '村上宗隆は今シーズン打率どのくらい？',
      { intent: 'aggregate_batting', filters: { year: 2026, player_name: '村上宗隆', player_id: 'wrong-id', team: '阪神' } },
      { intent: 'aggregate_batting', filters: { year: 2026, player_name: '村上宗隆' } },
    ],
    [
      '村上宗隆は今シーズン打率どのくらい？本塁打は何本出てる？',
      { intent: 'search_batting', filters: { year: 2026, player_name: '村上', player_id: 'wrong-id', team: '阪神', limit: 20 } },
      { intent: 'aggregate_batting', filters: { year: 2026, player_name: '村上宗隆', limit: 20 } },
    ],
    [
      '2025年の大谷翔平の成績を教えてください',
      { intent: 'aggregate_batting', filters: { year: 2025, player_name: '大谷', player_id: 'wrong-id', team: 'ロッテ' } },
      { intent: 'aggregate_batting', filters: { year: 2025, player_name: '大谷翔平' } },
    ],
    [
      'ジャイアンツの今シーズン投手成績を教えてください',
      { intent: 'aggregate_batting', filters: { year: 2026, team: '巨人' } },
      { intent: 'aggregate_pitching', filters: { year: 2026, team: '巨人' } },
    ],
    [
      '村上宗隆の2019年から2025年の年別本塁打数を教えてください',
      { intent: 'aggregate_batting', filters: { year: 2022, player_name: '村上', group_by: 'year', limit: 10 } },
      { intent: 'aggregate_batting', filters: { player_name: '村上宗隆', year_from: 2019, year_to: 2025, group_by: 'year', limit: 100 } },
    ],
    [
      '2026年5月10日の広島のスタメンを教えてください',
      { intent: 'search_batting', filters: { game_date: '2026-05-10', team: '広島' } },
      { intent: 'search_batting', filters: { game_date: '2026-05-10', team: '広島', limit: 100 } },
    ],
  ])('normalizes explicit planner contract for %s', (message, parsed, expected) => {
    expect(normalizeStructuredQueryFromLlmMessage(message, parsed)).toEqual(expected)
  })

  it.each([
    ['藤浪の直近試合の内容は', 1],
    ['藤浪の直近の試合はどうだった', 1],
    ['藤浪の最新登板を教えて', 1],
    ['藤浪が最後に投げた試合の内容は', 1],
    ['藤浪の直近5試合の内容は', 5],
    ['藤浪の最近5試合の成績は', 5],
    ['藤浪のここ5登板を教えて', 5],
  ])('normalizes recent appearance scope for %s', (message, limit) => {
    expect(
      normalizeStructuredQueryFromLlmMessage(message, {
        intent: 'search_pitching',
        filters: {
          pitcher_name: '藤浪',
          recent: true,
          limit: limit === 1 ? 5 : undefined,
        },
      }),
    ).toEqual({
      intent: 'search_pitching',
      filters: {
        pitcher_name: '藤浪',
        recent: true,
        limit,
      },
    })
  })

  it('recovers an elliptical recent player question from an off-topic parser result', () => {
    expect(
      normalizeStructuredQueryFromLlmMessage('藤浪の直近の内容', {
        intent: 'off_topic',
        filters: {},
      }),
    ).toEqual({
      intent: 'search_pitching',
      filters: { pitcher_name: '藤浪', recent: true, limit: 5 },
    })
  })

  it.each([
    '藤浪の今季成績は',
    '藤浪の通算成績は',
    '藤浪の最近の投球成績は',
  ])('does not force a single appearance for aggregate wording: %s', (message) => {
    const value = {
      intent: 'aggregate_pitching',
      filters: { pitcher_name: '藤浪' },
    }
    expect(normalizeStructuredQueryFromLlmMessage(message, value)).toEqual(value)
  })

  it('does not collapse a compound season question to its latest-appearance clause', () => {
    const value = {
      intent: 'search_pitching',
      filters: {
        pitcher_name: '藤浪',
        league_level: 'farm',
        year: 2026,
        recent: true,
        limit: 5,
      },
    }
    expect(
      normalizeStructuredQueryFromLlmMessage(
        '藤浪は今シーズン二軍で何回登板してる？直近の試合ではどんな投球だった？',
        value,
      ),
    ).toEqual(value)
  })

  it('normalizes recent batting-order queries idempotently', () => {
    expect(
      normalizeStructuredQueryFromLlmMessage('DeNAで5番ショートは最近いつ？', {
        intent: 'search_roster',
        filters: { team: 'DeNA', position: '遊', starter: true, limit: 10 },
      }),
    ).toMatchObject({
      intent: 'search_batting',
      filters: { team: 'DeNA', position: '遊', recent: true, limit: 1 },
    })
  })
})
