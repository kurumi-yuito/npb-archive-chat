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
let fixturePath = null
let caseFilter = null
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
    continue
  }
  if (arg === '--fixture') {
    fixturePath = args[i + 1] ?? null
    i += 1
    continue
  }
  if (arg === '--cases') {
    const rawCases = args[i + 1] ?? ''
    caseFilter = new Set(rawCases.split(',').map((id) => id.trim()).filter(Boolean))
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
const fixtureMode = fixturePath !== null
const fixtureToken = process.env.NPB_QA_REPLAY_TOKEN ?? ''
if (fixtureMode && !fixtureToken) {
  throw new Error('NPB_QA_REPLAY_TOKEN is required when --fixture is used')
}

const fixturesByCase = fixtureMode
  ? await readFixtureFile(fixturePath)
  : new Map()
const uiCapabilityCases = new Set(['Q-144', 'Q-145', 'Q-146', 'Q-168'])
const usageCapabilityCases = new Set([
  'Q-165', 'Q-166', 'Q-167', 'Q-169', 'Q-170', 'Q-171',
  'Q-172', 'Q-173', 'Q-174', 'Q-175', 'Q-176',
])

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
  const caseId = `Q-${id}`
  if (caseFilter && !caseFilter.has(caseId)) {
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
    cases.push({ id: caseId, question: question.trim() })
    lastCaseLineIndex = i + 1
  }
}

const trailingContent = lines
  .slice(lastCaseLineIndex + 1)
  .find((line) => line.trim() !== '')
if (!caseFilter && startNo === null && endNo === null && trailingContent) {
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
  const fixture = fixtureMode ? fixturesByCase.get(testCase.id) : null
  if (fixtureMode && !fixture) {
    const record = {
      ...testCase,
      status: 'blocked',
      outcome: 'blocked',
      request: null,
      structured_query: null,
      intent: null,
      entities: null,
      player_id: null,
      target_period: null,
      data_requirements: null,
      repositories: null,
      follow_up_type: null,
      referenced_context: null,
      target_entity: null,
      target_game_id: null,
      target_player_id: null,
      answer_mode: null,
      summary: null,
      result_count: null,
      suggested_questions: null,
      resolved_player: null,
      source_urls: null,
      raw: null,
      retries: null,
      error: {
        name: 'MissingFixture',
        message: `Fixture is missing for ${testCase.id}`,
        stack: null,
        cause: null,
      },
      saved_at: new Date().toISOString(),
    }
    results.push(record)
    await writeJson(`${runDir}/${testCase.id}.json`, record)
    await saveState({
      runId,
      baseUrl,
      docPath,
      fixturePath,
      lastSavedQ: testCase.id,
      lastSavedIndex: index + 1,
      totalCases: cases.length,
      updatedAt: new Date().toISOString(),
    })
    continue
  }
  const capabilityRecord = await runCapabilityCheck(testCase, userId)
  if (capabilityRecord) {
    results.push(capabilityRecord)
    await writeJson(`${runDir}/${testCase.id}.json`, capabilityRecord)
    await saveState({
      runId,
      baseUrl,
      docPath,
      fixturePath,
      lastSavedQ: testCase.id,
      lastSavedIndex: index + 1,
      totalCases: cases.length,
      updatedAt: new Date().toISOString(),
    })
    if (index + 1 < cases.length) await delay(delayMs)
    continue
  }
  const controller = new AbortController()
  const timeoutHandle = setTimeout(() => controller.abort(new Error(`fetch timeout after ${fetchTimeoutMs}ms`)), fetchTimeoutMs)
  const requestUrl = `${baseUrl}/api/chat`
  const requestHeaders = {
    'content-type': 'application/json',
    'x-npb-user-id': userId,
    // Production ignores x-npb-user-id without internal auth. Isolate each QA case's
    // guest guard bucket so the full regression suite represents independent users.
    'user-agent': `npb-production-qa/${testCase.id}`,
    ...(fixtureMode ? {
      'x-npb-qa-mode': 'fixture',
      'x-npb-qa-token': fixtureToken,
    } : {}),
  }
  const requestHeadersForLog = {
    ...requestHeaders,
    ...(fixtureMode ? { 'x-npb-qa-token': '<redacted>' } : {}),
  }
  const history = fixtureMode
    ? fixture.history
    : buildHistoryForCase(testCase, completedAnswers)
  const message = fixtureMode
    ? fixture.message
    : normalizeQuestionForHistoryCase(testCase.question)
  const requestPayload = {
    message,
    ...(history.length > 0 ? { history } : {}),
    ...(fixtureMode ? { fixture_structured_query: fixture.structured_query } : {}),
  }
  const requestBody = JSON.stringify(requestPayload)
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
        outcome = response.ok ? 'success' : 'error'
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
      headers: requestHeadersForLog,
      body: requestBody,
    },
    fixture: fixtureMode ? {
      case_id: fixture.case_id,
      source_log: fixture.source_log,
      structured_query: fixture.structured_query,
    } : null,
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
    suggested_questions: json?.answer?.suggested_questions ?? null,
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
    fixturePath,
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
  fixturePath,
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

