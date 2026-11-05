import type { QueryDatabase } from '../query-driver'
import { canonicalLeagueTeamNames, canonicalTeamName } from './team-name-utils'
import { hasRepositoryTable } from './schema-detection'

type Filters = { year?: number; year_from?: number; year_to?: number; team?: string; level?: 'first' | 'farm' }
type Snapshot = { snapshot_id: string; team_name: string; source_url: string; row_count: number; stored_rows: number; fetched_at: string }
export type OfficialSeasonStatistic = { snapshot_id: string; row_index: number; player_id: string | null; player_name: string; metrics_json: string }

/** Whole-scope source coverage is shared by every official season reducer. */
export async function readOfficialStatisticSeason(database: QueryDatabase, filters: Filters, kind: 'batting' | 'pitching' | 'fielding') {
  const year = filters.year ?? (filters.year_from === filters.year_to ? filters.year_from : undefined)
  if (!year || (filters.level === 'farm' && !filters.team) || !await hasRepositoryTable(database, 'official_statistic_snapshots')) return null
  const teams = canonicalLeagueTeamNames(filters.team)
  if (!teams.length) return null
  const level = filters.level ?? 'first'
  const snapshots = await database.prepare(`SELECT snapshot.snapshot_id,snapshot.team_name,snapshot.source_url,snapshot.row_count,snapshot.fetched_at,
    (SELECT COUNT(*) FROM official_player_statistics stat WHERE stat.snapshot_id=snapshot.snapshot_id) AS stored_rows
    FROM official_statistic_snapshots snapshot WHERE snapshot.target_year=? AND snapshot.level=? AND snapshot.statistic_kind=?
    AND NOT EXISTS (SELECT 1 FROM official_statistic_snapshots newer WHERE newer.source_url=snapshot.source_url AND
      (newer.fetched_at>snapshot.fetched_at OR (newer.fetched_at=snapshot.fetched_at AND newer.snapshot_id>snapshot.snapshot_id)))`)
    .all(year, level, kind) as Snapshot[]
  const selected = snapshots.filter((snapshot) => teams.includes(canonicalTeamName(snapshot.team_name)))
  if (selected.length !== teams.length || new Set(selected.map((snapshot) => canonicalTeamName(snapshot.team_name))).size !== teams.length) return null
  if (selected.some((snapshot) => snapshot.stored_rows !== snapshot.row_count)) throw new Error(`Official ${kind} source row completeness mismatch`)
  const byId = new Map(selected.map((snapshot) => [snapshot.snapshot_id, snapshot]))
  const rows = await database.prepare(`SELECT snapshot_id,row_index,player_id,player_name,metrics_json FROM official_player_statistics
    WHERE snapshot_id IN (${selected.map(() => '?').join(',')}) ORDER BY snapshot_id,row_index`)
    .all(...byId.keys()) as OfficialSeasonStatistic[]
  return { year, level, rows, byId }
}
