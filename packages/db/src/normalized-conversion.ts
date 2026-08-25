import path from 'node:path'
import { migrateDatabase } from './migrations'
import { openDatabase, type SqliteDatabase, withTransaction } from './sqlite'

export type NormalizeDatabaseArgs = {
  source?: string
  target?: string
  migrationsDir?: string
}

export type NormalizeDatabaseResult = {
  source: string
  target: string
  rowCounts: Record<string, number>
  parity: NormalizeParityResult
}

export type NormalizeParityResult = {
  ok: boolean
  checks: Array<{
    name: string
    source: number | string | null
    target: number | string | null
    ok: boolean
  }>
}

const NORMALIZED_TABLES = [
  'event_facts',
  'batting_line_facts',
  'pitching_line_facts',
  'roster_entry_facts',
  'game_facts',
  'source_snapshot_facts',
  'teams',
  'venues',
  'event_types',
  'event_subtypes',
  'result_codes',
  'person_names',
  'positions',
  'roster_groups',
  'player_aliases',
  'player_sources',
  'player_profiles',
  'bis_source_snapshots',
  'current_team_roster',
  'player_batting_stats',
  'player_pitching_stats',
  'player_fielding_stats',
  'team_index',
  'team_yearly_stats',
  'team_monthly_results',
] as const

