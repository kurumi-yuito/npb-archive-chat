import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { openDatabase, withTransaction } from '../packages/db/src/sqlite'
import { sqliteDatabaseToQuery } from '../packages/db/src/query-driver'
import { createObjectStorage } from '../packages/db/src/object-storage'
import { verifyOfficialCalendarArchive } from '../packages/db/src/official-calendar'
import { buildNormalizedDelta, readSyncGeneration } from '../packages/db/src/normalized-d1-delta'
import { searchOfficialTeamSeasons } from '../packages/db/src/repository/official-team-history-repository'

const options = new Map(process.argv.slice(2).map((argument) => {
  const equal = argument.indexOf('=')
  if (!argument.startsWith('--') || equal < 0) throw new Error('Use --baseline=path --capture-root=path --output-dir=path')
  return [argument.slice(2, equal), argument.slice(equal + 1)]
}))
function required(key: string) {
  const value = options.get(key)
  if (!value) throw new Error(`Missing --${key}`)
  return path.resolve(value)
}
const baseline = required('baseline')
const captureRoot = required('capture-root')
const directory = required('output-dir')
const workspace = path.resolve(options.get('workspace-root') ?? '.')
const sourceFile = path.join(captureRoot, 'calendar.sqlite')
const sourceStorage = createObjectStorage({ workspaceRoot: captureRoot, mode: 'local' })
const storage = createObjectStorage({ workspaceRoot: workspace, mode: 'local' })
const source = new DatabaseSync(sourceFile, { readOnly: true })
try {
  const archive = await verifyOfficialCalendarArchive(source, sourceStorage)
  if (!archive.observations) throw new Error('Calendar archive contains no verified observations')
  const objects = []
  for (const object of archive.objects) {
    const text = await sourceStorage.getText(object.key)
    const existing = await storage.getText(object.key)
    if (text === null || (existing !== null && existing !== text)) throw new Error('Immutable calendar publication object conflict')
    if (existing === null) await storage.putText(object.key, text)
    objects.push({ ...object, sourceFile: storage.localPath(object.key) })
  }
  await mkdir(directory, { recursive: true })
  const candidateFile = path.join(directory, 'candidate.sqlite')
  const rehearsalFile = path.join(directory, 'rehearsal.sqlite')
  for (const file of [candidateFile, rehearsalFile]) {
    if ([baseline, sourceFile].includes(file)) throw new Error('Publication output cannot overwrite an input')
    try {
      await stat(file)
      throw new Error('Publication output already exists; select a fresh output directory')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  const original = new DatabaseSync(baseline, { readOnly: true })
  let baselineGeneration: string
  try {
    baselineGeneration = readSyncGeneration(original)
    for (const file of [candidateFile, rehearsalFile]) original.prepare('VACUUM INTO ?').run(file)
    if (readSyncGeneration(original) !== baselineGeneration) throw new Error('Baseline generation changed during snapshot creation')
  } finally {
    original.close()
  }
  const candidate = openDatabase(candidateFile)
  const rehearsal = openDatabase(rehearsalFile)
  try {
    if (readSyncGeneration(candidate) !== baselineGeneration || readSyncGeneration(rehearsal) !== baselineGeneration) throw new Error('Publication snapshots have different baseline generations')
    candidate.exec(await readFile(path.join(workspace, 'packages/db/migrations-normalized/0008_official_calendar.sql'), 'utf8'))
    candidate.exec(`ATTACH DATABASE '${sourceFile.replaceAll("'", "''")}' AS calendar_source`)
    const rows = source.prepare('SELECT * FROM official_calendar_observations ORDER BY observation_id').all()
    withTransaction(candidate, () => {
      candidate.exec('INSERT OR IGNORE INTO official_calendar_observations SELECT * FROM calendar_source.official_calendar_observations')
      for (const row of rows) {
        const actual = candidate.prepare('SELECT * FROM official_calendar_observations WHERE observation_id=?').get(row.observation_id)
        if (!actual || !isDeepStrictEqual({ ...actual }, { ...row })) throw new Error('Immutable calendar observation conflicts with baseline')
      }
    })
    candidate.exec('DETACH DATABASE calendar_source')
    const delta = buildNormalizedDelta(rehearsal, candidate, ['official_calendar_observations'])
    if (delta.changes.official_calendar_observations!.updated || delta.changes.official_calendar_observations!.deleted) throw new Error('Calendar publication must preserve previous observations')
    withTransaction(rehearsal, () => {
      rehearsal.exec(delta.sql)
      const expected = candidate.prepare('SELECT * FROM official_calendar_observations ORDER BY observation_id').all()
      const actual = rehearsal.prepare('SELECT * FROM official_calendar_observations ORDER BY observation_id').all()
      if (!isDeepStrictEqual(actual, expected) || rehearsal.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Calendar publication rehearsal differs from candidate')
    })
    const verified = await verifyOfficialCalendarArchive(rehearsal, storage)
    const query = sqliteDatabaseToQuery(rehearsal)
    const years = [...new Set(rows.filter((row) => row.source_kind === 'season').map((row) => Number(row.year)))]
    const teamChecks = []
    for (const year of years) {
      for (const league of ['セ・リーグ', 'パ・リーグ']) {
        const teams = await searchOfficialTeamSeasons(query, { year, team: league, date_from: `${year}-01-01`, date_to: `${year}-12-31` })
        if (teams.length !== 6) throw new Error('Calendar and official club histories do not establish the same complete season')
        teamChecks.push({ year, league, verifiedClubs: teams.length })
      }
    }
    await writeFile(path.join(directory, 'publication.sql'), delta.sql)
    const receipt = { published: false, audit: 'passed', previousGeneration: delta.previousGeneration, generation: delta.generation,
      changes: delta.changes, sqlSha256: createHash('sha256').update(delta.sql).digest('hex'),
      observations: verified.observations, objects, teamChecks, sourceFile, candidateFile, rehearsalFile }
    await writeFile(path.join(directory, 'publication-receipt.json'), JSON.stringify(receipt, null, 2) + '\n')
    console.log(JSON.stringify({ previousGeneration: delta.previousGeneration, generation: delta.generation, changes: delta.changes, teamChecks }))
  } finally {
    candidate.close()
    rehearsal.close()
  }
} finally {
  source.close()
}
