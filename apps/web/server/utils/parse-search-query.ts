import {
  searchEventsFiltersSchema,
  searchGamesFiltersSchema,
  searchPitchingLinesFiltersSchema,
  type SearchEventsFilters,
  type SearchGamesFilters,
  type SearchPitchingLinesFilters,
} from '@npb/schemas'

function first(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  if (Array.isArray(value)) {
    const v = value[0]
    return v === undefined || v === null ? undefined : String(v)
  }
  return String(value)
}

function emptyToUndef(s: string | undefined): string | undefined {
  return s === undefined || s === '' ? undefined : s
}

function optionalInt(value: unknown): number | undefined {
  const s = emptyToUndef(first(value))
  if (s === undefined) return undefined
  const n = Number.parseInt(s, 10)
  return Number.isNaN(n) ? undefined : n
}

/** GET クエリを `searchEvents` 用フィルタへ（仕様は docs/db.md の searchEvents と同じ） */
export function parseSearchEventsQuery(
  query: Record<string, unknown>,
): SearchEventsFilters {
  return searchEventsFiltersSchema.parse({
    game_date: emptyToUndef(first(query.game_date)),
    inning: optionalInt(query.inning),
    half: emptyToUndef(first(query.half)),
    team: emptyToUndef(first(query.team)),
    batter_name: emptyToUndef(first(query.batter_name)),
    pitcher_name: emptyToUndef(first(query.pitcher_name)),
    runner_name: emptyToUndef(first(query.runner_name)),
    event_type: emptyToUndef(first(query.event_type)),
    event_subtype: emptyToUndef(first(query.event_subtype)),
    player_name: emptyToUndef(first(query.player_name)),
    limit: optionalInt(query.limit),
  })
}

export function parseSearchGamesQuery(query: Record<string, unknown>): SearchGamesFilters {
  return searchGamesFiltersSchema.parse({
    game_date: emptyToUndef(first(query.game_date)),
    game_id: emptyToUndef(first(query.game_id)),
    limit: optionalInt(query.limit),
  })
}

export function parseSearchPitchingQuery(
  query: Record<string, unknown>,
): SearchPitchingLinesFilters {
  return searchPitchingLinesFiltersSchema.parse({
    game_date: emptyToUndef(first(query.game_date)),
    pitcher_name: emptyToUndef(first(query.pitcher_name)),
    team: emptyToUndef(first(query.team)),
    limit: optionalInt(query.limit),
  })
}
