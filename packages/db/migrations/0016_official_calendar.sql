CREATE TABLE IF NOT EXISTS official_calendar_observations (
  observation_id TEXT PRIMARY KEY,
  source_url TEXT NOT NULL,
  year INTEGER NOT NULL,
  source_kind TEXT NOT NULL CHECK(source_kind IN ('season','month')),
  content_hash TEXT NOT NULL,
  raw_key TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  fetched_at_ms INTEGER NOT NULL,
  facts_json TEXT NOT NULL,
  facts_hash TEXT NOT NULL,
  structured_key TEXT NOT NULL,
  discovery_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_official_calendar_latest
  ON official_calendar_observations(source_url,fetched_at_ms,observation_id);
CREATE INDEX IF NOT EXISTS idx_official_calendar_scope
  ON official_calendar_observations(year,source_kind);
