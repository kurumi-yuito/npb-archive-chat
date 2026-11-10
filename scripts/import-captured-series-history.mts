import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { openDatabase } from '../packages/db/src/sqlite'
import { migrateDatabase } from '../packages/db/src/migrations'
import { createObjectStorage } from '../packages/db/src/object-storage'
import { OFFICIAL_SERIES_ENTRY_URL, saveOfficialSeriesCapture, verifyOfficialSeriesArchive } from '../packages/db/src/official-series-history'
import { officialSeriesResultSchema, type OfficialSeriesResult } from '../packages/schemas/src/index'

const options = new Map(process.argv.slice(2).map((argument) => {
  const match = /^--([^=]+)=(.+)$/u.exec(argument)
  if (!match) throw new Error('Use --capture-manifest=path --output-dir=path [--workspace-root=path]')
  return [match[1]!, match[2]!]
}))
const required = (key: string) => { const value = options.get(key); if (!value) throw new Error(`Missing --${key}`); return path.resolve(value) }
const captureFile = required('capture-manifest'), directory = required('output-dir'), workspace = path.resolve(options.get('workspace-root') ?? '.')
await mkdir(directory, { recursive: true })
const sqlite = path.join(directory, 'source.sqlite'), database = openDatabase(sqlite)
const storage = createObjectStorage({ mode: 'local', workspaceRoot: workspace })
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex')
type Observation = { url: string; discoveredFrom: string | null; fetchedAt: string; serverDate: string | null; lastModified: string | null;
  charset: string; sha256: string; bytes: number; rawFile: string }
