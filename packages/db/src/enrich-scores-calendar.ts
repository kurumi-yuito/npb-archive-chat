import path from 'node:path'
import {
  NoPlayByPlayAvailableError,
  parseScoresBoxHtml,
  parseScoresIndexHtml,
  parseScoresPlayByPlayHtml,
  parseScoresRosterHtml,
  type StructuredGame,
} from '@npb/parser'
import {
  createDownloadLogger,
  findWorkspaceRoot,
  type FetchLike,
  type LoggerLike,
  type SleepLike,
} from '../../crawler/src/index'
import { loadStructuredGameDirectory } from './loader'
import { migrateDatabase } from './migrations'
import { createObjectStorage, defaultR2Bucket, parseStorageArg, type ObjectStorage, type StorageArgs } from './object-storage'
import { sqliteDatabaseToQuery } from './query-driver'
import { listGamesForScoresEnrichment, type GameYearRow } from './repository/index'
import { buildScoresBaseUrl, buildScoresBaseUrlFromCanonicalUrl, fetchScoreFiles, writeRawScoreFiles } from './scores-fetcher'
import { openDatabase } from './sqlite'

const DEFAULT_LOG_PATH = path.join('data', 'logs', 'enrich-scores-calendar.log')

export type EnrichScoresCalendarArgs = StorageArgs & {
  year: number
  sqlitePath: string
  limit?: number
  league?: 'all' | 'regular'
  dateFrom?: string
  dateTo?: string
  workspaceRoot?: string
  delayMs?: number
  userAgent?: string
  progressEvery?: number
}

export type EnrichScoresCalendarResult = {
  year: number
  scannedDays: number
  existingDays: number
  discoveredGames: number
  loadedGames: number
  unresolvedGames: number
  failedGames: number
  failures: Array<{
    date: string
    gameId?: string
    slug?: string
    stage: 'skip' | 'slug' | 'index' | 'playbyplay' | 'box' | 'roster' | 'parse' | 'load'
    reason: string
  }>
}

