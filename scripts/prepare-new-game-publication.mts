import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { openDatabase, withTransaction } from '../packages/db/src/sqlite'
import { buildNormalizedDelta } from '../packages/db/src/normalized-d1-delta'

// Append a separately captured, normalized game slice without replacing any
// published season or renumbering its dictionaries and source identifiers.
const options = new Map(process.argv.slice(2).map((argument) => {
  const match = /^--([^=]+)=(.+)$/u.exec(argument)
  if (!match) throw new Error('Use --baseline=path --source=path --source-workspace=path --output-dir=path')
  return [match[1]!, match[2]!]
}))
const required = (key: string) => { const value = options.get(key); if (!value) throw new Error(`Missing --${key}`); return path.resolve(value) }
const baseline = required('baseline'), sourceFile = required('source'), workspace = required('source-workspace'), directory = required('output-dir')
await mkdir(directory, { recursive: true })
const candidateFile = path.join(directory, 'candidate.sqlite'), rehearsalFile = path.join(directory, 'rehearsal.sqlite')
if ([candidateFile, rehearsalFile].some((file) => [baseline, sourceFile].includes(file))) throw new Error('Cannot overwrite input databases')
await copyFile(baseline, candidateFile)
await copyFile(baseline, rehearsalFile)
const source = openDatabase(sourceFile), candidate = openDatabase(candidateFile), previous = openDatabase(rehearsalFile)
type Value = string | number | null
type Row = Record<string, Value>
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`
const dictionaries: Record<string, string[]> = { teams: ['team_name'], venues: ['venue_name'], event_types: ['event_type'], event_subtypes: ['event_subtype'],
  result_codes: ['result_text'], person_names: ['name'], positions: ['position'], roster_groups: ['group_label'], source_snapshot_facts: ['game_id', 'source_key'] }
const facts = ['game_facts', 'event_facts', 'batting_line_facts', 'pitching_line_facts', 'roster_entry_facts']
const maps = new Map<string, Map<Value, Value>>()
try {
  const games = source.prepare('SELECT game_id,game_date FROM game_facts ORDER BY game_date,game_id').all() as Array<{ game_id: string; game_date: string }>
  const last = candidate.prepare('SELECT MAX(game_date) date FROM game_facts').get() as { date: string | null }
  if (!games.length || games.some((game) => last.date && game.game_date <= last.date)) throw new Error('Only a new, non-overlapping date slice may be appended')
  const objects = new Map<string, { key: string; sourceFile: string; sha256: string }>()
  const snapshots = source.prepare('SELECT * FROM source_snapshot_facts').all() as Row[]
  for (const snapshot of snapshots) {
    const url = new URL(String(snapshot.source_url))
    const game = games.find((row) => row.game_id === snapshot.game_id)
    if (!game || url.hostname !== 'npb.jp' || !['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid official source/date scope')
    const date = game.game_date.replaceAll('-', '')
    if (!(url.pathname.startsWith(`/scores/${date.slice(0, 4)}/${date.slice(4)}/`) ||
      url.pathname.startsWith(`/bis/eng/${date.slice(0, 4)}/games/s${date}`) || url.pathname.startsWith(`/bis/${date.slice(0, 4)}/games/s${date}`))) throw new Error('Official source date differs from game')
    const sourcePath = snapshot.raw_path ?? snapshot.source_path
    if (!sourcePath) continue // An unavailable detail page is not fabricated.
    const file = path.resolve(workspace, String(sourcePath))
    if (!file.startsWith(path.join(workspace, 'data', 'raw') + path.sep)) throw new Error('Untrusted archived source path')
    const raw = await readFile(file)
    const key = path.relative(path.join(workspace, 'data'), file)
    objects.set(key, { key, sourceFile: file, sha256: createHash('sha256').update(raw).digest('hex') })
    snapshot.raw_path = `data/${key}`
    snapshot.source_path = `data/${key}`
    if (snapshot.structured_path) {
      const structured = path.resolve(workspace, String(snapshot.structured_path))
      if (!structured.startsWith(path.join(workspace, 'data', 'structured') + path.sep)) throw new Error('Untrusted structured source path')
      const bytes = await readFile(structured), structuredKey = path.relative(path.join(workspace, 'data'), structured)
      objects.set(structuredKey, { key: structuredKey, sourceFile: structured, sha256: createHash('sha256').update(bytes).digest('hex') })
      snapshot.structured_path = `data/${structuredKey}`
    }
  }
  withTransaction(candidate, () => {
    for (const [table, naturalKeys] of Object.entries(dictionaries)) {
      const columns = source.prepare(`PRAGMA table_info(${quote(table)})`).all() as Array<{ name: string; pk: number }>
      const primary = columns.find((column) => column.pk)!.name
      const mapping = new Map<Value, Value>()
      const rows = table === 'source_snapshot_facts' ? snapshots : source.prepare(`SELECT * FROM ${quote(table)}`).all() as Row[]
      for (const row of rows) {
        const existing = candidate.prepare(`SELECT ${quote(primary)} id FROM ${quote(table)} WHERE ${naturalKeys.map((key) => `${quote(key)} IS ?`).join(' AND ')}`).get(...naturalKeys.map((key) => row[key]!)) as { id: Value } | undefined
        if (existing) { mapping.set(row[primary]!, existing.id); continue }
        const names = columns.map((column) => column.name).filter((name) => name !== primary)
        const inserted = candidate.prepare(`INSERT INTO ${quote(table)}(${names.map(quote).join(',')}) VALUES (${names.map(() => '?').join(',')}) RETURNING ${quote(primary)} id`).get(...names.map((name) => row[name]!)) as { id: Value }
        mapping.set(row[primary]!, inserted.id)
      }
      maps.set(table, mapping)
    }
    for (const table of facts) {
      const columns = (source.prepare(`PRAGMA table_info(${quote(table)})`).all() as Array<{ name: string }>).map((column) => column.name)
      const foreign = source.prepare(`PRAGMA foreign_key_list(${quote(table)})`).all() as Array<{ table: string; from: string }>
      for (const row of source.prepare(`SELECT * FROM ${quote(table)}`).all() as Row[]) {
        for (const key of foreign) if (row[key.from] !== null && maps.has(key.table)) {
          const mapped = maps.get(key.table)!.get(row[key.from]!)
          if (mapped === undefined) throw new Error(`Missing dictionary identity: ${table}.${key.from}`)
          row[key.from] = mapped
        }
        candidate.prepare(`INSERT INTO ${quote(table)}(${columns.map(quote).join(',')}) VALUES (${columns.map(() => '?').join(',')})`).run(...columns.map((column) => row[column]!))
      }
    }
    if (candidate.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Candidate foreign key verification failed')
  })
  const delta = buildNormalizedDelta(previous, candidate, [...Object.keys(dictionaries), ...facts])
  if (Object.values(delta.changes).some((change) => change.deleted || change.updated)) throw new Error('Appending new games must not modify or delete published rows')
  withTransaction(previous, () => { previous.exec(delta.sql); if (previous.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Rehearsal foreign key verification failed') })
  candidate.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  previous.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  const incomplete = source.prepare("SELECT g.game_id FROM game_facts g WHERE NOT EXISTS (SELECT 1 FROM batting_line_facts b WHERE b.game_id=g.game_id) OR NOT EXISTS (SELECT 1 FROM pitching_line_facts p WHERE p.game_id=g.game_id)").all()
  const manifest = { preparedAt: new Date().toISOString(), baseline, sourceFile, previousGeneration: delta.previousGeneration, generation: delta.generation,
    changes: delta.changes, gameCount: games.length, dateFrom: games[0]!.game_date, dateTo: games.at(-1)!.game_date, incompleteDetailGames: incomplete,
    objects: [...objects.values()], rehearsal: 'passed', published: false }
  await writeFile(path.join(directory, 'publication.sql'), delta.sql)
  await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  console.log(JSON.stringify({ games: games.length, incompleteDetailGames: incomplete.length, changes: delta.changes, objects: objects.size, rehearsal: 'passed', published: false }))
} finally { source.close(); candidate.close(); previous.close() }
