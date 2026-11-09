import type { ChatResponseCore, ChatStructuredQuery, QueryContract } from '@npb/schemas'
import { statisticDomain, statisticMetric } from './chat-statistic-metrics'
import { QueryContractCompileError } from './chat-contract-compiler'
import { matchesGameTeamFilter } from '@npb/db'
import { resolveContractTeamMention } from './chat-team-resolution'

/** Compare the same numeric measure and source scope; identify clubs using the preserved mentions. */
export function formatTeamStatisticComparison(contract: QueryContract, rows: ChatResponseCore['results']['aggregates'], summaries: string[]): string | null {
  const teams = contract.entities.filter((entity) => entity.kind === 'team' && entity.role === 'subject')
  const output = contract.requested_output[0]
  if (teams.length < 2 || contract.requested_output.length !== 1 || output?.kind !== 'batting_statistics' || output.fields.length !== 1 || rows.length !== teams.length) return null
  const metric = statisticMetric('batting', output.fields[0]!)
  if (!metric || rows.some((row) => row.stats.subjectType !== 'team') ||
    new Set(rows.map((row) => row.stats.year)).size !== 1 || new Set(rows.map((row) => row.stats.level)).size !== 1) return null
  const values = teams.map((team) => {
    const matching = rows.filter((row) => typeof row.stats.team === 'string' && matchesGameTeamFilter(row.stats.team, resolveContractTeamMention(team.mention)))
    return { name: team.mention, value: matching.length === 1 ? matching[0]!.stats[metric.field] : null }
  })
  if (values.some(({ value }) => typeof value !== 'number' || !Number.isFinite(value))) return null
  const maximum = Math.max(...values.map(({ value }) => value as number)), minimum = Math.min(...values.map(({ value }) => value as number))
  const label = metric.field === 'battingAverage' ? 'チーム打率' : metric.label
  const leaders = values.filter(({ value }) => value === maximum).map(({ name }) => name).join('・')
  const formatted = metric.precision === undefined ? String(maximum) : maximum.toFixed(metric.precision)
  const conclusion = maximum === minimum ? `${label}は同じ値です。` : `${label}が最も高いのは${leaders}（${formatted}${metric.unit ?? ''}）です。`
  return `${label}の比較：${teams.map((team) => team.mention).join('・')}。\n${summaries.join('\n\n')}\n${conclusion}`
}

/** Render only the metrics requested by the contract, using returned numeric facts. */
export function formatContractStatistics(input: {
  contract: QueryContract; query: ChatStructuredQuery; rows: ChatResponseCore['results']['aggregates']; playerName?: string; careerVerified?: boolean; asOf?: string | null
}): string | null {
  const domain = statisticDomain(input.query.intent)
  if (!domain) return null
  const fields = [...input.contract.requested_output.flatMap((output) => output.fields),
    ...input.contract.aggregation.map((aggregation) => aggregation.field)]
  const identityFields = new Set(['name', 'player', 'player_name', 'playerName', 'player_id', 'playerId', 'team', 'team_name', 'teamName', 'year', 'source_url', 'sourceUrl'])
  const requested = fields.filter((field) => !identityFields.has(field))
  const defaults = domain === 'batting' ? ['games', 'battingAverage', 'homeRuns', 'runsBattedIn'] : ['games', 'wins', 'losses', 'era']
  const metrics = [...new Map((requested.length ? requested : defaults).map((field) => {
    const metric = statisticMetric(domain, field)
    if (!metric) throw new QueryContractCompileError([`unsupported_answer_metric:${domain}:${field}`])
    return [metric.field, metric] as const
  })).values()]
  if (input.rows.some((row) => row.kind !== domain)) throw new QueryContractCompileError(['statistic_result_domain_mismatch'])
  if (input.contract.temporal_scope.relative === 'career' && !input.careerVerified) {
    const name = input.playerName?.replace(/\s+/gu, '') ?? '指定された選手'
    return `${name}のNPB通算${metrics.map((metric) => metric.label).join('・')}は、全在籍年度の網羅性を確認できないため算出できません。未確認年度を対象外とした部分集計を通算記録としては扱いません。`
  }
  if (!input.rows.length) return `指定された対象・期間に一致する${domain === 'batting' ? '打撃' : '投手'}成績は確認できませんでした。`
  const time = input.contract.temporal_scope
  const period = time.relative === 'career' ? `NPB通算${input.asOf ? `（${input.asOf}）` : ''}`
    : time.date_from !== null || time.date_to !== null ? `${time.date_from ?? ''}〜${time.date_to ?? ''}`
    : time.years.length ? `${time.years.join('・')}年度`
    : time.year_from !== null || time.year_to !== null ? `${time.year_from ?? ''}〜${time.year_to ?? ''}年度`
      : 'year' in input.query.filters && input.query.filters.year ? `${input.query.filters.year}年度` : '指定された期間'
  const lines = input.rows.map((row, index) => {
    const values = metrics.map((metric) => {
      const label = row.stats.subjectType === 'team' && metric.field === 'battingAverage' ? 'チーム打率' : metric.label
      let value = row.stats[metric.field]
      if (value === undefined && metric.field === 'era' && typeof row.stats.earnedRuns === 'number' && typeof row.stats.inningsPitched === 'number' && row.stats.inningsPitched > 0) value = row.stats.earnedRuns / row.stats.inningsPitched * 9
      if (value === undefined && metric.field === 'whip' && typeof row.stats.hitsAllowed === 'number' && typeof row.stats.walks === 'number' && typeof row.stats.inningsPitched === 'number' && row.stats.inningsPitched > 0) value = (row.stats.hitsAllowed + row.stats.walks) / row.stats.inningsPitched
      if (value === null || value === undefined) return `${label}は算出できません`
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new QueryContractCompileError([`invalid_answer_metric:${metric.field}`])
      if (metric.field === 'inningsPitched') {
        const outs = Math.round(value * 3)
        if (Math.abs(value * 3 - outs) > 0.000001) throw new QueryContractCompileError(['invalid_answer_innings'])
        return `${metric.label}${Math.floor(outs / 3)}回${outs % 3 ? ` ${outs % 3}/3` : ''}`
      }
      const formatted = metric.precision !== undefined ? value.toFixed(metric.precision) : String(value)
      if (metric.unitStyle === 'suffix') return `${label}${formatted}${metric.unit ?? ''}`
      return metric.unit ? `${label}は${formatted}${metric.unit}です` : `${label}${formatted}`
    })
    const name = input.rows.length === 1 && input.playerName ? input.playerName.replace(/\s+/gu, '') : row.label
    const team = row.stats.subjectType !== 'team' && typeof row.stats.team === 'string' ? `（${row.stats.team}）` : ''
    const rank = input.contract.ordering.length ? `${index + 1}位: ` : ''
    return `${rank}${name}${team}：${values.join('、')}。${time.relative === 'career' ? 'NPB以外のリーグでの成績は対象外です。' : ''}`
  })
  return `${period}の${domain === 'batting' ? '打撃' : '投手'}成績です。\n${lines.join('\n')}`
}
