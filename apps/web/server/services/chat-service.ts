import {
  chatResponseCoreSchema,
  type ChatRequest,
  type ChatResponseCore,
  type ChatStructuredQuery,
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
  allowFinalAnswerFallback?: boolean
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
  const allowFinalAnswerFallback = dependencies.allowFinalAnswerFallback ?? true

  return {
    async answerQuestion(
      message: string,
      options: { history?: ChatRequest['history'] } = {},
    ): Promise<ChatResponseCore> {
      const parsedQuery = normalizeStructuredQuery(await queryParser(message, {
        history: options.history,
      }))
      const resolved = await resolvePlayer(queryService, parsedQuery)
      let structuredQuery = resolved.structuredQuery
      const playerResolution = resolved.resolution

      const emptyResults: ChatResponseCore['results'] = {
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

      if (!shouldSkipForPlayerResolution(playerResolution) && structuredQuery.intent === 'game_detail') {
        results = {
          ...results,
          events: await searchGameDetailEventsForChat(queryService, results.gameDetails),
        }
      }

      if (
        !shouldSkipForPlayerResolution(playerResolution) &&
        structuredQuery.intent === 'search_events' &&
        results.events.length === 0
      ) {
        const fallback = await searchGameDetailsFromEventQuery(queryService, structuredQuery)
        if (fallback) {
          structuredQuery = fallback.structuredQuery
          results = fallback.results
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
          const summary = await generateFinalAnswer({
            ...core,
            history: options.history,
          })
          return chatResponseCoreSchema.parse({
            ...core,
            answer: {
              ...core.answer,
              summary,
            },
          })
        } catch {
          if (!allowFinalAnswerFallback) {
            throw new Error('CHAT_ANSWER_LLM generation failed')
          }
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

async function searchGameDetailEventsForChat(
  queryService: ChatQueryService,
  gameDetails: Array<{ gameId: string }>,
) {
  const rows = await Promise.all(
    gameDetails.slice(0, 5).map((game) =>
      queryService.searchEvents({
        game_id: game.gameId,
        limit: 120,
      })),
  )
  return rows.flat()
}

async function searchGameDetailsFromEventQuery(
  queryService: ChatQueryService,
  structuredQuery: Extract<ChatStructuredQuery, { intent: 'search_events' }>,
): Promise<{ structuredQuery: Extract<ChatStructuredQuery, { intent: 'game_detail' }>; results: ChatResponseCore['results'] } | null> {
  const filters = structuredQuery.filters
  if (!filters.game_id && !filters.game_date) {
    return null
  }
  const detailQuery: Extract<ChatStructuredQuery, { intent: 'game_detail' }> = {
    intent: 'game_detail',
    filters: {
      game_id: filters.game_id,
      game_date: filters.game_date,
      team: filters.team,
      limit: 10,
    },
  }
  const gameDetails = await queryService.searchGameDetails(detailQuery.filters)
  if (gameDetails.length === 0) {
    return null
  }
  const emptyResults: ChatResponseCore['results'] = {
    events: [],
    games: [],
    pitching: [],
    batting: [],
    roster: [],
    affiliations: [],
    gameDetails: [],
    aggregates: [],
  }
  return {
    structuredQuery: detailQuery,
    results: {
      ...emptyResults,
      gameDetails,
      events: await searchGameDetailEventsForChat(queryService, gameDetails),
    },
  }
}
