import {
  searchRosterEntriesFiltersSchema,
  type SearchRosterEntriesFilters,
} from '@npb/schemas'
import type { QueryDatabase } from '../query-driver'
import { toJapaneseTeamAliases } from './team-name-utils'

export type RosterEntryRow = {
  gameId: string
  gameDate: string
  team: string
  groupLabel: string
  playerName: string
  uniformNumber: string | null
  position: string | null
  starter: boolean | null
  battingOrder: number | null
}

export async function searchRosterEntries(
  database: QueryDatabase,
  filters: SearchRosterEntriesFilters = {},
): Promise<RosterEntryRow[]> {
  const normalized = searchRosterEntriesFiltersSchema.parse(filters)
  const clauses: string[] = ["roster_entries.game_id NOT LIKE 'f%'"]
  const values: Array<string | number> = []

  if (normalized.game_id) {
    clauses.push('roster_entries.game_id = ?')
    values.push(normalized.game_id)
  }
  if (normalized.game_date) {
    clauses.push('games.date = ?')
    values.push(normalized.game_date)
  }
  if (normalized.year) {
    clauses.push('games.year = ?')
    values.push(normalized.year)
  }
  if (normalized.year_from) {
    clauses.push('games.year >= ?')
    values.push(normalized.year_from)
  }
  if (normalized.year_to) {
    clauses.push('games.year <= ?')
    values.push(normalized.year_to)
  }
  if (normalized.team) {
    const teams = toJapaneseTeamAliases(normalized.team)
    clauses.push(`roster_entries.team IN (${teams.map(() => '?').join(', ')})`)
    values.push(...teams)
  }
  if (normalized.player_name) {
    clauses.push('roster_entries.player_name = ?')
    values.push(normalized.player_name)
  }
  if (normalized.batting_order !== undefined) {
    clauses.push('roster_entries.batting_order = ?')
    values.push(normalized.batting_order)
  }
  if (normalized.position) {
    clauses.push('roster_entries.position LIKE ?')
    values.push(`%${normalized.position}%`)
  }
  if (normalized.starter !== undefined) {
    clauses.push('roster_entries.starter = ?')
    values.push(normalized.starter ? 1 : 0)
  }

  const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
  const limit = normalized.limit ?? 100
  const rows = await database
    .prepare(
      `SELECT
        roster_entries.game_id AS gameId,
        games.date AS gameDate,
        roster_entries.team AS team,
        roster_entries.group_label AS groupLabel,
        roster_entries.player_name AS playerName,
        COALESCE(roster_entries.uniform_number, roster_entries.number) AS uniformNumber,
        roster_entries.position AS position,
        roster_entries.starter AS starter,
        roster_entries.batting_order AS battingOrder
      FROM roster_entries
      INNER JOIN games ON games.game_id = roster_entries.game_id
      ${whereClause}
      ORDER BY games.date DESC, roster_entries.game_id DESC, roster_entries.entry_index ASC
      LIMIT ?`,
    )
    .all(...values, limit)

  return (rows as Array<Omit<RosterEntryRow, 'starter'> & { starter: number | null }>).map((row) => ({
    ...row,
    starter: row.starter == null ? null : Boolean(row.starter),
  }))
}
