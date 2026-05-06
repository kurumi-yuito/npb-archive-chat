import { describe, it, expect } from 'vitest'
import {
  parseSearchEventsQuery,
  parseSearchGamesQuery,
  parseSearchPitchingQuery,
} from '../server/utils/parse-search-query'

describe('parse-search-query', () => {
  it('parses searchEvents query with exact-match fields', () => {
    expect(
      parseSearchEventsQuery({
        game_date: '2025-08-15',
        team: 'l',
        inning: '7',
        limit: '10',
      }),
    ).toEqual({
      game_date: '2025-08-15',
      team: 'l',
      inning: 7,
      limit: 10,
    })
  })

  it('parses searchGames query', () => {
    expect(
      parseSearchGamesQuery({
        game_date: '2025-08-15',
        game_id: 'b-l-17',
      }),
    ).toEqual({
      game_date: '2025-08-15',
      game_id: 'b-l-17',
    })
  })

  it('parses searchPitching query', () => {
    expect(
      parseSearchPitchingQuery({
        game_date: '2025-08-15',
        pitcher_name: '山本',
        team: 'l',
      }),
    ).toEqual({
      game_date: '2025-08-15',
      pitcher_name: '山本',
      team: 'l',
    })
  })

  it('rejects invalid game_date for events', () => {
    expect(() => parseSearchEventsQuery({ game_date: '08-15-2025' })).toThrow()
  })
})
