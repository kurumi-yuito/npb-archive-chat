CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS teams (
  team_id INTEGER PRIMARY KEY,
  team_name TEXT NOT NULL UNIQUE,
  canonical_name TEXT
);

CREATE TABLE IF NOT EXISTS venues (
  venue_id INTEGER PRIMARY KEY,
  venue_name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS event_types (
  event_type_id INTEGER PRIMARY KEY,
  event_type TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS event_subtypes (
  event_subtype_id INTEGER PRIMARY KEY,
  event_subtype TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS result_codes (
  result_code_id INTEGER PRIMARY KEY,
  result_text TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS person_names (
  name_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS positions (
  position_id INTEGER PRIMARY KEY,
  position TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS roster_groups (
  roster_group_id INTEGER PRIMARY KEY,
  group_label TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS source_snapshots (
  source_snapshot_id INTEGER PRIMARY KEY,
  game_id TEXT NOT NULL,
  source_key TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_path TEXT,
  raw_path TEXT,
  structured_path TEXT,
  fetched_at TEXT NOT NULL,
  content_hash TEXT,
  source_type TEXT NOT NULL DEFAULT 'npb',
  UNIQUE (game_id, source_key)
);

CREATE TABLE IF NOT EXISTS games (
  game_id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL,
  year INTEGER NOT NULL,
  mmdd TEXT NOT NULL,
  game_date TEXT NOT NULL,
  date_label TEXT,
  venue_id INTEGER,
  competition TEXT,
  game_number INTEGER,
  status TEXT,
  start_time TEXT,
  end_time TEXT,
  duration_text TEXT,
  attendance INTEGER,
  away_team_id INTEGER,
  home_team_id INTEGER,
  away_score INTEGER,
  home_score INTEGER,
  linescore_json TEXT,
  result_pitchers_json TEXT,
  batteries_json TEXT,
  home_runs_json TEXT,
  latest_order_json TEXT,
  loaded_at TEXT NOT NULL,
  FOREIGN KEY (venue_id) REFERENCES venues(venue_id),
  FOREIGN KEY (away_team_id) REFERENCES teams(team_id),
  FOREIGN KEY (home_team_id) REFERENCES teams(team_id)
);

CREATE TABLE IF NOT EXISTS events (
  game_id TEXT NOT NULL,
  event_index INTEGER NOT NULL,
  sequence INTEGER NOT NULL,
  inning INTEGER NOT NULL,
  half_code INTEGER NOT NULL CHECK (half_code IN (1, 2)),
  offense_team_id INTEGER,
  event_type_id INTEGER NOT NULL,
  event_subtype_id INTEGER NOT NULL,
  outs INTEGER,
  bases TEXT,
  count_text TEXT,
  batter_player_id TEXT,
  batter_name_id INTEGER,
  pitcher_player_id TEXT,
  pitcher_name_id INTEGER,
  runner_player_id TEXT,
  runner_name_id INTEGER,
  result_code_id INTEGER NOT NULL,
  result_runs_batted_in INTEGER,
  runs_scored INTEGER,
  substitution_name_id INTEGER,
  pitching_change_name_id INTEGER,
  source_snapshot_id INTEGER,
  PRIMARY KEY (game_id, event_index),
  FOREIGN KEY (game_id) REFERENCES games(game_id) ON DELETE CASCADE,
  FOREIGN KEY (offense_team_id) REFERENCES teams(team_id),
  FOREIGN KEY (event_type_id) REFERENCES event_types(event_type_id),
  FOREIGN KEY (event_subtype_id) REFERENCES event_subtypes(event_subtype_id),
  FOREIGN KEY (batter_name_id) REFERENCES person_names(name_id),
  FOREIGN KEY (pitcher_name_id) REFERENCES person_names(name_id),
  FOREIGN KEY (runner_name_id) REFERENCES person_names(name_id),
  FOREIGN KEY (result_code_id) REFERENCES result_codes(result_code_id),
  FOREIGN KEY (substitution_name_id) REFERENCES person_names(name_id),
  FOREIGN KEY (pitching_change_name_id) REFERENCES person_names(name_id),
  FOREIGN KEY (source_snapshot_id) REFERENCES source_snapshots(source_snapshot_id)
);

CREATE TABLE IF NOT EXISTS batting_lines (
  game_id TEXT NOT NULL,
  team_id INTEGER NOT NULL,
  row_index INTEGER NOT NULL,
  batting_order INTEGER,
  position_id INTEGER,
  player_id TEXT,
  player_name_id INTEGER NOT NULL,
  at_bats INTEGER NOT NULL,
  runs INTEGER NOT NULL,
  hits INTEGER NOT NULL,
  runs_batted_in INTEGER NOT NULL,
  stolen_bases INTEGER NOT NULL,
  strikeouts INTEGER,
  walks INTEGER,
  hit_by_pitch INTEGER,
  sacrifice_hits INTEGER,
  sacrifice_flies INTEGER,
  errors INTEGER,
  source_snapshot_id INTEGER,
  PRIMARY KEY (game_id, team_id, row_index),
  FOREIGN KEY (game_id) REFERENCES games(game_id) ON DELETE CASCADE,
  FOREIGN KEY (team_id) REFERENCES teams(team_id),
  FOREIGN KEY (position_id) REFERENCES positions(position_id),
  FOREIGN KEY (player_name_id) REFERENCES person_names(name_id),
  FOREIGN KEY (source_snapshot_id) REFERENCES source_snapshots(source_snapshot_id)
);

CREATE TABLE IF NOT EXISTS pitching_lines (
  game_id TEXT NOT NULL,
  team_id INTEGER NOT NULL,
  row_index INTEGER NOT NULL,
  decision_code INTEGER,
  pitcher_id TEXT,
  pitcher_name_id INTEGER NOT NULL,
  pitch_count INTEGER NOT NULL,
  batters_faced INTEGER NOT NULL,
  innings_pitched TEXT NOT NULL,
  hits INTEGER NOT NULL,
  home_runs INTEGER NOT NULL,
  walks INTEGER NOT NULL,
  hit_batters INTEGER NOT NULL,
  strikeouts INTEGER NOT NULL,
  wild_pitches INTEGER NOT NULL,
  balks INTEGER NOT NULL,
  runs INTEGER NOT NULL,
  earned_runs INTEGER NOT NULL,
  source_snapshot_id INTEGER,
  PRIMARY KEY (game_id, team_id, row_index),
  FOREIGN KEY (game_id) REFERENCES games(game_id) ON DELETE CASCADE,
  FOREIGN KEY (team_id) REFERENCES teams(team_id),
  FOREIGN KEY (pitcher_name_id) REFERENCES person_names(name_id),
  FOREIGN KEY (source_snapshot_id) REFERENCES source_snapshots(source_snapshot_id)
);

CREATE TABLE IF NOT EXISTS roster_entries (
  game_id TEXT NOT NULL,
  team_id INTEGER NOT NULL,
  roster_group_id INTEGER NOT NULL,
  entry_index INTEGER NOT NULL,
  uniform_number TEXT,
  player_id TEXT,
  player_name_id INTEGER NOT NULL,
  position_id INTEGER,
  source_snapshot_id INTEGER,
  PRIMARY KEY (game_id, team_id, roster_group_id, entry_index),
  FOREIGN KEY (game_id) REFERENCES games(game_id) ON DELETE CASCADE,
  FOREIGN KEY (team_id) REFERENCES teams(team_id),
  FOREIGN KEY (roster_group_id) REFERENCES roster_groups(roster_group_id),
  FOREIGN KEY (player_name_id) REFERENCES person_names(name_id),
  FOREIGN KEY (position_id) REFERENCES positions(position_id),
  FOREIGN KEY (source_snapshot_id) REFERENCES source_snapshots(source_snapshot_id)
);

CREATE TABLE IF NOT EXISTS player_profiles (
  player_id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  team_name TEXT,
  year_teams_json TEXT,
  source_url TEXT NOT NULL,
  fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  canonical_name TEXT,
  current_team TEXT,
  active INTEGER NOT NULL DEFAULT 0,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS player_aliases (
  player_id TEXT NOT NULL,
  alias TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,
  alias_type TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_key TEXT NOT NULL DEFAULT '',
  season_from INTEGER NOT NULL DEFAULT 0,
  season_to INTEGER NOT NULL DEFAULT 0,
  confidence REAL NOT NULL DEFAULT 0.5,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (player_id) REFERENCES player_profiles(player_id) ON DELETE CASCADE,
  UNIQUE (player_id, normalized_alias, source_type, source_key, season_from, season_to)
);

CREATE TABLE IF NOT EXISTS player_sources (
  player_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_url TEXT NOT NULL,
  normalized_source_url TEXT NOT NULL,
  source_key TEXT NOT NULL DEFAULT '',
  season INTEGER NOT NULL DEFAULT 0,
  team TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (player_id) REFERENCES player_profiles(player_id) ON DELETE CASCADE,
  UNIQUE (player_id, source_type, source_key, normalized_source_url)
);

CREATE TABLE IF NOT EXISTS bis_source_snapshots (
  source_key TEXT PRIMARY KEY,
  year INTEGER,
  team_id TEXT,
  source_type TEXT NOT NULL,
  source_url TEXT NOT NULL,
  raw_path TEXT,
  structured_path TEXT,
  fetched_at TEXT NOT NULL,
  loaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS current_team_roster (
  year INTEGER NOT NULL,
  team_id TEXT NOT NULL,
  team_name TEXT NOT NULL,
  player_key TEXT NOT NULL,
  player_id TEXT,
  player_name TEXT NOT NULL,
  position TEXT,
  uniform_number TEXT,
  bats TEXT,
  throws TEXT,
  source_url TEXT NOT NULL,
  loaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (year, team_id, player_key)
);

CREATE TABLE IF NOT EXISTS player_batting_stats (
  year INTEGER NOT NULL,
  team_id TEXT NOT NULL,
  team_name TEXT NOT NULL,
  player_key TEXT NOT NULL,
  player_id TEXT,
  player_name TEXT NOT NULL,
  row_index INTEGER NOT NULL,
  values_json TEXT NOT NULL,
  source_url TEXT NOT NULL,
  loaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (year, team_id, player_key)
);

CREATE TABLE IF NOT EXISTS player_pitching_stats (
  year INTEGER NOT NULL,
  team_id TEXT NOT NULL,
  team_name TEXT NOT NULL,
  player_key TEXT NOT NULL,
  player_id TEXT,
  player_name TEXT NOT NULL,
  row_index INTEGER NOT NULL,
  values_json TEXT NOT NULL,
  source_url TEXT NOT NULL,
  loaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (year, team_id, player_key)
);

CREATE TABLE IF NOT EXISTS player_fielding_stats (
  year INTEGER NOT NULL,
  team_id TEXT NOT NULL,
  team_name TEXT NOT NULL,
  player_key TEXT NOT NULL,
  player_id TEXT,
  player_name TEXT NOT NULL,
  row_index INTEGER NOT NULL,
  values_json TEXT NOT NULL,
  source_url TEXT NOT NULL,
  loaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (year, team_id, player_key)
);

CREATE TABLE IF NOT EXISTS team_index (
  year INTEGER NOT NULL,
  team_id TEXT NOT NULL,
  team_name TEXT NOT NULL,
  row_index INTEGER NOT NULL,
  label TEXT,
  values_json TEXT NOT NULL,
  source_url TEXT NOT NULL,
  loaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (year, team_id, row_index)
);

CREATE TABLE IF NOT EXISTS team_yearly_stats (
  year INTEGER NOT NULL,
  team_id TEXT NOT NULL,
  team_name TEXT NOT NULL,
  stat_year INTEGER,
  row_index INTEGER NOT NULL,
  values_json TEXT NOT NULL,
  source_url TEXT NOT NULL,
  loaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (year, team_id, row_index)
);

CREATE TABLE IF NOT EXISTS team_monthly_results (
  year INTEGER NOT NULL,
  team_id TEXT NOT NULL,
  team_name TEXT NOT NULL,
  month INTEGER NOT NULL,
  row_index INTEGER NOT NULL,
  game_date TEXT,
  values_json TEXT NOT NULL,
  source_url TEXT NOT NULL,
  loaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (year, team_id, month, row_index)
);

CREATE TABLE IF NOT EXISTS normalized_migration_checkpoints (
  checkpoint_key TEXT PRIMARY KEY,
  completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_games_year_date ON games(year, game_date);
CREATE INDEX IF NOT EXISTS idx_games_date ON games(game_date);
CREATE INDEX IF NOT EXISTS idx_events_batter_player ON events(batter_player_id);
CREATE INDEX IF NOT EXISTS idx_events_type_subtype ON events(event_type_id, event_subtype_id);
CREATE INDEX IF NOT EXISTS idx_events_result ON events(result_code_id);
CREATE INDEX IF NOT EXISTS idx_batting_player_game ON batting_lines(player_id, game_id);
CREATE INDEX IF NOT EXISTS idx_batting_name_game ON batting_lines(player_name_id, game_id);
CREATE INDEX IF NOT EXISTS idx_pitching_player_game ON pitching_lines(pitcher_id, game_id);
CREATE INDEX IF NOT EXISTS idx_pitching_name_game ON pitching_lines(pitcher_name_id, game_id);
CREATE INDEX IF NOT EXISTS idx_roster_player_game ON roster_entries(player_id, game_id);
CREATE INDEX IF NOT EXISTS idx_roster_name_game ON roster_entries(player_name_id, game_id);
CREATE INDEX IF NOT EXISTS idx_player_profiles_canonical_name ON player_profiles(canonical_name);
CREATE INDEX IF NOT EXISTS idx_player_profiles_current_team ON player_profiles(current_team);
CREATE INDEX IF NOT EXISTS idx_player_profiles_active ON player_profiles(active);
CREATE INDEX IF NOT EXISTS idx_player_aliases_normalized_alias ON player_aliases(normalized_alias);
CREATE INDEX IF NOT EXISTS idx_player_aliases_source_key ON player_aliases(source_key);
CREATE INDEX IF NOT EXISTS idx_player_sources_normalized_source_url ON player_sources(normalized_source_url);
CREATE INDEX IF NOT EXISTS idx_player_sources_source_key ON player_sources(source_key);
CREATE INDEX IF NOT EXISTS idx_current_team_roster_player_id ON current_team_roster(player_id);
CREATE INDEX IF NOT EXISTS idx_current_team_roster_player_name ON current_team_roster(player_name);
CREATE INDEX IF NOT EXISTS idx_player_batting_stats_player_id ON player_batting_stats(player_id);
CREATE INDEX IF NOT EXISTS idx_player_pitching_stats_player_id ON player_pitching_stats(player_id);
CREATE INDEX IF NOT EXISTS idx_player_fielding_stats_player_id ON player_fielding_stats(player_id);

ALTER TABLE games RENAME TO game_facts;
ALTER TABLE source_snapshots RENAME TO source_snapshot_facts;
ALTER TABLE events RENAME TO event_facts;
ALTER TABLE batting_lines RENAME TO batting_line_facts;
ALTER TABLE pitching_lines RENAME TO pitching_line_facts;
ALTER TABLE roster_entries RENAME TO roster_entry_facts;

CREATE VIEW games AS
SELECT
  NULL AS id,
  game_facts.schema_version,
  game_facts.year,
  game_facts.mmdd,
  game_facts.game_id,
  index_source.source_url AS canonical_url,
  game_facts.game_date AS date,
  COALESCE(game_facts.date_label, game_facts.game_date) AS date_label,
  venues.venue_name AS venue,
  game_facts.competition,
  away.team_name || ' vs ' || home.team_name AS matchup_text,
  game_facts.game_number,
  game_facts.status,
  game_facts.start_time,
  game_facts.end_time,
  game_facts.duration_text,
  game_facts.attendance,
  away.team_name AS away_team_name,
  away.canonical_name AS away_team_short_name,
  home.team_name AS home_team_name,
  home.canonical_name AS home_team_short_name,
  COALESCE(game_facts.linescore_json, '[]') AS linescore_json,
  COALESCE(game_facts.result_pitchers_json, '[]') AS result_pitchers_json,
  COALESCE(game_facts.batteries_json, '[]') AS batteries_json,
  COALESCE(game_facts.home_runs_json, '[]') AS home_runs_json,
  COALESCE(game_facts.latest_order_json, '[]') AS latest_order_json,
  index_source.fetched_at AS fetched_at,
  game_facts.loaded_at
FROM game_facts
LEFT JOIN teams AS away ON away.team_id = game_facts.away_team_id
LEFT JOIN teams AS home ON home.team_id = game_facts.home_team_id
LEFT JOIN venues ON venues.venue_id = game_facts.venue_id
LEFT JOIN source_snapshot_facts AS index_source
  ON index_source.game_id = game_facts.game_id
 AND index_source.source_key = 'index';

CREATE VIEW source_snapshots AS
SELECT
  source_snapshot_id AS id,
  game_id,
  source_key,
  source_url,
  COALESCE(source_path, raw_path, structured_path, '') AS source_path,
  fetched_at,
  raw_path,
  structured_path
FROM source_snapshot_facts;

CREATE VIEW events AS
SELECT
  NULL AS id,
  event_facts.game_id,
  event_facts.event_index,
  event_facts.sequence,
  event_facts.inning,
  CASE event_facts.half_code WHEN 1 THEN 'top' ELSE 'bottom' END AS half,
  CAST(event_facts.inning AS TEXT) || CASE event_facts.half_code WHEN 1 THEN '表' ELSE '裏' END AS inning_label,
  COALESCE(teams.team_name, '') AS offense_team,
  event_types.event_type,
  event_subtypes.event_subtype,
  CASE event_facts.outs WHEN 0 THEN 'zero' WHEN 1 THEN 'one' WHEN 2 THEN 'two' ELSE NULL END AS outs,
  event_facts.bases,
  event_facts.count_text,
  NULL AS batter_role_prefix,
  batter_name.name AS batter_name,
  CASE WHEN event_facts.batter_player_id IS NOT NULL THEN 'https://npb.jp/bis/players/' || event_facts.batter_player_id || '.html' ELSE NULL END AS batter_url,
  batter_name.name AS batter_raw_text,
  pitcher_name.name AS pitcher_name,
  CASE WHEN event_facts.pitcher_player_id IS NOT NULL THEN 'https://npb.jp/bis/players/' || event_facts.pitcher_player_id || '.html' ELSE NULL END AS pitcher_url,
  runner_name.name AS runner_name,
  CASE WHEN event_facts.runner_player_id IS NOT NULL THEN 'https://npb.jp/bis/players/' || event_facts.runner_player_id || '.html' ELSE NULL END AS runner_url,
  result_codes.result_text,
  event_facts.result_runs_batted_in,
  '[]' AS result_links_json,
  json_object(
    'batter_url', CASE WHEN event_facts.batter_player_id IS NOT NULL THEN 'https://npb.jp/bis/players/' || event_facts.batter_player_id || '.html' ELSE NULL END,
    'pitcher_url', CASE WHEN event_facts.pitcher_player_id IS NOT NULL THEN 'https://npb.jp/bis/players/' || event_facts.pitcher_player_id || '.html' ELSE NULL END,
    'runner_url', CASE WHEN event_facts.runner_player_id IS NOT NULL THEN 'https://npb.jp/bis/players/' || event_facts.runner_player_id || '.html' ELSE NULL END
  ) AS event_attributes_json,
  result_codes.result_text AS raw_row_html,
  event_facts.runs_scored,
  NULL AS score_change,
  substitution_name.name AS substitution,
  pitching_change_name.name AS pitching_change,
  source_snapshot_facts.source_url,
  result_codes.result_text AS source_text
FROM event_facts
LEFT JOIN teams ON teams.team_id = event_facts.offense_team_id
JOIN event_types ON event_types.event_type_id = event_facts.event_type_id
JOIN event_subtypes ON event_subtypes.event_subtype_id = event_facts.event_subtype_id
JOIN result_codes ON result_codes.result_code_id = event_facts.result_code_id
LEFT JOIN person_names AS batter_name ON batter_name.name_id = event_facts.batter_name_id
LEFT JOIN person_names AS pitcher_name ON pitcher_name.name_id = event_facts.pitcher_name_id
LEFT JOIN person_names AS runner_name ON runner_name.name_id = event_facts.runner_name_id
LEFT JOIN person_names AS substitution_name ON substitution_name.name_id = event_facts.substitution_name_id
LEFT JOIN person_names AS pitching_change_name ON pitching_change_name.name_id = event_facts.pitching_change_name_id
LEFT JOIN source_snapshot_facts ON source_snapshot_facts.source_snapshot_id = event_facts.source_snapshot_id;

CREATE VIEW batting_lines AS
SELECT
  NULL AS id,
  batting_line_facts.game_id,
  teams.team_name AS team,
  batting_line_facts.row_index,
  batting_line_facts.batting_order,
  positions.position,
  player_name.name AS player_name,
  CASE WHEN batting_line_facts.player_id IS NOT NULL THEN 'https://npb.jp/bis/players/' || batting_line_facts.player_id || '.html' ELSE NULL END AS player_url,
  batting_line_facts.at_bats,
  batting_line_facts.runs,
  batting_line_facts.hits,
  batting_line_facts.runs_batted_in,
  batting_line_facts.stolen_bases,
  '[]' AS inning_results_json,
  '[]' AS headers_json,
  batting_line_facts.strikeouts,
  batting_line_facts.walks,
  batting_line_facts.hit_by_pitch,
  batting_line_facts.sacrifice_hits,
  batting_line_facts.sacrifice_flies,
  batting_line_facts.errors,
  NULL AS raw_text,
  source_snapshot_facts.source_url
FROM batting_line_facts
JOIN teams ON teams.team_id = batting_line_facts.team_id
JOIN person_names AS player_name ON player_name.name_id = batting_line_facts.player_name_id
LEFT JOIN positions ON positions.position_id = batting_line_facts.position_id
LEFT JOIN source_snapshot_facts ON source_snapshot_facts.source_snapshot_id = batting_line_facts.source_snapshot_id;

CREATE VIEW pitching_lines AS
SELECT
  NULL AS id,
  pitching_line_facts.game_id,
  teams.team_name AS team,
  pitching_line_facts.row_index,
  CASE pitching_line_facts.decision_code WHEN 1 THEN 'W' WHEN 2 THEN 'L' WHEN 3 THEN 'S' WHEN 4 THEN 'H' ELSE NULL END AS decision,
  pitcher_name.name AS pitcher_name,
  CASE WHEN pitching_line_facts.pitcher_id IS NOT NULL THEN 'https://npb.jp/bis/players/' || pitching_line_facts.pitcher_id || '.html' ELSE NULL END AS pitcher_url,
  pitching_line_facts.pitch_count,
  pitching_line_facts.batters_faced,
  pitching_line_facts.innings_pitched,
  pitching_line_facts.hits,
  pitching_line_facts.home_runs,
  pitching_line_facts.walks,
  pitching_line_facts.hit_batters,
  pitching_line_facts.strikeouts,
  pitching_line_facts.wild_pitches,
  pitching_line_facts.balks,
  pitching_line_facts.runs,
  pitching_line_facts.earned_runs,
  '[]' AS headers_json,
  pitching_line_facts.row_index AS sequence,
  pitching_line_facts.pitch_count AS pitches,
  pitching_line_facts.hits AS hits_allowed,
  pitching_line_facts.home_runs AS home_runs_allowed,
  pitching_line_facts.hit_batters AS hit_by_pitch,
  pitching_line_facts.runs AS runs_allowed,
  CASE pitching_line_facts.decision_code WHEN 1 THEN 'W' WHEN 2 THEN 'L' WHEN 3 THEN 'S' WHEN 4 THEN 'H' ELSE NULL END AS win_loss_save_hold,
  NULL AS raw_text,
  source_snapshot_facts.source_url
FROM pitching_line_facts
JOIN teams ON teams.team_id = pitching_line_facts.team_id
JOIN person_names AS pitcher_name ON pitcher_name.name_id = pitching_line_facts.pitcher_name_id
LEFT JOIN source_snapshot_facts ON source_snapshot_facts.source_snapshot_id = pitching_line_facts.source_snapshot_id;

CREATE VIEW roster_entries AS
SELECT
  NULL AS id,
  roster_entry_facts.game_id,
  teams.team_name AS team,
  roster_groups.group_label,
  roster_entry_facts.entry_index,
  COALESCE(roster_entry_facts.uniform_number, '') AS number,
  player_name.name AS player_name,
  CASE WHEN roster_entry_facts.player_id IS NOT NULL THEN 'https://npb.jp/bis/players/' || roster_entry_facts.player_id || '.html' ELSE NULL END AS player_url,
  NULL AS throws,
  NULL AS bats,
  '' AS raw_handedness,
  roster_entry_facts.uniform_number,
  positions.position,
  NULL AS starter,
  NULL AS batting_order,
  NULL AS raw_text,
  source_snapshot_facts.source_url
FROM roster_entry_facts
JOIN teams ON teams.team_id = roster_entry_facts.team_id
JOIN roster_groups ON roster_groups.roster_group_id = roster_entry_facts.roster_group_id
JOIN person_names AS player_name ON player_name.name_id = roster_entry_facts.player_name_id
LEFT JOIN positions ON positions.position_id = roster_entry_facts.position_id
LEFT JOIN source_snapshot_facts ON source_snapshot_facts.source_snapshot_id = roster_entry_facts.source_snapshot_id;
