import type { ChatQueryService } from '@npb/db'

const methods = new Set<keyof ChatQueryService>([
  'searchEvents', 'searchGames', 'searchBattingLines', 'searchPitchingLines',
  'searchRosterEntries', 'searchPlayerAffiliations', 'searchGameDetails',
  'aggregateBattingLines', 'aggregatePitchingLines', 'aggregateEvents',
  'aggregateGameResults', 'searchPlayerCandidates', 'searchAwardWinners',
  'getNormalizedRuntimeMetadata', 'listSourceSnapshotsByGameIds', 'close',
])

/** Do not open/validate D1 for capability responses that never query records. */
export function lazyChatQueryService(load: () => Promise<ChatQueryService>): ChatQueryService {
  let pending: Promise<ChatQueryService> | undefined
  return new Proxy({} as ChatQueryService, {
    has(_target, key) { return methods.has(key as keyof ChatQueryService) },
    get(_target, key) {
      // This object can be returned from an async function without becoming a thenable.
      if (!methods.has(key as keyof ChatQueryService)) return undefined
      if (key === 'close') return () => { if (pending) void pending.then((service) => service.close()) }
      return async (...args: unknown[]) => {
        pending ??= load()
        const service = await pending
        return Reflect.apply(Reflect.get(service, key), service, args)
      }
    },
  })
}
