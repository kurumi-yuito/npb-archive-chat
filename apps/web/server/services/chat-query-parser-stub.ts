import {
  chatStructuredQuerySchema,
  type ChatStructuredQuery,
  type SearchEventsFilters,
  type SearchBattingLinesFilters,
  type GameDetailFilters,
  type SearchGamesFilters,
  type SearchPitchingLinesFilters,
  type SearchRosterEntriesFilters,
  type PlayerAffiliationFilters,
} from '@npb/schemas'

const eventSubtypeRules: Array<{
  pattern: RegExp
  event_type: SearchEventsFilters['event_type']
  event_subtype: SearchEventsFilters['event_subtype']
}> = [
  { pattern: /代打/u, event_type: 'plate_appearance', event_subtype: 'pinch_hitter' },
  { pattern: /盗塁/u, event_type: 'runner_event', event_subtype: 'stolen_base' },
  { pattern: /先発投手/u, event_type: 'game_note', event_subtype: 'starting_pitcher' },
  { pattern: /投手交代/u, event_type: 'substitution', event_subtype: 'pitching_change' },
]

const homeRunPattern = /本塁打|ホームラン|\bHR\b|ＨＲ/u

export function parseStructuredQueryFromMessageStub(message: string): ChatStructuredQuery {
  const normalized = message.trim()
  const explicit = extractExplicitAssignments(normalized)

  const inferredIntent = inferIntent(normalized, explicit.intent)
  if (inferredIntent === 'search_games') {
    return chatStructuredQuerySchema.parse({
      intent: 'search_games',
      filters: buildGamesFilters(normalized, explicit),
    })
  }

  if (inferredIntent === 'search_batting') {
    return chatStructuredQuerySchema.parse({
      intent: 'search_batting',
      filters: buildBattingFilters(normalized, explicit),
    })
  }

  if (inferredIntent === 'search_pitching') {
    return chatStructuredQuerySchema.parse({
      intent: 'search_pitching',
      filters: buildPitchingFilters(normalized, explicit),
    })
  }

  if (inferredIntent === 'search_roster') {
    return chatStructuredQuerySchema.parse({
      intent: 'search_roster',
      filters: buildRosterFilters(normalized, explicit),
    })
  }

  if (inferredIntent === 'player_affiliation') {
    return chatStructuredQuerySchema.parse({
      intent: 'player_affiliation',
      filters: buildPlayerAffiliationFilters(normalized, explicit),
    })
  }

  if (inferredIntent === 'game_detail') {
    return chatStructuredQuerySchema.parse({
      intent: 'game_detail',
      filters: buildGameDetailFilters(normalized, explicit),
    })
  }

  if (inferredIntent === 'aggregate_batting') {
    return chatStructuredQuerySchema.parse({
      intent: 'aggregate_batting',
      filters: buildBattingFilters(normalized, explicit),
    })
  }

  if (inferredIntent === 'aggregate_pitching') {
    return chatStructuredQuerySchema.parse({
      intent: 'aggregate_pitching',
      filters: buildPitchingFilters(normalized, explicit),
    })
  }

  if (inferredIntent === 'aggregate_events') {
    return chatStructuredQuerySchema.parse({
      intent: 'aggregate_events',
      filters: buildEventsFilters(normalized, explicit),
    })
  }

  return chatStructuredQuerySchema.parse({
    intent: 'search_events',
    filters: buildEventsFilters(normalized, explicit),
  })
}

