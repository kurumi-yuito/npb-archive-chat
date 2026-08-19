import { describe, expect, it, vi } from 'vitest'
import {
  ChatQueryParserUnavailableError,
  createChatQueryParser,
} from '../server/services/chat-query-parser'
import { parseStructuredQueryFromMessageStub } from '../server/services/chat-query-parser-stub'

function currentJstYear(): number {
  const year = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
  }).formatToParts(new Date()).find((part) => part.type === 'year')?.value
  return Number(year)
}

function currentJstDateOffset(offsetDays: number): string {
  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const year = Number(parts.find((part) => part.type === 'year')?.value)
  const month = Number(parts.find((part) => part.type === 'month')?.value)
  const day = Number(parts.find((part) => part.type === 'day')?.value)
  const shifted = new Date(Date.UTC(year, month - 1, day + offsetDays))
  return [
    shifted.getUTCFullYear(),
    String(shifted.getUTCMonth() + 1).padStart(2, '0'),
    String(shifted.getUTCDate()).padStart(2, '0'),
  ].join('-')
}

describe('chat-query-parser', () => {
  it('builds an events structured query from a valid LLM result', async () => {
    const generateStructuredQuery = vi.fn().mockResolvedValue({
      intent: 'search_events',
      filters: {
        game_date: '2025-08-15',
        inning: 8,
        half: 'bottom',
        team: 'ロッテ',
        batter_name: '山村',
        event_type: 'plate_appearance',
        event_subtype: 'pinch_hitter',
      },
    })
    const parser = createChatQueryParser(
      { baseUrl: 'https://example.test/v1', apiKey: 'secret', model: 'test-model' },
      {
        llmGenerator: {
          generateStructuredQuery,
        },
      },
    )

    expect(
      await parser(
        '2025-08-15の8回裏、team=ロッテ batter_name=山村 の代打イベントを教えて',
      ),
    ).toEqual({
      intent: 'search_events',
      filters: {
        game_date: '2025-08-15',
        inning: 8,
        half: 'bottom',
        team: 'ロッテ',
        batter_name: '山村',
        event_type: 'plate_appearance',
        event_subtype: 'pinch_hitter',
      },
    })
    expect(generateStructuredQuery).toHaveBeenCalledWith(
      '2025-08-15の8回裏、team=ロッテ batter_name=山村 の代打イベントを教えて',
      undefined,
    )
  })

  it('passes recent conversation history to the LLM parser', async () => {
    const generateStructuredQuery = vi.fn().mockResolvedValue({
      intent: 'search_roster',
      filters: {
        team: '巨人',
        player_name: '捕手',
      },
    })
    const parser = createChatQueryParser(
      { baseUrl: 'https://example.test/v1', apiKey: 'secret', model: 'test-model' },
      {
        llmGenerator: { generateStructuredQuery },
      },
    )

    await parser('てことは捕手層も厚いの？', {
      history: [
        { role: 'user', content: '巨人の大城って今どんな感じ' },
        { role: 'assistant', content: '大城は打者として怖い状態です。' },
      ],
    })

    expect(generateStructuredQuery).toHaveBeenCalledWith(
      'てことは捕手層も厚いの？',
      {
        history: [
          { role: 'user', content: '巨人の大城って今どんな感じ' },
          { role: 'assistant', content: '大城は打者として怖い状態です。' },
        ],
      },
    )
  })

  it('falls back to the stub parser when LLM generation fails', async () => {
    const parser = createChatQueryParser(
      { baseUrl: 'https://example.test/v1', apiKey: 'secret', model: 'test-model' },
      {
        llmGenerator: {
          generateStructuredQuery: vi.fn().mockRejectedValue(new Error('network')),
        },
        logger: { warn: vi.fn() },
      },
    )

    expect(
      await parser(
        '2025/08/15の投手成績で team=ロッテ pitcher_name=益田 を見せて',
      ),
    ).toEqual({
      intent: 'search_pitching',
      filters: {
        game_date: '2025-08-15',
        team: 'ロッテ',
        pitcher_name: '益田',
      },
    })
  })

  it.each([
    [
      '阪神の藤浪の最近の成績は？',
      {
        intent: 'search_pitching',
        filters: { pitcher_name: '藤浪', team: '阪神', recent: true },
      },
    ],
    [
      '佐藤輝明と牧秀悟のそれぞれ直近3試合の打撃成績を比較して',
      {
        intent: 'search_batting',
        filters: { player_names: ['佐藤輝明', '牧秀悟'], recent: true, limit: 3 },
      },
    ],
  ])('preserves the QA route when planner fallback handles %s', async (message, expected) => {
    const generateStructuredQuery = vi.fn().mockRejectedValue(new DOMException('timed out', 'TimeoutError'))
    const parser = createChatQueryParser(
      { baseUrl: 'https://example.test/v1', apiKey: 'secret', model: 'test-model' },
      {
        llmGenerator: {
          generateStructuredQuery,
        },
        logger: { warn: vi.fn() },
      },
    )

    await expect(parser(message)).resolves.toEqual(expected)
    expect(generateStructuredQuery).not.toHaveBeenCalled()
  })

  it.each([
    ['田中どう？', undefined, 'search_batting'],
    [
      'それどうだった？',
      {
        history: [
          { role: 'user' as const, content: '2021年4月16日の阪神対ヤクルトの試合結果を教えて' },
          { role: 'assistant' as const, content: '阪神が2-0で勝利しました。' },
        ],
      },
      'game_detail',
    ],
  ])('uses the deterministic route for unstable planner input %s', async (message, context, intent) => {
    const generateStructuredQuery = vi.fn()
    const parser = createChatQueryParser(
      { baseUrl: 'https://example.test/v1', apiKey: 'secret', model: 'test-model' },
      { allowFallback: false, llmGenerator: { generateStructuredQuery } },
    )

    const result = await parser(message, context)
    expect(result.intent).toBe(intent)
    expect(generateStructuredQuery).not.toHaveBeenCalled()
  })

  it('does not use the stub parser when fallback is disabled and LLM config is missing', async () => {
    const parser = createChatQueryParser(undefined, { allowFallback: false })

    await expect(parser('きのうのきょじんせんのはいらいとは')).rejects.toBeInstanceOf(
      ChatQueryParserUnavailableError,
    )
  })

  it('does not use the stub parser when fallback is disabled and LLM generation fails', async () => {
    const parser = createChatQueryParser(
      { baseUrl: 'https://example.test/v1', apiKey: 'secret', model: 'test-model' },
      {
        allowFallback: false,
        llmGenerator: {
          generateStructuredQuery: vi.fn().mockRejectedValue(new Error('network')),
        },
        logger: { warn: vi.fn() },
      },
    )

    await expect(parser('昨日の巨人戦のハイライトは')).rejects.toBeInstanceOf(
      ChatQueryParserUnavailableError,
    )
  })

  it('does not use the stub parser on LLM rate limits when fallback is disabled', async () => {
    const parser = createChatQueryParser(
      { baseUrl: 'https://example.test/v1', apiKey: 'secret', model: 'test-model' },
      {
        allowFallback: false,
        llmGenerator: {
          generateStructuredQuery: vi.fn().mockRejectedValue(new Error('rate limited')),
        },
        logger: { warn: vi.fn() },
      },
    )

    await expect(
      parser('2025/08/15の投手成績で team=ロッテ pitcher_name=益田 を見せて'),
    ).rejects.toBeInstanceOf(ChatQueryParserUnavailableError)
  })

  it('parses QA season batting questions with player names in fallback logic', () => {
    expect(parseStructuredQueryFromMessageStub('牧秀悟の今シーズンの通算打率は？')).toEqual({
      intent: 'aggregate_batting',
      filters: {
        year: currentJstYear(),
        player_name: '牧秀悟',
        limit: 10,
      },
    })
  })

  it('parses QA shorthand season batting questions in fallback logic', () => {
    expect(parseStructuredQueryFromMessageStub('牧の2026年の成績を教えて')).toEqual({
      intent: 'aggregate_batting',
      filters: {
        year: 2026,
        player_name: '牧',
      },
    })
  })

  it('parses QA pitching season questions with player and team in fallback logic', () => {
    expect(
      parseStructuredQueryFromMessageStub('オリックスの山本由伸の2026年の一軍での投球成績、登板数と防御率を教えてください'),
    ).toEqual({
      intent: 'aggregate_pitching',
      filters: {
        year: 2026,
        pitcher_name: '山本由伸',
        team: 'オリックス',
      },
    })
  })

  it('does not truncate pitcher names to generic fragments in fallback logic', () => {
    expect(
      parseStructuredQueryFromMessageStub('藤浪は2026年のここまでの二軍での成績はどうですか？防御率や登板数など詳しく教えてください'),
    ).toEqual({
      intent: 'aggregate_pitching',
      filters: {
        year: 2026,
        pitcher_name: '藤浪',
      },
    })
  })

  it('parses multi-player recent comparison questions in fallback logic', () => {
    expect(
      parseStructuredQueryFromMessageStub('石田裕太郎と東克樹のそれぞれ直近3試合の成績を比較して'),
    ).toEqual({
      intent: 'search_pitching',
      filters: {
        pitcher_names: ['石田裕太郎', '東克樹'],
        recent: true,
        limit: 3,
      },
    })
  })

  it('parses scoreless long-start ranking questions in fallback logic', () => {
    expect(
      parseStructuredQueryFromMessageStub('今シーズン（2026年）の先発登板で、7回以上投げてかつ自責点0だった試合が一番多い投手は誰ですか？その投手の名前と該当試合数を教えてください。'),
    ).toEqual({
      intent: 'aggregate_pitching',
      filters: {
        year: 2026,
        sort_by: 'games',
        limit: 20,
        min_innings_per_start: 7,
        max_earned_runs_per_start: 0,
      },
    })
  })

  it('parses longest start questions in fallback logic', () => {
    expect(
      parseStructuredQueryFromMessageStub('今シーズン広島の先発投手で最も長く投げた登板は？'),
    ).toEqual({
      intent: 'aggregate_pitching',
      filters: {
        year: currentJstYear(),
        team: '広島',
        sort_by: 'inningsPitched',
        limit: 20,
      },
    })
  })

  it('normalizes LLM longest-start queries that use search_pitching with inningsPitched', async () => {
    const generateStructuredQuery = vi.fn().mockResolvedValue({
      intent: 'search_pitching',
      filters: {
        team: '広島',
        sort_by: 'inningsPitched',
        limit: 20,
      },
    })
    const parser = createChatQueryParser(
      { baseUrl: 'https://example.test/v1', apiKey: 'secret', model: 'test-model' },
      {
        llmGenerator: { generateStructuredQuery },
      },
    )

    expect(await parser('今シーズン広島の先発投手で最も長く投げた登板は？')).toEqual({
      intent: 'aggregate_pitching',
      filters: {
        team: '広島',
        sort_by: 'inningsPitched',
        limit: 20,
      },
    })
  })

  it('keeps the stub parser behavior available as fallback logic', () => {
    expect(
      parseStructuredQueryFromMessageStub(
        '2025-08-15の8回裏、team=ロッテ batter_name=山村 の代打イベントを教えて',
      ),
    ).toEqual({
      intent: 'search_events',
      filters: {
        game_date: '2025-08-15',
        inning: 8,
        half: 'bottom',
        team: 'ロッテ',
        batter_name: '山村',
        event_type: 'plate_appearance',
        event_subtype: 'pinch_hitter',
      },
    })
  })

  it('extracts bare player names from phrase-style event and pitching queries', () => {
    expect(
      parseStructuredQueryFromMessageStub(
        '2025-08-15の8回裏に山村が代打したイベントを教えて',
      ),
    ).toEqual({
      intent: 'search_events',
      filters: {
        game_date: '2025-08-15',
        inning: 8,
        half: 'bottom',
        batter_name: '山村',
        event_type: 'plate_appearance',
        event_subtype: 'pinch_hitter',
      },
    })

    expect(
      parseStructuredQueryFromMessageStub(
        '2025-08-15の8回裏に高松が盗塁したイベントを教えて',
      ),
    ).toEqual({
      intent: 'search_events',
      filters: {
        game_date: '2025-08-15',
        inning: 8,
        half: 'bottom',
        runner_name: '高松',
        event_type: 'runner_event',
        event_subtype: 'stolen_base',
      },
    })

    expect(
      parseStructuredQueryFromMessageStub('2025-08-15の益田の投手成績を見せて'),
    ).toEqual({
      intent: 'search_pitching',
      filters: {
        game_date: '2025-08-15',
        pitcher_name: '益田',
      },
    })
  })

  it('parses top pitch count appearance questions as search_pitching with pitchCount sort', () => {
    expect(
      parseStructuredQueryFromMessageStub('今シーズン最も球数が多かった登板を教えて'),
    ).toEqual({
      intent: 'search_pitching',
      filters: {
        year: currentJstYear(),
        sort_by: 'pitchCount',
        limit: 1,
      },
    })
  })

  it('stops explicit assignments before trailing explanation text and joins spaced names', () => {
    expect(
      parseStructuredQueryFromMessageStub(
        '2025-08-15のplayer_name=益田のイベントを教えて',
      ),
    ).toEqual({
      intent: 'search_events',
      filters: {
        game_date: '2025-08-15',
        player_name: '益田',
      },
    })

    expect(
      parseStructuredQueryFromMessageStub(
        '2025-08-15の8回裏、team=ロッテ batter_name=山 村 の代打イベントを教えて',
      ),
    ).toEqual({
      intent: 'search_events',
      filters: {
        game_date: '2025-08-15',
        inning: 8,
        half: 'bottom',
        team: 'ロッテ',
        batter_name: '山村',
        event_type: 'plate_appearance',
        event_subtype: 'pinch_hitter',
      },
    })

    expect(
      parseStructuredQueryFromMessageStub(
        '2025/08/15の投手成績で team=ロッテ pitcher_name=益 田 を見せて',
      ),
    ).toEqual({
      intent: 'search_pitching',
      filters: {
        game_date: '2025-08-15',
        team: 'ロッテ',
        pitcher_name: '益田',
      },
    })
  })

  it('parses the first DB-grounded chat question categories into query plans', () => {
    expect(parseStructuredQueryFromMessageStub('2025年に山田が打った本塁打一覧')).toEqual({
      intent: 'search_events',
      filters: {
        year: 2025,
        batter_name: '山田',
        event_type: 'plate_appearance',
        result_text_contains: 'ホームラン',
      },
    })

    expect(parseStructuredQueryFromMessageStub('2025年にYamadaが打ったホームラン一覧')).toEqual({
      intent: 'search_events',
      filters: {
        year: 2025,
        batter_name: 'Yamada',
        event_type: 'plate_appearance',
        result_text_contains: 'ホームラン',
      },
    })

    expect(parseStructuredQueryFromMessageStub('2025年の山田のHR')).toEqual({
      intent: 'search_events',
      filters: {
        year: 2025,
        batter_name: '山田',
        event_type: 'plate_appearance',
        result_text_contains: 'ホームラン',
      },
    })

    expect(parseStructuredQueryFromMessageStub('2025年にヤクルトの山田が打ったホームラン一覧')).toEqual({
      intent: 'search_events',
      filters: {
        year: 2025,
        team: 'ヤクルト',
        batter_name: '山田',
        event_type: 'plate_appearance',
        result_text_contains: 'ホームラン',
      },
    })

    expect(parseStructuredQueryFromMessageStub('2024年の山田の打席結果')).toEqual({
      intent: 'search_batting',
      filters: {
        year: 2024,
        player_name: '山田',
      },
    })

    expect(parseStructuredQueryFromMessageStub('ヤクルト村上の今年の成績')).toEqual({
      intent: 'aggregate_batting',
      filters: {
        year: currentJstYear(),
        team: 'ヤクルト',
        player_name: '村上',
      },
    })

    expect(parseStructuredQueryFromMessageStub('2023年の益田登板試合')).toEqual({
      intent: 'search_pitching',
      filters: {
        year: 2023,
        pitcher_name: '益田',
      },
    })

    expect(parseStructuredQueryFromMessageStub('村上の最近の評価は')).toEqual({
      intent: 'search_batting',
      filters: {
        player_name: '村上',
        recent: true,
      },
    })

    expect(parseStructuredQueryFromMessageStub('ヤクルト村上の最近の評価は')).toEqual({
      intent: 'search_batting',
      filters: {
        team: 'ヤクルト',
        player_name: '村上',
        recent: true,
      },
    })

    expect(parseStructuredQueryFromMessageStub('坂倉将吾の最近の打席内容を教えてください')).toEqual({
      intent: 'search_batting',
      filters: {
        player_name: '坂倉将吾',
      },
    })

    expect(parseStructuredQueryFromMessageStub('益田投手の最近の調子はどう')).toEqual({
      intent: 'search_pitching',
      filters: {
        pitcher_name: '益田',
        recent: true,
      },
    })

    expect(parseStructuredQueryFromMessageStub('2018年のgame_id=r20180524e-b-12のスタメン')).toEqual({
      intent: 'search_roster',
      filters: {
        year: 2018,
        game_id: 'r20180524e-b-12',
        starter: true,
      },
    })

    expect(parseStructuredQueryFromMessageStub('今シーズンのヤクルトで最も多く4番に起用されている選手は誰ですか？')).toEqual({
      intent: 'aggregate_batting',
      filters: {
        year: currentJstYear(),
        team: 'ヤクルト',
        batting_order: 4,
        sort_by: 'games',
        limit: 1,
      },
    })

    expect(parseStructuredQueryFromMessageStub('今シーズンDeNAで捕手（スタメン）として最も多く出場しているのは誰？')).toEqual({
      intent: 'aggregate_batting',
      filters: {
        year: currentJstYear(),
        team: 'DeNA',
        position: '捕',
        sort_by: 'games',
        limit: 3,
      },
    })

    expect(parseStructuredQueryFromMessageStub('2016–2026横断で山田のイベント検索')).toEqual({
      intent: 'search_events',
      filters: {
        year_from: 2016,
        year_to: 2026,
        player_name: '山田',
      },
    })

    for (const message of [
      '横浜の京田と中日の砂田が対決したことってある？',
      '横浜京田と中日砂田が対決したことってある？',
      '横浜京田対中日砂田ってある？',
      '横浜京田vs中日砂田',
      '横浜京田は中日砂田から打ったことある？',
      '中日砂田から横浜京田が打ったことある？',
    ]) {
      expect(parseStructuredQueryFromMessageStub(message)).toEqual({
        intent: 'search_events',
        filters: {
          team: '横浜',
          batter_name: '京田',
          pitcher_name: '砂田',
          limit: 500,
        },
      })
    }
  })

  it('routes affiliation questions to player_affiliation instead of event search', () => {
    expect(parseStructuredQueryFromMessageStub('藤浪晋太郎の所属チームは')).toEqual({
      intent: 'player_affiliation',
      filters: {
        player_name: '藤浪晋太郎',
      },
    })

    expect(parseStructuredQueryFromMessageStub('2025年の藤浪晋太郎の所属チームは')).toEqual({
      intent: 'player_affiliation',
      filters: {
        year: 2025,
        player_name: '藤浪晋太郎',
      },
    })

    expect(parseStructuredQueryFromMessageStub('ヤクルトの山田の所属チームは')).toEqual({
      intent: 'player_affiliation',
      filters: {
        team: 'ヤクルト',
        player_name: '山田',
      },
    })
  })

  it('routes relative-date venue game questions to game detail search', () => {
    expect(parseStructuredQueryFromMessageStub('昨日の東京ドームの試合について教えて')).toEqual({
      intent: 'game_detail',
      filters: {
        game_date: currentJstDateOffset(-1),
        venue: '東京ドーム',
      },
    })
  })

  it('routes relative-date team highlight questions to game detail search', () => {
    expect(parseStructuredQueryFromMessageStub('昨日の巨人戦のハイライトは')).toEqual({
      intent: 'game_detail',
      filters: {
        game_date: currentJstDateOffset(-1),
        team: '巨人',
      },
    })
  })
})
