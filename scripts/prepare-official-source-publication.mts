import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { copyFile, mkdir, readFile, writeFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { openDatabase, withTransaction } from '../packages/db/src/sqlite'
import { buildNormalizedDelta } from '../packages/db/src/normalized-d1-delta'
import { createObjectStorage } from '../packages/db/src/object-storage'
import { verifiedOfficialRosterIdentities } from '../packages/db/src/official-roster-identities'
import { officialStatisticIdentityIndex } from '../packages/db/src/official-statistic-identities'
import { parseOfficialStatisticPage, type OfficialStatisticPage } from '../packages/db/src/official-statistics'
import { parseBisTeamRosterHtml } from '../packages/parser/src/bis-current'

const options = new Map(process.argv.slice(2).map((argument) => {
  const equal = argument.indexOf('=')
  if (!argument.startsWith('--') || equal < 0) throw new Error('Use --baseline=path --source=path --output-dir=path')
  return [argument.slice(2, equal), argument.slice(equal + 1)]
}))
const required = (key: string) => { const value = options.get(key); if (!value) throw new Error(`Missing --${key}`); return path.resolve(value) }
const baseline = required('baseline'), sourceFile = required('source'), directory = required('output-dir')
const workspace = path.resolve(options.get('workspace-root') ?? '.')
await mkdir(directory, { recursive: true })
const candidateFile = path.join(directory, 'candidate.sqlite'), rehearsalFile = path.join(directory, 'rehearsal.sqlite')
if ([baseline, sourceFile].some((file) => [candidateFile, rehearsalFile].includes(file))) throw new Error('Publication output cannot overwrite source or baseline')
const profileAuditFile = path.join(directory, 'profile-audit.json')
const audit = spawnSync(process.execPath, ['--import', 'tsx', path.join(workspace, 'scripts/verify-official-profile-capture.mts'), `--sqlite=${sourceFile}`, `--output=${profileAuditFile}`, `--workspace-root=${workspace}`], { cwd: workspace, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 })
if (audit.status !== 0) throw new Error(`Official profile audit failed: ${audit.stderr || audit.stdout}`)
const profileAudit = JSON.parse(await readFile(profileAuditFile, 'utf8')) as { profiles: number; sources: Array<{ rawKey: string; playerId: string; contentHash: string }> }
await copyFile(baseline, candidateFile)
await copyFile(baseline, rehearsalFile)
const source = openDatabase(sourceFile), candidate = openDatabase(candidateFile), previous = openDatabase(rehearsalFile)
type Snapshot = { snapshot_id: string; source_url: string; target_year: number; team_id: string; team_name: string; level: OfficialStatisticPage['level']; statistic_kind: OfficialStatisticPage['kind']; fetched_at: string; content_hash: string; raw_key: string; row_count: number }
type Statistic = { row_index: number; player_id: string | null; player_name: string; metrics_json: string }
type RosterSource = { source_key: string; year: number; team_id: string; source_url: string; raw_path: string; structured_path: string; fetched_at: string }
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`
try {
  candidate.exec(await readFile(path.join(workspace, 'packages/db/migrations-normalized/0003_official_statistic_snapshots.sql'), 'utf8'))
  candidate.exec(await readFile(path.join(workspace, 'packages/db/migrations-normalized/0004_official_dictionary_index.sql'), 'utf8'))
  const rosterProof = await verifiedOfficialRosterIdentities(source, createObjectStorage({ workspaceRoot: workspace, mode: 'local' }))
  const identities = officialStatisticIdentityIndex(source, rosterProof)
  const snapshots = source.prepare('SELECT * FROM official_statistic_snapshots').all() as Snapshot[]
  if (!snapshots.length || !rosterProof.length) throw new Error('Official statistics and dated roster proof are required')
  for (const snapshot of snapshots) {
    const file = path.resolve(workspace, 'data', snapshot.raw_key)
    if (!file.startsWith(path.join(workspace, 'data', 'raw', 'bis-statistics') + path.sep)) throw new Error('Untrusted statistic raw key')
    const raw = await readFile(file, 'utf8'), hash = createHash('sha256').update(raw).digest('hex')
    if (hash !== snapshot.content_hash || createHash('sha256').update(`${snapshot.source_url}\n${hash}`).digest('hex') !== snapshot.snapshot_id || !Number.isFinite(Date.parse(snapshot.fetched_at))) throw new Error('Statistic source/hash/timestamp mismatch')
    const page = { url: snapshot.source_url, year: snapshot.target_year, teamId: snapshot.team_id, teamName: snapshot.team_name, level: snapshot.level, kind: snapshot.statistic_kind }
    const parsed = parseOfficialStatisticPage(raw, page).rows
    const stored = source.prepare('SELECT row_index,player_id,player_name,metrics_json FROM official_player_statistics WHERE snapshot_id=? ORDER BY row_index').all(snapshot.snapshot_id) as Statistic[]
    if (parsed.length !== stored.length || stored.length !== snapshot.row_count) throw new Error('Statistic row completeness mismatch')
    for (const [index, row] of stored.entries()) {
      const original = parsed[index]!
      if (row.row_index !== original.rowIndex || row.player_name !== original.playerName || row.metrics_json !== JSON.stringify(original.values)) throw new Error('Statistic data differs from raw')
      if (!row.player_id || row.player_id !== (original.playerId ?? identities.resolve(row.player_name, page))) throw new Error('Statistic lacks unique dated official identity proof')
      const old = candidate.prepare('SELECT player_id,player_name,metrics_json FROM official_player_statistics WHERE snapshot_id=? AND row_index=?').get(snapshot.snapshot_id, row.row_index) as Statistic | undefined
      if (old && (old.player_name !== row.player_name || old.metrics_json !== row.metrics_json || (old.player_id && old.player_id !== row.player_id))) throw new Error('Published immutable statistic conflicts with source')
    }
  }
  const rosterSources = (source.prepare("SELECT * FROM bis_source_snapshots WHERE source_type='team_roster'").all() as RosterSource[])
    .filter((row) => /:[a-f0-9]{64}$/u.test(row.source_key))
  const scopes = new Set<string>()
  const discoveryObjects: string[] = []
  const removedRosterRows: Array<{ year: number; teamId: string; playerId: unknown; playerName: unknown }> = []
  for (const roster of rosterSources) {
    const key = `${roster.year}:${roster.team_id}`
    if (scopes.has(key)) throw new Error('Choose one current roster source version per year/team before publication')
    scopes.add(key)
    const raw = await readFile(path.join(workspace, roster.raw_path), 'utf8')
    const names = source.prepare('SELECT DISTINCT team_name FROM current_team_roster WHERE year=? AND team_id=?').all(roster.year, roster.team_id) as Array<{ team_name: string }>
    const parsed = parseBisTeamRosterHtml(raw, { year: roster.year, teamId: roster.team_id, teamName: names[0]!.team_name, sourceUrl: roster.source_url })
    const sidecar = JSON.parse(await readFile(path.join(workspace, roster.structured_path), 'utf8'))
    if (sidecar.source?.sourceUrl !== roster.source_url || sidecar.source?.fetchedAt !== roster.fetched_at || !isDeepStrictEqual(sidecar.entries, parsed)) throw new Error('Roster structured archive differs from raw/source metadata')
    const discovery = sidecar.discovery
    if (discovery?.url !== `https://npb.jp/bis/teams/index_${roster.team_id}.html` || !/^[a-f0-9]{64}$/u.test(discovery?.contentHash ?? '') ||
      discovery.rawPath !== `data/raw/bis/${roster.year}/index_${roster.team_id}/${discovery.contentHash}.html`) throw new Error('Invalid roster discovery provenance')
    const index = await readFile(path.join(workspace, discovery.rawPath), 'utf8')
    if (createHash('sha256').update(index).digest('hex') !== discovery.contentHash) throw new Error('Roster discovery archive hash mismatch')
    discoveryObjects.push(discovery.rawPath.slice('data/'.length))
    const rows = source.prepare('SELECT * FROM current_team_roster WHERE year=? AND team_id=?').all(roster.year, roster.team_id) as Array<Record<string, unknown>>
    const previousRows = candidate.prepare('SELECT player_key,player_id,player_name FROM current_team_roster WHERE year=? AND team_id=?').all(roster.year, roster.team_id) as Array<Record<string, unknown>>
    const newKeys = new Set(rows.map((row) => row.player_key))
    for (const old of previousRows.filter((row) => !newKeys.has(row.player_key))) removedRosterRows.push({ year: roster.year, teamId: roster.team_id, playerId: old.player_id, playerName: old.player_name })
    if (parsed.length !== rows.length || new Set(rows.map((row) => row.player_key)).size !== rows.length) throw new Error('Roster page completeness mismatch')
    for (const entry of parsed) {
      const row = rows.find((record) => record.player_key === (entry.playerId || `name:${entry.playerName}`))
      if (!row || row.player_id !== entry.playerId || row.player_name !== entry.playerName || row.position !== entry.position || row.uniform_number !== entry.uniformNumber || row.bats !== entry.bats || row.throws !== entry.throws || row.source_url !== roster.source_url) throw new Error('Stored roster differs from its official raw page')
    }
  }
  const timestamp = (value: string) => Date.parse(value.includes('T') ? value : value.replace(' ', 'T') + 'Z')
  for (const row of source.prepare('SELECT player_id,fetched_at FROM player_profiles').all() as Array<{ player_id: string; fetched_at: string }>) {
    const prior = candidate.prepare('SELECT fetched_at FROM player_profiles WHERE player_id=?').get(row.player_id) as { fetched_at: string } | undefined
    if (prior && timestamp(prior.fetched_at) > timestamp(row.fetched_at)) throw new Error('Prepared profile capture is older than the published baseline')
  }
  candidate.exec(`ATTACH DATABASE '${sourceFile.replaceAll("'", "''")}' AS official_source`)
  withTransaction(candidate, () => {
    const columns = (candidate.prepare('PRAGMA table_info(player_profiles)').all() as Array<{ name: string }>).map((row) => row.name)
    candidate.exec(`INSERT INTO player_profiles(${columns.map(quote).join(',')}) SELECT ${columns.map(quote).join(',')} FROM official_source.player_profiles WHERE 1
      ON CONFLICT(player_id) DO UPDATE SET ${columns.filter((column) => column !== 'player_id').map((column) => `${quote(column)}=excluded.${quote(column)}`).join(',')}`)
    for (const roster of rosterSources) {
      candidate.prepare('DELETE FROM current_team_roster WHERE year=? AND team_id=?').run(roster.year, roster.team_id)
      candidate.prepare('INSERT INTO current_team_roster SELECT * FROM official_source.current_team_roster WHERE year=? AND team_id=?').run(roster.year, roster.team_id)
    }
    candidate.exec(`INSERT OR IGNORE INTO bis_source_snapshots SELECT * FROM official_source.bis_source_snapshots;
      INSERT OR IGNORE INTO official_statistic_snapshots SELECT * FROM official_source.official_statistic_snapshots;
      INSERT INTO official_player_statistics SELECT * FROM official_source.official_player_statistics WHERE 1
      ON CONFLICT(snapshot_id,row_index) DO UPDATE SET player_id=COALESCE(official_player_statistics.player_id,excluded.player_id);`)
  })
  candidate.exec('DETACH DATABASE official_source')
  const tables = ['player_profiles', 'bis_source_snapshots', 'current_team_roster', 'official_statistic_snapshots', 'official_player_statistics']
  const delta = buildNormalizedDelta(previous, candidate, tables)
  withTransaction(previous, () => {
    previous.exec(delta.sql)
    if (previous.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Publication rehearsal foreign-key audit failed')
  })
  candidate.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  previous.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  const bytes = (await stat(candidateFile)).size
  if (bytes > 500 * 1024 * 1024) throw new Error('Candidate exceeds the configured D1 Free database size limit')
  const rawObjects = [...profileAudit.sources.flatMap((row) => [row.rawKey, `structured/bis-player-profiles/${row.playerId}/${row.contentHash}.json`]),
    ...snapshots.map((row) => row.raw_key), ...rosterSources.flatMap((row) => [row.raw_path, row.structured_path].map((key) => key.replace(/^data\//u, ''))), ...discoveryObjects]
  const manifest = { preparedAt: new Date().toISOString(), baseline, sourceFile, previousGeneration: delta.previousGeneration, generation: delta.generation,
    changes: delta.changes, profiles: profileAudit.profiles, statisticSources: snapshots.length, rosterSources: rosterSources.length,
    bytes, rehearsal: 'passed', rawObjects: [...new Set(rawObjects)], removedRosterRows, published: false,
    requiredBeforePublishing: ['Verify current production generation and remaining D1 read/write budgets', 'Upload and verify immutable raw/structured objects and the baseline backup', 'Apply one atomic publication file, then verify generation and evidence rows'] }
  await writeFile(path.join(directory, 'publication.sql'), delta.sql)
  await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  console.log(JSON.stringify({ directory, previousGeneration: delta.previousGeneration, generation: delta.generation, changes: delta.changes, bytes, rawObjects: manifest.rawObjects.length, rehearsal: 'passed', published: false }))
} finally { source.close(); candidate.close(); previous.close() }
