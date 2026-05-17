import { access, appendFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import {
  DISCOVERY_GAME_ID_REGEX,
  discoveryYearSchema,
  type DiscoveryCompetition,
  type DiscoveryGame,
  type DiscoveryListingStatus,
  type DiscoveryListingType,
  type DiscoveryYear,
  type RawPageKey,
} from '@npb/schemas'

const REGULAR_CALENDAR_ROOT = 'https://npb.jp/bis/eng'

const TEAM_CODE_BY_LABEL: Record<string, string> = {
  Chunichi: 'd',
  DeNA: 'db',
  Hanshin: 't',
  Hiroshima: 'c',
  Lotte: 'm',
  'Nippon-Ham': 'f',
  Oisix: 'a',
  ORIX: 'b',
  Rakuten: 'e',
  Seibu: 'l',
  SoftBank: 'h',
  Yakult: 's',
  Yomiuri: 'g',
  HAYATE: 'v',
}

const BLOCKED_LINE_PREFIXES = new Set([
  'CENTRAL LEAGUE',
  'PACIFIC LEAGUE',
  'FARM LEAGUE',
  'East Division',
  'Central Division',
  'West Division',
  '(Int)',
  'Interleague',
  'Regular Season (Scores)',
  'Regular Season (Schedules)',
  'Farm League (Scores)',
  'Farm League (Schedules)',
  'Prev. Games',
  'Next Games',
])

const RAW_PAGE_FILE_NAMES: Record<RawPageKey, string> = {
  index: 'index.html',
  playByPlay: 'playbyplay.html',
  box: 'box.html',
  roster: 'roster.html',
}

const DEFAULT_DOWNLOAD_DELAY_MS = 1000
const DEFAULT_USER_AGENT = 'npb-archive-chat/0.0.0 (+https://github.com/)'

/** discovery（カレンダー・日別 bis 英語版）用。素の Node fetch だと日別リンクが欠けた HTML が返ることがあるためブラウザ相当に寄せる */
const DISCOVERY_FETCH_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
}

const CALENDAR_DEBUG_PREVIEW_CHARS = 500

function isCalendarHtmlDebugEnabled(): boolean {
  const v = process.env.NPB_CRAWLER_DEBUG_CALENDAR
  return v === '1' || v === 'true' || v === 'yes'
}

function isDailyParseDebugEnabled(): boolean {
  const v = process.env.NPB_CRAWLER_DEBUG_DAILY
  return v === '1' || v === 'true' || v === 'yes'
}

function isGameIdDebugEnabled(): boolean {
  const v = process.env.NPB_CRAWLER_DEBUG_GAMEID
  return v === '1' || v === 'true' || v === 'yes'
}

function warnInvalidDiscoveryGameIdsBeforeParse(games: DiscoveryGame[]): void {
  if (!isGameIdDebugEnabled()) {
    return
  }

  const invalid = games.filter((game) => !DISCOVERY_GAME_ID_REGEX.test(game.gameId))
  if (invalid.length === 0) {
    return
  }

  console.warn(
    `[npb-crawler][NPB_CRAWLER_DEBUG_GAMEID] invalid gameId count=${invalid.length} samples=${JSON.stringify(
      invalid.slice(0, 15).map((game) => ({
        gameId: game.gameId,
        date: game.date,
        homeCode: game.homeTeam.code,
        awayCode: game.awayTeam.code,
        gameNumber: game.gameNumber,
      })),
    )}`,
  )
}

/**
 * npb.jp `scores/{year}/{mmdd}/{slug}/` のディレクトリ名（ホーム・ビジター実順・当日通番）。
 */
function buildNpbScoresPathSlug(
  homeCode: string,
  awayCode: string,
  occurrenceWithinDayCard: number,
): string {
  const homeSlug = homeCode.toLowerCase().replace(/[^a-z0-9]/g, '')
  const awaySlug = awayCode.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (!homeSlug || !awaySlug) {
    throw new Error(
      `Cannot build npb scores slug from empty team slug (homeCode=${homeCode} awayCode=${awayCode})`,
    )
  }

  if (!/^[a-z0-9]+$/.test(homeSlug) || !/^[a-z0-9]+$/.test(awaySlug)) {
    throw new Error(
      `Discovery team slug must match [a-z0-9]+ (home=${homeSlug} away=${awaySlug})`,
    )
  }

  if (
    !Number.isInteger(occurrenceWithinDayCard) ||
    occurrenceWithinDayCard < 1 ||
    occurrenceWithinDayCard > 99
  ) {
    throw new Error(
      `Scores path suffix must be 01-99; got occurrence=${occurrenceWithinDayCard} for ${homeSlug}-${awaySlug}`,
    )
  }

  return `${homeSlug}-${awaySlug}-${String(occurrenceWithinDayCard).padStart(2, '0')}`
}

/**
 * discovery JSON / raw ディレクトリ名。`@npb/schemas` の DISCOVERY_GAME_ID_REGEX と一致必須。
 * `{r|f}{YYYYMMDD}{home}-{away}-{NN}` — 暦日・regular/farm・同一カード（ソート済みペア）ごとに NN を 01 から振り直す。
 * NN はその日その competition での当該カード通算（同一日ダブルヘッダ等で最大でも数十程度）。
 */
function buildDiscoveryStorageGameId(options: {
  competition: DiscoveryCompetition
  dateIso: string
  homeCode: string
  awayCode: string
  occurrenceWithinDayCard: number
}): string {
  const prefix = options.competition === 'regular' ? 'r' : 'f'
  const dateCompact = options.dateIso.replace(/-/g, '')
  if (!/^\d{8}$/.test(dateCompact)) {
    throw new Error(`Invalid ISO date for discovery gameId: ${options.dateIso}`)
  }

  const npbSlug = buildNpbScoresPathSlug(
    options.homeCode,
    options.awayCode,
    options.occurrenceWithinDayCard,
  )
  const gameId = `${prefix}${dateCompact}${npbSlug}`
  if (!DISCOVERY_GAME_ID_REGEX.test(gameId)) {
    throw new Error(`Internal error: built invalid discovery gameId: ${gameId}`)
  }

  return gameId
}

