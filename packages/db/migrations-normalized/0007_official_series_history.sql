CREATE TABLE IF NOT EXISTS official_series_history_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  source_url TEXT NOT NULL,
  competition TEXT NOT NULL,
  level TEXT NOT NULL CHECK(level IN ('first','farm')),
  first_year INTEGER NOT NULL,
  last_year INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  raw_key TEXT NOT NULL,
  row_count INTEGER NOT NULL CHECK(row_count > 0),
  UNIQUE(source_url,content_hash)
);
CREATE TABLE IF NOT EXISTS official_series_history_observations (
  observation_id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL REFERENCES official_series_history_snapshots(snapshot_id) ON DELETE CASCADE,
  fetched_at TEXT NOT NULL,
  fetched_at_ms INTEGER NOT NULL,
  source_response_date TEXT,
  source_last_modified TEXT,
  structured_key TEXT NOT NULL,
  discovery_url TEXT NOT NULL,
  discovery_fetched_at TEXT NOT NULL,
  discovery_content_hash TEXT NOT NULL,
  discovery_raw_key TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_series_history_observation ON official_series_history_observations(snapshot_id,fetched_at_ms,observation_id);
CREATE TABLE IF NOT EXISTS official_series_results (
  snapshot_id TEXT NOT NULL REFERENCES official_series_history_snapshots(snapshot_id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  row_index INTEGER NOT NULL,
  record_json TEXT NOT NULL,
  record_hash TEXT NOT NULL,
  PRIMARY KEY(snapshot_id,year)
);
CREATE INDEX IF NOT EXISTS idx_official_series_result_year ON official_series_results(year,snapshot_id);
