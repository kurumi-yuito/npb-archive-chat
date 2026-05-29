CREATE TABLE IF NOT EXISTS player_profiles (
  player_id   TEXT PRIMARY KEY,
  full_name   TEXT NOT NULL,
  team_name   TEXT,
  year_teams_json TEXT,
  source_url  TEXT NOT NULL,
  fetched_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_player_profiles_full_name
  ON player_profiles(full_name);
