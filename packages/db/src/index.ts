import { parserPackage } from '@npb/parser'
import {
  parseEnrichScoresCalendarArgs,
  runScoresCalendarEnrichment,
} from './enrich-scores-calendar'
import {
  parseEnrichBisFarmBoxesArgs,
  runBisFarmBoxEnrichment,
  parseBisFarmBoxHtml,
} from './enrich-bis-farm-boxes'
import {
  parseBackfillScoresCanonicalArgs,
  runBackfillScoresCanonical,
} from './backfill-scores-canonical'
import {
  listGamesByDate,
  aggregateBattingLines,
  aggregateEvents,
  aggregatePitchingLines,
  FREE_CHAT_MONTHLY_LIMIT,
  currentUsageMonthKey,
  getOrCreateChatAccount,
  getChatAccount,
  getChatAccountByAuthIdentity,
  linkOrCreateGoogleChatAccount,
  listEventsByGameId,
  listLoadedGameIdsByYear,
  listSourceSnapshotsByGameIds,
  consumeChatUsageForFreeUser,
  getChatUsageCount,
  incrementChatUsageForFreeUser,
  refundChatUsageForFreeUser,
  updateChatAccountBillingState,
  updateChatAccountPlan,
  updateChatAccountProfile,
  searchPlayerCandidates,
  searchPlayerAffiliations,
  searchBattingLines,
  searchGameDetails,
  searchEvents,
  searchGames,
  searchPitchingLines,
  searchRosterEntries,
  searchAwardWinners,
  getNormalizedRuntimeMetadata,
} from './repository/index'
import {
  parseUpdateYearArgs,
  runIncrementalUpdate,
} from './update-job'
import {
  parseSyncD1Args,
  runD1Sync,
} from './d1-sync'
import {
  parseNormalizeDatabaseArgs,
  runNormalizeDatabase,
} from './normalized-conversion'
import {
  parseSyncNormalizedD1Args,
  runNormalizedD1Sync,
} from './normalized-d1-sync'
import {
  parseUpdateDailyArgs,
  resolveDailyDateRange,
  runDailyUpdate,
} from './update-daily'
import {
  parseRebuildYearFromR2Args,
  rebuildYearFromR2,
} from './r2-rebuild-year'
import {
  BIS_TEAMS,
  loadBisCurrentDataset,
  parsePlayerProfilesUpdateArgs,
  parseUpdateBisCurrentArgs,
  runBisCurrentUpdate,
  runPlayerProfilesUpdate,
} from './bis-current'
export {
  materializePlayerIdentityArtifacts,
  parsePlayerIdentityBackfillArgs,
  runPlayerIdentityBackfill,
} from './player-identity-maintenance'
import { migrateDatabase, resolveMigrationsDir } from './migrations'
import { sqliteDatabaseToQuery, withTransactionAsync } from './query-driver'
import { openDatabase } from './sqlite'
import {
  createMultiYearQueryService,
  createSingleDatabaseQueryService,
  DEFAULT_CHAT_QUERY_YEARS,
} from './multi-year-query-service'

export const upstreamParserPackage: () => string = parserPackage

export function dbPackage(): string {
  return '@npb/db'
}

export type { SqliteDatabase } from './sqlite'
export type { QueryDatabase, QueryStatement } from './query-driver'
export type {
  AggregateRow,
  BattingLineRow,
  EventRow,
  GameDetailRow,
  GameSummaryRow,
  PitchingLineRow,
  PlayerCandidate,
  PlayerAffiliationRow,
  RosterEntryRow,
  SourceSnapshotRow,
  AwardWinnerRow,
  ChatAccountRow,
  GoogleAccountInput,
  UpdateChatAccountBillingInput,
  UpdateChatAccountInput,
  SearchPlayerCandidatesFilters,
} from './repository/index'
export type { ChatQueryService } from './multi-year-query-service'

export {
  BIS_TEAMS,
  FREE_CHAT_MONTHLY_LIMIT,
  currentUsageMonthKey,
  listGamesByDate,
  aggregateBattingLines,
  aggregateEvents,
  aggregatePitchingLines,
  createMultiYearQueryService,
  createSingleDatabaseQueryService,
  DEFAULT_CHAT_QUERY_YEARS,
  consumeChatUsageForFreeUser,
  getChatUsageCount,
  getOrCreateChatAccount,
  refundChatUsageForFreeUser,
  getChatAccount,
  getChatAccountByAuthIdentity,
  incrementChatUsageForFreeUser,
  linkOrCreateGoogleChatAccount,
  updateChatAccountBillingState,
  updateChatAccountPlan,
  updateChatAccountProfile,
  listEventsByGameId,
  listLoadedGameIdsByYear,
  listSourceSnapshotsByGameIds,
  loadBisCurrentDataset,
  parsePlayerProfilesUpdateArgs,
  runPlayerProfilesUpdate,
  migrateDatabase,
  resolveMigrationsDir,
  openDatabase,
  sqliteDatabaseToQuery,
  withTransactionAsync,
  parseUpdateYearArgs,
  parseUpdateDailyArgs,
  parseUpdateBisCurrentArgs,
  parseSyncD1Args,
  parseNormalizeDatabaseArgs,
  parseSyncNormalizedD1Args,
  parseRebuildYearFromR2Args,
  resolveDailyDateRange,
  parseBackfillScoresCanonicalArgs,
  parseEnrichScoresCalendarArgs,
  runBackfillScoresCanonical,
  runIncrementalUpdate,
  runDailyUpdate,
  runBisCurrentUpdate,
  runD1Sync,
  runNormalizeDatabase,
  runNormalizedD1Sync,
  rebuildYearFromR2,
  runScoresCalendarEnrichment,
  parseEnrichBisFarmBoxesArgs,
  runBisFarmBoxEnrichment,
  parseBisFarmBoxHtml,
  searchBattingLines,
  searchEvents,
  searchGameDetails,
  searchGames,
  searchPitchingLines,
  searchPlayerAffiliations,
  searchPlayerCandidates,
  searchRosterEntries,
  searchAwardWinners,
  getNormalizedRuntimeMetadata,
}
