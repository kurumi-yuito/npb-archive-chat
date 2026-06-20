import { z, type ChatStructuredQuery } from '@npb/schemas'
import type { PlayerResolution } from './player-resolution'

export const chatDataRequirementSchema = z.enum([
  'events',
  'games',
  'batting_lines',
  'pitching_lines',
  'roster_entries',
  'player_affiliations',
  'game_details',
  'aggregate_batting',
  'aggregate_pitching',
  'aggregate_events',
  'aggregate_games',
  'source_snapshots',
  'award_winners',
])

export type ChatDataRequirement = z.infer<typeof chatDataRequirementSchema>

export const chatExecutionRepositorySchema = z.enum([
  'searchEvents',
  'searchGames',
  'searchBattingLines',
  'searchPitchingLines',
  'searchRosterEntries',
  'searchPlayerAffiliations',
  'searchGameDetails',
  'aggregateBattingLines',
  'aggregatePitchingLines',
  'aggregateEvents',
  'aggregateGameResults',
  'listSourceSnapshotsByGameIds',
  'fetchAwardWinners',
])

export type ChatExecutionRepository = z.infer<typeof chatExecutionRepositorySchema>

export const chatPlannerOutputSchema = z.object({
  intent: z.string().min(1),
  structuredQuery: z.custom<ChatStructuredQuery>(),
  entities: z.record(z.unknown()),
  timeRange: z.record(z.unknown()).nullable(),
  dataRequirements: z.array(chatDataRequirementSchema),
  confidence: z.number().min(0).max(1),
  clarificationRequired: z.boolean(),
  legacyStabilizationApplied: z.boolean(),
})

export type ChatPlannerOutput = z.infer<typeof chatPlannerOutputSchema>

export type ChatExecutionMetadata = {
  dataRequirements: ChatDataRequirement[]
  repositories: ChatExecutionRepository[]
  playerResolution: PlayerResolution | null
  playerIdRequired: boolean
  playerIdSatisfied: boolean
}

export function inferDataRequirements(query: ChatStructuredQuery): ChatDataRequirement[] {
  const base: ChatDataRequirement[] = (() => {
    switch (query.intent) {
      case 'search_events':
        return ['events'] as ChatDataRequirement[]
      case 'search_games':
        return ['games'] as ChatDataRequirement[]
      case 'search_batting':
        return ['batting_lines'] as ChatDataRequirement[]
      case 'search_pitching':
        return ['pitching_lines'] as ChatDataRequirement[]
      case 'search_roster':
        return ['roster_entries'] as ChatDataRequirement[]
      case 'player_affiliation':
        return ['player_affiliations'] as ChatDataRequirement[]
      case 'game_detail':
        return ['game_details', 'events', 'batting_lines', 'pitching_lines'] as ChatDataRequirement[]
      case 'aggregate_batting':
        return ['aggregate_batting'] as ChatDataRequirement[]
      case 'aggregate_pitching':
        return ['aggregate_pitching'] as ChatDataRequirement[]
      case 'aggregate_events':
        return ['aggregate_events'] as ChatDataRequirement[]
      case 'aggregate_games':
        return ['aggregate_games'] as ChatDataRequirement[]
      case 'award_winners':
        return ['award_winners'] as ChatDataRequirement[]
      case 'off_topic':
        return [] as ChatDataRequirement[]
    }
  })()
  return base.length > 0 ? [...base, 'source_snapshots'] : base
}

export function repositoriesForQuery(query: ChatStructuredQuery): ChatExecutionRepository[] {
  const repos: ChatExecutionRepository[] = (() => {
    switch (query.intent) {
      case 'search_events':
        return ['searchEvents'] as ChatExecutionRepository[]
      case 'search_games':
        return ['searchGames'] as ChatExecutionRepository[]
      case 'search_batting':
        return ['searchBattingLines'] as ChatExecutionRepository[]
      case 'search_pitching':
        return ['searchPitchingLines'] as ChatExecutionRepository[]
      case 'search_roster':
        return ['searchRosterEntries'] as ChatExecutionRepository[]
      case 'player_affiliation':
        return ['searchPlayerAffiliations'] as ChatExecutionRepository[]
      case 'game_detail':
        return ['searchGameDetails', 'searchEvents', 'searchBattingLines', 'searchPitchingLines'] as ChatExecutionRepository[]
      case 'aggregate_batting':
        return ['aggregateBattingLines'] as ChatExecutionRepository[]
      case 'aggregate_pitching':
        return ['aggregatePitchingLines'] as ChatExecutionRepository[]
      case 'aggregate_events':
        return ['aggregateEvents'] as ChatExecutionRepository[]
      case 'aggregate_games':
        return ['aggregateGameResults'] as ChatExecutionRepository[]
      case 'award_winners':
        return ['fetchAwardWinners'] as ChatExecutionRepository[]
      case 'off_topic':
        return [] as ChatExecutionRepository[]
    }
  })()
  return repos.length > 0 ? [...repos, 'listSourceSnapshotsByGameIds'] : repos
}

export function extractPlannerEntities(query: ChatStructuredQuery): Record<string, unknown> {
  const filters = query.filters as Record<string, unknown>
  return {
    ...(filters.player_name ? { player: filters.player_name } : {}),
    ...(filters.pitcher_name ? { pitcher: filters.pitcher_name } : {}),
    ...(filters.batter_name ? { batter: filters.batter_name } : {}),
    ...(filters.runner_name ? { runner: filters.runner_name } : {}),
    ...(filters.team ? { team: filters.team } : {}),
    ...(filters.opponent ? { opponent: filters.opponent } : {}),
    ...(filters.game_id ? { game_id: filters.game_id } : {}),
    ...(filters.award_type ? { award_type: filters.award_type } : {}),
  }
}

export function extractPlannerTimeRange(query: ChatStructuredQuery): Record<string, unknown> | null {
  const filters = query.filters as Record<string, unknown>
  const value = {
    ...(filters.game_date ? { game_date: filters.game_date } : {}),
    ...(filters.year ? { year: filters.year } : {}),
    ...(filters.year_from ? { year_from: filters.year_from } : {}),
    ...(filters.year_to ? { year_to: filters.year_to } : {}),
    ...(filters.recent ? { type: 'recent', games: filters.limit ?? 5 } : {}),
  }
  return Object.keys(value).length > 0 ? value : null
}

export function queryHasPlayerName(query: ChatStructuredQuery): boolean {
  const filters = query.filters as Record<string, unknown>
  return typeof filters.player_name === 'string' ||
    typeof filters.pitcher_name === 'string' ||
    typeof filters.batter_name === 'string' ||
    typeof filters.runner_name === 'string'
}

export function queryHasPlayerId(query: ChatStructuredQuery): boolean {
  const filters = query.filters as Record<string, unknown>
  return typeof filters.player_id === 'string' ||
    typeof filters.pitcher_player_id === 'string' ||
    typeof filters.batter_player_id === 'string' ||
    typeof filters.runner_player_id === 'string'
}
