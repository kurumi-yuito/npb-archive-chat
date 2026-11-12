import { canonicalLeagueTeamNames, matchesGameTeamFilter, type ChatQueryService } from '@npb/db'
import type { ChatResponseCore, ChatStructuredQuery } from '@npb/schemas'

/** Each bounded club result must certify its own complete official season.
 * This avoids treating a truncated league prefix as the eligible population. */
export async function completeOfficialStatisticPopulation(service: Pick<ChatQueryService, 'aggregateBattingLines' | 'aggregatePitchingLines'>,
  query: ChatStructuredQuery): Promise<ChatResponseCore['results']['aggregates']> {
  if (!['aggregate_batting', 'aggregate_pitching'].includes(query.intent)) throw new Error('invalid_statistic_population_domain')
  const filters = query.filters as Record<string, unknown>
  if (typeof filters.year !== 'number' || filters.date_from || filters.date_to || filters.game_date || filters.starter !== undefined ||
    (filters.group_by !== undefined && filters.group_by !== 'player')) throw new Error('statistic_population_scope_unverified')
  const clubs = canonicalLeagueTeamNames(typeof filters.team === 'string' ? filters.team : undefined)
  if (!clubs.length) throw new Error('statistic_population_clubs_unverified')
  const domain = query.intent === 'aggregate_batting' ? 'batting' : 'pitching'
  const counts = domain === 'batting'
    ? ['games', 'plateAppearances', 'atBats', 'runs', 'hits', 'doubles', 'triples', 'homeRuns', 'totalBases', 'runsBattedIn', 'stolenBases', 'walks', 'hitBatters', 'sacrificeFlies', 'strikeouts']
    : ['games', 'wins', 'losses', 'saves', 'strikeouts', 'hitsAllowed', 'homeRunsAllowed', 'walks', 'hitBatters', 'earnedRuns', 'runsAllowed', 'shutouts', 'battersFaced']
  type Group = { name: string; stats: Record<string, number | null>; outs: number; teams: Set<string>; urls: Set<string> }
  const groups = new Map<string, Group>()
  for (const club of clubs) {
    const rows = query.intent === 'aggregate_batting'
      ? await service.aggregateBattingLines({ ...query.filters, team: club, limit: 100 } as Parameters<ChatQueryService['aggregateBattingLines']>[0])
      : await service.aggregatePitchingLines({ ...query.filters, team: club, limit: 100 } as Parameters<ChatQueryService['aggregatePitchingLines']>[0])
    if (!rows.length || rows.length >= 100) throw new Error('statistic_club_population_incomplete')
    const seen = new Set<string>()
    for (const row of rows) {
      const id = row.stats.playerId
      if (row.kind !== domain || typeof id !== 'string' || seen.has(id) || row.stats.year !== filters.year ||
        row.stats.level !== (filters.level ?? 'first') || row.stats.evidenceStatus !== 'official_complete_scope' ||
        typeof row.stats.team !== 'string' || !matchesGameTeamFilter(row.stats.team, club)) throw new Error('statistic_club_population_unverified')
      seen.add(id)
      const urls: unknown = JSON.parse(String(row.stats.sourceUrls ?? 'null'))
      if (!Array.isArray(urls) || !urls.length || urls.some((url) => typeof url !== 'string' || !/^https:\/\/npb\.jp\/bis\//u.test(url))) throw new Error('statistic_population_sources_unverified')
      const group: Group = groups.get(id) ?? { name: row.label, stats: {}, outs: 0, teams: new Set<string>(), urls: new Set<string>() }
      const first = !groups.has(id)
      for (const field of counts) {
        const value = row.stats[field]
        if (value !== null && value !== undefined && (typeof value !== 'number' || !Number.isInteger(value) || value < 0)) throw new Error('statistic_population_count_invalid')
        group.stats[field] = typeof value !== 'number' || (!first && group.stats[field] === null) ? null : (group.stats[field] ?? 0) + value
      }
      if (domain === 'pitching') {
        const innings = row.stats.inningsPitched
        if (typeof innings !== 'number' || innings < 0 || Math.abs(innings * 3 - Math.round(innings * 3)) > 0.000001) throw new Error('statistic_population_innings_invalid')
        group.outs += Math.round(innings * 3)
      }
      group.teams.add(club)
      for (const url of urls) group.urls.add(String(url))
      groups.set(id, group)
    }
  }
  const rows: ChatResponseCore['results']['aggregates'] = [...groups].map(([id, group]) => {
    const divide = (a: number | null | undefined, b: number | null | undefined) => typeof a === 'number' && typeof b === 'number' && b > 0 ? a / b : null
    const sum = (...fields: string[]) => fields.every((field) => typeof group.stats[field] === 'number') ? fields.reduce((value, field) => value + group.stats[field]!, 0) : null
    const stats = group.stats
    if (typeof stats.games !== 'number') throw new Error('statistic_population_games_unverified')
    if (domain === 'pitching') {
      stats.inningsPitched = group.outs / 3
      stats.era = typeof stats.earnedRuns === 'number' ? divide(stats.earnedRuns * 27, group.outs) : null
      stats.whip = divide(sum('hitsAllowed', 'walks'), stats.inningsPitched)
    } else {
      stats.battingAverage = divide(stats.hits, stats.atBats)
      stats.onBasePercentage = divide(sum('hits', 'walks', 'hitBatters'), sum('atBats', 'walks', 'hitBatters', 'sacrificeFlies'))
      stats.sluggingPercentage = divide(stats.totalBases, stats.atBats)
      stats.ops = sum('onBasePercentage', 'sluggingPercentage')
      stats.isoP = typeof stats.sluggingPercentage === 'number' && typeof stats.battingAverage === 'number' ? stats.sluggingPercentage - stats.battingAverage : null
      stats.bbRate = divide(stats.walks, stats.plateAppearances)
    }
    return { kind: domain, label: group.name, total: stats.games, stats: { ...stats, playerId: id, team: [...group.teams].join('・'),
      year: filters.year as number, level: String(filters.level ?? 'first'), evidenceStatus: 'official_complete_scope', sourceUrls: JSON.stringify([...group.urls]) } }
  })
  const field = typeof filters.sort_by === 'string' ? filters.sort_by : domain === 'batting' ? 'hits' : 'inningsPitched'
  const direction = ['era', 'whip'].includes(field) ? 1 : -1
  return rows.sort((left, right) => {
    const a = left.stats[field], b = right.stats[field]
    if (typeof a !== 'number') return typeof b === 'number' ? 1 : left.label.localeCompare(right.label, 'ja')
    if (typeof b !== 'number') return -1
    return direction * (a - b) || left.label.localeCompare(right.label, 'ja')
  })
}
