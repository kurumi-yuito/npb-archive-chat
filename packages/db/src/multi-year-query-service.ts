import fs from 'node:fs'
import path from 'node:path'
import {
  aggregateBattingLines,
  aggregateEvents,
  aggregatePitchingLines,
  listSourceSnapshotsByGameIds,
  searchBattingLines,
  searchCurrentPitchingStats,
  searchEvents,
  searchGameDetails,
  searchGames,
  searchPitchingLines,
  searchPlayerAffiliations,
  searchPlayerCandidates,
  searchRosterEntries,
  type AggregateRow,
  type BattingLineRow,
  type EventRow,
  type GameDetailRow,
  type GameSummaryRow,
  type PitchingLineRow,
  type PlayerAffiliationRow,
  type PlayerCandidate,
  type SearchPlayerCandidatesFilters,
  type RosterEntryRow,
  type SourceSnapshotRow,
} from './repository'
import { migrateDatabase } from './migrations'
import { sqliteDatabaseToQuery, type QueryDatabase } from './query-driver'
import { openDatabase, type SqliteDatabase } from './sqlite'
import type {
  AggregateBattingFilters,
  AggregateEventsFilters,
  AggregatePitchingFilters,
  GameDetailFilters,
  PlayerAffiliationFilters,
  SearchBattingLinesFilters,
  SearchEventsFilters,
  SearchGamesFilters,
  SearchPitchingLinesFilters,
  SearchRosterEntriesFilters,
} from '@npb/schemas'

export const DEFAULT_CHAT_QUERY_YEARS = [
  2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026,
] as const

type YearFilter = {
  year?: number
  year_from?: number
  year_to?: number
  game_date?: string
}

export type ChatQueryService = {
  searchEvents: (filters: SearchEventsFilters) => Promise<EventRow[]>
  searchGames: (filters: SearchGamesFilters) => Promise<GameSummaryRow[]>
  searchBattingLines: (filters: SearchBattingLinesFilters) => Promise<BattingLineRow[]>
  searchPitchingLines: (filters: SearchPitchingLinesFilters) => Promise<PitchingLineRow[]>
  searchRosterEntries: (filters: SearchRosterEntriesFilters) => Promise<RosterEntryRow[]>
  searchPlayerAffiliations: (filters: PlayerAffiliationFilters) => Promise<PlayerAffiliationRow[]>
  searchGameDetails: (filters: GameDetailFilters) => Promise<GameDetailRow[]>
  aggregateBattingLines: (filters: AggregateBattingFilters) => Promise<AggregateRow[]>
  aggregatePitchingLines: (filters: AggregatePitchingFilters) => Promise<AggregateRow[]>
  aggregateEvents: (filters: AggregateEventsFilters) => Promise<AggregateRow[]>
  searchPlayerCandidates: (filters: SearchPlayerCandidatesFilters) => Promise<PlayerCandidate[]>
  listSourceSnapshotsByGameIds: (gameIds: string[]) => Promise<SourceSnapshotRow[]>
  close: () => void
}

type MultiYearQueryServiceOptions = {
  sqliteDir: string
  years?: readonly number[]
}

export function createSingleDatabaseQueryService(database: QueryDatabase): ChatQueryService {
  return {
    searchEvents: (filters) => searchEvents(database, filters),
    searchGames: (filters) => searchGames(database, filters),
    searchBattingLines: (filters) => searchBattingLines(database, filters),
    searchPitchingLines: async (filters) => {
      const gameRows = await searchPitchingLines(database, filters)
      const needsBis = filters.pitcher_name && !filters.game_date && !filters.year && !filters.year_from && !filters.year_to
      if (!needsBis) return gameRows
      const bisRows = await searchCurrentPitchingStats(database, filters, 15)
      return [...gameRows, ...bisRows]
    },
    searchRosterEntries: (filters) => searchRosterEntries(database, filters),
    searchPlayerAffiliations: (filters) => searchPlayerAffiliations(database, filters),
    searchGameDetails: (filters) => searchGameDetails(database, filters),
    aggregateBattingLines: (filters) => aggregateBattingLines(database, filters),
    aggregatePitchingLines: (filters) => aggregatePitchingLines(database, filters),
    aggregateEvents: (filters) => aggregateEvents(database, filters),
    searchPlayerCandidates: (filters) => searchPlayerCandidates(database, filters),
    listSourceSnapshotsByGameIds: (gameIds) => listSourceSnapshotsByGameIds(database, gameIds),
    close: () => database.close(),
  }
}

