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

CREATE INDEX IF NOT EXISTS idx_current_team_roster_player_id
  ON current_team_roster(player_id);

CREATE INDEX IF NOT EXISTS idx_current_team_roster_player_name
  ON current_team_roster(player_name);

CREATE INDEX IF NOT EXISTS idx_player_batting_stats_player_id
  ON player_batting_stats(player_id);

CREATE INDEX IF NOT EXISTS idx_player_pitching_stats_player_id
  ON player_pitching_stats(player_id);

CREATE INDEX IF NOT EXISTS idx_player_fielding_stats_player_id
  ON player_fielding_stats(player_id);
