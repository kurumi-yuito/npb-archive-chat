CREATE TABLE IF NOT EXISTS normalized_runtime_metadata (
  metadata_key TEXT PRIMARY KEY,
  metadata_value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR REPLACE INTO normalized_runtime_metadata (metadata_key, metadata_value, updated_at)
VALUES
  ('schema_version', 'phase5-normalized-v1', CURRENT_TIMESTAMP),
  ('runtime_contract', 'normalized-only', CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS award_facts (
  year INTEGER NOT NULL,
  award_type TEXT NOT NULL,
  league TEXT NOT NULL,
  player_name TEXT NOT NULL,
  team_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  source_snapshot_key TEXT NOT NULL,
  PRIMARY KEY (year, award_type, league)
);

INSERT OR REPLACE INTO award_facts (
  year, award_type, league, player_name, team_name, source_url, fetched_at, source_snapshot_key
) VALUES
  (2025, 'rookie_of_the_year', 'セ・リーグ', '荘司宏太', '東京ヤクルト', 'https://npb.jp/award/2025/', CURRENT_TIMESTAMP, 'award:2025:rookie_of_the_year:cl'),
  (2025, 'rookie_of_the_year', 'パ・リーグ', '西川史礁', '千葉ロッテ', 'https://npb.jp/award/2025/', CURRENT_TIMESTAMP, 'award:2025:rookie_of_the_year:pl');