function logCalendarFetchDebug(
  calendarUrl: string,
  html: string,
  year: number,
  competition: DiscoveryCompetition,
  parsed: ReturnType<typeof parseCalendarPage>,
): void {
  if (!isCalendarHtmlDebugEnabled()) {
    return
  }

  const normalizedHtml = normalizeHtml(html)
  const resolved = extractResolvedUrls(normalizedHtml, calendarUrl)
  const gamesResolved = resolved.filter((u) => u.includes(`/bis/eng/${year}/games/`))
  const preview = html.slice(0, CALENDAR_DEBUG_PREVIEW_CHARS).replace(/\s+/g, ' ')
  const gamesHrefInRaw = (html.match(/href\s*=\s*["'][^"']*\/games\/[^"']*["']/gi) ?? []).length

  const payload = {
    calendarUrl,
    competition,
    htmlLength: html.length,
    htmlPreviewFirstChars: preview,
    rawHtmlHrefToGamesCount: gamesHrefInRaw,
    resolvedHrefTotal: resolved.length,
    resolvedUrlsUnderGames: gamesResolved.length,
    sampleResolvedGameUrls: gamesResolved.slice(0, 10),
    parsedDailyPageCount: parsed.dailyPages.length,
    sampleParsedDailyUrls: parsed.dailyPages.slice(0, 5).map((p) => p.url),
    nextCalendarPageUrlCount: parsed.nextCalendarPageUrls.length,
    sampleNextCalendarUrls: parsed.nextCalendarPageUrls.slice(0, 5),
  }

  console.warn(`[npb-crawler][NPB_CRAWLER_DEBUG_CALENDAR] ${JSON.stringify(payload)}`)
}

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>
export type SleepLike = (ms: number) => Promise<void>
export type LoggerLike = Pick<Console, 'log' | 'warn' | 'error'>

export type DownloadPageResult = {
  page: RawPageKey
  path: string
  url: string
  status: 'downloaded' | 'skipped'
}

export type DownloadGameResult = {
  gameId: string
  year: number
  mmdd: string
  directory: string
  pages: DownloadPageResult[]
}

export type DownloadYearResult = {
  year: number
  gameId: string | null
  games: DownloadGameResult[]
}

type RawGame = {
  competition: DiscoveryCompetition
  listingType: DiscoveryListingType
  listingStatus: DiscoveryListingStatus
  date: string
  homeLabel: string
  awayLabel: string
  venue: string | null
  startsAt: string | null
  gameNumber: number | null
  order: number
  /** BIS 単試合 `s…html` / `fs…html`。無い場合は scores の index をそのまま使う。 */
  bisGamePageUrl: string | null
  source: {
    calendarPageUrl: string
    dailyPageUrl: string
  }
}

export function crawlerPackage(): string {
  return '@npb/crawler'
}

export async function discoverGamesByYear(options: {
  year: number
  fetchImpl?: FetchLike
  generatedAt?: Date
}): Promise<DiscoveryYear> {
  const year = validateYear(options.year)
  const fetchImpl = options.fetchImpl ?? fetch
  const generatedAt = options.generatedAt ?? new Date()

  const calendarPages = await collectCalendarPages(year, fetchImpl)
  const dailyPages = dedupeDailyPages(calendarPages.flatMap((page) => page.dailyPages))

  const rawGames: RawGame[] = []
  for (const dailyPage of dailyPages) {
    const html = await fetchText(fetchImpl, dailyPage.url, {
      headers: DISCOVERY_FETCH_HEADERS,
    })
    const parsedDaily = parseDailyPage(html, dailyPage)
    if (isDailyParseDebugEnabled()) {
      console.warn(
        `[npb-crawler][NPB_CRAWLER_DEBUG_DAILY] ${JSON.stringify({
          dailyPageUrl: dailyPage.url,
          date: dailyPage.date,
          rawGameCount: parsedDaily.length,
        })}`,
      )
    }
    rawGames.push(...parsedDaily)
  }

  const discoveredGames = assignGameIds(dedupeRawGamesByBisGamePageUrl(rawGames))
  warnInvalidDiscoveryGameIdsBeforeParse(discoveredGames)
  return discoveryYearSchema.parse({
    schemaVersion: 1,
    year,
    generatedAt: generatedAt.toISOString(),
    games: discoveredGames,
  })
}

export function parseDiscoverArgs(argv: string[]): { year: number } {
  const args = [...argv]
  let yearValue: string | undefined

  while (args.length > 0) {
    const arg = args.shift()
    if (arg === '--year') {
      yearValue = args.shift()
      continue
    }

    if (arg?.startsWith('--year=')) {
      yearValue = arg.slice('--year='.length)
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  if (!yearValue) {
    throw new Error('Missing required argument: --year')
  }

  return {
    year: validateYear(Number.parseInt(yearValue, 10)),
  }
}

export function parseDownloadArgs(argv: string[]): {
  year: number
  gameId: string | null
  delayMs: number
  userAgent: string
} {
  const args = [...argv]
  let yearValue: string | undefined
  let gameId: string | null = null
  let delayMs = DEFAULT_DOWNLOAD_DELAY_MS
  let userAgent = DEFAULT_USER_AGENT

  while (args.length > 0) {
    const arg = args.shift()

    if (arg === '--year') {
      yearValue = args.shift()
      continue
    }

    if (arg?.startsWith('--year=')) {
      yearValue = arg.slice('--year='.length)
      continue
    }

    if (arg === '--game-id') {
      gameId = args.shift() ?? null
      continue
    }

    if (arg?.startsWith('--game-id=')) {
      gameId = arg.slice('--game-id='.length)
      continue
    }

    if (arg === '--delay-ms') {
      delayMs = parseDelayMs(args.shift())
      continue
    }

    if (arg?.startsWith('--delay-ms=')) {
      delayMs = parseDelayMs(arg.slice('--delay-ms='.length))
      continue
    }

    if (arg === '--user-agent') {
      userAgent = parseUserAgent(args.shift())
      continue
    }

    if (arg?.startsWith('--user-agent=')) {
      userAgent = parseUserAgent(arg.slice('--user-agent='.length))
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  if (!yearValue) {
    throw new Error('Missing required argument: --year')
  }

  return {
    year: validateYear(Number.parseInt(yearValue, 10)),
    gameId,
    delayMs,
    userAgent,
  }
}

export function parseCalendarPage(html: string, options: {
  year: number
  competition: DiscoveryCompetition
  calendarPageUrl: string
}): {
  dailyPages: Array<{
    url: string
    date: string
    competition: DiscoveryCompetition
    calendarPageUrl: string
  }>
  nextCalendarPageUrls: string[]
} {
  const normalizedHtml = normalizeHtml(html)
  const resolvedUrls = extractResolvedUrls(normalizedHtml, options.calendarPageUrl)
  const calendarPagePattern = new RegExp(
    `^https://npb\\.jp/bis/eng/${options.year}/calendar/` +
      (options.competition === 'regular'
        ? '(?:index(?:_\\d{2})?\\.html)?$'
        : 'index_farm(?:_\\d{2})?\\.html$'),
  )
  // 従来: gm20260327.html / fgm20260501.html
  // 2025 年頃〜: s2025032800105.html / fs2025100401984.html（s/fs の直後8桁が暦日 YYYYMMDD）
  const dailyPagePattern = new RegExp(
    `^https://npb\\.jp/bis/eng/${options.year}/games/` +
      (options.competition === 'regular'
        ? '(?:gm(\\d{8})|s(\\d{8})\\d+)\\.html$'
        : '(?:fgm(\\d{8})|fs(\\d{8})\\d+)\\.html$'),
  )

  const calendarPageUrls = resolvedUrls.filter((url) => calendarPagePattern.test(url))
  const dailyPages = resolvedUrls
    .map((url) => {
      const match = url.match(dailyPagePattern)
      if (!match) {
        return null
      }

      const compact = match[1] ?? match[2]
      if (!compact) {
        return null
      }

      return {
        url,
        date: compactDateToIso(compact),
        competition: options.competition,
        calendarPageUrl: options.calendarPageUrl,
      }
    })
    .filter((page): page is NonNullable<typeof page> => page !== null)

  return {
    dailyPages: dedupeDailyPages(dailyPages),
    nextCalendarPageUrls: calendarPageUrls.filter((url) => url !== options.calendarPageUrl),
  }
}

export function parseDailyPage(html: string, dailyPage: {
  url: string
  date: string
  competition: DiscoveryCompetition
  calendarPageUrl: string
}): RawGame[] {
  const lines = htmlToLines(html)
  const listingType = detectListingType(html)
  const listingStatusBase: DiscoveryListingStatus =
    listingType === 'schedules' ? 'scheduled' : 'listed'

  if (listingType === 'scores') {
    let scoreEntries = parseScoreSummaryEntries(html, dailyPage.url)
    if (scoreEntries.length === 0) {
      scoreEntries = parseScoreSummaryFromBisEngScoreRows(html, dailyPage.url)
    }

    if (scoreEntries.length > 0) {
      return scoreEntries.map((entry, index) => ({
        competition: dailyPage.competition,
        listingType,
        listingStatus: entry.listingStatus,
        date: dailyPage.date,
        homeLabel: entry.homeLabel,
        awayLabel: entry.awayLabel,
        venue: entry.venue,
        startsAt: entry.startsAt,
        gameNumber: entry.gameNumber,
        order: index,
        bisGamePageUrl: entry.bisGamePageUrl,
        source: {
          calendarPageUrl: dailyPage.calendarPageUrl,
          dailyPageUrl: dailyPage.url,
        },
      }))
    }
  }

  const blockEntries = parseScheduledBlocks(lines)
  return blockEntries.map((entry, index) => ({
    competition: dailyPage.competition,
    listingType,
    listingStatus:
      entry.listingStatus ??
      (listingType === 'scores' ? listingStatusBase : 'scheduled'),
    date: dailyPage.date,
    homeLabel: entry.homeLabel,
    awayLabel: entry.awayLabel,
    venue: entry.venue,
    startsAt: entry.startsAt,
    gameNumber: null,
    order: index,
    bisGamePageUrl: null,
    source: {
      calendarPageUrl: dailyPage.calendarPageUrl,
      dailyPageUrl: dailyPage.url,
    },
  }))
}

export async function findWorkspaceRoot(startDir: string): Promise<string> {
  let currentDir = resolve(startDir)

  while (true) {
    const workspaceFile = join(currentDir, 'pnpm-workspace.yaml')
    try {
      await access(workspaceFile)
      return currentDir
    } catch {
      const parentDir = resolve(currentDir, '..')
      if (parentDir === currentDir) {
        throw new Error('Failed to locate workspace root')
      }

      currentDir = parentDir
    }
  }
}

export async function readDiscoveryYearFile(discoveryPath: string): Promise<DiscoveryYear> {
  const content = await readFile(discoveryPath, 'utf8')
  return discoveryYearSchema.parse(JSON.parse(content))
}

export async function createDownloadLogger(logPath: string): Promise<LoggerLike> {
  const resolvedLogPath = resolve(logPath)
  await mkdir(resolve(resolvedLogPath, '..'), { recursive: true })

  const writeLog = async (level: 'INFO' | 'WARN' | 'ERROR', message: string) => {
    const line = `${new Date().toISOString()} ${level} ${message}\n`
    await appendFile(resolvedLogPath, line, 'utf8')
  }

  return {
    log(message?: unknown, ...optionalParams: unknown[]) {
      const line = formatLogMessage(message, optionalParams)
      console.log(line)
      void writeLog('INFO', line)
    },
    warn(message?: unknown, ...optionalParams: unknown[]) {
      const line = formatLogMessage(message, optionalParams)
      console.warn(line)
      void writeLog('WARN', line)
    },
    error(message?: unknown, ...optionalParams: unknown[]) {
      const line = formatLogMessage(message, optionalParams)
      console.error(line)
      void writeLog('ERROR', line)
    },
  }
}

export async function downloadDiscoveredGames(options: {
  year: number
  gameId?: string | null
  workspaceRoot: string
  fetchImpl?: FetchLike
  sleepImpl?: SleepLike
  delayMs?: number
  userAgent?: string
  logger?: LoggerLike
}): Promise<DownloadYearResult> {
  const year = validateYear(options.year)
  const workspaceRoot = resolve(options.workspaceRoot)
  const fetchImpl = options.fetchImpl ?? fetch
  const sleepImpl = options.sleepImpl ?? sleep
  const delayMs = options.delayMs ?? DEFAULT_DOWNLOAD_DELAY_MS
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT
  const logger = options.logger ?? console

  const discoveryPath = join(workspaceRoot, 'data', 'discovery', `${year}.json`)
  const discovery = await readDiscoveryYearFile(discoveryPath)
  const games = selectGames(discovery, options.gameId ?? null)

  logger.log(
    `[download] year=${year} games=${games.length} delayMs=${delayMs} userAgent="${userAgent}"`,
  )

  const results: DownloadGameResult[] = []
  for (const game of games) {
    results.push(
      await downloadGamePages({
        game,
        workspaceRoot,
        fetchImpl,
        sleepImpl,
        delayMs,
        userAgent,
        logger,
      }),
    )
  }

  return {
    year,
    gameId: options.gameId ?? null,
    games: results,
  }
}

export async function downloadGamePages(options: {
  game: DiscoveryGame
  workspaceRoot: string
  fetchImpl?: FetchLike
  sleepImpl?: SleepLike
  delayMs?: number
  userAgent?: string
  logger?: LoggerLike
}): Promise<DownloadGameResult> {
  const fetchImpl = options.fetchImpl ?? fetch
  const sleepImpl = options.sleepImpl ?? sleep
  const delayMs = options.delayMs ?? DEFAULT_DOWNLOAD_DELAY_MS
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT
  const logger = options.logger ?? console
  const directory = resolve(
    options.workspaceRoot,
    'data',
    'raw',
    String(options.game.year),
    options.game.mmdd,
    options.game.gameId,
  )

  await mkdir(directory, { recursive: true })
  logger.log(`[game] ${options.game.date} ${options.game.gameId} -> ${directory}`)

  /** BIS 単試合 index のみ保存（scores の playbyplay / box / roster には依存しない）。 */
  const pageKey = 'index' as const
  const fetchUrl = options.game.downloader.pages.index
  const outputPath = join(directory, RAW_PAGE_FILE_NAMES[pageKey])

  const pageResults: DownloadPageResult[] = []
  if (await fileExists(outputPath)) {
    logger.log(`[skip] ${outputPath}`)
    pageResults.push({
      page: pageKey,
      path: outputPath,
      url: fetchUrl,
      status: 'skipped',
    })
  } else {
    logger.log(`[fetch] ${fetchUrl}`)
    const response = await fetchImpl(fetchUrl, {
      headers: {
        'user-agent': userAgent,
      },
    })
    if (!response.ok) {
      throw new Error(`Request failed: ${fetchUrl} (${response.status})`)
    }

    const html = await response.text()
    await writeFile(outputPath, html, 'utf8')
    logger.log(`[saved] ${outputPath}`)
    pageResults.push({
      page: pageKey,
      path: outputPath,
      url: fetchUrl,
      status: 'downloaded',
    })

    if (delayMs > 0) {
      await sleepImpl(delayMs)
    }
  }

  return {
    gameId: options.game.gameId,
    year: options.game.year,
    mmdd: options.game.mmdd,
    directory,
    pages: pageResults,
  }
}

async function collectCalendarPages(year: number, fetchImpl: FetchLike) {
  const seeds: Array<{ competition: DiscoveryCompetition; url: string }> = [
    {
      competition: 'regular',
      url: `${REGULAR_CALENDAR_ROOT}/${year}/calendar/`,
    },
    {
      competition: 'farm',
      url: `${REGULAR_CALENDAR_ROOT}/${year}/calendar/index_farm.html`,
    },
  ]

  const queue = [...seeds]
  const seen = new Set<string>()
  const results: Array<{
    competition: DiscoveryCompetition
    url: string
    dailyPages: Array<{
      url: string
      date: string
      competition: DiscoveryCompetition
      calendarPageUrl: string
    }>
  }> = []

  while (queue.length > 0) {
    const next = queue.shift()
    if (!next || seen.has(next.url)) {
      continue
    }

    seen.add(next.url)
    const html = await fetchText(fetchImpl, next.url, {
      headers: DISCOVERY_FETCH_HEADERS,
    })
    const parsed = parseCalendarPage(html, {
      year,
      competition: next.competition,
      calendarPageUrl: next.url,
    })
    logCalendarFetchDebug(next.url, html, year, next.competition, parsed)

    results.push({
      competition: next.competition,
      url: next.url,
      dailyPages: parsed.dailyPages,
    })

    for (const url of parsed.nextCalendarPageUrls) {
      queue.push({
        competition: next.competition,
        url,
      })
    }
  }

  return results
}

function assignGameIds(rawGames: RawGame[]): DiscoveryGame[] {
  const sortedGames = [...rawGames].sort((left, right) => {
    const leftCompetitionOrder = left.competition === 'regular' ? 0 : 1
    const rightCompetitionOrder = right.competition === 'regular' ? 0 : 1

    return (
      left.date.localeCompare(right.date) ||
      leftCompetitionOrder - rightCompetitionOrder ||
      left.order - right.order ||
      left.source.dailyPageUrl.localeCompare(right.source.dailyPageUrl)
    )
  })

  const matchupCounts = new Map<string, number>()

  return sortedGames.map((rawGame) => {
    const homeCode = lookupTeamCode(rawGame.homeLabel)
    const awayCode = lookupTeamCode(rawGame.awayLabel)
    const sortedPair = [homeCode, awayCode].sort().join(':')
    const groupingKey = `${rawGame.date}:${rawGame.competition}:${sortedPair}`
    const previousCount = matchupCounts.get(groupingKey) ?? 0
    const nextCount = rawGame.gameNumber && rawGame.gameNumber > previousCount
      ? rawGame.gameNumber
      : previousCount + 1
    matchupCounts.set(groupingKey, nextCount)

    const mmdd = rawGame.date.slice(5).replace('-', '')
    const npbSlug = buildNpbScoresPathSlug(homeCode, awayCode, nextCount)
    const gameId = buildDiscoveryStorageGameId({
      competition: rawGame.competition,
      dateIso: rawGame.date,
      homeCode,
      awayCode,
      occurrenceWithinDayCard: nextCount,
    })
    const scoreBaseUrl = `https://npb.jp/scores/${rawGame.date.slice(0, 4)}/${mmdd}/${npbSlug}`
    const bisGamePageUrl = rawGame.bisGamePageUrl
    const useBisIndex =
      bisGamePageUrl != null &&
      bisGamePageUrl.length > 0 &&
      isBisSingleGameScorePageUrl(bisGamePageUrl)

    return {
      year: Number.parseInt(rawGame.date.slice(0, 4), 10),
      date: rawGame.date,
      mmdd,
      gameId,
      gameNumber: nextCount,
      competition: rawGame.competition,
      listingType: rawGame.listingType,
      listingStatus: rawGame.listingStatus,
      startsAt: rawGame.startsAt,
      venue: rawGame.venue,
      homeTeam: {
        code: homeCode,
        label: rawGame.homeLabel,
      },
      awayTeam: {
        code: awayCode,
        label: rawGame.awayLabel,
      },
      source: rawGame.source,
      downloader: {
        scoreBaseUrl,
        ...(useBisIndex ? { bisGamePageUrl } : {}),
        pages: {
          index: useBisIndex ? bisGamePageUrl! : `${scoreBaseUrl}/index.html`,
          playByPlay: `${scoreBaseUrl}/playbyplay.html`,
          box: `${scoreBaseUrl}/box.html`,
          roster: `${scoreBaseUrl}/roster.html`,
        },
      },
    }
  })
}

function dedupeRawGamesByBisGamePageUrl(rawGames: RawGame[]): RawGame[] {
  const byBisUrl = new Map<string, RawGame>()
  const results: RawGame[] = []

  for (const rawGame of rawGames) {
    const bisGamePageUrl = rawGame.bisGamePageUrl
    if (!bisGamePageUrl) {
      results.push(rawGame)
      continue
    }

    const existing = byBisUrl.get(bisGamePageUrl)
    if (!existing) {
      byBisUrl.set(bisGamePageUrl, rawGame)
      results.push(rawGame)
      continue
    }

    const preferred = choosePreferredRawGame(existing, rawGame)
    byBisUrl.set(bisGamePageUrl, preferred)
    const index = results.indexOf(existing)
    if (index >= 0) {
      results[index] = preferred
    }
  }

  return results
}

function choosePreferredRawGame(left: RawGame, right: RawGame): RawGame {
  const score = (game: RawGame) =>
    (game.source.dailyPageUrl === game.bisGamePageUrl ? 8 : 0) +
    (game.gameNumber ? 4 : 0) +
    (game.startsAt ? 2 : 0) +
    (game.venue ? 1 : 0)
  return score(right) > score(left) ? right : left
}

/**
 * 2025 年頃の bis 英語版: 日別は `gmYYYYMMDD.html` で複数試合を表形式（td 改行）にし、
 * 各試合は `Home | RH | - | RA | Away` の 5 行ブロック。単一試合 `s…html` は `Team | score | Team | score` の 4 行。
 * アンカー内の "… Game n …" 旧形式が無い場合に使用する。
 */
function parseScoreSummaryFromBisEngScoreRows(
  html: string,
  pageBaseUrl: string,
): Array<{
  homeLabel: string
  awayLabel: string
  venue: string | null
  startsAt: string | null
  gameNumber: number | null
  listingStatus: DiscoveryListingStatus
  bisGamePageUrl: string | null
}> {
  const singleGameMeta = parseBisSingleGameMeta(html, pageBaseUrl)
  if (singleGameMeta) {
    return [singleGameMeta]
  }

  const lines = htmlToLines(html)
  const rows: Array<{
    homeLabel: string
    awayLabel: string
    venue: string | null
    startsAt: string | null
    gameNumber: number | null
    listingStatus: DiscoveryListingStatus
  }> = []

  let index = 0
  while (index < lines.length) {
    if (index + 4 < lines.length && lines[index + 2]?.trim() === '-') {
      const homeLabel = normalizeTeamLabel(lines[index].trim())
      const awayLabel = normalizeTeamLabel(lines[index + 4].trim())
      const homeRuns = lines[index + 1]?.trim() ?? ''
      const awayRuns = lines[index + 3]?.trim() ?? ''
      if (
        homeLabel !== awayLabel &&
        isKnownTeam(homeLabel) &&
        isKnownTeam(awayLabel) &&
        /^\d{1,3}$/.test(homeRuns) &&
        /^\d{1,3}$/.test(awayRuns)
      ) {
        rows.push({
          homeLabel,
          awayLabel,
          venue: pickVenueAfterScoreBlock(lines, index + 5),
          startsAt: null,
          gameNumber: pickGameNumberAfterScoreBlock(lines, index + 5),
          listingStatus: 'listed',
        })
        index += 5
        continue
      }
    }

    if (index + 3 < lines.length && lines[index + 2]?.trim() !== '-') {
      const homeLabel = normalizeTeamLabel(lines[index].trim())
      const awayLabel = normalizeTeamLabel(lines[index + 2].trim())
      const homeRuns = lines[index + 1]?.trim() ?? ''
      const awayRuns = lines[index + 3]?.trim() ?? ''
      if (
        homeLabel !== awayLabel &&
        isKnownTeam(homeLabel) &&
        isKnownTeam(awayLabel) &&
        /^\d{1,3}$/.test(homeRuns) &&
        /^\d{1,3}$/.test(awayRuns)
      ) {
        rows.push({
          homeLabel,
          awayLabel,
          venue: pickVenueAfterScoreBlock(lines, index + 4),
          startsAt: null,
          gameNumber: pickGameNumberAfterScoreBlock(lines, index + 4),
          listingStatus: 'listed',
        })
        index += 4
        continue
      }
    }

    index += 1
  }

  const withBis = attachBisSingleGameUrlsToScoreRows(rows, html, pageBaseUrl)
  return dedupeGames(withBis)
}

function pickVenueAfterScoreBlock(lines: string[], start: number): string | null {
  for (let j = start; j < Math.min(start + 12, lines.length); j += 1) {
    const raw = lines[j].trim()
    if (!raw) {
      continue
    }

    if (/^Game\s+\d+$/i.test(raw)) {
      continue
    }

    if (/^\d{1,3}$/.test(raw)) {
      continue
    }

    if (/^\d{1,2}:\d{2}$/.test(raw)) {
      continue
    }

    if (BLOCKED_LINE_PREFIXES.has(raw)) {
      continue
    }

    if (/^(R|H|E)\s+/.test(raw) || /^(WP|LP|HR|IP)\b/.test(raw) || raw.startsWith('AB ')) {
      return null
    }

    const candidate = normalizeTeamLabel(raw)
    if (isKnownTeam(candidate) && j + 1 < lines.length && /^\d{1,3}$/.test(lines[j + 1].trim())) {
      return null
    }

    const venue = normalizeVenue(raw.split('(')[0].trim())
    return venue.length > 0 ? venue : null
  }

  return null
}

function pickGameNumberAfterScoreBlock(lines: string[], start: number): number | null {
  for (let j = start; j < Math.min(start + 12, lines.length); j += 1) {
    const gameNumber = extractGameNumber(lines[j] ?? '')
    if (gameNumber) {
      return gameNumber
    }
  }
  return null
}

function parseBisSingleGameMeta(
  html: string,
  pageBaseUrl: string,
): {
  homeLabel: string
  awayLabel: string
  venue: string | null
  startsAt: string | null
  gameNumber: number | null
  listingStatus: DiscoveryListingStatus
  bisGamePageUrl: string | null
} | null {
  if (!isBisSingleGameScorePageUrl(pageBaseUrl)) {
    return null
  }

  const inlineText = htmlToInlineText(html)
  const titleText = extractTitleText(html)
  const matchup = titleText.match(/\(Scores\)\s+(.+?)\s+vs\s+(.+?)(?:\s+\||$)/i)
  if (!matchup?.[1] || !matchup[2]) {
    return null
  }

  const homeLabel = normalizeTeamLabel(matchup[1])
  const awayLabel = normalizeTeamLabel(matchup[2])
  if (!isKnownTeam(homeLabel) || !isKnownTeam(awayLabel)) {
    return null
  }

  return {
    homeLabel,
    awayLabel,
    venue: extractSingleGameVenue(inlineText),
    startsAt: extractSingleGameStartTime(inlineText),
    gameNumber: extractGameNumber(inlineText),
    listingStatus: 'listed',
    bisGamePageUrl: pageBaseUrl,
  }
}

function extractTitleText(html: string): string {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const ogTitleMatch = html.match(/<meta\b[^>]*property\s*=\s*["']og:title["'][^>]*content\s*=\s*["']([^"']+)["'][^>]*>/i)
  return htmlToInlineText(ogTitleMatch?.[1] ?? titleMatch?.[1] ?? '')
}

function extractSingleGameVenue(text: string): string | null {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean)
  const timeLineIndex = lines.findIndex((line) => /\(\s*\d{1,2}:\d{2}\s*-/.test(line))
  if (timeLineIndex > 0) {
    const venue = normalizeVenue(lines[timeLineIndex - 1] ?? '')
    return venue.length > 0 ? venue : null
  }
  return null
}

function extractSingleGameStartTime(text: string): string | null {
  const match = text.match(/\(\s*(\d{1,2}:\d{2})\s*-/)
  return match?.[1] ? match[1].padStart(5, '0') : null
}

function extractGameNumber(text: string): number | null {
  const match = text.match(/\bGame\s+(\d+)\b/i)
  return match?.[1] ? Number.parseInt(match[1], 10) : null
}

function parseScoreSummaryEntries(
  html: string,
  pageBaseUrl: string,
): Array<{
  homeLabel: string
  awayLabel: string
  venue: string | null
  startsAt: string | null
  gameNumber: number | null
  listingStatus: DiscoveryListingStatus
  bisGamePageUrl: string | null
}> {
  const normalizedHtml = normalizeHtml(html)
  const results: Array<{
    homeLabel: string
    awayLabel: string
    venue: string | null
    startsAt: string | null
    gameNumber: number | null
    listingStatus: DiscoveryListingStatus
    bisGamePageUrl: string | null
  }> = []

  for (const match of normalizedHtml.matchAll(
    /<a\b[^>]*\bhref\s*=\s*(["'])([^"']*)\1[^>]*>([\s\S]*?)<\/a>/gi,
  )) {
    const hrefRaw = match[2]?.trim() ?? ''
    const anchorText = htmlToInlineText(match[3] ?? '')
    if (!anchorText.includes('Game ') && !anchorText.includes('Postponed')) {
      continue
    }

    let bisGamePageUrl: string | null = null
    try {
      const resolved = resolveDiscoveryHref(hrefRaw, pageBaseUrl)
      if (isBisSingleGameScorePageUrl(resolved)) {
        bisGamePageUrl = resolved
      }
    } catch {
      // ignore invalid href
    }

    const scoreMatch = anchorText.match(
      /^(.+?)\s+\d+\s+Game\s+\d+\s+(.+?)\s+\d+\s+(.+)$/,
    )
    if (scoreMatch) {
      results.push({
        homeLabel: normalizeTeamLabel(scoreMatch[1]),
        venue: scoreMatch[2].trim(),
        awayLabel: normalizeTeamLabel(scoreMatch[3]),
        startsAt: null,
        gameNumber: extractGameNumber(anchorText),
        listingStatus: 'listed',
        bisGamePageUrl,
      })
      continue
    }

    const postponedMatch = anchorText.match(/^(.+?)\s+Postponed\s+(.+?)\s+(.+)$/)
    if (postponedMatch) {
      results.push({
        homeLabel: normalizeTeamLabel(postponedMatch[1]),
        venue: postponedMatch[2].trim(),
        awayLabel: normalizeTeamLabel(postponedMatch[3]),
        startsAt: null,
        gameNumber: null,
        listingStatus: 'postponed',
        bisGamePageUrl,
      })
    }
  }

  return dedupeGames(results)
}

function parseScheduledBlocks(lines: string[]) {
  const results: Array<{
    homeLabel: string
    awayLabel: string
    venue: string | null
    startsAt: string | null
    listingStatus?: DiscoveryListingStatus
  }> = []

  for (let index = 0; index < lines.length; index += 1) {
    const timeMatch = lines[index]?.match(/^(\d{1,2}:\d{2})$/)
    if (!timeMatch) {
      continue
    }

    const venue = normalizeVenue(lines[index - 1] ?? '')
    const homeCandidate = normalizeTeamLabel(lines[index - 2] ?? '')
    const awayCandidate = normalizeTeamLabel(lines[index + 1] ?? '')

    if (!isKnownTeam(homeCandidate) || !isKnownTeam(awayCandidate)) {
      continue
    }

    results.push({
      homeLabel: homeCandidate,
      awayLabel: awayCandidate,
      venue: venue.length > 0 ? venue : null,
      startsAt: timeMatch[1].padStart(5, '0'),
    })
  }

  return dedupeGames(results)
}

function dedupeGames<
  T extends {
    homeLabel: string
    awayLabel: string
    venue: string | null
    bisGamePageUrl?: string | null
  },
>(entries: T[]): T[] {
  const seen = new Set<string>()
  const results: T[] = []

  for (const entry of entries) {
    const key = `${entry.homeLabel}|${entry.awayLabel}|${entry.venue ?? ''}|${entry.bisGamePageUrl ?? ''}`
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    results.push(entry)
  }

  return results
}

function isBisSingleGameScorePageUrl(url: string): boolean {
  return /\/bis\/eng\/\d{4}\/games\/(?:s|fs)\d+\.html$/iu.test(url)
}

function extractOrderedBisSingleGamePageUrls(
  normalizedHtml: string,
  pageBaseUrl: string,
): string[] {
  const ordered: string[] = []
  const seen = new Set<string>()

  for (const match of normalizedHtml.matchAll(
    /<a\b[^>]*\bhref\s*=\s*(["'])([^"']*)\1/gi,
  )) {
    const hrefRaw = match[2]?.trim() ?? ''
    try {
      const resolved = resolveDiscoveryHref(hrefRaw, pageBaseUrl)
      if (!isBisSingleGameScorePageUrl(resolved) || seen.has(resolved)) {
        continue
      }

      seen.add(resolved)
      ordered.push(resolved)
    } catch {
      // ignore
    }
  }

  return ordered
}

function attachBisSingleGameUrlsToScoreRows<
  T extends {
    homeLabel: string
    awayLabel: string
    venue: string | null
    startsAt: string | null
    gameNumber: number | null
    listingStatus: DiscoveryListingStatus
  },
>(
  rows: T[],
  html: string,
  pageBaseUrl: string,
): Array<T & { bisGamePageUrl: string | null }> {
  const orderedLinks = extractOrderedBisSingleGamePageUrls(normalizeHtml(html), pageBaseUrl)

  if (orderedLinks.length >= rows.length) {
    return rows.map((row, rowIndex) => ({
      ...row,
      bisGamePageUrl: orderedLinks[rowIndex] ?? null,
    }))
  }

  if (orderedLinks.length > 0) {
    return rows.map((row, rowIndex) => ({
      ...row,
      bisGamePageUrl: orderedLinks[rowIndex] ?? null,
    }))
  }

  if (isBisSingleGameScorePageUrl(pageBaseUrl)) {
    return rows.map((row) => ({
      ...row,
      bisGamePageUrl: pageBaseUrl,
    }))
  }

  return rows.map((row) => ({
    ...row,
    bisGamePageUrl: null,
  }))
}

function dedupeDailyPages<T extends { url: string }>(pages: T[]): T[] {
  const seen = new Set<string>()
  const results: T[] = []

  for (const page of pages) {
    if (seen.has(page.url)) {
      continue
    }

    seen.add(page.url)
    results.push(page)
  }

  return results
}

function lookupTeamCode(label: string): string {
  const code = TEAM_CODE_BY_LABEL[label]
  if (!code) {
    throw new Error(`Unknown team label: ${label}`)
  }

  return code
}

function isKnownTeam(label: string): boolean {
  return Object.hasOwn(TEAM_CODE_BY_LABEL, label)
}

function normalizeTeamLabel(label: string): string {
  return label
    .replace(/\s+/g, ' ')
    .replace(/^YOKOHAMA DeNA BAYSTARS$/i, 'DeNA')
    .replace(/^Yokohama DeNA BayStars$/i, 'DeNA')
    .replace(/^Chiba Lotte Marines$/i, 'Lotte')
    .replace(/^Chunichi Dragons$/i, 'Chunichi')
    .replace(/^Fukuoka SoftBank Hawks$/i, 'SoftBank')
    .replace(/^Hanshin Tigers$/i, 'Hanshin')
    .replace(/^Hiroshima Toyo Carp$/i, 'Hiroshima')
    .replace(/^Hokkaido Nippon-Ham Fighters$/i, 'Nippon-Ham')
    .replace(/^ORIX Buffaloes$/i, 'ORIX')
    .replace(/^Tohoku Rakuten Golden Eagles$/i, 'Rakuten')
    .replace(/^Saitama Seibu Lions$/i, 'Seibu')
    .replace(/^Tokyo Yakult Swallows$/i, 'Yakult')
    .replace(/^Tokyo Yakult$/i, 'Yakult')
    .replace(/^Yomiuri Giants$/i, 'Yomiuri')
    .replace(/^Oisix Niigata Albirex BC$/i, 'Oisix')
    .replace(/^HAYATE 223$/i, 'HAYATE')
    .trim()
}

function normalizeVenue(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function selectGames(discovery: DiscoveryYear, gameId: string | null): DiscoveryGame[] {
  if (!gameId) {
    return discovery.games
  }

  const matchedGames = discovery.games.filter((game) => game.gameId === gameId)
  if (matchedGames.length === 0) {
    throw new Error(`Game not found in discovery JSON: ${gameId}`)
  }

  return matchedGames
}

function detectListingType(html: string): DiscoveryListingType {
  const joined = htmlToInlineText(html)
  if (joined.includes('(Schedules)')) {
    return 'schedules'
  }

  if (joined.includes('(Scores)')) {
    return 'scores'
  }

  throw new Error('Failed to detect listing type from daily page')
}

async function fetchText(
  fetchImpl: FetchLike,
  url: string,
  init?: RequestInit,
): Promise<string> {
  const response = await fetchImpl(url, init)
  if (!response.ok) {
    throw new Error(`Request failed: ${url} (${response.status})`)
  }

  return response.text()
}

function extractResolvedUrls(html: string, baseUrl: string): string[] {
  const seen = new Set<string>()
  const urls: string[] = []

  for (const match of extractMatches(html, /\bhref\s*=\s*["']([^"'#?][^"']*)["']/gi)) {
    const rawUrl = match[1]?.trim()
    if (!rawUrl) {
      continue
    }

    const resolvedUrl = resolveDiscoveryHref(rawUrl, baseUrl)
    if (seen.has(resolvedUrl)) {
      continue
    }

    seen.add(resolvedUrl)
    urls.push(resolvedUrl)
  }

  return urls
}

function resolveDiscoveryHref(rawUrl: string, baseUrl: string): string {
  if (isDailyGameHref(rawUrl)) {
    const year = extractDiscoveryYear(baseUrl)
    return `https://npb.jp/bis/eng/${year}/games/${rawUrl.replace(/^.*\//u, '')}`
  }

  return new URL(rawUrl, baseUrl).toString()
}

function isDailyGameHref(rawUrl: string): boolean {
  return /(?:^|\/)(?:gm|fgm|s|fs)\d+\.html$/u.test(rawUrl)
}

function extractDiscoveryYear(baseUrl: string): string {
  const year = baseUrl.match(/\/bis\/eng\/(\d{4})\//u)?.[1]
  if (!year) {
    throw new Error(`Could not infer discovery year from ${baseUrl}`)
  }

  return year
}

function extractMatches(html: string, pattern: RegExp): RegExpMatchArray[] {
  return [...html.matchAll(pattern)]
}

function normalizeHtml(html: string): string {
  return html
    .replace(/&amp;/g, '&')
    .replace(/&#x2f;/gi, '/')
    .replace(/&#47;/g, '/')
}

function htmlToLines(html: string): string[] {
  return htmlToInlineText(html)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !BLOCKED_LINE_PREFIXES.has(line))
}

function htmlToInlineText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '\n')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|ul|ol|section|article|header|footer|h\d|table|tr|td|th|a)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\r/g, '\n')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n+/g, '\n'),
  ).trim()
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function compactDateToIso(value: string): string {
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
}

function parseDelayMs(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '', 10)
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid delay-ms: ${value}`)
  }

  return parsed
}

function parseUserAgent(value: string | undefined): string {
  const userAgent = value?.trim()
  if (!userAgent) {
    throw new Error('Invalid user-agent: empty value')
  }

  return userAgent
}

async function fileExists(path: string): Promise<boolean> {
  try {
    const file = await stat(path)
    return file.isFile()
  } catch {
    return false
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms)
  })
}

function formatLogMessage(message: unknown, optionalParams: unknown[]): string {
  return [message, ...optionalParams].map((part) => String(part)).join(' ').trim()
}

function validateYear(year: number): number {
  if (!Number.isInteger(year) || year < 1936 || year > 2100) {
    throw new Error(`Invalid year: ${year}`)
  }

  return year
}
