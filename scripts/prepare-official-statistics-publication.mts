import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { openDatabase, withTransaction } from '../packages/db/src/sqlite'
import { buildNormalizedDelta } from '../packages/db/src/normalized-d1-delta'
import { parseOfficialStatisticPage, type OfficialStatisticPage } from '../packages/db/src/official-statistics'
import { officialStatisticIdentityIndex } from '../packages/db/src/official-statistic-identities'
import { verifiedOfficialRegistrationIdentities } from '../packages/db/src/official-registration-history'
import { createObjectStorage } from '../packages/db/src/object-storage'

const args = new Map(process.argv.slice(2).map((arg) => {
  const index = arg.indexOf('=')
  if (!arg.startsWith('--') || index < 0) throw new Error('Use --baseline=path --source=path --output-dir=path')
  return [arg.slice(2, index), arg.slice(index + 1)]
}))
const required = (key: string) => { const value = args.get(key); if (!value) throw new Error(`Missing --${key}`); return path.resolve(value) }
const baselinePath = required('baseline')
const sourcePath = required('source')
const directory = required('output-dir')
const workspace = path.resolve(args.get('workspace-root') ?? '.')
await mkdir(directory, { recursive: true })
const candidatePath = path.join(directory, 'candidate.sqlite')
const rehearsalPath = path.join(directory, 'rehearsal.sqlite')
if ([baselinePath, sourcePath].includes(candidatePath) || [baselinePath, sourcePath].includes(rehearsalPath)) throw new Error('Output must not overwrite either source')
await copyFile(baselinePath, candidatePath)
await copyFile(baselinePath, rehearsalPath)
const previous = openDatabase(rehearsalPath)
const candidate = openDatabase(candidatePath)
const source = openDatabase(sourcePath)
type Snapshot = { snapshot_id: string; source_url: string; target_year: number; team_id: string; team_name: string; level: 'first' | 'farm'; statistic_kind: OfficialStatisticPage['kind']; fetched_at: string; content_hash: string; raw_key: string; row_count: number }
type Statistic = { row_index: number; player_id: string | null; player_name: string; metrics_json: string }
try {
  candidate.exec(await readFile(path.join(workspace, 'packages/db/migrations-normalized/0003_official_statistic_snapshots.sql'), 'utf8'))
  candidate.exec(await readFile(path.join(workspace, 'packages/db/migrations-normalized/0004_official_dictionary_index.sql'), 'utf8'))
  const registrationProof = await verifiedOfficialRegistrationIdentities(source, createObjectStorage({ workspaceRoot: workspace, mode: 'local' }))
  const identityIndex = officialStatisticIdentityIndex(candidate, registrationProof)
  const registrationSources = source.prepare("SELECT * FROM bis_source_snapshots WHERE source_type='official_registration'").all() as Array<{ source_key: string; source_url: string; raw_path: string; structured_path: string; year: number; team_id: string }>
  const rawObjects = new Set<string>()
  for (const snapshot of registrationSources) {
    rawObjects.add(snapshot.raw_path.replace(/^data\//u, ''))
    rawObjects.add(snapshot.structured_path.replace(/^data\//u, ''))
    const record = JSON.parse(await readFile(path.resolve(workspace, snapshot.structured_path), 'utf8')) as { discovery: { rawKey: string } }
    rawObjects.add(record.discovery.rawKey)
  }
  const snapshots = source.prepare('SELECT * FROM official_statistic_snapshots').all() as Snapshot[]
  if (!snapshots.length) throw new Error('No official statistic sources to publish')
  for (const snapshot of snapshots) {
    const rawPath = path.resolve(workspace, 'data', snapshot.raw_key)
    if (!rawPath.startsWith(path.join(workspace, 'data', 'raw', 'bis-statistics') + path.sep)) throw new Error('Untrusted raw source key')
    const raw = await readFile(rawPath, 'utf8')
    rawObjects.add(snapshot.raw_key)
    const hash = createHash('sha256').update(raw).digest('hex')
    if (hash !== snapshot.content_hash || createHash('sha256').update(`${snapshot.source_url}\n${hash}`).digest('hex') !== snapshot.snapshot_id) throw new Error('Source hash mismatch')
    if (!Number.isFinite(Date.parse(snapshot.fetched_at))) throw new Error('Invalid fetch timestamp')
    const page = { url: snapshot.source_url, year: snapshot.target_year, teamId: snapshot.team_id, teamName: snapshot.team_name, level: snapshot.level, kind: snapshot.statistic_kind }
    const parsed = parseOfficialStatisticPage(raw, page)
    const statistics = source.prepare('SELECT row_index,player_id,player_name,metrics_json FROM official_player_statistics WHERE snapshot_id=? ORDER BY row_index').all(snapshot.snapshot_id) as Statistic[]
    if (parsed.rows.length !== snapshot.row_count || statistics.length !== snapshot.row_count) throw new Error('Official statistic row completeness mismatch')
    for (let index = 0; index < statistics.length; index++) {
      const row = statistics[index]!
      const rawRow = parsed.rows[index]!
      if (row.row_index !== rawRow.rowIndex || row.player_name !== rawRow.playerName || row.metrics_json !== JSON.stringify(rawRow.values)) throw new Error('Stored statistic differs from its raw official source')
      if (!row.player_id || rawRow.playerId === row.player_id) continue
      if (identityIndex.resolve(row.player_name, page) !== row.player_id) throw new Error(`Statistic identity lacks unique dated official profile/registration proof: ${snapshot.source_url} row=${row.row_index} name=${row.player_name} id=${row.player_id}`)
    }
  }
  candidate.exec(`ATTACH DATABASE '${sourcePath.replaceAll("'", "''")}' AS official_source`)
  withTransaction(candidate, () => {
    // Immutable source collisions must be identical; ignoring a collision can
    // otherwise hide a stale ID or a changed metric behind a successful import.
    for (const table of ['official_statistic_snapshots', 'official_player_statistics'] as const) {
      const columns = (candidate.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((row) => row.name)
      const key = table === 'official_statistic_snapshots' ? ['snapshot_id'] : ['snapshot_id', 'row_index']
      for (const row of source.prepare(`SELECT ${columns.join(',')} FROM ${table}`).all() as Array<Record<string, string | number | null>>) {
        const existing = candidate.prepare(`SELECT ${columns.join(',')} FROM ${table} WHERE ${key.map((column) => `${column}=?`).join(' AND ')}`).get(...key.map((column) => row[column]!))
        if (existing && JSON.stringify(existing) !== JSON.stringify(row)) throw new Error(`Conflicting immutable official source: ${table}`)
      }
    }
    for (const snapshot of registrationSources) {
      // Retain unrelated BIS and historical membership sources.
      candidate.prepare('DELETE FROM current_team_roster WHERE year=? AND team_id=? AND source_url=?').run(snapshot.year, snapshot.team_id, snapshot.source_url)
      candidate.prepare('INSERT INTO current_team_roster SELECT * FROM official_source.current_team_roster WHERE year=? AND team_id=? AND source_url=?').run(snapshot.year, snapshot.team_id, snapshot.source_url)
      const columns = (candidate.prepare('PRAGMA table_info(bis_source_snapshots)').all() as Array<{ name: string }>).map((row) => row.name)
      const row = source.prepare(`SELECT ${columns.join(',')} FROM bis_source_snapshots WHERE source_key=?`).get(snapshot.source_key) as Record<string, string | number | null>
      const existing = candidate.prepare(`SELECT ${columns.join(',')} FROM bis_source_snapshots WHERE source_key=?`).get(snapshot.source_key)
      if (existing && JSON.stringify(existing) !== JSON.stringify(row)) throw new Error('Conflicting registration source observation')
      candidate.prepare('INSERT OR IGNORE INTO bis_source_snapshots SELECT * FROM official_source.bis_source_snapshots WHERE source_key=?').run(snapshot.source_key)
    }
    candidate.exec(`INSERT OR IGNORE INTO official_statistic_snapshots SELECT * FROM official_source.official_statistic_snapshots`)
    candidate.exec(`INSERT OR IGNORE INTO official_player_statistics SELECT * FROM official_source.official_player_statistics`)
  })
  candidate.exec('DETACH DATABASE official_source')
  await verifiedOfficialRegistrationIdentities(candidate, createObjectStorage({ workspaceRoot: workspace, mode: 'local' }))
  const delta = buildNormalizedDelta(previous, candidate, ['player_profiles', 'bis_source_snapshots', 'current_team_roster', 'official_statistic_snapshots', 'official_player_statistics'])
  if (Object.values(delta.changes.player_profiles!).some((count) => count !== 0)) throw new Error('Official statistics publication must not change profile records')
  withTransaction(previous, () => {
    previous.exec(delta.sql)
    if (previous.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Candidate foreign-key audit failed')
  })
  // Profile records remain identical; only their lookup index is additive.
  // Historical facts and account/usage data are outside this publication.
  await writeFile(path.join(directory, 'publication.sql'), delta.sql)
  await writeFile(path.join(directory, 'manifest.json'), JSON.stringify({ preparedAt: new Date().toISOString(), baselinePath, sourcePath,
    previousGeneration: delta.previousGeneration, generation: delta.generation, changes: delta.changes,
    registrationSources: registrationSources.length, registrationIdentities: registrationProof.length, rawObjects: [...rawObjects],
    sources: snapshots.map((snapshot) => ({ url: snapshot.source_url, year: snapshot.target_year, level: snapshot.level, kind: snapshot.statistic_kind, fetchedAt: snapshot.fetched_at, hash: snapshot.content_hash, rows: snapshot.row_count })),
    rehearsal: 'passed', published: false }, null, 2) + '\n')
  console.log(JSON.stringify({ directory, previousGeneration: delta.previousGeneration, generation: delta.generation, changes: delta.changes, rehearsal: 'passed', published: false }))
} finally { source.close(); candidate.close(); previous.close() }
