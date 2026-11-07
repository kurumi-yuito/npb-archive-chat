/** @typedef {{ environment: string, scope: { year: number, month: number }, leaderboard?: Array<{ homeRuns: number }>, headToHead?: { subjectTeam: string, opponentTeam: string, wins: number, losses: number, draws: number } }} CalendarOracle */

/** Required scope and independent numeric checks for the owner-confirmed default.
 * @param {CalendarOracle | null} oracle
 */
export function calendarAcceptanceIssues(id, body, year = Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Tokyo', year: 'numeric' }).format(new Date())), oracle = null) {
  if (!['B22', 'B29'].includes(id)) return []
  const month = id === 'B22' ? '05' : '08'
  const from = `${year}-${month}-01`, to = `${year}-${month}-31`
  const filters = body?.structured_query?.filters ?? {}
  const issues = []
  const hasOracle = oracle?.environment === 'independent_python_html_audit' && oracle.scope?.year === year && oracle.scope?.month === Number(month)
  if (!hasOracle) issues.push('independent_numeric_oracle_missing')
  if (filters.date_from !== from || filters.date_to !== to || filters.game_date ||
    [filters.year, filters.year_from, filters.year_to].some((value) => value != null && value !== year)) issues.push('calendar_scope_mismatch')
  const summary = body?.answer?.summary ?? ''
  if (!summary.includes(String(year)) || !(summary.includes(`${Number(month)}月`) || summary.includes(`${year}-${month}`))) issues.push('calendar_scope_not_disclosed')
  if (!body?.answer?.source_urls?.some((url) => /^https:\/\/npb\.jp\//u.test(url))) issues.push('official_source_missing')
  if (id === 'B22') {
    if (body?.structured_query?.intent !== 'aggregate_batting' || filters.sort_by !== 'homeRuns' || filters.limit !== 1) issues.push('home_run_leader_plan_missing')
    const rows = body?.results?.aggregates ?? []
    if (!rows.length || rows.some((row) => row.kind !== 'batting' || !row.label || !Number.isInteger(row.stats?.homeRuns) || row.stats.homeRuns < 0)) issues.push('home_run_leader_evidence_missing')
    if (hasOracle) {
      const expected = oracle.leaderboard?.[0]?.homeRuns
      if (!Number.isInteger(expected) || !rows.length || rows.some((row) => row.stats?.homeRuns !== expected) || !summary.includes(`本塁打${expected}本`)) issues.push('independent_home_run_total_mismatch')
    }
  } else {
    if (body?.structured_query?.intent !== 'aggregate_games' || filters.team !== 'オリックス' || filters.opponent !== 'ロッテ') issues.push('head_to_head_plan_missing')
    const rows = body?.results?.aggregates ?? []
    if (rows.length !== 1 || rows.some((row) => row.kind !== 'games' || ['wins', 'losses', 'draws'].some((field) => !Number.isInteger(row.stats?.[field]) || row.stats[field] < 0))) issues.push('head_to_head_evidence_missing')
    if (hasOracle) {
      const expected = oracle.headToHead
      if (expected?.subjectTeam !== 'b' || expected?.opponentTeam !== 'm' || rows.length !== 1 ||
        ['wins', 'losses', 'draws'].some((field) => !Number.isInteger(expected[field]) || rows[0]?.stats?.[field] !== expected[field]) ||
        !summary.includes(`${expected.wins}勝${expected.losses}敗`)) issues.push('independent_head_to_head_total_mismatch')
    }
  }
  return issues
}
