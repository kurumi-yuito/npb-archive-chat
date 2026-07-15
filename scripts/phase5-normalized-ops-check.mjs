#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const NORMALIZED_DB_NAME = 'npb-archive-chat-normalized'
const NORMALIZED_DB_ID = 'eb614de3-eb0c-4816-a7b2-8440e94093a8'
const LEGACY_DB_NAME = 'npb-archive-chat-import'
const LEGACY_DB_ID = '14c099c3-03ac-4307-9704-7a770b31d108'
const MAX_BYTES = 500 * 1024 * 1024
const WARN_70 = MAX_BYTES * 0.70
const WARN_85 = MAX_BYTES * 0.85
const FAIL_95 = MAX_BYTES * 0.95

const args = parseArgs(process.argv.slice(2))
const database = args.database ?? NORMALIZED_DB_NAME
const output = args.output ?? 'data/logs/phase5-normalized-ops-check.json'

if (database === LEGACY_DB_NAME || database === LEGACY_DB_ID) {
  fail(`Refusing to run normalized production checks against legacy D1 ${database}`)
}
if (database !== NORMALIZED_DB_NAME && database !== NORMALIZED_DB_ID) {
  fail(`Unexpected D1 target ${database}; expected ${NORMALIZED_DB_NAME} / ${NORMALIZED_DB_ID}`)
}

const startedAt = new Date().toISOString()
const checks = []
const tableCounts = {}

const metadata = queryOne(
  "SELECT metadata_value AS schema_version FROM normalized_runtime_metadata WHERE metadata_key = 'schema_version'",
)
checks.push(assertCheck('schema_version', metadata?.schema_version === 'phase5-normalized-v1', metadata))

const sizeBytes = readD1FileSize()
const capacityUsage = sizeBytes / MAX_BYTES
let capacityLevel = 'ok'
if (sizeBytes >= FAIL_95) capacityLevel = 'failure'
else if (sizeBytes >= WARN_85) capacityLevel = 'strong_warning'
else if (sizeBytes >= WARN_70) capacityLevel = 'warning'
checks.push(assertCheck('capacity_under_95_percent', sizeBytes > 0 && sizeBytes < FAIL_95, { sizeBytes, capacityUsage, capacityLevel }))

for (const table of [
  'game_facts',
  'source_snapshot_facts',
  'event_facts',
  'batting_line_facts',
  'pitching_line_facts',
  'roster_entry_facts',
  'player_profiles',
  'player_aliases',
  'player_sources',
  'award_facts',
]) {
  tableCounts[table] = Number(queryOne(`SELECT COUNT(*) AS count FROM ${table}`)?.count ?? 0)
}

checks.push(assertZero('duplicate_game_facts', 'SELECT COUNT(*) AS count FROM (SELECT game_id FROM game_facts GROUP BY game_id HAVING COUNT(*) > 1)'))
checks.push(assertZero('duplicate_source_snapshot_facts', "SELECT COUNT(*) AS count FROM (SELECT game_id, source_key FROM source_snapshot_facts GROUP BY game_id, source_key HAVING COUNT(*) > 1)"))
checks.push(assertZero('duplicate_batting_business_key', 'SELECT COUNT(*) AS count FROM (SELECT game_id, team_id, row_index FROM batting_line_facts GROUP BY game_id, team_id, row_index HAVING COUNT(*) > 1)'))
checks.push(assertZero('duplicate_pitching_business_key', 'SELECT COUNT(*) AS count FROM (SELECT game_id, team_id, row_index FROM pitching_line_facts GROUP BY game_id, team_id, row_index HAVING COUNT(*) > 1)'))
checks.push(assertZero('orphan_event_games', 'SELECT COUNT(*) AS count FROM event_facts LEFT JOIN game_facts USING (game_id) WHERE game_facts.game_id IS NULL'))
checks.push(assertZero('orphan_batting_games', 'SELECT COUNT(*) AS count FROM batting_line_facts LEFT JOIN game_facts USING (game_id) WHERE game_facts.game_id IS NULL'))
checks.push(assertZero('orphan_pitching_games', 'SELECT COUNT(*) AS count FROM pitching_line_facts LEFT JOIN game_facts USING (game_id) WHERE game_facts.game_id IS NULL'))
checks.push(assertZero('orphan_roster_games', 'SELECT COUNT(*) AS count FROM roster_entry_facts LEFT JOIN game_facts USING (game_id) WHERE game_facts.game_id IS NULL'))
checks.push(assertZero('orphan_event_source_snapshots', 'SELECT COUNT(*) AS count FROM event_facts LEFT JOIN source_snapshot_facts ON source_snapshot_facts.source_snapshot_id = event_facts.source_snapshot_id WHERE event_facts.source_snapshot_id IS NOT NULL AND source_snapshot_facts.source_snapshot_id IS NULL'))
checks.push(assertZero('orphan_batting_source_snapshots', 'SELECT COUNT(*) AS count FROM batting_line_facts LEFT JOIN source_snapshot_facts ON source_snapshot_facts.source_snapshot_id = batting_line_facts.source_snapshot_id WHERE batting_line_facts.source_snapshot_id IS NOT NULL AND source_snapshot_facts.source_snapshot_id IS NULL'))
checks.push(assertZero('orphan_pitching_source_snapshots', 'SELECT COUNT(*) AS count FROM pitching_line_facts LEFT JOIN source_snapshot_facts ON source_snapshot_facts.source_snapshot_id = pitching_line_facts.source_snapshot_id WHERE pitching_line_facts.source_snapshot_id IS NOT NULL AND source_snapshot_facts.source_snapshot_id IS NULL'))
checks.push(assertZero('missing_source_url', "SELECT COUNT(*) AS count FROM source_snapshot_facts WHERE source_url IS NULL OR source_url = ''"))

