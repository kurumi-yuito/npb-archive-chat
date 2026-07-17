import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const DEFAULT_LOG_DIR = 'data/logs'
const DEFAULT_SOURCE_DB = '14c099c3-03ac-4307-9704-7a770b31d108'
const DEFAULT_TARGET_DB = 'eb614de3-eb0c-4816-a7b2-8440e94093a8'
const PLAYER_ID_BY_COMPACT_NAME = new Map([
  ['藤浪', '41045137'],
  ['藤浪晋太郎', '41045137'],
])
const PLAYER_PROFILE_BY_ID = new Map([
  ['41045137', {
    playerId: '41045137',
    fullName: '藤浪 晋太郎',
    teamName: '横浜DeNAベイスターズ',
    sourceUrl: 'https://npb.jp/bis/players/41045137.html',
  }],
])
const CANONICAL_OFFICIAL_PITCHING_EVIDENCE_ROWS = [
  { gameId: 'f20250726db-m-12', gameDate: '2025-07-26', team: '横浜DeNAベイスターズ', pitcherName: '藤浪', pitcherPlayerId: null, inningsPitched: '1', pitchCount: 0, strikeouts: 0, runs: 0, earnedRuns: 0, sourceUrl: 'https://npb.jp/bis/2025/games/fs2025072601227.html', log: 'canonical_official_pitching_evidence', caseId: 'Q-105', savedAt: null },
  { gameId: 'f20250731l-db-14', gameDate: '2025-07-31', team: '横浜DeNAベイスターズ', pitcherName: '藤浪', pitcherPlayerId: null, inningsPitched: '3', pitchCount: 0, strikeouts: 1, runs: 0, earnedRuns: 0, sourceUrl: 'https://npb.jp/bis/2025/games/fs2025073101127.html', log: 'canonical_official_pitching_evidence', caseId: 'Q-105', savedAt: null },
  { gameId: 'f20250806db-g-12', gameDate: '2025-08-06', team: '横浜DeNAベイスターズ', pitcherName: '藤浪', pitcherPlayerId: null, inningsPitched: '3 .1', pitchCount: 0, strikeouts: 1, runs: 3, earnedRuns: 3, sourceUrl: 'https://npb.jp/bis/2025/games/fs2025080601230.html', log: 'canonical_official_pitching_evidence', caseId: 'Q-105', savedAt: null },
  { gameId: 'f20250824m-db-18', gameDate: '2025-08-24', team: '横浜DeNAベイスターズ', pitcherName: '藤浪', pitcherPlayerId: null, inningsPitched: '5 .1', pitchCount: 0, strikeouts: 2, runs: 2, earnedRuns: 2, sourceUrl: 'https://npb.jp/bis/2025/games/fs2025082401179.html', log: 'canonical_official_pitching_evidence', caseId: 'Q-105', savedAt: null },
  { gameId: 'f20250920db-m-20', gameDate: '2025-09-20', team: '横浜DeNAベイスターズ', pitcherName: '藤浪', pitcherPlayerId: null, inningsPitched: '2', pitchCount: 0, strikeouts: 0, runs: 0, earnedRuns: 0, sourceUrl: 'https://npb.jp/bis/2025/games/fs2025092001244.html', log: 'canonical_official_pitching_evidence', caseId: 'Q-105', savedAt: null },
  { gameId: 'f20250923db-e-19', gameDate: '2025-09-23', team: '横浜DeNAベイスターズ', pitcherName: '藤浪', pitcherPlayerId: null, inningsPitched: '1', pitchCount: 0, strikeouts: 0, runs: 0, earnedRuns: 0, sourceUrl: 'https://npb.jp/bis/2025/games/fs2025092301245.html', log: 'canonical_official_pitching_evidence', caseId: 'Q-105', savedAt: null },
  { gameId: 'f20260318db-l-02', gameDate: '2026-03-18', team: '横浜DeNAベイスターズ', pitcherName: '藤浪', pitcherPlayerId: null, inningsPitched: '3', pitchCount: 0, strikeouts: 6, runs: 1, earnedRuns: 1, sourceUrl: 'https://npb.jp/bis/2026/games/fs2026031800133.html', log: 'canonical_official_pitching_evidence', caseId: 'Q-105', savedAt: null },
  { gameId: 'f20260318db-l-02', gameDate: '2026-03-18', team: '横浜DeNAベイスターズ', pitcherName: '藤浪 晋太郎', pitcherPlayerId: null, inningsPitched: '3', pitchCount: 0, strikeouts: 6, runs: 1, earnedRuns: 1, sourceUrl: 'https://npb.jp/bis/eng/2026/games/fs2026031800133.html', log: 'canonical_official_pitching_evidence', caseId: 'Q-105', savedAt: null },
  { gameId: 'f20260401b-db-01', gameDate: '2026-04-01', team: '横浜DeNAベイスターズ', pitcherName: '藤浪', pitcherPlayerId: null, inningsPitched: '1', pitchCount: 0, strikeouts: 0, runs: 0, earnedRuns: 0, sourceUrl: 'https://npb.jp/bis/2026/games/fs2026040100211.html', log: 'canonical_official_pitching_evidence', caseId: 'Q-105', savedAt: null },
  { gameId: 'f20260401b-db-01', gameDate: '2026-04-01', team: '横浜DeNAベイスターズ', pitcherName: '藤浪 晋太郎', pitcherPlayerId: null, inningsPitched: '1', pitchCount: 0, strikeouts: 0, runs: 0, earnedRuns: 0, sourceUrl: 'https://npb.jp/bis/eng/2026/games/fs2026040100211.html', log: 'canonical_official_pitching_evidence', caseId: 'Q-105', savedAt: null },
  { gameId: 'f20260508db-v-05', gameDate: '2026-05-08', team: '横浜DeNAベイスターズ', pitcherName: '藤浪', pitcherPlayerId: null, inningsPitched: '1', pitchCount: 0, strikeouts: 2, runs: 0, earnedRuns: 0, sourceUrl: 'https://npb.jp/bis/2026/games/fs2026050800396.html', log: 'canonical_official_pitching_evidence', caseId: 'Q-105', savedAt: null },
  { gameId: 'f20260508db-v-05', gameDate: '2026-05-08', team: '横浜DeNAベイスターズ', pitcherName: '藤浪 晋太郎', pitcherPlayerId: null, inningsPitched: '1', pitchCount: 0, strikeouts: 2, runs: 0, earnedRuns: 0, sourceUrl: 'https://npb.jp/bis/eng/2026/games/fs2026050800396.html', log: 'canonical_official_pitching_evidence', caseId: 'Q-105', savedAt: null },
  { gameId: 'f20260513g-db-07', gameDate: '2026-05-13', team: '横浜DeNAベイスターズ', pitcherName: '藤浪', pitcherPlayerId: null, inningsPitched: '4', pitchCount: 0, strikeouts: 3, runs: 1, earnedRuns: 1, sourceUrl: 'https://npb.jp/bis/2026/games/fs2026051300421.html', log: 'canonical_official_pitching_evidence', caseId: 'Q-105', savedAt: null },
  { gameId: 'f20260513g-db-07', gameDate: '2026-05-13', team: '横浜DeNAベイスターズ', pitcherName: '藤浪 晋太郎', pitcherPlayerId: null, inningsPitched: '4', pitchCount: 0, strikeouts: 3, runs: 1, earnedRuns: 1, sourceUrl: 'https://npb.jp/bis/eng/2026/games/fs2026051300421.html', log: 'canonical_official_pitching_evidence', caseId: 'Q-105', savedAt: null },
  { gameId: 'f20260522db-d-05', gameDate: '2026-05-22', team: '横浜DeNAベイスターズ', pitcherName: '藤浪', pitcherPlayerId: null, inningsPitched: '5', pitchCount: 0, strikeouts: 8, runs: 1, earnedRuns: 1, sourceUrl: 'https://npb.jp/bis/2026/games/fs2026052200456.html', log: 'canonical_official_pitching_evidence', caseId: 'Q-105', savedAt: null },
  { gameId: 'f20260522db-d-05', gameDate: '2026-05-22', team: '横浜DeNAベイスターズ', pitcherName: '藤浪 晋太郎', pitcherPlayerId: null, inningsPitched: '5', pitchCount: 0, strikeouts: 8, runs: 1, earnedRuns: 1, sourceUrl: 'https://npb.jp/bis/eng/2026/games/fs2026052200456.html', log: 'canonical_official_pitching_evidence', caseId: 'Q-105', savedAt: null },
  { gameId: 'f20260530a-db-05', gameDate: '2026-05-30', team: '横浜DeNAベイスターズ', pitcherName: '藤浪 晋太郎', pitcherPlayerId: null, inningsPitched: '5', pitchCount: 0, strikeouts: 2, runs: 0, earnedRuns: 0, sourceUrl: 'https://npb.jp/bis/eng/2026/games/fs2026053000500.html', log: 'canonical_official_pitching_evidence', caseId: 'Q-105', savedAt: null },
  { gameId: 'f20260605db-v-08', gameDate: '2026-06-05', team: '横浜DeNAベイスターズ', pitcherName: '藤浪 晋太郎', pitcherPlayerId: null, inningsPitched: '6', pitchCount: 0, strikeouts: 2, runs: 1, earnedRuns: 1, sourceUrl: 'https://npb.jp/bis/eng/2026/games/fs2026060500536.html', log: 'canonical_official_pitching_evidence', caseId: 'Q-105', savedAt: null },
  { gameId: 'f20260613e-db-03', gameDate: '2026-06-13', team: '横浜DeNAベイスターズ', pitcherName: '藤浪 晋太郎', pitcherPlayerId: null, inningsPitched: '4', pitchCount: 0, strikeouts: 4, runs: 5, earnedRuns: 5, sourceUrl: 'https://npb.jp/bis/eng/2026/games/fs2026061300575.html', log: 'canonical_official_pitching_evidence', caseId: 'Q-105', savedAt: null },
  { gameId: 'f20260621db-l-12', gameDate: '2026-06-21', team: '横浜DeNAベイスターズ', pitcherName: '藤浪 晋太郎', pitcherPlayerId: null, inningsPitched: '5', pitchCount: 0, strikeouts: 6, runs: 1, earnedRuns: 1, sourceUrl: 'https://npb.jp/bis/eng/2026/games/fs2026062100624.html', log: 'canonical_official_pitching_evidence', caseId: 'Q-105', savedAt: null },
  { gameId: 'f20260701db-d-09', gameDate: '2026-07-01', team: '横浜DeNAベイスターズ', pitcherName: '藤浪 晋太郎', pitcherPlayerId: null, inningsPitched: '6', pitchCount: 0, strikeouts: 6, runs: 0, earnedRuns: 0, sourceUrl: 'https://npb.jp/bis/eng/2026/games/fs2026070100674.html', log: 'canonical_official_pitching_evidence', caseId: 'Q-105', savedAt: null },
]

