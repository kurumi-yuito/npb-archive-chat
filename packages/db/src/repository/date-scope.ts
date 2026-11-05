export type DateBounds = { date_from?: string; date_to?: string }

/** Column names are supplied by repository code; user values remain parameters. */
export function appendDateBounds(clauses: string[], values: Array<string | number>, filters: DateBounds,
  column: 'games.date' | 'game_facts.game_date' | 'hr_games.game_date') {
  if (filters.date_from) { clauses.push(`${column} >= ?`); values.push(filters.date_from) }
  if (filters.date_to) { clauses.push(`${column} <= ?`); values.push(filters.date_to) }
}

export function appendCompetitionLevel(clauses: string[], level: 'first' | 'farm' | undefined,
  column: 'games.game_id' | 'game_facts.game_id') {
  if (level === 'farm') clauses.push(`${column} LIKE 'f%'`)
  if (level === 'first') clauses.push(`${column} NOT LIKE 'f%'`)
}
