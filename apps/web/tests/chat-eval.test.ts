import { afterEach, describe, expect, it } from 'vitest'
import {
  createSingleDatabaseQueryService,
  migrateDatabase,
  openDatabase,
  sqliteDatabaseToQuery,
  type ChatQueryService,
} from '@npb/db'
import { createChatService } from '../server/services/chat-service'
import { parseStructuredQueryFromMessageStub } from '../server/services/chat-query-parser-stub'

type QueryCall = {
  method: keyof ChatQueryService
  filters: unknown
}

const openServices: ChatQueryService[] = []

function currentJstYear(): number {
  const year = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
  }).formatToParts(new Date()).find((part) => part.type === 'year')?.value
  return Number(year)
}

afterEach(() => {
  for (const service of openServices.splice(0)) {
    service.close()
  }
})

describe('chat eval: db-backed query plan, result, formatter regression', () => {
  it('01 ambiguous name: stops before event search', async () => {
    const { service, calls } = createEvalService()

    const response = await service.answerQuestion('2025年に山田が打ったホームラン一覧')

    expect(response.structured_query).toMatchObject({
      intent: 'search_events',
      filters: {
        year: 2025,
        batter_name: '山田',
        event_type: 'plate_appearance',
        result_text_contains: 'ホームラン',
      },
    })
    expect(response.answer.resolved_player).toMatchObject({ input: '山田', status: 'ambiguous' })
    expect(response.answer.result_count).toBe(0)
    expect(response.results.events).toHaveLength(0)
    expect(calls.some((call) => call.method === 'searchEvents')).toBe(false)
  })

  it('02 team qualifier: resolves Yakult Yamada and returns 12 home runs', async () => {
    const { service } = createEvalService()

    const response = await service.answerQuestion('2025年にヤクルトの山田が打ったホームラン一覧')

    expect(response.structured_query).toMatchObject({
      intent: 'search_events',
      filters: {
        year: 2025,
        team: 'ヤクルト',
        batter_name: '山田',
        batter_player_id: '91895133',
        event_type: 'plate_appearance',
        result_text_contains: 'ホームラン',
      },
    })
    expect(response.answer.resolved_player).toMatchObject({
      input: '山田',
      player_id: '91895133',
      status: 'resolved',
    })
    expect(response.answer.result_count).toBe(12)
    expect(response.results.events).toHaveLength(12)
    expect(response.answer.summary).toBe('2025年ヤクルト山田が打ったホームランは12件です。')
  })

  it('03 romanized name without qualifier: stops safely instead of guessing', async () => {
    const { service, calls } = createEvalService()

    const response = await service.answerQuestion('2025年にYamadaが打ったホームラン一覧')

    expect(response.structured_query).toMatchObject({
      intent: 'search_events',
      filters: {
        year: 2025,
        batter_name: 'Yamada',
        event_type: 'plate_appearance',
        result_text_contains: 'ホームラン',
      },
    })
    expect(response.answer.resolved_player?.status).toMatch(/^(ambiguous|not_found)$/u)
    expect(response.answer.result_count).toBe(0)
    expect(calls.some((call) => call.method === 'searchEvents')).toBe(false)
  })

  it('04 nonexistent player: returns not_found with no invented DB results', async () => {
    const { service, calls } = createEvalService()

    const response = await service.answerQuestion('2025年に存在しない選手XYZが打ったホームラン一覧')

    expect(response.answer.resolved_player).toMatchObject({
      input: '存在しない選手XYZ',
      status: 'not_found',
    })
    expect(response.answer.result_count).toBe(0)
    expect(response.results.events).toHaveLength(0)
    expect(response.answer.summary).toContain('選手を特定できない')
    expect(calls.some((call) => call.method === 'searchEvents')).toBe(false)
  })

  it('05 multi-year range: executes a 2016-2026 search', async () => {
    const { service, calls } = createEvalService()

    const response = await service.answerQuestion('2016–2026横断でヤクルトの山田のホームラン一覧')

    expect(response.structured_query).toMatchObject({
      intent: 'search_events',
      filters: {
        year_from: 2016,
        year_to: 2026,
        team: 'ヤクルト',
        batter_name: '山田',
        batter_player_id: '91895133',
        event_type: 'plate_appearance',
        result_text_contains: 'ホームラン',
      },
    })
    expect(calls).toContainEqual({
      method: 'searchEvents',
      filters: response.structured_query.filters,
    })
    expect(response.answer.result_count).toBeGreaterThan(12)
  })

  it('06 pitcher query: resolves or safely handles pitcher ambiguity', async () => {
    const { service } = createEvalService()

    const response = await service.answerQuestion('2025年に森下から打ったホームラン一覧')

    expect(response.structured_query).toMatchObject({
      intent: 'search_events',
      filters: {
        year: 2025,
        pitcher_name: '森下',
        event_type: 'plate_appearance',
        result_text_contains: 'ホームラン',
      },
    })
    expect(response.answer.resolved_player?.input).toBe('森下')
    expect(response.answer.resolved_player?.status).toMatch(/^(resolved|ambiguous)$/u)
  })

  it('07 game detail: plans a game_detail query for Yakult vs Chunichi on 2025-04-05', async () => {
    const { service } = createEvalService()

    const response = await service.answerQuestion('2025年4月5日のヤクルト対中日の試合詳細')

    expect(response.structured_query).toMatchObject({
      intent: 'game_detail',
      filters: {
        game_date: '2025-04-05',
        team: 'ヤクルト',
      },
    })
    expect(response.results.gameDetails.map((row) => row.gameId)).toEqual(['r20250405s-d-02'])
    expect(response.answer.result_count).toBe(1)
  })

  it('08 roster: finds the Yakult starters for the identified 2025-04-05 game', async () => {
    const { service } = createEvalService()

    const response = await service.answerQuestion('2025年4月5日のヤクルト対中日のスタメン')

    expect(response.structured_query).toMatchObject({
      intent: 'search_roster',
      filters: {
        game_date: '2025-04-05',
        team: 'ヤクルト',
        starter: true,
      },
    })
    expect([...new Set(response.results.roster.map((row) => row.gameId))]).toEqual([
      'r20250405s-d-02',
    ])
    expect(response.answer.result_count).toBe(9)
  })

  it('09 aggregate phrasing: counts Yakult Yamada home runs from DB rows', async () => {
    const { service } = createEvalService()

    const response = await service.answerQuestion('2025年のヤクルト山田のホームラン数')

    expect(response.structured_query).toMatchObject({
      intent: 'aggregate_events',
      filters: {
        year: 2025,
        team: 'ヤクルト',
        batter_name: '山田',
        batter_player_id: '91895133',
        event_type: 'plate_appearance',
        result_text_contains: 'ホームラン',
      },
    })
    expect(response.results.aggregates[0]).toMatchObject({ total: 12 })
    expect(response.answer.summary).toContain('DB集計結果')
  })

  it('10 no matching grand slams: returns 0 DB-backed results without guessing', async () => {
    const { service } = createEvalService()

    const response = await service.answerQuestion(
      '2025年にヤクルトの山田が満塁ホームランを打った試合',
    )

    expect(response.structured_query).toMatchObject({
      intent: 'search_events',
      filters: {
        year: 2025,
        team: 'ヤクルト',
        batter_name: '山田',
        batter_player_id: '91895133',
        event_type: 'plate_appearance',
        result_text_contains: '満塁ホームラン',
      },
    })
    expect(response.answer.result_count).toBe(0)
    expect(response.results.events).toHaveLength(0)
    expect(response.answer.summary).toBe('条件に一致するイベントは見つかりませんでした。')
  })

  it('11 player affiliation: answers latest confirmed team instead of event list', async () => {
    const { service, calls } = createEvalService()

    const response = await service.answerQuestion('藤浪晋太郎の所属チームは')

    expect(response.structured_query).toMatchObject({
      intent: 'player_affiliation',
      filters: {
        player_name: '藤浪晋太郎',
        player_id: '12345678',
      },
    })
    expect(calls.some((call) => call.method === 'searchEvents')).toBe(false)
    expect(response.answer.result_count).toBeGreaterThan(0)
    expect(response.answer.summary).toContain('DB上の最新確認年（2026年）では、藤浪晋太郎は横浜DeNAベイスターズに所属しています。')
    expect(response.answer.summary).not.toContain('根拠:')
    expect(response.answer.summary).not.toContain('current_team_roster')
    expect(response.answer.summary).toContain('source: https://npb.jp/bis/teams/rst_db.html')
    expect(response.results.affiliations[0]).toMatchObject({
      year: 2026,
      team: '横浜DeNAベイスターズ',
      playerId: '12345678',
      sourceKind: 'bis_roster',
    })
  })

  it('12 player affiliation with year: answers that year only', async () => {
    const { service } = createEvalService()

    const response = await service.answerQuestion('2025年の藤浪晋太郎の所属チームは')

    expect(response.structured_query).toMatchObject({
      intent: 'player_affiliation',
      filters: {
        year: 2025,
        player_name: '藤浪',
        player_id: '12345678',
      },
    })
    expect(response.answer.summary).toContain('2025年では、藤浪晋太郎はDeNAに所属しています。')
  })

  it('13 player affiliation ambiguous surname: stops before affiliation lookup', async () => {
    const { service, calls } = createEvalService()

    const response = await service.answerQuestion('山田の所属チームは')

    expect(response.structured_query).toMatchObject({
      intent: 'player_affiliation',
      filters: {
        player_name: '山田',
      },
    })
    expect(response.answer.resolved_player).toMatchObject({ input: '山田', status: 'ambiguous' })
    expect(response.answer.result_count).toBe(0)
    expect(calls.some((call) => call.method === 'searchPlayerAffiliations')).toBe(false)
  })

  it('14 player affiliation team qualifier: resolves Yakult Yamada', async () => {
    const { service } = createEvalService()

    const response = await service.answerQuestion('ヤクルトの山田の所属チームは')

    expect(response.structured_query).toMatchObject({
      intent: 'player_affiliation',
      filters: {
        team: 'ヤクルト',
        player_name: '山田',
        player_id: '91895133',
      },
    })
    expect(response.answer.summary).toContain('DB上の最新確認年（2025年）では、山田はヤクルトに所属しています。')
  })

  it('15 player affiliation nonexistent player: returns not_found without guessing', async () => {
    const { service, calls } = createEvalService()

    const response = await service.answerQuestion('存在しない選手の所属チームは')

    expect(response.answer.resolved_player).toMatchObject({
      input: '存在しない選手',
      status: 'not_found',
    })
    expect(response.answer.result_count).toBe(0)
    expect(response.results.affiliations).toHaveLength(0)
    expect(calls.some((call) => call.method === 'searchPlayerAffiliations')).toBe(false)
  })

  it('16 full name affiliation: resolves Yakult Yamada Tetsuto by player_id', async () => {
    const { service } = createEvalService()

    const response = await service.answerQuestion('ヤクルトの山田哲人の所属チームは')

    expect(response.structured_query).toMatchObject({
      intent: 'player_affiliation',
      filters: {
        team: 'ヤクルト',
        player_name: '山田',
        player_id: '91895133',
      },
    })
    expect(response.answer.resolved_player).toMatchObject({
      input: '山田哲人',
      player_id: '91895133',
      status: 'resolved',
    })
    expect(response.answer.summary).toContain('山田哲人はヤクルトに所属しています。')
  })

  it('17 full name without team resolves only through player_id when surname is ambiguous', async () => {
    const { service } = createEvalService()

    const response = await service.answerQuestion('山田哲人の所属チームは')

    expect(response.structured_query).toMatchObject({
      intent: 'player_affiliation',
      filters: {
        player_name: '山田',
        player_id: '91895133',
      },
    })
    expect(response.answer.resolved_player).toMatchObject({
      input: '山田哲人',
      player_id: '91895133',
      status: 'resolved',
    })
  })


  it('18 unknown full name with ambiguous surname stops safely', async () => {
    const { service, calls } = createEvalService()

    const response = await service.answerQuestion('山田太郎の所属チームは')

    expect(response.answer.resolved_player?.input).toBe('山田太郎')
    expect(response.answer.resolved_player?.status).toMatch(/^(ambiguous|not_found)$/u)
    expect(response.answer.result_count).toBe(0)
    expect(calls.some((call) => call.method === 'searchPlayerAffiliations')).toBe(false)
  })

  it('19 nonexistent full name returns not_found', async () => {
    const { service } = createEvalService()

    const response = await service.answerQuestion('存在しないフルネームの所属チームは')

    expect(response.answer.resolved_player).toMatchObject({
      input: '存在しないフルネーム',
      status: 'not_found',
    })
  })

  it('20 nonexistent full name with ambiguous surname returns not_found', async () => {
    const { service } = createEvalService()

    const response = await service.answerQuestion('山田花子の所属チームは')

    expect(response.answer.resolved_player?.input).toBe('山田花子')
    // "山田花子" doesn't exist — surname-only "山田" candidates collapse to >1, so not_found
    expect(response.answer.resolved_player?.status).toBe('not_found')
    expect(response.answer.result_count).toBe(0)
  })

  it('21 current batting stats: routes season stats to BIS batting stats instead of event search', async () => {
    const { service, calls } = createEvalService()

    const response = await service.answerQuestion('ヤクルト村上の今年の成績')

    expect(response.structured_query).toMatchObject({
      intent: 'search_batting',
      filters: {
        year: currentJstYear(),
        team: 'ヤクルト',
        player_name: '村上 宗隆',
        player_id: '41845153',
      },
    })
    expect(calls.some((call) => call.method === 'searchEvents')).toBe(false)
    expect(response.answer.result_count).toBe(1)
    expect(response.results.events).toHaveLength(0)
    expect(response.results.batting[0]).toMatchObject({
      gameId: 'bis:2026:s:idb1',
      team: '東京ヤクルトスワローズ',
      playerName: '村上 宗隆',
      sourceKind: 'bis_batting',
      sourceUrl: 'https://npb.jp/bis/2026/stats/idb1_s.html',
    })
    expect(response.answer.summary).toContain('2026年の東京ヤクルトスワローズ 村上 宗隆の打撃成績です。')
    expect(response.answer.summary).toContain('本塁打12')
    expect(response.answer.summary).toContain('source: https://npb.jp/bis/2026/stats/idb1_s.html')
    expect(response.answer.summary).not.toContain('イベントは')
    expect(response.answer.summary).not.toContain('playbyplay-not-downloaded')
  })
})