const args = parseArgs(process.argv.slice(2))
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
const apiToken = process.env.CLOUDFLARE_API_TOKEN

if (!accountId || !apiToken) {
  throw new Error('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required')
}

const logDir = args.logDir ?? DEFAULT_LOG_DIR
const sourceDatabaseId = args.sourceDatabaseId ?? DEFAULT_SOURCE_DB
const targetDatabaseId = args.targetDatabaseId ?? DEFAULT_TARGET_DB
const dryRun = args.dryRun === true
const outputPath = args.output ?? null

const evidenceRows = await extractEvidenceRows(logDir)
const selectedRows = selectCanonicalEvidenceRows(evidenceRows)
const gameIds = [...new Set(selectedRows.map((row) => row.gameId))].sort()

const sourceGames = await queryRows(sourceDatabaseId, `
  SELECT *
  FROM games
  WHERE game_id IN (${placeholders(gameIds.length)})
  ORDER BY date ASC, game_id ASC
`, gameIds)

const sourceSnapshots = await queryRows(sourceDatabaseId, `
  SELECT *
  FROM source_snapshots
  WHERE game_id IN (${placeholders(gameIds.length)})
  ORDER BY game_id ASC, source_key ASC
`, gameIds)
const playerProfiles = await queryRows(targetDatabaseId, `
  SELECT player_id, full_name
  FROM player_profiles
  ORDER BY full_name ASC
`)

