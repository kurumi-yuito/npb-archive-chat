import { officialInningsOuts, type QueryContract } from '@npb/schemas'
import { matchesGameTeamFilter, type ChatQueryService } from '@npb/db'
import { allStatisticMetrics } from './chat-statistic-metrics'
import { resolveContractTeamMention } from './chat-team-resolution'

export type CareerEvidence = {
  verified: boolean; rows: Awaited<ReturnType<ChatQueryService['aggregateBattingLines']>>; sourceUrls: string[]; basisText: string | null
}

/** An official career footer replaces scans over a partially collected appearance archive. */
export async function searchOfficialCareerEvidence(service: Pick<ChatQueryService, 'searchPlayerInformation'>, input: {
  contract: QueryContract; domain: 'batting' | 'pitching'; playerId: string; playerName: string
}): Promise<CareerEvidence> {
  const unavailable: CareerEvidence = { verified: false, rows: [], sourceUrls: [], basisText: null }
  const time = input.contract.temporal_scope
  const teams = input.contract.entities.filter((entity) => entity.kind === 'team')
  const career = time.relative === 'career'
  const annualPeriod = !time.relative && (time.years.length > 1 || time.year_from !== null || time.year_to !== null)
  if ((!career && !annualPeriod) || (career && (time.years.length || time.year_from !== null || time.year_to !== null)) || time.date_from !== null || time.date_to !== null ||
    input.contract.entities.some((entity) => !['player', 'team'].includes(entity.kind) || entity.role === 'opponent') || teams.length > 1 ||
    ['farm', 'both'].includes(input.contract.competition_scope.level) || input.contract.competition_scope.competitions.length ||
    input.contract.predicates.length || input.contract.grouping.some((field) => !['year', 'player', 'team'].includes(field))) return unavailable
  const profiles = await service.searchPlayerInformation({ player_id: input.playerId, player_name: input.playerName, includeCareer: true })
  const matching = profiles.filter((profile) => profile.playerId === input.playerId)
  if (matching.length !== 1) return unavailable
  const records = (matching[0]!.careerStatistics ?? []).filter((row) => row.kind === input.domain && row.sourceUrl === `https://npb.jp/bis/players/${input.playerId}.html`)
  if (records.length !== 1) return unavailable
  const record = records[0]!
  const firstYear = time.year_from ?? (time.years.length ? Math.min(...time.years) : record.yearFrom)
  const lastYear = time.year_to ?? (time.years.length ? Math.max(...time.years) : record.yearTo)
  // A profile ending earlier than the requested period cannot certify that
  // later years had no appearances. Preserve the normal unavailable path.
  if (annualPeriod && (firstYear < record.yearFrom || lastYear > record.yearTo || firstYear > lastYear)) return unavailable
  if (annualPeriod || teams.length || input.contract.grouping.includes('year')) {
    const annual = (matching[0]!.annualStatistics ?? []).filter((row) => row.kind === input.domain)
    // Annual rows are exposed only after reconciliation with the official
    // career footer. An unknown club cannot be omitted from a club split.
    if (!annual.length || annual.some((row) => row.sourceUrl !== record.sourceUrl || row.fetchedAt !== record.fetchedAt ||
      !row.team || row.year < record.yearFrom || row.year > record.yearTo)) return unavailable
    const team = teams[0]?.mention
    const selected = annual.filter((row) => (!team || matchesGameTeamFilter(row.team!, resolveContractTeamMention(team))) &&
      (!annualPeriod || row.year >= firstYear && row.year <= lastYear && (!time.years.length || time.years.includes(row.year))))
    if (!selected.length) return unavailable
    const groups = new Map<string, typeof selected>()
    for (const row of selected) {
      const key = input.contract.grouping.includes('year') ? String(row.year) : 'career'
      groups.set(key, [...(groups.get(key) ?? []), row])
    }
    const rows: CareerEvidence['rows'] = []
    for (const group of groups.values()) {
      const values = group.map((row) => officialProfileMetricStats(input.domain, row.metrics))
      if (values.some((row) => !Number.isInteger(row.games) || row.games! < 0)) return unavailable
      const stats: Record<string, string | number | null> = { playerId: input.playerId, playerName: matching[0]!.name,
        yearFrom: Math.min(...group.map((row) => row.year)), yearTo: Math.max(...group.map((row) => row.year)),
        level: 'first', sourceUrl: record.sourceUrl, careerProof: 'official_profile_annual_reconciled',
        ...(team ? { team: resolveContractTeamMention(team) } : {}) }
      if (input.contract.grouping.includes('year')) stats.year = group[0]!.year
      if (group.length === 1) Object.assign(stats, values[0])
      else {
        for (const metric of allStatisticMetrics(input.domain)) {
          if (['era', 'whip', 'battingAverage', 'onBasePercentage', 'sluggingPercentage', 'ops', 'isoP', 'bbRate'].includes(metric.field) || values.some((row) => row[metric.field] === undefined)) continue
          stats[metric.field] = values.reduce((total, row) => total + row[metric.field]!, 0)
        }
        const innings = stats.inningsPitched
        if (typeof innings === 'number' && innings > 0) {
          if (typeof stats.earnedRuns === 'number') stats.era = stats.earnedRuns * 9 / innings
          if (typeof stats.hitsAllowed === 'number' && typeof stats.walks === 'number') stats.whip = (stats.hitsAllowed + stats.walks) / innings
        }
        if (typeof stats.hits === 'number' && typeof stats.atBats === 'number' && stats.atBats > 0) stats.battingAverage = stats.hits / stats.atBats
      }
      rows.push({ kind: input.domain, label: `${stats.year ? `${stats.year}年：` : ''}${matching[0]!.name}`, total: stats.games as number, stats })
    }
    if (input.contract.grouping.includes('year')) rows.sort((left, right) => Number(left.stats.year) - Number(right.stats.year))
    return { verified: true, rows, sourceUrls: [record.sourceUrl], basisText: record.basisText }
  }
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