export function parseNormalizeDatabaseArgs(argv: string[]): NormalizeDatabaseArgs {
  const args = [...argv]
  while (args[0] === '--') {
    args.shift()
  }
  const result: NormalizeDatabaseArgs = {}
  while (args.length > 0) {
    const arg = args.shift()
    if (arg === '--source') {
      result.source = args.shift()
      continue
    }
    if (arg?.startsWith('--source=')) {
      result.source = arg.slice('--source='.length)
      continue
    }
    if (arg === '--target') {
      result.target = args.shift()
      continue
    }
    if (arg?.startsWith('--target=')) {
      result.target = arg.slice('--target='.length)
      continue
    }
    if (arg === '--migrations-dir') {
      result.migrationsDir = args.shift()
      continue
    }
    if (arg?.startsWith('--migrations-dir=')) {
      result.migrationsDir = arg.slice('--migrations-dir='.length)
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }
  return result
}

export function runNormalizeDatabase(options: NormalizeDatabaseArgs): NormalizeDatabaseResult {
  if (!options.source) {
    throw new Error('--source is required')
  }
  if (!options.target) {
    throw new Error('--target is required')
  }

  const source = path.resolve(options.source)
  const target = path.resolve(options.target)
  const database = openDatabase(target)
  try {
    migrateDatabase(database, options.migrationsDir)
    database.exec(`ATTACH DATABASE '${source.replaceAll("'", "''")}' AS legacy`)
    normalizeDatabase(database)
    const rowCounts = Object.fromEntries(
      NORMALIZED_TABLES.map((table) => [table, countRows(database, table)]),
    )
    const parity = checkNormalizedParity(database)
    return { source, target, rowCounts, parity }
  } finally {
    database.close()
  }
}

function normalizeDatabase(database: SqliteDatabase): void {
  withTransaction(database, () => {
    database.exec('PRAGMA defer_foreign_keys = ON')
    clearNormalizedTables(database)
    insertDictionaries(database)
    insertIdentityTables(database)
    createIdentityNameIndex(database)
    createGameIdentityIndex(database)
    insertGames(database)
    insertSourceSnapshots(database)
    insertLinesAndEvents(database)
    insertBisCurrentTables(database)
    database.prepare(
      `INSERT OR REPLACE INTO normalized_migration_checkpoints (checkpoint_key, metadata)
       VALUES ('full-conversion', ?)`,
    ).run(JSON.stringify({ completedTables: NORMALIZED_TABLES }))
  })
}

function clearNormalizedTables(database: SqliteDatabase): void {
  for (const table of NORMALIZED_TABLES) {
    database.prepare(`DELETE FROM "${table}"`).run()
  }
  database.prepare('DELETE FROM normalized_migration_checkpoints').run()
}

function insertDictionaries(database: SqliteDatabase): void {
  database.exec(`
    INSERT INTO teams (team_id, team_name)
    SELECT ROW_NUMBER() OVER (ORDER BY team_name), team_name
    FROM (
      SELECT offense_team AS team_name FROM legacy.events WHERE offense_team IS NOT NULL AND offense_team <> ''
      UNION SELECT team FROM legacy.batting_lines WHERE team IS NOT NULL AND team <> ''
      UNION SELECT team FROM legacy.pitching_lines WHERE team IS NOT NULL AND team <> ''
      UNION SELECT team FROM legacy.roster_entries WHERE team IS NOT NULL AND team <> ''
      UNION SELECT home_team_name FROM legacy.games WHERE home_team_name IS NOT NULL AND home_team_name <> ''
      UNION SELECT away_team_name FROM legacy.games WHERE away_team_name IS NOT NULL AND away_team_name <> ''
    );

    INSERT INTO venues (venue_id, venue_name)
    SELECT ROW_NUMBER() OVER (ORDER BY venue), venue
    FROM (SELECT DISTINCT venue FROM legacy.games WHERE venue IS NOT NULL AND venue <> '');

    INSERT INTO event_types (event_type_id, event_type)
    SELECT ROW_NUMBER() OVER (ORDER BY event_type), event_type
    FROM (SELECT DISTINCT event_type FROM legacy.events WHERE event_type IS NOT NULL AND event_type <> '');

    INSERT INTO event_subtypes (event_subtype_id, event_subtype)
    SELECT ROW_NUMBER() OVER (ORDER BY event_subtype), event_subtype
    FROM (SELECT DISTINCT event_subtype FROM legacy.events WHERE event_subtype IS NOT NULL AND event_subtype <> '');

    INSERT INTO result_codes (result_code_id, result_text)
    SELECT ROW_NUMBER() OVER (ORDER BY result_text), result_text
    FROM (SELECT DISTINCT result_text FROM legacy.events WHERE result_text IS NOT NULL);

    INSERT INTO positions (position_id, position)
    SELECT ROW_NUMBER() OVER (ORDER BY position), position
    FROM (
      SELECT position FROM legacy.batting_lines WHERE position IS NOT NULL AND position <> ''
      UNION SELECT position FROM legacy.roster_entries WHERE position IS NOT NULL AND position <> ''
    );

    INSERT INTO roster_groups (roster_group_id, group_label)
    SELECT ROW_NUMBER() OVER (ORDER BY group_label), group_label
    FROM (SELECT DISTINCT group_label FROM legacy.roster_entries WHERE group_label IS NOT NULL AND group_label <> '');

    INSERT INTO person_names (name_id, name)
    SELECT ROW_NUMBER() OVER (ORDER BY name), name
    FROM (
      SELECT batter_name AS name FROM legacy.events WHERE batter_name IS NOT NULL AND batter_name <> ''
      UNION SELECT pitcher_name FROM legacy.events WHERE pitcher_name IS NOT NULL AND pitcher_name <> ''
      UNION SELECT runner_name FROM legacy.events WHERE runner_name IS NOT NULL AND runner_name <> ''
      UNION SELECT substitution FROM legacy.events WHERE substitution IS NOT NULL AND substitution <> ''
      UNION SELECT pitching_change FROM legacy.events WHERE pitching_change IS NOT NULL AND pitching_change <> ''
      UNION SELECT player_name FROM legacy.batting_lines WHERE player_name IS NOT NULL AND player_name <> ''
      UNION SELECT pitcher_name FROM legacy.pitching_lines WHERE pitcher_name IS NOT NULL AND pitcher_name <> ''
      UNION SELECT player_name FROM legacy.roster_entries WHERE player_name IS NOT NULL AND player_name <> ''
      UNION SELECT full_name FROM legacy.player_profiles WHERE full_name IS NOT NULL AND full_name <> ''
      UNION SELECT canonical_name FROM legacy.player_profiles WHERE canonical_name IS NOT NULL AND canonical_name <> ''
    );
  `)
}

function insertIdentityTables(database: SqliteDatabase): void {
  database.exec(`
    INSERT INTO player_profiles (
      player_id, full_name, team_name, year_teams_json, source_url, fetched_at,
      canonical_name, current_team, active, metadata, created_at, updated_at
    )
    SELECT player_id, full_name, team_name, year_teams_json, source_url, fetched_at,
      canonical_name, current_team, active, metadata, created_at, updated_at
    FROM legacy.player_profiles;

    INSERT INTO player_aliases (
      player_id, alias, normalized_alias, alias_type, source_type, source_key,
      season_from, season_to, confidence, created_at, updated_at
    )
    SELECT player_id, alias, normalized_alias, alias_type, source_type, source_key,
      season_from, season_to, confidence, created_at, updated_at
    FROM legacy.player_aliases;

    INSERT INTO player_sources (
      player_id, source_type, source_url, normalized_source_url, source_key,
      season, team, created_at, updated_at
    )
    SELECT player_id, source_type, source_url, normalized_source_url, source_key,
      season, team, created_at, updated_at
    FROM legacy.player_sources;
  `)
}

function createIdentityNameIndex(database: SqliteDatabase): void {
  database.exec(`
    CREATE TEMP TABLE identity_name_candidates (
      normalized_name TEXT NOT NULL,
      player_id TEXT NOT NULL
    );

    INSERT INTO identity_name_candidates (normalized_name, player_id)
    SELECT ${identityNameSql('alias')}, player_id
    FROM player_aliases
    WHERE alias IS NOT NULL AND alias <> '' AND player_id IS NOT NULL AND player_id <> '';

    INSERT INTO identity_name_candidates (normalized_name, player_id)
    SELECT ${identityNameSql('COALESCE(canonical_name, full_name)')}, player_id
    FROM player_profiles
    WHERE COALESCE(canonical_name, full_name) IS NOT NULL
      AND COALESCE(canonical_name, full_name) <> ''
      AND player_id IS NOT NULL AND player_id <> '';

    INSERT INTO identity_name_candidates (normalized_name, player_id)
    SELECT normalized_name, player_id
    FROM (
      SELECT ${identityNameSql('player_name')} AS normalized_name, player_id FROM legacy.current_team_roster
      UNION ALL
      SELECT ${identityNameSql('player_name')}, player_id FROM legacy.player_batting_stats
      UNION ALL
      SELECT ${identityNameSql('player_name')}, player_id FROM legacy.player_pitching_stats
      UNION ALL
      SELECT ${identityNameSql('player_name')}, player_id FROM legacy.player_fielding_stats
    )
    WHERE normalized_name <> '' AND player_id IS NOT NULL AND player_id <> '';

    CREATE INDEX identity_name_candidates_name
      ON identity_name_candidates(normalized_name);

    CREATE TEMP TABLE identity_name_player_ids (
      normalized_name TEXT PRIMARY KEY,
      player_id TEXT NOT NULL
    ) WITHOUT ROWID;

    INSERT INTO identity_name_player_ids (normalized_name, player_id)
    SELECT normalized_name, MIN(player_id)
    FROM identity_name_candidates
    GROUP BY normalized_name
    HAVING COUNT(DISTINCT player_id) = 1;

    INSERT OR IGNORE INTO identity_name_player_ids (normalized_name, player_id)
    SELECT ${identityNameSql('person_names.name')}, MIN(identity_name_candidates.player_id)
    FROM person_names
    INNER JOIN identity_name_candidates
      ON identity_name_candidates.normalized_name LIKE ${identityNameSql('person_names.name')} || '%'
    WHERE LENGTH(${identityNameSql('person_names.name')}) >= 3
    GROUP BY ${identityNameSql('person_names.name')}
    HAVING COUNT(DISTINCT identity_name_candidates.player_id) = 1;

    DROP TABLE identity_name_candidates;
  `)
}

function createGameIdentityIndex(database: SqliteDatabase): void {
  database.exec(`
    CREATE TEMP TABLE game_identity_candidates (
      game_id TEXT NOT NULL,
      team TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      player_id TEXT NOT NULL
    );

    INSERT INTO game_identity_candidates (game_id, team, normalized_name, player_id)
    SELECT game_id, team, normalized_name, player_id
    FROM (
      SELECT game_id, team, ${identityNameSql('player_name')} AS normalized_name,
             COALESCE(${playerIdSql('player_url')}, ${profilePlayerIdSql('player_name')}) AS player_id
      FROM legacy.batting_lines
      UNION ALL
      SELECT game_id, team, ${identityNameSql('pitcher_name')},
             COALESCE(${playerIdSql('pitcher_url')}, ${profilePlayerIdSql('pitcher_name')})
      FROM legacy.pitching_lines
      UNION ALL
      SELECT game_id, team, ${identityNameSql('player_name')},
             COALESCE(${playerIdSql('player_url')}, ${profilePlayerIdSql('player_name')})
      FROM legacy.roster_entries
    )
    WHERE normalized_name <> '' AND player_id IS NOT NULL AND player_id <> '';

    CREATE INDEX game_identity_candidates_context
      ON game_identity_candidates(game_id, normalized_name);
  `)
}

function insertGames(database: SqliteDatabase): void {
  database.exec(`
    INSERT INTO game_facts (
      game_id, schema_version, year, mmdd, game_date, date_label, venue_id,
      competition, game_number, status, start_time, end_time, duration_text,
      attendance, away_team_id, home_team_id, away_score, home_score,
      linescore_json, result_pitchers_json, batteries_json, home_runs_json,
      latest_order_json, loaded_at
    )
    SELECT
      g.game_id,
      g.schema_version,
      g.year,
      g.mmdd,
      g.date,
      g.date_label,
      v.venue_id,
      g.competition,
      g.game_number,
      g.status,
      g.start_time,
      g.end_time,
      g.duration_text,
      g.attendance,
      away.team_id,
      home.team_id,
      CAST(json_extract(g.linescore_json, '$.away.totals.runs') AS INTEGER),
      CAST(json_extract(g.linescore_json, '$.home.totals.runs') AS INTEGER),
      NULLIF(g.linescore_json, '[]'),
      NULLIF(g.result_pitchers_json, '[]'),
      NULLIF(g.batteries_json, '[]'),
      NULLIF(g.home_runs_json, '[]'),
      NULLIF(g.latest_order_json, '[]'),
      g.loaded_at
    FROM legacy.games g
    LEFT JOIN venues v ON v.venue_name = g.venue
    LEFT JOIN teams away ON away.team_name = g.away_team_name
    LEFT JOIN teams home ON home.team_name = g.home_team_name;
  `)
}

function insertSourceSnapshots(database: SqliteDatabase): void {
  database.exec(`
    INSERT INTO source_snapshot_facts (
      source_snapshot_id, game_id, source_key, source_url, source_path,
      raw_path, structured_path, fetched_at, content_hash, source_type
    )
    SELECT
      ROW_NUMBER() OVER (ORDER BY game_id, source_key),
      game_id,
      source_key,
      source_url,
      NULLIF(source_path, ''),
      NULLIF(raw_path, ''),
      NULLIF(structured_path, ''),
      fetched_at,
      NULL,
      CASE
        WHEN source_url LIKE 'https://npb.jp/scores/%' THEN 'scores'
        WHEN source_url LIKE 'https://npb.jp/bis/%' THEN 'bis'
        ELSE 'npb'
      END
    FROM legacy.source_snapshots;
  `)
}

function insertLinesAndEvents(database: SqliteDatabase): void {
  database.exec(`
    INSERT INTO batting_line_facts (
      game_id, team_id, row_index, batting_order, position_id, player_id,
      player_name_id, at_bats, runs, hits, runs_batted_in, stolen_bases,
      strikeouts, walks, hit_by_pitch, sacrifice_hits, sacrifice_flies, errors,
      source_snapshot_id
    )
    SELECT
      b.game_id,
      t.team_id,
      b.row_index,
      b.batting_order,
      p.position_id,
      ${resolvedPlayerIdSql('b.player_url', 'b.player_name')},
      pn.name_id,
      b.at_bats,
      b.runs,
      b.hits,
      b.runs_batted_in,
      b.stolen_bases,
      b.strikeouts,
      b.walks,
      b.hit_by_pitch,
      b.sacrifice_hits,
      b.sacrifice_flies,
      b.errors,
      ss.source_snapshot_id
    FROM legacy.batting_lines b
    JOIN teams t ON t.team_name = b.team
    JOIN person_names pn ON pn.name = b.player_name
    LEFT JOIN positions p ON p.position = b.position
    LEFT JOIN source_snapshot_facts ss ON ss.game_id = b.game_id AND ss.source_key = 'box';

    INSERT INTO pitching_line_facts (
      game_id, team_id, row_index, decision_code, pitcher_id, pitcher_name_id,
      pitch_count, batters_faced, innings_pitched, hits, home_runs, walks,
      hit_batters, strikeouts, wild_pitches, balks, runs, earned_runs,
      source_snapshot_id
    )
    SELECT
      p.game_id,
      t.team_id,
      p.row_index,
      CASE COALESCE(p.decision, p.win_loss_save_hold)
        WHEN 'W' THEN 1
        WHEN 'L' THEN 2
        WHEN 'S' THEN 3
        WHEN 'H' THEN 4
        ELSE NULL
      END,
      COALESCE(${resolvedPlayerIdSql('p.pitcher_url', 'p.pitcher_name')}, ${gamePlayerIdSql('p.game_id', 'p.pitcher_name')}),
      pn.name_id,
      p.pitch_count,
      p.batters_faced,
      p.innings_pitched,
      p.hits,
      p.home_runs,
      p.walks,
      p.hit_batters,
      p.strikeouts,
      p.wild_pitches,
      p.balks,
      p.runs,
      p.earned_runs,
      ss.source_snapshot_id
    FROM legacy.pitching_lines p
    JOIN teams t ON t.team_name = p.team
    JOIN person_names pn ON pn.name = p.pitcher_name
    LEFT JOIN source_snapshot_facts ss ON ss.game_id = p.game_id AND ss.source_key = 'box';

    INSERT INTO roster_entry_facts (
      game_id, team_id, roster_group_id, entry_index, uniform_number,
      player_id, player_name_id, position_id, source_snapshot_id
    )
    SELECT
      r.game_id,
      t.team_id,
      rg.roster_group_id,
      r.entry_index,
      COALESCE(NULLIF(r.uniform_number, ''), NULLIF(r.number, '')),
      ${resolvedPlayerIdSql('r.player_url', 'r.player_name')},
      pn.name_id,
      pos.position_id,
      ss.source_snapshot_id
    FROM legacy.roster_entries r
    JOIN teams t ON t.team_name = r.team
    JOIN roster_groups rg ON rg.group_label = r.group_label
    JOIN person_names pn ON pn.name = r.player_name
    LEFT JOIN positions pos ON pos.position = r.position
    LEFT JOIN source_snapshot_facts ss ON ss.game_id = r.game_id AND ss.source_key = 'roster';

    INSERT INTO event_facts (
      game_id, event_index, sequence, inning, half_code, offense_team_id,
      event_type_id, event_subtype_id, outs, bases, count_text,
      batter_player_id, batter_name_id, pitcher_player_id, pitcher_name_id,
      runner_player_id, runner_name_id, result_code_id, result_runs_batted_in,
      runs_scored, substitution_name_id, pitching_change_name_id, source_snapshot_id
    )
    SELECT
      e.game_id,
      e.event_index,
      e.sequence,
      e.inning,
      CASE e.half WHEN 'top' THEN 1 WHEN 'bottom' THEN 2 ELSE 1 END,
      t.team_id,
      et.event_type_id,
      es.event_subtype_id,
      CASE e.outs WHEN 'zero' THEN 0 WHEN 'one' THEN 1 WHEN 'two' THEN 2 WHEN 'none' THEN 0 ELSE NULL END,
      e.bases,
      json_extract(e.event_attributes_json, '$.count'),
      COALESCE(${playerIdSql('e.batter_url')}, ${playerIdSql("json_extract(e.event_attributes_json, '$.batter_links[0].url')")}, ${profilePlayerIdSql('e.batter_name')}),
      batter.name_id,
      COALESCE(${playerIdSql('e.pitcher_url')}, ${playerIdSql("json_extract(e.event_attributes_json, '$.pitcher_links[0].url')")}, ${profilePlayerIdSql('e.pitcher_name')}),
      pitcher.name_id,
      ${resolvedPlayerIdSql('e.runner_url', 'e.runner_name')},
      runner.name_id,
      rc.result_code_id,
      e.result_runs_batted_in,
      e.runs_scored,
      substitution.name_id,
      pitching_change.name_id,
      ss.source_snapshot_id
    FROM legacy.events e
    LEFT JOIN teams t ON t.team_name = e.offense_team
    JOIN event_types et ON et.event_type = e.event_type
    JOIN event_subtypes es ON es.event_subtype = e.event_subtype
    JOIN result_codes rc ON rc.result_text = e.result_text
    LEFT JOIN person_names batter ON batter.name = e.batter_name
    LEFT JOIN person_names pitcher ON pitcher.name = e.pitcher_name
    LEFT JOIN person_names runner ON runner.name = e.runner_name
    LEFT JOIN person_names substitution ON substitution.name = e.substitution
    LEFT JOIN person_names pitching_change ON pitching_change.name = e.pitching_change
    LEFT JOIN source_snapshot_facts ss ON ss.game_id = e.game_id AND ss.source_key = 'playbyplay';
  `)
}

function playerIdSql(expression: string): string {
  return `CASE
    WHEN ${expression} IS NOT NULL AND instr(${expression}, 'players/') > 0
    THEN substr(${expression}, instr(${expression}, 'players/') + 8, 8)
    ELSE NULL
  END`
}

function resolvedPlayerIdSql(urlExpression: string, nameExpression: string): string {
  return `COALESCE(${playerIdSql(urlExpression)}, ${profilePlayerIdSql(nameExpression)})`
}

function profilePlayerIdSql(nameExpression: string): string {
  return `(SELECT identity.player_id
    FROM identity_name_player_ids identity
    WHERE identity.normalized_name = ${identityNameSql(nameExpression)})`
}

function gamePlayerIdSql(gameExpression: string, nameExpression: string): string {
  const sourceName = identityNameSql(nameExpression)
  return `(SELECT CASE WHEN COUNT(DISTINCT candidate.player_id) = 1 THEN MIN(candidate.player_id) ELSE NULL END
    FROM game_identity_candidates candidate
    WHERE candidate.game_id = ${gameExpression}
      AND LENGTH(${sourceName}) >= 2
      AND (candidate.normalized_name = ${sourceName}
        OR candidate.normalized_name LIKE ${sourceName} || '%'
        OR ${sourceName} LIKE candidate.normalized_name || '%'))`
}

function identityNameSql(expression: string): string {
  return `LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${expression}, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜'))`
}

function insertBisCurrentTables(database: SqliteDatabase): void {
  for (const table of [
    'bis_source_snapshots',
    'current_team_roster',
    'player_batting_stats',
    'player_pitching_stats',
    'player_fielding_stats',
    'team_index',
    'team_yearly_stats',
    'team_monthly_results',
  ]) {
    database.exec(`INSERT INTO ${table} SELECT * FROM legacy.${table}`)
  }
}

function checkNormalizedParity(database: SqliteDatabase): NormalizeParityResult {
  const checks: NormalizeParityResult['checks'] = []
  for (const [sourceTable, targetTable] of [
    ['games', 'game_facts'],
    ['source_snapshots', 'source_snapshot_facts'],
    ['events', 'event_facts'],
    ['batting_lines', 'batting_line_facts'],
    ['pitching_lines', 'pitching_line_facts'],
    ['roster_entries', 'roster_entry_facts'],
  ] as const) {
    const source = countRows(database, `legacy.${sourceTable}`)
    const target = countRows(database, targetTable)
    checks.push({ name: `${sourceTable}.row_count`, source, target, ok: source === target })
  }
  checks.push(compareScalar(database, 'events.business_key', 'SELECT COUNT(DISTINCT game_id || char(31) || event_index) FROM legacy.events', 'SELECT COUNT(DISTINCT game_id || char(31) || event_index) FROM event_facts'))
  checks.push(compareScalar(database, 'batting_lines.business_key', 'SELECT COUNT(DISTINCT game_id || char(31) || team || char(31) || row_index) FROM legacy.batting_lines', 'SELECT COUNT(DISTINCT game_id || char(31) || team_id || char(31) || row_index) FROM batting_line_facts'))
  checks.push(compareScalar(database, 'pitching_lines.business_key', 'SELECT COUNT(DISTINCT game_id || char(31) || team || char(31) || row_index) FROM legacy.pitching_lines', 'SELECT COUNT(DISTINCT game_id || char(31) || team_id || char(31) || row_index) FROM pitching_line_facts'))
  checks.push(compareScalar(database, 'roster_entries.business_key', 'SELECT COUNT(DISTINCT game_id || char(31) || team || char(31) || group_label || char(31) || entry_index) FROM legacy.roster_entries', 'SELECT COUNT(DISTINCT game_id || char(31) || team_id || char(31) || roster_group_id || char(31) || entry_index) FROM roster_entry_facts'))
  checks.push(compareScalar(database, 'events.runs_scored_sum', 'SELECT COALESCE(SUM(runs_scored), 0) FROM legacy.events', 'SELECT COALESCE(SUM(runs_scored), 0) FROM event_facts'))
  checks.push(compareScalar(database, 'batting_lines.hits_sum', 'SELECT COALESCE(SUM(hits), 0) FROM legacy.batting_lines', 'SELECT COALESCE(SUM(hits), 0) FROM batting_line_facts'))
  checks.push(compareScalar(database, 'pitching_lines.strikeouts_sum', 'SELECT COALESCE(SUM(strikeouts), 0) FROM legacy.pitching_lines', 'SELECT COALESCE(SUM(strikeouts), 0) FROM pitching_line_facts'))
  checks.push(compareScalar(database, 'source_snapshots.coverage', "SELECT COUNT(*) FROM legacy.source_snapshots WHERE source_url IS NOT NULL AND source_url <> ''", "SELECT COUNT(*) FROM source_snapshot_facts WHERE source_url IS NOT NULL AND source_url <> ''"))
  return {
    ok: checks.every((check) => check.ok),
    checks,
  }
}

function compareScalar(database: SqliteDatabase, name: string, sourceSql: string, targetSql: string): NormalizeParityResult['checks'][number] {
  const source = scalar(database, sourceSql)
  const target = scalar(database, targetSql)
  return { name, source, target, ok: source === target }
}

function countRows(database: SqliteDatabase, table: string): number {
  return Number((database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count)
}

function scalar(database: SqliteDatabase, sql: string): number | string | null {
  const row = database.prepare(`SELECT (${sql}) AS value`).get() as { value: number | string | null }
  return row.value
}
