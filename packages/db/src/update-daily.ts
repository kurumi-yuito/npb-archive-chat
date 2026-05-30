import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { findWorkspaceRoot } from '../../crawler/src/index'
import {
  runBackfillScoresCanonical,
  type BackfillScoresCanonicalResult,
} from './backfill-scores-canonical'
import {
  runScoresCalendarEnrichment,
  type EnrichScoresCalendarResult,
} from './enrich-scores-calendar'
import {
  runIncrementalUpdate,
  type IncrementalUpdateResult,
} from './update-job'
import {
  runBisCurrentUpdate,
  type UpdateBisCurrentResult,
} from './bis-current'
import { parseStorageArg, type StorageArgs } from './object-storage'

const DEFAULT_DAYS = 3
const DEFAULT_SQLITE_DIR = path.join('data')
const SUMMARY_PATH = path.join('data', 'logs', 'update-daily-summary.json')

export type UpdateDailyArgs = StorageArgs & {
  date?: string
  from?: string
  to?: string
  days?: number
  strict?: boolean
  dryRun?: boolean
  includeBisCurrent?: boolean
  sqlitePath?: string
  sqliteDir?: string
  workspaceRoot?: string
  delayMs?: number
  userAgent?: string
}

export type UpdateDailyStage = 'update-year' | 'backfill:scores-canonical' | 'enrich:scores-calendar' | 'update:bis-current'

export type UpdateDailyIssue = {
  year: number
  stage: UpdateDailyStage
  date?: string
  gameId?: string
  reason: string
}

export type UpdateDailyYearResult = {
  year: number
  sqlitePath: string
  dateFrom: string
  dateTo: string
  update: IncrementalUpdateResult | null
  backfill: BackfillScoresCanonicalResult | null
  enrich: EnrichScoresCalendarResult | null
  bisCurrent: UpdateBisCurrentResult | null
}

export type UpdateDailyResult = {
  dateFrom: string
  dateTo: string
  days: number
  strict: boolean
  dryRun: boolean
  failed: boolean
  totals: {
    years: number
    discoveredGames: number
    loadedGames: number
    scoresLoadedGames: number
    bisCurrentRoster: number
    warnings: number
    errors: number
    rainCancelled: number
  }
  years: UpdateDailyYearResult[]
  warnings: UpdateDailyIssue[]
  errors: UpdateDailyIssue[]
  summaryPath: string
}

