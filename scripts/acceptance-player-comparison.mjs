/** Check the same official season and identities across the three-turn comparison. */
export function playerComparisonIssues(id, body, oracle) {
  if (!id.startsWith('MT05-')) return []
  if (oracle?.environment !== 'independent_python_html_audit' || oracle.rows?.length !== 2) return ['independent_player_oracle_missing']
  const expected = id === 'MT05-Turn1' ? oracle.rows.slice(0, 1) : id === 'MT05-Turn2' ? oracle.rows.slice(1) : oracle.rows
  const rows = body?.results?.aggregates ?? []
  const issues = []
  if (rows.length !== expected.length) issues.push('comparison_operand_count_mismatch')
  for (const source of expected) {
    const matches = rows.filter((row) => row.kind === 'batting' && row.stats?.playerId === source.playerId && row.stats?.year === source.year)
    const value = matches[0]?.stats?.battingAverage
    if (matches.length !== 1 || typeof value !== 'number' || value.toFixed(3) !== Number(source.metrics['打率']).toFixed(3)) issues.push('comparison_identity_year_or_value_mismatch')
    let urls = body?.answer?.source_urls ?? []
    try { if (matches[0]?.stats?.sourceUrls) urls = JSON.parse(matches[0].stats.sourceUrls) }
    catch { urls = [] }
    if (!Array.isArray(urls)) urls = []
    const club = source.playerId === '11515130' ? 'g' : 't'
    if (!urls.includes(source.sourceUrl) && !urls.includes(`https://npb.jp/bis/${source.year}/stats/idb1_${club}.html`)) issues.push('comparison_source_missing')
  }
  if (id === 'MT05-Turn3' && !/(?:岡本[^。\n]*(?:高い|最も高い)|最も高い[^。\n]*岡本)/u.test(body?.answer?.summary ?? '')) issues.push('comparison_conclusion_missing')
  return [...new Set(issues)]
}

export function otherPlayersIssues(id, body, oracle) {
  if (id !== 'MT02-Turn3') return []
  if (oracle?.environment !== 'independent_python_html_audit' || !oracle.expected?.length) return ['independent_other_player_oracle_missing']
  const normalize = (value) => String(value).normalize('NFKC').replace(/\s+/gu, '').replace(/^[*+]/u, '')
  const rows = body?.results?.aggregates ?? []
  const expected = new Map(oracle.expected.map((row) => [row.name, row.homeRuns]))
  const issues = []
  if (rows.length !== expected.size || new Set(rows.map((row) => row.stats?.playerId)).size !== rows.length) issues.push('other_player_completeness_mismatch')
  for (const row of rows) {
    const name = normalize(row.label)
    if (!expected.has(name) || row.stats?.year !== oracle.scope.year || row.stats?.homeRuns !== expected.get(name) ||
      !(row.stats?.homeRuns > 0) || typeof row.stats?.playerId !== 'string') issues.push('other_player_scope_or_value_mismatch')
    let sources = []
    try { sources = JSON.parse(row.stats?.sourceUrls ?? '[]') } catch { /* Report invalid evidence below. */ }
    if (!Array.isArray(sources) || !sources.includes(oracle.source.source_url)) issues.push('other_player_source_missing')
  }
  return [...new Set(issues)]
}