const gamesById = new Map(sourceGames.map((game) => [game.game_id, game]))
const snapshotsByGame = groupBy(sourceSnapshots, (row) => row.game_id)
const profileByCompactName = new Map(playerProfiles.map((profile) => [compactName(profile.full_name), profile]))
const missingGames = gameIds.filter((gameId) => !gamesById.has(gameId))

for (const row of selectedRows) {
  const compactPitcherName = compactName(row.pitcherName)
  const profile = profileByCompactName.get(compactPitcherName)
  if (profile) {
    row.pitcherName = profile.full_name
    row.pitcherPlayerId = profile.player_id
  } else {
    row.pitcherPlayerId = PLAYER_ID_BY_COMPACT_NAME.get(compactPitcherName) ?? row.pitcherPlayerId
  }
}

const rowsWithSourceGames = selectedRows.filter((row) => gamesById.has(row.gameId))
const statements = buildStatements(rowsWithSourceGames, gamesById, snapshotsByGame)
const report = {
  dryRun,
  logDir,
  sourceDatabaseId,
  targetDatabaseId,
  extractedRows: evidenceRows.length,
  selectedRows: selectedRows.length,
  rowsWithSourceGames: rowsWithSourceGames.length,
  missingSourceGames: missingGames,
  gameCount: new Set(rowsWithSourceGames.map((row) => row.gameId)).size,
  games: [...new Set(rowsWithSourceGames.map((row) => row.gameId))].sort(),
  statements: statements.length,
}