function inferIntent(
  message: string,
  explicitIntent: string | undefined,
): ChatStructuredQuery['intent'] {
  if (explicitIntent === 'games' || explicitIntent === 'search_games') {
    return 'search_games'
  }
  if (explicitIntent === 'batting' || explicitIntent === 'search_batting') {
    return 'search_batting'
  }
  if (explicitIntent === 'pitching' || explicitIntent === 'search_pitching') {
    return 'search_pitching'
  }
  if (explicitIntent === 'roster' || explicitIntent === 'search_roster') {
    return 'search_roster'
  }
  if (
    explicitIntent === 'player_affiliation' ||
    explicitIntent === 'search_player_team' ||
    explicitIntent === 'affiliation'
  ) {
    return 'player_affiliation'
  }
  if (explicitIntent === 'game_detail') {
    return 'game_detail'
  }
  if (explicitIntent === 'aggregate_batting') {
    return 'aggregate_batting'
  }
  if (explicitIntent === 'aggregate_pitching') {
    return 'aggregate_pitching'
  }
  if (explicitIntent === 'aggregate_events') {
    return 'aggregate_events'
  }
  if (explicitIntent === 'events' || explicitIntent === 'search_events') {
    return 'search_events'
  }

  if (/集計|合計|通算/u.test(message) && /投手|登板|奪三振|投球回/u.test(message)) {
    return 'aggregate_pitching'
  }
  if (/集計|合計|通算/u.test(message) && /打撃|打席|打数|安打|打点/u.test(message)) {
    return 'aggregate_batting'
  }
  if (/(?:集計|合計|通算|数)/u.test(message) && /イベント|本塁打|ホームラン|\bHR\b|ＨＲ|盗塁|代打/u.test(message)) {
    return 'aggregate_events'
  }
  if (/スタメン|ロスター|登録メンバー|出場選手/u.test(message)) {
    return 'search_roster'
  }
  if (/所属チーム|どこのチーム|所属|在籍|チームは/u.test(message)) {
    return 'player_affiliation'
  }
  if (/試合詳細|スコア/u.test(message) && /game[_ ]?id|対|vs|VS|\d{4}[-/年]/u.test(message)) {
    return 'game_detail'
  }
  if (/試合/u.test(message) && /について|教えて|詳細|結果|スコア/u.test(message) && (matchDate(message) || matchVenue(message))) {
    return 'game_detail'
  }
  if (/成績/u.test(message) && /投手|登板|奪三振|投球回|防御率|セーブ/u.test(message)) {
    return 'search_pitching'
  }
  if (/評価|調子|状態|最近どう|どう思/u.test(message) && /投手|登板|奪三振|投球回|防御率|セーブ/u.test(message)) {
    return 'search_pitching'
  }
  if (/評価|調子|状態|最近どう|どう思/u.test(message) && !/イベント/u.test(message)) {
    return 'search_batting'
  }
  if (/成績|打席結果|打撃成績|打数|安打|打点|打率|出塁率|長打率|本塁打一覧|ホームラン一覧|\bHR\b|ＨＲ/u.test(message) && !/イベント/u.test(message)) {
    if (homeRunPattern.test(message)) {
      return 'search_events'
    }
    return 'search_batting'
  }
  if (/投手成績|登板|奪三振|投球回|pitching/u.test(message)) {
    return 'search_pitching'
  }
  if (/試合一覧|試合を教えて|games/u.test(message) && !/イベント|代打|盗塁|投手/u.test(message)) {
    return 'search_games'
  }
  return 'search_events'
}

function buildGamesFilters(
  message: string,
  explicit: Record<string, string>,
): SearchGamesFilters {
  return {
    ...matchYearRange(message, explicit),
    game_date: explicit.game_date ?? matchDate(message),
    game_id: explicit.game_id ?? matchGameId(message),
    venue: explicit.venue ?? matchVenue(message),
    team:
      explicit.team ??
      matchValue(message, /(?:team|チーム)(?:は|=|:)\s*([^\s、。]+)/u),
    limit: toInt(explicit.limit),
  }
}

