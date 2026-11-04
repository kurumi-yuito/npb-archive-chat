import type { QueryDatabase } from '../query-driver'
import { hasRepositoryTable } from './schema-detection'
import { canonicalTeamName, toJapaneseTeamAliases } from './team-name-utils'

export type OfficialStatisticRow = {
  snapshotId: string; year: number; team: string; level: 'first' | 'farm'; kind: 'batting' | 'pitching' | 'fielding'
  playerId: string | null; playerName: string; rowIndex: number; statsJson: string; sourceUrl: string; fetchedAt: string; basisText: string | null
}

export async function searchOfficialStatisticRows(database: QueryDatabase, filters: {
  kind: OfficialStatisticRow['kind']; level?: OfficialStatisticRow['level']; year?: number; year_from?: number; year_to?: number
  team?: string; player_id?: string; player_name?: string; limit?: number
}): Promise<OfficialStatisticRow[]> {
  if (!await hasRepositoryTable(database, 'official_statistic_snapshots')) return []
  const clauses = ['snapshot.statistic_kind = ?', 'snapshot.level = ?']
  const values: Array<string | number> = [filters.kind, filters.level ?? 'first']
  for (const [field, operator] of [['year', '='], ['year_from', '>='], ['year_to', '<=']] as const) {
    if (filters[field] !== undefined) { clauses.push(`snapshot.target_year ${operator} ?`); values.push(filters[field]!) }
  }
  if (filters.team) {
    const aliases = toJapaneseTeamAliases(canonicalTeamName(filters.team))
    clauses.push(`snapshot.team_name IN (${aliases.map(() => '?').join(',')})`)
    values.push(...aliases)
  }
  if (filters.player_id) { clauses.push('stat.player_id = ?'); values.push(filters.player_id) }
  if (filters.player_name) { clauses.push('stat.normalized_name = ?'); values.push(filters.player_name.normalize('NFKC').replace(/[\s\u3000]/gu, '')) }
  clauses.push(`NOT EXISTS (SELECT 1 FROM official_statistic_snapshots newer WHERE newer.source_url=snapshot.source_url
    AND (newer.fetched_at>snapshot.fetched_at OR (newer.fetched_at=snapshot.fetched_at AND newer.snapshot_id>snapshot.snapshot_id)))`)
  return await database.prepare(`SELECT snapshot.snapshot_id AS snapshotId, snapshot.target_year AS year,
    snapshot.team_name AS team, snapshot.level AS level, snapshot.statistic_kind AS kind,
    stat.player_id AS playerId, stat.player_name AS playerName, stat.row_index AS rowIndex,
    stat.metrics_json AS statsJson, snapshot.source_url AS sourceUrl, snapshot.fetched_at AS fetchedAt, snapshot.basis_text AS basisText
    FROM official_statistic_snapshots snapshot JOIN official_player_statistics stat ON stat.snapshot_id=snapshot.snapshot_id
    WHERE ${clauses.join(' AND ')} ORDER BY snapshot.target_year DESC,snapshot.team_id,stat.row_index LIMIT ?`)
    .all(...values, filters.limit ?? 500) as OfficialStatisticRow[]
}
