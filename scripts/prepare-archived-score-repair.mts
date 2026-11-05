import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { openDatabase, withTransaction } from '../packages/db/src/sqlite'
import { buildNormalizedDelta } from '../packages/db/src/normalized-d1-delta'
import { matchesGameTeamFilter } from '../packages/db/src/repository/team-name-utils'
import { parseScoresIndexHtml } from '../packages/parser/src/scores-index'

// Offline replay only: missing totals may be restored from archived official
// box scores. Existing known totals and original acquisition times are retained.
const options = new Map(process.argv.slice(2).map((argument) => {
  const match = /^--([^=]+)=(.+)$/u.exec(argument)
  if (!match) throw new Error('Use --baseline=path --output-dir=path [--workspace-root=path]')
  return [match[1]!, match[2]!]
}))
const required = (key: string) => {
  const value = options.get(key)
  if (!value) throw new Error(`Missing --${key}`)
  return path.resolve(value)
}
const baseline = required('baseline'), directory = required('output-dir')
const workspace = path.resolve(options.get('workspace-root') ?? '.')
await mkdir(directory, { recursive: true })
const candidateFile = path.join(directory, 'candidate.sqlite'), rehearsalFile = path.join(directory, 'rehearsal.sqlite')
if ([candidateFile, rehearsalFile].includes(baseline)) throw new Error('Cannot overwrite baseline')
await copyFile(baseline, candidateFile)
await copyFile(baseline, rehearsalFile)
const candidate = openDatabase(candidateFile), previous = openDatabase(rehearsalFile)
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const known = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0
const totals = (json: string | null) => {
  const score = json ? JSON.parse(json) : {}
  return [score.runs?.away ?? score.away?.totals?.runs, score.runs?.home ?? score.home?.totals?.runs]
}
const sameTeam = (left: string | null, right: string) => Boolean(left && (matchesGameTeamFilter(left, right) || matchesGameTeamFilter(right, left)))
const officialPath = (url: string) => {
  const parsed = new URL(url)
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.hostname !== 'npb.jp' || !/^\/scores\/\d{4}\/\d{4}\/[a-z0-9-]+\/box\.html$/u.test(parsed.pathname)) throw new Error(`Invalid official box URL: ${url}`)
  return parsed.pathname
}
type Row = { game_id: string; game_date: string; away_team: string; home_team: string; linescore_json: string | null; raw_path: string | null; source_url: string | null; fetched_at: string | null }
try {
  const rows = candidate.prepare(`SELECT g.game_id,g.game_date,a.team_name away_team,h.team_name home_team,g.linescore_json,
    s.raw_path,s.source_url,s.fetched_at FROM game_facts g
    JOIN teams a ON a.team_id=g.away_team_id JOIN teams h ON h.team_id=g.home_team_id
    LEFT JOIN source_snapshot_facts s ON s.game_id=g.game_id AND s.source_key='box' ORDER BY g.game_date,g.game_id`).all() as Row[]
  const repairs: Array<Record<string, unknown>> = [], unresolved: Array<Record<string, unknown>> = []
  for (const row of rows) {
    const before = totals(row.linescore_json)
    if (before.every(known)) continue
    if (!row.raw_path || !row.source_url || !row.fetched_at) { unresolved.push({ gameId: row.game_id, reason: 'missing archived source metadata' }); continue }
    const rawFile = path.resolve(workspace, row.raw_path)
    if (!rawFile.startsWith(path.join(workspace, 'data', 'raw') + path.sep)) throw new Error('Untrusted raw path')
    let raw: string
    try { raw = await readFile(rawFile, 'utf8') } catch { unresolved.push({ gameId: row.game_id, reason: 'archived source unavailable' }); continue }
    const parsed = parseScoresIndexHtml(raw), score = parsed.linescore
    if (!score.source_url || officialPath(score.source_url) !== officialPath(row.source_url) || parsed.game.game_date !== row.game_date ||
      !sameTeam(score.away_team, row.away_team) || !sameTeam(score.home_team, row.home_team)) throw new Error(`Source scope mismatch: ${row.game_id}`)
    const after = [score.runs.away, score.runs.home]
    if (!after.every(known)) { unresolved.push({ gameId: row.game_id, reason: 'official page contains no completed score' }); continue }
    if (before.some((value, index) => known(value) && value !== after[index])) throw new Error(`Known total conflicts with archive: ${row.game_id}`)
    for (const [index, innings] of [score.inning_scores.away, score.inning_scores.home].entries()) {
      let sum = 0
      for (const inning of innings) {
        const token = inning.replace(/[xX×]$/u, '')
        if (token === '' || token === '-') continue
        if (!/^\d+$/u.test(token)) throw new Error(`Unrecognized inning value: ${row.game_id}:${inning}`)
        sum += Number(token)
      }
      if (!innings.length || sum !== after[index]) throw new Error(`Innings do not reconcile: ${row.game_id}`)
    }
    score.game_id = row.game_id
    const next = JSON.stringify(score)
    candidate.prepare('UPDATE game_facts SET linescore_json=? WHERE game_id=?').run(next, row.game_id)
    repairs.push({ gameId: row.game_id, sourceUrl: row.source_url, rawPath: row.raw_path, rawHash: hash(raw), fetchedAt: row.fetched_at,
      beforeHash: hash(row.linescore_json ?? ''), afterHash: hash(next), before: before.map((value) => value ?? null), after })
  }
  const delta = buildNormalizedDelta(previous, candidate, ['game_facts'])
  withTransaction(previous, () => {
    previous.exec(delta.sql)
    if (previous.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Foreign key verification failed')
  })
  candidate.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  previous.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  const manifest = { preparedAt: new Date().toISOString(), baseline, previousGeneration: delta.previousGeneration, generation: delta.generation,
    changes: delta.changes, repairs, unresolved, rehearsal: 'passed', published: false }
  await writeFile(path.join(directory, 'publication.sql'), delta.sql)
  await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  console.log(JSON.stringify({ repaired: repairs.length, unresolved: unresolved.length, changes: delta.changes, rehearsal: 'passed', published: false }))
} finally { candidate.close(); previous.close() }
