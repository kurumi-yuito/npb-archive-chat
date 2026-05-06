import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const { DatabaseSync } = require('node:sqlite')

const dbPath = path.resolve(process.argv[2] ?? 'data/npb-2025.sqlite')
const db = new DatabaseSync(dbPath)

const q = (sql) => db.prepare(sql).get()

const stats = {
  games_2025: q('SELECT COUNT(*) AS c FROM games WHERE year = 2025').c,
  events: q('SELECT COUNT(*) AS c FROM events').c,
  batting_lines: q('SELECT COUNT(*) AS c FROM batting_lines').c,
  pitching_lines: q('SELECT COUNT(*) AS c FROM pitching_lines').c,
  roster_entries: q('SELECT COUNT(*) AS c FROM roster_entries').c,
  games_2025_zero_events: q(`
    SELECT COUNT(*) AS c FROM games g
    WHERE g.year = 2025
    AND NOT EXISTS (SELECT 1 FROM events e WHERE e.game_id = g.game_id)
  `).c,
  games_2025_with_events: q(`
    SELECT COUNT(*) AS c FROM games g
    WHERE g.year = 2025
    AND EXISTS (SELECT 1 FROM events e WHERE e.game_id = g.game_id)
  `).c,
}

console.log(JSON.stringify(stats, null, 2))
db.close()