export function parseEnrichScoresCalendarArgs(argv: string[]): EnrichScoresCalendarArgs {
  const args = [...argv]
  while (args[0] === '--') {
    args.shift()
  }

  let year: number | undefined
  let sqlitePath: string | undefined
  let limit: number | undefined
  let league: 'all' | 'regular' | undefined
  let dateFrom: string | undefined
  let dateTo: string | undefined
  let workspaceRoot: string | undefined
  let delayMs: number | undefined
  let userAgent: string | undefined
  let progressEvery: number | undefined
  const storageArgs: StorageArgs = {}

  while (args.length > 0) {
    const arg = args.shift()
    if (parseStorageArg(arg, () => args.shift(), storageArgs)) {
      continue
    }
    if (arg === '--year') {
      year = parsePositiveInteger(args.shift(), 'year')
      continue
    }
    if (arg?.startsWith('--year=')) {
      year = parsePositiveInteger(arg.slice('--year='.length), 'year')
      continue
    }
    if (arg === '--sqlite-path') {
      sqlitePath = args.shift()
      continue
    }
    if (arg?.startsWith('--sqlite-path=')) {
      sqlitePath = arg.slice('--sqlite-path='.length)
      continue
    }
    if (arg === '--limit') {
      limit = parsePositiveInteger(args.shift(), 'limit')
      continue
    }
    if (arg?.startsWith('--limit=')) {
      limit = parsePositiveInteger(arg.slice('--limit='.length), 'limit')
      continue
    }
    if (arg === '--league') {
      league = parseLeague(args.shift())
      continue
    }
    if (arg?.startsWith('--league=')) {
      league = parseLeague(arg.slice('--league='.length))
      continue
    }
    if (arg === '--exclude-farm') {
      league = 'regular'
      continue
    }
    if (arg === '--from') {
      dateFrom = parseDateString(args.shift(), 'from')
      continue
    }
    if (arg?.startsWith('--from=')) {
      dateFrom = parseDateString(arg.slice('--from='.length), 'from')
      continue
    }
    if (arg === '--to') {
      dateTo = parseDateString(args.shift(), 'to')
      continue
    }
    if (arg?.startsWith('--to=')) {
      dateTo = parseDateString(arg.slice('--to='.length), 'to')
      continue
    }
    if (arg === '--workspace-root') {
      workspaceRoot = args.shift()
      continue
    }
    if (arg?.startsWith('--workspace-root=')) {
      workspaceRoot = arg.slice('--workspace-root='.length)
      continue
    }
    if (arg === '--delay-ms') {
      delayMs = parseNonNegativeInteger(args.shift(), 'delay-ms')
      continue
    }
    if (arg?.startsWith('--delay-ms=')) {
      delayMs = parseNonNegativeInteger(arg.slice('--delay-ms='.length), 'delay-ms')
      continue
    }
    if (arg === '--user-agent') {
      userAgent = args.shift()
      continue
    }
    if (arg?.startsWith('--user-agent=')) {
      userAgent = arg.slice('--user-agent='.length)
      continue
    }
    if (arg === '--progress-every') {
      progressEvery = parseNonNegativeInteger(args.shift(), 'progress-every')
      continue
    }
    if (arg?.startsWith('--progress-every=')) {
      progressEvery = parseNonNegativeInteger(arg.slice('--progress-every='.length), 'progress-every')
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }

  if (!year) {
    throw new Error('Missing required argument: --year')
  }
  if (!sqlitePath) {
    throw new Error('Missing required argument: --sqlite-path')
  }

  return { year, sqlitePath, limit, league, dateFrom, dateTo, workspaceRoot, delayMs, userAgent, progressEvery, ...storageArgs }
}

export async function runScoresCalendarEnrichment(
  options: EnrichScoresCalendarArgs & {
    fetchImpl?: FetchLike
    sleepImpl?: SleepLike
    logger?: LoggerLike
  },
): Promise<EnrichScoresCalendarResult> {
  const workspaceRoot = path.resolve(
    options.workspaceRoot ?? (await findWorkspaceRoot(process.cwd())),
  )
  const sqlitePath = path.resolve(workspaceRoot, options.sqlitePath)
  const storage = createObjectStorage({
    mode: options.storage,
    workspaceRoot,
    bucket: options.r2Bucket ?? defaultR2Bucket(),
    prefix: options.r2Prefix,
    endpoint: options.r2Endpoint,
  })
  const fetchImpl = options.fetchImpl ?? fetch
  const sleepImpl = options.sleepImpl ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)))
  const logger =
    options.logger ??
    (await createDownloadLogger(path.join(workspaceRoot, DEFAULT_LOG_PATH)))
  const headers = {
    'user-agent':
      options.userAgent ??
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 npb-archive-chat',
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'ja,en-US;q=0.9,en;q=0.8',
    referer: 'https://npb.jp/',
  } as const

  const failures: EnrichScoresCalendarResult['failures'] = []
  let existingDays = 0
  let discoveredGames = 0
  let loadedGames = 0
  const unresolvedGames = 0

  const database = openDatabase(sqlitePath)
  try {
    migrateDatabase(database)
    const games = await listGamesForScoresEnrichment(
      sqliteDatabaseToQuery(database),
      options.year,
      { limit: options.limit, league: options.league, dateFrom: options.dateFrom, dateTo: options.dateTo },
    )
    const duplicateGroupsWithScores = buildDuplicateGroupsWithScores(games)
    const uniqueDays = new Set(games.map((game) => game.date))
    existingDays = uniqueDays.size

    logger.log(
      `[scores:start] year=${options.year} league=${options.league ?? 'all'} limit=${options.limit ?? 'all'} games=${games.length}`,
    )

    for (let index = 0; index < games.length; index++) {
      const game = games[index]!
      const progressEvery = options.progressEvery ?? 0
      if (progressEvery > 0 && (((index + 1) % progressEvery === 0) || index === 0)) {
        logger.log(
          `[scores:progress] ${index + 1}/${games.length} date=${game.date} loaded=${loadedGames} failures=${failures.length}`,
        )
      }

      const canonicalScoresBaseUrl = buildScoresBaseUrlFromCanonicalUrl(game.canonicalUrl)
      if (game.canonicalUrl && !canonicalScoresBaseUrl) {
        const reason = duplicateGroupsWithScores.has(duplicateGroupKey(game) ?? '')
          ? 'duplicate_or_reversed_game'
          : 'scores_canonical_not_available'
        failures.push({ date: game.date, gameId: game.gameId, stage: 'skip', reason })
        logger.error(`[scores:skipped] date=${game.date} game_id=${game.gameId} stage=skip reason=${reason}`)
        continue
      }

      if (!canonicalScoresBaseUrl && isFarmGameId(game.gameId)) {
        const reason = 'farm_scores_not_available'
        failures.push({ date: game.date, gameId: game.gameId, stage: 'skip', reason })
        logger.error(`[scores:skipped] date=${game.date} game_id=${game.gameId} stage=skip reason=${reason}`)
        continue
      }

      let scoresBaseUrl: string
      let slug: string
      try {
        scoresBaseUrl = canonicalScoresBaseUrl ?? buildScoresBaseUrl(game.year, game.mmdd, game.gameId)
        slug = buildScoresSlugFromBaseUrl(scoresBaseUrl)
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        failures.push({ date: game.date, gameId: game.gameId, stage: 'slug', reason })
        logger.error(`[scores:failed] date=${game.date} game_id=${game.gameId} stage=slug reason=${reason}`)
        continue
      }

      discoveredGames += 1
      const files = await fetchScoreFiles(fetchImpl, scoresBaseUrl, headers)
      const rawPaths = await writeRawScoreFiles(storage, game.year, game.mmdd, game.gameId, files)
      const missingParts = (['index', 'playbyplay', 'box', 'roster'] as const).filter(
        (part) => !files[part].ok,
      )

      if (missingParts.length > 0) {
        for (const part of missingParts) {
          failures.push({
            date: game.date,
            gameId: game.gameId,
            slug,
            stage: part,
            reason: `status_${files[part].status}`,
          })
          logger.error(
            `[scores:failed] date=${game.date} game_id=${game.gameId} slug=${slug} stage=${part} reason=${files[part].status}`,
          )
        }
        await writeUnresolved(storage, game, {
          game_id: game.gameId,
          slug,
          date: game.date,
          reason: missingParts.map((part) => `${part}:${files[part].status}`).join(','),
        })
        continue
      }

      let parsed: {
        game: StructuredGame
        events: ReturnType<typeof parseScoresPlayByPlayHtml>
        battingLines: ReturnType<typeof parseScoresBoxHtml>['battingLines']
        pitchingLines: ReturnType<typeof parseScoresBoxHtml>['pitchingLines']
        linescore: ReturnType<typeof parseScoresBoxHtml>['linescore']
        rosterEntries: ReturnType<typeof parseScoresRosterHtml>
        sourceUrls: Record<'index' | 'playbyplay' | 'box' | 'roster', string>
      }
      try {
        const indexData = parseScoresIndexHtml(files.index.text)
        const boxData = parseScoresBoxHtml(files.box.text)
        parsed = {
          game: {
            ...indexData.game,
            game_id: game.gameId,
            game_date: game.date,
            competition: game.competition ?? indexData.game.competition,
            venue: game.venue || indexData.game.venue,
            home_team: game.homeTeamName || indexData.game.home_team,
            away_team: game.awayTeamName || indexData.game.away_team,
            start_time: game.startTime ?? indexData.game.start_time,
            source_urls: [files.index.url, files.playbyplay.url, files.box.url, files.roster.url],
          },
          events: parseScoresPlayByPlayHtml(files.playbyplay.text).map((event) => ({
            ...event,
            game_id: game.gameId,
          })),
          battingLines: boxData.battingLines.map((line) => ({ ...line, game_id: game.gameId })),
          pitchingLines: boxData.pitchingLines.map((line) => ({ ...line, game_id: game.gameId })),
          linescore: { ...boxData.linescore, game_id: game.gameId },
          rosterEntries: parseScoresRosterHtml(files.roster.text).map((entry) => ({
            ...entry,
            game_id: game.gameId,
          })),
          sourceUrls: {
            index: files.index.url,
            playbyplay: files.playbyplay.url,
            box: files.box.url,
            roster: files.roster.url,
          },
        }
      } catch (error) {
        if (error instanceof NoPlayByPlayAvailableError) {
          const reason = error.reasonCode
          failures.push({ date: game.date, gameId: game.gameId, slug, stage: 'skip', reason })
          logger.error(`[scores:skipped] date=${game.date} game_id=${game.gameId} slug=${slug} stage=skip reason=${reason}`)
          await writeUnresolved(storage, game, {
            game_id: game.gameId,
            slug,
            date: game.date,
            reason,
          })
          continue
        }
        const reason = error instanceof Error ? error.message : String(error)
        failures.push({ date: game.date, gameId: game.gameId, slug, stage: 'parse', reason })
        logger.error(`[scores:failed] date=${game.date} game_id=${game.gameId} stage=parse reason=${reason}`)
        await writeUnresolved(storage, game, {
          game_id: game.gameId,
          slug,
          date: game.date,
          reason,
        })
        continue
      }

      const structuredDir = await writeStructuredFiles(
        workspaceRoot,
        storage,
        game,
        parsed,
        rawPaths,
      )

      try {
        await loadStructuredGameDirectory(database, structuredDir)
        loadedGames += 1
        logger.log(`[scores:ok] date=${game.date} game_id=${game.gameId} files=index,playbyplay,box,roster`)
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        failures.push({ date: game.date, gameId: game.gameId, slug, stage: 'load', reason })
        logger.error(`[scores:failed] date=${game.date} game_id=${game.gameId} stage=load reason=${reason}`)
        await writeUnresolved(storage, game, {
          game_id: game.gameId,
          slug,
          date: game.date,
          reason,
        })
      }

      if ((options.delayMs ?? 0) > 0) {
        await sleepImpl(options.delayMs ?? 0)
      }
    }

    logger.log(
      `[scores:done] year=${options.year} scanned=${games.length} existing_days=${existingDays} discovered=${discoveredGames} loaded=${loadedGames} unresolved=${unresolvedGames} failed=${failures.length}`,
    )
    return {
      year: options.year,
      scannedDays: games.length,
      existingDays,
      discoveredGames,
      loadedGames,
      unresolvedGames,
      failedGames: failures.length,
      failures,
    }
  } finally {
    database.close()
  }
}