function buildBattingFilters(
  message: string,
  explicit: Record<string, string>,
): SearchBattingLinesFilters {
  const evaluationPhrase =
    matchValue(message, /(.+?)の最近(?:の)?(?:評価|調子|状態)/u) ??
    matchValue(message, /(.+?)(?:の評価|の調子|の状態|はどう|をどう思)/u)
  const battingPhrase =
    matchValue(message, /(?:\d{4}年(?:に|の)?|今年(?:の)?|今季(?:の)?|横断で)?(.+?)(?:の今年の成績|の今季の成績|の成績|の打席結果|の打撃成績|の安打|の打点)/u) ??
    matchValue(message, /(?:\d{4}年(?:に|の)?|今年(?:の)?|今季(?:の)?|横断で)?(.+?)(?:が打った本塁打一覧)/u)
  const isEvaluation = /評価|調子|状態|最近どう|どう思/u.test(message)
  return {
    ...matchYearRange(message, explicit),
    game_date: explicit.game_date ?? matchDate(message),
    player_name:
      explicit.player_name ??
      explicit.batter_name ??
      explicit.batter ??
      extractPlayerNameFromPhrase(evaluationPhrase) ??
      extractPlayerNameFromPhrase(battingPhrase),
    team:
      explicit.team ??
      matchValue(message, /(?:team|チーム)(?:は|=|:)\s*([^\s、。]+)/u) ??
      (isEvaluation ? undefined : extractTeamQualifierFromPhrase(battingPhrase)),
    result_text_contains: explicit.result_text_contains,
    recent: isEvaluation ? true : undefined,
    limit: toInt(explicit.limit),
  }
}

function buildPitchingFilters(
  message: string,
  explicit: Record<string, string>,
): SearchPitchingLinesFilters {
  const pitcherFromPhrase = extractPlayerNameFromPhrase(
    matchValue(message, /(.+?)の投手成績/u) ??
    matchValue(message, /(.+?)の最近(?:の)?(?:評価|調子|状態)/u) ??
    matchValue(message, /(.+?)(?:投手)?(?:の評価|の調子|の状態|はどう|をどう思)/u),
  )?.replace(/投手$/u, '')

  return {
    ...matchYearRange(message, explicit),
    game_date: explicit.game_date ?? matchDate(message),
    pitcher_name:
      explicit.pitcher_name ??
      explicit.pitcher ??
      matchValue(message, /(?:投手|pitcher)(?:は|=|:)\s*([^\s、。]+)/u) ??
      pitcherFromPhrase ??
      extractPlayerNameFromPhrase(matchValue(message, /(?:\d{4}年(?:の)?|横断で)?(.+?)登板試合/u)),
    team:
      explicit.team ??
      matchValue(message, /(?:team|チーム)(?:は|=|:)\s*([^\s、。]+)/u),
    recent: /評価|調子|状態|最近どう|どう思/u.test(message) ? true : undefined,
    limit: toInt(explicit.limit),
  }
}

