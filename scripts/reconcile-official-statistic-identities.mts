import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { openDatabase, withTransaction } from '../packages/db/src/sqlite'
import { parseOfficialStatisticPage, type OfficialStatisticPage } from '../packages/db/src/official-statistics'
import { officialStatisticIdentityIndex } from '../packages/db/src/official-statistic-identities'
import { verifiedOfficialRosterIdentities } from '../packages/db/src/official-roster-identities'
import { createObjectStorage } from '../packages/db/src/object-storage'

const options = new Map(process.argv.slice(2).map((argument) => {
  const equal = argument.indexOf('=')
  if (!argument.startsWith('--') || equal < 0) throw new Error('Use --sqlite=path --output=path [--workspace-root=path]')
  return [argument.slice(2, equal), argument.slice(equal + 1)]
}))
const sqlite = options.get('sqlite'), output = options.get('output')
if (!sqlite || !output) throw new Error('--sqlite and --output are required')
const workspace = path.resolve(options.get('workspace-root') ?? '.')
const database = openDatabase(path.resolve(sqlite))
type Snapshot = { snapshot_id: string; source_url: string; target_year: number; team_id: string; team_name: string; level: OfficialStatisticPage['level']; statistic_kind: OfficialStatisticPage['kind']; content_hash: string; raw_key: string; row_count: number }
type Row = { row_index: number; player_id: string | null; player_name: string; metrics_json: string }
try {
  const roster = await verifiedOfficialRosterIdentities(database, createObjectStorage({ workspaceRoot: workspace, mode: 'local' }))
  const index = officialStatisticIdentityIndex(database, roster)
  const changes: Array<{ snapshotId: string; rowIndex: number; playerId: string | null; previousId: string | null; reason: string }> = []
  const snapshots = database.prepare('SELECT * FROM official_statistic_snapshots').all() as Snapshot[]
  for (const snapshot of snapshots) {
    const file = path.resolve(workspace, 'data', snapshot.raw_key)
    if (!file.startsWith(path.join(workspace, 'data', 'raw', 'bis-statistics') + path.sep)) throw new Error('Untrusted statistic raw key')
    const raw = await readFile(file, 'utf8')
    if (createHash('sha256').update(raw).digest('hex') !== snapshot.content_hash) throw new Error('Statistic raw hash mismatch')
    const page = { url: snapshot.source_url, year: snapshot.target_year, teamId: snapshot.team_id, teamName: snapshot.team_name, level: snapshot.level, kind: snapshot.statistic_kind }
    const parsed = parseOfficialStatisticPage(raw, page).rows
    const stored = database.prepare('SELECT row_index,player_id,player_name,metrics_json FROM official_player_statistics WHERE snapshot_id=? ORDER BY row_index').all(snapshot.snapshot_id) as Row[]
    if (stored.length !== snapshot.row_count || parsed.length !== stored.length) throw new Error('Statistic source completeness mismatch')
    for (const [position, row] of stored.entries()) {
      const original = parsed[position]!
      if (row.row_index !== original.rowIndex || row.player_name !== original.playerName || row.metrics_json !== JSON.stringify(original.values)) throw new Error('Statistic values differ from raw')
      const playerId = original.playerId ?? index.resolve(row.player_name, page)
      if (row.player_id && playerId && row.player_id !== playerId) throw new Error('Conflicting existing statistic ID; manual source investigation required')
      if (!row.player_id && playerId) changes.push({ snapshotId: snapshot.snapshot_id, rowIndex: row.row_index, playerId, previousId: null, reason: 'unique_official_year_team_evidence' })
      if (row.player_id && !playerId && options.get('revalidate-existing-ids') === 'true') changes.push({ snapshotId: snapshot.snapshot_id, rowIndex: row.row_index,
        playerId: null, previousId: row.player_id, reason: 'new_official_candidates_make_previous_inference_ambiguous' })
    }
  }
  withTransaction(database, () => {
    const update = database.prepare('UPDATE official_player_statistics SET player_id=? WHERE snapshot_id=? AND row_index=? AND player_id IS ?')
    for (const row of changes) update.run(row.playerId, row.snapshotId, row.rowIndex, row.previousId)
  })
  const unresolved = database.prepare(`SELECT snapshot.level,snapshot.statistic_kind,COUNT(*) AS count FROM official_player_statistics stat
    JOIN official_statistic_snapshots snapshot USING(snapshot_id) WHERE stat.player_id IS NULL GROUP BY snapshot.level,snapshot.statistic_kind`).all()
  const report = { reconciledAt: new Date().toISOString(), sqlite: path.resolve(sqlite), validatedSources: snapshots.length,
    updatedIds: changes.length, unchangedMetrics: true, unchangedFetchTimestamps: true, unresolved, changes, published: false }
  await writeFile(output, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ validatedSources: snapshots.length, updatedIds: changes.length, unresolved, published: false }))
} finally { database.close() }