async function writeStructuredFiles(
  workspaceRoot: string,
  storage: ObjectStorage,
  game: GameYearRow,
  parsed: {
    game: StructuredGame
    events: ReturnType<typeof parseScoresPlayByPlayHtml>
    battingLines: ReturnType<typeof parseScoresBoxHtml>['battingLines']
    pitchingLines: ReturnType<typeof parseScoresBoxHtml>['pitchingLines']
    linescore: ReturnType<typeof parseScoresBoxHtml>['linescore']
    rosterEntries: ReturnType<typeof parseScoresRosterHtml>
    sourceUrls: Record<'index' | 'playbyplay' | 'box' | 'roster', string>
  },
  rawPaths: Record<'index' | 'playbyplay' | 'box' | 'roster', string>,
) {
  const directory = path.join(workspaceRoot, 'data', 'structured', String(game.year), game.mmdd, game.gameId)
  const project = (filePath: string) => filePath.replace(`${workspaceRoot}${path.sep}`, '').split(path.sep).join('/')
  const key = (fileName: string) => `structured/${game.year}/${game.mmdd}/${game.gameId}/${fileName}`
  const paths = {
    game: storage.localPath(key('game.json')),
    events: storage.localPath(key('events.json')),
    batting: storage.localPath(key('batting_lines.json')),
    pitching: storage.localPath(key('pitching_lines.json')),
    roster: storage.localPath(key('roster.json')),
    linescore: storage.localPath(key('linescore.json')),
    sources: storage.localPath(key('sources.json')),
  }
  const sources = [
    { source_key: 'index', source_url: parsed.sourceUrls.index, raw_path: project(rawPaths.index), structured_path: project(paths.game) },
    { source_key: 'playbyplay', source_url: parsed.sourceUrls.playbyplay, raw_path: project(rawPaths.playbyplay), structured_path: project(paths.events) },
    { source_key: 'box', source_url: parsed.sourceUrls.box, raw_path: project(rawPaths.box), structured_path: project(paths.linescore) },
    { source_key: 'roster', source_url: parsed.sourceUrls.roster, raw_path: project(rawPaths.roster), structured_path: project(paths.roster) },
  ]
  await Promise.all([
    writeJson(storage, key('game.json'), parsed.game),
    writeJson(storage, key('events.json'), parsed.events),
    writeJson(storage, key('batting_lines.json'), parsed.battingLines),
    writeJson(storage, key('pitching_lines.json'), parsed.pitchingLines),
    writeJson(storage, key('roster.json'), parsed.rosterEntries),
    writeJson(storage, key('linescore.json'), parsed.linescore),
    writeJson(storage, key('sources.json'), sources),
  ])
  return directory
}