function buildEventsFilters(
  message: string,
  explicit: Record<string, string>,
): SearchEventsFilters {
  const inningHalf = matchInningHalf(message)
  const subtypeRule = eventSubtypeRules.find((rule) => rule.pattern.test(message))
  const batterFromPhrase = extractPlayerNameFromPhrase(
    matchValue(message, /(.+?)が代打/u),
  )
  const batterFromHomeRunPhrase = extractPlayerNameFromPhrase(
    matchValue(message, /(?:\d{4}年(?:に|の)?|横断で)?(.+?)が(?:満塁)?(?:本塁打|ホームラン|HR|ＨＲ)を打った(?:一覧|試合)?/u) ??
    matchValue(message, /(?:\d{4}年(?:に|の)?|横断で)?(.+?)が(?:満塁)?打った(?:本塁打|ホームラン|HR|ＨＲ)(?:一覧|試合)?/u) ??
    matchValue(message, /(?:\d{4}年(?:に|の)?|横断で)?(.+?)の(?:本塁打|ホームラン|HR|ＨＲ)(?:一覧|数)?/u),
  )
  const teamFromHomeRunPhrase = extractTeamQualifierFromPhrase(
    matchValue(message, /(?:\d{4}年(?:に|の)?|横断で)?(.+?)が(?:満塁)?(?:本塁打|ホームラン|HR|ＨＲ)を打った(?:一覧|試合)?/u) ??
    matchValue(message, /(?:\d{4}年(?:に|の)?|横断で)?(.+?)が(?:満塁)?打った(?:本塁打|ホームラン|HR|ＨＲ)(?:一覧|試合)?/u) ??
    matchValue(message, /(?:\d{4}年(?:に|の)?|横断で)?(.+?)の(?:本塁打|ホームラン|HR|ＨＲ)(?:一覧|数)?/u),
  )
  const runnerFromPhrase = extractPlayerNameFromPhrase(
    matchValue(message, /(.+?)が盗塁/u),
  )
  const playerFromEventSearchPhrase = extractPlayerNameFromPhrase(
    matchValue(message, /(?:\d{4}(?:年)?\s*[–—-]\s*\d{4}(?:年)?横断で|\d{4}年(?:の)?|横断で)?(.+?)のイベント検索/u),
  )

  return {
    ...matchYearRange(message, explicit),
    game_date: explicit.game_date ?? matchDate(message),
    inning: toInt(explicit.inning) ?? inningHalf.inning,
    half:
      (explicit.half as SearchEventsFilters['half'] | undefined) ??
      inningHalf.half,
    team:
      explicit.team ??
      matchValue(message, /(?:team|チーム)(?:は|=|:)\s*([^\s、。]+)/u) ??
      teamFromHomeRunPhrase,
    batter_name:
      explicit.batter_name ??
      explicit.batter ??
      matchValue(message, /(?:打者|batter)(?:は|=|:)\s*([^\s、。]+)/u) ??
      batterFromPhrase ??
      batterFromHomeRunPhrase,
    pitcher_name:
      explicit.pitcher_name ??
      explicit.pitcher ??
      matchValue(message, /(?:投手|pitcher)(?:は|=|:)\s*([^\s、。]+)/u) ??
      extractPlayerNameFromPhrase(matchValue(message, /(.+?)から打った(?:本塁打|ホームラン|HR|ＨＲ)一覧/u)),
    runner_name:
      explicit.runner_name ??
      explicit.runner ??
      matchValue(message, /(?:走者|runner)(?:は|=|:)\s*([^\s、。]+)/u) ??
      runnerFromPhrase,
    event_type:
      (explicit.event_type as SearchEventsFilters['event_type'] | undefined) ??
      (homeRunPattern.test(message) ? 'plate_appearance' : undefined) ??
      subtypeRule?.event_type,
    event_subtype:
      (explicit.event_subtype as SearchEventsFilters['event_subtype'] | undefined) ??
      subtypeRule?.event_subtype,
    result_text_contains:
      explicit.result_text_contains ??
      (/満塁/u.test(message) && homeRunPattern.test(message)
        ? '満塁ホームラン'
        : homeRunPattern.test(message)
          ? 'ホームラン'
          : undefined),
    player_name: explicit.player_name ?? playerFromEventSearchPhrase,
    limit: toInt(explicit.limit),
  }
}

function buildRosterFilters(
  message: string,
  explicit: Record<string, string>,
): SearchRosterEntriesFilters {
  return {
    ...matchYearRange(message, explicit),
    game_id: explicit.game_id ?? matchGameId(message),
    game_date: explicit.game_date ?? matchDate(message),
    team:
      explicit.team ??
      matchValue(message, /(?:team|チーム)(?:は|=|:)\s*([^\s、。]+)/u) ??
      matchTeamFromMatchup(message),
    player_name:
      explicit.player_name ??
      (matchGameId(message) || matchTeamFromMatchup(message)
        ? undefined
        : extractPlayerNameFromPhrase(matchValue(message, /(?:\d{4}年(?:の)?|横断で)?(.+?)(?:のスタメン|のロスター)/u))),
    starter: /スタメン/u.test(message) ? true : undefined,
    limit: toInt(explicit.limit),
  }
}

function buildPlayerAffiliationFilters(
  message: string,
  explicit: Record<string, string>,
): PlayerAffiliationFilters {
  const phrase =
    matchValue(message, /(?:\d{4}年(?:の)?|横断で)?(.+?)(?:の所属チーム|はどこのチーム|はどのチーム|は所属|の所属|の在籍|は在籍|のチームは|チームは)/u) ??
    matchValue(message, /(?:所属|在籍|チーム)(?:は|=|:)\s*([^\s、。]+)/u)
  return {
    ...matchYearRange(message, explicit),
    team:
      explicit.team ??
      matchValue(message, /(?:team|チーム)(?:=|:)\s*([^\s、。]+)/u) ??
      extractTeamQualifierFromPhrase(phrase),
    player_name:
      explicit.player_name ??
      explicit.batter_name ??
      explicit.pitcher_name ??
      extractPlayerNameFromPhrase(phrase) ??
      extractPlayerNameFromPhrase(message.replace(/(?:所属チーム|どこのチーム|所属|在籍|チームは).*/u, '')),
    limit: toInt(explicit.limit),
  }
}

