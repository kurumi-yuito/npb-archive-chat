import { readFile, writeFile } from 'node:fs/promises'

const [baselinePath, outputPath, ...rerunPaths] = process.argv.slice(2)
if (!baselinePath || !outputPath) throw new Error('Usage: node scripts/audit-acceptance-d1-reads.mjs baseline.json output.json [rerun.json ...]')
const baseline = JSON.parse(await readFile(baselinePath, 'utf8'))
const results = new Map()
const duplicateIds = []
for (const source of [baselinePath, ...rerunPaths]) {
  const log = JSON.parse(await readFile(source, 'utf8'))
  const seen = new Set()
  for (const result of log.results) {
    if (seen.has(result.id)) duplicateIds.push({ source, id: result.id })
    seen.add(result.id)
    results.set(result.id, { ...result, source })
  }
}
const cases = baseline.results.map(({ id }) => {
  const result = results.get(id)
  const audit = result.d1ReadAudit
  return {
    id, source: result.source, verdict: result.verdict,
    meta: audit?.rowsRead.meta ?? null,
    repository: audit?.rowsRead.repository ?? null,
    other: audit?.rowsRead.other ?? null,
    total: audit?.total ?? null,
    unknownStatements: audit?.unknown ?? null,
  }
})
const summary = Object.fromEntries(['meta', 'repository', 'other', 'total'].map((category) => {
  const values = cases.map((row) => row[category]).filter((value) => value !== null)
  const complete = values.length === cases.length
  const sum = values.reduce((a, b) => a + b, 0)
  return [category, {
    measuredCases: values.length, totalCases: cases.length,
    sum: complete ? sum : null, average: complete ? sum / cases.length : null,
    max: complete ? Math.max(...values) : null, min: complete ? Math.min(...values) : null,
    measuredSubtotal: sum,
  }]
}))
const report = {
  baseline: baselinePath, reruns: rerunPaths, duplicateIds,
  complete: cases.every((row) => row.total !== null) && duplicateIds.length === 0,
  note: 'Unrecorded/failed D1 measurements are unknown, never zero. Reruns replace baseline cases by ID; baseline consumption cannot be reconstructed from later runs.',
  summary, cases,
}
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify({ outputPath, complete: report.complete, summary }, null, 2))
