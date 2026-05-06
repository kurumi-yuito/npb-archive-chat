CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schema_version INTEGER NOT NULL,
  year INTEGER NOT NULL,
  mmdd TEXT NOT NULL,
  game_id TEXT NOT NULL UNIQUE,
  canonical_url TEXT NOT NULL,
  date TEXT NOT NULL,
  date_label TEXT NOT NULL,
  venue TEXT NOT NULL,
  competition TEXT,
  matchup_text TEXT NOT NULL,
  game_number INTEGER,
  status TEXT,
  start_time TEXT,
  end_time TEXT,
  duration_text TEXT,
  attendance INTEGER,
  away_team_name TEXT NOT NULL,
  away_team_short_name TEXT,
  home_team_name TEXT NOT NULL,
  home_team_short_name TEXT,
  linescore_json TEXT NOT NULL,
  result_pitchers_json TEXT NOT NULL,
  batteries_json TEXT NOT NULL,
  home_runs_json TEXT NOT NULL,
  latest_order_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  loaded_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_games_date ON games(date);
CREATE INDEX IF NOT EXISTS idx_games_venue ON games(venue);
CREATE INDEX IF NOT EXISTS idx_games_matchup ON games(away_team_name, home_team_name);

CREATE TABLE IF NOT EXISTS source_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT NOT NULL,
  source_key TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_path TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  FOREIGN KEY (game_id) REFERENCES games(game_id) ON DELETE CASCADE,
  UNIQUE (game_id, source_key)
);

CREATE INDEX IF NOT EXISTS idx_source_snapshots_game_id ON source_snapshots(game_id);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT NOT NULL,
  event_index INTEGER NOT NULL,
  sequence INTEGER NOT NULL,
  inning INTEGER NOT NULL,
  half TEXT NOT NULL CHECK (half IN ('top', 'bottom')),
  inning_label TEXT NOT NULL,
  offense_team TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_subtype TEXT NOT NULL,
  outs TEXT,
  bases TEXT,
  count_text TEXT,
  batter_role_prefix TEXT,
  batter_name TEXT,
  batter_url TEXT,
  batter_raw_text TEXT,
  pitcher_name TEXT,
  pitcher_url TEXT,
  runner_name TEXT,
  runner_url TEXT,
  result_text TEXT NOT NULL,
  result_runs_batted_in INTEGER,
  result_links_json TEXT NOT NULL,
  event_attributes_json TEXT,
  raw_row_html TEXT NOT NULL,
  FOREIGN KEY (game_id) REFERENCES games(game_id) ON DELETE CASCADE,
  UNIQUE (game_id, event_index)
);

CREATE INDEX IF NOT EXISTS idx_events_game_sequence ON events(game_id, sequence);
CREATE INDEX IF NOT EXISTS idx_events_type_subtype ON events(event_type, event_subtype);
CREATE INDEX IF NOT EXISTS idx_events_inning_half ON events(inning, half);
CREATE INDEX IF NOT EXISTS idx_events_batter_name ON events(batter_name);
CREATE INDEX IF NOT EXISTS idx_events_pitcher_name ON events(pitcher_name);
CREATE INDEX IF NOT EXISTS idx_events_runner_name ON events(runner_name);

CREATE TABLE IF NOT EXISTS batting_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT NOT NULL,
  team TEXT NOT NULL,
  row_index INTEGER NOT NULL,
  batting_order INTEGER,
  position TEXT NOT NULL,
  player_name TEXT NOT NULL,
  player_url TEXT,
  at_bats INTEGER NOT NULL,
  runs INTEGER NOT NULL,
  hits INTEGER NOT NULL,
  runs_batted_in INTEGER NOT NULL,
  stolen_bases INTEGER NOT NULL,
  inning_results_json TEXT NOT NULL,
  headers_json TEXT NOT NULL,
  FOREIGN KEY (game_id) REFERENCES games(game_id) ON DELETE CASCADE,
  UNIQUE (game_id, team, row_index)
);

CREATE INDEX IF NOT EXISTS idx_batting_lines_game_team ON batting_lines(game_id, team);
CREATE INDEX IF NOT EXISTS idx_batting_lines_player_name ON batting_lines(player_name);

CREATE TABLE IF NOT EXISTS pitching_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT NOT NULL,
  team TEXT NOT NULL,
  row_index INTEGER NOT NULL,
  decision TEXT,
  pitcher_name TEXT NOT NULL,
  pitcher_url TEXT,
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
  headers_json TEXT NOT NULL,
  FOREIGN KEY (game_id) REFERENCES games(game_id) ON DELETE CASCADE,
  UNIQUE (game_id, team, row_index)
);

CREATE INDEX IF NOT EXISTS idx_pitching_lines_game_team ON pitching_lines(game_id, team);
CREATE INDEX IF NOT EXISTS idx_pitching_lines_pitcher_name ON pitching_lines(pitcher_name);

CREATE TABLE IF NOT EXISTS roster_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT NOT NULL,
  team TEXT NOT NULL,
  group_label TEXT NOT NULL,
  entry_index INTEGER NOT NULL,
  number TEXT NOT NULL,
  player_name TEXT NOT NULL,
  player_url TEXT,
  throws TEXT,
  bats TEXT,
  raw_handedness TEXT NOT NULL,
  FOREIGN KEY (game_id) REFERENCES games(game_id) ON DELETE CASCADE,
  UNIQUE (game_id, team, group_label, entry_index)
);

CREATE INDEX IF NOT EXISTS idx_roster_entries_game_team ON roster_entries(game_id, team);
CREATE INDEX IF NOT EXISTS idx_roster_entries_player_name ON roster_entries(player_name);
