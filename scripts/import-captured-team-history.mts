import { createHash } from 'node:crypto'
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { BIS_TEAMS } from '../packages/db/src/bis-current'
import { openDatabase } from '../packages/db/src/sqlite'
import { migrateDatabase } from '../packages/db/src/migrations'
import { createObjectStorage } from '../packages/db/src/object-storage'
import { saveOfficialTeamHistoryCapture } from '../packages/db/src/official-team-history'

const options = new Map(process.argv.slice(2).map((argument) => {
  const equal = argument.indexOf('=')
  if (!argument.startsWith('--') || equal < 0) throw new Error('Use --capture-directory=path --sqlite=path --output=path [--workspace-root=path]')
  return [argument.slice(2, equal), argument.slice(equal + 1)]
}))
const required = (key: string) => { const value = options.get(key); if (!value) throw new Error(`Missing --${key}`); return path.resolve(value) }
const directory = required('capture-directory'), sqlite = required('sqlite'), output = required('output'), workspace = path.resolve(options.get('workspace-root') ?? '.')
type Source = { teamId: string; url: string; rawFile: string; discoveryFile: string; discoveryHash: string; fetchedAt: string; contentHash: string; rows: Array<Record<string, string>> }
const audit = JSON.parse(await readFile(path.join(directory, 'independent-audit.json'), 'utf8')) as { sources: Source[] }
if (audit.sources.length !== BIS_TEAMS.length || new Set(audit.sources.map((source) => source.teamId)).size !== BIS_TEAMS.length) throw new Error('All official club captures are required')
const digest = (text: string) => createHash('sha256').update(text).digest('hex')
const database = openDatabase(sqlite), storage = createObjectStorage({ mode: 'local', workspaceRoot: workspace })
try {
  migrateDatabase(database)
  const captures = []
  for (const source of audit.sources) {
    const team = BIS_TEAMS.find((team) => team.teamId === source.teamId)
    if (!team) throw new Error('Unknown official club ID')
    const html = await readFile(source.rawFile, 'utf8'), index = await readFile(path.resolve(workspace, source.discoveryFile), 'utf8')
    if (digest(html) !== source.contentHash || digest(index) !== source.discoveryHash) throw new Error('Captured team history/discovery hash mismatch')
    const discoveries: Array<{ url: string; fetchedAt: string; rawPath: string; contentHash: string }> = []
    const discoveryYear = source.discoveryFile.replaceAll('\\', '/').match(/\/bis\/(\d{4})\/index_[a-z]+\//u)?.[1]
    if (!discoveryYear) throw new Error('Discovery archive has no observed roster year')
    const rosterDirectory = path.join(workspace, 'data/structured/bis', discoveryYear, `rst_${team.teamId}`)
    for (const file of await readdir(rosterDirectory)) {
      if (!file.endsWith('.json')) continue
      const sidecar = JSON.parse(await readFile(path.join(rosterDirectory, file), 'utf8'))
      const found = sidecar.discovery
      if (found?.url === `https://npb.jp/bis/teams/index_${team.teamId}.html` && found.contentHash === source.discoveryHash &&
        path.resolve(workspace, found.rawPath) === path.resolve(workspace, source.discoveryFile) && Number.isFinite(Date.parse(found.fetchedAt))) discoveries.push(found)
    }
    const discovery = discoveries.sort((left, right) => left.fetchedAt.localeCompare(right.fetchedAt))[0]
    if (!discovery) throw new Error('Original index capture timestamp/provenance is unavailable')
    const targetYear = Math.max(...source.rows.map((row) => Number(row.年度.slice(0, 4))))
    const result = await saveOfficialTeamHistoryCapture({ database, storage, team, targetYear, sourceUrl: source.url, html, fetchedAt: source.fetchedAt,
      discovery: { url: discovery.url, fetchedAt: discovery.fetchedAt, html: index } })
    if (!isDeepStrictEqual(result.rows.map((row) => row.metrics), source.rows)) throw new Error('Application parser and independent captured-table audit disagree')
    captures.push(result)
  }
  const objects = []
  for (const capture of captures) for (const key of [capture.rawKey, capture.structuredKey, capture.discovery.rawKey]) {
    const file = path.join(workspace, 'data', key), body = await readFile(file)
    objects.push({ key, sourceFile: file, sha256: createHash('sha256').update(body).digest('hex'), bytes: body.length })
  }
  await mkdir(path.dirname(output), { recursive: true })
  await writeFile(output, JSON.stringify({ sqlite, snapshots: captures.length, rows: captures.reduce((sum, capture) => sum + capture.rows.length, 0),
    sources: captures.map(({ rows, ...source }) => ({ ...source, rowCount: rows.length })), objects, audit: 'passed', published: false }, null, 2) + '\n')
  console.log(JSON.stringify({ snapshots: captures.length, rows: captures.reduce((sum, capture) => sum + capture.rows.length, 0), audit: 'passed', published: false, output }))
} finally { database.close() }