function createEvalService() {
  const database = openDatabase()
  migrateDatabase(database)
  insertEvalFixture(database)

  const base = createSingleDatabaseQueryService(sqliteDatabaseToQuery(database))
  openServices.push(base)

  const calls: QueryCall[] = []
  const service = createChatService(recordQueryCalls(base, calls), {
    parseStructuredQueryFromMessage: async (message) =>
      parseStructuredQueryFromMessageStub(message),
  })

  return { service, calls }
}

type WritableDatabase = {
  prepare: (sql: string) => { run: (...params: Array<string | number | null>) => unknown }
}

function insertEvalFixture(database: WritableDatabase) {
  insertGame(database, {
    gameId: 'r20250405s-d-02',
    date: '2025-04-05',
    mmdd: '0405',
    away: '中日',
    home: 'ヤクルト',
  })
  insertRosterStarters(database, 'r20250405s-d-02')

  for (let index = 1; index <= 12; index += 1) {
    const day = String(index).padStart(2, '0')
    const gameId = `r202505${day}s-d-${day}`
    insertGame(database, {
      gameId,
      date: `2025-05-${day}`,
      mmdd: `05${day}`,
      away: '中日',
      home: 'ヤクルト',
    })
    insertHomeRun(database, {
      gameId,
      eventIndex: 1,
      sequence: 1,
      offenseTeam: 'ヤクルト',
      batterName: '山田',
      batterUrl: 'https://npb.jp/bis/players/91895133.html',
      pitcherName: index === 1 ? '森下' : '投手A',
      pitcherUrl: index === 1 ? 'https://npb.jp/bis/players/11111111.html' : null,
      resultText: 'レフトソロホームラン（打点1）',
    })
  }

  insertGame(database, {
    gameId: 'r20160501s-d-01',
    date: '2016-05-01',
    mmdd: '0501',
    away: '中日',
    home: 'ヤクルト',
  })
  insertHomeRun(database, {
    gameId: 'r20160501s-d-01',
    eventIndex: 1,
    sequence: 1,
    offenseTeam: 'ヤクルト',
    batterName: '山田',
    batterUrl: 'https://npb.jp/bis/players/91895133.html',
    pitcherName: '投手B',
    pitcherUrl: null,
    resultText: '左中間ソロホームラン（打点1）',
  })

  insertGame(database, {
    gameId: 'r20250701db-t-01',
    date: '2025-07-01',
    mmdd: '0701',
    away: '阪神',
    home: 'DeNA',
  })
  insertRosterEntry(database, {
    gameId: 'r20250701db-t-01',
    team: 'DeNA',
    playerName: '藤浪',
    playerUrl: 'https://npb.jp/bis/players/12345678.html',
    index: 1,
  })

  insertPlayerProfile(database, { playerId: '91895133', fullName: '山田 哲人' })
  insertPlayerProfile(database, { playerId: '99999999', fullName: '山田 大輔' })

  insertCurrentTeamRoster(database, {
    year: 2026,
    teamId: 'db',
    teamName: '横浜DeNAベイスターズ',
    playerName: '藤浪晋太郎',
    playerId: '12345678',
    sourceUrl: 'https://npb.jp/bis/teams/rst_db.html',
  })
  insertCurrentTeamRoster(database, {
    year: 2026,
    teamId: 's',
    teamName: '東京ヤクルトスワローズ',
    playerName: '村上 宗隆',
    playerId: '41845153',
    sourceUrl: 'https://npb.jp/bis/teams/rst_s.html',
  })
  insertPlayerBattingStats(database, {
    year: 2026,
    teamId: 's',
    teamName: '東京ヤクルトスワローズ',
    playerName: '村上 宗隆',
    playerId: null,
    sourceUrl: 'https://npb.jp/bis/2026/stats/idb1_s.html',
    values: {
      選手: '村上 宗隆',
      試合: '40',
      打席: '170',
      打数: '145',
      得点: '30',
      安打: '38',
      本塁打: '12',
      打点: '34',
      盗塁: '1',
      四球: '22',
      三振: '45',
      打率: '.262',
      出塁率: '.365',
      長打率: '.552',
    },
  })

  insertGame(database, {
    gameId: 'r20260401t-g-01',
    date: '2026-04-01',
    mmdd: '0401',
    away: '巨人',
    home: '阪神',
  })
  insertRosterEntry(database, {
    gameId: 'r20260401t-g-01',
    team: '阪神',
    playerName: '藤浪',
    playerUrl: 'https://npb.jp/bis/players/12345678.html',
    index: 1,
  })

  insertGame(database, {
    gameId: 'r20250520b-m-01',
    date: '2025-05-20',
    mmdd: '0520',
    away: 'ロッテ',
    home: 'オリックス',
  })
  insertHomeRun(database, {
    gameId: 'r20250520b-m-01',
    eventIndex: 1,
    sequence: 1,
    offenseTeam: 'オリックス',
    batterName: '山田',
    batterUrl: null,
    pitcherName: '投手C',
    pitcherUrl: null,
    resultText: 'ライトソロホームラン（打点1）',
  })
}