export function createMultiYearQueryService({
  sqliteDir,
  years = DEFAULT_CHAT_QUERY_YEARS,
}: MultiYearQueryServiceOptions): ChatQueryService {
  const cache = new Map<number, { raw: SqliteDatabase; query: QueryDatabase }>()

  function availableYears(filters: YearFilter = {}) {
    const targets = selectYears(years, filters)
    return targets.filter((year) => fs.existsSync(sqlitePathForYear(sqliteDir, year)))
  }

  function openYear(year: number): QueryDatabase {
    const cached = cache.get(year)
    if (cached) {
      return cached.query
    }
    const raw = openDatabase(sqlitePathForYear(sqliteDir, year))
    migrateDatabase(raw)
    const query = sqliteDatabaseToQuery(raw)
    cache.set(year, { raw, query })
    return query
  }

  async function runAcrossYears<T, F extends YearFilter>(
    filters: F,
    query: (database: QueryDatabase, filters: F) => Promise<T[]>,
    sortKey: (row: T) => string,
    limit: number,
  ): Promise<T[]> {
    const rows: T[] = []
    for (const year of availableYears(filters)) {
      rows.push(...await query(openYear(year), filters))
    }
    return rows.sort((a, b) => sortKey(a).localeCompare(sortKey(b), 'ja')).slice(0, limit)
  }

  return {
    searchEvents: (filters) =>
      runAcrossYears(
        filters,
        searchEvents,
        (row) => `${row.gameDate}:${row.gameId}:${row.sequence}`,
        filters.limit ?? 50,
      ),
    searchGames: (filters) =>
      runAcrossYears(
        filters,
        searchGames,
        (row) => `${row.date}:${row.gameId}`,
        filters.limit ?? 50,
      ),
    searchBattingLines: (filters) =>
      runAcrossYears(
        filters,
        searchBattingLines,
        (row) => `${row.gameDate}:${row.gameId}:${row.team}:${row.playerName}`,
        filters.limit ?? 50,
      ),
    searchPitchingLines: async (filters) => {
      const gameRows = await runAcrossYears(
        filters,
        searchPitchingLines,
        (row) => `${row.gameDate}:${row.gameId}:${row.team}:${row.pitcherName}`,
        filters.limit ?? 50,
      )
      // BIS season stats are excluded from runAcrossYears (they get cut by the sort+limit).
      // Fetch them separately from the most recent years and append after game rows.
      const needsBis = filters.pitcher_name && !filters.game_date && !filters.year && !filters.year_from && !filters.year_to
      if (!needsBis) return gameRows
      const bisRows = []
      for (const year of [...availableYears(filters)].sort((a, b) => b - a).slice(0, 3)) {
        const rows = await searchCurrentPitchingStats(openYear(year), filters, 5)
        bisRows.push(...rows)
      }
      return [...gameRows, ...bisRows]
    },
    searchRosterEntries: (filters) =>
      runAcrossYears(
        filters,
        searchRosterEntries,
        (row) => `${row.gameDate}:${row.gameId}:${row.team}:${row.battingOrder ?? 999}:${row.playerName}`,
        filters.limit ?? 100,
      ),
    searchPlayerAffiliations: (filters) =>
      runAcrossYears(
        filters,
        searchPlayerAffiliations,
        (row) => `${9999 - row.year}:${affiliationSourceRank(row.sourceKind)}:${row.gameDate}:${row.gameId}:${row.team}`,
        filters.limit ?? 200,
      ),
    searchGameDetails: (filters) =>
      runAcrossYears(
        filters,
        searchGameDetails,
        (row) => `${row.date}:${row.gameId}`,
        filters.limit ?? 20,
      ),
    aggregateBattingLines: async (filters) => mergeAggregates(
      await runAggregateAcrossYears(filters, (db) => aggregateBattingLines(db, filters)),
      filters.limit ?? 50,
    ),
    aggregatePitchingLines: async (filters) => mergeAggregates(
      await runAggregateAcrossYears(filters, (db) => aggregatePitchingLines(db, filters)),
      filters.limit ?? 50,
    ),
    aggregateEvents: async (filters) => mergeAggregates(
      await runAggregateAcrossYears(filters, (db) => aggregateEvents(db, filters)),
      filters.limit ?? 50,
    ),
    searchPlayerCandidates: async (filters) => mergePlayerCandidates(
      await runPlayerCandidateAcrossYears(filters),
      filters.limit ?? 10,
    ),
    listSourceSnapshotsByGameIds: async (gameIds) => {
      const sources: SourceSnapshotRow[] = []
      const yearToIds = new Map<number, string[]>()
      for (const gameId of gameIds) {
        const year = inferYearFromGameId(gameId)
        const targetYears = year ? [year] : [...years]
        for (const targetYear of targetYears) {
          const ids = yearToIds.get(targetYear) ?? []
          ids.push(gameId)
          yearToIds.set(targetYear, ids)
        }
      }
      for (const [year, ids] of yearToIds) {
        if (!fs.existsSync(sqlitePathForYear(sqliteDir, year))) {
          continue
        }
        sources.push(...await listSourceSnapshotsByGameIds(openYear(year), ids))
      }
      return sources
    },
    close: () => {
      for (const { raw } of cache.values()) {
        raw.close()
      }
      cache.clear()
    },
  }

  async function runAggregateAcrossYears<F extends YearFilter>(
    filters: F,
    query: (database: QueryDatabase) => Promise<AggregateRow[]>,
  ): Promise<AggregateRow[]> {
    const rows: AggregateRow[] = []
    for (const year of availableYears(filters)) {
      rows.push(...await query(openYear(year)))
    }
    return rows
  }

  async function runPlayerCandidateAcrossYears(
    filters: SearchPlayerCandidatesFilters,
  ): Promise<PlayerCandidate[]> {
    const rows: PlayerCandidate[] = []
    const candidateYears = filters.latestOnly
      ? [...availableYears(filters)].sort((a, b) => b - a)
      : availableYears(filters)
    for (const year of candidateYears) {
      const yearRows = await searchPlayerCandidates(openYear(year), {
        ...filters,
        ...(filters.latestOnly ? { year } : {}),
      })
      rows.push(...yearRows)
      if (filters.latestOnly && yearRows.length > 0) {
        break
      }
    }
    return rows
  }
}

