import {
  chatResponseCoreSchema,
  type ChatStructuredQuery,
  type ChatResponseCore,
  type PlayerAffiliationFilters,
} from '@npb/schemas'
import {
  createSingleDatabaseQueryService,
  type ChatQueryService,
  type QueryDatabase,
} from '@npb/db'
import { formatChatAnswer } from './chat-answer-formatter'
import {
  parseStructuredQueryFromMessage,
  type ChatQueryParser,
} from './chat-query-parser'
import { normalizeChatStructuredQuery } from './chat-query-normalizer'
import {
  resolveStructuredQueryPlayer,
  type PlayerResolution,
} from './player-resolution'
import type { ChatFinalAnswerGenerator } from './chat-final-answer-llm'

type ChatServiceDependencies = {
  parseStructuredQueryFromMessage?: ChatQueryParser
  formatChatAnswer?: typeof formatChatAnswer
  normalizeStructuredQuery?: typeof normalizeChatStructuredQuery
  resolveStructuredQueryPlayer?: typeof resolveStructuredQueryPlayer
  generateFinalAnswer?: ChatFinalAnswerGenerator
}

export function createChatService(
  databaseOrQueryService: QueryDatabase | ChatQueryService,
  dependencies: ChatServiceDependencies = {},
) {
  const queryService = isChatQueryService(databaseOrQueryService)
    ? databaseOrQueryService
    : createSingleDatabaseQueryService(databaseOrQueryService)
  const queryParser =
    dependencies.parseStructuredQueryFromMessage ?? parseStructuredQueryFromMessage
  const answerFormatter = dependencies.formatChatAnswer ?? formatChatAnswer
  const normalizeStructuredQuery =
    dependencies.normalizeStructuredQuery ?? normalizeChatStructuredQuery
  const resolvePlayer =
    dependencies.resolveStructuredQueryPlayer ?? resolveStructuredQueryPlayer
  const generateFinalAnswer = dependencies.generateFinalAnswer

  return {
    async answerQuestion(message: string): Promise<ChatResponseCore> {
      const parsedQuery = normalizeStructuredQuery(await queryParser(message))
      const resolved = await resolvePlayer(queryService, parsedQuery)
      let structuredQuery = resolved.structuredQuery
      const playerResolution = resolved.resolution
      if (
        structuredQuery.intent === 'search_batting' &&
        shouldPreferPitchingForGenericPlayerStats(message, structuredQuery, playerResolution)
      ) {
        structuredQuery = toPitchingStatsQuery(structuredQuery)
      }

      const emptyResults = {
        events: [],
        games: [],
        pitching: [],
        batting: [],
        roster: [],
        affiliations: [],
        gameDetails: [],
        aggregates: [],
      }
      let results = shouldSkipForPlayerResolution(playerResolution)
        ? emptyResults
        : structuredQuery.intent === 'search_events'
          ? { ...emptyResults, events: await queryService.searchEvents(structuredQuery.filters) }
          : structuredQuery.intent === 'search_games'
            ? { ...emptyResults, games: await queryService.searchGames(structuredQuery.filters) }
            : structuredQuery.intent === 'search_batting'
              ? { ...emptyResults, batting: await queryService.searchBattingLines(structuredQuery.filters) }
              : structuredQuery.intent === 'search_pitching'
                ? { ...emptyResults, pitching: await queryService.searchPitchingLines(structuredQuery.filters) }
                : structuredQuery.intent === 'search_roster'
                  ? { ...emptyResults, roster: await queryService.searchRosterEntries(structuredQuery.filters) }
                  : structuredQuery.intent === 'player_affiliation'
                    ? {
                        ...emptyResults,
                        affiliations: await searchPlayerAffiliationsForChat(
                          queryService,
                          structuredQuery.filters,
                          playerResolution,
                        ),
                      }
                    : structuredQuery.intent === 'game_detail'
                      ? { ...emptyResults, gameDetails: await queryService.searchGameDetails(structuredQuery.filters) }
                      : structuredQuery.intent === 'aggregate_batting'
                        ? { ...emptyResults, aggregates: await queryService.aggregateBattingLines(structuredQuery.filters) }
                        : structuredQuery.intent === 'aggregate_pitching'
                          ? { ...emptyResults, aggregates: await queryService.aggregatePitchingLines(structuredQuery.filters) }
                          : { ...emptyResults, aggregates: await queryService.aggregateEvents(structuredQuery.filters) }

      if (
        structuredQuery.intent === 'search_batting' &&
        shouldFallbackToPitchingForGenericPlayerStats(message, structuredQuery, playerResolution) &&
        results.batting.length === 0
      ) {
        const pitchingQuery = toPitchingStatsQuery(structuredQuery)
        const pitching = await queryService.searchPitchingLines(pitchingQuery.filters)
        if (pitching.length > 0) {
          structuredQuery = pitchingQuery
          results = { ...emptyResults, pitching }
        }
      }

      if (
        structuredQuery.intent === 'search_batting' &&
        structuredQuery.filters.recent === true &&
        results.batting.length === 0
      ) {
        results = {
          ...emptyResults,
          batting: await queryService.searchBattingLines({
            ...structuredQuery.filters,
            recent: undefined,
          }),
        }
      }

      const gameIds = Array.from(
        new Set(
          [
            ...results.events.map((row) => row.gameId),
            ...results.games.map((row) => row.gameId),
            ...results.pitching.map((row) => row.gameId),
            ...results.batting.map((row) => row.gameId),
            ...results.roster.map((row) => row.gameId),
            ...results.affiliations.map((row) => row.gameId),
            ...results.gameDetails.map((row) => row.gameId),
          ],
        ),
      )

      const sources = await queryService.listSourceSnapshotsByGameIds(gameIds)
      const answer = answerFormatter({
        question: message,
        structuredQuery,
        results,
        sources,
        playerResolution,
      })
      const core = chatResponseCoreSchema.parse({
        message,
        structured_query: structuredQuery,
        answer,
        results,
        sources,
      })

      if (generateFinalAnswer && shouldUseFinalAnswerLlm(core, playerResolution)) {
        try {
          const summary = await generateFinalAnswer(core)
          return chatResponseCoreSchema.parse({
            ...core,
            answer: {
              ...core.answer,
              summary,
            },
          })
        } catch {
          return core
        }
      }

      return core
    },
  }
}

