import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const args = new Map()
for (let index = 2; index < process.argv.length; index += 2) args.set(process.argv[index], process.argv[index + 1])
const sqlitePath = args.get('--sqlite')
const outputPath = args.get('--output')
if (!sqlitePath || !outputPath) throw new Error('Usage: audit-player-identity-coverage --sqlite <path> --output <path>')

const normalizeName = (value) => String(value ?? '').normalize('NFKC')
  .replace(/﨑/gu, '崎').replace(/髙/gu, '高').replace(/濵/gu, '浜')
  .replace(/^[*＊+＋]+/u, '').replace(/[・･.\-_\s\u3000]/gu, '').toLowerCase()
const playerIdFromUrl = (value) => String(value ?? '').match(/\/players\/(\d{8})\.html/u)?.[1] ?? null

const database = new DatabaseSync(path.resolve(sqlitePath), { readOnly: true })
try {
  const profiles = database.prepare(
    `SELECT player_id, COALESCE(canonical_name, full_name) AS name FROM player_profiles
      WHERE player_id IS NOT NULL AND player_id <> ''`,
  ).all().map((row) => ({ playerId: String(row.player_id), name: String(row.name ?? ''), key: normalizeName(row.name) }))
  const unresolved = database.prepare(
    `SELECT pitching_lines.pitcher_name AS name, pitching_lines.team, COUNT(*) AS row_count,
            MAX(games.date) AS latest_date
       FROM pitching_lines INNER JOIN games ON games.game_id = pitching_lines.game_id
      WHERE pitching_lines.pitcher_name IS NOT NULL AND pitching_lines.pitcher_name <> ''
        AND (pitching_lines.pitcher_url IS NULL OR pitching_lines.pitcher_url = '')
      GROUP BY pitching_lines.pitcher_name, pitching_lines.team
      ORDER BY latest_date DESC, row_count DESC, name`,
  ).all()
  const sampleGames = database.prepare(
    `SELECT pitching_lines.game_id, games.date FROM pitching_lines
      INNER JOIN games ON games.game_id = pitching_lines.game_id
      WHERE pitching_lines.pitcher_name = ? AND pitching_lines.team = ?
        AND (pitching_lines.pitcher_url IS NULL OR pitching_lines.pitcher_url = '')
      ORDER BY games.date DESC, pitching_lines.game_id DESC LIMIT 3`,
  )
  const gameCandidates = database.prepare(
    `SELECT player_name AS name, player_url AS url FROM batting_lines WHERE game_id = ? AND player_url IS NOT NULL AND player_url <> ''
     UNION ALL SELECT pitcher_name, pitcher_url FROM pitching_lines WHERE game_id = ? AND pitcher_url IS NOT NULL AND pitcher_url <> ''
     UNION ALL SELECT player_name, player_url FROM roster_entries WHERE game_id = ? AND player_url IS NOT NULL AND player_url <> ''`,
  )
  const groups = unresolved.map((row) => {
    const key = normalizeName(row.name)
    return {
      name: String(row.name), team: String(row.team), row_count: Number(row.row_count), latest_date: String(row.latest_date),
      profile_candidates: profiles.filter((profile) => profile.key === key || (key.length >= 2 && profile.key.startsWith(key)))
        .map((profile) => ({ player_id: profile.playerId, name: profile.name })),
      sample_games: sampleGames.all(row.name, row.team).map((game) => ({
        game_id: String(game.game_id), date: String(game.date),
        candidates: gameCandidates.all(game.game_id, game.game_id, game.game_id)
          .map((candidate) => ({ name: String(candidate.name ?? ''), player_id: playerIdFromUrl(candidate.url) }))
          .filter((candidate) => candidate.player_id && (normalizeName(candidate.name) === key || normalizeName(candidate.name).startsWith(key) || key.startsWith(normalizeName(candidate.name)))),
      })),
    }
  })
  const report = { sqlite: path.basename(sqlitePath), generated_at: new Date().toISOString(), unresolved_pitching_groups: groups.length, groups }
  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`)
  process.stdout.write(`${outputPath}\n`)
} finally {
  database.close()
}
