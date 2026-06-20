import path from 'node:path'
import type { FetchLike, LoggerLike, SleepLike } from '../../crawler/src/index'
import { createDownloadLogger, findWorkspaceRoot } from '../../crawler/src/index'
import { migrateDatabase } from './migrations'
import { sqliteDatabaseToQuery } from './query-driver'
import { openDatabase, withTransaction, type SqliteDatabase } from './sqlite'
import type { QueryDatabase } from './query-driver'

const DEFAULT_LOG_PATH = path.join('data', 'logs', 'enrich-bis-farm-boxes.log')

export type EnrichBisFarmBoxesArgs = {
  year: number
  sqlitePath: string
  limit?: number
  dateFrom?: string
  dateTo?: string
  workspaceRoot?: string
  delayMs?: number
  userAgent?: string
}

export type EnrichBisFarmBoxesResult = {
  year: number
  total: number
  skipped: number
  loaded: number
  failed: number
  failures: Array<{ gameId: string; date: string; reason: string }>
}

export function parseEnrichBisFarmBoxesArgs(argv: string[]): EnrichBisFarmBoxesArgs {
  const args = [...argv]
  while (args[0] === '--') args.shift()

  let year: number | undefined
  let sqlitePath: string | undefined
  let limit: number | undefined
  let dateFrom: string | undefined
  let dateTo: string | undefined
  let workspaceRoot: string | undefined
  let delayMs: number | undefined
  let userAgent: string | undefined

  while (args.length > 0) {
    const arg = args.shift()
    if (arg === '--year') { year = parsePositiveInt(args.shift(), 'year'); continue }
    if (arg?.startsWith('--year=')) { year = parsePositiveInt(arg.slice('--year='.length), 'year'); continue }
    if (arg === '--sqlite-path') { sqlitePath = args.shift(); continue }
    if (arg?.startsWith('--sqlite-path=')) { sqlitePath = arg.slice('--sqlite-path='.length); continue }
    if (arg === '--limit') { limit = parsePositiveInt(args.shift(), 'limit'); continue }
    if (arg?.startsWith('--limit=')) { limit = parsePositiveInt(arg.slice('--limit='.length), 'limit'); continue }
    if (arg === '--from') { dateFrom = parseDateStr(args.shift(), 'from'); continue }
    if (arg?.startsWith('--from=')) { dateFrom = parseDateStr(arg.slice('--from='.length), 'from'); continue }
    if (arg === '--to') { dateTo = parseDateStr(args.shift(), 'to'); continue }
    if (arg?.startsWith('--to=')) { dateTo = parseDateStr(arg.slice('--to='.length), 'to'); continue }
    if (arg === '--workspace-root') { workspaceRoot = args.shift(); continue }
    if (arg?.startsWith('--workspace-root=')) { workspaceRoot = arg.slice('--workspace-root='.length); continue }
    if (arg === '--delay-ms') { delayMs = parseNonNegativeInt(args.shift(), 'delay-ms'); continue }
    if (arg?.startsWith('--delay-ms=')) { delayMs = parseNonNegativeInt(arg.slice('--delay-ms='.length), 'delay-ms'); continue }
    if (arg === '--user-agent') { userAgent = args.shift(); continue }
    if (arg?.startsWith('--user-agent=')) { userAgent = arg.slice('--user-agent='.length); continue }
    throw new Error(`Unknown argument: ${arg}`)
  }

  if (!year) throw new Error('Missing required argument: --year')
  if (!sqlitePath) throw new Error('Missing required argument: --sqlite-path')
  return { year, sqlitePath, limit, dateFrom, dateTo, workspaceRoot, delayMs, userAgent }
}

