import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  createDownloadLogger,
  discoverGamesByYear,
  downloadGamePages,
  findWorkspaceRoot,
  type FetchLike,
  type LoggerLike,
  type SleepLike,
} from '../../crawler/src/index'
import { parseRawGameFromDir } from '../../parser/src/index'
import type { DiscoveryYear } from '@npb/schemas'
import { listLoadedGameIdsByYear } from './repository/index'
import { loadRichGame } from './loader'
import { migrateDatabase } from './migrations'
import { sqliteDatabaseToQuery } from './query-driver'
import { openDatabase } from './sqlite'

const DEFAULT_LOG_PATH = path.join('data', 'logs', 'update-job.log')

export type UpdateYearArgs = {
  year: number
  sqlitePath: string
  dateFrom?: string
  dateTo?: string
  workspaceRoot?: string
  delayMs?: number
  userAgent?: string
}

export type IncrementalUpdateGameResult = {
  gameId: string
  date: string
  rawDirectory: string
  downloadedPages: number
  skippedPages: number
  loaded: true
}

export type IncrementalUpdateGameFailure = {
  gameId: string
  date: string
  stage: 'download' | 'parse' | 'load'
  message: string
}

export type IncrementalUpdateResult = {
  year: number
  discoveryPath: string
  discoveredGames: number
  existingGames: number
  pendingGames: number
  loadedGames: number
  skippedExistingGames: number
  failedGames: number
  games: IncrementalUpdateGameResult[]
  failures: IncrementalUpdateGameFailure[]
}

type UpdateJobDependencies = {
  createLogger?: (logPath: string) => Promise<LoggerLike>
  discoverGamesByYearImpl?: typeof discoverGamesByYear
  downloadGamePagesImpl?: typeof downloadGamePages
  findWorkspaceRootImpl?: typeof findWorkspaceRoot
  parseRawGameFromDirImpl?: typeof parseRawGameFromDir
}

