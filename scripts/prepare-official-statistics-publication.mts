import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { openDatabase, withTransaction } from '../packages/db/src/sqlite'
import { buildNormalizedDelta } from '../packages/db/src/normalized-d1-delta'
import { parseOfficialStatisticPage, type OfficialStatisticPage } from '../packages/db/src/official-statistics'
import { matchesGameTeamFilter } from '../packages/db/src/repository/team-name-utils'

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
const compact = (value: string) => value.normalize('NFKC').replace(/[\s\u3000]/gu, '')
type Snapshot = { snapshot_id: string; source_url: string; target_year: number; team_id: string; team_name: string; level: 'first' | 'farm'; statistic_kind: OfficialStatisticPage['kind']; fetched_at: string; content_hash: string; raw_key: string; row_count: number }
type Statistic = { row_index: number; player_id: string | null; player_name: string; metrics_json: string }
try {
  candidate.exec(await readFile(path.join(workspace, 'packages/db/migrations-normalized/0003_official_statistic_snapshots.sql'), 'utf8'))
  candidate.exec(await readFile(path.join(workspace, 'packages/db/migrations-normalized/0004_official_dictionary_index.sql'), 'utf8'))
  const snapshots = source.prepare('SELECT * FROM official_statistic_snapshots').all() as Snapshot[]
  if (!snapshots.length) throw new Error('No official statistic sources to publish')
  for (const snapshot of snapshots) {
    const rawPath = path.resolve(workspace, 'data', snapshot.raw_key)
    if (!rawPath.startsWith(path.join(workspace, 'data', 'raw', 'bis-statistics') + path.sep)) throw new Error('Untrusted raw source key')
    const raw = await readFile(rawPath, 'utf8')
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
      const profile = candidate.prepare('SELECT full_name,source_url,year_teams_json FROM player_profiles WHERE player_id=?').get(row.player_id) as { full_name: string; source_url: string; year_teams_json: string } | undefined
      if (!profile || profile.source_url !== `https://npb.jp/bis/players/${row.player_id}.html` || compact(profile.full_name) !== compact(row.player_name)) throw new Error('Statistic identity lacks official profile proof')
      const teams = JSON.parse(profile.year_teams_json ?? '{}')[String(snapshot.target_year)]
      if (!(Array.isArray(teams) ? teams : [teams]).some((team: unknown) => typeof team === 'string' && matchesGameTeamFilter(team, snapshot.team_name))) throw new Error('Statistic identity lacks dated team proof')
    }
  }
  candidate.exec(`ATTACH DATABASE '${sourcePath.replaceAll("'", "''")}' AS official_source`)
  withTransaction(candidate, () => {
    candidate.exec(`INSERT OR IGNORE INTO official_statistic_snapshots SELECT * FROM official_source.official_statistic_snapshots`)
    candidate.exec(`INSERT OR IGNORE INTO official_player_statistics SELECT * FROM official_source.official_player_statistics`)
  })
  candidate.exec('DETACH DATABASE official_source')
  const delta = buildNormalizedDelta(previous, candidate, ['player_profiles', 'official_statistic_snapshots', 'official_player_statistics'])
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
    sources: snapshots.map((snapshot) => ({ url: snapshot.source_url, year: snapshot.target_year, level: snapshot.level, kind: snapshot.statistic_kind, fetchedAt: snapshot.fetched_at, hash: snapshot.content_hash, rows: snapshot.row_count })),
    rehearsal: 'passed', published: false }, null, 2) + '\n')
  console.log(JSON.stringify({ directory, previousGeneration: delta.previousGeneration, generation: delta.generation, changes: delta.changes, rehearsal: 'passed', published: false }))
} finally { source.close(); candidate.close(); previous.close() }