export async function runBisFarmBoxEnrichment(
  options: EnrichBisFarmBoxesArgs & {
    fetchImpl?: FetchLike
    sleepImpl?: SleepLike
    logger?: LoggerLike
  },
): Promise<EnrichBisFarmBoxesResult> {
  const workspaceRoot = path.resolve(
    options.workspaceRoot ?? (await findWorkspaceRoot(process.cwd())),
  )
  const sqlitePath = path.resolve(workspaceRoot, options.sqlitePath)
  const fetchImpl = options.fetchImpl ?? fetch
  const sleepImpl = options.sleepImpl ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)))
  const logger = options.logger ?? (await createDownloadLogger(path.join(workspaceRoot, DEFAULT_LOG_PATH)))
  const headers = {
    'user-agent': options.userAgent ?? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 npb-archive-chat',
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'ja,en-US;q=0.9,en;q=0.8',
    referer: 'https://npb.jp/',
  } as const

  const database = openDatabase(sqlitePath)
  try {
    migrateDatabase(database)
    const queryDb = sqliteDatabaseToQuery(database)
    const games = await listFarmGamesNeedingBoxes(queryDb, options.year, {
      limit: options.limit,
      dateFrom: options.dateFrom,
      dateTo: options.dateTo,
    })

    logger.log(`[bis-farm-boxes:start] year=${options.year} games=${games.length}`)

    const failures: EnrichBisFarmBoxesResult['failures'] = []
    let skipped = 0
    let loaded = 0

    for (let i = 0; i < games.length; i++) {
      const game = games[i]!
      const bisUrl = deriveBisFarmJapaneseUrl(game.canonicalUrl)
      if (!bisUrl) {
        failures.push({ gameId: game.gameId, date: game.date, reason: 'cannot_derive_bis_url' })
        logger.error(`[bis-farm-boxes:skip] game_id=${game.gameId} reason=cannot_derive_bis_url`)
        skipped++
        continue
      }

      let html: string
      try {
        const response = await fetchWithRetry(fetchImpl, bisUrl, headers)
        if (!response.ok) {
          if (response.status === 404) {
            skipped++
            logger.log(`[bis-farm-boxes:skip] game_id=${game.gameId} status=404 url=${bisUrl}`)
            continue
          }
          throw new Error(`HTTP ${response.status}`)
        }
        html = await response.text()
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        failures.push({ gameId: game.gameId, date: game.date, reason })
        logger.error(`[bis-farm-boxes:failed] game_id=${game.gameId} reason=${reason}`)
        continue
      }

      const parsed = parseBisFarmBoxHtml(html, bisUrl)
      if (!parsed || (parsed.pitchingLines.length === 0 && parsed.battingLines.length === 0)) {
        skipped++
        logger.log(`[bis-farm-boxes:skip] game_id=${game.gameId} reason=no_box_data url=${bisUrl}`)
        continue
      }

      try {
        insertBisFarmBoxLines(database, game.gameId, parsed)
        loaded++
        logger.log(`[bis-farm-boxes:ok] game_id=${game.gameId} date=${game.date} pitching=${parsed.pitchingLines.length} batting=${parsed.battingLines.length}`)
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        failures.push({ gameId: game.gameId, date: game.date, reason })
        logger.error(`[bis-farm-boxes:failed] game_id=${game.gameId} stage=insert reason=${reason}`)
      }

      if ((options.delayMs ?? 0) > 0) {
        await sleepImpl(options.delayMs ?? 0)
      }
    }

    logger.log(`[bis-farm-boxes:done] year=${options.year} total=${games.length} skipped=${skipped} loaded=${loaded} failed=${failures.length}`)
    return { year: options.year, total: games.length, skipped, loaded, failed: failures.length, failures }
  } finally {
    database.close()
  }
}

// ---- DB helpers ----

type FarmGameRow = {
  gameId: string
  date: string
  year: number
  mmdd: string
  canonicalUrl: string | null
}