function buildGameDetailFilters(
  message: string,
  explicit: Record<string, string>,
): GameDetailFilters {
  return {
    ...matchYearRange(message, explicit),
    game_id: explicit.game_id ?? matchGameId(message),
    game_date: explicit.game_date ?? matchDate(message),
    venue: explicit.venue ?? matchVenue(message),
    team:
      explicit.team ??
      matchValue(message, /(?:team|チーム)(?:は|=|:)\s*([^\s、。]+)/u) ??
      matchTeamFromMatchup(message),
    player_name: explicit.player_name,
    limit: toInt(explicit.limit),
  }
}

function extractExplicitAssignments(message: string): Record<string, string> {
  const assignments: Record<string, string> = {}
  const regex = /\b([a-z_]+)=/giu

  for (const match of message.matchAll(regex)) {
    const key = match[1]?.toLowerCase()
    const start = match.index === undefined ? -1 : match.index + match[0].length
    if (!key || start < 0) {
      continue
    }

    const rest = message.slice(start)
    const valueEnd = findExplicitValueEnd(rest)
    const rawValue = rest.slice(0, valueEnd).trim()
    const normalizedValue = normalizeExplicitAssignmentValue(key, rawValue)

    if (normalizedValue) {
      assignments[key] = normalizedValue
    }
  }

  return assignments
}

function matchDate(message: string): string | undefined {
  if (/一昨日/u.test(message)) {
    return currentJstDateOffset(-2)
  }
  if (/昨日/u.test(message)) {
    return currentJstDateOffset(-1)
  }
  if (/今日|本日/u.test(message)) {
    return currentJstDateOffset(0)
  }
  if (/明日/u.test(message)) {
    return currentJstDateOffset(1)
  }

  const match =
    message.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/u) ??
    message.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/u)
  if (!match) {
    return undefined
  }

  const [, year, month, day] = match
  return `${year}-${month?.padStart(2, '0')}-${day?.padStart(2, '0')}`
}

function matchYearRange(
  message: string,
  explicit: Record<string, string>,
): { year?: number; year_from?: number; year_to?: number } {
  if (explicit.year) {
    return { year: toInt(explicit.year) }
  }
  const explicitFrom = toInt(explicit.year_from)
  const explicitTo = toInt(explicit.year_to)
  if (explicitFrom || explicitTo) {
    return { year_from: explicitFrom, year_to: explicitTo }
  }
  const range = message.match(/(\d{4})\s*[–—-]\s*(\d{4})/u)
  if (range?.[1] && range[2]) {
    return { year_from: Number(range[1]), year_to: Number(range[2]) }
  }
  const year = message.match(/(\d{4})年/u)
  if (year?.[1] && !matchDate(message)) {
    return { year: Number(year[1]) }
  }
  if (/(?:今年|今季)/u.test(message) && !matchDate(message)) {
    return { year: currentJstYear() }
  }
  return {}
}

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

function matchInningHalf(
  message: string,
): { inning: number | undefined; half: SearchEventsFilters['half'] | undefined } {
  const match = message.match(/(\d{1,2})回([表裏])/u)
  if (!match) {
    return { inning: undefined, half: undefined }
  }

  return {
    inning: Number.parseInt(match[1] ?? '', 10),
    half: match[2] === '表' ? 'top' : 'bottom',
  }
}

function matchValue(message: string, pattern: RegExp): string | undefined {
  const match = message.match(pattern)
  const value = match?.[1]?.trim()
  return value ? value : undefined
}

function matchGameId(message: string): string | undefined {
  return matchValue(message, /game[_ ]?id[:=]\s*([rf]\d{8}[a-z0-9]+-[a-z0-9]+-\d{2})/iu)
}

