import { mkdir, readFile, writeFile } from 'node:fs/promises'

const baseUrl = process.env.QA_BASE_URL ?? 'https://npb-chat.dom9th-works.com'
const docPath = process.argv[2] ?? 'docs/qa-test-cases.md'
const onlyUnanswered = process.env.QA_ALL !== '1'
const delayMs = Number(process.env.QA_DELAY_MS ?? 1200)

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
  const answer = answerLine.slice(2).trim()
  if (!onlyUnanswered || answer === '') {
    cases.push({ id: `Q-${id}`, question: question.trim() })
  }
}

const runId = `qa-prod-${Date.now()}`
const results = []

for (const [index, testCase] of cases.entries()) {
  const userId = `${runId}-${index + 1}`
  process.stderr.write(`[${index + 1}/${cases.length}] ${testCase.id} ${testCase.question}\n`)
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-npb-user-id': userId,
    },
    body: JSON.stringify({ message: testCase.question }),
  })
  const body = await response.text()
  let json = null
  try {
    json = JSON.parse(body)
  } catch {
    // Keep the raw body for diagnostics.
  }
  results.push({
    ...testCase,
    status: response.status,
    structured_query: json?.structured_query ?? null,
    summary: json?.answer?.summary ?? null,
    result_count: json?.answer?.result_count ?? null,
    resolved_player: json?.answer?.resolved_player ?? null,
    source_urls: json?.answer?.source_urls ?? null,
    raw: json ?? body,
  })
  if (index + 1 < cases.length) {
    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }
}

await mkdir('data/logs', { recursive: true })
const outPath = `data/logs/${runId}.json`
await writeFile(outPath, `${JSON.stringify({ baseUrl, docPath, results }, null, 2)}\n`)
console.log(outPath)