async function runCapabilityCheck(testCase, userId) {
  if (!uiCapabilityCases.has(testCase.id) && !usageCapabilityCases.has(testCase.id)) {
    return null
  }
  const evidence = {}
  const checkedUrls = []
  try {
    if (uiCapabilityCases.has(testCase.id)) {
      const url = `${baseUrl}/chat`
      const response = await fetch(url, { headers: { 'user-agent': `npb-production-qa/${testCase.id}` } })
      const html = await response.text()
      checkedUrls.push(url)
      evidence.ui = {
        status: response.status,
        hasHeader: html.includes('topbar'),
        hasConversation: html.includes('conversation'),
        hasComposer: html.includes('composer'),
        hasUsageLabel: html.includes('残り質問数'),
        usesDynamicViewport: html.includes('100dvh') || html.includes('100svh'),
        locksPageOverflow: html.includes('overflow:hidden'),
      }
      assert(response.ok, `chat UI returned HTTP ${response.status}`)
      assert(evidence.ui.hasHeader && evidence.ui.hasConversation && evidence.ui.hasComposer, 'chat layout regions are missing')
      assert(evidence.ui.usesDynamicViewport && evidence.ui.locksPageOverflow, 'fixed composer viewport contract is missing')
      if (testCase.id === 'Q-168') assert(evidence.ui.hasUsageLabel, 'usage indicator is missing')
    }
    if (usageCapabilityCases.has(testCase.id)) {
      const usageUrl = `${baseUrl}/api/chat/usage`
      const response = await fetch(usageUrl, {
        headers: { 'user-agent': `npb-production-qa/${testCase.id}-${userId}` },
      })
      const usage = await response.json()
      checkedUrls.push(usageUrl)
      evidence.usage = {
        status: response.status,
        cacheControl: response.headers.get('cache-control'),
        cdnCacheControl: response.headers.get('cdn-cache-control'),
        cloudflareCdnCacheControl: response.headers.get('cloudflare-cdn-cache-control'),
        cfCacheStatus: response.headers.get('cf-cache-status'),
        vary: response.headers.get('vary'),
        body: usage,
      }
      assert(response.ok, `usage API returned HTTP ${response.status}`)
      assert(usage.timezone === 'Asia/Tokyo', 'usage timezone is not Asia/Tokyo')
      assert(usage.limit === 10 && usage.refillIntervalMinutes === 120, 'runtime usage settings differ from 10/120')
      assert(typeof usage.remaining === 'number' && usage.remaining >= 0 && usage.remaining <= usage.limit, 'usage remaining is invalid')
      assert(String(evidence.usage.cacheControl).includes('no-store'), 'browser cache is not disabled')
      assert(String(evidence.usage.cdnCacheControl).includes('no-store'), 'CDN cache is not disabled')
      assert(String(evidence.usage.cloudflareCdnCacheControl).includes('no-store'), 'Cloudflare CDN cache is not disabled')
      assert(evidence.usage.cfCacheStatus !== 'HIT', 'usage API returned a Cloudflare cache HIT')

      if (testCase.id === 'Q-165' || testCase.id === 'Q-173' || testCase.id === 'Q-170') {
        const userAgent = `npb-production-qa/usage-flow-${testCase.id}-${runId}`
        let cookie = ''
        const remainingSequence = []
        const successfulRequests = testCase.id === 'Q-165' ? usage.limit : testCase.id === 'Q-173' ? 2 : 1
        for (let attempt = 0; attempt < successfulRequests; attempt += 1) {
          const chatResponse = await fetch(`${baseUrl}/api/chat`, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'user-agent': userAgent,
              ...(cookie ? { cookie } : {}),
            },
            body: JSON.stringify({ message: 'test' }),
          })
          cookie = responseCookie(chatResponse) ?? cookie
          const payload = await chatResponse.json()
          assert(chatResponse.ok, `usage flow chat returned HTTP ${chatResponse.status}`)
          remainingSequence.push(payload?.usage?.remaining)
        }
        evidence.usageFlow = { successfulRequests, remainingSequence }
        assert(
          remainingSequence.every((remaining, index) => remaining === usage.limit - index - 1),
          `usage did not decrement immediately: ${remainingSequence.join(',')}`,
        )
        if (testCase.id === 'Q-165') {
          const limitedResponse = await fetch(`${baseUrl}/api/chat`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'user-agent': userAgent, cookie },
            body: JSON.stringify({ message: 'test' }),
          })
          const limitedPayload = await limitedResponse.json()
          evidence.usageFlow.limitResponse = { status: limitedResponse.status, body: limitedPayload }
          assert(limitedResponse.status === 429, `usage limit returned HTTP ${limitedResponse.status}, expected 429`)
          assert(limitedPayload?.data?.usage?.remaining === 0, '429 response does not contain remaining=0')
          assert(limitedPayload?.data?.usage?.nextTokenAt, '429 response does not contain nextTokenAt')
        }
        if (testCase.id === 'Q-170') {
          const deletedCookieResponse = await fetch(usageUrl, { headers: { 'user-agent': userAgent } })
          const deletedCookieUsage = await deletedCookieResponse.json()
          evidence.usageFlow.afterCookieDeletion = deletedCookieUsage
          assert(deletedCookieUsage.remaining === usage.limit - 1, 'guest guard reset after deleting the account cookie')
        }
      }

      if (['Q-166', 'Q-167', 'Q-169', 'Q-171'].includes(testCase.id)) {
        const plansUrl = `${baseUrl}/api/billing/plans`
        const plansResponse = await fetch(plansUrl)
        const plans = await plansResponse.json()
        checkedUrls.push(plansUrl)
        evidence.plans = { status: plansResponse.status, body: plans }
        assert(plansResponse.ok, `billing plans API returned HTTP ${plansResponse.status}`)
        const free = plans.find((plan) => plan.key === 'free')
        const pro = plans.find((plan) => plan.key === 'pro')
        assert(free?.usageTokenCapacity === 10 && free?.usageRefillIntervalMinutes === 120, 'Free plan usage contract is invalid')
        assert(pro?.usageTokenCapacity === null && pro?.usageRefillIntervalMinutes === null, 'Pro plan is not unlimited')
      }
    }
    return capabilityRecord(testCase, 'success', 200, checkedUrls, evidence, null)
  } catch (error) {
    return capabilityRecord(
      testCase,
      'error',
      'error',
      checkedUrls,
      evidence,
      error instanceof Error ? error : new Error(String(error)),
    )
  }
}

