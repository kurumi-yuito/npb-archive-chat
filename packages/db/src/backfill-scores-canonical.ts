import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { parseScoresCalendarHtml } from '@npb/parser'
import { findWorkspaceRoot, type FetchLike } from '../../crawler/src/index'
import { migrateDatabase } from './migrations'
import { buildScoresBaseUrl, buildScoresBaseUrlFromCanonicalUrl } from './scores-fetcher'
import { openDatabase } from './sqlite'

export type BackfillScoresCanonicalArgs = {
  year: number
  sqlitePath: string
  source?: 'verified-candidates' | 'calendar-live' | 'calendar-raw'
  league?: 'all' | 'regular'
  limit?: number
  dateFrom?: string
  dateTo?: string
  workspaceRoot?: string
  userAgent?: string
}

export type BackfillScoresCanonicalResult = {
  year: number
  league: 'all' | 'regular'
  scannedGames: number
  alreadyScoresCanonical: number
  updatedGames: number
  unavailableGames: number
  failedGames: number
  calendarPages?: {
    scanned: number
    loaded: number
    failed: number
    failures: Array<{
      date: string
      mmdd: string
      reason: 'calendar_403' | 'calendar_missing' | 'calendar_fetch_failed' | 'calendar_parse_empty'
    }>
  }
  failures: Array<{
    gameId: string
    reason: string
    candidates: string[]
  }>
}

type DiscoverySnapshot = {
  games?: DiscoveryGameSnapshot[]
}

type DiscoveryGameSnapshot = {
  gameId?: string
  downloader?: {
    scoreBaseUrl?: string
    pages?: {
      index?: string
    }
  }
}

type GameCanonicalRow = {
  gameId: string
  year: number
  mmdd: string
  date: string
  homeTeamName: string | null
  awayTeamName: string | null
  venue: string | null
  startTime: string | null
  gameNumber: number | null
  canonicalUrl: string | null
}

type CandidateProbe = {
  url: string
  rowGameId?: string
}

const DEFAULT_SCORE_GAME_NUMBERS = Array.from({ length: 30 }, (_, index) =>
  String(index + 1).padStart(2, '0'),
)
const CANDIDATE_FETCH_TIMEOUT_MS = 5000

const DEFAULT_HEADERS = {
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'ja,en-US;q=0.9,en;q=0.8',
  referer: 'https://npb.jp/',
} as const

