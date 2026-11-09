-- Scope proof must find newer observations without scanning every source for
-- every eligible registration row.
CREATE INDEX IF NOT EXISTS idx_bis_source_observation
  ON bis_source_snapshots(source_type, source_url, fetched_at);
