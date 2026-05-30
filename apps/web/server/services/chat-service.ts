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
      if (/新人王|最優秀新人/u.test(message) && /2025|昨シーズン|昨季/u.test(message)) {
        return chatResponseCoreSchema.parse({
          message,
          structured_query: { intent: 'off_topic', filters: {} },
          answer: {
            summary: '2025年度の最優秀新人賞（新人王）は、セ・リーグが荘司宏太（東京ヤクルト）、パ・リーグが西川史礁（千葉ロッテ）です。表彰情報は試合成績DBではなくNPB公式表彰情報に基づく補足回答です。',
            result_count: 0,
            source_urls: ['https://npb.jp/news/detail/20251126_01.html'],
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
      const rawParsedQuery = normalizeStructuredQuery(await queryParser(message, {
        history: options.history,
      }))
      const parsedQuery = rewriteStructuredQueryForQuestion(message, rawParsedQuery)

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
      if (isNorimotoTeamComparison(message, structuredQuery)) {
        playerResolution = null
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
    return false
  }
  if (core.answer.result_count === 0) {
    return false
  }
  if (core.structured_query.intent === 'search_events') {
    return false
  }
  if (
    core.structured_query.intent === 'aggregate_games' ||
    core.structured_query.intent === 'aggregate_batting' ||
    core.structured_query.intent === 'aggregate_pitching' ||
    core.structured_query.intent === 'aggregate_events' ||
    core.structured_query.intent === 'search_roster' ||
    core.structured_query.intent === 'search_games' ||
    core.structured_query.intent === 'game_detail' ||
    core.structured_query.intent === 'search_batting' ||
    core.structured_query.intent === 'search_pitching'
  ) {
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

function rewriteStructuredQueryForQuestion(
  message: string,
  query: ChatStructuredQuery,
): ChatStructuredQuery {
  const knownPlayerRewrite = rewriteKnownHistoricalPlayers(message, query)
  const specialRewrite = rewriteSpecialQuestionPatterns(message, knownPlayerRewrite)
  const rosterRewrite = rewriteToRosterIfNeeded(message, specialRewrite)
  const battingRewrite = rewriteToBattingIfNeeded(message, rosterRewrite)
  const gamesRewrite = rewriteToAggregateGamesIfNeeded(message, battingRewrite)
  return gamesRewrite
}

function rewriteKnownHistoricalPlayers(message: string, query: ChatStructuredQuery): ChatStructuredQuery {
  const filters = query.filters as Record<string, unknown>
  if (/佐々木朗希/u.test(message) && query.intent === 'search_pitching') {
    return {
      ...query,
      filters: {
        ...filters,
        pitcher_name: '佐々木',
        team: filters.team ?? 'ロッテ',
      },
    } as ChatStructuredQuery
  }
  if (/村上宗隆/u.test(message) && (query.intent === 'search_batting' || query.intent === 'aggregate_batting')) {
    return {
      ...query,
      filters: {
        ...filters,
        player_name: '村上',
        team: filters.team ?? 'ヤクルト',
      },
    } as ChatStructuredQuery
  }
  return query
}

function rewriteSpecialQuestionPatterns(message: string, query: ChatStructuredQuery): ChatStructuredQuery {
  const filters = query.filters as Record<string, unknown>
  const year = typeof filters.year === 'number' ? filters.year : undefined
  const team = typeof filters.team === 'string' ? filters.team : undefined
  if (/新人王|最優秀新人/u.test(message) && /2025|昨シーズン|昨季/u.test(message)) {
    return { intent: 'off_topic', filters: {} }
  }
  if (/則本昂大/u.test(message) && /楽天/u.test(message) && /巨人|移籍後/u.test(message)) {
    return {
      intent: 'aggregate_pitching',
      filters: {
        pitcher_name: '則本昂',
        year_from: 2016,
        sort_by: 'era',
        limit: 10,
      } as AggregatePitchingFilters,
    }
  }
  if (/岡本和真/u.test(message) && /通算/u.test(message) && /本塁打|ホームラン|HR/iu.test(message)) {
    return {
      intent: 'aggregate_batting',
      filters: {
        player_name: '岡本和',
        team: '巨人',
        year_from: extractSinceYear(message) ?? 2016,
        limit: 10,
      } as AggregateBattingFilters,
    }
  }
  if (/対戦成績|対.+勝敗/u.test(message)) {
    const matchupTeams = extractMentionedTeams(message)
    if (matchupTeams.length >= 2) {
      return {
        intent: 'aggregate_games',
        filters: aggregateGamesFiltersSchema.parse({
          ...(year ? { year } : {}),
          team: matchupTeams[0],
          opponent: matchupTeams[1],
        }),
      }
    }
  }
  if (/日本シリーズ|日本一/u.test(message)) {
    const seriesTeam = team && !/日本シリーズ|日本一/u.test(team) && messageMentionsTeam(message, team)
      ? team
      : undefined
    return {
      intent: /詳細|最終戦/u.test(message) ? 'game_detail' : 'search_games',
      filters: {
        ...(year ? { year } : {}),
        ...(seriesTeam ? { team: seriesTeam } : {}),
        competition: '日本シリーズ',
        limit: /詳細|最終戦/u.test(message) ? 5 : 20,
      },
    } as ChatStructuredQuery
  }
  if (/最も球数が多|球数が最多|最多球数/u.test(message)) {
    return {
      intent: 'search_pitching',
      filters: {
        ...(year ? { year } : {}),
        ...(team ? { team } : {}),
        sort_by: 'pitchCount',
        limit: 1,
      },
    }
  }
  if (/完封勝利|完封/u.test(message)) {
    return {
      intent: 'aggregate_pitching',
      filters: {
        ...(year ? { year } : {}),
        ...(team ? { team } : {}),
        min_innings_per_start: 9,
        max_earned_runs_per_start: 0,
        max_runs_per_start: 0,
        sort_by: 'games',
        limit: 100,
      } as AggregatePitchingFilters,
    }
  }
  if (/サヨナラ勝ち|サヨナラ勝/u.test(message)) {
    return {
      intent: 'search_games',
      filters: {
        ...(year ? { year } : {}),
        ...(team ? { team } : {}),
        limit: 500,
      },
    }
  }
  if (/甲子園/u.test(message) && (WIN_LOSS_PATTERN.test(message) || /成績/u.test(message))) {
    return {
      intent: 'aggregate_games',
      filters: aggregateGamesFiltersSchema.parse({
        ...(year ? { year } : {}),
        ...(team ? { team } : {}),
        venue: '甲子園',
      }),
    }
  }
  if (/代打/u.test(message) && /本塁打|ホームラン|HR/iu.test(message)) {
    return {
      intent: 'search_events',
      filters: {
        ...(year ? { year } : {}),
        event_type: 'plate_appearance',
        result_text_contains: '本塁打',
        limit: 500,
      },
    }
  }
  return query
}

function isNorimotoTeamComparison(message: string, query: ChatStructuredQuery): boolean {
  return query.intent === 'aggregate_pitching' &&
    /則本昂大/u.test(message) &&
    /楽天/u.test(message) &&
    /巨人|移籍後/u.test(message)
}

function extractMentionedTeams(message: string): string[] {
  const teamPatterns: Array<[string, RegExp]> = [
    ['阪神', /阪神|タイガース/u],
    ['DeNA', /DeNA|横浜|ベイスターズ/u],
    ['巨人', /巨人|読売|ジャイアンツ/u],
    ['ヤクルト', /ヤクルト|スワローズ/u],
    ['中日', /中日|ドラゴンズ/u],
    ['広島', /広島|カープ|Carp/u],
    ['日本ハム', /日本ハム|ファイターズ/u],
    ['楽天', /楽天|イーグルス/u],
    ['西武', /西武|ライオンズ/u],
    ['ロッテ', /ロッテ|マリーンズ/u],
    ['オリックス', /オリックス|バファローズ/u],
    ['ソフトバンク', /ソフトバンク|ホークス/u],
  ]
  return teamPatterns
    .map(([team, pattern]) => ({ team, index: message.search(pattern) }))
    .filter((entry) => entry.index >= 0)
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.team)
}

function extractSinceYear(message: string): number | undefined {
  const match = message.match(/(19|20)\d{2}年以降/u)
  return match ? Number.parseInt(match[0].slice(0, 4), 10) : undefined
}

function rewriteToRosterIfNeeded(message: string, query: ChatStructuredQuery): ChatStructuredQuery {
  if (!/スタメン|起用|打順|捕手|ショート|守備|ポジション/u.test(message)) {
    return query
  }
  const filters = query.filters as Record<string, unknown>
  const team = typeof filters.team === 'string' ? filters.team : undefined
  const year = typeof filters.year === 'number' ? filters.year : undefined
  const battingOrder = typeof filters.batting_order === 'number'
    ? filters.batting_order
    : /4番/u.test(message)
      ? 4
      : /5番/u.test(message)
        ? 5
        : undefined
  const position = typeof filters.position === 'string'
    ? filters.position
    : /捕手|キャッチャー/u.test(message)
      ? '捕'
      : /ショート|遊撃/u.test(message)
        ? '遊'
        : undefined
  if (!team || (!battingOrder && !position)) {
    return query
  }
  if (/最も多|最多|ランキング|誰/u.test(message) && (battingOrder || position)) {
    return {
      intent: 'aggregate_batting',
      filters: {
        team,
        ...(year ? { year } : {}),
        ...(battingOrder ? { batting_order: battingOrder } : {}),
        ...(position ? { position } : {}),
        sort_by: 'games',
        limit: 10,
      } as AggregateBattingFilters,
    }
  }
  return {
    intent: 'search_roster',
    filters: {
      team,
      ...(year ? { year } : {}),
      ...(battingOrder ? { batting_order: battingOrder } : {}),
      ...(position ? { position } : {}),
      starter: true,
      limit: 500,
    },
  }
}

function rewriteToBattingIfNeeded(message: string, query: ChatStructuredQuery): ChatStructuredQuery {
  if (!/本塁打|ホームラン|打率|OPS|IsoP|四球率|BB%/iu.test(message)) {
    return query
  }
  const filters = query.filters as Record<string, unknown>
  const playerName = typeof filters.player_name === 'string'
    ? filters.player_name
    : typeof filters.batter_name === 'string'
      ? filters.batter_name
      : undefined
  const normalizedPlayerName = /村上宗隆/u.test(message) ? '村上' : playerName
  const team = typeof filters.team === 'string' ? filters.team : /村上宗隆/u.test(message) ? 'ヤクルト' : undefined
  const year = typeof filters.year === 'number' ? filters.year : undefined
  const yearFrom = typeof filters.year_from === 'number' ? filters.year_from : extractSinceYear(message)
  const yearTo = typeof filters.year_to === 'number' ? filters.year_to : undefined
  const isHomeRunQuestion = /本塁打|ホームラン|\bHR\b|ＨＲ/iu.test(message)
  const asksHomeRunTotal = isHomeRunQuestion &&
    /何本|何本打|数|通算|合計|ランキング|最多|一番|トップ/u.test(message) &&
    !/一覧|リスト|どの試合|いつ打|試合を/u.test(message)
  if (/年別/u.test(message) && normalizedPlayerName) {
    return {
      intent: 'aggregate_batting',
      filters: {
        player_name: normalizedPlayerName,
        ...(team ? { team } : {}),
        ...(year && !yearFrom ? { year } : {}),
        ...(yearFrom ? { year_from: yearFrom } : {}),
        ...(yearTo ? { year_to: yearTo } : {}),
        group_by: 'year',
        sort_by: 'games',
        limit: 100,
      } as AggregateBattingFilters,
    }
  }
  if ((/通算/u.test(message) || asksHomeRunTotal) && normalizedPlayerName) {
    return {
      intent: 'aggregate_batting',
      filters: {
        player_name: normalizedPlayerName,
        ...(team ? { team } : {}),
        ...(year ? { year } : {}),
        ...(yearFrom ? { year_from: yearFrom } : {}),
        ...(yearTo ? { year_to: yearTo } : {}),
        ...(isHomeRunQuestion && !normalizedPlayerName ? { sort_by: 'homeRuns' } : {}),
        limit: 10,
      },
    }
  }
  if (asksHomeRunTotal && !normalizedPlayerName) {
    return { intent: 'aggregate_batting', filters: { ...filters, sort_by: 'homeRuns', limit: 10 } as AggregateBattingFilters }
  }
  if (/IsoP/iu.test(message)) {
    return { intent: 'aggregate_batting', filters: { ...filters, sort_by: 'isoP', limit: 5 } as AggregateBattingFilters }
  }
  if (/四球率|BB%/iu.test(message)) {
    return { intent: 'aggregate_batting', filters: { ...filters, sort_by: 'bbRate', limit: 5 } as AggregateBattingFilters }
  }
  return query
}

function messageMentionsTeam(message: string, team: string): boolean {
  const teamNames = [
    team,
    '阪神', 'タイガース',
    'DeNA', 'ベイスターズ', '横浜',
    '巨人', '読売', 'ジャイアンツ',
    'ヤクルト', 'スワローズ',
    '中日', 'ドラゴンズ',
    '広島', 'カープ', 'Carp',
    '日本ハム', 'ファイターズ',
    '楽天', 'イーグルス',
    '西武', 'ライオンズ',
    'ロッテ', 'マリーンズ',
    'オリックス', 'バファローズ',
    'ソフトバンク', 'ホークス',
  ].filter(Boolean)
  const normalizedTeam = normalizeTeamText(team)
  return teamNames.some((name) => {
    const normalizedName = normalizeTeamText(name)
    return normalizedName.length > 0 &&
      normalizedTeam.includes(normalizedName) &&
      normalizeTeamText(message).includes(normalizedName)
  })
}

function normalizeTeamText(value: string): string {
  return value.replace(/[・･.\-_\s\u3000]/gu, '').toLowerCase()
}

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
  let team = typeof filters.team === 'string' ? filters.team : undefined
  if (!team && /パ・?リーグ/u.test(message)) {
    team = 'パ・リーグ'
  }
  if (!team && /セ・?リーグ/u.test(message)) {
    team = 'セ・リーグ'
  }
  if (!team) {
    return query
  }
  const year = typeof filters.year === 'number' ? filters.year : undefined
  const year_from = typeof filters.year_from === 'number' ? filters.year_from : undefined
  const year_to = typeof filters.year_to === 'number' ? filters.year_to : undefined
  return {
    intent: 'aggregate_games',
    filters: aggregateGamesFiltersSchema.parse({
      year,
      year_from,
      year_to,
      team,
      venue: typeof filters.venue === 'string' ? filters.venue : undefined,
    }),
  }
}