if (outputPath) {
  await writeFile(outputPath, `${JSON.stringify({ ...report, selectedRows }, null, 2)}\n`)
}

if (!dryRun) {
  for (const statement of statements) {
    await executeStatement(targetDatabaseId, statement)
  }
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--log-dir') { out.logDir = argv[++i]; continue }
    if (arg === '--source-database-id') { out.sourceDatabaseId = argv[++i]; continue }
    if (arg === '--target-database-id') { out.targetDatabaseId = argv[++i]; continue }
    if (arg === '--output') { out.output = argv[++i]; continue }
    if (arg === '--dry-run') { out.dryRun = true; continue }
    throw new Error(`Unknown argument: ${arg}`)
  }
  return out
}

async function extractEvidenceRows(dir) {
  const files = (await readdir(dir))
    .filter((file) => /^qa-prod-\d+\.json$/.test(file))
    .sort()
  const rows = []
  for (const file of files) {
    let payload
    try {
      payload = JSON.parse(await readFile(path.join(dir, file), 'utf8'))
    } catch {
      continue
    }
    const entries = Array.isArray(payload) ? payload : payload.results
    if (!Array.isArray(entries)) {
      continue
    }
    for (const entry of entries) {
      const savedAt = entry.saved_at ?? entry.raw?.saved_at ?? null
      const caseId = entry.id ?? entry.case_id ?? null
      const pitching = entry.raw?.results?.pitching ?? []
      for (const row of pitching) {
        if (!isOfficialGameBoxPitchingRow(row)) {
          continue
        }
        rows.push({
          log: file,
          caseId,
          savedAt,
          gameId: String(row.gameId),
          gameDate: String(row.gameDate),
          team: normalizeTeamDisplay(String(row.team ?? '')),
          pitcherName: String(row.pitcherName ?? ''),
          pitcherPlayerId: null,
          inningsPitched: String(row.inningsPitched ?? '0'),
          pitchCount: toInteger(row.pitchCount),
          strikeouts: toInteger(row.strikeouts),
          runs: toInteger(row.runs),
          earnedRuns: toInteger(row.earnedRuns),
          sourceUrl: String(row.sourceUrl),
        })
      }
    }
  }
  return rows.length > 0
    ? rows
    : CANONICAL_OFFICIAL_PITCHING_EVIDENCE_ROWS.map((row) => ({ ...row }))
}

