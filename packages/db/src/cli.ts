import {
  parseEnrichScoresCalendarArgs,
  parsePlayerProfilesUpdateArgs,
  parseUpdateBisCurrentArgs,
  parseRebuildYearFromR2Args,
  parseBackfillScoresCanonicalArgs,
  parsePlayerIdentityBackfillArgs,
  parseUpdateDailyArgs,
  parseSyncD1Args,
  migrateDatabase,
  openDatabase,
  parseUpdateYearArgs,
  runDailyUpdate,
  runD1Sync,
  runScoresCalendarEnrichment,
  runBackfillScoresCanonical,
  runBisCurrentUpdate,
  runPlayerProfilesUpdate,
  runPlayerIdentityBackfill,
  rebuildYearFromR2,
  runIncrementalUpdate,
  parseEnrichBisFarmBoxesArgs,
  runBisFarmBoxEnrichment,
} from './index'

const KNOWN_COMMANDS = new Set([
  'migrate',
  'update:bis-current',
  'update-bis-current',
  'update:player-profiles',
  'update-player-profiles',
  'update-year',
  'update:daily',
  'update-daily',
  'sync:d1',
  'sync-d1',
  'rebuild:r2-year',
  'rebuild-r2-year',
  'enrich:scores-calendar',
  'enrich-scores-calendar',
  'backfill:scores-canonical',
  'backfill-scores-canonical',
  'backfill:player-identity',
  'backfill-player-identity',
  'enrich:bis-farm-boxes',
  'enrich-bis-farm-boxes',
])

function resolveCliCommand(): { command: string; tail: string[] } {
  const argv = process.argv
  const commandIndex = argv.findIndex((arg) => KNOWN_COMMANDS.has(arg))
  if (commandIndex === -1) {
    throw new Error(
      'Usage: tsx src/cli.ts <migrate|update-year|update:daily|update:bis-current|sync:d1|rebuild:r2-year|enrich:scores-calendar|backfill:scores-canonical|backfill:player-identity> ...\n       tsx src/cli.ts migrate <sqlite-db-path>\n       tsx src/cli.ts update-year --year <year> --sqlite-path <sqlite-path> [--from YYYY-MM-DD --to YYYY-MM-DD] [--workspace-root <path>] [--delay-ms <ms>] [--user-agent <ua>] [--storage <local|r2> --r2-bucket <bucket>]\n       tsx src/cli.ts update:daily [--date YYYY-MM-DD | --from YYYY-MM-DD --to YYYY-MM-DD | --days <n>] [--strict] [--include-bis-current] [--sqlite-dir <dir>] [--workspace-root <path>] [--delay-ms <ms>] [--user-agent <ua>] [--storage <local|r2> --r2-bucket <bucket>]\n       tsx src/cli.ts sync:d1 [--sqlite-dir <dir>] [--d1-database <name>] [--workspace-root <path>] [--dry-run] [--keep-files]\n       tsx src/cli.ts rebuild:r2-year --year <year> --sqlite-path <sqlite-path> --storage r2 --r2-bucket <bucket> [--clean]\n       tsx src/cli.ts update:bis-current --year <year> [--team <id|name>] [--sqlite-path <path>|--sqlite-dir <dir>] [--workspace-root <path>] [--delay-ms <ms>] [--user-agent <ua>] [--dry-run] [--storage <local|r2> --r2-bucket <bucket>]\n       tsx src/cli.ts enrich:scores-calendar --year <year> --sqlite-path <sqlite-path> [--from YYYY-MM-DD --to YYYY-MM-DD] [--limit <n>] [--league <all|regular>] [--exclude-farm] [--workspace-root <path>] [--delay-ms <ms>] [--user-agent <ua>] [--progress-every <n>] [--storage <local|r2> --r2-bucket <bucket>]\n       tsx src/cli.ts backfill:scores-canonical --year <year> --sqlite-path <sqlite-path> [--from YYYY-MM-DD --to YYYY-MM-DD] [--source <verified-candidates|calendar-live|calendar-raw>] [--league <all|regular>] [--limit <n>] [--workspace-root <path>] [--user-agent <ua>]\n       tsx src/cli.ts backfill:player-identity [--sqlite-dir <dir> | --sqlite-path <path>] [--year <year>] [--dry-run]',
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

  if (command === 'sync:d1' || command === 'sync-d1') {
    const args = parseSyncD1Args(tail)
    const result = await runD1Sync(args)
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    return
  }

  if (command === 'rebuild:r2-year' || command === 'rebuild-r2-year') {
    const args = parseRebuildYearFromR2Args(tail)
    const result = await rebuildYearFromR2(args)
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
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

  if (command === 'backfill:player-identity' || command === 'backfill-player-identity') {
    const args = parsePlayerIdentityBackfillArgs(tail)
    const result = await runPlayerIdentityBackfill(args)
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    return
  }

  if (command === 'enrich:bis-farm-boxes' || command === 'enrich-bis-farm-boxes') {
    const args = parseEnrichBisFarmBoxesArgs(tail)
    const result = await runBisFarmBoxEnrichment(args)
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    return
  }

  if (command === 'update:player-profiles' || command === 'update-player-profiles') {
    const args = parsePlayerProfilesUpdateArgs(tail)
    const result = await runPlayerProfilesUpdate(args)
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
