CREATE TABLE IF NOT EXISTS official_team_history_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  source_url TEXT NOT NULL,
  team_id TEXT NOT NULL,
  team_name TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  basis_text TEXT,
  content_hash TEXT NOT NULL,
  raw_key TEXT NOT NULL,
  row_count INTEGER NOT NULL CHECK (row_count > 0),
  UNIQUE(source_url, content_hash)
);
CREATE INDEX IF NOT EXISTS idx_team_history_snapshot_scope
  ON official_team_history_snapshots(team_id, fetched_at);
CREATE TABLE IF NOT EXISTS official_team_seasons (
  snapshot_id TEXT NOT NULL REFERENCES official_team_history_snapshots(snapshot_id) ON DELETE CASCADE,
  season_label TEXT NOT NULL,
  year INTEGER NOT NULL,
  row_index INTEGER NOT NULL,
  metrics_json TEXT NOT NULL,
  PRIMARY KEY(snapshot_id, season_label)
);
CREATE INDEX IF NOT EXISTS idx_official_team_season_year ON official_team_seasons(year, snapshot_id);