const q105Rows = queryAll(
  `SELECT
     pitching_line_facts.game_id,
     game_facts.game_date,
     pitching_line_facts.innings_pitched,
     pitching_line_facts.strikeouts,
     pitching_line_facts.earned_runs,
     source_snapshot_facts.source_url
   FROM pitching_line_facts
   INNER JOIN game_facts ON game_facts.game_id = pitching_line_facts.game_id
   LEFT JOIN source_snapshot_facts ON source_snapshot_facts.source_snapshot_id = pitching_line_facts.source_snapshot_id
   WHERE pitching_line_facts.pitcher_id = '41045137'
   ORDER BY game_facts.game_date DESC, pitching_line_facts.game_id DESC
   LIMIT 5`,
)
checks.push(assertCheck('q105_latest5_present', q105Rows.length === 5, q105Rows))
checks.push(assertCheck('q105_latest5_source_provenance', q105Rows.every((row) => String(row.source_url ?? '').startsWith('https://npb.jp/')), q105Rows))

const finishedAt = new Date().toISOString()
const report = {
  startedAt,
  finishedAt,
  database: {
    name: NORMALIZED_DB_NAME,
    id: NORMALIZED_DB_ID,
    legacyName: LEGACY_DB_NAME,
    legacyId: LEGACY_DB_ID,
  },
  schemaVersion: metadata?.schema_version ?? null,
  capacity: {
    sizeBytes,
    maxBytes: MAX_BYTES,
    usage: capacityUsage,
    thresholds: { warning70: WARN_70, strongWarning85: WARN_85, failure95: FAIL_95 },
    level: capacityLevel,
  },
  tableCounts,
  q105Latest5: q105Rows,
  checks,
  ok: checks.every((check) => check.ok),
}

mkdirSync(path.dirname(output), { recursive: true })
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
if (!report.ok) {
  process.exitCode = 1
}

function parseArgs(argv) {
  const parsed = {}
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--database') parsed.database = argv[++i]
    else if (arg?.startsWith('--database=')) parsed.database = arg.slice('--database='.length)
    else if (arg === '--output') parsed.output = argv[++i]
    else if (arg?.startsWith('--output=')) parsed.output = arg.slice('--output='.length)
    else fail(`Unknown argument: ${arg}`)
  }
  return parsed
}

function assertZero(name, sql) {
  const row = queryOne(sql)
  return assertCheck(name, Number(row?.count ?? 0) === 0, row)
}

function assertCheck(name, ok, details) {
  return { name, ok, details }
}

function queryOne(sql) {
  return queryAll(sql)[0] ?? null
}

function queryAll(sql) {
  const result = spawnSync('wrangler', ['d1', 'execute', database, '--remote', '--yes', '--json', '--command', sql], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  })
  if ((result.status ?? 1) !== 0) {
    fail(`D1 query failed: ${sql}\n${result.stderr}`)
  }
  return extractRows(JSON.parse(result.stdout.trim()))
}

function readD1FileSize() {
  const result = spawnSync('wrangler', ['d1', 'list', '--json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  })
  if ((result.status ?? 1) !== 0) {
    fail(`D1 list failed:\n${result.stderr}`)
  }
  const databases = JSON.parse(result.stdout.trim())
  const found = Array.isArray(databases)
    ? databases.find((item) => item?.uuid === NORMALIZED_DB_ID || item?.name === NORMALIZED_DB_NAME)
    : null
  const fileSize = Number(found?.file_size ?? 0)
  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    fail(`Unable to read D1 file_size for ${NORMALIZED_DB_NAME}`)
  }
  return fileSize
}

function extractRows(value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const rows = extractRows(item)
      if (rows.length > 0) return rows
    }
    return []
  }
  if (!value || typeof value !== 'object') return []
  if (Array.isArray(value.results)) return value.results
  if (Array.isArray(value.result)) return value.result
  for (const nested of Object.values(value)) {
    const rows = extractRows(nested)
    if (rows.length > 0) return rows
  }
  return []
}

function fail(message) {
  console.error(`[phase5-normalized-ops-check] ${message}`)
  process.exit(1)
}
