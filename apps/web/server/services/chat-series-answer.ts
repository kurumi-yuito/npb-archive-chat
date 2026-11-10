import type { QueryContract, ChatResponseCore } from '@npb/schemas'
import { identityFiltersForContract, QueryContractCompileError } from './chat-contract-compiler'

/** Deterministic projection of verified overall outcomes; no generated winner claims. */
export function formatContractSeriesResults(contract: QueryContract, rows: ChatResponseCore['results']['aggregates']): string {
  const scope = identityFiltersForContract(contract), years = new Set<number>()
  const from = scope.year ?? scope.year_from, to = scope.year ?? scope.year_to
  if (from === undefined || to === undefined || contract.competition_scope.competitions.length !== 1) throw new QueryContractCompileError(['series_answer_scope_missing'])
  const competition = contract.competition_scope.competitions[0]!
  if (!rows.length) return `${from === to ? `${from}年` : `${from}〜${to}年`}の${competition}について、指定条件に対応する公式のシリーズ結果を確認できませんでした。`
  const lines = rows.map((row) => {
    const stats = row.stats, year = stats.year
    const counts = [stats.winnerWins, stats.loserWins, stats.draws]
    if (row.kind !== 'games' || stats.evidenceStatus !== 'official_complete_series_history' ||
      typeof year !== 'number' || year < from || year > to || years.has(year) || stats.competition !== competition || stats.level !== 'first' ||
      typeof stats.winnerName !== 'string' || !stats.winnerName || typeof stats.loserName !== 'string' || !stats.loserName ||
      !counts.every((value) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) ||
      Number(stats.winnerWins) <= Number(stats.loserWins) || row.total !== counts.reduce<number>((sum, value) => sum + Number(value), 0) ||
      typeof stats.sourceUrls !== 'string') throw new QueryContractCompileError(['invalid_series_answer_evidence'])
    const urls: unknown = JSON.parse(stats.sourceUrls)
    if (!Array.isArray(urls) || urls.length !== 1 || urls[0] !== `https://npb.jp/bis/scores/nipponseries/yearlyresults${Math.floor(year / 10) * 10}.html`) throw new QueryContractCompileError(['invalid_series_answer_source'])
    years.add(year)
    return `${year}年：${stats.winnerName}が優勝。${stats.loserName}との対戦は${stats.winnerWins}勝${stats.loserWins}敗${stats.draws ? `${stats.draws}分` : ''}。`
  })
  if (contract.completeness.mode === 'all' && rows.length !== to - from + 1) throw new QueryContractCompileError(['incomplete_series_answer'])
  return `${competition}の公式シリーズ結果です。\n${lines.join('\n')}`
}