function capabilityRecord(testCase, outcome, status, checkedUrls, evidence, error) {
  return {
    ...testCase,
    status,
    outcome,
    request: { mode: 'capability', urls: checkedUrls },
    structured_query: null,
    intent: null,
    entities: null,
    player_id: null,
    target_period: null,
    data_requirements: ['production_capability_contract'],
    repositories: [],
    follow_up_type: null,
    referenced_context: null,
    target_entity: null,
    target_game_id: null,
    target_player_id: null,
    answer_mode: 'capability_verification',
    summary: outcome === 'success'
      ? `Production capability check passed: ${checkedUrls.join(', ')}`
      : null,
    result_count: outcome === 'success' ? 1 : 0,
    suggested_questions: [],
    resolved_player: null,
    source_urls: checkedUrls,
    raw: evidence,
    retries: null,
    error: error ? { name: error.name, message: error.message, stack: error.stack, cause: null } : null,
    saved_at: new Date().toISOString(),
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function responseCookie(response) {
  const setCookie = response.headers.get('set-cookie')
  return setCookie ? setCookie.split(';', 1)[0] : null
}

async function readFixtureFile(path) {
  const content = await readFile(path, 'utf8')
  const fixtures = new Map()
  for (const [index, line] of content.split(/\r?\n/).entries()) {
    if (!line.trim()) {
      continue
    }
    const fixture = JSON.parse(line)
    if (!fixture.case_id) {
      throw new Error(`Fixture line ${index + 1} is missing case_id`)
    }
    if (!fixture.message) {
      throw new Error(`Fixture ${fixture.case_id} is missing message`)
    }
    if (!fixture.structured_query) {
      throw new Error(`Fixture ${fixture.case_id} is missing structured_query`)
    }
    fixtures.set(fixture.case_id, {
      case_id: fixture.case_id,
      message: fixture.message,
      history: Array.isArray(fixture.history) ? fixture.history : [],
      structured_query: fixture.structured_query,
      source_log: fixture.source_log ?? path,
    })
  }
  return fixtures
}
console.log(outPath)