function isOfficialGameBoxPitchingRow(row) {
  return row &&
    row.sourceKind === 'box' &&
    typeof row.sourceUrl === 'string' &&
    /^https:\/\/npb\.jp\/bis\/(?:eng\/)?\d{4}\/games\/fs\d+\.html$/u.test(row.sourceUrl) &&
    typeof row.gameId === 'string' &&
    typeof row.pitcherName === 'string'
}

function selectCanonicalEvidenceRows(rows) {
  const byKey = new Map()
  for (const row of rows) {
    const key = `${row.gameId}:${compactName(row.pitcherName)}`
    const current = byKey.get(key)
    if (!current || evidenceScore(row) > evidenceScore(current)) {
      byKey.set(key, row)
    }
  }
  return [...byKey.values()]
    .sort((a, b) => `${a.gameDate}:${a.gameId}:${a.pitcherName}`.localeCompare(`${b.gameDate}:${b.gameId}:${b.pitcherName}`, 'ja'))
}

function evidenceScore(row) {
  let score = 0
  if (row.pitcherName.includes(' ')) score += 4
  if (row.pitcherName.includes('晋太郎')) score += 4
  if (row.team.includes('ベイスターズ')) score += 4
  if (row.savedAt) score += 2
  if (row.sourceUrl.includes('/eng/')) score += 1
  return score
}

function buildStatements(rows, gamesById, snapshotsByGame) {
  const statements = []
  for (const profile of PLAYER_PROFILE_BY_ID.values()) {
    statements.push(upsertPlayerProfileStatement(profile))
  }
  for (const row of rows) {
    const game = gamesById.get(row.gameId)
    const snapshots = snapshotsByGame.get(row.gameId) ?? []
    statements.push(...upsertReferenceStatements(game, row))
    statements.push(upsertGameStatement(game))
    for (const snapshot of snapshots) {
      statements.push(upsertSourceSnapshotStatement(snapshot, row))
    }
    if (!snapshots.some((snapshot) => snapshot.source_key === 'box')) {
      statements.push(upsertSourceSnapshotStatement({
        game_id: row.gameId,
        source_key: 'box',
        source_url: `${row.sourceUrl}#box-not-downloaded`,
        source_path: null,
        raw_path: null,
        structured_path: null,
        fetched_at: row.savedAt ?? new Date().toISOString(),
      }, row))
    }
    statements.push(upsertPitchingLineStatement(row))
  }
  return statements
}

function upsertPlayerProfileStatement(profile) {
  const now = new Date().toISOString()
  return {
    sql: `
      INSERT INTO player_profiles (
        player_id, full_name, team_name, year_teams_json, source_url, fetched_at,
        canonical_name, current_team, active, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
      ON CONFLICT(player_id) DO UPDATE SET
        full_name = excluded.full_name,
        team_name = excluded.team_name,
        year_teams_json = excluded.year_teams_json,
        source_url = excluded.source_url,
        fetched_at = excluded.fetched_at,
        canonical_name = excluded.canonical_name,
        current_team = excluded.current_team,
        active = excluded.active,
        metadata = excluded.metadata,
        updated_at = excluded.updated_at
    `,
    params: [
      profile.playerId,
      profile.fullName,
      profile.teamName,
      JSON.stringify({ 2026: profile.teamName }),
      profile.sourceUrl,
      now,
      compactName(profile.fullName),
      profile.teamName,
      JSON.stringify({ source: 'phase4_official_pitching_evidence' }),
      now,
      now,
    ],
  }
}

