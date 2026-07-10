ALTER TABLE player_profiles ADD COLUMN canonical_name TEXT;
ALTER TABLE player_profiles ADD COLUMN current_team TEXT;
ALTER TABLE player_profiles ADD COLUMN active INTEGER NOT NULL DEFAULT 0;
ALTER TABLE player_profiles ADD COLUMN metadata TEXT NOT NULL DEFAULT '{}';
ALTER TABLE player_profiles ADD COLUMN created_at TEXT;
ALTER TABLE player_profiles ADD COLUMN updated_at TEXT;

UPDATE player_profiles
SET
  canonical_name = COALESCE(NULLIF(canonical_name, ''), full_name),
  current_team = COALESCE(NULLIF(current_team, ''), team_name),
  metadata = COALESCE(NULLIF(metadata, ''), json_object('year_teams_json', year_teams_json, 'source_url', source_url)),
  created_at = COALESCE(created_at, fetched_at, CURRENT_TIMESTAMP),
  updated_at = COALESCE(updated_at, fetched_at, CURRENT_TIMESTAMP);

CREATE INDEX IF NOT EXISTS idx_player_profiles_canonical_name
  ON player_profiles(canonical_name);

CREATE INDEX IF NOT EXISTS idx_player_profiles_current_team
  ON player_profiles(current_team);

CREATE INDEX IF NOT EXISTS idx_player_profiles_active
  ON player_profiles(active);

CREATE TABLE IF NOT EXISTS player_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
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

CREATE INDEX IF NOT EXISTS idx_player_aliases_normalized_alias
  ON player_aliases(normalized_alias);

CREATE INDEX IF NOT EXISTS idx_player_aliases_player_id
  ON player_aliases(player_id);

CREATE INDEX IF NOT EXISTS idx_player_aliases_source_key
  ON player_aliases(source_key);

CREATE TABLE IF NOT EXISTS player_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
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

CREATE INDEX IF NOT EXISTS idx_player_sources_normalized_source_url
  ON player_sources(normalized_source_url);

CREATE INDEX IF NOT EXISTS idx_player_sources_player_id
  ON player_sources(player_id);

CREATE INDEX IF NOT EXISTS idx_player_sources_source_key
  ON player_sources(source_key);