async function listFarmGamesNeedingBoxes(
  database: QueryDatabase,
  year: number,
  options: { limit?: number; dateFrom?: string; dateTo?: string } = {},
): Promise<FarmGameRow[]> {
  const clauses = [`games.year = ?`, `games.game_id LIKE 'f________%'`]
  const params: Array<number | string> = [year]
  if (options.dateFrom) { clauses.push('games.date >= ?'); params.push(options.dateFrom) }
  if (options.dateTo) { clauses.push('games.date <= ?'); params.push(options.dateTo) }
  const limitClause = typeof options.limit === 'number' ? 'LIMIT ?' : ''
  if (typeof options.limit === 'number') params.push(options.limit)
  const rows = await database.prepare(
    `SELECT
      games.game_id AS gameId,
      games.date AS date,
      games.year AS year,
      games.mmdd AS mmdd,
      games.canonical_url AS canonicalUrl
    FROM games
    LEFT JOIN pitching_lines ON pitching_lines.game_id = games.game_id
    WHERE ${clauses.join(' AND ')}
    AND pitching_lines.id IS NULL
    ORDER BY games.date ASC, games.game_id ASC
    ${limitClause}`,
  ).all(...params)
  return rows as FarmGameRow[]
}

function deriveBisFarmJapaneseUrl(
  canonicalUrl: string | null,
): string | null {
  if (canonicalUrl) {
    // Remove /eng/ from canonical URL: bis/eng/YYYY/games/fsXXX.html → bis/YYYY/games/fsXXX.html
    const normalized = canonicalUrl.replace(/\/eng\//i, '/')
    if (/\/bis\/\d{4}\/games\/fs\d+\.html$/i.test(normalized)) {
      if (!normalized.startsWith('http')) {
        return `https://npb.jp${normalized}`
      }
      return normalized.replace(/^http:\/\//i, 'https://')
    }
  }
  // Fallback: derive from game_id: f20260318db-l-02 → fs2026031800133?
  // We can't derive the NPB internal game number, so skip if canonical_url is missing
  return null
}

export type BisFarmBoxParsed = {
  pitchingLines: BisFarmPitchingLine[]
  battingLines: BisFarmBattingLine[]
  sourceUrl: string
}

type BisFarmPitchingLine = {
  team: string
  pitcherName: string
  decision: string | null
  inningsPitched: string | null
  battersFaced: number | null
  hitsAllowed: number | null
  walks: number | null
  hitByPitch: number | null
  strikeouts: number | null
  earnedRuns: number | null
  sequence: number
}

type BisFarmBattingLine = {
  team: string
  playerName: string
  position: string | null
  atBats: number | null
  hits: number | null
  rbis: number | null
  walks: number | null
  hitByPitch: number | null
  strikeouts: number | null
  sequence: number
}

export function parseBisFarmBoxHtml(html: string, sourceUrl: string): BisFarmBoxParsed | null {
  const gmdivtbl = extractDivById(html, 'gmdivtbl')
  if (!gmdivtbl) return null

  const tables = extractTablesByClass(gmdivtbl, 'gmtbltop')
  if (tables.length < 6) return null

  const [headerTable0, headerTable1, battingTable0, battingTable1, pitchingTable0, pitchingTable1] = tables

  const team0 = extractTeamName(headerTable0!)
  const team1 = extractTeamName(headerTable1!)

  const pitchingLines: BisFarmPitchingLine[] = [
    ...parsePitchingTable(pitchingTable0!, team0),
    ...parsePitchingTable(pitchingTable1!, team1),
  ]
  const battingLines: BisFarmBattingLine[] = [
    ...parseBattingTable(battingTable0!, team0),
    ...parseBattingTable(battingTable1!, team1),
  ]

  return { pitchingLines, battingLines, sourceUrl }
}

function extractTeamName(tableHtml: string): string {
  const match = tableHtml.match(/<td\b[^>]*class="gmtblteam"[^>]*>([\s\S]*?)<\/td>/i)
  return match ? cellText(match[1]) : '—'
}

function parsePitchingTable(tableHtml: string, team: string): BisFarmPitchingLine[] {
  const rows = extractGmStatDataRows(tableHtml)
  const lines: BisFarmPitchingLine[] = []
  let seq = 0
  for (const rowHtml of rows) {
    const cells = extractCellTexts(rowHtml)
    if (cells.length < 10) continue
    const pitcherName = cells[1]
    if (!pitcherName) continue
    const decisionRaw = cells[0] ?? ''
    const decision = decisionRaw.includes('○') ? '勝'
      : decisionRaw.includes('●') ? '敗'
      : decisionRaw.includes('Ｓ') || decisionRaw.includes('S') ? 'セ'
      : null
    const inningsInt = cells[2] ?? ''
    const inningsFrac = cells[3] ?? ''
    const inningsPitched = inningsFrac ? `${inningsInt} ${inningsFrac}` : inningsInt || null
    lines.push({
      team,
      pitcherName,
      decision,
      inningsPitched,
      battersFaced: parseIntOrNull(cells[4]),
      hitsAllowed: parseIntOrNull(cells[5]),
      walks: parseIntOrNull(cells[6]),
      hitByPitch: parseIntOrNull(cells[7]),
      strikeouts: parseIntOrNull(cells[8]),
      earnedRuns: parseIntOrNull(cells[9]),
      sequence: seq++,
    })
  }
  return lines
}

function parseBattingTable(tableHtml: string, team: string): BisFarmBattingLine[] {
  const rows = extractGmStatDataRows(tableHtml)
  const lines: BisFarmBattingLine[] = []
  let seq = 0
  for (const rowHtml of rows) {
    const cells = extractCellTexts(rowHtml)
    if (cells.length < 8) continue
    const playerName = cells[1]
    if (!playerName) continue
    lines.push({
      team,
      playerName,
      position: cells[0] || null,
      atBats: parseIntOrNull(cells[2]),
      hits: parseIntOrNull(cells[3]),
      rbis: parseIntOrNull(cells[4]),
      walks: parseIntOrNull(cells[5]),
      hitByPitch: parseIntOrNull(cells[6]),
      strikeouts: parseIntOrNull(cells[7]),
      sequence: seq++,
    })
  }
  return lines
}

function insertBisFarmBoxLines(database: SqliteDatabase, gameId: string, data: BisFarmBoxParsed): void {
  withTransaction(database, () => {
    database.prepare('DELETE FROM pitching_lines WHERE game_id = ?').run(gameId)
    database.prepare('DELETE FROM batting_lines WHERE game_id = ?').run(gameId)

    const insertPitching = database.prepare(
      `INSERT INTO pitching_lines (
        game_id, team, row_index, decision, pitcher_name, pitcher_url,
        pitch_count, batters_faced, innings_pitched,
        hits, home_runs, walks, hit_batters, strikeouts, wild_pitches, balks,
        runs, earned_runs, headers_json,
        sequence, pitches, hits_allowed, home_runs_allowed, hit_by_pitch,
        runs_allowed, win_loss_save_hold, raw_text, source_url
      ) VALUES (?, ?, ?, ?, ?, null, 0, ?, ?, ?, 0, ?, ?, ?, 0, 0, ?, ?, '[]', ?, 0, ?, 0, ?, ?, ?, null, ?)`,
    )
    for (const line of data.pitchingLines) {
      insertPitching.run(
        gameId,
        line.team,
        line.sequence,
        line.decision,
        line.pitcherName,
        line.battersFaced ?? 0,
        line.inningsPitched ?? '',
        line.hitsAllowed ?? 0,
        line.walks ?? 0,
        line.hitByPitch ?? 0,
        line.strikeouts ?? 0,
        line.earnedRuns ?? 0,
        line.earnedRuns ?? 0,
        line.sequence,
        line.hitsAllowed,
        line.hitByPitch,
        line.earnedRuns,
        line.decision,
        data.sourceUrl,
      )
    }

    const insertBatting = database.prepare(
      `INSERT INTO batting_lines (
        game_id, team, row_index, batting_order, position,
        player_name, player_url, at_bats, runs, hits, runs_batted_in,
        stolen_bases, inning_results_json, headers_json,
        strikeouts, walks, hit_by_pitch, sacrifice_hits, sacrifice_flies,
        errors, raw_text, source_url
      ) VALUES (?, ?, ?, null, ?, ?, null, ?, 0, ?, ?, 0, '[]', '[]', ?, ?, ?, null, null, null, null, ?)`,
    )
    for (const line of data.battingLines) {
      insertBatting.run(
        gameId,
        line.team,
        line.sequence,
        line.position,
        line.playerName,
        line.atBats ?? 0,
        line.hits ?? 0,
        line.rbis ?? 0,
        line.strikeouts,
        line.walks,
        line.hitByPitch,
        data.sourceUrl,
      )
    }
  })
}

// ---- HTML parsing helpers ----

function cellText(html: string): string {
  return html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}

function extractDivById(html: string, id: string): string | null {
  const re = /<(\/?)div\b([^>]*)>/gi
  let depth = 0
  let start = -1
  let match: RegExpExecArray | null
  while ((match = re.exec(html)) !== null) {
    const isClose = match[1] === '/'
    const attrs = match[2] ?? ''
    if (!isClose) {
      if (depth === 0 && attrs.includes(`id="${id}"`)) {
        start = match.index
        depth = 1
      } else if (depth > 0) {
        depth++
      }
    } else if (depth > 0) {
      depth--
      if (depth === 0) {
        return html.slice(start, re.lastIndex)
      }
    }
  }
  return null
}

function extractTablesByClass(html: string, className: string): string[] {
  const result: string[] = []
  const re = /<(\/?)table\b([^>]*)>/gi
  let depth = 0
  let captureDepth = -1
  let captureStart = -1
  let match: RegExpExecArray | null
  while ((match = re.exec(html)) !== null) {
    const isClose = match[1] === '/'
    const attrs = match[2] ?? ''
    if (!isClose) {
      depth++
      if (captureDepth < 0) {
        const classMatch = attrs.match(/class="([^"]+)"/)
        const classes = classMatch ? classMatch[1].split(/\s+/) : []
        if (classes.includes(className)) {
          captureStart = match.index
          captureDepth = depth
        }
      }
    } else {
      if (captureDepth >= 0 && depth === captureDepth) {
        result.push(html.slice(captureStart, re.lastIndex))
        captureDepth = -1
        captureStart = -1
      }
      depth--
    }
  }
  return result
}

function extractGmStatDataRows(tableHtml: string): string[] {
  const result: string[] = []
  const re = /<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(tableHtml)) !== null) {
    const attrs = match[1] ?? ''
    if (!attrs.includes('gmstats')) continue
    const content = match[2] ?? ''
    if (content.includes('<td')) {
      result.push(match[0])
    }
  }
  return result
}