export function parseUpdateDailyArgs(argv: string[]): UpdateDailyArgs {
  const args = [...argv]
  while (args[0] === '--') {
    args.shift()
  }

  let date: string | undefined
  let from: string | undefined
  let to: string | undefined
  let days: number | undefined
  let strict = false
  let dryRun = false
  let includeBisCurrent = false
  let sqlitePath: string | undefined
  let sqliteDir: string | undefined
  let workspaceRoot: string | undefined
  let delayMs: number | undefined
  let userAgent: string | undefined
  const storageArgs: StorageArgs = {}

  while (args.length > 0) {
    const arg = args.shift()
    if (parseStorageArg(arg, () => args.shift(), storageArgs)) {
      continue
    }
    if (arg === '--date') {
      date = parseDateString(args.shift(), 'date')
      continue
    }
    if (arg?.startsWith('--date=')) {
      date = parseDateString(arg.slice('--date='.length), 'date')
      continue
    }
    if (arg === '--from') {
      from = parseDateString(args.shift(), 'from')
      continue
    }
    if (arg?.startsWith('--from=')) {
      from = parseDateString(arg.slice('--from='.length), 'from')
      continue
    }
    if (arg === '--to') {
      to = parseDateString(args.shift(), 'to')
      continue
    }
    if (arg?.startsWith('--to=')) {
      to = parseDateString(arg.slice('--to='.length), 'to')
      continue
    }
    if (arg === '--days') {
      days = parsePositiveInteger(args.shift(), 'days')
      continue
    }
    if (arg?.startsWith('--days=')) {
      days = parsePositiveInteger(arg.slice('--days='.length), 'days')
      continue
    }
    if (arg === '--strict') {
      strict = true
      continue
    }
    if (arg === '--dry-run') {
      dryRun = true
      continue
    }
    if (arg === '--include-bis-current') {
      includeBisCurrent = true
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
    if (arg === '--sqlite-dir') {
      sqliteDir = args.shift()
      continue
    }
    if (arg?.startsWith('--sqlite-dir=')) {
      sqliteDir = arg.slice('--sqlite-dir='.length)
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
    throw new Error(`Unknown argument: ${arg}`)
  }

  return { date, from, to, days, strict, dryRun, includeBisCurrent, sqlitePath, sqliteDir, workspaceRoot, delayMs, userAgent, ...storageArgs }
}

export async function runDailyUpdate(options: UpdateDailyArgs): Promise<UpdateDailyResult> {
  const range = resolveDailyDateRange(options)
  const workspaceRoot = path.resolve(
    options.workspaceRoot ?? (await findWorkspaceRoot(process.cwd())),
  )
  const warnings: UpdateDailyIssue[] = []
  const errors: UpdateDailyIssue[] = []
  const years: UpdateDailyYearResult[] = []

  for (const yearRange of splitRangeByYear(range.from, range.to)) {
    const sqlitePath = resolveSqlitePathForYear(options, yearRange.year)
    let update: IncrementalUpdateResult | null = null
    let backfill: BackfillScoresCanonicalResult | null = null
    let enrich: EnrichScoresCalendarResult | null = null
    let bisCurrent: UpdateBisCurrentResult | null = null

    if (options.dryRun === true) {
      years.push({
        year: yearRange.year,
        sqlitePath,
        dateFrom: yearRange.from,
        dateTo: yearRange.to,
        update,
        backfill,
        enrich,
        bisCurrent,
      })
      continue
    }

    try {
      update = await runIncrementalUpdate({
        year: yearRange.year,
        sqlitePath,
        dateFrom: yearRange.from,
        dateTo: yearRange.to,
        workspaceRoot,
        delayMs: options.delayMs,
        userAgent: options.userAgent,
        storage: options.storage,
        r2Bucket: options.r2Bucket,
        r2Prefix: options.r2Prefix,
        r2Endpoint: options.r2Endpoint,
      })
      classifyIncrementalUpdateIssues(update, options.strict === true, warnings, errors)
    } catch (error) {
      errors.push(createIssue(yearRange.year, 'update-year', error))
    }

    try {
      backfill = await runBackfillScoresCanonical({
        year: yearRange.year,
        sqlitePath,
        dateFrom: yearRange.from,
        dateTo: yearRange.to,
        workspaceRoot,
        source: 'calendar-live',
        league: 'regular',
        userAgent: options.userAgent,
      })
      classifyBackfillIssues(backfill, options.strict === true, warnings, errors)
    } catch (error) {
      errors.push(createIssue(yearRange.year, 'backfill:scores-canonical', error))
    }

    try {
      enrich = await runScoresCalendarEnrichment({
        year: yearRange.year,
        sqlitePath,
        dateFrom: yearRange.from,
        dateTo: yearRange.to,
        workspaceRoot,
        league: 'regular',
        delayMs: options.delayMs,
        userAgent: options.userAgent,
        storage: options.storage,
        r2Bucket: options.r2Bucket,
        r2Prefix: options.r2Prefix,
        r2Endpoint: options.r2Endpoint,
      })
      classifyEnrichmentIssues(enrich, options.strict === true, warnings, errors)
    } catch (error) {
      errors.push(createIssue(yearRange.year, 'enrich:scores-calendar', error))
    }

    if (options.includeBisCurrent === true) {
      try {
        bisCurrent = await runBisCurrentUpdate({
          year: yearRange.year,
          sqlitePath,
          workspaceRoot,
          delayMs: options.delayMs,
          userAgent: options.userAgent,
          storage: options.storage,
          r2Bucket: options.r2Bucket,
          r2Prefix: options.r2Prefix,
          r2Endpoint: options.r2Endpoint,
        })
      } catch (error) {
        classifyBisCurrentIssue(yearRange.year, error, options.strict === true, warnings, errors)
      }
    }

    years.push({
      year: yearRange.year,
      sqlitePath,
      dateFrom: yearRange.from,
      dateTo: yearRange.to,
      update,
      backfill,
      enrich,
      bisCurrent,
    })
  }

  const result: Omit<UpdateDailyResult, 'summaryPath'> = {
    dateFrom: range.from,
    dateTo: range.to,
    days: countInclusiveDays(range.from, range.to),
    strict: options.strict === true,
    dryRun: options.dryRun === true,
    failed: errors.length > 0,
    totals: {
      years: years.length,
      discoveredGames: sum(years, (year) => year.update?.discoveredGames ?? 0),
      loadedGames: sum(years, (year) => year.update?.loadedGames ?? 0),
      scoresLoadedGames: sum(years, (year) => year.enrich?.loadedGames ?? 0),
      bisCurrentRoster: sum(years, (year) => year.bisCurrent?.currentTeamRoster ?? 0),
      warnings: warnings.length,
      errors: errors.length,
      rainCancelled: warnings.filter((warning) => warning.reason.includes('rain_cancelled')).length,
    },
    years,
    warnings,
    errors,
  }

  const summaryPath = path.join(workspaceRoot, SUMMARY_PATH)
  await mkdir(path.dirname(summaryPath), { recursive: true })
  await writeFile(summaryPath, `${JSON.stringify({ ...result, summaryPath }, null, 2)}\n`, 'utf8')

  return { ...result, summaryPath }
}

export function resolveDailyDateRange(
  options: Pick<UpdateDailyArgs, 'date' | 'from' | 'to' | 'days'> & { now?: Date },
): { from: string; to: string } {
  if (options.date && (options.from || options.to || options.days)) {
    throw new Error('--date cannot be combined with --from, --to, or --days')
  }
  if ((options.from || options.to) && options.days) {
    throw new Error('--days cannot be combined with --from or --to')
  }
  if (options.date) {
    return { from: options.date, to: options.date }
  }
  if (options.from || options.to) {
    if (!options.from || !options.to) {
      throw new Error('--from and --to must be specified together')
    }
    assertDateOrder(options.from, options.to)
    return { from: options.from, to: options.to }
  }

  const days = options.days ?? DEFAULT_DAYS
  const today = formatJstDate(options.now ?? new Date())
  const to = addDays(today, -1)
  return {
    from: addDays(to, -(days - 1)),
    to,
  }
}

function classifyIncrementalUpdateIssues(
  result: IncrementalUpdateResult,
  strict: boolean,
  warnings: UpdateDailyIssue[],
  errors: UpdateDailyIssue[],
) {
  for (const failure of result.failures) {
    const issue = {
      year: result.year,
      stage: 'update-year' as const,
      date: failure.date,
      gameId: failure.gameId,
      reason: `${failure.stage}: ${failure.message}`,
    }
    if (failure.stage === 'download' && isNotFoundReason(failure.message) && !strict) {
      warnings.push(issue)
    } else {
      errors.push(issue)
    }
  }
}

function classifyBackfillIssues(
  result: BackfillScoresCanonicalResult,
  strict: boolean,
  warnings: UpdateDailyIssue[],
  errors: UpdateDailyIssue[],
) {
  for (const failure of result.failures) {
    const issue = {
      year: result.year,
      stage: 'backfill:scores-canonical' as const,
      gameId: failure.gameId,
      reason: failure.reason,
    }
    if (strict) {
      errors.push(issue)
    } else {
      warnings.push(issue)
    }
  }
  for (const failure of result.calendarPages?.failures ?? []) {
    const issue = {
      year: result.year,
      stage: 'backfill:scores-canonical' as const,
      date: failure.date,
      reason: failure.reason,
    }
    if (strict) {
      errors.push(issue)
    } else {
      warnings.push(issue)
    }
  }
}

function classifyEnrichmentIssues(
  result: EnrichScoresCalendarResult,
  strict: boolean,
  warnings: UpdateDailyIssue[],
  errors: UpdateDailyIssue[],
) {
  for (const failure of result.failures) {
    const issue = {
      year: result.year,
      stage: 'enrich:scores-calendar' as const,
      date: failure.date,
      gameId: failure.gameId,
      reason: `${failure.stage}: ${failure.reason}`,
    }
    if (isNormalEnrichmentSkip(failure.reason) || (!strict && isNotFoundReason(failure.reason))) {
      warnings.push(issue)
    } else {
      errors.push(issue)
    }
  }
}

export function classifyBisCurrentIssue(
  year: number,
  error: unknown,
  strict: boolean,
  warnings: UpdateDailyIssue[],
  errors: UpdateDailyIssue[],
): void {
  const issue = createIssue(year, 'update:bis-current', error)
  if (strict) {
    errors.push(issue)
  } else {
    warnings.push(issue)
  }
}

function isNormalEnrichmentSkip(reason: string): boolean {
  return reason.includes('rain_cancelled') ||
    reason === 'duplicate_or_reversed_game' ||
    reason === 'scores_canonical_not_available' ||
    reason === 'farm_scores_not_available'
}

function isNotFoundReason(reason: string): boolean {
  return /(^|[^0-9])404([^0-9]|$)|status_404/i.test(reason)
}

function createIssue(year: number, stage: UpdateDailyStage, error: unknown): UpdateDailyIssue {
  return {
    year,
    stage,
    reason: error instanceof Error ? error.message : String(error),
  }
}

function resolveSqlitePathForYear(options: UpdateDailyArgs, year: number): string {
  if (options.sqlitePath) {
    return options.sqlitePath
  }
  return path.join(options.sqliteDir ?? DEFAULT_SQLITE_DIR, `npb-${year}.sqlite`)
}

function splitRangeByYear(from: string, to: string): Array<{ year: number; from: string; to: string }> {
  const ranges: Array<{ year: number; from: string; to: string }> = []
  let cursor = from
  while (cursor <= to) {
    const year = Number.parseInt(cursor.slice(0, 4), 10)
    const yearEnd = `${year}-12-31`
    const rangeTo = yearEnd < to ? yearEnd : to
    ranges.push({ year, from: cursor, to: rangeTo })
    cursor = addDays(rangeTo, 1)
  }
  return ranges
}

function countInclusiveDays(from: string, to: string): number {
  let days = 1
  let cursor = from
  while (cursor < to) {
    days += 1
    cursor = addDays(cursor, 1)
  }
  return days
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function formatJstDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${byType.year}-${byType.month}-${byType.day}`
}

function assertDateOrder(from: string, to: string): void {
  if (from > to) {
    throw new Error(`Invalid date range: --from ${from} is after --to ${to}`)
  }
}

function parseDateString(value: string | undefined, label: string): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid ${label}: ${value ?? '(missing)'}`)
  }
  return value
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

function sum<T>(values: T[], mapper: (value: T) => number): number {
  return values.reduce((total, value) => total + mapper(value), 0)
}
