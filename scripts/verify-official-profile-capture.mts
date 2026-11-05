import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { officialPlayerHistoryEvidenceSchema, verifiedPlayerCareerRows } from '../packages/schemas/src/official-player-history'
import { parseBisPlayerProfileHtml, parseBisPlayerStatisticHistoryHtml } from '../packages/parser/src/bis-current'
import { openDatabase } from '../packages/db/src/sqlite'

const options = new Map(process.argv.slice(2).map((argument) => {
  const equal = argument.indexOf('=')
  if (!argument.startsWith('--') || equal < 0) throw new Error('Use --sqlite=path --output=path [--workspace-root=path]')
  return [argument.slice(2, equal), argument.slice(equal + 1)]
}))
const sqlite = options.get('sqlite')
const output = options.get('output')
if (!sqlite || !output) throw new Error('--sqlite and --output are required')
const workspace = path.resolve(options.get('workspace-root') ?? '.')
const database = openDatabase(path.resolve(sqlite))
const canonicalRows = (rows: ReturnType<typeof parseBisPlayerStatisticHistoryHtml>) => rows.map((row) => ({ ...row, seasonLabel: row.seasonLabel ?? (row.year !== null ? String(row.year) : null) }))
try {
  const profiles = database.prepare(`SELECT player_id,full_name,source_url,fetched_at,year_teams_json,metadata FROM player_profiles ORDER BY player_id`)
    .all() as Array<{ player_id: string; full_name: string; source_url: string; fetched_at: string; year_teams_json: string; metadata: string }>
  if (!profiles.length) throw new Error('No official profiles to verify')
  const sources = []
  let annualRows = 0
  let careerRows = 0
  for (const profile of profiles) {
    const evidence = officialPlayerHistoryEvidenceSchema.parse(JSON.parse(profile.metadata).official_profile_evidence)
    if (evidence.playerId !== profile.player_id || evidence.fullName !== profile.full_name || evidence.sourceUrl !== profile.source_url || evidence.fetchedAt !== profile.fetched_at) throw new Error(`Profile/evidence mismatch: ${profile.player_id}`)
    const rawPath = path.resolve(workspace, 'data', evidence.rawKey)
    if (!rawPath.startsWith(path.join(workspace, 'data', 'raw', 'bis-player-profiles') + path.sep)) throw new Error('Untrusted profile raw key')
    const raw = await readFile(rawPath, 'utf8')
    if (createHash('sha256').update(raw).digest('hex') !== evidence.contentHash) throw new Error(`Profile raw hash mismatch: ${profile.player_id}`)
    const parsed = parseBisPlayerProfileHtml(raw, profile.player_id, profile.source_url)
    if (!parsed || parsed.fullName !== profile.full_name || !isDeepStrictEqual(JSON.parse(parsed.yearTeamsJson), JSON.parse(profile.year_teams_json))) throw new Error(`Profile identity/year membership differs from raw: ${profile.player_id}`)
    if (!isDeepStrictEqual(canonicalRows(parseBisPlayerStatisticHistoryHtml(raw)), canonicalRows(evidence.rows))) throw new Error(`Profile statistic differs from raw: ${profile.player_id}`)
    const careers = verifiedPlayerCareerRows(evidence)
    careerRows += careers.length
    annualRows += evidence.rows.filter((row) => row.scope !== 'career').length
    sources.push({ playerId: profile.player_id, sourceUrl: evidence.sourceUrl, fetchedAt: evidence.fetchedAt,
      basisText: evidence.basisText, contentHash: evidence.contentHash, rawKey: evidence.rawKey, annualRows: evidence.rows.length - careers.length, careerRows: careers.length })
  }
  const result = { verifiedAt: new Date().toISOString(), sqlite: path.resolve(sqlite), profiles: profiles.length, annualRows, careerRows, sources, audit: 'passed', published: false }
  await writeFile(output, JSON.stringify(result, null, 2) + '\n')
  console.log(JSON.stringify({ profiles: profiles.length, annualRows, careerRows, audit: 'passed', published: false, output }))
} finally { database.close() }
