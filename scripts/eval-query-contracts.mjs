import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { isDeepStrictEqual } from 'node:util'
import path from 'node:path'

const baseUrl = process.env.NPB_EVAL_BASE_URL ?? 'http://127.0.0.1:3000'
const split = process.argv.find((arg) => arg.startsWith('--split='))?.slice(8) ?? 'regression'
const corpus = JSON.parse(await readFile(new URL('../docs/eval-query-contracts.json', import.meta.url), 'utf8'))
const cases = corpus.cases.filter((entry) => entry.split === split)
const output = process.env.NPB_EVAL_OUTPUT ?? `data/logs/query-contract-eval-${Date.now()}.json`
const report = { baseUrl, split, startedAt: new Date().toISOString(), corpusReleaseGate: corpus.release_gate, cases: [] }

for (const entry of cases) {
  const result = { id: entry.id, question: entry.question, status: 'blocked', stages: {} }
  const stage = (name, pass, detail) => { result.stages[name] = { status: pass ? 'pass' : 'fail', ...(detail ? { detail } : {}) } }
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/u, '')}/api/chat`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'npb-independent-contract-eval/1' },
      body: JSON.stringify({ message: entry.question }), signal: AbortSignal.timeout(60_000),
    })
    result.httpStatus = response.status
    result.response = await response.json()
    if (!response.ok) {
      result.reason = `HTTP ${response.status}; no stages counted as passing`
    } else {
      const body = result.response
      const answer = body.answer ?? {}
      const contract = answer.execution_metadata?.query_contract ?? body.structured_query?.query_contract
      stage('meaning', isDeepStrictEqual(canonicalMeaning(contract), canonicalMeaning(entry.meaning)))
      const resolution = answer.resolved_player
      stage('entity_resolution', resolution?.status === 'resolved' && resolution.player_id === entry.resolution.player_id &&
        !resolution.candidates?.some((candidate) => entry.resolution.exclude_player_ids.includes(candidate.player_id)))
      const metadata = answer.execution_metadata
      stage('query_plan', metadata?.data_requirements?.includes('events') && metadata?.repositories?.includes('searchEvents'))
      const events = body.results?.events ?? []
      const year = entry.meaning.temporal_scope.years[0]
      const team = entry.meaning.entities.find((entity) => entity.kind === 'team')?.mention
      const expectedUrl = `https://npb.jp/bis/players/${entry.resolution.player_id}.html`
      stage('retrieval_constraints', events.length > 0 && events.every((event) => {
        let attributes
        try { attributes = JSON.parse(event.eventAttributesJson ?? '{}') } catch { return false }
        return Number(event.gameDate?.slice(0, 4)) === year && event.offenseTeam === team &&
          event.eventType === 'plate_appearance' &&
          /ホームラン|本塁打/u.test(event.resultText ?? '') &&
          (event.batterUrl === expectedUrl || attributes?.batter_url === expectedUrl || attributes?.batter_links?.some((link) => link.url === expectedUrl))
      }))
      stage('completeness', events.length === entry.official_result.regular_season_home_runs &&
        new Set(events.map((event) => `${event.gameId}:${event.sequence}`)).size === events.length &&
        answer.evidence_validation?.official_total_status === 'verified')
      // A list has no requested reduction. Keep this visible, rather than inventing an aggregation Pass.
      result.stages.aggregation = { status: 'not_applicable', reason: 'No reduction requested by this case' }
      stage('answer', typeof answer.summary === 'string' && /ホームラン|本塁打/u.test(answer.summary) &&
        answer.result_count === entry.official_result.regular_season_home_runs &&
        events.length > 0 && events.every((event) => event.gameDate && event.gameId && event.opponentTeam))
      stage('sources', events.length > 0 && events.every((event) => {
        try {
          const url = new URL(event.sourceUrl)
          return url.protocol === 'https:' && url.hostname === 'npb.jp' && url.pathname.startsWith('/scores/') && answer.source_urls?.includes(event.sourceUrl)
        } catch { return false }
      }) && entry.official_result.sources.some((url) => answer.source_urls?.includes(url)))
      result.status = Object.values(result.stages).every((stage) => ['pass', 'not_applicable'].includes(stage.status)) ? 'pass' : 'fail'
    }
  } catch (error) {
    result.reason = String(error)
  }
  report.cases.push(result)
  console.log(`${entry.id}: ${result.status}`)
}
report.finishedAt = new Date().toISOString()
report.counts = Object.fromEntries(['pass', 'fail', 'blocked'].map((status) => [status, report.cases.filter((entry) => entry.status === status).length]))
report.emptySplit = cases.length === 0
report.releaseReady = false // This corpus alone cannot replace the 184 QA cases and 47 acceptance turns.
await mkdir(path.dirname(path.resolve(output)), { recursive: true })
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify({ ...report.counts, emptySplit: report.emptySplit, output }))
if (cases.length === 0 || report.counts.fail > 0 || report.counts.blocked > 0) process.exitCode = 1

function canonicalMeaning(value) {
  if (!value) return null
  const copy = structuredClone(value)
  const sorted = (values) => [...values].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  copy.entities = sorted(copy.entities)
  copy.predicates = sorted(copy.predicates)
  copy.requested_output = sorted(copy.requested_output.map((item) => ({ ...item, fields: sorted(item.fields) })))
  copy.temporal_scope.years = sorted(copy.temporal_scope.years)
  return copy
}
