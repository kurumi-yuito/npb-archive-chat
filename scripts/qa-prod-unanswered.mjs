import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'

const baseUrl = process.env.QA_BASE_URL ?? 'https://npb-chat.dom9th-works.com'
const docPath = process.argv[2] ?? 'docs/qa-test-cases.md'
const args = process.argv.slice(3)
const delayMs = Number(process.env.QA_DELAY_MS ?? 7000)
const fetchTimeoutMs = Number(process.env.QA_FETCH_TIMEOUT_MS ?? 60000)
const fetchRetryDelaysMs = [2000, 5000, 10000]
const httpRetryDelaysMs = [5000, 15000, 30000, 60000]

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
let lastCaseLineIndex = -1
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
    lastCaseLineIndex = i + 1
  }
}

const trailingContent = lines
  .slice(lastCaseLineIndex + 1)
  .find((line) => line.trim() !== '')
if (trailingContent) {
  throw new Error(`Unexpected trailing content after last QA case: ${trailingContent}`)
}

const runId = `qa-prod-${Date.now()}`
const results = []
const runDir = `data/logs/qa-prod-run/${runId}`
await mkdir(runDir, { recursive: true })
const completedAnswers = new Map()

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
  const requestUrl = `${baseUrl}/api/chat`
  const requestHeaders = {
    'content-type': 'application/json',
    'x-npb-user-id': userId,
  }
  const history = buildHistoryForCase(testCase, completedAnswers)
  const message = normalizeQuestionForHistoryCase(testCase.question)
  const requestBody = JSON.stringify({
    message,
    ...(history.length > 0 ? { history } : {}),
  })
  let response = null
  let body = null
  let json = null
  let status = null
  let outcome = 'success'
  let error = null
  const retryErrors = []
  try {
    let lastError = null
    for (let attempt = 0; attempt <= fetchRetryDelaysMs.length; attempt += 1) {
      const attemptNo = attempt + 1
      const attemptController = new AbortController()
      const attemptTimeoutHandle = setTimeout(
        () => attemptController.abort(new Error(`fetch timeout after ${fetchTimeoutMs}ms`)),
        fetchTimeoutMs,
      )
      try {
        console.error(`[qa-runner] fetch ${requestUrl} attempt=${attemptNo}`)
        response = await fetch(requestUrl, {
          method: 'POST',
          headers: requestHeaders,
          body: requestBody,
          signal: attemptController.signal,
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
        const canRetryHttp =
          attempt < httpRetryDelaysMs.length &&
          (response.status === 429 ||
            response.status === 503 ||
            json?.data?.code === 'chat_llm_unavailable')
        if (canRetryHttp) {
          retryErrors.push({
            attempt: attemptNo,
            name: 'HttpRetry',
            message: `HTTP ${response.status}: ${json?.message ?? response.statusText}`,
            stack: null,
            cause: null,
          })
          await delay(retryDelayMs(response, httpRetryDelaysMs[attempt]))
          continue
        }
        lastError = null
        break
      } catch (err) {
        const normalizedError = err instanceof Error ? err : new Error(String(err))
        lastError = normalizedError
        const causeCode = normalizedError.cause?.code ?? null
        retryErrors.push({
          attempt: attemptNo,
          name: normalizedError.name,
          message: normalizedError.message,
          stack: normalizedError.stack,
          cause: normalizedError.cause ? {
            code: normalizedError.cause.code ?? null,
            message: normalizedError.cause.message ?? String(normalizedError.cause),
            stack: normalizedError.cause.stack ?? null,
          } : null,
        })
        const canRetry = causeCode === 'EAI_AGAIN' && attempt < fetchRetryDelaysMs.length
        if (!canRetry) {
          error = normalizedError
          outcome = normalizedError?.name === 'AbortError' ? 'timeout' : 'error'
          body = normalizedError instanceof Error ? `${normalizedError.name}: ${normalizedError.message}` : String(normalizedError)
          status = outcome === 'timeout' ? 'timeout' : 'error'
          break
        }
        await delay(fetchRetryDelaysMs[attempt])
      } finally {
        clearTimeout(attemptTimeoutHandle)
      }
    }
    if (error === null && body === null && lastError) {
      error = lastError
      outcome = lastError?.name === 'AbortError' ? 'timeout' : 'error'
      body = lastError instanceof Error ? `${lastError.name}: ${lastError.message}` : String(lastError)
      status = outcome === 'timeout' ? 'timeout' : 'error'
    }
  } finally {
    clearTimeout(timeoutHandle)
  }

  const record = {
    ...testCase,
    status,
    outcome,
    request: {
      url: requestUrl,
      headers: requestHeaders,
      body: requestBody,
    },
    structured_query: json?.structured_query ?? null,
    intent: json?.structured_query?.intent ?? null,
    entities: extractEntities(json?.structured_query ?? null),
    player_id: extractPlayerId(json ?? null),
    target_period: extractTargetPeriod(json?.structured_query ?? null),
    data_requirements: json?.answer?.execution_metadata?.data_requirements ?? null,
    repositories: json?.answer?.execution_metadata?.repositories ?? null,
    follow_up_type: json?.answer?.execution_metadata?.follow_up_type ?? null,
    referenced_context: json?.answer?.execution_metadata?.referenced_context ?? null,
    target_entity: json?.answer?.execution_metadata?.target_entity ?? null,
    target_game_id: json?.answer?.execution_metadata?.target_game_id ?? null,
    target_player_id: json?.answer?.execution_metadata?.target_player_id ?? null,
    answer_mode: json?.answer?.execution_metadata?.answer_mode ?? null,
    summary: json?.answer?.summary ?? null,
    result_count: json?.answer?.result_count ?? null,
    resolved_player: json?.answer?.resolved_player ?? null,
    source_urls: json?.answer?.source_urls ?? null,
    raw: json ?? body,
    retries: retryErrors.length > 0 ? retryErrors : null,
    error: error ? {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: error.cause ? {
        code: error.cause.code ?? null,
        message: error.cause.message ?? String(error.cause),
        stack: error.cause.stack ?? null,
      } : null,
    } : null,
    saved_at: new Date().toISOString(),
  }
  results.push(record)
  if (record.summary) {
    completedAnswers.set(record.id, {
      question: message,
      summary: record.summary,
    })
  }
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

function retryDelayMs(response, fallbackMs) {
  const retryAfter = response.headers.get('retry-after')
  if (!retryAfter) {
    return fallbackMs
  }
  const seconds = Number(retryAfter)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.max(fallbackMs, seconds * 1000)
  }
  const dateMs = Date.parse(retryAfter)
  if (Number.isFinite(dateMs)) {
    return Math.max(fallbackMs, dateMs - Date.now())
  }
  return fallbackMs
}

function extractEntities(structuredQuery) {
  const filters = structuredQuery?.filters
  if (!filters || typeof filters !== 'object') {
    return null
  }
  return {
    player: filters.player_name ?? null,
    pitcher: filters.pitcher_name ?? null,
    batter: filters.batter_name ?? null,
    runner: filters.runner_name ?? null,
    team: filters.team ?? null,
    opponent: filters.opponent ?? null,
    game_id: filters.game_id ?? null,
  }
}

function extractPlayerId(payload) {
  const resolved = payload?.answer?.resolved_player
  if (resolved?.player_id) {
    return resolved.player_id
  }
  const filters = payload?.structured_query?.filters
  if (!filters || typeof filters !== 'object') {
    return null
  }
  return filters.player_id ??
    filters.pitcher_player_id ??
    filters.batter_player_id ??
    filters.runner_player_id ??
    null
}

function extractTargetPeriod(structuredQuery) {
  const filters = structuredQuery?.filters
  if (!filters || typeof filters !== 'object') {
    return null
  }
  return {
    game_date: filters.game_date ?? null,
    year: filters.year ?? null,
    year_from: filters.year_from ?? null,
    year_to: filters.year_to ?? null,
    recent: filters.recent ?? null,
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

function buildHistoryForCase(testCase, completedAnswers) {
  const match = testCase.question.match(/直前に(Q-\d+)の回答がある状態/u)
  if (!match) {
    return []
  }
  const previous = completedAnswers.get(match[1])
  if (!previous) {
    return []
  }
  return [
    { role: 'user', content: previous.question },
    { role: 'assistant', content: previous.summary },
  ]
}

function normalizeQuestionForHistoryCase(question) {
  return question.replace(/^（直前にQ-\d+の回答がある状態で）/u, '').trim()
}
console.log(outPath)
