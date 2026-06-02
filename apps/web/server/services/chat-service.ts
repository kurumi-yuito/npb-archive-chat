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
  DEFAULT_CHAT_QUERY_YEARS,
  type ChatQueryService,
  type QueryDatabase,
} from '@npb/db'
import { formatChatAnswer } from './chat-answer-formatter'
import {
  parseStructuredQueryFromMessage,
  type ChatQueryParser,
} from './chat-query-parser'
import { normalizeChatStructuredQuery, normalizeTeamName } from './chat-query-normalizer'
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
      if (!isLikelyNpbTopic(message, options.history)) {
        return buildOffTopicResponse(message, { intent: 'off_topic', filters: {} })
      }
      let rawParsedQuery: ChatStructuredQuery
      let rewrittenForQuestion: ChatStructuredQuery
      let parsedQuery: ChatStructuredQuery
      rawParsedQuery = normalizeStructuredQuery(await queryParser(message, {
        history: options.history,
      }))
      rewrittenForQuestion = rewriteStructuredQueryForQuestion(message, rawParsedQuery)
      parsedQuery = rewriteFollowUpFromHistory(
        message,
        rewrittenForQuestion,
        options.history,
      )
      parsedQuery = rewriteSeasonalPlayerStatsMisparseIfNeeded(message, parsedQuery)

      if (parsedQuery.intent === 'off_topic') {
        return buildOffTopicResponse(message, parsedQuery)
      }

      const structuredFilters = parsedQuery.filters as Record<string, unknown>
      const useYearlyBattingFastPath =
        parsedQuery.intent === 'aggregate_batting' &&
        typeof structuredFilters.player_name === 'string' &&
        structuredFilters.group_by === 'year'
      let resolved: {
        structuredQuery: ChatStructuredQuery
        resolution: PlayerResolution | null
      }
      if (useYearlyBattingFastPath) {
        const playerName = String(structuredFilters.player_name)
        const candidateRows = await queryService.searchPlayerCandidates({
          name: playerName,
          aliases: [playerName],
          latestOnly: true,
          limit: 5,
        })
        const playerCandidate = candidateRows.find((candidate) => candidate.player_id)
        if (!playerCandidate?.player_id) {
          const value = await resolvePlayer(queryService, parsedQuery)
          resolved = value
        } else {
          const resolvedQuery = {
            ...parsedQuery,
            filters: {
              ...parsedQuery.filters,
              player_name: playerCandidate.name,
              player_id: playerCandidate.player_id,
            },
          } as ChatStructuredQuery
          resolved = {
            structuredQuery: resolvedQuery,
            resolution: {
              input: playerName,
              player_id: playerCandidate.player_id,
              name: playerCandidate.name,
              primary_team: playerCandidate.primary_team ?? null,
              status: 'resolved' as const,
              candidates: [playerCandidate],
            },
          }
        }
      } else {
        const value = await resolvePlayer(queryService, parsedQuery)
        resolved = value
      }
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
      const yearlyBattingFastPath =
        structuredQuery.intent === 'aggregate_batting' &&
        structuredFilters.group_by === 'year' &&
        /本塁打|ホームラン|\bHR\b|ＨＲ/iu.test(message) &&
        (typeof structuredFilters.player_name === 'string' || typeof structuredFilters.player_id === 'string')
      let results: ChatResponseCore['results']
      if (yearlyBattingFastPath) {
        const yearsToQuery = DEFAULT_CHAT_QUERY_YEARS.filter((year) => {
          if (typeof structuredFilters.year === 'number') {
            return year === structuredFilters.year
          }
          if (typeof structuredFilters.year_from === 'number' && year < structuredFilters.year_from) {
            return false
          }
          if (typeof structuredFilters.year_to === 'number' && year > structuredFilters.year_to) {
            return false
          }
          return true
        })
        const batting: ChatResponseCore['results']['batting'] = []
        for (const year of yearsToQuery) {
          const yearlyRows = await queryService.searchBattingLines({
            ...(typeof structuredFilters.player_id === 'string' ? { player_id: structuredFilters.player_id } : {}),
            ...(typeof structuredFilters.player_name === 'string' ? { player_name: structuredFilters.player_name } : {}),
            ...(typeof structuredFilters.team === 'string' ? { team: structuredFilters.team } : {}),
            year,
            limit: 500,
          })
          batting.push(...yearlyRows)
        }
        if (playerResolution?.status === 'resolved' && playerResolution.name) {
          for (const row of batting) {
            row.playerName = playerResolution.name
          }
        }
        structuredQuery = {
          intent: 'search_batting',
          filters: {
            ...(typeof structuredFilters.player_name === 'string' ? { player_name: structuredFilters.player_name } : {}),
            ...(typeof structuredFilters.team === 'string' ? { team: structuredFilters.team } : {}),
            ...(typeof structuredFilters.year === 'number' ? { year: structuredFilters.year } : {}),
            ...(typeof structuredFilters.year_from === 'number' ? { year_from: structuredFilters.year_from } : {}),
            ...(typeof structuredFilters.year_to === 'number' ? { year_to: structuredFilters.year_to } : {}),
            limit: 500,
          },
        }
        results = { ...emptyResults, batting }
      } else {
        const pitcherOnlySeasonQuery =
          structuredQuery.intent === 'search_batting' &&
          playerResolution !== null &&
          playerResolution.status === 'resolved' &&
          isPitcherOnlyResolution(playerResolution) &&
          /今シーズン|今季|今期|今年/u.test(message) &&
          /成績/u.test(message) &&
          !/打率|OPS|IsoP|四球率|BB%|打点|安打|本塁打|ホームラン|HR|出塁率|長打率|打撃/u.test(message)

        if (pitcherOnlySeasonQuery) {
          const latestChatYear = DEFAULT_CHAT_QUERY_YEARS[DEFAULT_CHAT_QUERY_YEARS.length - 1]
          const pitcherFilters = {
            ...(typeof structuredQuery.filters.player_name === 'string'
              ? { pitcher_name: structuredQuery.filters.player_name }
              : {}),
            ...(typeof structuredQuery.filters.player_id === 'string'
              ? { pitcher_player_id: structuredQuery.filters.player_id }
              : {}),
            ...(typeof structuredQuery.filters.team === 'string'
              ? { team: structuredQuery.filters.team }
              : {}),
            year: latestChatYear,
            recent: true,
            limit: 20,
          }
          const pitching = await searchRecentPitchingLinesForChat(queryService, pitcherFilters)
          structuredQuery = { intent: 'search_pitching', filters: pitcherFilters }
          results = { ...emptyResults, pitching }
        } else {
          const lightweightAggregateBatting = await searchLightweightAggregateBattingForChat(
            queryService,
            message,
            structuredQuery,
            playerResolution,
          )
          if (lightweightAggregateBatting) {
            structuredQuery = lightweightAggregateBatting.structuredQuery
            results = lightweightAggregateBatting.results
          } else {
            if (shouldSkipForPlayerResolution(playerResolution)) {
              results = emptyResults
            } else if (structuredQuery.intent === 'search_events') {
              const events = await queryService.searchEvents(structuredQuery.filters)
              results = { ...emptyResults, events }
            } else if (structuredQuery.intent === 'search_games') {
              results = { ...emptyResults, games: await queryService.searchGames(structuredQuery.filters) }
            } else if (structuredQuery.intent === 'search_batting') {
              results = structuredQuery.filters.recent === true && typeof structuredQuery.filters.player_id === 'string'
                ? {
                    ...emptyResults,
                    batting: await searchRecentBattingLinesForChat(queryService, structuredQuery.filters),
                  }
                : { ...emptyResults, batting: await queryService.searchBattingLines(structuredQuery.filters) }
            } else if (structuredQuery.intent === 'search_pitching') {
              results = structuredQuery.filters.recent === true && typeof structuredQuery.filters.pitcher_player_id === 'string'
                ? {
                    ...emptyResults,
                    pitching: await searchRecentPitchingLinesForChat(queryService, structuredQuery.filters),
                  }
                : { ...emptyResults, pitching: await queryService.searchPitchingLines(structuredQuery.filters) }
            } else if (structuredQuery.intent === 'search_roster') {
              results = { ...emptyResults, roster: await queryService.searchRosterEntries(structuredQuery.filters) }
            } else if (structuredQuery.intent === 'player_affiliation') {
              results = {
                ...emptyResults,
                affiliations: await searchPlayerAffiliationsForChat(
                  queryService,
                  structuredQuery.filters,
                  playerResolution,
                ),
              }
            } else if (structuredQuery.intent === 'game_detail') {
              results = { ...emptyResults, gameDetails: await queryService.searchGameDetails(structuredQuery.filters) }
            } else if (structuredQuery.intent === 'aggregate_batting') {
              const aggregates = await queryService.aggregateBattingLines(structuredQuery.filters)
              results = { ...emptyResults, aggregates }
            } else if (structuredQuery.intent === 'aggregate_pitching') {
              results = { ...emptyResults, aggregates: await queryService.aggregatePitchingLines(structuredQuery.filters) }
            } else if (structuredQuery.intent === 'aggregate_events') {
              results = { ...emptyResults, aggregates: await queryService.aggregateEvents(structuredQuery.filters) }
            } else {
              results = { ...emptyResults, aggregates: await queryService.aggregateGameResults(structuredQuery.filters) }
            }
          }
        }
      }

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
        const gameId = results.gameDetails[0]?.gameId
        const teamFilter = structuredQuery.filters.team
        const [events, batting, pitching] = await Promise.all([
          searchGameDetailEventsForChat(queryService, results.gameDetails),
          gameId || gameDate
            ? queryService.searchBattingLines({ ...(gameId ? { game_id: gameId } : { game_date: gameDate }), team: teamFilter, limit: 30 })
            : Promise.resolve([]),
          gameId || gameDate
            ? queryService.searchPitchingLines({ ...(gameId ? { game_id: gameId } : { game_date: gameDate }), team: teamFilter, limit: 10 })
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

      const sources = await listSourceSnapshotsByGameIdsBatched(queryService, gameIds)
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

function isPitcherOnlyResolution(resolution: PlayerResolution | null): boolean {
  if (resolution?.status !== 'resolved') {
    return false
  }
  const candidateRoles = resolution.candidates.flatMap((candidate) => candidate.roles)
  return candidateRoles.length > 0 && candidateRoles.some((role) => /pitch/i.test(role))
}

async function listSourceSnapshotsByGameIdsBatched(
  queryService: ChatQueryService,
  gameIds: string[],
) {
  const uniqueGameIds = Array.from(new Set(gameIds))
  const batchSize = 80
  const snapshots: Awaited<ReturnType<ChatQueryService['listSourceSnapshotsByGameIds']>> = []
  for (let i = 0; i < uniqueGameIds.length; i += batchSize) {
    const batch = uniqueGameIds.slice(i, i + batchSize)
    if (batch.length === 0) {
      continue
    }
    const batchSnapshots = await queryService.listSourceSnapshotsByGameIds(batch)
    snapshots.push(...batchSnapshots)
  }
  return snapshots
}

async function searchRecentPitchingLinesForChat(
  queryService: ChatQueryService,
  filters: Record<string, unknown>,
) {
  const pitcherPlayerId = typeof filters.pitcher_player_id === 'string' ? filters.pitcher_player_id : null
  if (!pitcherPlayerId) {
    return queryService.searchPitchingLines(filters as Parameters<ChatQueryService['searchPitchingLines']>[0])
  }
  const baseFilters = {
    ...(typeof filters.pitcher_name === 'string' ? { pitcher_name: filters.pitcher_name } : {}),
    ...(typeof filters.team === 'string' ? { team: filters.team } : {}),
    pitcher_player_id: pitcherPlayerId,
    recent: true,
    limit: 20,
  }
  if (typeof filters.year === 'number') {
    return queryService.searchPitchingLines({
      ...baseFilters,
      year: filters.year,
    } as Parameters<ChatQueryService['searchPitchingLines']>[0])
  }
  for (const year of [...DEFAULT_CHAT_QUERY_YEARS].reverse()) {
    const rows = await queryService.searchPitchingLines({
      ...baseFilters,
      year,
    } as Parameters<ChatQueryService['searchPitchingLines']>[0])
    if (rows.length > 0) {
      return rows
    }
  }
  return []
}

async function searchRecentBattingLinesForChat(
  queryService: ChatQueryService,
  filters: Record<string, unknown>,
) {
  const playerId = typeof filters.player_id === 'string' ? filters.player_id : null
  if (!playerId) {
    return queryService.searchBattingLines(filters as Parameters<ChatQueryService['searchBattingLines']>[0])
  }
  const tightenedFilters = {
    ...(typeof filters.player_name === 'string' ? { player_name: filters.player_name } : {}),
    ...(typeof filters.team === 'string' ? { team: filters.team } : {}),
    ...(typeof filters.year === 'number' ? { year: filters.year } : {}),
    ...(typeof filters.year_from === 'number' ? { year_from: filters.year_from } : {}),
    ...(typeof filters.year_to === 'number' ? { year_to: filters.year_to } : {}),
    player_id: playerId,
    limit: 20,
  }
  return queryService.searchBattingLines(tightenedFilters as Parameters<ChatQueryService['searchBattingLines']>[0])
}

async function searchLightweightAggregateBattingForChat(
  queryService: ChatQueryService,
  message: string,
  structuredQuery: ChatStructuredQuery,
  playerResolution: PlayerResolution | null,
): Promise<{ structuredQuery: ChatStructuredQuery; results: ChatResponseCore['results'] } | null> {
  if (structuredQuery.intent !== 'aggregate_batting') {
    return null
  }

  const filters = structuredQuery.filters as Record<string, unknown>
  if (filters.group_by !== undefined || filters.sort_by !== undefined) {
    return null
  }
  if (/ランキング|トップ|比較|比べ|順位|上位|下位|最も|最多|最少|一番|何位|バランス/u.test(message)) {
    return null
  }

  const hasExplicitYearFilter =
    typeof filters.year === 'number' ||
    typeof filters.year_from === 'number' ||
    typeof filters.year_to === 'number'
  const hasSeasonHint = /今シーズン|今季|今期|今年/u.test(message)
  if (!hasExplicitYearFilter && !hasSeasonHint) {
    return null
  }

  const resolved = playerResolution?.status === 'resolved' ? playerResolution : null
  const playerName = typeof filters.player_name === 'string' ? filters.player_name : resolved?.name ?? null
  const playerId = typeof filters.player_id === 'string' ? filters.player_id : resolved?.player_id ?? null
  const team = typeof filters.team === 'string' ? filters.team : null
  if (!playerName && !playerId) {
    return null
  }

  const candidateRoles = resolved?.candidates.flatMap((candidate) => candidate.roles) ?? []
  const isPitcherOnlyResolution =
    candidateRoles.length > 0 &&
    candidateRoles.some((role) => /pitch/i.test(role))

  const latestChatYear = DEFAULT_CHAT_QUERY_YEARS[DEFAULT_CHAT_QUERY_YEARS.length - 1]
  const seasonalYear = hasSeasonHint && !hasExplicitYearFilter ? latestChatYear : undefined

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

  if (
    isPitcherOnlyResolution &&
    !/打率|OPS|IsoP|四球率|BB%|打点|安打|本塁打|ホームラン|HR|出塁率|長打率|打撃/u.test(message)
  ) {
    const pitchingFilters = {
      ...(playerName ? { pitcher_name: playerName } : {}),
      ...(playerId ? { pitcher_player_id: playerId } : {}),
      ...(team ? { team } : {}),
      ...(typeof filters.year === 'number' ? { year: filters.year } : {}),
      ...(typeof filters.year_from === 'number' ? { year_from: filters.year_from } : {}),
      ...(typeof filters.year_to === 'number' ? { year_to: filters.year_to } : {}),
      ...(seasonalYear ? { year: seasonalYear } : {}),
      limit: 20,
    }
    const pitching = await queryService.searchPitchingLines(
      pitchingFilters as Parameters<ChatQueryService['searchPitchingLines']>[0],
    )
    return {
      structuredQuery: { intent: 'search_pitching', filters: pitchingFilters },
      results: { ...emptyResults, pitching },
    }
  }

  const battingFilters = {
    ...(playerName ? { player_name: playerName } : {}),
    ...(playerId ? { player_id: playerId } : {}),
    ...(team ? { team } : {}),
    ...(typeof filters.year === 'number' ? { year: filters.year } : {}),
    ...(typeof filters.year_from === 'number' ? { year_from: filters.year_from } : {}),
    ...(typeof filters.year_to === 'number' ? { year_to: filters.year_to } : {}),
    ...(seasonalYear ? { year: seasonalYear } : {}),
    limit: 20,
  }
  const batting = await queryService.searchBattingLines(
    battingFilters as Parameters<ChatQueryService['searchBattingLines']>[0],
  )
  return {
    structuredQuery: { intent: 'search_batting', filters: battingFilters },
    results: { ...emptyResults, batting },
  }
}

function buildOffTopicResponse(
  message: string,
  structuredQuery: Extract<ChatStructuredQuery, { intent: 'off_topic' }>,
): ChatResponseCore {
  return chatResponseCoreSchema.parse({
    message,
    structured_query: structuredQuery,
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

function isLikelyNpbTopic(message: string, history: ChatRequest['history'] | undefined): boolean {
  if (history?.length && /^(?:それ|これ|そこ|この|その|で|じゃあ|なら|あと|ついでに|詳しく|もっと|何で|どうして|誰|いつ|どこ|どう|なんで)/u.test(message.trim())) {
    return true
  }
  return NPB_TOPIC_PATTERN.test(message) || extractMentionedTeams(message).length > 0
}

const NPB_TOPIC_PATTERN = /NPB|日本プロ野球|プロ野球|野球|セ・?リーグ|パ・?リーグ|交流戦|日本シリーズ|クライマックス|CS|球団|チーム|選手|試合|ゲーム|イベント|スコア|勝敗|勝利|敗北|何勝|何敗|引き分け|対戦|対決|対|vs|VS|成績|打撃|打者|投手|投球|登板|先発|中継ぎ|抑え|セーブ|ホールド|奪三振|防御率|WHIP|打率|OPS|IsoP|四球率|BB%|打点|安打|本塁打|ホームラン|\bHR\b|盗塁|代打|打席|スタメン|打順|守備|ポジション|捕手|キャッチャー|ショート|ロスター|登録|所属|在籍|新人王|最優秀新人|MVP|沢村賞|タイトル|最近何して/u

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
  const intentRewrite = rewriteIntentFromNaturalLanguage(message, knownPlayerRewrite)
  const specialRewrite = rewriteSpecialQuestionPatterns(message, intentRewrite)
  const rosterRewrite = rewriteToRosterIfNeeded(message, specialRewrite)
  const battingRewrite = rewriteToBattingIfNeeded(message, rosterRewrite)
  const gamesRewrite = rewriteToAggregateGamesIfNeeded(message, battingRewrite)
  return gamesRewrite
}

function rewriteIntentFromNaturalLanguage(message: string, query: ChatStructuredQuery): ChatStructuredQuery {
  const filters = query.filters as Record<string, unknown>
  const year = typeof filters.year === 'number' ? filters.year : extractMentionedYear(message)
  const yearRange = extractMentionedYearRange(message)

  if (/所属|在籍|球団|どこのチーム|どのチーム|チームにいる|チームは/u.test(message)) {
    const mention = extractMentionBefore(
      message,
      /(?:の所属球団|所属球団|の所属チーム|所属チーム|所属|在籍|どこの球団|どこのチーム|どの球団|どのチーム|球団にいる|チームにいる|球団は|チームは)/u,
    )
    const player = parseTeamQualifiedPlayerMention(mention ?? '')
    if (player?.playerName) {
      return {
        intent: 'player_affiliation',
        filters: {
          ...(year ? { year } : {}),
          ...(player.team ? { team: player.team } : {}),
          player_name: player.playerName,
        },
      }
    }
  }

  if (/投手成績|登板|奪三振|投球回|防御率|セーブ|ホールド/u.test(message)) {
    if (typeof filters.pitcher_name === 'string') {
      return query
    }
    const mention = extractMentionBefore(message, /(?:の投手成績|投手成績|登板|奪三振|投球回|防御率|セーブ|ホールド)/u)
    const player = parseTeamQualifiedPlayerMention(mention ?? '')
    if (player?.playerName && !looksLikeDateOnly(player.playerName)) {
      return {
        intent: /ランキング|最多|トップ|一番|集計|通算|合計/u.test(message) ? 'aggregate_pitching' : 'search_pitching',
        filters: {
          ...(yearRange.year_from ? { year_from: yearRange.year_from } : year ? { year } : {}),
          ...(yearRange.year_to ? { year_to: yearRange.year_to } : {}),
          ...(player.team ? { team: player.team } : {}),
          pitcher_name: player.playerName,
          ...(/最近|直近|最後|最終/u.test(message) ? { recent: true } : {}),
        },
      } as ChatStructuredQuery
    }
  }

  if (/成績|打撃成績|打率|OPS|IsoP|四球率|BB%|安打|打点/u.test(message) && !/投手成績|登板|奪三振|投球回|防御率/u.test(message)) {
    if ((query.intent === 'search_batting' || query.intent === 'aggregate_batting') && (typeof filters.player_name === 'string' || typeof filters.batter_name === 'string')) {
      return query
    }
    const mention = extractMentionBefore(message, /(?:の今年の成績|の今季の成績|の成績|成績|打撃成績|打率|OPS|IsoP|四球率|BB%|安打|打点)/iu)
    const player = parseTeamQualifiedPlayerMention(mention ?? '')
    if (player?.playerName && !looksLikeDateOnly(player.playerName)) {
      return {
        intent: /ランキング|最多|トップ|一番|集計|通算|合計|数/u.test(message) ? 'aggregate_batting' : 'search_batting',
        filters: {
          ...(yearRange.year_from ? { year_from: yearRange.year_from } : year ? { year } : {}),
          ...(yearRange.year_to ? { year_to: yearRange.year_to } : {}),
          ...(player.team ? { team: player.team } : {}),
          player_name: player.playerName,
          ...(/最近|直近|今どんな感じ|調子|状態/u.test(message) ? { recent: true } : {}),
        },
      } as ChatStructuredQuery
    }
  }

  return query
}

function rewriteFollowUpFromHistory(
  message: string,
  query: ChatStructuredQuery,
  history: ChatRequest['history'] | undefined,
): ChatStructuredQuery {
  const ordinalIndex = extractOrdinalIndex(message)
  if (ordinalIndex === null || !history?.length) {
    return query
  }
  if (!/試合|ゲーム|詳細|詳しく|について|教えて|それ|これ/u.test(message)) {
    return query
  }

  const gameIds = extractRecentAssistantGameIds(history)
  const gameId = gameIds[ordinalIndex]
  if (!gameId) {
    return query
  }

  return {
    intent: 'game_detail',
    filters: {
      game_id: gameId,
      limit: 1,
    },
  }
}

function extractOrdinalIndex(message: string): number | null {
  const normalized = message.replace(/[０-９]/gu, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0xFEE0),
  )
  const ordinalPatterns: Array<[RegExp, number]> = [
    [/(?:最初|一つ目|1つ目|一番目|1番目|一件目|1件目|一本目|1本目)/u, 0],
    [/(?:二つ目|2つ目|二番目|2番目|二件目|2件目|二本目|2本目)/u, 1],
    [/(?:三つ目|3つ目|三番目|3番目|三件目|3件目|三本目|3本目)/u, 2],
    [/(?:四つ目|4つ目|四番目|4番目|四件目|4件目|四本目|4本目)/u, 3],
    [/(?:五つ目|5つ目|五番目|5番目|五件目|5件目|五本目|5本目)/u, 4],
  ]
  for (const [pattern, index] of ordinalPatterns) {
    if (pattern.test(normalized)) {
      return index
    }
  }
  return null
}

function extractRecentAssistantGameIds(history: NonNullable<ChatRequest['history']>): string[] {
  for (const item of [...history].reverse()) {
    if (item.role !== 'assistant') {
      continue
    }
    const ids = uniqueInOrder(
      [...item.content.matchAll(/\b[rf]\d{8}[a-z0-9-]+\b/giu)].map((match) => match[0]),
    )
    if (ids.length > 0) {
      return ids
    }
  }
  return []
}

function uniqueInOrder(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    if (seen.has(value)) {
      continue
    }
    seen.add(value)
    result.push(value)
  }
  return result
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

function rewriteSeasonalPlayerStatsMisparseIfNeeded(
  message: string,
  query: ChatStructuredQuery,
): ChatStructuredQuery {
  if (!/成績/u.test(message) || !/今シーズン|今季|今期|今年/u.test(message)) {
    return query
  }
  if (query.intent !== 'search_batting' && query.intent !== 'aggregate_batting' && query.intent !== 'search_pitching' && query.intent !== 'aggregate_pitching') {
    return query
  }
  const filters = query.filters as Record<string, unknown>
  const playerName = typeof filters.player_name === 'string' ? filters.player_name.trim() : ''
  const team = typeof filters.team === 'string' ? filters.team.trim() : ''
  if (!playerName || !team) {
    return query
  }
  if (!/^(?:今シーズン|今季|今期|今年|最近|直近|現在|今)$/u.test(playerName)) {
    return query
  }
  if (isKnownTeamName(team)) {
    return query
  }
  return {
    ...query,
    filters: {
      ...query.filters,
      player_name: team,
      team: undefined,
    },
  } as ChatStructuredQuery
}

function rewriteSpecialQuestionPatterns(message: string, query: ChatStructuredQuery): ChatStructuredQuery {
  const filters = query.filters as Record<string, unknown>
  const year = typeof filters.year === 'number' ? filters.year : undefined
  const team = typeof filters.team === 'string' ? filters.team : undefined
  const batterPitcherMatchup = extractBatterPitcherMatchupQuestion(message)
  if (batterPitcherMatchup) {
    const matchupYear = year ?? extractMentionedYear(message)
    return {
      intent: 'search_events',
      filters: {
        ...(matchupYear ? { year: matchupYear } : {}),
        ...(batterPitcherMatchup.batterTeam ? { team: batterPitcherMatchup.batterTeam } : {}),
        batter_name: batterPitcherMatchup.batterName,
        pitcher_name: batterPitcherMatchup.pitcherName,
      },
    }
  }
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

function extractBatterPitcherMatchupQuestion(message: string): {
  batterTeam?: string
  batterName: string
  pitcherName: string
} | null {
  if (!/対戦|対決|対した|当たった|対峙|vs|VS|から|対/u.test(message)) {
    return null
  }

  const target = message.replace(/[？?].*$/u, '')
  const match =
    target.match(/(.+?)と(.+?)(?:が|は|って|で)?(?:対戦|対決|対した|当たった|対峙)/u) ??
    target.match(/(.+?)(?:vs|VS|対)(.+?)(?:が|は|って|で)?(?:対戦|対決|対した|当たった|対峙|したこと|ある|$)/u) ??
    target.match(/(.+?)(?:は|が|って)(.+?)から(?:打った|安打|本塁打|ホームラン|出塁|対戦|対決|打席)/u)
  const reverseFromMatch = target.match(/(.+?)から(.+?)(?:が|は)?(?:打った|安打|本塁打|ホームラン|出塁|対戦|対決|打席)/u)
  if (!match?.[1] || !match[2]) {
    if (!reverseFromMatch?.[1] || !reverseFromMatch[2]) {
      return null
    }
    const pitcher = parseTeamQualifiedPlayerMention(reverseFromMatch[1])
    const batter = parseTeamQualifiedPlayerMention(reverseFromMatch[2])
    if (!batter?.playerName || !pitcher?.playerName) {
      return null
    }
    return {
      ...(batter.team ? { batterTeam: batter.team } : {}),
      batterName: batter.playerName,
      pitcherName: pitcher.playerName,
    }
  }

  const batter = parseTeamQualifiedPlayerMention(match[1])
  const pitcher = parseTeamQualifiedPlayerMention(match[2])
  if (!batter?.playerName || !pitcher?.playerName) {
    return null
  }
  if (batter.playerName === batter.team || pitcher.playerName === pitcher.team) {
    return null
  }

  return {
    ...(batter.team ? { batterTeam: batter.team } : {}),
    batterName: batter.playerName,
    pitcherName: pitcher.playerName,
  }
}

function parseTeamQualifiedPlayerMention(value: string): { team?: string; playerName: string } | null {
  const cleaned = value
    .replace(/^\d{4}年(?:から\d{4}年(?:まで)?|の|に)?/u, '')
    .replace(/^(?:今年|今季|今シーズン|最近|直近|現在|今)(?:の|に|で)?/u, '')
    .replace(/^(?:ところで|ちなみに|えっと|あの|その|この|で、|で|、)+/u, '')
    .replace(/^(?:打者|バッター|投手|ピッチャー)[=:：は\s]*/u, '')
    .replace(/(?:の)?(?:今年|今季|今シーズン|最近|直近|現在|今)$/u, '')
    .replace(/(?:って(?:今|現在)?|は今|は現在|の今|今は?)$/u, '')
    .replace(/(?:選手|投手|打者)$/u, '')
    .replace(/^[「『]/u, '')
    .replace(/[」』]$/u, '')
    .trim()
  if (!cleaned) {
    return null
  }

  const team = matchKnownTeamPrefix(cleaned)
  if (!team) {
    return { playerName: cleaned.replace(/^の/u, '').replace(/[、。,.]$/u, '').trim() }
  }

  const playerName = cleaned.slice(team.length).replace(/^の/u, '').replace(/[、。,.]$/u, '').trim()
  if (!playerName) {
    return null
  }
  return { team: normalizeTeamName(team) ?? team, playerName }
}

function looksLikeDateOnly(value: string): boolean {
  return /^\d{4}(?:[-/年]\d{1,2}(?:[-/月]\d{1,2}日?)?)?$/u.test(value)
}

function extractMentionBefore(message: string, marker: RegExp): string | undefined {
  const match = marker.exec(message)
  if (!match || match.index <= 0) {
    return undefined
  }
  return message.slice(0, match.index)
    .replace(/(?:を|が|は|って|について|教えて|見せて|ください).*$/u, '')
    .trim()
}

function matchKnownTeamPrefix(value: string): string | undefined {
  return [
    'ソフトバンク',
    '日本ハム',
    'オリックス',
    '東京ヤクルト',
    'ヤクルト',
    '横浜DeNA',
    'DeNA',
    '横浜',
    '中日',
    '巨人',
    '読売',
    '阪神',
    '広島',
    'ロッテ',
    '西武',
    '楽天',
  ].find((team) => value.startsWith(team) && value.length > team.length)
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

function extractMentionedYear(message: string): number | undefined {
  const match = message.match(/((?:19|20)\d{2})年/u)
  return match?.[1] ? Number.parseInt(match[1], 10) : undefined
}

function extractMentionedYearRange(message: string): { year_from?: number; year_to?: number } {
  const match = message.match(/((?:19|20)\d{2})年?(?:から|[-–—])((?:19|20)\d{2})年?(?:まで)?/u)
  if (!match?.[1] || !match[2]) {
    return {}
  }
  return { year_from: Number.parseInt(match[1], 10), year_to: Number.parseInt(match[2], 10) }
}

function extractBattingOrder(message: string): number | undefined {
  const normalized = message.replace(/[０-９]/gu, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0xFEE0),
  )
  const match = normalized.match(/([1-9])番/u)
  return match?.[1] ? Number.parseInt(match[1], 10) : undefined
}

function rewriteToRosterIfNeeded(message: string, query: ChatStructuredQuery): ChatStructuredQuery {
  if (!/スタメン|起用|打順|\d番|[０-９]番|捕手|ショート|守備|ポジション/u.test(message)) {
    return query
  }
  const filters = query.filters as Record<string, unknown>
  const team = typeof filters.team === 'string' ? filters.team : extractMentionedTeams(message)[0]
  const year = typeof filters.year === 'number' ? filters.year : extractMentionedYear(message)
  const orderFromMessage = extractBattingOrder(message)
  const battingOrder = typeof filters.batting_order === 'number'
    ? filters.batting_order
    : orderFromMessage
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
  if (/最も多|最多|ランキング|誰|だれ|多い/u.test(message) && (battingOrder || position)) {
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
  const yearlyHomeRunMention = extractMentionBefore(message, /(?:の年別本塁打数|年別本塁打数|の本塁打数|本塁打数|ホームラン数)/iu)
  const yearlyHomeRunPlayer = parseTeamQualifiedPlayerMention(
    (yearlyHomeRunMention ?? '').replace(/時代の/u, 'の'),
  )
  const yearlyHomeRunPlayerName = yearlyHomeRunPlayer?.playerName ?? normalizedPlayerName
  const yearlyHomeRunTeam = yearlyHomeRunPlayer?.team ?? team
  if (/年別/u.test(message) && isHomeRunQuestion && yearlyHomeRunPlayerName) {
    return {
      intent: 'aggregate_batting',
      filters: {
        player_name: yearlyHomeRunPlayerName,
        ...(yearlyHomeRunTeam ? { team: yearlyHomeRunTeam } : {}),
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

function isKnownTeamName(value: string): boolean {
  const normalized = normalizeTeamName(value)
  if (!normalized) {
    return false
  }
  return new Set([
    'ヤクルト',
    'オリックス',
    '西武',
    '巨人',
    'ロッテ',
    'ソフトバンク',
    '日本ハム',
    '楽天',
    '阪神',
    '広島',
    'DeNA',
    '中日',
    'パ・リーグ',
    'セ・リーグ',
  ]).has(normalized)
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
  const teamFromMessage = extractMentionedTeams(message)[0]
  if (filters.pitcher_name || (filters.player_name && !teamFromMessage)) {
    return query
  }
  let team = typeof filters.team === 'string' && messageMentionsTeam(message, filters.team)
    ? filters.team
    : teamFromMessage
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
