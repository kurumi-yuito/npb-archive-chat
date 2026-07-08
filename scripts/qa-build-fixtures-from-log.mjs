import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

const inputPath = process.argv[2]
const outputPath = process.argv[3] ?? 'data/qa-fixtures/current.jsonl'

if (!inputPath) {
  console.error('usage: node scripts/qa-build-fixtures-from-log.mjs <qa-log.json> [output.jsonl]')
  process.exit(1)
}

const log = JSON.parse(await readFile(inputPath, 'utf8'))
const entries = Array.isArray(log) ? log : log.results
if (!Array.isArray(entries)) {
  throw new Error(`QA log does not contain results: ${inputPath}`)
}

const fixtures = entries.map((entry) => {
  const requestBody = parseRequestBody(entry.request?.body)
  const structuredQuery = entry.raw?.structured_query ?? entry.structured_query
  if (!entry.id) {
    throw new Error('QA log entry is missing id')
  }
  if (!requestBody?.message) {
    throw new Error(`QA log entry ${entry.id} is missing request body message`)
  }
  if (!structuredQuery) {
    throw new Error(`QA log entry ${entry.id} is missing structured query`)
  }
  return {
    case_id: entry.id,
    message: requestBody.message,
    history: requestBody.history ?? [],
    structured_query: sanitizeStructuredQueryForParserFixture(structuredQuery),
    source_log: inputPath,
  }
})

await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${fixtures.map((fixture) => JSON.stringify(fixture)).join('\n')}\n`)
console.log(outputPath)

function parseRequestBody(value) {
  if (typeof value !== 'string') {
    return null
  }
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function sanitizeStructuredQueryForParserFixture(structuredQuery) {
  const filters = structuredQuery.filters && typeof structuredQuery.filters === 'object'
    ? { ...structuredQuery.filters }
    : undefined
  if (!filters) {
    return structuredQuery
  }

  delete filters.player_id
  delete filters.pitcher_player_id
  delete filters.batter_player_id
  delete filters.runner_player_id

  return {
    ...structuredQuery,
    filters,
  }
}