function insertGame(
  database: WritableDatabase,
  input: { gameId: string; date: string; mmdd: string; away: string; home: string },
) {
  database.prepare(
    `INSERT INTO games (
      schema_version, year, mmdd, game_id, canonical_url, date, date_label, venue,
      competition, matchup_text, game_number, status, start_time, end_time,
      duration_text, attendance, away_team_name, away_team_short_name,
      home_team_name, home_team_short_name, linescore_json, result_pitchers_json,
      batteries_json, home_runs_json, latest_order_json, fetched_at, loaded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    1,
    Number(input.date.slice(0, 4)),
    input.mmdd,
    input.gameId,
    `https://npb.jp/scores/${input.date.slice(0, 4)}/${input.mmdd}/${input.gameId}/`,
    input.date,
    input.date,
    '明治神宮野球場',
    '公式戦',
    `${input.away}対${input.home}`,
    1,
    '試合終了',
    '18:00',
    '21:00',
    '3時間00分',
    30000,
    input.away,
    input.away,
    input.home,
    input.home,
    '{}',
    '{}',
    '[]',
    '[]',
    '[]',
    `${input.date}T21:00:00+09:00`,
    `${input.date}T21:30:00+09:00`,
  )

  for (const sourceKey of ['index', 'playbyplay', 'box', 'roster'] as const) {
    database.prepare(
      `INSERT INTO source_snapshots (
        game_id, source_key, source_url, source_path, fetched_at, raw_path, structured_path
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      input.gameId,
      sourceKey,
      `https://npb.jp/scores/${input.date.slice(0, 4)}/${input.mmdd}/${input.gameId}/${sourceKey}.html`,
      `data/raw/${input.date.slice(0, 4)}/${input.mmdd}/${input.gameId}/${sourceKey}.html`,
      `${input.date}T21:00:00+09:00`,
      null,
      null,
    )
  }
}

