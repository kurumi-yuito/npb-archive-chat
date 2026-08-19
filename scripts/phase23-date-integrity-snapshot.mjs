import { DatabaseSync } from 'node:sqlite'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const args = process.argv.slice(2)
const sqlitePath = readArg('--sqlite')
const date = readArg('--date')
const stage = readArg('--stage')
const output = readArg('--output')

if (!sqlitePath || !date || !stage || !output) {
  throw new Error('Usage: node scripts/phase23-date-integrity-snapshot.mjs --sqlite <path> --date YYYY-MM-DD --stage <name> --output <path>')
}

const database = new DatabaseSync(sqlitePath, { readOnly: true })
let counts
try {
  counts = {
    games: count('SELECT COUNT(*) AS count FROM games WHERE date = ?'),
    events: count('SELECT COUNT(*) AS count FROM events INNER JOIN games ON games.game_id = events.game_id WHERE games.date = ?'),
    batting: count('SELECT COUNT(*) AS count FROM batting_lines INNER JOIN games ON games.game_id = batting_lines.game_id WHERE games.date = ?'),
    pitching: count('SELECT COUNT(*) AS count FROM pitching_lines INNER JOIN games ON games.game_id = pitching_lines.game_id WHERE games.date = ?'),
    roster: count('SELECT COUNT(*) AS count FROM roster_entries INNER JOIN games ON games.game_id = roster_entries.game_id WHERE games.date = ?'),
  }
} finally {
  database.close()
}

const snapshot = { stage, sqlitePath, date, counts }
await mkdir(path.dirname(output), { recursive: true })
await writeFile(output, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')
process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`)

function count(sql) {
  return Number(database.prepare(sql).get(date).count)
}

function readArg(name) {
  const index = args.indexOf(name)
  if (index >= 0) return args[index + 1]
  const inline = args.find((arg) => arg.startsWith(`${name}=`))
  return inline?.slice(name.length + 1)
}
