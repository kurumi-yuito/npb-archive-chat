import type { ChatResponseCore, QueryContract } from '@npb/schemas'
import { matchesGameTeamFilter } from '@npb/db'
import { QueryContractCompileError } from './chat-contract-compiler'
import { teamStatisticMetric } from './chat-statistic-metrics'
import { competitionLeague } from './chat-competition-scope'

/** Club records retain the official year, source and published decision counts. */
export function formatContractTeamStatistics(contract: QueryContract, rows: ChatResponseCore['results']['aggregates']): string {
  const identity = new Set(['team', 'teamName', 'team_name', 'year', 'season', 'sourceUrl', 'source_url'])
  const requested = contract.requested_output.flatMap((output) => output.fields).filter((field) => !identity.has(field))
  const metrics = [...new Map((requested.length ? requested : ['wins', 'losses', 'draws', 'winRate', 'rank']).map((field) => {
    const metric = teamStatisticMetric(field)
    if (!metric) throw new QueryContractCompileError([`unsupported_team_metric:${field}`])
    return [metric.field, metric] as const
  })).values()]
  if (!rows.length) return '指定された球団・年度の公式年度成績を確認できませんでした。収録済みの一部試合を年度全体の勝敗・順位としては回答しません。'
  const namedClubs = contract.entities.filter((entity) => entity.kind === 'team' && !competitionLeague(entity.mention))
  const label = (row: typeof rows[number]) => namedClubs.find((club) => matchesGameTeamFilter(row.label, club.mention))?.mention ?? row.label
  const time = contract.temporal_scope
  const seen = new Set<string>()
  const lines = rows.map((row) => {
    const year = row.stats.year, season = row.stats.seasonLabel
    if (row.kind !== 'games' || row.stats.subjectType !== 'team' || row.stats.evidenceStatus !== 'official_complete_team_history' ||
      typeof year !== 'number' || !Number.isInteger(year) || typeof season !== 'string' || Number(season.slice(0, 4)) !== year ||
      (time.years.length && !time.years.includes(year)) || (time.year_from !== null && year < time.year_from) || (time.year_to !== null && year > time.year_to)) throw new QueryContractCompileError(['team_statistic_scope_mismatch'])
    const key = `${row.label}:${season}`
    if (seen.has(key)) throw new QueryContractCompileError(['duplicate_team_season'])
    seen.add(key)
    const values = metrics.map((metric) => {
      const value = row.stats[metric.field]
      if (value === null || value === undefined) return `${metric.label}は未確認`
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (metric.precision === undefined && !Number.isInteger(value))) throw new QueryContractCompileError([`invalid_team_metric:${metric.field}`])
      const formatted = metric.precision === undefined ? String(value) : value.toFixed(metric.precision)
      return metric.field === 'rank' ? `${metric.label}${formatted}位` : metric.unit ? `${formatted}${metric.unit}` : `${metric.label}${formatted}`
    })
    return `${season}年 ${label(row)}：${values.join('、')}。`
  })
  const basis = [...new Set(rows.flatMap((row) => typeof row.stats.basisText === 'string' && row.stats.basisText ? [row.stats.basisText] : []))]
  let conclusion = ''
  if (rows.length > 1 && namedClubs.length > 1 && metrics.length === 1) {
    const metric = metrics[0]!, values = rows.map((row) => row.stats[metric.field])
    if (values.every((value) => typeof value === 'number')) {
      const maximum = Math.max(...values as number[]), minimum = Math.min(...values as number[])
      const preferred = metric.field === 'rank' ? minimum : maximum
      conclusion = maximum === minimum ? `${metric.label}は同じ値です。` : `${metric.label}が${metric.field === 'rank' ? '上位な' : '最も高い'}のは${rows.filter((row) => row.stats[metric.field] === preferred).map((row) => `${row.stats.seasonLabel}年の${label(row)}`).join('・')}です。`
    }
  }
  return ['球団の公式年度成績です。', ...lines, ...(conclusion ? [conclusion] : []), ...(basis.length ? [`出典の基準時点：${basis.join('／')}。`] : [])].join('\n')
}
