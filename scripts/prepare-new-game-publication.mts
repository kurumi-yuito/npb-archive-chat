import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { openDatabase, withTransaction } from '../packages/db/src/sqlite'
import { buildNormalizedDelta } from '../packages/db/src/normalized-d1-delta'
import { buildRichGameFromBisEngIndex, inspectBisGameOutcome } from '../packages/parser/src/bis-only'
import { matchesGameTeamFilter } from '../packages/db/src/repository/team-name-utils'
import { readKnownGameScore } from '../packages/schemas/src/score-evidence'

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
const allowHistoricalGaps = options.get('allow-historical-gap-slice') === 'true'
const detailAudit = options.get('allow-verified-detail-enrichment') === 'true'
  ? JSON.parse(await readFile(required('detail-audit'), 'utf8')) as { missingDetails: Array<{ gameId: string; date: string; sourceUrl: string; rawFile: string; sha256: string; fetchedAt: string }> } : null
const enrichmentObjects: Array<{ key: string; sourceFile: string; sha256: string }> = []
const repairedGames = new Set<string>(), repairEvidence: unknown[] = []
try {
  const games = source.prepare('SELECT game_id,game_date FROM game_facts ORDER BY game_date,game_id').all() as Array<{ game_id: string; game_date: string }>
  const last = candidate.prepare('SELECT MAX(game_date) date FROM game_facts').get() as { date: string | null }
  if (!games.length || (!allowHistoricalGaps && games.some((game) => last.date && game.game_date <= last.date))) throw new Error('Only a new, non-overlapping date slice may be appended without an explicit captured gap audit')
  for (const game of games) {
    const old = candidate.prepare('SELECT game_date,linescore_json FROM game_facts WHERE game_id=?').get(game.game_id) as { game_date: string; linescore_json: string } | undefined
    if (!old) continue
    if (!allowHistoricalGaps || old.game_date !== game.game_date) throw new Error('Incoming game conflicts with a published identity')
    const oldSource = candidate.prepare("SELECT source_url FROM source_snapshot_facts WHERE game_id=? AND source_key='index'").get(game.game_id) as { source_url: string } | undefined
    const replacement = source.prepare("SELECT source_url FROM source_snapshot_facts WHERE game_id=? AND source_key='index'").get(game.game_id) as { source_url: string } | undefined
    const duplicate = oldSource ? candidate.prepare("SELECT game_id FROM source_snapshot_facts WHERE source_key='index' AND source_url=? AND game_id<>?").all(oldSource.source_url, game.game_id) : []
    const score = JSON.parse(old.linescore_json ?? '{}')
    const placeholder = candidate.prepare(`SELECT COUNT(*) count FROM event_facts e JOIN event_types t ON t.event_type_id=e.event_type_id
      JOIN result_codes r ON r.result_code_id=e.result_code_id WHERE e.game_id=? AND
      (t.event_type<>'game_note' OR r.result_text NOT LIKE 'Play-by-play was not ingested from this source%')`).get(game.game_id) as { count: number }
    const detailCounts = ['batting_line_facts', 'pitching_line_facts', 'roster_entry_facts'].map((table) => (candidate.prepare(`SELECT COUNT(*) count FROM ${table} WHERE game_id=?`).get(game.game_id) as { count: number }).count)
    if (detailAudit) {
      const evidence = detailAudit.missingDetails.filter((item) => item.gameId === game.game_id)
      const oldEvents = candidate.prepare('SELECT COUNT(*) count FROM event_facts WHERE game_id=?').get(game.game_id) as { count: number }
      if (evidence.length !== 1 || !oldSource || oldSource.source_url !== evidence[0]!.sourceUrl || placeholder.count || oldEvents.count !== 1 || detailCounts.some(Boolean)) throw new Error(`Detail enrichment requires an audited score-only fixture: ${game.game_id}`)
      const proof = evidence[0]!, raw = await readFile(proof.rawFile, 'utf8')
      if (proof.date !== game.game_date || !Number.isFinite(Date.parse(proof.fetchedAt)) || createHash('sha256').update(raw).digest('hex') !== proof.sha256 || inspectBisGameOutcome(raw).status !== 'completed') throw new Error('Detail enrichment source evidence changed')
      const parsed = buildRichGameFromBisEngIndex({ year: Number(game.game_date.slice(0, 4)), mmdd: game.game_date.slice(5).replace('-', ''), gameId: game.game_id }, { indexHtml: raw, indexPath: proof.rawFile }, proof.fetchedAt)
      if (parsed.game_meta.canonical_url !== proof.sourceUrl) throw new Error('Detail enrichment official URL mismatch')
      const incoming = source.prepare(`SELECT g.linescore_json,home.team_name home,away.team_name away FROM game_facts g JOIN teams home ON home.team_id=g.home_team_id JOIN teams away ON away.team_id=g.away_team_id WHERE g.game_id=?`).get(game.game_id) as { linescore_json: string; home: string; away: string }
      const newScore = readKnownGameScore(incoming.linescore_json), originalScore = readKnownGameScore(old.linescore_json), official = readKnownGameScore(JSON.stringify(parsed.top_summary.linescore))
      if (!newScore || !originalScore || !official) throw new Error('Detail enrichment lacks a verified final score')
      for (const side of ['home', 'away'] as const) {
        const name = side === 'home' ? parsed.game_meta.home_team.name : parsed.game_meta.away_team.name
        if (!matchesGameTeamFilter(name, incoming[side]) && !matchesGameTeamFilter(incoming[side], name)) throw new Error('Detail enrichment changed a fixture club')
        const scoreField = side === 'home' ? 'homeRuns' : 'awayRuns'
        if (originalScore[scoreField] !== official[scoreField] || newScore[scoreField] !== official[scoreField]) throw new Error(`Detail enrichment disagrees with official final score: ${game.game_id}`)
      }
      if (['batting_line_facts', 'pitching_line_facts', 'roster_entry_facts'].some((table) => !(source.prepare(`SELECT COUNT(*) count FROM ${table} WHERE game_id=?`).get(game.game_id) as { count: number }).count)) throw new Error('Detail enrichment is still incomplete')
      const proofKey = `raw/bis-game-outcomes/${game.game_date.slice(0, 4)}/${proof.sha256}.html`
      enrichmentObjects.push({ key: proofKey, sourceFile: proof.rawFile, sha256: proof.sha256 })
      repairedGames.add(game.game_id)
      repairEvidence.push({ gameId: game.game_id, previousSource: oldSource.source_url, replacementSource: replacement?.source_url,
        reason: 'Verified completed official score-only fixture enriched with matching score and clubs; no previous played facts', sourceUrl: proof.sourceUrl, fetchedAt: proof.fetchedAt, sha256: proof.sha256, rawKey: proofKey,
        previousScoreHash: createHash('sha256').update(old.linescore_json).digest('hex') })
      continue
    }
    if (!oldSource || !replacement || replacement.source_url === oldSource.source_url || !duplicate.length || placeholder.count || detailCounts.some(Boolean) ||
      score.away?.totals?.runs !== 0 || score.home?.totals?.runs !== 0 || score.away?.innings?.length !== 0 || score.home?.innings?.length !== 0) {
      throw new Error(`Existing game is not a provably duplicated empty source placeholder: ${game.game_id}`)
    }
    repairedGames.add(game.game_id)
    repairEvidence.push({ gameId: game.game_id, previousSource: oldSource.source_url, replacementSource: replacement.source_url, duplicateSourceGames: duplicate,
      reason: 'Published placeholder points to another official fixture and has no played facts', previousScoreHash: createHash('sha256').update(old.linescore_json).digest('hex') })
  }
  const objects = new Map<string, { key: string; sourceFile: string; sha256: string }>()
  for (const object of enrichmentObjects) objects.set(object.key, object)
  const snapshots = source.prepare('SELECT * FROM source_snapshot_facts').all() as Row[]
  for (const snapshot of snapshots) {
    const url = new URL(String(snapshot.source_url))
    const game = games.find((row) => row.game_id === snapshot.game_id)
    if (!game || url.hostname !== 'npb.jp' || !['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid official source/date scope')
    const date = game.game_date.replaceAll('-', '')
    if (!(url.pathname.startsWith(`/scores/${date.slice(0, 4)}/${date.slice(4)}/`) ||
      new RegExp(`^/bis/(?:eng/)?${date.slice(0, 4)}/games/f?s${date}\\d+\\.html$`, 'u').test(url.pathname))) throw new Error('Official source date differs from game')
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
        if (existing) {
          if (table === 'source_snapshot_facts' && repairedGames.has(String(row.game_id))) {
            const names = columns.map((column) => column.name).filter((name) => name !== primary)
            candidate.prepare(`UPDATE ${quote(table)} SET ${names.map((name) => `${quote(name)}=?`).join(',')} WHERE ${quote(primary)}=?`).run(...names.map((name) => row[name]!), existing.id)
          }
          mapping.set(row[primary]!, existing.id); continue
        }
        const names = columns.map((column) => column.name).filter((name) => name !== primary)
        const inserted = candidate.prepare(`INSERT INTO ${quote(table)}(${names.map(quote).join(',')}) VALUES (${names.map(() => '?').join(',')}) RETURNING ${quote(primary)} id`).get(...names.map((name) => row[name]!)) as { id: Value }
        mapping.set(row[primary]!, inserted.id)
      }
      maps.set(table, mapping)
    }
    for (const table of facts) {
      const info = source.prepare(`PRAGMA table_info(${quote(table)})`).all() as Array<{ name: string; pk: number }>
      const columns = info.map((column) => column.name), primary = info.filter((column) => column.pk).sort((a, b) => a.pk - b.pk).map((column) => column.name)
      const foreign = source.prepare(`PRAGMA foreign_key_list(${quote(table)})`).all() as Array<{ table: string; from: string }>
      for (const row of source.prepare(`SELECT * FROM ${quote(table)}`).all() as Row[]) {
        for (const key of foreign) if (row[key.from] !== null && maps.has(key.table)) {
          const mapped = maps.get(key.table)!.get(row[key.from]!)
          if (mapped === undefined) throw new Error(`Missing dictionary identity: ${table}.${key.from}`)
          row[key.from] = mapped
        }
        const present = candidate.prepare(`SELECT 1 FROM ${quote(table)} WHERE ${primary.map((name) => `${quote(name)} IS ?`).join(' AND ')}`).get(...primary.map((name) => row[name]!))
        if (present && !repairedGames.has(String(row.game_id))) throw new Error('Historical capture would overwrite an unapproved fact')
        const updates = columns.filter((name) => !primary.includes(name))
        candidate.prepare(`INSERT INTO ${quote(table)}(${columns.map(quote).join(',')}) VALUES (${columns.map(() => '?').join(',')})
          ON CONFLICT(${primary.map(quote).join(',')}) DO UPDATE SET ${updates.map((name) => `${quote(name)}=excluded.${quote(name)}`).join(',')}`).run(...columns.map((column) => row[column]!))
      }
    }
    if (candidate.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Candidate foreign key verification failed')
  })
  const delta = buildNormalizedDelta(previous, candidate, [...Object.keys(dictionaries), ...facts])
  if (Object.values(delta.changes).some((change) => change.deleted || (!allowHistoricalGaps && change.updated))) throw new Error('Publication must not delete rows or modify unapproved existing facts')
  withTransaction(previous, () => { previous.exec(delta.sql); if (previous.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Rehearsal foreign key verification failed') })
  candidate.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  previous.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  const incomplete = source.prepare("SELECT g.game_id FROM game_facts g WHERE NOT EXISTS (SELECT 1 FROM batting_line_facts b WHERE b.game_id=g.game_id) OR NOT EXISTS (SELECT 1 FROM pitching_line_facts p WHERE p.game_id=g.game_id)").all()
  const manifest = { preparedAt: new Date().toISOString(), baseline, sourceFile, previousGeneration: delta.previousGeneration, generation: delta.generation,
    changes: delta.changes, gameCount: games.length, dateFrom: games[0]!.game_date, dateTo: games.at(-1)!.game_date, incompleteDetailGames: incomplete,
    objects: [...objects.values()], repairEvidence, rehearsal: 'passed', published: false }
  await writeFile(path.join(directory, 'publication.sql'), delta.sql)
  await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  console.log(JSON.stringify({ games: games.length, incompleteDetailGames: incomplete.length, changes: delta.changes, objects: objects.size, rehearsal: 'passed', published: false }))
} finally { source.close(); candidate.close(); previous.close() }
