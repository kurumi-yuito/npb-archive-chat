import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { discoverGamesByYear } from '../packages/crawler/src/index'
import { openDatabase } from '../packages/db/src/sqlite'
import { canonicalLeagueTeamNames, canonicalTeamName, matchesGameTeamFilter } from '../packages/db/src/repository/team-name-utils'
import { discoveryYearSchema } from '../packages/schemas/src/index'
import { inspectBisGameOutcome } from '../packages/parser/src/bis-only'

// Read-only coverage audit. An unmatched discovery is not automatically a new
// game: source IDs, reversed fixtures and doubleheaders must be reviewed first.
const options = new Map(process.argv.slice(2).map((argument) => {
  const match = /^--([^=]+)=(.+)$/u.exec(argument)
  if (!match) throw new Error('Use --year=YYYY --sqlite=path --output-dir=path')
  return [match[1]!, match[2]!]
}))
const year = Number(options.get('year')), sqlite = options.get('sqlite'), output = options.get('output-dir')
if (!Number.isInteger(year) || year < 1936 || !sqlite || !output) throw new Error('Valid year, normalized SQLite baseline and output directory are required')
const directory = path.resolve(output)
await mkdir(path.join(directory, 'raw'), { recursive: true })
let snapshots: Array<{ url: string; fetchedAt: string; status: number; sha256: string; rawFile: string }> = []
const captured = options.get('captured')
if (captured) {
  snapshots = JSON.parse(await readFile(path.join(path.resolve(captured), 'source-manifest.json'), 'utf8'))
  if (!snapshots.length) throw new Error('Captured discovery has no source archive')
  for (const snapshot of snapshots) {
    if (new URL(snapshot.url).hostname !== 'npb.jp' || !Number.isFinite(Date.parse(snapshot.fetchedAt)) ||
      createHash('sha256').update(await readFile(snapshot.rawFile)).digest('hex') !== snapshot.sha256) throw new Error('Captured discovery archive no longer matches its source manifest')
  }
}
const discovery = captured ? discoveryYearSchema.parse(JSON.parse(await readFile(path.join(path.resolve(captured), 'discovery.json'), 'utf8'))) : await discoverGamesByYear({ year, fetchImpl: async (input, init) => {
  const url = new URL(String(input))
  if (url.protocol !== 'https:' || url.hostname !== 'npb.jp') throw new Error('Discovery left the official source origin')
  await new Promise((resolve) => setTimeout(resolve, 100))
  const response = await fetch(input, init)
  if (response.url && new URL(response.url).hostname !== 'npb.jp') throw new Error('Discovery redirected outside the official source')
  const raw = await response.clone().text(), hash = createHash('sha256').update(raw).digest('hex')
  const rawFile = path.join(directory, 'raw', `${hash}.html`)
  await writeFile(rawFile, raw)
  snapshots.push({ url: String(input), fetchedAt: new Date().toISOString(), status: response.status, sha256: hash, rawFile })
  if (snapshots.length % 25 === 0) console.error(JSON.stringify({ captured: snapshots.length, year }))
  return response
} })
if (discovery.year !== year) throw new Error('Captured discovery belongs to another year')
await writeFile(path.join(directory, 'discovery.json'), JSON.stringify(discovery, null, 2) + '\n')
await writeFile(path.join(directory, 'source-manifest.json'), JSON.stringify(snapshots, null, 2) + '\n')
const database = openDatabase(path.resolve(sqlite))
try {
  const stored = database.prepare(`SELECT g.game_id,g.game_date,g.game_number,g.start_time,a.team_name away_team,h.team_name home_team
    FROM game_facts g JOIN teams a ON a.team_id=g.away_team_id JOIN teams h ON h.team_id=g.home_team_id WHERE g.year=?`).all(year) as Array<{
      game_id: string; game_date: string; game_number: number | null; start_time: string | null; away_team: string; home_team: string
    }>
  const teamKey = (name: string) => canonicalLeagueTeamNames().find((club) => matchesGameTeamFilter(name, club)) ?? canonicalTeamName(name)
  const key = (date: string, farm: boolean, home: string, away: string) => JSON.stringify([date, farm, teamKey(home), teamKey(away)])
  const fixtures = new Map<string, typeof stored>()
  for (const row of stored) {
    const id = key(row.game_date, row.game_id.startsWith('f'), row.home_team, row.away_team)
    fixtures.set(id, [...(fixtures.get(id) ?? []), row])
  }
  const matched: Array<{ discoveryGameId: string; storedGameId: string; matchKind: 'official_source' | 'dated_fixture' }> = [], unmatched: unknown[] = [], ambiguous: unknown[] = []
  const sourcesByUrl = new Map(snapshots.filter((row) => row.status === 200).map((row) => [row.url, row]))
  const sourceIdentity = (value: string) => {
    try {
      const url = new URL(value)
      const match = /^\/bis\/(?:eng\/)?(\d{4})\/games\/(f?s\d+\.html)$/u.exec(url.pathname)
      return url.hostname === 'npb.jp' && match ? `${match[1]}:${match[2]}` : null
    } catch { return null }
  }
  const storedSources = database.prepare(`SELECT s.game_id,s.source_url FROM source_snapshot_facts s
    JOIN game_facts g ON g.game_id=s.game_id WHERE g.year=? AND s.source_key='index'`).all(year) as Array<{ game_id: string; source_url: string }>
  const officialIds = new Map<string, typeof stored>()
  for (const row of storedSources) {
    const identity = sourceIdentity(row.source_url), game = stored.find((game) => game.game_id === row.game_id)
    if (identity && game) officialIds.set(identity, [...(officialIds.get(identity) ?? []), game])
  }
  for (const game of discovery.games) {
    const identity = sourceIdentity(game.source.dailyPageUrl), bySource = identity ? officialIds.get(identity) ?? [] : []
    if (bySource.length === 1 && bySource[0]!.game_date === game.date) {
      matched.push({ discoveryGameId: game.gameId, storedGameId: bySource[0]!.game_id, matchKind: 'official_source' })
      continue
    }
    if (bySource.length) { ambiguous.push({ discovery: game, reason: 'official_source_identity_conflict', candidates: bySource }); continue }
    const id = key(game.date, game.competition === 'farm', game.homeTeam.label, game.awayTeam.label)
    const candidates = fixtures.get(id) ?? []
    if (candidates.length === 1) matched.push({ discoveryGameId: game.gameId, storedGameId: candidates[0]!.game_id, matchKind: 'dated_fixture' })
    else if (candidates.length > 1) ambiguous.push({ discovery: game, candidates })
    else {
      const reversed = fixtures.get(key(game.date, game.competition === 'farm', game.awayTeam.label, game.homeTeam.label)) ?? []
      const snapshot = sourcesByUrl.get(game.source.dailyPageUrl)
      const outcome = snapshot ? inspectBisGameOutcome(await readFile(snapshot.rawFile, 'utf8')).status : 'unconfirmed'
      unmatched.push({ discovery: game, officialOutcome: outcome, reversedCandidates: reversed })
    }
  }
  const report = { auditedAt: new Date().toISOString(), year, sqlite: path.resolve(sqlite), storedGames: stored.length,
    discoveredGames: discovery.games.length, matched, unmatched, ambiguous, capturedSources: snapshots.length,
    scope: 'official discovery links; unmatched rows require independent identity verification', modifiedDatabase: false }
  await writeFile(path.join(directory, 'coverage.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ year, stored: stored.length, discovered: discovery.games.length, matched: matched.length, unmatched: unmatched.length, ambiguous: ambiguous.length, modifiedDatabase: false }))
} finally { database.close() }