export function parseUpdateYearArgs(argv: string[]): UpdateYearArgs {
  const args = [...argv]
  while (args[0] === '--') {
    args.shift()
  }
  let year: number | undefined
  let sqlitePath: string | undefined
  let dateFrom: string | undefined
  let dateTo: string | undefined
  let workspaceRoot: string | undefined
  let delayMs: number | undefined
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

    if (arg === '--workspace-root') {
      workspaceRoot = args.shift()
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

  if (!year) {
    throw new Error('Missing required argument: --year')
  }

  if (!sqlitePath) {
    throw new Error('Missing required argument: --sqlite-path')
  }

  return {
    year,
    sqlitePath,
    dateFrom,
    dateTo,
    workspaceRoot,
    delayMs,
    userAgent,
  }
}

export async function runIncrementalUpdate(
  options: UpdateYearArgs & {
    fetchImpl?: FetchLike
    sleepImpl?: SleepLike
    logger?: LoggerLike
  },
  dependencies: UpdateJobDependencies = {},
): Promise<IncrementalUpdateResult> {
  const resolveWorkspaceRoot =
    dependencies.findWorkspaceRootImpl ?? findWorkspaceRoot
  const workspaceRoot = path.resolve(
    options.workspaceRoot ?? (await resolveWorkspaceRoot(process.cwd())),
  )
  const sqlitePath = path.resolve(workspaceRoot, options.sqlitePath)
  const discoveryPath = path.join(workspaceRoot, 'data', 'discovery', `${options.year}.json`)
  const logger =
    options.logger ??
    (await (dependencies.createLogger ?? createDownloadLogger)(
      path.join(workspaceRoot, DEFAULT_LOG_PATH),
    ))
  const discoverImpl = dependencies.discoverGamesByYearImpl ?? discoverGamesByYear
  const downloadGamePagesImpl = dependencies.downloadGamePagesImpl ?? downloadGamePages
  const parseRawGameFromDirImpl =
    dependencies.parseRawGameFromDirImpl ?? parseRawGameFromDir

  const database = openDatabase(sqlitePath)
  try {
    migrateDatabase(database)

    logger.log(`[update] discover year=${options.year}`)
    const discovery = await discoverImpl({
      year: options.year,
      fetchImpl: options.fetchImpl,
    })
    await writeDiscoverySnapshot(discoveryPath, discovery)

    const existingGameIds = new Set(
      await listLoadedGameIdsByYear(sqliteDatabaseToQuery(database), options.year),
    )
    const targetGames = discovery.games.filter((game) =>
      (!options.dateFrom || game.date >= options.dateFrom) &&
      (!options.dateTo || game.date <= options.dateTo),
    )
    const pendingGames = targetGames.filter((game) => !existingGameIds.has(game.gameId))

    logger.log(
      `[update] year=${options.year} discovered=${discovery.games.length} existing=${existingGameIds.size} pending=${pendingGames.length}`,
    )

    const results: IncrementalUpdateGameResult[] = []
    const failures: IncrementalUpdateGameFailure[] = []
    for (const game of pendingGames) {
      logger.log(`[update:game] ${game.date} ${game.gameId} download -> parse -> load`)
      try {
        const downloadResult = await downloadGamePagesImpl({
          game,
          workspaceRoot,
          fetchImpl: options.fetchImpl,
          sleepImpl: options.sleepImpl,
          delayMs: options.delayMs,
          userAgent: options.userAgent,
          logger,
        })

        let richGame
        try {
          richGame = await parseRawGameFromDirImpl(downloadResult.directory)
        } catch (error) {
          const failure = createGameFailure(game.gameId, game.date, 'parse', error)
          failures.push(failure)
          logger.error(
            `[update:failed] game_id=${failure.gameId} date=${failure.date} stage=${failure.stage} message=${failure.message}`,
          )
          continue
        }

        try {
          loadRichGame(database, richGame)
        } catch (error) {
          const failure = createGameFailure(game.gameId, game.date, 'load', error)
          failures.push(failure)
          logger.error(
            `[update:failed] game_id=${failure.gameId} date=${failure.date} stage=${failure.stage} message=${failure.message}`,
          )
          continue
        }

        logger.log(`[update:loaded] ${game.gameId} -> ${downloadResult.directory}`)

        results.push({
          gameId: game.gameId,
          date: game.date,
          rawDirectory: downloadResult.directory,
          downloadedPages: downloadResult.pages.filter((page) => page.status === 'downloaded')
            .length,
          skippedPages: downloadResult.pages.filter((page) => page.status === 'skipped').length,
          loaded: true,
        })
      } catch (error) {
        const failure = createGameFailure(game.gameId, game.date, 'download', error)
        failures.push(failure)
        logger.error(
          `[update:failed] game_id=${failure.gameId} date=${failure.date} stage=${failure.stage} message=${failure.message}`,
        )
      }
    }

    const result = {
      year: options.year,
      discoveryPath,
      discoveredGames: targetGames.length,
      existingGames: existingGameIds.size,
      pendingGames: pendingGames.length,
      loadedGames: results.length,
      skippedExistingGames: targetGames.length - pendingGames.length,
      failedGames: failures.length,
      games: results,
      failures,
    } satisfies IncrementalUpdateResult

    logger.log(
      `[update:done] year=${result.year} loaded=${result.loadedGames} failed=${result.failedGames} skippedExisting=${result.skippedExistingGames}`,
    )

    return result
  } finally {
    database.close()
  }
}

async function writeDiscoverySnapshot(
  discoveryPath: string,
  discovery: DiscoveryYear,
): Promise<void> {
  await mkdir(path.dirname(discoveryPath), { recursive: true })
  await writeFile(discoveryPath, `${JSON.stringify(discovery, null, 2)}\n`, 'utf8')
}

function parsePositiveInteger(value: string | undefined, label: string): number {
  const parsed = Number.parseInt(value ?? '', 10)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${label}: ${value ?? '(missing)'}`)
  }

  return parsed
}

function parseNonNegativeInteger(value: string | undefined, label: string): number {
  const parsed = Number.parseInt(value ?? '', 10)
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid ${label}: ${value ?? '(missing)'}`)
  }

  return parsed
}

function parseDateString(value: string | undefined, label: string): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid ${label}: ${value ?? '(missing)'}`)
  }
  return value
}

function createGameFailure(
  gameId: string,
  date: string,
  stage: IncrementalUpdateGameFailure['stage'],
  error: unknown,
): IncrementalUpdateGameFailure {
  return {
    gameId,
    date,
    stage,
    message: error instanceof Error ? error.message : String(error),
  }
}
