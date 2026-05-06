import {
  parseEnrichScoresCalendarArgs,
  parseUpdateBisCurrentArgs,
  parseBackfillScoresCanonicalArgs,
  parseUpdateDailyArgs,
  migrateDatabase,
  openDatabase,
  parseUpdateYearArgs,
  runDailyUpdate,
  runScoresCalendarEnrichment,
  runBackfillScoresCanonical,
  runBisCurrentUpdate,
  runIncrementalUpdate,
} from './index'

const KNOWN_COMMANDS = new Set([
  'migrate',
  'update:bis-current',
  'update-bis-current',
  'update-year',
  'update:daily',
  'update-daily',
  'enrich:scores-calendar',
  'enrich-scores-calendar',
  'backfill:scores-canonical',
  'backfill-scores-canonical',
])

function resolveCliCommand(): { command: string; tail: string[] } {
  const argv = process.argv
  const commandIndex = argv.findIndex((arg) => KNOWN_COMMANDS.has(arg))
  if (commandIndex === -1) {
    throw new Error(
      'Usage: tsx src/cli.ts <migrate|update-year|update:daily|update:bis-current|enrich:scores-calendar|backfill:scores-canonical> ...\n       tsx src/cli.ts migrate <sqlite-db-path>\n       tsx src/cli.ts update-year --year <year> --sqlite-path <sqlite-path> [--from YYYY-MM-DD --to YYYY-MM-DD] [--workspace-root <path>] [--delay-ms <ms>] [--user-agent <ua>]\n       tsx src/cli.ts update:daily [--date YYYY-MM-DD | --from YYYY-MM-DD --to YYYY-MM-DD | --days <n>] [--strict] [--include-bis-current] [--sqlite-dir <dir>] [--workspace-root <path>] [--delay-ms <ms>] [--user-agent <ua>]\n       tsx src/cli.ts update:bis-current --year <year> [--team <id|name>] [--sqlite-path <path>|--sqlite-dir <dir>] [--workspace-root <path>] [--delay-ms <ms>] [--user-agent <ua>] [--dry-run]\n       tsx src/cli.ts enrich:scores-calendar --year <year> --sqlite-path <sqlite-path> [--from YYYY-MM-DD --to YYYY-MM-DD] [--limit <n>] [--league <all|regular>] [--exclude-farm] [--workspace-root <path>] [--delay-ms <ms>] [--user-agent <ua>] [--progress-every <n>]\n       tsx src/cli.ts backfill:scores-canonical --year <year> --sqlite-path <sqlite-path> [--from YYYY-MM-DD --to YYYY-MM-DD] [--source <verified-candidates|calendar-live|calendar-raw>] [--league <all|regular>] [--limit <n>] [--workspace-root <path>] [--user-agent <ua>]',
    )
  }

  const command = argv[commandIndex] ?? ''
  const tail = argv.slice(commandIndex + 1)
  return { command, tail }
}

async function main() {
  const { command, tail } = resolveCliCommand()

  if (command === 'update-year') {
    const args = parseUpdateYearArgs(tail)
    const result = await runIncrementalUpdate(args)
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    return
  }

  if (command === 'update:daily' || command === 'update-daily') {
    const args = parseUpdateDailyArgs(tail)
    const result = await runDailyUpdate(args)
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    if (result.failed) {
      process.exitCode = 1
    }
    return
  }

  if (command === 'update:bis-current' || command === 'update-bis-current') {
    const args = parseUpdateBisCurrentArgs(tail)
    const result = await runBisCurrentUpdate(args)
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    return
  }

  if (command === 'enrich:scores-calendar' || command === 'enrich-scores-calendar') {
    const args = parseEnrichScoresCalendarArgs(tail)
    const result = await runScoresCalendarEnrichment(args)
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    return
  }

  if (command === 'backfill:scores-canonical' || command === 'backfill-scores-canonical') {
    const args = parseBackfillScoresCanonicalArgs(tail)
    const result = await runBackfillScoresCanonical(args)
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    return
  }

  const databasePath = tail[0]

  if (!databasePath) {
    throw new Error('Usage: tsx src/cli.ts migrate <sqlite-db-path>')
  }

  const database = openDatabase(databasePath)

  try {
    if (command === 'migrate') {
      const applied = migrateDatabase(database)
      process.stdout.write(`${JSON.stringify({ applied }, null, 2)}\n`)
      return
    }

    throw new Error(`Unknown command: ${command}`)
  } finally {
    database.close()
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`${message}\n`)
  process.exitCode = 1
})
