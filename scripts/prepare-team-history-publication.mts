import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, writeFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { openDatabase, withTransaction } from '../packages/db/src/sqlite'
import { buildNormalizedDelta } from '../packages/db/src/normalized-d1-delta'
import { parseOfficialTeamHistory } from '../packages/db/src/official-team-history'

const options = new Map(process.argv.slice(2).map((argument) => {
  const equal = argument.indexOf('=')
  if (!argument.startsWith('--') || equal < 0) throw new Error('Use --baseline=path --source=path --source-manifest=path --output-dir=path')
  return [argument.slice(2, equal), argument.slice(equal + 1)]
}))
const required = (key: string) => { const value = options.get(key); if (!value) throw new Error(`Missing --${key}`); return path.resolve(value) }
const baseline = required('baseline'), sourceFile = required('source'), sourceManifest = required('source-manifest'), directory = required('output-dir')
const workspace = path.resolve(options.get('workspace-root') ?? '.')
await mkdir(directory, { recursive: true })
const candidateFile = path.join(directory, 'candidate.sqlite'), rehearsalFile = path.join(directory, 'rehearsal.sqlite')
if ([candidateFile, rehearsalFile].some((file) => [baseline, sourceFile].includes(file))) throw new Error('Output cannot overwrite the source or baseline')
type Source = { snapshotId: string; sourceUrl: string; teamId: string; teamName: string; targetYear: number; fetchedAt: string; contentHash: string; rawKey: string; rowCount: number; structuredKey: string }
type ObjectProof = { key: string; sourceFile: string; sha256: string; bytes: number }
const receipt = JSON.parse(await readFile(sourceManifest, 'utf8')) as { sqlite: string; snapshots: number; sources: Source[]; objects: ObjectProof[]; audit: string; published: boolean }
if (receipt.audit !== 'passed' || receipt.published || path.resolve(receipt.sqlite) !== sourceFile || receipt.snapshots !== 12 || new Set(receipt.sources.map((source) => source.teamId)).size !== 12) throw new Error('Complete unpublished official source manifest required')
for (const object of receipt.objects) {
  const resolved = path.resolve(workspace, 'data', object.key)
  if (path.resolve(object.sourceFile) !== resolved || !['raw', 'structured'].some((kind) => resolved.startsWith(path.join(workspace, 'data', kind, 'bis-team-history') + path.sep))) throw new Error('Untrusted team history archive path')
  const bytes = await readFile(object.sourceFile)
  if (createHash('sha256').update(bytes).digest('hex') !== object.sha256 || bytes.length !== object.bytes) throw new Error('Team history object hash mismatch')
}
const source = openDatabase(sourceFile)
try {
  for (const entry of receipt.sources) {
    const snapshot = source.prepare('SELECT * FROM official_team_history_snapshots WHERE snapshot_id=?').get(entry.snapshotId) as Record<string, unknown> | undefined
    if (!snapshot || snapshot.source_url !== entry.sourceUrl || snapshot.team_id !== entry.teamId || snapshot.team_name !== entry.teamName || snapshot.fetched_at !== entry.fetchedAt || snapshot.content_hash !== entry.contentHash || snapshot.row_count !== entry.rowCount || snapshot.raw_key !== entry.rawKey) throw new Error('Official team history DB/source metadata mismatch')
    const html = await readFile(path.join(workspace, 'data', entry.rawKey), 'utf8')
    const parsed = parseOfficialTeamHistory(html, { team: { teamId: entry.teamId, teamName: entry.teamName }, targetYear: entry.targetYear, sourceUrl: entry.sourceUrl })
    const sidecar = JSON.parse(await readFile(path.join(workspace, 'data', entry.structuredKey), 'utf8'))
    if (sidecar.snapshotId !== entry.snapshotId || sidecar.fetchedAt !== entry.fetchedAt || sidecar.contentHash !== entry.contentHash || !isDeepStrictEqual(sidecar.rows, parsed.rows) || snapshot.basis_text !== parsed.basisText) throw new Error('Official team history structured evidence differs from raw')
    const rows = source.prepare('SELECT season_label,year,row_index,metrics_json FROM official_team_seasons WHERE snapshot_id=? ORDER BY row_index').all(entry.snapshotId) as Array<{ season_label: string; year: number; row_index: number; metrics_json: string }>
    if (rows.length !== entry.rowCount || !isDeepStrictEqual(rows.map((row) => ({ year: row.year, seasonLabel: row.season_label, metrics: JSON.parse(row.metrics_json) })), parsed.rows)) throw new Error('Official team history stored facts differ from raw')
  }
} finally { source.close() }
if (options.get('verify-only') === 'true') {
  console.log(JSON.stringify({ sourceCount: receipt.snapshots, rows: receipt.sources.reduce((sum, source) => sum + source.rowCount, 0), audit: 'passed', verifyOnly: true, published: false }))
  process.exit(0)
}
await copyFile(baseline, candidateFile)
await copyFile(baseline, rehearsalFile)
const candidate = openDatabase(candidateFile), previous = openDatabase(rehearsalFile)
const tables = ['official_team_history_snapshots', 'official_team_seasons'] as const
try {
  candidate.exec(await readFile(path.join(workspace, 'packages/db/migrations-normalized/0005_official_team_history.sql'), 'utf8'))
  candidate.exec(`ATTACH DATABASE '${sourceFile.replaceAll("'", "''")}' AS official_team_source`)
  withTransaction(candidate, () => {
    const ids = receipt.sources.map((entry) => entry.snapshotId), placeholders = ids.map(() => '?').join(',')
    for (const table of tables) {
      candidate.prepare(`INSERT OR IGNORE INTO ${table} SELECT * FROM official_team_source.${table} WHERE snapshot_id IN (${placeholders})`).run(...ids)
      const order = `snapshot_id${table === 'official_team_seasons' ? ',season_label' : ''}`
      const normalize = (rows: unknown[]) => rows.map((raw) => {
        const row = { ...raw as Record<string, unknown> }
        if (table === 'official_team_history_snapshots') delete row.fetched_at // Existing immutable source observations keep their original capture time.
        if (typeof row.metrics_json === 'string') row.metrics_json = JSON.parse(row.metrics_json)
        return row
      })
      const actual = candidate.prepare(`SELECT * FROM ${table} WHERE snapshot_id IN (${placeholders}) ORDER BY ${order}`).all(...ids)
      const expected = candidate.prepare(`SELECT * FROM official_team_source.${table} WHERE snapshot_id IN (${placeholders}) ORDER BY ${order}`).all(...ids)
      if (!isDeepStrictEqual(normalize(actual), normalize(expected))) throw new Error('Published immutable team history conflicts with verified source')
    }
  })
  candidate.exec('DETACH DATABASE official_team_source')
  const delta = buildNormalizedDelta(previous, candidate, tables)
  if (Object.values(delta.changes).some((change) => change.deleted || change.updated)) throw new Error('A team history source publication must only append immutable versions')
  withTransaction(previous, () => {
    previous.exec(delta.sql)
    if (previous.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Team history publication foreign-key audit failed')
    for (const table of tables) {
      const actual = previous.prepare(`SELECT * FROM ${table} ORDER BY snapshot_id${table === 'official_team_seasons' ? ',season_label' : ''}`).all()
      const expected = candidate.prepare(`SELECT * FROM ${table} ORDER BY snapshot_id${table === 'official_team_seasons' ? ',season_label' : ''}`).all()
      if (!isDeepStrictEqual(actual, expected)) throw new Error('Team history publication rehearsal content differs')
    }
  })
  candidate.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  previous.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  const bytes = (await stat(rehearsalFile)).size
  if (bytes > 500 * 1024 * 1024) throw new Error('Candidate exceeds the configured Free database size limit')
  const manifest = { preparedAt: new Date().toISOString(), baseline, sourceFile, sourceManifest, previousGeneration: delta.previousGeneration, generation: delta.generation,
    changes: delta.changes, sourceCount: receipt.snapshots, rows: receipt.sources.reduce((sum, source) => sum + source.rowCount, 0), objects: receipt.objects,
    bytes, rehearsal: 'passed', published: false,
    requiredBeforePublishing: ['Verify current production generation and remaining D1 read/write budgets', 'Upload and verify immutable source objects and a baseline backup', 'Apply the single atomic SQL file, then verify generation and source rows'] }
  await writeFile(path.join(directory, 'publication.sql'), delta.sql)
  await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  console.log(JSON.stringify({ previousGeneration: delta.previousGeneration, generation: delta.generation, changes: delta.changes, sourceCount: receipt.snapshots, bytes, rehearsal: 'passed', published: false }))
} finally { candidate.close(); previous.close() }
