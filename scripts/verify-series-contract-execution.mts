import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { queryContractSchema } from '../packages/schemas/src/index'
import { openDatabase } from '../packages/db/src/sqlite'
import { sqliteDatabaseToQuery } from '../packages/db/src/query-driver'
import { createSingleDatabaseQueryService } from '../packages/db/src/multi-year-query-service'
import { createContractChatService } from '../apps/web/server/services/chat-contract-service'

const options = new Map(process.argv.slice(2).map((argument) => {
  const equal = argument.indexOf('=')
  if (!argument.startsWith('--') || equal < 0) throw new Error('Use --database=path --output=path')
  return [argument.slice(2, equal), argument.slice(equal + 1)]
}))
const required = (key: string) => { const value = options.get(key); if (!value) throw new Error(`Missing --${key}`); return path.resolve(value) }
const databaseFile = required('database'), output = required('output')
const oracle = JSON.parse(await readFile(new URL('../docs/eval-source-oracles/series-history-1950-2026.json', import.meta.url), 'utf8'))
const database = openDatabase(databaseFile)
try {
  database.exec('PRAGMA query_only=ON')
  const cases = []
  for (const [id, first, last] of [['Q203', 2025, 2025], ['Q204', 1950, 2026]] as const) {
    const contract = queryContractSchema.parse({ version: 1, requested_output: [{ kind: 'series_result', fields: ['year', 'winner', 'loser', 'wins', 'losses', 'draws'] }],
      entities: [], predicates: [], aggregation: [], grouping: ['year'], ordering: [{ field: 'year', direction: 'asc' }],
      temporal_scope: { years: first === last ? [first] : [], year_from: first === last ? null : first, year_to: first === last ? null : last, date_from: null, date_to: null, relative: null },
      competition_scope: { level: 'first', competitions: ['日本シリーズ'] }, completeness: { mode: 'all', limit: null }, context_references: [], unresolved_constraints: [] })
    const service = createContractChatService(createSingleDatabaseQueryService(sqliteDatabaseToQuery(database)), async () => ({
      domain: 'npb', policy: 'execute', query_contract: contract, clarification_reason: null, subject: null,
    }))
    const response = await service.answerQuestion('独立した意味契約の実行検証（自然言語のモデル解析は実施しない）')
    const expected = oracle.seasons.filter((row: { year: number }) => row.year >= first && row.year <= last)
    const rows = response.results.aggregates
    if (rows.length !== expected.length || response.answer.result_count !== expected.length) throw new Error(`${id}: incomplete series answer`)
    for (const [index, row] of rows.entries()) {
      const source = expected[index]
      if (row.stats.year !== source.year || row.stats.winnerName !== source.winner || row.stats.loserName !== source.loser ||
        row.stats.winnerWins !== source.winCounts[0] || row.stats.loserWins !== source.winCounts[1] || row.stats.draws !== source.draws ||
        row.total !== source.scores.length || !response.answer.source_urls.includes(source.sourceUrl) ||
        !response.answer.summary.includes(`${source.year}年：${source.winner}が優勝`)) throw new Error(`${id}: result/answer/source differs from independent raw oracle`)
    }
    cases.push({ id, executionVerdict: 'pass', naturalLanguageParsing: 'not_executed', entityResolution: 'not_applicable', contract, response })
  }
  const report = { environment: 'local_native_read_only', production: false, modelCalls: 0, releaseReady: false, database: databaseFile,
    note: 'Independent fixed meaning contracts verify planning, retrieval, completeness, deterministic answers and sources; they do not validate natural-language understanding or production.', cases }
  await writeFile(output, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ output, cases: cases.map((row) => ({ id: row.id, executionVerdict: row.executionVerdict, rows: row.response.answer.result_count })), modelCalls: 0, releaseReady: false }))
} finally { database.close() }
