import { mkdtemp, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { parseRawGameFromDir } from '@npb/parser'
import { migrateDatabase, openDatabase } from '@npb/db'
import { runScoresCalendarEnrichment } from '../packages/db/src/enrich-scores-calendar'
import { loadRichGame } from '../packages/db/src/loader'

const fixtureRoot = path.resolve(
  process.cwd(),
  'packages',
  'parser',
  'src',
  '__fixtures__',
  'raw',
  '2025',
  '0815',
  'r20250815b-l-17',
)

async function main() {
  const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'npb-fixture-smoke-'))
  const sqlitePath = '/tmp/npb-fixture-smoke.sqlite'
  await rm(sqlitePath, { force: true })

  const richGame = await parseRawGameFromDir(fixtureRoot)
  const db = openDatabase(sqlitePath)
  migrateDatabase(db)
  loadRichGame(db, richGame)
  for (const table of [
    'events',
    'batting_lines',
    'pitching_lines',
    'roster_entries',
    'source_snapshots',
  ] as const) {
    db.prepare(`DELETE FROM ${table}`).run()
  }
  const before = counts(db)
  db.close()

  const calendarHtml = '<html><body><a href="/scores/2025/0815/b-l-17/">game</a></body></html>'
  const indexHtml = await readFile(path.join(fixtureRoot, 'index.html'), 'utf8')
  const playByPlayHtml = await readFile(path.join(fixtureRoot, 'playbyplay.html'), 'utf8')
  const boxHtml = await readFile(path.join(fixtureRoot, 'box.html'), 'utf8')
  const rosterHtml = await readFile(path.join(fixtureRoot, 'roster.html'), 'utf8')

  const fetchImpl = async (input: string | URL) => {
    const url = String(input)
    if (url === 'https://npb.jp/scores/2025/0815/') {
      return new Response(calendarHtml, { status: 200 })
    }
    if (url === 'https://npb.jp/scores/2025/0815/b-l-17/index.html') {
      return new Response(indexHtml, { status: 200 })
    }
    if (url === 'https://npb.jp/scores/2025/0815/b-l-17/playbyplay.html') {
      return new Response(playByPlayHtml, { status: 200 })
    }
    if (url === 'https://npb.jp/scores/2025/0815/b-l-17/box.html') {
      return new Response(boxHtml, { status: 200 })
    }
    if (url === 'https://npb.jp/scores/2025/0815/b-l-17/roster.html') {
      return new Response(rosterHtml, { status: 200 })
    }
    return new Response('not found', { status: 404 })
  }

  const result = await runScoresCalendarEnrichment({
    year: 2025,
    sqlitePath,
    workspaceRoot,
    fetchImpl,
    sleepImpl: async () => {},
    delayMs: 0,
    progressEvery: 0,
  })

  const dbAfter = openDatabase(sqlitePath)
  const after = counts(dbAfter)
  dbAfter.close()

  const reasonCounts = result.failures.reduce<Record<string, number>>((acc, failure) => {
    const key = `${failure.stage}:${failure.reason}`
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})

  console.log(
    JSON.stringify(
      {
        sqlitePath,
        workspaceRoot,
        before,
        after,
        delta: {
          events: after.events - before.events,
          batting_lines: after.batting_lines - before.batting_lines,
          pitching_lines: after.pitching_lines - before.pitching_lines,
          roster_entries: after.roster_entries - before.roster_entries,
          source_snapshots: after.source_snapshots - before.source_snapshots,
        },
        result,
        failureReasonCounts: reasonCounts,
      },
      null,
      2,
    ),
  )
}

function counts(db: ReturnType<typeof openDatabase>) {
  const count = (table: string) =>
    Number((db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c)
  return {
    events: count('events'),
    batting_lines: count('batting_lines'),
    pitching_lines: count('pitching_lines'),
    roster_entries: count('roster_entries'),
    source_snapshots: count('source_snapshots'),
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
