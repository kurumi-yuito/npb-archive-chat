import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { buildRichGameFromBisEngIndex, inspectBisGameOutcome } from '../packages/parser/src/bis-only'
import { matchesGameTeamFilter } from '../packages/db/src/repository/team-name-utils'
import { openDatabase } from '../packages/db/src/sqlite'
import { migrateDatabase } from '../packages/db/src/migrations'
import { loadRichGame } from '../packages/db/src/loader'
import { discoveryGameSchema } from '../packages/schemas/src/index'

const options = new Map(process.argv.slice(2).map((argument) => {
  const match = /^--([^=]+)=(.+)$/u.exec(argument)
  if (!match) throw new Error('Use --coverage=path --source-manifest=path --workspace-root=path')
  return [match[1]!, match[2]!]
}))
const required = (key: string) => { const value = options.get(key); if (!value) throw new Error(`Missing --${key}`); return path.resolve(value) }
const coverage = JSON.parse(await readFile(required('coverage'), 'utf8')) as { unmatched: Array<{ discovery: unknown; officialOutcome: string }> }
const snapshots = JSON.parse(await readFile(required('source-manifest'), 'utf8')) as Array<{ url: string; rawFile: string; fetchedAt: string; sha256: string; status: number }>
const workspace = required('workspace-root'), sqlite = path.join(workspace, 'gap-source.sqlite')
if (existsSync(sqlite)) throw new Error('Use a fresh gap-source workspace; do not overwrite an earlier capture')
await mkdir(workspace, { recursive: true })
const database = openDatabase(sqlite)
try {
  migrateDatabase(database)
  const receipts: unknown[] = []
  for (const item of coverage.unmatched.filter((item) => item.officialOutcome === 'completed')) {
    const game = discoveryGameSchema.parse(item.discovery)
    const source = snapshots.find((row) => row.url === game.source.dailyPageUrl && row.status === 200)
    if (!source || !Number.isFinite(Date.parse(source.fetchedAt))) throw new Error('Completed discovery lacks a captured official source')
    const raw = await readFile(source.rawFile, 'utf8')
    if (createHash('sha256').update(raw).digest('hex') !== source.sha256 || inspectBisGameOutcome(raw).status !== 'completed') throw new Error('Completed source evidence changed')
    const url = new URL(source.url), sourceDate = /\/(?:f?s)(\d{8})\d+\.html$/u.exec(url.pathname)?.[1]
    if (url.hostname !== 'npb.jp' || sourceDate !== game.date.replaceAll('-', '')) throw new Error('Source date does not match discovery')
    const rawFile = path.join(workspace, 'data', 'raw', String(game.year), game.mmdd, game.gameId, 'index.html')
    await mkdir(path.dirname(rawFile), { recursive: true })
    await writeFile(rawFile, raw)
    const parsed = buildRichGameFromBisEngIndex({ year: game.year, mmdd: game.mmdd, gameId: game.gameId }, { indexHtml: raw, indexPath: rawFile }, source.fetchedAt)
    const same = (name: string, expected: string) => name === expected || matchesGameTeamFilter(name, expected) || matchesGameTeamFilter(expected, name)
    if (parsed.game_meta.canonical_url !== source.url || !same(parsed.game_meta.home_team.name, game.homeTeam.label) || !same(parsed.game_meta.away_team.name, game.awayTeam.label)) throw new Error(`Official fixture identity mismatch: ${game.gameId}`)
    const result = loadRichGame(database, parsed)
    const structuredFile = path.join(workspace, 'data', 'rich', String(game.year), game.mmdd, game.gameId, 'game.json')
    await mkdir(path.dirname(structuredFile), { recursive: true })
    await writeFile(structuredFile, JSON.stringify(parsed, null, 2) + '\n')
    receipts.push({ ...result, sourceUrl: source.url, contentHash: source.sha256, fetchedAt: source.fetchedAt,
      score: parsed.top_summary.linescore, structuredFile, scope: 'verified BIS score; play-by-play/box enrichment still required' })
  }
  database.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  await writeFile(path.join(workspace, 'capture-receipt.json'), JSON.stringify({ sqlite, published: false, receipts }, null, 2) + '\n')
  console.log(JSON.stringify({ sqlite, seeded: receipts.length, published: false }))
} finally { database.close() }