function insertHomeRun(
  database: WritableDatabase,
  input: {
    gameId: string
    eventIndex: number
    sequence: number
    offenseTeam: string
    batterName: string
    batterUrl: string | null
    pitcherName: string
    pitcherUrl: string | null
    resultText: string
  },
) {
  database.prepare(
    `INSERT INTO events (
      game_id, event_index, sequence, inning, half, inning_label, offense_team,
      event_type, event_subtype, outs, bases, count_text, batter_role_prefix,
      batter_name, batter_url, batter_raw_text, pitcher_name, pitcher_url,
      runner_name, runner_url, result_text, result_runs_batted_in,
      result_links_json, event_attributes_json, raw_row_html, source_url, source_text
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.gameId,
    input.eventIndex,
    input.sequence,
    1,
    'bottom',
    '1回裏',
    input.offenseTeam,
    'plate_appearance',
    'standard',
    '0',
    'なし',
    '1-0',
    null,
    input.batterName,
    input.batterUrl,
    input.batterName,
    input.pitcherName,
    input.pitcherUrl,
    null,
    null,
    input.resultText,
    1,
    '[]',
    null,
    '<tr></tr>',
    null,
    input.resultText,
  )
}

function insertRosterStarters(database: WritableDatabase, gameId: string) {
  for (let index = 1; index <= 9; index += 1) {
    database.prepare(
      `INSERT INTO roster_entries (
        game_id, team, group_label, entry_index, number, player_name, player_url,
        throws, bats, raw_handedness, uniform_number, position, starter,
        batting_order, raw_text, source_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      gameId,
      'ヤクルト',
      'スタメン',
      index,
      String(index),
      index === 3 ? '山田' : `選手${index}`,
      index === 3 ? 'https://npb.jp/bis/players/91895133.html' : null,
      '右',
      '右',
      '右右',
      String(index),
      index === 1 ? '中' : '内',
      1,
      index,
      `(${index}) 選手${index}`,
      null,
    )
  }
}

