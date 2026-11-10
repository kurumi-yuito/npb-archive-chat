import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, writeFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { openDatabase, withTransaction } from '../packages/db/src/sqlite'
import { sqliteDatabaseToQuery } from '../packages/db/src/query-driver'
import { createObjectStorage } from '../packages/db/src/object-storage'
import { verifyOfficialSeriesArchive } from '../packages/db/src/official-series-history'
import { searchOfficialSeriesResults } from '../packages/db/src/repository/official-series-repository'
import { buildNormalizedDelta } from '../packages/db/src/normalized-d1-delta'

const options = new Map(process.argv.slice(2).map((argument) => {
  const equal = argument.indexOf('=')
  if (!argument.startsWith('--') || equal < 0) throw new Error('Use --baseline=path --source-manifest=path --output-dir=path')
  return [argument.slice(2, equal), argument.slice(equal + 1)]
}))
const required = (key: string) => { const value = options.get(key); if (!value) throw new Error(`Missing --${key}`); return path.resolve(value) }
const baseline = required('baseline'), sourceManifest = required('source-manifest'), directory = required('output-dir')
const workspace = path.resolve(options.get('workspace-root') ?? '.')
const receipt = JSON.parse(await readFile(sourceManifest, 'utf8')) as {
  sqlite: string; snapshots: number; observations: number; rows: number; audit: string; published: boolean;
  objects: Array<{ key: string; sourceFile: string; sha256: string; bytes: number }>
}
if (receipt.audit !== 'passed' || receipt.published !== false || !receipt.snapshots || !receipt.observations || !receipt.rows) throw new Error('Verified unpublished series source receipt required')
for (const object of receipt.objects) {
  if (!/^(?:raw\/bis-series-history\/[a-f0-9]{64}\.html|structured\/bis-series-history\/captures\/[a-f0-9]{64}\.json)$/u.test(object.key) ||
    path.resolve(object.sourceFile) !== path.join(workspace, 'data', object.key)) throw new Error('Untrusted series object path')
  const bytes = await readFile(object.sourceFile)
  if (bytes.length !== object.bytes || createHash('sha256').update(bytes).digest('hex') !== object.sha256) throw new Error('Series object differs from verified receipt')
}
const storage = createObjectStorage({ workspaceRoot: workspace, mode: 'local' })
const source = openDatabase(path.resolve(receipt.sqlite))
try {
  const verified = await verifyOfficialSeriesArchive(source, storage)
  if (verified.snapshots !== receipt.snapshots || verified.observations !== receipt.observations || verified.rows !== receipt.rows) throw new Error('Series source receipt count mismatch')
  const expectedObjects = new Set<string>()
  for (const row of source.prepare('SELECT raw_key FROM official_series_history_snapshots').all() as Array<{ raw_key: string }>) expectedObjects.add(row.raw_key)
  for (const row of source.prepare('SELECT structured_key,discovery_raw_key FROM official_series_history_observations').all() as Array<{ structured_key: string; discovery_raw_key: string }>) {
    expectedObjects.add(row.structured_key); expectedObjects.add(row.discovery_raw_key)
  }
  if (expectedObjects.size !== receipt.objects.length || receipt.objects.some((object) => !expectedObjects.has(object.key))) throw new Error('Series object receipt is incomplete or duplicated')
} finally { source.close() }
await mkdir(directory, { recursive: true })
const candidateFile = path.join(directory, 'candidate.sqlite'), rehearsalFile = path.join(directory, 'rehearsal.sqlite')
for (const file of [candidateFile, rehearsalFile]) {
  if ([baseline, path.resolve(receipt.sqlite)].includes(file)) throw new Error('Output cannot overwrite a source')
  try { await stat(file); throw new Error('Publication output already exists; use a fresh directory') } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}
