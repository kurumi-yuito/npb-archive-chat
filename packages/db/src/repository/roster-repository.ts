import {
  searchRosterEntriesFiltersSchema,
  type SearchRosterEntriesFilters,
} from '@npb/schemas'
import type { QueryDatabase } from '../query-driver'
import { toJapaneseTeamAliases } from './team-name-utils'
import { isNormalizedFactsSchema } from './schema-detection'

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
  if (await isNormalizedFactsSchema(database)) {
    const normalizedRows = await searchNormalizedRosterEntries(database, normalized)
    if (normalizedRows.length > 0) {
      return normalizedRows
    }
    if (normalized.player_name) {
      return searchRosterEntries(database, {
        ...normalized,
        player_id: undefined,
      })
    }
  }
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
  if (normalized.player_id) {
    clauses.push('(roster_entries.player_url LIKE ?)')
    values.push(playerIdPattern(normalized.player_id))
  } else if (normalized.player_name) {
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

async function searchNormalizedRosterEntries(
  database: QueryDatabase,
  filters: SearchRosterEntriesFilters,
): Promise<RosterEntryRow[]> {
  const clauses: string[] = ["roster_entry_facts.game_id NOT LIKE 'f%'"]
  const values: Array<string | number> = []
  if (filters.player_id) {
    clauses.push('roster_entry_facts.player_id = ?')
    values.push(filters.player_id)
  } else if (filters.player_name) {
    clauses.push('person_names.name = ?')
    values.push(filters.player_name)
  }
  if (filters.game_id) {
    clauses.push('roster_entry_facts.game_id = ?')
    values.push(filters.game_id)
  }
  if (filters.game_date) {
    clauses.push('game_facts.game_date = ?')
    values.push(filters.game_date)
  }
  if (filters.year) {
    clauses.push('game_facts.year = ?')
    values.push(filters.year)
  }
  if (filters.year_from) {
    clauses.push('game_facts.year >= ?')
    values.push(filters.year_from)
  }
  if (filters.year_to) {
    clauses.push('game_facts.year <= ?')
    values.push(filters.year_to)
  }
  if (filters.team) {
    const teams = toJapaneseTeamAliases(filters.team)
    clauses.push(`teams.team_name IN (${teams.map(() => '?').join(', ')})`)
    values.push(...teams)
  }
  if (filters.position) {
    clauses.push('positions.position LIKE ?')
    values.push(`%${filters.position}%`)
  }
  if (filters.batting_order !== undefined) {
    clauses.push('roster_entry_facts.entry_index = ?')
    values.push(filters.batting_order)
  }
  if (filters.starter !== undefined) {
    clauses.push(filters.starter
      ? "roster_groups.group_label LIKE '%スタメン%'"
      : "roster_groups.group_label NOT LIKE '%スタメン%'")
  }
  const rows = await database
    .prepare(
      `SELECT
        roster_entry_facts.game_id AS gameId,
        game_facts.game_date AS gameDate,
        teams.team_name AS team,
        roster_groups.group_label AS groupLabel,
        person_names.name AS playerName,
        roster_entry_facts.uniform_number AS uniformNumber,
        positions.position AS position,
        CASE WHEN roster_groups.group_label LIKE '%スタメン%' THEN 1 ELSE 0 END AS starter,
        CASE WHEN roster_groups.group_label LIKE '%スタメン%' THEN roster_entry_facts.entry_index ELSE NULL END AS battingOrder
      FROM roster_entry_facts
      INNER JOIN game_facts ON game_facts.game_id = roster_entry_facts.game_id
      INNER JOIN teams ON teams.team_id = roster_entry_facts.team_id
      INNER JOIN roster_groups ON roster_groups.roster_group_id = roster_entry_facts.roster_group_id
      INNER JOIN person_names ON person_names.name_id = roster_entry_facts.player_name_id
      LEFT JOIN positions ON positions.position_id = roster_entry_facts.position_id
      WHERE ${clauses.join(' AND ')}
      ORDER BY game_facts.game_date DESC, roster_entry_facts.game_id DESC, roster_entry_facts.entry_index ASC
      LIMIT ?`,
    )
    .all(...values, filters.limit ?? 100)
  return (rows as Array<Omit<RosterEntryRow, 'starter'> & { starter: number | null }>).map((row) => ({
    ...row,
    starter: row.starter == null ? null : Boolean(row.starter),
  }))
}

function playerIdPattern(playerId: string): string {
  return `%${playerId}.html%`
}