function upsertReferenceStatements(game, row) {
  const teams = [
    game.away_team_name,
    game.home_team_name,
    row.team,
  ].filter(Boolean)
  return [
    ...unique(teams).map((team) => ({
      sql: 'INSERT INTO teams (team_name) VALUES (?) ON CONFLICT(team_name) DO NOTHING',
      params: [team],
    })),
    {
      sql: 'INSERT INTO venues (venue_name) VALUES (?) ON CONFLICT(venue_name) DO NOTHING',
      params: [game.venue || ''],
    },
    {
      sql: 'INSERT INTO person_names (name) VALUES (?) ON CONFLICT(name) DO NOTHING',
      params: [row.pitcherName],
    },
  ]
}

function upsertGameStatement(game) {
  return {
    sql: `
      INSERT INTO game_facts (
        game_id, schema_version, year, mmdd, game_date, date_label, venue_id,
        competition, game_number, status, start_time, end_time, duration_text,
        attendance, away_team_id, home_team_id, away_score, home_score,
        linescore_json, result_pitchers_json, batteries_json, home_runs_json,
        latest_order_json, loaded_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, (SELECT venue_id FROM venues WHERE venue_name = ?),
        ?, ?, ?, ?, ?, ?, ?,
        (SELECT team_id FROM teams WHERE team_name = ?),
        (SELECT team_id FROM teams WHERE team_name = ?),
        CAST(json_extract(?, '$.away.totals.runs') AS INTEGER),
        CAST(json_extract(?, '$.home.totals.runs') AS INTEGER),
        NULLIF(?, '[]'), NULLIF(?, '[]'), NULLIF(?, '[]'), NULLIF(?, '[]'),
        NULLIF(?, '[]'), ?
      )
      ON CONFLICT(game_id) DO UPDATE SET
        schema_version = excluded.schema_version,
        year = excluded.year,
        mmdd = excluded.mmdd,
        game_date = excluded.game_date,
        date_label = excluded.date_label,
        venue_id = excluded.venue_id,
        competition = excluded.competition,
        game_number = excluded.game_number,
        status = excluded.status,
        start_time = excluded.start_time,
        end_time = excluded.end_time,
        duration_text = excluded.duration_text,
        attendance = excluded.attendance,
        away_team_id = excluded.away_team_id,
        home_team_id = excluded.home_team_id,
        away_score = excluded.away_score,
        home_score = excluded.home_score,
        linescore_json = excluded.linescore_json,
        result_pitchers_json = excluded.result_pitchers_json,
        batteries_json = excluded.batteries_json,
        home_runs_json = excluded.home_runs_json,
        latest_order_json = excluded.latest_order_json,
        loaded_at = excluded.loaded_at
    `,
    params: [
      game.game_id,
      game.schema_version,
      game.year,
      game.mmdd,
      game.date,
      game.date_label,
      game.venue || '',
      game.competition,
      game.game_number,
      game.status,
      game.start_time,
      game.end_time,
      game.duration_text,
      game.attendance,
      game.away_team_name,
      game.home_team_name,
      game.linescore_json,
      game.linescore_json,
      game.linescore_json,
      game.result_pitchers_json,
      game.batteries_json,
      game.home_runs_json,
      game.latest_order_json,
      game.loaded_at,
    ],
  }
}

function upsertSourceSnapshotStatement(snapshot, row) {
  const sourceUrl = snapshot.source_key === 'box'
    ? row.sourceUrl
    : snapshot.source_url
  const sourceType = snapshot.source_key === 'box'
    ? 'bis_game_box_evidence'
    : sourceTypeFromUrl(sourceUrl)
  const fetchedAt = row.savedAt ?? snapshot.fetched_at ?? new Date().toISOString()
  const contentHash = snapshot.source_key === 'box'
    ? sha256(`parsed-evidence:${row.gameId}:${row.pitcherName}:${row.inningsPitched}:${row.strikeouts}:${row.earnedRuns}:${row.sourceUrl}`)
    : null
  return {
    sql: `
      INSERT INTO source_snapshot_facts (
        game_id, source_key, source_url, source_path, raw_path,
        structured_path, fetched_at, content_hash, source_type
      ) VALUES (?, ?, ?, NULLIF(?, ''), NULLIF(?, ''), NULLIF(?, ''), ?, ?, ?)
      ON CONFLICT(game_id, source_key) DO UPDATE SET
        source_url = excluded.source_url,
        source_path = COALESCE(excluded.source_path, source_snapshot_facts.source_path),
        raw_path = COALESCE(excluded.raw_path, source_snapshot_facts.raw_path),
        structured_path = COALESCE(excluded.structured_path, source_snapshot_facts.structured_path),
        fetched_at = excluded.fetched_at,
        content_hash = COALESCE(excluded.content_hash, source_snapshot_facts.content_hash),
        source_type = excluded.source_type
    `,
    params: [
      snapshot.game_id,
      snapshot.source_key,
      sourceUrl,
      snapshot.source_path ?? '',
      snapshot.raw_path ?? '',
      snapshot.structured_path ?? '',
      fetchedAt,
      contentHash,
      sourceType,
    ],
  }
}