await copyFile(baseline, candidateFile)
await copyFile(baseline, rehearsalFile)
const candidate = openDatabase(candidateFile), previous = openDatabase(rehearsalFile)
const tables = ['official_series_history_snapshots', 'official_series_history_observations', 'official_series_results'] as const
const order = { official_series_history_snapshots: 'snapshot_id', official_series_history_observations: 'observation_id', official_series_results: 'snapshot_id,year' }
try {
  candidate.exec(await readFile(path.join(workspace, 'packages/db/migrations-normalized/0007_official_series_history.sql'), 'utf8'))
  candidate.exec(`ATTACH DATABASE '${path.resolve(receipt.sqlite).replaceAll("'", "''")}' AS series_source`)
  withTransaction(candidate, () => {
    for (const table of tables) {
      candidate.exec(`INSERT OR IGNORE INTO ${table} SELECT * FROM series_source.${table}`)
      const expected = candidate.prepare(`SELECT * FROM series_source.${table} ORDER BY ${order[table]}`).all()
      const columns = candidate.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string; pk: number }>
      const keys = columns.filter((column) => column.pk).map((column) => column.name)
      for (const row of expected as Array<Record<string, string | number | null>>) {
        const actual = candidate.prepare(`SELECT * FROM ${table} WHERE ${keys.map((key) => `${key}=?`).join(' AND ')}`).get(...keys.map((key) => row[key]))
        if (!actual || !isDeepStrictEqual({ ...actual }, { ...row })) throw new Error('Immutable series facts conflict with baseline')
      }
    }
  })
  candidate.exec('DETACH DATABASE series_source')
  const delta = buildNormalizedDelta(previous, candidate, tables)
  if (Object.values(delta.changes).some((change) => change.updated || change.deleted)) throw new Error('Series publication must only append immutable facts')
  withTransaction(previous, () => {
    previous.exec(delta.sql)
    if (previous.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Series rehearsal foreign-key audit failed')
    for (const table of tables) if (!isDeepStrictEqual(previous.prepare(`SELECT * FROM ${table} ORDER BY ${order[table]}`).all(), candidate.prepare(`SELECT * FROM ${table} ORDER BY ${order[table]}`).all())) throw new Error('Series rehearsal differs from candidate')
  })
  const archive = await verifyOfficialSeriesArchive(previous, storage)
  const oracle = JSON.parse(await readFile(path.join(workspace, 'docs/eval-source-oracles/series-history-1950-2026.json'), 'utf8'))
  const expected = oracle.seasons
  if (!Array.isArray(expected) || !expected.length) throw new Error('Independent series source oracle missing')
  const rows = await searchOfficialSeriesResults(sqliteDatabaseToQuery(previous), { competition: '日本シリーズ', year_from: 1950, year_to: 2026 })
  if (rows.length !== expected.length) throw new Error('Series query completeness differs from independent oracle')
  for (const [index, row] of rows.entries()) {
    const season = expected[index]
    if (row.stats.year !== season.year || row.stats.winnerName !== season.winner || row.stats.loserName !== season.loser ||
      row.stats.winnerWins !== season.winCounts[0] || row.stats.loserWins !== season.winCounts[1] ||
      row.stats.draws !== season.draws || row.total !== season.scores.length ||
      !JSON.parse(String(row.stats.sourceUrls)).includes(season.sourceUrl)) throw new Error('Series query differs from independent source oracle')
  }
  for (const database of [candidate, previous]) database.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  const bytes = (await stat(rehearsalFile)).size
  if (bytes > 500 * 1024 * 1024) throw new Error('Candidate exceeds configured Free database size limit')
  const manifest = { preparedAt: new Date().toISOString(), baseline, sourceManifest, previousGeneration: delta.previousGeneration,
    generation: delta.generation, changes: delta.changes, archive, queriedSeasons: rows.length, objects: receipt.objects, bytes,
    rehearsal: 'passed', published: false, requiredBeforePublishing: ['Verify production generation and remaining account D1 budgets', 'Upload and verify immutable objects and baseline backup', 'Apply one atomic SQL publication, then verify generation and source facts'] }
  await writeFile(path.join(directory, 'publication.sql'), delta.sql)
  await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  console.log(JSON.stringify({ ...manifest, objects: receipt.objects.length }))
} finally { candidate.close(); previous.close() }
