import type {
  SearchEventsFilters,
  SearchGamesFilters,
  SearchPitchingLinesFilters,
} from '@npb/schemas'
import {
  listEventsByGameId,
  listSourceSnapshotsByGameIds,
  searchEvents,
  searchGames,
  searchPitchingLines,
  type QueryDatabase,
} from '@npb/db'

export function createSearchService(database: QueryDatabase) {
  return {
    listEventsByGameId: (gameId: string) => listEventsByGameId(database, gameId),
    listSourceSnapshotsByGameIds: (gameIds: string[]) =>
      listSourceSnapshotsByGameIds(database, gameIds),
    searchEvents: (filters: SearchEventsFilters) => searchEvents(database, filters),
    searchGames: (filters: SearchGamesFilters) => searchGames(database, filters),
    searchPitchingLines: (filters: SearchPitchingLinesFilters) =>
      searchPitchingLines(database, filters),
  }
}

export type SearchService = ReturnType<typeof createSearchService>