try {
  if (database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='normalized_runtime_metadata'").get()) throw new Error('Use a staging source database, not a published normalized search database')
  migrateDatabase(database)
  const archive = JSON.parse(await readFile(captureFile, 'utf8')) as { entryUrl: string; observations: Observation[] }
  if (archive.entryUrl !== OFFICIAL_SERIES_ENTRY_URL || !Array.isArray(archive.observations) || !archive.observations.length) throw new Error('Official captured discovery archive required')
  const htmlByObservation = new Map<Observation, string>()
  for (const observation of archive.observations) {
    const raw = await readFile(observation.rawFile)
    if (!['utf-8', 'utf8'].includes(observation.charset.toLowerCase()) || hash(raw) !== observation.sha256 || raw.length !== observation.bytes ||
      !Number.isFinite(Date.parse(observation.fetchedAt))) throw new Error('Captured source bytes, encoding or time changed')
    htmlByObservation.set(observation, raw.toString('utf8'))
  }
  const series = archive.observations.filter((row) => /^https:\/\/npb\.jp\/bis\/scores\/nipponseries\/yearlyresults\d{4}\.html$/u.test(row.url))
  if (!series.length) throw new Error('No official series history pages in the capture')
  for (const source of series) {
    const discovery = source.url === OFFICIAL_SERIES_ENTRY_URL ? source : archive.observations.filter((row) => row.url === source.discoveredFrom &&
      row.url === OFFICIAL_SERIES_ENTRY_URL && Date.parse(row.fetchedAt) <= Date.parse(source.fetchedAt))
      .sort((left, right) => Date.parse(right.fetchedAt) - Date.parse(left.fetchedAt))[0]
    if (!discovery) throw new Error('Original discovery observation is missing')
    await saveOfficialSeriesCapture({ database, storage, sourceUrl: source.url, html: htmlByObservation.get(source)!, fetchedAt: source.fetchedAt,
      serverDate: source.serverDate, lastModified: source.lastModified,
      discovery: { url: discovery.url, html: htmlByObservation.get(discovery)!, fetchedAt: discovery.fetchedAt } })
  }
  const verified = await verifyOfficialSeriesArchive(database, storage)
  const snapshots = database.prepare('SELECT * FROM official_series_history_snapshots ORDER BY source_url,snapshot_id').all() as Array<{
    snapshot_id: string; source_url: string; content_hash: string; raw_key: string; row_count: number }>
  const observations = database.prepare('SELECT * FROM official_series_history_observations ORDER BY fetched_at_ms,observation_id').all() as Array<{
    observation_id: string; snapshot_id: string; fetched_at: string; fetched_at_ms: number; structured_key: string;
    source_response_date: string | null; source_last_modified: string | null; discovery_raw_key: string; discovery_url: string }>
  const byId = new Map(snapshots.map((row) => [row.snapshot_id, row])), latest = new Map<string, typeof observations[number]>()
  const rawManifest = { entryUrl: OFFICIAL_SERIES_ENTRY_URL, production: false, metadataOnlyExport: true, observations: observations.map((row) => {
    const source = byId.get(row.snapshot_id)!
    const previous = latest.get(source.source_url)
    if (!previous || row.fetched_at_ms > previous.fetched_at_ms || (row.fetched_at_ms === previous.fetched_at_ms && row.observation_id > previous.observation_id)) latest.set(source.source_url, row)
    return { url: source.source_url, fetchedAt: row.fetched_at, charset: 'utf-8', sha256: source.content_hash, rawFile: storage.localPath(source.raw_key) }
  }) }
  const rawManifestFile = path.join(directory, 'raw-source-manifest.json'), auditFile = path.join(directory, 'independent-source-audit.json')
  await writeFile(rawManifestFile, JSON.stringify(rawManifest, null, 2) + '\n')
  const auditRun = spawnSync('python3', [path.join(workspace, 'scripts/audit-captured-series-history.py'), `--manifest=${rawManifestFile}`, `--output=${auditFile}`], { encoding: 'utf8' })
  if (auditRun.status !== 0) throw new Error(`Independent raw series audit failed: ${auditRun.stderr.slice(0, 1000)}`)
  const audit = JSON.parse(await readFile(auditFile, 'utf8')) as { environment: string; seasons: Array<{ year: number; winner: string; loser: string; winCounts: number[]; draws: number; scores: Array<{ winnerSide: number; loserSide: number }> }> }
  if (audit.environment !== 'independent_python_html_audit') throw new Error('Independent source audit is missing')
  const latestRows = [...latest.values()].flatMap((observation) => database.prepare('SELECT record_json FROM official_series_results WHERE snapshot_id=? ORDER BY year').all(observation.snapshot_id)
    .map((row) => officialSeriesResultSchema.parse(JSON.parse(String((row as { record_json: string }).record_json)))))
  const projection = (row: OfficialSeriesResult) => ({ year: row.year, winner: row.winnerName, loser: row.loserName, wins: row.winnerWins, losses: row.loserWins, draws: row.draws,
    scores: row.games.map((game) => [game.winnerSideRuns, game.loserSideRuns]) })
  const actual = latestRows.map(projection).sort((left, right) => left.year - right.year)
  const expected = audit.seasons.map((row) => ({ year: row.year, winner: row.winner, loser: row.loser, wins: row.winCounts[0], losses: row.winCounts[1], draws: row.draws,
    scores: row.scores.map((score) => [score.winnerSide, score.loserSide]) })).sort((left, right) => left.year - right.year)
  if (!isDeepStrictEqual(actual, expected)) throw new Error('Application series extraction differs from independent raw HTML audit')
  if (database.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Official source foreign-key validation failed')
  const keys = new Set([...snapshots.map((source) => source.raw_key), ...observations.flatMap((row) => [row.structured_key, row.discovery_raw_key])])
  const objects = []
  for (const key of keys) { const sourceFile = storage.localPath(key), raw = await readFile(sourceFile); objects.push({ key, sourceFile, sha256: hash(raw), bytes: raw.length }) }
  database.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  const manifest = { preparedAt: new Date().toISOString(), sqlite, captureManifest: captureFile, capturedObservationsVerified: archive.observations.length,
    ...verified, latestSeasons: actual.length, firstYear: actual[0]!.year, lastYear: actual.at(-1)!.year, sources: snapshots, captures: observations, objects,
    independentAudit: { file: auditFile, sha256: hash(await readFile(auditFile)), rawManifest: rawManifestFile, rawManifestSha256: hash(await readFile(rawManifestFile)) },
    audit: 'passed', published: false }
  await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  console.log(JSON.stringify({ ...verified, latestSeasons: actual.length, firstYear: manifest.firstYear, lastYear: manifest.lastYear,
    objects: objects.length, audit: 'passed', published: false, sqlite }))
} finally { database.close() }
