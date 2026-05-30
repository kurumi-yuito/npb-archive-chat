import {
  chatResponseCoreSchema,
  aggregateGamesFiltersSchema,
  type AggregateBattingFilters,
  type AggregatePitchingFilters,
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
      const rawParsedQuery = normalizeStructuredQuery(await queryParser(message, {
        history: options.history,
      }))
      const parsedQuery = rewriteToAggregateGamesIfNeeded(message, rawParsedQuery)

      if (parsedQuery.intent === 'off_topic') {
        return chatResponseCoreSchema.parse({
          message,
          structured_query: parsedQuery,
          answer: {
            summary: 'このサービスはNPB（日本プロ野球）に関するご質問にお答えするサービスです。試合結果・選手成績・特定の打席など、プロ野球のことなら何でもお気軽にどうぞ！',
            result_count: 0,
            source_urls: [],
          },
          results: {
            events: [],
            games: [],
            pitching: [],
            batting: [],
            roster: [],
            affiliations: [],
            gameDetails: [],
            aggregates: [],
          },
          sources: [],
        })
      }

      const resolved = await resolvePlayer(queryService, parsedQuery)
      let structuredQuery = resolved.structuredQuery
      let playerResolution = resolved.resolution

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
                          : structuredQuery.intent === 'aggregate_events'
                            ? { ...emptyResults, aggregates: await queryService.aggregateEvents(structuredQuery.filters) }
                            : { ...emptyResults, aggregates: await queryService.aggregateGameResults(structuredQuery.filters) }

      // Year-walk fallback for not_found: when player resolution failed (e.g. ambiguous surname
      // across all years), try resolving in progressively older years where the player may have
      // been the sole bearer of that name in the data.
      if (
        playerResolution?.status === 'not_found' &&
        (structuredQuery.intent === 'aggregate_pitching' || structuredQuery.intent === 'aggregate_batting')
      ) {
        const aggFilters = structuredQuery.filters as Record<string, unknown>
        const requestedYear = (aggFilters.year as number | undefined) ?? new Date().getFullYear()
        for (let y = requestedYear - 1; y >= 2016; y--) {
          const yearQuery = {
            ...structuredQuery,
            filters: { ...structuredQuery.filters, year: y, year_from: undefined, year_to: undefined },
          } as ChatStructuredQuery
          const yearResolved = await resolvePlayer(queryService, yearQuery)
          if (yearResolved.resolution?.status === 'resolved') {
            const resolvedQuery = yearResolved.structuredQuery
            if (resolvedQuery.intent === 'aggregate_pitching') {
              results = { ...emptyResults, aggregates: await queryService.aggregatePitchingLines(resolvedQuery.filters) }
            } else if (resolvedQuery.intent === 'aggregate_batting') {
              results = { ...emptyResults, aggregates: await queryService.aggregateBattingLines(resolvedQuery.filters) }
            }
            structuredQuery = resolvedQuery
            playerResolution = {
              ...yearResolved.resolution,
              yearShiftNote: `${requestedYear}年のデータはデータベースに未登録のため、代わりに最終確認年（${y}年）のデータを表示します。`,
            }
            break
          }
        }
      }

      if (
        !shouldSkipForPlayerResolution(playerResolution) &&
        structuredQuery.intent === 'aggregate_batting' &&
        results.aggregates.length === 0
      ) {
        const aggFilters = structuredQuery.filters as Record<string, unknown>
        if (aggFilters.player_name) {
          const fallbackBatting = await queryService.searchBattingLines({
            player_name: aggFilters.player_name as string,
            ...(aggFilters.team ? { team: aggFilters.team as string } : {}),
            ...(aggFilters.year ? { year: aggFilters.year as number } : {}),
            ...(aggFilters.year_from ? { year_from: aggFilters.year_from as number } : {}),
            ...(aggFilters.year_to ? { year_to: aggFilters.year_to as number } : {}),
            limit: 50,
          })
          if (fallbackBatting.length > 0) {
            structuredQuery = { intent: 'search_batting', filters: {
              player_name: aggFilters.player_name as string,
              ...(aggFilters.team ? { team: aggFilters.team as string } : {}),
              ...(aggFilters.year ? { year: aggFilters.year as number } : {}),
              ...(aggFilters.year_from ? { year_from: aggFilters.year_from as number } : {}),
              ...(aggFilters.year_to ? { year_to: aggFilters.year_to as number } : {}),
              limit: 50,
            }}
            results = { ...emptyResults, batting: fallbackBatting }
          }
        } else if (aggFilters.result_text_contains) {
          // e.g. 得点圏打率 → result_text_contains='得点圏' yields 0 results; retry without that filter
          const retryAggregates = await queryService.aggregateBattingLines({
            ...(aggFilters.year ? { year: aggFilters.year as number } : {}),
            ...(aggFilters.year_from ? { year_from: aggFilters.year_from as number } : {}),
            ...(aggFilters.year_to ? { year_to: aggFilters.year_to as number } : {}),
            ...(aggFilters.team ? { team: aggFilters.team as string } : {}),
            ...(aggFilters.sort_by ? { sort_by: aggFilters.sort_by as AggregateBattingFilters['sort_by'] } : {}),
            ...(aggFilters.limit ? { limit: aggFilters.limit as number } : {}),
          })
          if (retryAggregates.length > 0) {
            structuredQuery = {
              intent: 'aggregate_batting',
              filters: {
                ...(aggFilters.year ? { year: aggFilters.year as number } : {}),
                ...(aggFilters.year_from ? { year_from: aggFilters.year_from as number } : {}),
                ...(aggFilters.year_to ? { year_to: aggFilters.year_to as number } : {}),
                ...(aggFilters.team ? { team: aggFilters.team as string } : {}),
                ...(aggFilters.sort_by ? { sort_by: aggFilters.sort_by as AggregateBattingFilters['sort_by'] } : {}),
                ...(aggFilters.limit ? { limit: aggFilters.limit as number } : {}),
              },
            }
            results = { ...emptyResults, aggregates: retryAggregates }
          }
        }
      }

      if (
        !shouldSkipForPlayerResolution(playerResolution) &&
        playerResolution !== null &&
        playerResolution.status === 'resolved' &&
        structuredQuery.intent === 'aggregate_batting' &&
        results.aggregates.length === 0 &&
        results.batting.length === 0
      ) {
        const aggFilters = structuredQuery.filters as Record<string, unknown>
        const requestedYear = aggFilters.year as number | undefined
        if (requestedYear) {
          const candidateYears = playerResolution.candidates
            .flatMap((c) => c.years)
            .filter((y) => y < requestedYear)
          if (candidateYears.length > 0) {
            const latestPriorYear = Math.max(...candidateYears)
            const shiftedFilters = { ...aggFilters, year: latestPriorYear } as AggregateBattingFilters
            const shiftedAggregates = await queryService.aggregateBattingLines(shiftedFilters)
            if (shiftedAggregates.length > 0) {
              structuredQuery = { intent: 'aggregate_batting', filters: shiftedFilters }
              results = { ...emptyResults, aggregates: shiftedAggregates }
              playerResolution = {
                ...playerResolution,
                yearShiftNote: `${requestedYear}年のデータはデータベースに未登録のため、代わりに最終確認年（${latestPriorYear}年）のデータを表示します。`,
              }
            }
          }
        }
      }

      if (
        !shouldSkipForPlayerResolution(playerResolution) &&
        structuredQuery.intent === 'aggregate_pitching' &&
        results.aggregates.length === 0
      ) {
        const aggFilters = structuredQuery.filters as Record<string, unknown>
        if (aggFilters.pitcher_name || aggFilters.player_name) {
          const pitcherName = (aggFilters.pitcher_name ?? aggFilters.player_name) as string
          const fallbackPitching = await queryService.searchPitchingLines({
            pitcher_name: pitcherName,
            ...(aggFilters.team ? { team: aggFilters.team as string } : {}),
            ...(aggFilters.year ? { year: aggFilters.year as number } : {}),
            ...(aggFilters.year_from ? { year_from: aggFilters.year_from as number } : {}),
            ...(aggFilters.year_to ? { year_to: aggFilters.year_to as number } : {}),
            limit: 20,
          })
          if (fallbackPitching.length > 0) {
            structuredQuery = {
              intent: 'search_pitching',
              filters: {
                pitcher_name: pitcherName,
                ...(aggFilters.team ? { team: aggFilters.team as string } : {}),
                ...(aggFilters.year ? { year: aggFilters.year as number } : {}),
                ...(aggFilters.year_from ? { year_from: aggFilters.year_from as number } : {}),
                ...(aggFilters.year_to ? { year_to: aggFilters.year_to as number } : {}),
                limit: 20,
              },
            }
            results = { ...emptyResults, pitching: fallbackPitching }
          }
        }
      }

      if (
        !shouldSkipForPlayerResolution(playerResolution) &&
        playerResolution !== null &&
        playerResolution.status === 'resolved' &&
        structuredQuery.intent === 'aggregate_pitching' &&
        results.aggregates.length === 0 &&
        results.pitching.length === 0
      ) {
        const aggFilters = structuredQuery.filters as Record<string, unknown>
        const requestedYear = aggFilters.year as number | undefined
        if (requestedYear) {
          const candidateYears = playerResolution.candidates
            .flatMap((c) => c.years)
            .filter((y) => y < requestedYear)
          if (candidateYears.length > 0) {
            const latestPriorYear = Math.max(...candidateYears)
            const shiftedFilters = { ...aggFilters, year: latestPriorYear } as AggregatePitchingFilters
            const shiftedAggregates = await queryService.aggregatePitchingLines(shiftedFilters)
            if (shiftedAggregates.length > 0) {
              structuredQuery = { intent: 'aggregate_pitching', filters: shiftedFilters }
              results = { ...emptyResults, aggregates: shiftedAggregates }
              playerResolution = {
                ...playerResolution,
                yearShiftNote: `${requestedYear}年のデータはデータベースに未登録のため、代わりに最終確認年（${latestPriorYear}年）のデータを表示します。`,
              }
            }
          }
        }
      }

      if (
        !shouldSkipForPlayerResolution(playerResolution) &&
        structuredQuery.intent === 'game_detail' &&
        results.gameDetails.length === 0 &&
        structuredQuery.filters.game_date
      ) {
        const fallbackGames = await queryService.searchGames({
          game_date: structuredQuery.filters.game_date,
          limit: 12,
        })
        if (fallbackGames.length > 0) {
          structuredQuery = {
            intent: 'search_games',
            filters: { game_date: structuredQuery.filters.game_date, limit: 12 },
          }
          results = { ...emptyResults, games: fallbackGames }
        }
      }

      if (!shouldSkipForPlayerResolution(playerResolution) && structuredQuery.intent === 'game_detail') {
        const gameDate = results.gameDetails[0]?.date
        const teamFilter = structuredQuery.filters.team
        const [events, batting, pitching] = await Promise.all([
          searchGameDetailEventsForChat(queryService, results.gameDetails),
          gameDate
            ? queryService.searchBattingLines({ game_date: gameDate, team: teamFilter, limit: 30 })
            : Promise.resolve([]),
          gameDate
            ? queryService.searchPitchingLines({ game_date: gameDate, team: teamFilter, limit: 10 })
            : Promise.resolve([]),
        ])
        results = { ...results, events, batting, pitching }
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
  if (resolution?.status === 'ambiguous') {
    return false
  }
  if (resolution?.status === 'not_found') {
    return true
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

const WIN_LOSS_PATTERN = /チームの勝利数|チームの勝ち数|チームの勝ち星|チームの敗北数|チームの負け数|チームの引き分け数|チームの勝敗|何勝何敗|(?:\d+)?勝(?:\d+)?敗|勝利数|勝ち星|勝ち数|敗北数|負け数|引き分け数|何勝|何敗|勝敗|勝ち越し|負け越し/u

function rewriteToAggregateGamesIfNeeded(
  message: string,
  query: ChatStructuredQuery,
): ChatStructuredQuery {
  if (query.intent === 'aggregate_games') {
    return query
  }
  if (query.intent === 'aggregate_pitching' || query.intent === 'search_pitching') {
    return query
  }
  if (!WIN_LOSS_PATTERN.test(message)) {
    return query
  }
  const filters = query.filters as Record<string, unknown>
  if (filters.pitcher_name || filters.player_name) {
    return query
  }
  const team = typeof filters.team === 'string' ? filters.team : undefined
  if (!team) {
    return query
  }
  const year = typeof filters.year === 'number' ? filters.year : undefined
  const year_from = typeof filters.year_from === 'number' ? filters.year_from : undefined
  const year_to = typeof filters.year_to === 'number' ? filters.year_to : undefined
  return {
    intent: 'aggregate_games',
    filters: aggregateGamesFiltersSchema.parse({ year, year_from, year_to, team }),
  }
}