function extractCellTexts(rowHtml: string): string[] {
  return [...rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => cellText(m[1] ?? ''))
}

function parseIntOrNull(value: string | undefined): number | null {
  if (!value && value !== '0') return null
  const n = parseInt(value, 10)
  return isNaN(n) ? null : n
}

// ---- Fetch helper ----

async function fetchWithRetry(
  fetchImpl: FetchLike,
  url: string,
  headers: Record<string, string>,
): Promise<Response> {
  let last: Response | null = null
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetchImpl(url, { headers })
      if (response.status !== 429 && response.status !== 503 || attempt === 3) {
        return response
      }
      last = response
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      last = new Response(`fetch_error: ${msg}`, { status: 598, statusText: 'ClientFetchError' })
      if (attempt === 3) return last
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * attempt * attempt))
  }
  return last ?? new Response('', { status: 598, statusText: 'ClientFetchError' })
}

// ---- Argument parsing helpers ----

function parsePositiveInt(value: string | undefined, label: string): number {
  if (!value || !/^\d+$/.test(value)) throw new Error(`Invalid ${label}: ${value ?? '(missing)'}`)
  return parseInt(value, 10)
}

function parseNonNegativeInt(value: string | undefined, label: string): number {
  if (value === undefined || !/^\d+$/.test(value)) throw new Error(`Invalid ${label}: ${value ?? '(missing)'}`)
  return parseInt(value, 10)
}

function parseDateStr(value: string | undefined, label: string): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Invalid ${label}: ${value ?? '(missing)'}`)
  return value
}