function insertRosterEntry(
  database: WritableDatabase,
  input: {
    gameId: string
    team: string
    playerName: string
    playerUrl: string
    index: number
  },
) {
  database.prepare(
    `INSERT INTO roster_entries (
      game_id, team, group_label, entry_index, number, player_name, player_url,
      throws, bats, raw_handedness, uniform_number, position, starter,
      batting_order, raw_text, source_url
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.gameId,
    input.team,
    '投手',
    input.index,
    '19',
    input.playerName,
    input.playerUrl,
    '右',
    '右',
    '右右',
    '19',
    '投',
    null,
    null,
    input.playerName,
    null,
  )
}

function insertPlayerProfile(
  database: WritableDatabase,
  input: { playerId: string; fullName: string },
) {
  database.prepare(
    `INSERT OR IGNORE INTO player_profiles (player_id, full_name, source_url) VALUES (?, ?, ?)`,
  ).run(input.playerId, input.fullName, `https://npb.jp/bis/players/${input.playerId}.html`)
}

function insertCurrentTeamRoster(
  database: WritableDatabase,
  input: {
    year: number
    teamId: string
    teamName: string
    playerName: string
    playerId: string
    sourceUrl: string
  },
) {
  database.prepare(
    `INSERT INTO current_team_roster (
      year, team_id, team_name, player_key, player_id, player_name, position,
      uniform_number, bats, throws, source_url
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.year,
    input.teamId,
    input.teamName,
    input.playerId,
    input.playerId,
    input.playerName,
    '投手',
    '19',
    '右',
    '右',
    input.sourceUrl,
  )
}

function insertPlayerBattingStats(
  database: WritableDatabase,
  input: {
    year: number
    teamId: string
    teamName: string
    playerName: string
    playerId: string | null
    sourceUrl: string
    values: Record<string, string>
  },
) {
  database.prepare(
    `INSERT INTO player_batting_stats (
      year, team_id, team_name, player_key, player_id, player_name,
      row_index, values_json, source_url
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.year,
    input.teamId,
    input.teamName,
    input.playerId ?? input.playerName,
    input.playerId,
    input.playerName,
    1,
    JSON.stringify(input.values),
    input.sourceUrl,
  )
}

function recordQueryCalls(service: ChatQueryService, calls: QueryCall[]): ChatQueryService {
  return {
    ...service,
    searchEvents: async (filters) => {
      calls.push({ method: 'searchEvents', filters })
      return service.searchEvents(filters)
    },
    searchGames: async (filters) => {
      calls.push({ method: 'searchGames', filters })
      return service.searchGames(filters)
    },
    searchBattingLines: async (filters) => {
      calls.push({ method: 'searchBattingLines', filters })
      return service.searchBattingLines(filters)
    },
    searchPitchingLines: async (filters) => {
      calls.push({ method: 'searchPitchingLines', filters })
      return service.searchPitchingLines(filters)
    },
    searchRosterEntries: async (filters) => {
      calls.push({ method: 'searchRosterEntries', filters })
      return service.searchRosterEntries(filters)
    },
    searchPlayerAffiliations: async (filters) => {
      calls.push({ method: 'searchPlayerAffiliations', filters })
      return service.searchPlayerAffiliations(filters)
    },
    searchGameDetails: async (filters) => {
      calls.push({ method: 'searchGameDetails', filters })
      return service.searchGameDetails(filters)
    },
    aggregateBattingLines: async (filters) => {
      calls.push({ method: 'aggregateBattingLines', filters })
      return service.aggregateBattingLines(filters)
    },
    aggregatePitchingLines: async (filters) => {
      calls.push({ method: 'aggregatePitchingLines', filters })
      return service.aggregatePitchingLines(filters)
    },
    aggregateEvents: async (filters) => {
      calls.push({ method: 'aggregateEvents', filters })
      return service.aggregateEvents(filters)
    },
    searchPlayerCandidates: async (filters) => {
      calls.push({ method: 'searchPlayerCandidates', filters })
      return service.searchPlayerCandidates(filters)
    },
    listSourceSnapshotsByGameIds: async (gameIds) => {
      calls.push({ method: 'listSourceSnapshotsByGameIds', filters: gameIds })
      return service.listSourceSnapshotsByGameIds(gameIds)
    },
  }
}