function matchVenue(message: string): string | undefined {
  return [
    '東京ドーム',
    '神宮',
    '横浜',
    'バンテリンドーム',
    '京セラD大阪',
    '甲子園',
    'マツダスタジアム',
    'エスコンF',
    'ZOZOマリン',
    'ベルーナドーム',
    '楽天モバイル',
    'みずほPayPay',
  ].find((venue) => message.includes(venue))
}

function matchTeamFromMatchup(message: string): string | undefined {
  return matchValue(message, /(?:\d{4}年\d{1,2}月\d{1,2}日の?)?(.+?)(?:対|vs|VS).+?(?:の試合詳細|のスタメン|のロスター|$)/u)
}

function toInt(value: string | undefined): number | undefined {
  if (!value) {
    return undefined
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? undefined : parsed
}

function extractPlayerNameFromPhrase(value: string | undefined): string | undefined {
  if (!value) {
    return undefined
  }

  const trimmed = stripLeadingTeamQualifier(stripLeadingTimeQualifier(value.trim()))
  if (!trimmed) {
    return undefined
  }

  const segments = trimmed
    .split(/[のにではをと、。,\s]+/u)
    .map((segment) => segment.trim())
    .filter(Boolean)

  const lastSegment = segments.at(-1)
  return lastSegment || trimmed
}

function extractTeamQualifierFromPhrase(value: string | undefined): string | undefined {
  if (!value) {
    return undefined
  }
  const trimmed = stripLeadingTimeQualifier(value.trim())
  const explicit = trimmed.match(/^(.+?)の.+/u)
  if (explicit?.[1]) {
    return explicit[1].trim()
  }
  return matchKnownTeamPrefix(trimmed)
}

function stripLeadingTeamQualifier(value: string): string {
  const explicit = value.match(/^.+?の(.+)/u)
  if (explicit?.[1]) {
    return explicit[1].trim()
  }

  const team = matchKnownTeamPrefix(value)
  return team ? value.slice(team.length).trim() : value
}

function stripLeadingTimeQualifier(value: string): string {
  return value
    .replace(/^\d{4}年(?:に|の)?/u, '')
    .replace(/^\d{4}\s*[–—-]\s*\d{4}(?:年)?横断で/u, '')
    .replace(/^横断で/u, '')
}

function matchKnownTeamPrefix(value: string): string | undefined {
  return [
    'ヤクルト',
    '東京ヤクルト',
    '中日',
    '巨人',
    '読売',
    '阪神',
    '広島',
    'DeNA',
    '横浜',
    'オリックス',
    'ロッテ',
    '西武',
    'ソフトバンク',
    '日本ハム',
    '楽天',
  ].find((team) => value.startsWith(team) && value.length > team.length)
}

function findExplicitValueEnd(value: string): number {
  const candidates = [
    value.length,
    findIndex(value, /\b[a-z_]+=/iu),
    findIndex(value, /\s+[、。,.!?！？]/u),
    findIndex(value, /\s+(?:の(?:代打|盗塁|投手成績|イベント|試合)|を(?:教えて|見せて)|で(?:教えて|見せて)|したイベント|したプレー)/u),
    findIndex(value, /(?:が(?:代打|盗塁)|の(?:投手成績|イベント|試合)|を(?:教えて|見せて)|で(?:教えて|見せて)|したイベント|したプレー)/u),
    findIndex(value, /\s+[がをにでは]\S/u),
  ].filter((index) => index >= 0)

  return Math.min(...candidates)
}

function findIndex(value: string, pattern: RegExp): number {
  const match = pattern.exec(value)
  return match?.index ?? -1
}

function normalizeExplicitAssignmentValue(key: string, value: string): string | undefined {
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }

  if (key === 'game_id') {
    return trimmed.match(/^([rf]\d{8}[a-z0-9]+-[a-z0-9]+-\d{2})/iu)?.[1]
  }

  if (isNameLikeExplicitKey(key)) {
    const compact = trimmed.replace(/[ \u3000\t\r\n]+/gu, '')
    return compact || undefined
  }

  return trimmed
}

function isNameLikeExplicitKey(key: string): boolean {
  return [
    'team',
    'batter_name',
    'pitcher_name',
    'runner_name',
    'player_name',
    'batter',
    'pitcher',
    'runner',
    'venue',
  ].includes(key)
}