async function writeUnresolved(
  storage: ObjectStorage,
  game: GameYearRow,
  payload: unknown,
) {
  await writeJson(storage, `structured/${game.year}/${game.mmdd}/${game.gameId}/unresolved.json`, payload)
}

async function writeJson(storage: ObjectStorage, key: string, value: unknown) {
  await storage.putText(key, `${JSON.stringify(value, null, 2)}\n`, 'application/json; charset=utf-8')
}

function parsePositiveInteger(value: string | undefined, label: string): number {
  if (!value || !/^\d+$/.test(value)) {
    throw new Error(`Invalid ${label}: ${value ?? '(missing)'}`)
  }
  return Number.parseInt(value, 10)
}

function parseNonNegativeInteger(value: string | undefined, label: string): number {
  if (!value || !/^\d+$/.test(value)) {
    throw new Error(`Invalid ${label}: ${value ?? '(missing)'}`)
  }
  return Number.parseInt(value, 10)
}

function parseDateString(value: string | undefined, label: string): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid ${label}: ${value ?? '(missing)'}`)
  }
  return value
}

function parseLeague(value: string | undefined): 'all' | 'regular' {
  if (value === 'all' || value === 'regular') {
    return value
  }
  throw new Error(`Invalid league: ${value ?? '(missing)'}`)
}

function buildScoresSlugFromBaseUrl(scoresBaseUrl: string): string {
  const trimmed = scoresBaseUrl.endsWith('/') ? scoresBaseUrl.slice(0, -1) : scoresBaseUrl
  const slug = trimmed.split('/').at(-1)
  if (!slug) {
    throw new Error(`Could not derive scores slug from URL: ${scoresBaseUrl}`)
  }
  return slug
}

function isFarmGameId(gameId: string): boolean {
  return /^f\d{8}/i.test(gameId)
}

function buildDuplicateGroupsWithScores(games: GameYearRow[]): Set<string> {
  const grouped = new Map<string, { total: number; scores: number }>()
  for (const game of games) {
    const key = duplicateGroupKey(game)
    if (!key) {
      continue
    }
    const state = grouped.get(key) ?? { total: 0, scores: 0 }
    state.total += 1
    if (buildScoresBaseUrlFromCanonicalUrl(game.canonicalUrl)) {
      state.scores += 1
    }
    grouped.set(key, state)
  }
  return new Set(
    [...grouped.entries()]
      .filter(([, state]) => state.total > state.scores && state.scores > 0)
      .map(([key]) => key),
  )
}

function duplicateGroupKey(game: GameYearRow): string | null {
  const homeCode = teamCodeFromName(game.homeTeamName)
  const awayCode = teamCodeFromName(game.awayTeamName)
  const venueKey = normalizeVenueForDuplicateKey(game.venue)
  if (!homeCode || !awayCode || !venueKey || !game.startTime || game.gameNumber == null) {
    return null
  }
  return [
    game.date,
    [homeCode, awayCode].sort().join(':'),
    venueKey,
    game.startTime,
    String(game.gameNumber),
  ].join(':')
}

function teamCodeFromName(value: string | null): string | null {
  if (!value) {
    return null
  }
  const normalized = value.toLowerCase()
  const pairs: Array<[string, string]> = [
    ['chunichi', 'd'],
    ['dragons', 'd'],
    ['中日', 'd'],
    ['dena', 'db'],
    ['baystars', 'db'],
    ['横浜dena', 'db'],
    ['dena', 'db'],
    ['hanshin', 't'],
    ['tigers', 't'],
    ['阪神', 't'],
    ['hiroshima', 'c'],
    ['carp', 'c'],
    ['広島', 'c'],
    ['lotte', 'm'],
    ['marines', 'm'],
    ['ロッテ', 'm'],
    ['nippon-ham', 'f'],
    ['fighters', 'f'],
    ['日本ハム', 'f'],
    ['orix', 'b'],
    ['buffaloes', 'b'],
    ['オリックス', 'b'],
    ['rakuten', 'e'],
    ['eagles', 'e'],
    ['楽天', 'e'],
    ['seibu', 'l'],
    ['lions', 'l'],
    ['西武', 'l'],
    ['softbank', 'h'],
    ['hawks', 'h'],
    ['ソフトバンク', 'h'],
    ['yakult', 's'],
    ['swallows', 's'],
    ['ヤクルト', 's'],
    ['yomiuri', 'g'],
    ['giants', 'g'],
    ['読売', 'g'],
    ['巨人', 'g'],
  ]
  return pairs.find(([name]) => normalized.includes(name))?.[1] ?? null
}

function normalizeVenueForDuplicateKey(value: string | null): string | null {
  if (!value) {
    return null
  }
  const normalized = value
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[・･]/g, '')
    .replace(/[（）()]/g, '')
    .replace(/ｄ/g, 'd')
    .replace(/ｆ/g, 'f')
  const pairs: Array<[string, string]> = [
    ['tokyodome', 'tokyo-dome'],
    ['東京ドーム', 'tokyo-dome'],
    ['yokohama', 'yokohama'],
    ['横浜', 'yokohama'],
    ['jingu', 'jingu'],
    ['神宮', 'jingu'],
    ['koshien', 'koshien'],
    ['甲子園', 'koshien'],
    ['kyoceradome', 'kyocera-dome'],
    ['京セラd大阪', 'kyocera-dome'],
    ['vantelindome', 'vantelin-dome'],
    ['バンテリンドーム', 'vantelin-dome'],
    ['esconfield', 'escon-field'],
    ['エスコンf', 'escon-field'],
    ['rakutenmobile', 'rakuten-mobile'],
    ['楽天モバイル', 'rakuten-mobile'],
    ['zozomarine', 'zozo-marine'],
    ['zozoマリン', 'zozo-marine'],
    ['mazdastadium', 'mazda-stadium'],
    ['マツダスタジアム', 'mazda-stadium'],
    ['bellunadome', 'belluna-dome'],
    ['ベルーナドーム', 'belluna-dome'],
    ['paypaydome', 'paypay-dome'],
    ['mizuhopaypay', 'paypay-dome'],
    ['みずほpaypay', 'paypay-dome'],
    ['gifu', 'gifu'],
    ['岐阜', 'gifu'],
    ['koriyama', 'koriyama'],
    ['郡山', 'koriyama'],
    ['omiya', 'omiya'],
    ['県営大宮', 'omiya'],
    ['rakutenlife', 'rakuten-life'],
    ['ほっともっと', 'hotto-motto'],
    ['hotto', 'hotto-motto'],
  ]
  return pairs.find(([name]) => normalized.includes(name))?.[1] ?? normalized
}