function affiliationSourceRank(sourceKind: PlayerAffiliationRow['sourceKind']): number {
  const ranks: Record<PlayerAffiliationRow['sourceKind'], number> = {
    bis_roster: 0,
    roster: 1,
    batting: 2,
    pitching: 3,
    event: 4,
  }
  return ranks[sourceKind]
}

function sqlitePathForYear(sqliteDir: string, year: number): string {
  return path.join(sqliteDir, `npb-${year}.sqlite`)
}

function selectYears(years: readonly number[], filters: YearFilter): number[] {
  const fromDateYear = filters.game_date ? Number(filters.game_date.slice(0, 4)) : undefined
  const exact = filters.year ?? fromDateYear
  if (exact) {
    return years.includes(exact) ? [exact] : []
  }
  const from = filters.year_from ?? Math.min(...years)
  const to = filters.year_to ?? Math.max(...years)
  return years.filter((year) => year >= from && year <= to)
}

function inferYearFromGameId(gameId: string): number | null {
  const match = gameId.match(/^[a-z](\d{4})\d{4}/iu)
  return match?.[1] ? Number(match[1]) : null
}

function mergeAggregates(rows: AggregateRow[], limit: number): AggregateRow[] {
  const merged = new Map<string, AggregateRow>()
  for (const row of rows) {
    const key = `${row.kind}:${row.label}`
    const current = merged.get(key)
    if (!current) {
      merged.set(key, { ...row, stats: { ...row.stats } })
      continue
    }
    current.total += row.total
    for (const [statKey, statValue] of Object.entries(row.stats)) {
      const currentValue = current.stats[statKey]
      if (typeof currentValue === 'number' && typeof statValue === 'number') {
        current.stats[statKey] = currentValue + statValue
      } else if (currentValue == null) {
        current.stats[statKey] = statValue
      }
    }
  }
  return [...merged.values()]
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, 'ja'))
    .slice(0, limit)
}

function mergePlayerCandidates(rows: PlayerCandidate[], limit: number): PlayerCandidate[] {
  const merged = new Map<string, PlayerCandidate>()
  for (const row of rows) {
    const key = row.player_id ?? `${row.name}:${row.primary_team ?? row.teams.join('/')}`
    const current = merged.get(key)
    if (!current) {
      merged.set(key, { ...row, roles: [...row.roles], teams: [...row.teams], years: [...row.years] })
      continue
    }
    current.roles = [...new Set([...current.roles, ...row.roles])]
    current.teams = [...new Set([...current.teams, ...row.teams])]
    current.years = [...new Set([...current.years, ...row.years])].sort((a, b) => a - b)
    current.primary_team ??= row.primary_team
  }
  return [...merged.values()].slice(0, limit)
}