export type ChatService = ReturnType<typeof createChatService>

function isChatQueryService(value: QueryDatabase | ChatQueryService): value is ChatQueryService {
  return 'searchBattingLines' in value && 'aggregateEvents' in value
}

function shouldSkipForPlayerResolution(resolution: PlayerResolution | null): boolean {
  return resolution?.status === 'ambiguous' || resolution?.status === 'not_found'
}

function shouldUseFinalAnswerLlm(
  core: ChatResponseCore,
  resolution: PlayerResolution | null,
): boolean {
  if (shouldSkipForPlayerResolution(resolution)) {
    return false
  }
  if (core.answer.result_count === 0) {
    return false
  }
  if ((core.answer.remaining_count ?? 0) > 0) {
    return false
  }
  return true
}

function shouldPreferPitchingForGenericPlayerStats(
  message: string,
  structuredQuery: ChatStructuredQuery,
  resolution: PlayerResolution | null,
): boolean {
  if (
    structuredQuery.intent !== 'search_batting' ||
    !isGenericPlayerStatsQuestion(message) ||
    resolution?.status !== 'resolved'
  ) {
    return false
  }
  const roles = new Set(resolution.candidates.flatMap((candidate) => candidate.roles))
  const hasPitchingRole = roles.has('pitcher') || roles.has('bis_pitching')
  const hasBattingRole = roles.has('batter') || roles.has('bis_batting')
  return hasPitchingRole && !hasBattingRole
}

function shouldFallbackToPitchingForGenericPlayerStats(
  message: string,
  structuredQuery: ChatStructuredQuery,
  resolution: PlayerResolution | null,
): boolean {
  return structuredQuery.intent === 'search_batting' &&
    isGenericPlayerStatsQuestion(message) &&
    resolution?.status === 'resolved'
}

function isGenericPlayerStatsQuestion(message: string): boolean {
  if (!/成績|評価|調子|状態|どう思う/u.test(message)) {
    return false
  }
  if (/打撃|打席|打数|安打|打点|打率|出塁率|長打率|本塁打|ホームラン|\bHR\b|ＨＲ/u.test(message)) {
    return false
  }
  if (/投手|投球|登板|奪三振|投球回|防御率|セーブ|ホールド/u.test(message)) {
    return false
  }
  return true
}

function toPitchingStatsQuery(
  structuredQuery: Extract<ChatStructuredQuery, { intent: 'search_batting' }>,
): Extract<ChatStructuredQuery, { intent: 'search_pitching' }> {
  const filters = structuredQuery.filters
  return {
    intent: 'search_pitching',
    filters: {
      year: filters.year,
      year_from: filters.year_from,
      year_to: filters.year_to,
      game_date: filters.game_date,
      pitcher_name: filters.player_name,
      team: filters.team,
      recent: filters.recent,
      limit: filters.limit,
    },
  }
}

function getPlayerAffiliationSearchFilters(
  filters: PlayerAffiliationFilters,
  resolution: PlayerResolution | null,
): PlayerAffiliationFilters {
  if (filters.year || filters.year_from || filters.year_to) {
    return filters
  }
  if (resolution?.status !== 'resolved') {
    return filters
  }

  const latestYear = Math.max(
    ...resolution.candidates.flatMap((candidate) => candidate.years),
  )
  if (!Number.isFinite(latestYear)) {
    return filters
  }

  return { ...filters, year: latestYear }
}

async function searchPlayerAffiliationsForChat(
  queryService: ChatQueryService,
  filters: PlayerAffiliationFilters,
  resolution: PlayerResolution | null,
) {
  const searchFilters = getPlayerAffiliationSearchFilters(filters, resolution)
  const rows = await queryService.searchPlayerAffiliations(searchFilters)
  if (rows.length > 0 || !searchFilters.player_id) {
    return rows
  }

  const fallbackFilters = { ...searchFilters }
  delete fallbackFilters.player_id
  return queryService.searchPlayerAffiliations(fallbackFilters)
}
