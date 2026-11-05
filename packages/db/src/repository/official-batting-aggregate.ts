import type { AggregateBattingFilters } from '@npb/schemas'
import type { QueryDatabase } from '../query-driver'
import type { AggregateRow } from './aggregate-repository'
import { readOfficialStatisticSeason } from './official-statistic-scope'

const counts = { games: '試合', plateAppearances: '打席', atBats: '打数', runs: '得点', hits: '安打', doubles: '二塁打', triples: '三塁打', homeRuns: '本塁打', totalBases: '塁打', runsBattedIn: '打点', stolenBases: '盗塁', walks: '四球', hitBatters: '死球', sacrificeFlies: '犠飛', strikeouts: '三振' } as const

/** Use a whole verified team/league season, never a partially collected ranking. */
export async function aggregateOfficialBattingSeason(database: QueryDatabase, filters: AggregateBattingFilters): Promise<AggregateRow[] | null> {
  const year = filters.year ?? (filters.year_from === filters.year_to ? filters.year_from : undefined)
  // Independent farm clubs also participate; twelve parent-club pages alone
  // cannot certify an unspecified all-farm ranking.
  if (filters.level === 'farm' && !filters.team) return null
  if (!year || filters.game_date || filters.date_from || filters.date_to || filters.game_id || filters.batting_order || filters.position || filters.result_text_contains || filters.recent || filters.group_by === 'year') return null
  if ((filters.player_name || filters.player_names?.length) && !filters.player_id && !filters.player_ids?.length) return null
  if (!filters.player_id && !filters.player_ids?.length && ['battingAverage', 'ops'].includes(filters.sort_by ?? '')) return null
  const evidence = await readOfficialStatisticSeason(database, filters, 'batting')
  if (!evidence) return null
  const { byId, rows } = evidence
  const playerIds = new Set([...(filters.player_ids ?? []), ...(filters.player_id ? [filters.player_id] : [])])
  type Group = { name: string; playerId: string | null; teams: Set<string>; urls: Set<string>; stats: Record<string, number | null> }
  const groups = new Map<string, Group>()
  for (const row of rows) {
    if (playerIds.size && (!row.player_id || !playerIds.has(row.player_id))) continue
    const source = byId.get(row.snapshot_id)!
    const key = row.player_id ?? `${row.snapshot_id}:${row.row_index}`
    let group = groups.get(key)
    if (!group) { group = { name: row.player_name, playerId: row.player_id, teams: new Set(), urls: new Set(), stats: {} }; groups.set(key, group) }
    group.teams.add(source.team_name)
    group.urls.add(source.source_url)
    const metrics: unknown = JSON.parse(row.metrics_json)
    if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) throw new Error('Invalid official batting metrics')
    for (const [field, label] of Object.entries(counts)) {
      const raw = (metrics as Record<string, unknown>)[label]
      const value = typeof raw === 'string' && /^\d+$/u.test(raw) ? Number(raw) : null
      if (value === null && ['games', 'atBats', 'hits', 'homeRuns'].includes(field)) throw new Error(`Missing official batting count: ${label}`)
      group.stats[field] = value === null || group.stats[field] === null ? null : (group.stats[field] ?? 0) + value
    }
  }
  const result: AggregateRow[] = [...groups.values()].map((group) => {
    const stats: AggregateRow['stats'] = { ...group.stats, team: [...group.teams].join('・'), playerId: group.playerId, playerName: group.name,
      sourceUrls: JSON.stringify([...group.urls]), evidenceStatus: rows.every((row) => row.player_id !== null) ? 'official_complete_scope' : 'official_identity_incomplete', year, level: filters.level ?? 'first' }
    const divide = (numerator: number | null | undefined, denominator: number | null | undefined) => numerator !== null && numerator !== undefined && denominator && denominator > 0 ? numerator / denominator : null
    stats.battingAverage = divide(group.stats.hits, group.stats.atBats)
    stats.sluggingPercentage = divide(group.stats.totalBases, group.stats.atBats)
    const present = (fields: string[]) => fields.every((field) => typeof group.stats[field] === 'number')
    stats.onBasePercentage = present(['hits', 'walks', 'hitBatters', 'atBats', 'sacrificeFlies'])
      ? divide(group.stats.hits! + group.stats.walks! + group.stats.hitBatters!, group.stats.atBats! + group.stats.walks! + group.stats.hitBatters! + group.stats.sacrificeFlies!) : null
    stats.ops = typeof stats.onBasePercentage === 'number' && typeof stats.sluggingPercentage === 'number' ? stats.onBasePercentage + stats.sluggingPercentage : null
    stats.isoP = typeof stats.sluggingPercentage === 'number' && typeof stats.battingAverage === 'number' ? stats.sluggingPercentage - stats.battingAverage : null
    stats.bbRate = divide(group.stats.walks, group.stats.plateAppearances)
    return { kind: 'batting', label: group.name, total: group.stats.games!, stats }
  })
  const field = filters.sort_by ?? 'hits'
  result.sort((a, b) => Number(b.stats[field] ?? -Infinity) - Number(a.stats[field] ?? -Infinity) || a.label.localeCompare(b.label, 'ja'))
  return result.slice(0, filters.limit ?? 10)
}
