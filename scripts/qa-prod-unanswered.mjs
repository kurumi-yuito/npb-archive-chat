import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'

const baseUrl = process.env.QA_BASE_URL ?? 'https://npb-chat.dom9th-works.com'
const docPath = process.argv[2] ?? 'docs/qa-test-cases.md'
const args = process.argv.slice(3)
const delayMs = Number(process.env.QA_DELAY_MS ?? 1200)
const fetchTimeoutMs = Number(process.env.QA_FETCH_TIMEOUT_MS ?? 60000)

let startId = null
let endId = null
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i]
  if (arg === '--start') {
    startId = args[i + 1] ?? null
    i += 1
    continue
  }
  if (arg === '--end') {
    endId = args[i + 1] ?? null
    i += 1
  }
}

const parseQId = (value) => {
  if (!value) {
    return null
  }
  const match = String(value).match(/^Q-(\d+)$/)
  if (!match) {
    return null
  }
  return Number(match[1])
}

const startNo = parseQId(startId)
const endNo = parseQId(endId)

const text = await readFile(docPath, 'utf8')
const cases = []
const lines = text.split(/\r?\n/)
for (let i = 0; i < lines.length; i += 1) {
  const q = lines[i].match(/^Q-(\d+)(?:\s+\[未実行\])?:\s*(.+)$/)
  if (!q) {
    continue
  }
  const [, id, question] = q
  const answerLine = lines[i + 1] ?? ''
  if (!answerLine.startsWith('A:')) {
    continue
  }
  const qNo = Number(id)
  if (startNo !== null && qNo < startNo) {
    continue
  }
  if (endNo !== null && qNo > endNo) {
    continue
  }
  const answer = answerLine.slice(2).trim()
  if (process.env.QA_ALL === '1' || answer === '' || (startNo !== null || endNo !== null) || process.env.QA_ALL !== '0') {
    cases.push({ id: `Q-${id}`, question: question.trim() })
  }
}

const runId = `qa-prod-${Date.now()}`
const results = []
const runDir = `data/logs/qa-prod-run/${runId}`
await mkdir(runDir, { recursive: true })

const writeJson = async (path, value) => {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`)
}

const saveState = async (state) => {
  await writeJson(`${runDir}/state.json`, state)
}

for (const [index, testCase] of cases.entries()) {
  const userId = `${runId}-${index + 1}`
  process.stderr.write(`[${index + 1}/${cases.length}] ${testCase.id} ${testCase.question}\n`)
  const controller = new AbortController()
  const timeoutHandle = setTimeout(() => controller.abort(new Error(`fetch timeout after ${fetchTimeoutMs}ms`)), fetchTimeoutMs)
  let response = null
  let body = null
  let json = null
  let status = null
  let outcome = 'success'
  let error = null
  try {
    response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-npb-user-id': userId,
      },
      body: JSON.stringify({ message: testCase.question }),
      signal: controller.signal,
    })
    body = await response.text()
    status = response.status
    if (!response.ok) {
      outcome = 'error'
    }
    try {
      json = JSON.parse(body)
    } catch {
      // Keep the raw body for diagnostics.
    }
  } catch (err) {
    error = err
    outcome = err?.name === 'AbortError' ? 'timeout' : 'error'
    body = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    status = outcome === 'timeout' ? 'timeout' : 'error'
  } finally {
    clearTimeout(timeoutHandle)
  }

  const record = {
    ...testCase,
    status,
    outcome,
    structured_query: json?.structured_query ?? null,
    summary: json?.answer?.summary ?? null,
    result_count: json?.answer?.result_count ?? null,
    resolved_player: json?.answer?.resolved_player ?? null,
    source_urls: json?.answer?.source_urls ?? null,
    raw: json ?? body,
    error: error ? { name: error.name, message: error.message, stack: error.stack } : null,
    saved_at: new Date().toISOString(),
  }
  results.push(record)
  await writeJson(`${runDir}/${testCase.id}.json`, record)
  await saveState({
    runId,
    baseUrl,
    docPath,
    lastSavedQ: testCase.id,
    lastSavedIndex: index + 1,
    totalCases: cases.length,
    updatedAt: new Date().toISOString(),
  })
  if (index + 1 < cases.length) {
    await delay(delayMs)
  }
}

await mkdir('data/logs', { recursive: true })
const outPath = `data/logs/${runId}.json`
await writeJson(outPath, { baseUrl, docPath, runDir, results })
await saveState({
  runId,
  baseUrl,
  docPath,
  lastSavedQ: cases.at(-1)?.id ?? null,
  lastSavedIndex: cases.length,
  totalCases: cases.length,
  updatedAt: new Date().toISOString(),
  complete: true,
  summaryPath: outPath,
})
console.log(outPath)
