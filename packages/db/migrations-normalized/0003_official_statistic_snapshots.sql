-- Immutable source versions keep first-team/farm and fielding-position rows
-- separate. Never overwrite a player's other official statistic rows.
CREATE TABLE IF NOT EXISTS official_statistic_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  source_url TEXT NOT NULL,
  target_year INTEGER NOT NULL CHECK (target_year >= 1936),
  team_id TEXT NOT NULL,
  team_name TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('first', 'farm')),
  statistic_kind TEXT NOT NULL CHECK (statistic_kind IN ('batting', 'pitching', 'fielding')),
  fetched_at TEXT NOT NULL,
  basis_text TEXT,
  content_hash TEXT NOT NULL,
  raw_key TEXT NOT NULL,
  row_count INTEGER NOT NULL CHECK (row_count >= 0),
  UNIQUE(source_url, content_hash)
);
CREATE INDEX IF NOT EXISTS official_statistic_source_latest
  ON official_statistic_snapshots(source_url, fetched_at DESC, snapshot_id);
CREATE INDEX IF NOT EXISTS official_statistic_scope
  ON official_statistic_snapshots(target_year, statistic_kind, level, team_id);

CREATE TABLE IF NOT EXISTS official_player_statistics (
  snapshot_id TEXT NOT NULL REFERENCES official_statistic_snapshots(snapshot_id),
  row_index INTEGER NOT NULL,
  player_id TEXT,
  player_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  metrics_json TEXT NOT NULL,
  PRIMARY KEY(snapshot_id, row_index)
);
CREATE INDEX IF NOT EXISTS official_player_statistic_identity
  ON official_player_statistics(player_id, snapshot_id);
CREATE INDEX IF NOT EXISTS official_player_statistic_name
  ON official_player_statistics(normalized_name, snapshot_id);