export function parseBackfillScoresCanonicalArgs(argv: string[]): BackfillScoresCanonicalArgs {
  const args = [...argv]
  while (args[0] === '--') {
    args.shift()
  }

  let year: number | undefined
  let sqlitePath: string | undefined
  let source: 'verified-candidates' | 'calendar-live' | 'calendar-raw' | undefined
  let league: 'all' | 'regular' | undefined
  let limit: number | undefined
  let dateFrom: string | undefined
  let dateTo: string | undefined
  let workspaceRoot: string | undefined
  let userAgent: string | undefined

  while (args.length > 0) {
    const arg = args.shift()
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
    if (arg === '--source') {
      source = parseSource(args.shift())
      continue
    }
    if (arg?.startsWith('--source=')) {
      source = parseSource(arg.slice('--source='.length))
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
    if (arg === '--limit') {
      limit = parsePositiveInteger(args.shift(), 'limit')
      continue
    }
    if (arg?.startsWith('--limit=')) {
      limit = parsePositiveInteger(arg.slice('--limit='.length), 'limit')
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
    if (arg === '--user-agent') {
      userAgent = args.shift()
      continue
    }
    if (arg?.startsWith('--user-agent=')) {
      userAgent = arg.slice('--user-agent='.length)
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

  return { year, sqlitePath, source, league, limit, dateFrom, dateTo, workspaceRoot, userAgent }
}

export async function runBackfillScoresCanonical(
  options: BackfillScoresCanonicalArgs & {
    fetchImpl?: FetchLike
  },
): Promise<BackfillScoresCanonicalResult> {
  const league = options.league ?? 'all'
  const source = options.source ?? 'verified-candidates'
  const workspaceRoot = path.resolve(
    options.workspaceRoot ?? (await findWorkspaceRoot(process.cwd())),
  )
  const sqlitePath = path.resolve(workspaceRoot, options.sqlitePath)
  const fetchImpl = options.fetchImpl ?? fetch
  const headers = {
    ...DEFAULT_HEADERS,
    'user-agent':
      options.userAgent ??
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 npb-archive-chat',
  }

  const discoveryByGameId = await readDiscoveryByGameId(
    path.join(workspaceRoot, 'data', 'discovery', `${options.year}.json`),
  )

  const database = openDatabase(sqlitePath)
  try {
    migrateDatabase(database)
    const rows = listGames(database, options.year, league, options.limit, options.dateFrom, options.dateTo)
    if (source === 'calendar-live' || source === 'calendar-raw') {
      return await runCalendarBackfill({
        database,
        rows,
        year: options.year,
        league,
        source,
        workspaceRoot,
        fetchImpl,
        headers,
      })
    }

    const sourceUrlsByGameId = listSourceScoreUrlsByGameId(database, options.year)

    let alreadyScoresCanonical = 0
    let updatedGames = 0
    let unavailableGames = 0
    const failures: BackfillScoresCanonicalResult['failures'] = []
    const update = database.prepare('UPDATE games SET canonical_url = ? WHERE game_id = ?')

    const groups = groupGamesForCanonicalBackfill(rows)
    const handledGameIds = new Set<string>()

    for (const group of groups) {
      const scoresRows = group.filter((row) => buildScoresBaseUrlFromCanonicalUrl(row.canonicalUrl))
      alreadyScoresCanonical += scoresRows.length
      for (const row of scoresRows) {
        handledGameIds.add(row.gameId)
      }

      const pendingRows = group.filter((row) => !handledGameIds.has(row.gameId))
      if (pendingRows.length === 0) {
        continue
      }

      const expectedScoresForGroup = Math.max(1, Math.ceil(group.length / 2))
      const expectedAdditionalScores = Math.max(0, expectedScoresForGroup - scoresRows.length)
      if (expectedAdditionalScores === 0) {
        for (const row of pendingRows) {
          unavailableGames += 1
          handledGameIds.add(row.gameId)
          failures.push({
            gameId: row.gameId,
            reason: 'duplicate_or_reversed_game',
            candidates: scoresRows.map((scoresRow) => scoresRow.canonicalUrl).filter((url): url is string => Boolean(url)),
          })
        }
        continue
      }

      const probes = buildGroupCandidateIndexUrls({
        rows: group,
        discoveryByGameId,
        sourceUrlsByGameId,
      })
      process.stderr.write(
        `[backfill:candidates] date=${group[0]?.date ?? ''} games=${group.map((row) => row.gameId).join(',')} candidates=${probes.length}\n`,
      )
      const reachableUrls: string[] = []
      let attemptedCandidates = 0
      for (const probe of probes) {
        attemptedCandidates += 1
        if (await isReachableIndex(fetchImpl, probe.url, headers)) {
          reachableUrls.push(probe.url)
          if (reachableUrls.length >= expectedAdditionalScores) {
            break
          }
        }
      }
      process.stderr.write(
        `[backfill:probed] date=${group[0]?.date ?? ''} games=${group.map((row) => row.gameId).join(',')} tried=${attemptedCandidates}/${probes.length} reachable=${reachableUrls.length}\n`,
      )

      const claimedRows = new Set<string>()
      for (const url of reachableUrls) {
        if (scoresRows.some((row) => row.canonicalUrl === url)) {
          continue
        }
        const row = selectCanonicalRowForUrl(pendingRows, url, claimedRows)
        if (!row) {
          continue
        }
        update.run(url, row.gameId)
        updatedGames += 1
        claimedRows.add(row.gameId)
        handledGameIds.add(row.gameId)
      }

      for (const row of pendingRows) {
        if (handledGameIds.has(row.gameId)) {
          continue
        }
        unavailableGames += 1
        handledGameIds.add(row.gameId)
        failures.push({
          gameId: row.gameId,
          reason: reachableUrls.length > 0 || scoresRows.length > 0
            ? 'duplicate_or_reversed_game'
            : 'scores_canonical_not_available',
          candidates: probes.map((probe) => probe.url),
        })
      }
    }

    return {
      year: options.year,
      league,
      scannedGames: rows.length,
      alreadyScoresCanonical,
      updatedGames,
      unavailableGames,
      failedGames: failures.length,
      failures,
    }
  } finally {
    database.close()
  }
}

function listGames(
  database: ReturnType<typeof openDatabase>,
  year: number,
  league: 'all' | 'regular',
  limit?: number,
  dateFrom?: string,
  dateTo?: string,
): GameCanonicalRow[] {
  const clauses = ['year = ?']
  const params: Array<number | string> = [year]
  if (league === 'regular') {
    clauses.push("game_id LIKE 'r________%'")
  }
  if (dateFrom) {
    clauses.push('date >= ?')
    params.push(dateFrom)
  }
  if (dateTo) {
    clauses.push('date <= ?')
    params.push(dateTo)
  }
  const limitClause = typeof limit === 'number' ? 'LIMIT ?' : ''
  if (typeof limit === 'number') {
    params.push(limit)
  }
  return database
    .prepare(
      `SELECT
        game_id AS gameId,
        year AS year,
        mmdd AS mmdd,
        date AS date,
        home_team_name AS homeTeamName,
        away_team_name AS awayTeamName,
        venue AS venue,
        start_time AS startTime,
        game_number AS gameNumber,
        canonical_url AS canonicalUrl
      FROM games
      WHERE ${clauses.join(' AND ')}
      ORDER BY date ASC, game_id ASC
      ${limitClause}`,
    )
    .all(...params) as GameCanonicalRow[]
}

function listSourceScoreUrlsByGameId(
  database: ReturnType<typeof openDatabase>,
  year: number,
): Map<string, string[]> {
  const rows = database
    .prepare(
      `SELECT source_snapshots.game_id AS gameId, source_snapshots.source_url AS sourceUrl
      FROM source_snapshots
      JOIN games ON games.game_id = source_snapshots.game_id
      WHERE games.year = ?
        AND source_snapshots.source_url LIKE 'https://npb.jp/scores/%'`,
    )
    .all(year) as Array<{ gameId: string; sourceUrl: string }>
  const urlsByGameId = new Map<string, string[]>()
  for (const row of rows) {
    const urls = urlsByGameId.get(row.gameId) ?? []
    urls.push(row.sourceUrl)
    urlsByGameId.set(row.gameId, urls)
  }
  return urlsByGameId
}

async function runCalendarBackfill(input: {
  database: ReturnType<typeof openDatabase>
  rows: GameCanonicalRow[]
  year: number
  league: 'all' | 'regular'
  source: 'calendar-live' | 'calendar-raw'
  workspaceRoot: string
  fetchImpl: FetchLike
  headers: Record<string, string>
}): Promise<BackfillScoresCanonicalResult> {
  const rowsByDate = new Map<string, GameCanonicalRow[]>()
  for (const row of input.rows) {
    const dateRows = rowsByDate.get(row.date) ?? []
    dateRows.push(row)
    rowsByDate.set(row.date, dateRows)
  }

  let alreadyScoresCanonical = 0
  let updatedGames = 0
  let unavailableGames = 0
  let loadedCalendarPages = 0
  const failures: BackfillScoresCanonicalResult['failures'] = []
  const calendarFailures: NonNullable<BackfillScoresCanonicalResult['calendarPages']>['failures'] = []
  const update = input.database.prepare('UPDATE games SET canonical_url = ? WHERE game_id = ?')

  for (const [date, rows] of rowsByDate) {
    const mmdd = rows[0]?.mmdd ?? date.slice(5).replace('-', '')
    const calendarHtml = await readCalendarHtml({
      source: input.source,
      workspaceRoot: input.workspaceRoot,
      year: input.year,
      mmdd,
      fetchImpl: input.fetchImpl,
      headers: input.headers,
    })

    if (!calendarHtml.ok) {
      calendarFailures.push({ date, mmdd, reason: calendarHtml.reason })
      for (const row of rows) {
        if (buildScoresBaseUrlFromCanonicalUrl(row.canonicalUrl)) {
          alreadyScoresCanonical += 1
        } else {
          unavailableGames += 1
          failures.push({ gameId: row.gameId, reason: calendarHtml.reason, candidates: [] })
        }
      }
      continue
    }

    const calendarGames = parseScoresCalendarHtml(calendarHtml.html, input.year, mmdd)
    if (calendarGames.length === 0) {
      calendarFailures.push({ date, mmdd, reason: 'calendar_parse_empty' })
    } else {
      loadedCalendarPages += 1
    }
    const calendarByPair = groupCalendarGamesByPair(calendarGames)

    for (const row of rows) {
      if (buildScoresBaseUrlFromCanonicalUrl(row.canonicalUrl)) {
        alreadyScoresCanonical += 1
        continue
      }

      const match = findCalendarMatch(row, calendarByPair)
      if (match) {
        update.run(`${match.scoresBaseUrl}index.html`, row.gameId)
        updatedGames += 1
      } else {
        unavailableGames += 1
        failures.push({
          gameId: row.gameId,
          reason: calendarGames.length === 0 ? 'calendar_parse_empty' : 'scores_canonical_not_available',
          candidates: calendarGames.map((game) => `${game.scoresBaseUrl}index.html`),
        })
      }
    }
  }

  return {
    year: input.year,
    league: input.league,
    scannedGames: input.rows.length,
    alreadyScoresCanonical,
    updatedGames,
    unavailableGames,
    failedGames: failures.length,
    calendarPages: {
      scanned: rowsByDate.size,
      loaded: loadedCalendarPages,
      failed: calendarFailures.length,
      failures: calendarFailures,
    },
    failures,
  }
}

async function readCalendarHtml(input: {
  source: 'calendar-live' | 'calendar-raw'
  workspaceRoot: string
  year: number
  mmdd: string
  fetchImpl: FetchLike
  headers: Record<string, string>
}): Promise<
  | { ok: true; html: string }
  | { ok: false; reason: 'calendar_403' | 'calendar_missing' | 'calendar_fetch_failed' }
> {
  if (input.source === 'calendar-raw') {
    try {
      const html = await readFile(
        path.join(input.workspaceRoot, 'data', 'raw-scores-calendar', String(input.year), input.mmdd, 'index.html'),
        'utf8',
      )
      return { ok: true, html }
    } catch (error) {
      const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
      if (code === 'ENOENT') {
        return { ok: false, reason: 'calendar_missing' }
      }
      throw error
    }
  }

  try {
    const response = await input.fetchImpl(`https://npb.jp/scores/${input.year}/${input.mmdd}/`, {
      headers: input.headers,
    })
    if (response.status === 403) {
      return { ok: false, reason: 'calendar_403' }
    }
    if (!response.ok) {
      return { ok: false, reason: 'calendar_fetch_failed' }
    }
    return { ok: true, html: await response.text() }
  } catch {
    return { ok: false, reason: 'calendar_fetch_failed' }
  }
}

async function readDiscoveryByGameId(discoveryPath: string): Promise<Map<string, DiscoveryGameSnapshot>> {
  try {
    const parsed = JSON.parse(await readFile(discoveryPath, 'utf8')) as DiscoverySnapshot
    const games = new Map<string, DiscoveryGameSnapshot>()
    for (const game of parsed.games ?? []) {
      if (game.gameId) {
        games.set(game.gameId, game)
      }
    }
    return games
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
    if (code === 'ENOENT') {
      return new Map()
    }
    throw error
  }
}

function buildCandidateIndexUrls(input: {
  row: GameCanonicalRow
  discovery?: DiscoveryGameSnapshot
  sourceUrls: string[]
}): string[] {
  const candidates: string[] = []
  for (const sourceUrl of input.sourceUrls) {
    const indexUrl = normalizeScoresIndexUrl(sourceUrl)
    if (indexUrl) {
      candidates.push(indexUrl)
    }
  }
  const discoveryIndex = normalizeScoresIndexUrl(input.discovery?.downloader?.pages?.index)
  if (discoveryIndex) {
    candidates.push(discoveryIndex)
  }
  const discoveryBase = input.discovery?.downloader?.scoreBaseUrl
  if (discoveryBase) {
    candidates.push(toIndexUrl(discoveryBase))
  }
  candidates.push(`${buildScoresBaseUrl(input.row.year, input.row.mmdd, input.row.gameId)}index.html`)
  return [...new Set(candidates)]
}

function buildGroupCandidateIndexUrls(input: {
  rows: GameCanonicalRow[]
  discoveryByGameId: Map<string, DiscoveryGameSnapshot>
  sourceUrlsByGameId: Map<string, string[]>
}): CandidateProbe[] {
  const probes: CandidateProbe[] = []
  for (const row of input.rows) {
    for (const url of buildCandidateIndexUrls({
      row,
      discovery: input.discoveryByGameId.get(row.gameId),
      sourceUrls: input.sourceUrlsByGameId.get(row.gameId) ?? [],
    })) {
      probes.push({ url, rowGameId: row.gameId })
    }
  }

  const pair = teamPairFromRow(input.rows[0])
  const first = input.rows[0]
  if (pair && first) {
    const suffixNumbers = new Set(DEFAULT_SCORE_GAME_NUMBERS)
    for (const row of input.rows) {
      const slug = slugFromGameId(row.gameId)
      const match = slug?.match(/^[a-z0-9]+-[a-z0-9]+-(\d{2})$/i)
      if (match?.[1]) {
        suffixNumbers.add(match[1])
        suffixNumbers.add(flipOneTwoSuffix(match[1]))
      }
    }
    const pairCandidates = buildScoresTeamCodePairCandidates(pair[0], pair[1])
    for (const [left, right] of pairCandidates) {
      for (const number of suffixNumbers) {
        probes.push({
          url: `https://npb.jp/scores/${first.year}/${first.mmdd}/${left}-${right}-${number}/index.html`,
        })
      }
    }
  }

  const seen = new Set<string>()
  return probes.filter((probe) => {
    if (seen.has(probe.url)) {
      return false
    }
    seen.add(probe.url)
    return true
  })
}

function buildScoresTeamCodePairCandidates(left: string, right: string): Array<[string, string]> {
  const candidates: Array<[string, string]> = []
  for (const leftVariant of scoresTeamCodeVariants(left)) {
    for (const rightVariant of scoresTeamCodeVariants(right)) {
      candidates.push([leftVariant, rightVariant])
      candidates.push([rightVariant, leftVariant])
    }
  }
  const seen = new Set<string>()
  return candidates.filter((candidate) => {
    const key = `${candidate[0]}:${candidate[1]}`
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

function scoresTeamCodeVariants(code: string): string[] {
  if (code === 'b') {
    return ['b', 'bs']
  }
  return [code]
}

function groupGamesForCanonicalBackfill(rows: GameCanonicalRow[]): GameCanonicalRow[][] {
  const grouped = new Map<string, GameCanonicalRow[]>()
  for (const row of rows) {
    const key = duplicateGroupKey(row) ?? `game:${row.gameId}`
    const group = grouped.get(key) ?? []
    group.push(row)
    grouped.set(key, group)
  }
  return [...grouped.values()]
}

function duplicateGroupKey(row: GameCanonicalRow): string | null {
  const pair = teamPairFromRow(row)
  const venueKey = normalizeVenueForDuplicateKey(row.venue)
  if (!pair || !venueKey || !row.startTime || row.gameNumber == null) {
    return null
  }
  return [row.date, pair[0], pair[1], venueKey, row.startTime, String(row.gameNumber)].join(':')
}

function teamPairFromRow(row: GameCanonicalRow | undefined): [string, string] | null {
  if (!row) {
    return null
  }
  const homeCode = teamCodeFromName(row.homeTeamName)
  const awayCode = teamCodeFromName(row.awayTeamName)
  if (!homeCode || !awayCode) {
    return null
  }
  return [homeCode, awayCode].sort() as [string, string]
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
    ['ほっともっと', 'hotto-motto'],
    ['hotto', 'hotto-motto'],
  ]
  return pairs.find(([name]) => normalized.includes(name))?.[1] ?? normalized
}

function selectCanonicalRowForUrl(
  rows: GameCanonicalRow[],
  url: string,
  claimedRows: Set<string>,
): GameCanonicalRow | null {
  const slug = slugFromScoresIndexUrl(url)
  if (!slug) {
    return rows.find((row) => !claimedRows.has(row.gameId)) ?? null
  }
  const slugParts = slug.match(/^([a-z0-9]+)-([a-z0-9]+)-(\d{2})$/i)
  const unclaimed = rows.filter((row) => !claimedRows.has(row.gameId))
  return (
    unclaimed.find((row) => slugFromGameId(row.gameId) === slug) ??
    unclaimed.find((row) => {
      const rowSlug = slugFromGameId(row.gameId)
      return rowSlug ? rowSlug.startsWith(`${slugParts?.[1]}-${slugParts?.[2]}-`) : false
    }) ??
    unclaimed[0] ??
    null
  )
}

function slugFromScoresIndexUrl(url: string): string | null {
  const match = url.match(/^https:\/\/npb\.jp\/scores\/\d{4}\/\d{4}\/([^/]+)\/index\.html$/i)
  return match?.[1] ?? null
}

function slugFromGameId(gameId: string): string | null {
  const match = gameId.match(/^[rf]\d{8}(.+)$/i)
  return match?.[1] ?? null
}

function groupCalendarGamesByPair(
  calendarGames: ReturnType<typeof parseScoresCalendarHtml>,
): Map<string, ReturnType<typeof parseScoresCalendarHtml>> {
  const grouped = new Map<string, ReturnType<typeof parseScoresCalendarHtml>>()
  for (const game of calendarGames) {
    const pair = pairKeyFromSlug(game.slug)
    if (!pair) {
      continue
    }
    const games = grouped.get(pair) ?? []
    games.push(game)
    grouped.set(pair, games)
  }
  return grouped
}

function findCalendarMatch(
  row: GameCanonicalRow,
  calendarByPair: Map<string, ReturnType<typeof parseScoresCalendarHtml>>,
): ReturnType<typeof parseScoresCalendarHtml>[number] | null {
  const homeCode = teamCodeFromName(row.homeTeamName)
  const awayCode = teamCodeFromName(row.awayTeamName)
  if (!homeCode || !awayCode) {
    return null
  }

  const matches = calendarByPair.get([homeCode, awayCode].sort().join(':')) ?? []
  if (matches.length === 0) {
    return null
  }
  if (matches.length === 1) {
    return matches[0]!
  }
  const rowSlug = row.gameId.replace(/^[rf]\d{8}/i, '')
  return matches.find((game) => game.slug === rowSlug) ?? matches[0]!
}

function pairKeyFromSlug(slug: string): string | null {
  const match = slug.match(/^([a-z0-9]+)-([a-z0-9]+)-\d{2}$/i)
  if (!match?.[1] || !match[2]) {
    return null
  }
  return [match[1], match[2]].sort().join(':')
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

function normalizeScoresIndexUrl(value: string | undefined): string | null {
  if (!value || !value.startsWith('https://npb.jp/scores/')) {
    return null
  }
  if (value.endsWith('/index.html')) {
    return value
  }
  if (value.endsWith('/')) {
    return `${value}index.html`
  }
  if (/\/(?:playbyplay|box|roster)\.html$/i.test(value)) {
    return value.replace(/\/(?:playbyplay|box|roster)\.html$/i, '/index.html')
  }
  return `${value}/index.html`
}

function toIndexUrl(baseUrl: string): string {
  if (baseUrl.endsWith('/index.html')) {
    return baseUrl
  }
  return `${baseUrl.replace(/\/$/, '')}/index.html`
}

async function isReachableIndex(
  fetchImpl: FetchLike,
  url: string,
  headers: Record<string, string>,
): Promise<boolean> {
  const head = await fetchWithTimeout(fetchImpl, url, { method: 'HEAD', headers })
  if (head.ok) {
    return true
  }
  if (head.status === 404) {
    return false
  }
  const get = await fetchWithTimeout(fetchImpl, url, { method: 'GET', headers })
  return get.ok
}

async function fetchWithTimeout(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), CANDIDATE_FETCH_TIMEOUT_MS)
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal })
  } catch {
    return new Response('', { status: 599 })
  } finally {
    clearTimeout(timeout)
  }
}

function flipOneTwoSuffix(value: string): string {
  if (value === '01') {
    return '02'
  }
  if (value === '02') {
    return '01'
  }
  return value
}

function parsePositiveInteger(value: string | undefined, label: string): number {
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

function parseSource(value: string | undefined): 'verified-candidates' | 'calendar-live' | 'calendar-raw' {
  if (value === 'verified-candidates' || value === 'calendar-live' || value === 'calendar-raw') {
    return value
  }
  throw new Error(`Invalid source: ${value ?? '(missing)'}`)
}
