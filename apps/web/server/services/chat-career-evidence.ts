import { officialInningsOuts, type QueryContract } from '@npb/schemas'
import type { ChatQueryService } from '@npb/db'
import { allStatisticMetrics } from './chat-statistic-metrics'

export type CareerEvidence = {
  verified: boolean; rows: Awaited<ReturnType<ChatQueryService['aggregateBattingLines']>>; sourceUrls: string[]; basisText: string | null
}

/** An official career footer replaces scans over a partially collected appearance archive. */
export async function searchOfficialCareerEvidence(service: Pick<ChatQueryService, 'searchPlayerInformation'>, input: {
  contract: QueryContract; domain: 'batting' | 'pitching'; playerId: string; playerName: string
}): Promise<CareerEvidence> {
  const unavailable: CareerEvidence = { verified: false, rows: [], sourceUrls: [], basisText: null }
  const time = input.contract.temporal_scope
  if (time.relative !== 'career' || time.years.length || time.year_from !== null || time.year_to !== null || time.date_from !== null || time.date_to !== null || input.contract.entities.some((entity) => entity.kind !== 'player')) return unavailable
  const profiles = await service.searchPlayerInformation({ player_id: input.playerId, player_name: input.playerName, includeCareer: true })
  const matching = profiles.filter((profile) => profile.playerId === input.playerId)
  if (matching.length !== 1) return unavailable
  const records = (matching[0]!.careerStatistics ?? []).filter((row) => row.kind === input.domain && row.sourceUrl === `https://npb.jp/bis/players/${input.playerId}.html`)
  if (records.length !== 1) return unavailable
  const record = records[0]!
  const stats: Record<string, string | number | null> = { playerId: input.playerId, playerName: matching[0]!.name,
    yearFrom: record.yearFrom, yearTo: record.yearTo, sourceUrl: record.sourceUrl, careerProof: 'official_profile_annual_reconciled' }
  Object.assign(stats, officialProfileMetricStats(input.domain, record.metrics))
  const games = stats.games
  if (typeof games !== 'number' || !Number.isInteger(games) || games < 0) return unavailable
  return { verified: true, rows: [{ kind: input.domain, label: matching[0]!.name, total: games, stats }], sourceUrls: [record.sourceUrl], basisText: record.basisText }
}

export function officialProfileMetricStats(domain: 'batting' | 'pitching', metrics: Record<string, string>): Record<string, number> {
  const stats: Record<string, number> = {}
  const normalized = (value: string) => value.normalize('NFKC').replace(/[\s_-]+/gu, '').toLowerCase()
  for (const metric of allStatisticMetrics(domain)) {
    const aliases = [metric.field, metric.label, ...metric.aliases].map(normalized)
    const raw = Object.entries(metrics).find(([field]) => aliases.includes(normalized(field)))?.[1]
    if (metric.field === 'inningsPitched' && raw !== undefined) {
      try { stats[metric.field] = officialInningsOuts(raw) / 3 } catch { /* Invalid notation is not a numeric fact. */ }
      continue
    }
    if (raw === undefined || !/^(?:\d+(?:\s*\.\d+)?|\.\d+)$/u.test(raw)) continue
    stats[metric.field] = Number(raw.replace(/\s+/gu, ''))
  }
  return stats
}