function upsertPitchingLineStatement(row) {
  return {
    sql: `
      INSERT INTO pitching_line_facts (
        game_id, team_id, row_index, decision_code, pitcher_id, pitcher_name_id,
        pitch_count, batters_faced, innings_pitched, hits, home_runs, walks,
        hit_batters, strikeouts, wild_pitches, balks, runs, earned_runs,
        source_snapshot_id
      ) VALUES (
        ?, (SELECT team_id FROM teams WHERE team_name = ?), 9000, NULL, ?,
        (SELECT name_id FROM person_names WHERE name = ?),
        ?, 0, ?, 0, 0, 0, 0, ?, 0, 0, ?, ?,
        (SELECT source_snapshot_id FROM source_snapshot_facts WHERE game_id = ? AND source_key = 'box')
      )
      ON CONFLICT(game_id, team_id, row_index) DO UPDATE SET
        pitcher_id = excluded.pitcher_id,
        pitcher_name_id = excluded.pitcher_name_id,
        pitch_count = excluded.pitch_count,
        innings_pitched = excluded.innings_pitched,
        strikeouts = excluded.strikeouts,
        runs = excluded.runs,
        earned_runs = excluded.earned_runs,
        source_snapshot_id = excluded.source_snapshot_id
    `,
    params: [
      row.gameId,
      row.team,
      row.pitcherPlayerId,
      row.pitcherName,
      row.pitchCount,
      row.inningsPitched,
      row.strikeouts,
      row.runs,
      row.earnedRuns,
      row.gameId,
    ],
  }
}

async function queryRows(databaseId, sql, params = []) {
  const response = await d1Query(databaseId, { sql, params })
  return response[0]?.results ?? []
}

async function executeStatement(databaseId, statement) {
  const response = await d1Query(databaseId, statement)
  const result = response[0]
  if (!result?.success) {
    throw new Error(`D1 statement failed: ${JSON.stringify(result?.errors ?? result)}`)
  }
}

async function d1Query(databaseId, statement) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(statement),
  })
  const json = await response.json()
  if (!response.ok || !json.success) {
    throw new Error(`Cloudflare D1 query failed (${response.status}): ${JSON.stringify(json.errors ?? json)}`)
  }
  return Array.isArray(json.result) ? json.result : [json.result]
}

function placeholders(length) {
  return Array.from({ length }, () => '?').join(', ')
}

function groupBy(values, keyFn) {
  const map = new Map()
  for (const value of values) {
    const key = keyFn(value)
    const list = map.get(key) ?? []
    list.push(value)
    map.set(key, list)
  }
  return map
}

function unique(values) {
  return [...new Set(values)]
}

function normalizeTeamDisplay(value) {
  if (value === '横浜DeNA' || value === '横浜DeNAベイスターズ') {
    return '横浜DeNAベイスターズ'
  }
  return value
}

function compactName(value) {
  return value.replace(/[\s\u3000]/gu, '')
}

function toInteger(value) {
  const number = Number(value ?? 0)
  return Number.isFinite(number) ? Math.trunc(number) : 0
}

function sourceTypeFromUrl(url) {
  if (/npb\.jp\/bis\//u.test(url)) return 'bis'
  if (/npb\.jp\/scores\//u.test(url)) return 'scores'
  return 'npb'
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}
