# Acceptanceケース別SQL・実行計画（第1修正後）

Version `d5cc67a1-2963-47a6-84f0-e06131a45400` のWorker tail SQLを収録。rows_readは本番実測。EXPLAINは保存済み公開DBスナップショットを使い、値がtailに記録されないためNULL仮引数で実行した構造確認であり、本番D1のEXPLAINではない。B31は失敗SQLがあるため合計欠測。辞書走査と大量fact走査を区別する。

| ケース | rows_read | 実行metadataのRepository | SQL |
| --- | ---: | --- | --- |
| B05 | 419910 | aggregatePitchingLines, listSourceSnapshotsByGameIds | [S13](#s13), [S14](#s14), [S15](#s15), [S16](#s16), [S17](#s17), [S18](#s18), [S19](#s19), [S20](#s20), [S21](#s21), [S22](#s22), [S23](#s23) |
| B17 | 203698 | searchPlayerAffiliations, listSourceSnapshotsByGameIds | [S36](#s36), [S37](#s37), [S38](#s38), [S39](#s39), [S40](#s40), [S41](#s41), [S42](#s42), [S43](#s43), [S44](#s44), [S45](#s45), [S46](#s46), [S47](#s47), [S48](#s48), [S49](#s49) |
| B19 | 198944 | 呼び出しなし | [S52](#s52), [S53](#s53) |
| MT02-Turn3 | 132292 | 呼び出しなし | [S93](#s93), [S94](#s94) |
| MT05-Turn3 | 99416 | 呼び出しなし | [S96](#s96), [S98](#s98), [S99](#s99), [S97](#s97) |
| MT02-Turn2 | 93993 | 呼び出しなし | [S29](#s29), [S91](#s91), [S30](#s30), [S92](#s92) |
| MT05-Turn2 | 56966 | 呼び出しなし | [S98](#s98), [S99](#s99) |
| B32 | 43610 | aggregateBattingLines, listSourceSnapshotsByGameIds | [S79](#s79), [S80](#s80), [S81](#s81), [S82](#s82), [S83](#s83), [S84](#s84), [S85](#s85) |
| MT05-Turn1 | 42457 | 呼び出しなし | [S96](#s96), [S97](#s97) |
| B09 | 38532 | 呼び出しなし | [S29](#s29), [S30](#s30) |
| B12 | 38532 | 呼び出しなし | [S29](#s29), [S30](#s30) |
| MT02-Turn1 | 38532 | 呼び出しなし | [S29](#s29), [S30](#s30) |
| B25 | 18653 | 呼び出しなし | [S55](#s55), [S56](#s56), [S57](#s57), [S50](#s50), [S51](#s51), [S58](#s58) |
| MT01-Turn2 | 18633 | 呼び出しなし | [S66](#s66), [S86](#s86), [S87](#s87), [S88](#s88), [S35](#s35), [S89](#s89) |
| B04 | 17909 | searchBattingLines, listSourceSnapshotsByGameIds | [S01](#s01), [S04](#s04), [S05](#s05), [S06](#s06), [S07](#s07), [S08](#s08), [S09](#s09), [S10](#s10), [S11](#s11), [S12](#s12) |
| B11 | 17426 | 呼び出しなし | [S31](#s31), [S32](#s32), [S33](#s33), [S34](#s34) |
| MT04-Turn1 | 12378 | 呼び出しなし | [S95](#s95) |
| B26 | 11360 | searchBattingLines, listSourceSnapshotsByGameIds | [S59](#s59), [S60](#s60), [S61](#s61), [S62](#s62), [S63](#s63), [S64](#s64), [S65](#s65) |
| MT01-Turn3 | 7051 | 呼び出しなし | [S90](#s90), [S35](#s35) |
| B18 | 6219 | 呼び出しなし | [S50](#s50), [S51](#s51) |
| B28 | 3114 | aggregateGameResults, listSourceSnapshotsByGameIds | [S66](#s66) |
| B13 | 3110 | 呼び出しなし | [S35](#s35) |
| B27 | 3110 | 呼び出しなし | [S35](#s35) |
| MT01-Turn1 | 3110 | 呼び出しなし | [S35](#s35) |
| B23 | 2932 | 呼び出しなし | [S54](#s54) |
| B06 | 2902 | aggregateBattingLines, listSourceSnapshotsByGameIds | [S24](#s24) |
| B07 | 2878 | aggregateBattingLines, listSourceSnapshotsByGameIds | [S25](#s25), [S26](#s26) |
| B08 | 2261 | 呼び出しなし | [S27](#s27), [S28](#s28) |
| B01 | 13 | searchGameDetails, searchEvents, searchBattingLines, searchPitchingLines, listSourceSnapshotsByGameIds | [S01](#s01), [S02](#s02), [S03](#s03) |
| B02 | 5 | 呼び出しなし |  |
| B03 | 5 | 呼び出しなし |  |
| B10 | 5 | 呼び出しなし |  |
| B14 | 5 | 呼び出しなし |  |
| B15 | 5 | 呼び出しなし |  |
| B16 | 5 | 呼び出しなし |  |
| B20 | 5 | 呼び出しなし |  |
| B21 | 5 | 呼び出しなし |  |
| B22 | 5 | 呼び出しなし |  |
| B24 | 5 | 呼び出しなし |  |
| B29 | 5 | 呼び出しなし |  |
| B30 | 5 | 呼び出しなし |  |
| B33 | 5 | 呼び出しなし |  |
| MT03-Turn1 | 5 | 呼び出しなし |  |
| MT03-Turn2 | 5 | 呼び出しなし |  |
| MT03-Turn3 | 5 | 呼び出しなし |  |
| MT04-Turn2 | 5 | 呼び出しなし |  |
| B31 | 欠測 | aggregateBattingLines, listSourceSnapshotsByGameIds | [S67](#s67), [S68](#s68), [S69](#s69), [S70](#s70), [S71](#s71), [S72](#s72), [S73](#s73), [S74](#s74), [S75](#s75), [S76](#s76), [S77](#s77), [S78](#s78) |

## S01

使用箇所: B01, B04

```sql
SELECT metadata_key AS key, metadata_value AS value FROM normalized_runtime_metadata WHERE metadata_key IN ('schema_version', 'runtime_contract')
```

EXPLAIN QUERY PLAN:

```text
SEARCH normalized_runtime_metadata USING INDEX sqlite_autoindex_normalized_runtime_metadata_1 (metadata_key=?)
```

索引: SEARCH normalized_runtime_metadata USING INDEX sqlite_autoindex_normalized_runtime_metadata_1 (metadata_key=?)

この計画にSCANはない。

## S02

使用箇所: B01

```sql
SELECT games.game_id AS gameId, games.date AS date, games.venue AS venue, games.competition AS competition, games.away_team_name AS awayTeamName, games.home_team_name AS homeTeamName, games.matchup_text AS matchupText, games.linescore_json AS linescoreJson FROM games WHERE games.game_id NOT LIKE 'f%' AND games.date = ? AND (games.home_team_name LIKE ? OR games.away_team_name LIKE ? OR games.home_team_name LIKE ? OR games.away_team_name LIKE ? OR games.home_team_name LIKE ? OR games.away_team_name LIKE ?) ORDER BY games.date DESC, games.game_id DESC LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SEARCH game_facts USING INDEX idx_games_date (game_date=?)
SEARCH away USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH home USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH venues USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
USE TEMP B-TREE FOR RIGHT PART OF ORDER BY
```

索引: SEARCH game_facts USING INDEX idx_games_date (game_date=?) / SEARCH away USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH home USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH venues USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN

この計画にSCANはない。

## S03

使用箇所: B01

```sql
SELECT games.game_id AS gameId, games.date AS date, games.away_team_name AS awayTeamName, games.home_team_name AS homeTeamName, games.matchup_text AS matchupText, games.venue AS venue, games.linescore_json AS linescoreJson FROM games WHERE games.game_id NOT LIKE 'f%' AND games.date = ? AND ((games.home_team_name LIKE ? OR games.away_team_name LIKE ?) OR (games.home_team_name LIKE ? OR games.away_team_name LIKE ?) OR (games.home_team_name LIKE ? OR games.away_team_name LIKE ?)) ORDER BY games.date ASC, games.game_id ASC LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SEARCH game_facts USING INDEX idx_games_date (game_date=?)
SEARCH away USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH home USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH venues USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
USE TEMP B-TREE FOR RIGHT PART OF ORDER BY
```

索引: SEARCH game_facts USING INDEX idx_games_date (game_date=?) / SEARCH away USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH home USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH venues USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN

この計画にSCANはない。

## S04

使用箇所: B04

```sql
SELECT player_id, full_name, team_name, year_teams_json FROM player_profiles WHERE (LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(player_profiles.canonical_name, player_profiles.full_name), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) = ? OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(player_profiles.canonical_name, player_profiles.full_name), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE ? OR (LENGTH(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(player_profiles.canonical_name, player_profiles.full_name), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜'))) >= 3 AND ? LIKE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(player_profiles.canonical_name, player_profiles.full_name), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%')) LIMIT 30
```

EXPLAIN QUERY PLAN:

```text
SCAN player_profiles
```

索引: 計画上の索引指定なし

走査箇所: SCAN player_profiles

走査の分析: 上記SQLの名前正規化・部分一致・相関照合による辞書検索、または集計中間結果の読み取り。関数を適用した名前条件は既存の生文字列INDEXと一致しない。中間結果のSCANは元テーブル全走査を意味しない。

## S05

使用箇所: B04

```sql
SELECT player_profiles.player_id, COALESCE(player_profiles.canonical_name, player_profiles.full_name) AS full_name, player_profiles.team_name, player_profiles.year_teams_json, player_profiles.current_team, player_aliases.season_from, player_aliases.season_to FROM player_aliases INNER JOIN player_profiles ON player_profiles.player_id = player_aliases.player_id WHERE (LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(player_aliases.alias, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) = ? OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(player_aliases.normalized_alias, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) = ?) LIMIT 50
```

EXPLAIN QUERY PLAN:

```text
SCAN player_aliases
SEARCH player_profiles USING INDEX sqlite_autoindex_player_profiles_1 (player_id=?)
```

索引: SEARCH player_profiles USING INDEX sqlite_autoindex_player_profiles_1 (player_id=?)

走査箇所: SCAN player_aliases

走査の分析: 上記SQLの名前正規化・部分一致・相関照合による辞書検索、または集計中間結果の読み取り。関数を適用した名前条件は既存の生文字列INDEXと一致しない。中間結果のSCANは元テーブル全走査を意味しない。

## S06

使用箇所: B04

```sql
SELECT COUNT(*) AS count FROM player_batting_stats WHERE player_id = ?
```

EXPLAIN QUERY PLAN:

```text
SEARCH player_batting_stats USING COVERING INDEX idx_player_batting_stats_player_id (player_id=?)
```

索引: SEARCH player_batting_stats USING COVERING INDEX idx_player_batting_stats_player_id (player_id=?)

この計画にSCANはない。

## S07

使用箇所: B04

```sql
SELECT COUNT(*) AS count FROM player_pitching_stats WHERE player_id = ?
```

EXPLAIN QUERY PLAN:

```text
SEARCH player_pitching_stats USING COVERING INDEX idx_player_pitching_stats_player_id (player_id=?)
```

索引: SEARCH player_pitching_stats USING COVERING INDEX idx_player_pitching_stats_player_id (player_id=?)

この計画にSCANはない。

## S08

使用箇所: B04

```sql
SELECT year, team_id, team_name, player_name FROM current_team_roster WHERE current_team_roster.player_id = ? AND current_team_roster.year = ? AND current_team_roster.team_name IN (?) LIMIT 2
```

EXPLAIN QUERY PLAN:

```text
SEARCH current_team_roster USING INDEX idx_current_team_roster_player_id (player_id=?)
```

索引: SEARCH current_team_roster USING INDEX idx_current_team_roster_player_id (player_id=?)

この計画にSCANはない。

## S09

使用箇所: B04

```sql
SELECT 'bis:' || player_batting_stats.year || ':' || player_batting_stats.team_id || ':idb1' AS gameId, printf('%04d-01-01', player_batting_stats.year) AS gameDate, player_batting_stats.team_name AS team, player_batting_stats.player_name AS playerName, NULL AS battingOrder, NULL AS position, CAST(COALESCE(json_extract(player_batting_stats.values_json, '$.打数'), '0') AS INTEGER) AS atBats, CAST(COALESCE(json_extract(player_batting_stats.values_json, '$.得点'), '0') AS INTEGER) AS runs, CAST(COALESCE(json_extract(player_batting_stats.values_json, '$.安打'), '0') AS INTEGER) AS hits, CAST(COALESCE(json_extract(player_batting_stats.values_json, '$.打点'), '0') AS INTEGER) AS runsBattedIn, CAST(COALESCE(json_extract(player_batting_stats.values_json, '$.盗塁'), '0') AS INTEGER) AS stolenBases, CAST(COALESCE(json_extract(player_batting_stats.values_json, '$.三振'), '0') AS INTEGER) AS strikeouts, CAST(COALESCE(json_extract(player_batting_stats.values_json, '$.四球'), '0') AS INTEGER) AS walks, player_batting_stats.values_json AS rawText, 'bis_batting' AS sourceKind, player_batting_stats.source_url AS sourceUrl, player_batting_stats.values_json AS statsJson FROM player_batting_stats WHERE player_batting_stats.year = ? AND player_batting_stats.team_name IN (?) AND REPLACE(REPLACE(REPLACE(REPLACE(player_batting_stats.player_name, ' ', ''), char(12288), ''), '*', ''), '＊', '') LIKE ? ORDER BY player_batting_stats.year DESC, player_batting_stats.team_id ASC, player_batting_stats.row_index ASC LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SEARCH player_batting_stats USING INDEX sqlite_autoindex_player_batting_stats_1 (year=?)
USE TEMP B-TREE FOR RIGHT PART OF ORDER BY
```

索引: SEARCH player_batting_stats USING INDEX sqlite_autoindex_player_batting_stats_1 (year=?)

この計画にSCANはない。

## S10

使用箇所: B04

```sql
SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1
```

EXPLAIN QUERY PLAN:

```text
SCAN sqlite_master
```

索引: 計画上の索引指定なし

走査箇所: SCAN sqlite_master

走査の分析: 上記SQLの名前正規化・部分一致・相関照合による辞書検索、または集計中間結果の読み取り。関数を適用した名前条件は既存の生文字列INDEXと一致しない。中間結果のSCANは元テーブル全走査を意味しない。

## S11

使用箇所: B04

```sql
SELECT batting_line_facts.game_id AS gameId, game_facts.game_date AS gameDate, teams.team_name AS team, person_names.name AS playerName, batting_line_facts.batting_order AS battingOrder, positions.position AS position, batting_line_facts.at_bats AS atBats, batting_line_facts.runs AS runs, batting_line_facts.hits AS hits, batting_line_facts.runs_batted_in AS runsBattedIn, batting_line_facts.stolen_bases AS stolenBases, batting_line_facts.strikeouts AS strikeouts, batting_line_facts.walks AS walks, NULL AS rawText, 'box' AS sourceKind, source_snapshot_facts.source_url AS sourceUrl, NULL AS statsJson FROM batting_line_facts INNER JOIN game_facts ON game_facts.game_id = batting_line_facts.game_id INNER JOIN teams ON teams.team_id = batting_line_facts.team_id INNER JOIN person_names ON person_names.name_id = batting_line_facts.player_name_id LEFT JOIN positions ON positions.position_id = batting_line_facts.position_id LEFT JOIN source_snapshot_facts ON source_snapshot_facts.source_snapshot_id = batting_line_facts.source_snapshot_id WHERE ( ( batting_line_facts.player_id = ? AND ( NOT EXISTS (SELECT 1 FROM player_profiles WHERE player_id = batting_line_facts.player_id) OR EXISTS ( SELECT 1 FROM player_profiles AS direct_identity_profile WHERE direct_identity_profile.player_id = batting_line_facts.player_id AND json_extract(direct_identity_profile.year_teams_json, '$."' || game_facts.year || '"') IS NOT NULL AND LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(direct_identity_profile.canonical_name, direct_identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(person_names.name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%' ) ) ) OR EXISTS ( SELECT 1 FROM player_profiles AS identity_profile LEFT JOIN player_aliases AS identity_alias ON identity_alias.player_id = identity_profile.player_id AND (identity_alias.season_from = 0 OR identity_alias.season_from <= game_facts.year) AND (identity_alias.season_to = 0 OR identity_alias.season_to >= game_facts.year) WHERE identity_profile.player_id = ? AND ( LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(person_names.name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) = LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(identity_profile.canonical_name, identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(person_names.name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) = LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(identity_alias.alias, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) OR ( LENGTH(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(person_names.name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜'))) >= 1 AND LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(identity_profile.canonical_name, identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(person_names.name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%' AND LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(json_extract(identity_profile.year_teams_json, '$."' || game_facts.year || '"'), ''), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) <> '' AND (LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(json_extract(identity_profile.year_teams_json, '$."' || game_facts.year || '"'), ''), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE '%' || LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(teams.team_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%' OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(teams.team_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE '%' || LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(json_extract(identity_profile.year_teams_json, '$."' || game_facts.year || '"'), ''), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%') ) OR ( LENGTH(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(person_names.name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜'))) >= 3 AND (LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(identity_profile.canonical_name, identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(person_names.name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%' OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(person_names.name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(identity_profile.canonical_name, identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%') AND NOT EXISTS ( SELECT 1 FROM player_profiles AS other_identity_profile WHERE other_identity_profile.player_id <> identity_profile.player_id AND LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(other_identity_profile.canonical_name, other_identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) <> LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(identity_profile.canonical_name, identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) AND (LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(other_identity_profile.canonical_name, other_identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(person_names.name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%' OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(person_names.name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(other_identity_profile.canonical_name, other_identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%') ) ) ) ) ) AND game_facts.year = ? AND teams.team_name IN (?) ORDER BY game_facts.game_date ASC, batting_line_facts.game_id ASC, batting_line_facts.row_index ASC LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SEARCH teams USING COVERING INDEX sqlite_autoindex_teams_1 (team_name=?)
SEARCH game_facts USING INDEX idx_games_year_date (year=?)
SEARCH batting_line_facts USING INDEX sqlite_autoindex_batting_line_facts_1 (game_id=? AND team_id=?)
SEARCH person_names USING INTEGER PRIMARY KEY (rowid=?)
CORRELATED SCALAR SUBQUERY 1
SEARCH player_profiles USING COVERING INDEX sqlite_autoindex_player_profiles_1 (player_id=?)
CORRELATED SCALAR SUBQUERY 2
SEARCH direct_identity_profile USING INDEX sqlite_autoindex_player_profiles_1 (player_id=?)
CORRELATED SCALAR SUBQUERY 4
SEARCH identity_profile USING INDEX sqlite_autoindex_player_profiles_1 (player_id=?)
SEARCH identity_alias USING INDEX sqlite_autoindex_player_aliases_1 (player_id=?) LEFT-JOIN
CORRELATED SCALAR SUBQUERY 3
SCAN other_identity_profile
SEARCH positions USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH source_snapshot_facts USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
USE TEMP B-TREE FOR RIGHT PART OF ORDER BY
```

索引: SEARCH teams USING COVERING INDEX sqlite_autoindex_teams_1 (team_name=?) / SEARCH game_facts USING INDEX idx_games_year_date (year=?) / SEARCH batting_line_facts USING INDEX sqlite_autoindex_batting_line_facts_1 (game_id=? AND team_id=?) / SEARCH person_names USING INTEGER PRIMARY KEY (rowid=?) / SEARCH player_profiles USING COVERING INDEX sqlite_autoindex_player_profiles_1 (player_id=?) / SEARCH direct_identity_profile USING INDEX sqlite_autoindex_player_profiles_1 (player_id=?) / SEARCH identity_profile USING INDEX sqlite_autoindex_player_profiles_1 (player_id=?) / SEARCH identity_alias USING INDEX sqlite_autoindex_player_aliases_1 (player_id=?) LEFT-JOIN / SEARCH positions USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH source_snapshot_facts USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN

走査箇所: SCAN other_identity_profile

走査の分析: 上記SQLの名前正規化・部分一致・相関照合による辞書検索、または集計中間結果の読み取り。関数を適用した名前条件は既存の生文字列INDEXと一致しない。中間結果のSCANは元テーブル全走査を意味しない。

## S12

使用箇所: B04

```sql
SELECT game_id AS game_id, source_key AS source_key, source_url AS source_url FROM source_snapshots WHERE game_id IN (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ORDER BY game_id ASC, source_key ASC
```

EXPLAIN QUERY PLAN:

```text
SEARCH source_snapshot_facts USING INDEX sqlite_autoindex_source_snapshot_facts_1 (game_id=?)
```

索引: SEARCH source_snapshot_facts USING INDEX sqlite_autoindex_source_snapshot_facts_1 (game_id=?)

この計画にSCANはない。

## S13

使用箇所: B05

```sql
SELECT player_id, full_name, team_name, year_teams_json FROM player_profiles WHERE (LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(player_profiles.canonical_name, player_profiles.full_name), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) = ? OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(player_profiles.canonical_name, player_profiles.full_name), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE ? OR (LENGTH(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(player_profiles.canonical_name, player_profiles.full_name), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜'))) >= 3 AND ? LIKE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(player_profiles.canonical_name, player_profiles.full_name), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%')) LIMIT 30
```

EXPLAIN QUERY PLAN:

```text
SCAN player_profiles
```

索引: 計画上の索引指定なし

走査箇所: SCAN player_profiles

走査の分析: 上記SQLの名前正規化・部分一致・相関照合による辞書検索、または集計中間結果の読み取り。関数を適用した名前条件は既存の生文字列INDEXと一致しない。中間結果のSCANは元テーブル全走査を意味しない。

## S14

使用箇所: B05

```sql
SELECT player_profiles.player_id, COALESCE(player_profiles.canonical_name, player_profiles.full_name) AS full_name, player_profiles.team_name, player_profiles.year_teams_json, player_profiles.current_team, player_aliases.season_from, player_aliases.season_to FROM player_aliases INNER JOIN player_profiles ON player_profiles.player_id = player_aliases.player_id WHERE (LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(player_aliases.alias, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) = ? OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(player_aliases.normalized_alias, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) = ?) LIMIT 50
```

EXPLAIN QUERY PLAN:

```text
SCAN player_aliases
SEARCH player_profiles USING INDEX sqlite_autoindex_player_profiles_1 (player_id=?)
```

索引: SEARCH player_profiles USING INDEX sqlite_autoindex_player_profiles_1 (player_id=?)

走査箇所: SCAN player_aliases

走査の分析: 上記SQLの名前正規化・部分一致・相関照合による辞書検索、または集計中間結果の読み取り。関数を適用した名前条件は既存の生文字列INDEXと一致しない。中間結果のSCANは元テーブル全走査を意味しない。

## S15

使用箇所: B05

```sql
SELECT COUNT(*) AS count FROM player_batting_stats WHERE player_id = ?
```

EXPLAIN QUERY PLAN:

```text
SEARCH player_batting_stats USING COVERING INDEX idx_player_batting_stats_player_id (player_id=?)
```

索引: SEARCH player_batting_stats USING COVERING INDEX idx_player_batting_stats_player_id (player_id=?)

この計画にSCANはない。

## S16

使用箇所: B05

```sql
SELECT COUNT(*) AS count FROM player_pitching_stats WHERE player_id = ?
```

EXPLAIN QUERY PLAN:

```text
SEARCH player_pitching_stats USING COVERING INDEX idx_player_pitching_stats_player_id (player_id=?)
```

索引: SEARCH player_pitching_stats USING COVERING INDEX idx_player_pitching_stats_player_id (player_id=?)

この計画にSCANはない。

## S17

使用箇所: B05

```sql
SELECT pitching_lines.pitcher_name AS label, pitching_lines.team AS team, COUNT(*) AS games, SUM(pitching_lines.pitch_count) AS pitches, SUM(pitching_lines.batters_faced) AS battersFaced, SUM(pitching_lines.hits) AS hitsAllowed, SUM(pitching_lines.home_runs) AS homeRunsAllowed, SUM(pitching_lines.walks) AS walks, SUM(pitching_lines.hit_batters) AS hitBatters, SUM(pitching_lines.strikeouts) AS strikeouts, SUM(pitching_lines.runs) AS runsAllowed, SUM(pitching_lines.earned_runs) AS earnedRuns, SUM(CASE WHEN pitching_lines.decision IN ('○', '勝', 'W') OR pitching_lines.win_loss_save_hold IN ('○', '勝', 'W') THEN 1 ELSE 0 END) AS wins, SUM(CASE WHEN pitching_lines.decision IN ('●', '敗', 'L') OR pitching_lines.win_loss_save_hold IN ('●', '敗', 'L') THEN 1 ELSE 0 END) AS losses, SUM(CASE WHEN pitching_lines.decision = 'S' OR pitching_lines.win_loss_save_hold = 'S' THEN 1 ELSE 0 END) AS saves, SUM(CASE WHEN pitching_lines.innings_pitched LIKE '%.%' THEN CAST(SUBSTR(pitching_lines.innings_pitched,1,INSTR(pitching_lines.innings_pitched,'.')-1) AS REAL)+CAST(SUBSTR(pitching_lines.innings_pitched,INSTR(pitching_lines.innings_pitched,'.')+1) AS REAL)/3.0 ELSE CAST(COALESCE(pitching_lines.innings_pitched,'0') AS REAL) END) AS inningsPitched FROM pitching_lines INNER JOIN games ON games.game_id = pitching_lines.game_id WHERE games.year = ? AND ( pitching_lines.pitcher_url LIKE ? OR EXISTS ( SELECT 1 FROM events player_id_events WHERE player_id_events.game_id = pitching_lines.game_id AND player_id_events.pitcher_name = pitching_lines.pitcher_name AND player_id_events.pitcher_url LIKE ? ) OR EXISTS ( SELECT 1 FROM player_profiles AS identity_profile LEFT JOIN player_aliases AS identity_alias ON identity_alias.player_id = identity_profile.player_id AND (identity_alias.season_from = 0 OR identity_alias.season_from <= games.year) AND (identity_alias.season_to = 0 OR identity_alias.season_to >= games.year) WHERE identity_profile.player_id = ? AND ( LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) = LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(identity_profile.canonical_name, identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) = LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(identity_alias.alias, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) OR ( LENGTH(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜'))) >= 1 AND LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(identity_profile.canonical_name, identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%' AND LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(json_extract(identity_profile.year_teams_json, '$."' || games.year || '"'), ''), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) <> '' AND (LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(json_extract(identity_profile.year_teams_json, '$."' || games.year || '"'), ''), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE '%' || LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.team, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%' OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.team, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE '%' || LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(json_extract(identity_profile.year_teams_json, '$."' || games.year || '"'), ''), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%') ) OR ( LENGTH(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜'))) >= 3 AND (LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(identity_profile.canonical_name, identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%' OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(identity_profile.canonical_name, identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%') AND NOT EXISTS ( SELECT 1 FROM player_profiles AS other_identity_profile WHERE other_identity_profile.player_id <> identity_profile.player_id AND LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(other_identity_profile.canonical_name, other_identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) <> LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(identity_profile.canonical_name, identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) AND (LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(other_identity_profile.canonical_name, other_identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%' OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(other_identity_profile.canonical_name, other_identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%') ) ) ) ) ) AND pitching_lines.team IN (?) GROUP BY pitching_lines.pitcher_name, pitching_lines.team HAVING SUM(CASE WHEN pitching_lines.innings_pitched LIKE '%.%' THEN CAST(SUBSTR(pitching_lines.innings_pitched,1,INSTR(pitching_lines.innings_pitched,'.')-1) AS REAL)+CAST(SUBSTR(pitching_lines.innings_pitched,INSTR(pitching_lines.innings_pitched,'.')+1) AS REAL)/3.0 ELSE CAST(COALESCE(pitching_lines.innings_pitched,'0') AS REAL) END) >= 5 AND SUM(CASE WHEN pitching_lines.innings_pitched LIKE '%.%' THEN CAST(SUBSTR(pitching_lines.innings_pitched,1,INSTR(pitching_lines.innings_pitched,'.')-1) AS REAL)+CAST(SUBSTR(pitching_lines.innings_pitched,INSTR(pitching_lines.innings_pitched,'.')+1) AS REAL)/3.0 ELSE CAST(COALESCE(pitching_lines.innings_pitched,'0') AS REAL) END) / COUNT(*) >= 5 AND COUNT(*) >= 3 ORDER BY CASE WHEN SUM(CASE WHEN pitching_lines.innings_pitched LIKE '%.%' THEN CAST(SUBSTR(pitching_lines.innings_pitched,1,INSTR(pitching_lines.innings_pitched,'.')-1) AS REAL)+CAST(SUBSTR(pitching_lines.innings_pitched,INSTR(pitching_lines.innings_pitched,'.')+1) AS REAL)/3.0 ELSE CAST(COALESCE(pitching_lines.innings_pitched,'0') AS REAL) END) > 0 THEN SUM(pitching_lines.earned_runs)*9.0/SUM(CASE WHEN pitching_lines.innings_pitched LIKE '%.%' THEN CAST(SUBSTR(pitching_lines.innings_pitched,1,INSTR(pitching_lines.innings_pitched,'.')-1) AS REAL)+CAST(SUBSTR(pitching_lines.innings_pitched,INSTR(pitching_lines.innings_pitched,'.')+1) AS REAL)/3.0 ELSE CAST(COALESCE(pitching_lines.innings_pitched,'0') AS REAL) END) ELSE 999 END ASC, label ASC LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SEARCH teams USING COVERING INDEX sqlite_autoindex_teams_1 (team_name=?)
SEARCH game_facts USING INDEX idx_games_year_date (year=?)
SEARCH pitching_line_facts USING INDEX sqlite_autoindex_pitching_line_facts_1 (game_id=? AND team_id=?)
SEARCH pitcher_name USING INTEGER PRIMARY KEY (rowid=?)
CORRELATED SCALAR SUBQUERY 1
SEARCH pitcher_name USING COVERING INDEX sqlite_autoindex_person_names_1 (name=?)
SEARCH event_facts USING INDEX sqlite_autoindex_event_facts_1 (game_id=?)
SEARCH event_types USING INTEGER PRIMARY KEY (rowid=?)
SEARCH event_subtypes USING INTEGER PRIMARY KEY (rowid=?)
SEARCH result_codes USING INTEGER PRIMARY KEY (rowid=?)
CORRELATED SCALAR SUBQUERY 3
SEARCH identity_profile USING INDEX sqlite_autoindex_player_profiles_1 (player_id=?)
SEARCH identity_alias USING INDEX sqlite_autoindex_player_aliases_1 (player_id=?) LEFT-JOIN
CORRELATED SCALAR SUBQUERY 2
SCAN other_identity_profile
SEARCH source_snapshot_facts USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH away USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH home USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH venues USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH index_source USING COVERING INDEX sqlite_autoindex_source_snapshot_facts_1 (game_id=? AND source_key=?) LEFT-JOIN
USE TEMP B-TREE FOR GROUP BY
USE TEMP B-TREE FOR ORDER BY
```

索引: SEARCH teams USING COVERING INDEX sqlite_autoindex_teams_1 (team_name=?) / SEARCH game_facts USING INDEX idx_games_year_date (year=?) / SEARCH pitching_line_facts USING INDEX sqlite_autoindex_pitching_line_facts_1 (game_id=? AND team_id=?) / SEARCH pitcher_name USING INTEGER PRIMARY KEY (rowid=?) / SEARCH pitcher_name USING COVERING INDEX sqlite_autoindex_person_names_1 (name=?) / SEARCH event_facts USING INDEX sqlite_autoindex_event_facts_1 (game_id=?) / SEARCH event_types USING INTEGER PRIMARY KEY (rowid=?) / SEARCH event_subtypes USING INTEGER PRIMARY KEY (rowid=?) / SEARCH result_codes USING INTEGER PRIMARY KEY (rowid=?) / SEARCH identity_profile USING INDEX sqlite_autoindex_player_profiles_1 (player_id=?) / SEARCH identity_alias USING INDEX sqlite_autoindex_player_aliases_1 (player_id=?) LEFT-JOIN / SEARCH source_snapshot_facts USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH away USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH home USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH venues USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH index_source USING COVERING INDEX sqlite_autoindex_source_snapshot_facts_1 (game_id=? AND source_key=?) LEFT-JOIN

走査箇所: SCAN other_identity_profile

走査の分析: 上記SQLの名前正規化・部分一致・相関照合による辞書検索、または集計中間結果の読み取り。関数を適用した名前条件は既存の生文字列INDEXと一致しない。中間結果のSCANは元テーブル全走査を意味しない。

## S18

使用箇所: B05

```sql
SELECT pitching_lines.pitcher_name AS label, pitching_lines.team AS team, COUNT(*) AS games, SUM(pitching_lines.pitch_count) AS pitches, SUM(pitching_lines.batters_faced) AS battersFaced, SUM(pitching_lines.hits) AS hitsAllowed, SUM(pitching_lines.home_runs) AS homeRunsAllowed, SUM(pitching_lines.walks) AS walks, SUM(pitching_lines.hit_batters) AS hitBatters, SUM(pitching_lines.strikeouts) AS strikeouts, SUM(pitching_lines.runs) AS runsAllowed, SUM(pitching_lines.earned_runs) AS earnedRuns, SUM(CASE WHEN pitching_lines.decision IN ('○', '勝', 'W') OR pitching_lines.win_loss_save_hold IN ('○', '勝', 'W') THEN 1 ELSE 0 END) AS wins, SUM(CASE WHEN pitching_lines.decision IN ('●', '敗', 'L') OR pitching_lines.win_loss_save_hold IN ('●', '敗', 'L') THEN 1 ELSE 0 END) AS losses, SUM(CASE WHEN pitching_lines.decision = 'S' OR pitching_lines.win_loss_save_hold = 'S' THEN 1 ELSE 0 END) AS saves, SUM(CASE WHEN pitching_lines.innings_pitched LIKE '%.%' THEN CAST(SUBSTR(pitching_lines.innings_pitched,1,INSTR(pitching_lines.innings_pitched,'.')-1) AS REAL)+CAST(SUBSTR(pitching_lines.innings_pitched,INSTR(pitching_lines.innings_pitched,'.')+1) AS REAL)/3.0 ELSE CAST(COALESCE(pitching_lines.innings_pitched,'0') AS REAL) END) AS inningsPitched FROM pitching_lines INNER JOIN games ON games.game_id = pitching_lines.game_id WHERE games.year = ? AND ( pitching_lines.pitcher_url LIKE ? OR EXISTS ( SELECT 1 FROM events player_id_events WHERE player_id_events.game_id = pitching_lines.game_id AND player_id_events.pitcher_name = pitching_lines.pitcher_name AND player_id_events.pitcher_url LIKE ? ) OR EXISTS ( SELECT 1 FROM player_profiles AS identity_profile LEFT JOIN player_aliases AS identity_alias ON identity_alias.player_id = identity_profile.player_id AND (identity_alias.season_from = 0 OR identity_alias.season_from <= games.year) AND (identity_alias.season_to = 0 OR identity_alias.season_to >= games.year) WHERE identity_profile.player_id = ? AND ( LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) = LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(identity_profile.canonical_name, identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) = LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(identity_alias.alias, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) OR ( LENGTH(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜'))) >= 1 AND LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(identity_profile.canonical_name, identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%' AND LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(json_extract(identity_profile.year_teams_json, '$."' || games.year || '"'), ''), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) <> '' AND (LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(json_extract(identity_profile.year_teams_json, '$."' || games.year || '"'), ''), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE '%' || LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.team, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%' OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.team, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE '%' || LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(json_extract(identity_profile.year_teams_json, '$."' || games.year || '"'), ''), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%') ) OR ( LENGTH(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜'))) >= 3 AND (LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(identity_profile.canonical_name, identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%' OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(identity_profile.canonical_name, identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%') AND NOT EXISTS ( SELECT 1 FROM player_profiles AS other_identity_profile WHERE other_identity_profile.player_id <> identity_profile.player_id AND LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(other_identity_profile.canonical_name, other_identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) <> LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(identity_profile.canonical_name, identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) AND (LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(other_identity_profile.canonical_name, other_identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%' OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(other_identity_profile.canonical_name, other_identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%') ) ) ) ) ) AND pitching_lines.team IN (?) GROUP BY pitching_lines.pitcher_name, pitching_lines.team HAVING SUM(CASE WHEN pitching_lines.innings_pitched LIKE '%.%' THEN CAST(SUBSTR(pitching_lines.innings_pitched,1,INSTR(pitching_lines.innings_pitched,'.')-1) AS REAL)+CAST(SUBSTR(pitching_lines.innings_pitched,INSTR(pitching_lines.innings_pitched,'.')+1) AS REAL)/3.0 ELSE CAST(COALESCE(pitching_lines.innings_pitched,'0') AS REAL) END) >= 5 AND SUM(CASE WHEN pitching_lines.innings_pitched LIKE '%.%' THEN CAST(SUBSTR(pitching_lines.innings_pitched,1,INSTR(pitching_lines.innings_pitched,'.')-1) AS REAL)+CAST(SUBSTR(pitching_lines.innings_pitched,INSTR(pitching_lines.innings_pitched,'.')+1) AS REAL)/3.0 ELSE CAST(COALESCE(pitching_lines.innings_pitched,'0') AS REAL) END) / COUNT(*) >= 5 AND COUNT(*) >= 3 ORDER BY CASE WHEN SUM(CASE WHEN pitching_lines.innings_pitched LIKE '%.%' THEN CAST(SUBSTR(pitching_lines.innings_pitched,1,INSTR(pitching_lines.innings_pitched,'.')-1) AS REAL)+CAST(SUBSTR(pitching_lines.innings_pitched,INSTR(pitching_lines.innings_pitched,'.')+1) AS REAL)/3.0 ELSE CAST(COALESCE(pitching_lines.innings_pitched,'0') AS REAL) END) > 0 THEN SUM(pitching_lines.earned_runs)*9.0/SUM(CASE WHEN pitching_lines.innings_pitched LIKE '%.%' THEN CAST(SUBSTR(pitching_lines.innings_pitched,1,INSTR(pitching_lines.innings_pitched,'.')-1) AS REAL)+CAST(SUBSTR(pitching_lines.innings_pitched,INSTR(pitching_lines.innings_pitched,'.')+1) AS REAL)/3.0 ELSE CAST(COALESCE(pitching_lines.innings_pitched,'0') AS REAL) END) ELSE 999 END ASC, label ASC LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SEARCH teams USING COVERING INDEX sqlite_autoindex_teams_1 (team_name=?)
SEARCH game_facts USING INDEX idx_games_year_date (year=?)
SEARCH pitching_line_facts USING INDEX sqlite_autoindex_pitching_line_facts_1 (game_id=? AND team_id=?)
SEARCH pitcher_name USING INTEGER PRIMARY KEY (rowid=?)
CORRELATED SCALAR SUBQUERY 1
SEARCH pitcher_name USING COVERING INDEX sqlite_autoindex_person_names_1 (name=?)
SEARCH event_facts USING INDEX sqlite_autoindex_event_facts_1 (game_id=?)
SEARCH event_types USING INTEGER PRIMARY KEY (rowid=?)
SEARCH event_subtypes USING INTEGER PRIMARY KEY (rowid=?)
SEARCH result_codes USING INTEGER PRIMARY KEY (rowid=?)
CORRELATED SCALAR SUBQUERY 3
SEARCH identity_profile USING INDEX sqlite_autoindex_player_profiles_1 (player_id=?)
SEARCH identity_alias USING INDEX sqlite_autoindex_player_aliases_1 (player_id=?) LEFT-JOIN
CORRELATED SCALAR SUBQUERY 2
SCAN other_identity_profile
SEARCH source_snapshot_facts USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH away USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH home USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH venues USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH index_source USING COVERING INDEX sqlite_autoindex_source_snapshot_facts_1 (game_id=? AND source_key=?) LEFT-JOIN
USE TEMP B-TREE FOR GROUP BY
USE TEMP B-TREE FOR ORDER BY
```

索引: SEARCH teams USING COVERING INDEX sqlite_autoindex_teams_1 (team_name=?) / SEARCH game_facts USING INDEX idx_games_year_date (year=?) / SEARCH pitching_line_facts USING INDEX sqlite_autoindex_pitching_line_facts_1 (game_id=? AND team_id=?) / SEARCH pitcher_name USING INTEGER PRIMARY KEY (rowid=?) / SEARCH pitcher_name USING COVERING INDEX sqlite_autoindex_person_names_1 (name=?) / SEARCH event_facts USING INDEX sqlite_autoindex_event_facts_1 (game_id=?) / SEARCH event_types USING INTEGER PRIMARY KEY (rowid=?) / SEARCH event_subtypes USING INTEGER PRIMARY KEY (rowid=?) / SEARCH result_codes USING INTEGER PRIMARY KEY (rowid=?) / SEARCH identity_profile USING INDEX sqlite_autoindex_player_profiles_1 (player_id=?) / SEARCH identity_alias USING INDEX sqlite_autoindex_player_aliases_1 (player_id=?) LEFT-JOIN / SEARCH source_snapshot_facts USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH away USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH home USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH venues USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH index_source USING COVERING INDEX sqlite_autoindex_source_snapshot_facts_1 (game_id=? AND source_key=?) LEFT-JOIN

走査箇所: SCAN other_identity_profile

走査の分析: 上記SQLの名前正規化・部分一致・相関照合による辞書検索、または集計中間結果の読み取り。関数を適用した名前条件は既存の生文字列INDEXと一致しない。中間結果のSCANは元テーブル全走査を意味しない。

## S19

使用箇所: B05

```sql
SELECT pitching_lines.pitcher_name AS label, pitching_lines.team AS team, COUNT(*) AS games, SUM(pitching_lines.pitch_count) AS pitches, SUM(pitching_lines.batters_faced) AS battersFaced, SUM(pitching_lines.hits) AS hitsAllowed, SUM(pitching_lines.home_runs) AS homeRunsAllowed, SUM(pitching_lines.walks) AS walks, SUM(pitching_lines.hit_batters) AS hitBatters, SUM(pitching_lines.strikeouts) AS strikeouts, SUM(pitching_lines.runs) AS runsAllowed, SUM(pitching_lines.earned_runs) AS earnedRuns, SUM(CASE WHEN pitching_lines.decision IN ('○', '勝', 'W') OR pitching_lines.win_loss_save_hold IN ('○', '勝', 'W') THEN 1 ELSE 0 END) AS wins, SUM(CASE WHEN pitching_lines.decision IN ('●', '敗', 'L') OR pitching_lines.win_loss_save_hold IN ('●', '敗', 'L') THEN 1 ELSE 0 END) AS losses, SUM(CASE WHEN pitching_lines.decision = 'S' OR pitching_lines.win_loss_save_hold = 'S' THEN 1 ELSE 0 END) AS saves, SUM(CASE WHEN pitching_lines.innings_pitched LIKE '%.%' THEN CAST(SUBSTR(pitching_lines.innings_pitched,1,INSTR(pitching_lines.innings_pitched,'.')-1) AS REAL)+CAST(SUBSTR(pitching_lines.innings_pitched,INSTR(pitching_lines.innings_pitched,'.')+1) AS REAL)/3.0 ELSE CAST(COALESCE(pitching_lines.innings_pitched,'0') AS REAL) END) AS inningsPitched FROM pitching_lines INNER JOIN games ON games.game_id = pitching_lines.game_id WHERE games.year = ? AND ( pitching_lines.pitcher_url LIKE ? OR EXISTS ( SELECT 1 FROM events player_id_events WHERE player_id_events.game_id = pitching_lines.game_id AND player_id_events.pitcher_name = pitching_lines.pitcher_name AND player_id_events.pitcher_url LIKE ? ) OR EXISTS ( SELECT 1 FROM player_profiles AS identity_profile LEFT JOIN player_aliases AS identity_alias ON identity_alias.player_id = identity_profile.player_id AND (identity_alias.season_from = 0 OR identity_alias.season_from <= games.year) AND (identity_alias.season_to = 0 OR identity_alias.season_to >= games.year) WHERE identity_profile.player_id = ? AND ( LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) = LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(identity_profile.canonical_name, identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) = LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(identity_alias.alias, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) OR ( LENGTH(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜'))) >= 1 AND LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(identity_profile.canonical_name, identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%' AND LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(json_extract(identity_profile.year_teams_json, '$."' || games.year || '"'), ''), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) <> '' AND (LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(json_extract(identity_profile.year_teams_json, '$."' || games.year || '"'), ''), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE '%' || LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.team, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%' OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.team, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE '%' || LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(json_extract(identity_profile.year_teams_json, '$."' || games.year || '"'), ''), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%') ) OR ( LENGTH(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜'))) >= 3 AND (LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(identity_profile.canonical_name, identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%' OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(identity_profile.canonical_name, identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%') AND NOT EXISTS ( SELECT 1 FROM player_profiles AS other_identity_profile WHERE other_identity_profile.player_id <> identity_profile.player_id AND LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(other_identity_profile.canonical_name, other_identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) <> LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(identity_profile.canonical_name, identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) AND (LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(other_identity_profile.canonical_name, other_identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%' OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(other_identity_profile.canonical_name, other_identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%') ) ) ) ) ) AND pitching_lines.team IN (?) GROUP BY pitching_lines.pitcher_name, pitching_lines.team HAVING SUM(CASE WHEN pitching_lines.innings_pitched LIKE '%.%' THEN CAST(SUBSTR(pitching_lines.innings_pitched,1,INSTR(pitching_lines.innings_pitched,'.')-1) AS REAL)+CAST(SUBSTR(pitching_lines.innings_pitched,INSTR(pitching_lines.innings_pitched,'.')+1) AS REAL)/3.0 ELSE CAST(COALESCE(pitching_lines.innings_pitched,'0') AS REAL) END) >= 5 AND SUM(CASE WHEN pitching_lines.innings_pitched LIKE '%.%' THEN CAST(SUBSTR(pitching_lines.innings_pitched,1,INSTR(pitching_lines.innings_pitched,'.')-1) AS REAL)+CAST(SUBSTR(pitching_lines.innings_pitched,INSTR(pitching_lines.innings_pitched,'.')+1) AS REAL)/3.0 ELSE CAST(COALESCE(pitching_lines.innings_pitched,'0') AS REAL) END) / COUNT(*) >= 5 AND COUNT(*) >= 3 ORDER BY CASE WHEN SUM(CASE WHEN pitching_lines.innings_pitched LIKE '%.%' THEN CAST(SUBSTR(pitching_lines.innings_pitched,1,INSTR(pitching_lines.innings_pitched,'.')-1) AS REAL)+CAST(SUBSTR(pitching_lines.innings_pitched,INSTR(pitching_lines.innings_pitched,'.')+1) AS REAL)/3.0 ELSE CAST(COALESCE(pitching_lines.innings_pitched,'0') AS REAL) END) > 0 THEN SUM(pitching_lines.earned_runs)*9.0/SUM(CASE WHEN pitching_lines.innings_pitched LIKE '%.%' THEN CAST(SUBSTR(pitching_lines.innings_pitched,1,INSTR(pitching_lines.innings_pitched,'.')-1) AS REAL)+CAST(SUBSTR(pitching_lines.innings_pitched,INSTR(pitching_lines.innings_pitched,'.')+1) AS REAL)/3.0 ELSE CAST(COALESCE(pitching_lines.innings_pitched,'0') AS REAL) END) ELSE 999 END ASC, label ASC LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SEARCH teams USING COVERING INDEX sqlite_autoindex_teams_1 (team_name=?)
SEARCH game_facts USING INDEX idx_games_year_date (year=?)
SEARCH pitching_line_facts USING INDEX sqlite_autoindex_pitching_line_facts_1 (game_id=? AND team_id=?)
SEARCH pitcher_name USING INTEGER PRIMARY KEY (rowid=?)
CORRELATED SCALAR SUBQUERY 1
SEARCH pitcher_name USING COVERING INDEX sqlite_autoindex_person_names_1 (name=?)
SEARCH event_facts USING INDEX sqlite_autoindex_event_facts_1 (game_id=?)
SEARCH event_types USING INTEGER PRIMARY KEY (rowid=?)
SEARCH event_subtypes USING INTEGER PRIMARY KEY (rowid=?)
SEARCH result_codes USING INTEGER PRIMARY KEY (rowid=?)
CORRELATED SCALAR SUBQUERY 3
SEARCH identity_profile USING INDEX sqlite_autoindex_player_profiles_1 (player_id=?)
SEARCH identity_alias USING INDEX sqlite_autoindex_player_aliases_1 (player_id=?) LEFT-JOIN
CORRELATED SCALAR SUBQUERY 2
SCAN other_identity_profile
SEARCH source_snapshot_facts USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH away USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH home USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH venues USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH index_source USING COVERING INDEX sqlite_autoindex_source_snapshot_facts_1 (game_id=? AND source_key=?) LEFT-JOIN
USE TEMP B-TREE FOR GROUP BY
USE TEMP B-TREE FOR ORDER BY
```

索引: SEARCH teams USING COVERING INDEX sqlite_autoindex_teams_1 (team_name=?) / SEARCH game_facts USING INDEX idx_games_year_date (year=?) / SEARCH pitching_line_facts USING INDEX sqlite_autoindex_pitching_line_facts_1 (game_id=? AND team_id=?) / SEARCH pitcher_name USING INTEGER PRIMARY KEY (rowid=?) / SEARCH pitcher_name USING COVERING INDEX sqlite_autoindex_person_names_1 (name=?) / SEARCH event_facts USING INDEX sqlite_autoindex_event_facts_1 (game_id=?) / SEARCH event_types USING INTEGER PRIMARY KEY (rowid=?) / SEARCH event_subtypes USING INTEGER PRIMARY KEY (rowid=?) / SEARCH result_codes USING INTEGER PRIMARY KEY (rowid=?) / SEARCH identity_profile USING INDEX sqlite_autoindex_player_profiles_1 (player_id=?) / SEARCH identity_alias USING INDEX sqlite_autoindex_player_aliases_1 (player_id=?) LEFT-JOIN / SEARCH source_snapshot_facts USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH away USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH home USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH venues USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH index_source USING COVERING INDEX sqlite_autoindex_source_snapshot_facts_1 (game_id=? AND source_key=?) LEFT-JOIN

走査箇所: SCAN other_identity_profile

走査の分析: 上記SQLの名前正規化・部分一致・相関照合による辞書検索、または集計中間結果の読み取り。関数を適用した名前条件は既存の生文字列INDEXと一致しない。中間結果のSCANは元テーブル全走査を意味しない。

## S20

使用箇所: B05

```sql
SELECT pitching_lines.pitcher_name AS label, pitching_lines.team AS team, COUNT(*) AS games, SUM(pitching_lines.pitch_count) AS pitches, SUM(pitching_lines.batters_faced) AS battersFaced, SUM(pitching_lines.hits) AS hitsAllowed, SUM(pitching_lines.home_runs) AS homeRunsAllowed, SUM(pitching_lines.walks) AS walks, SUM(pitching_lines.hit_batters) AS hitBatters, SUM(pitching_lines.strikeouts) AS strikeouts, SUM(pitching_lines.runs) AS runsAllowed, SUM(pitching_lines.earned_runs) AS earnedRuns, SUM(CASE WHEN pitching_lines.decision IN ('○', '勝', 'W') OR pitching_lines.win_loss_save_hold IN ('○', '勝', 'W') THEN 1 ELSE 0 END) AS wins, SUM(CASE WHEN pitching_lines.decision IN ('●', '敗', 'L') OR pitching_lines.win_loss_save_hold IN ('●', '敗', 'L') THEN 1 ELSE 0 END) AS losses, SUM(CASE WHEN pitching_lines.decision = 'S' OR pitching_lines.win_loss_save_hold = 'S' THEN 1 ELSE 0 END) AS saves, SUM(CASE WHEN pitching_lines.innings_pitched LIKE '%.%' THEN CAST(SUBSTR(pitching_lines.innings_pitched,1,INSTR(pitching_lines.innings_pitched,'.')-1) AS REAL)+CAST(SUBSTR(pitching_lines.innings_pitched,INSTR(pitching_lines.innings_pitched,'.')+1) AS REAL)/3.0 ELSE CAST(COALESCE(pitching_lines.innings_pitched,'0') AS REAL) END) AS inningsPitched FROM pitching_lines INNER JOIN games ON games.game_id = pitching_lines.game_id WHERE games.year = ? AND ( pitching_lines.pitcher_url LIKE ? OR EXISTS ( SELECT 1 FROM events player_id_events WHERE player_id_events.game_id = pitching_lines.game_id AND player_id_events.pitcher_name = pitching_lines.pitcher_name AND player_id_events.pitcher_url LIKE ? ) OR EXISTS ( SELECT 1 FROM player_profiles AS identity_profile LEFT JOIN player_aliases AS identity_alias ON identity_alias.player_id = identity_profile.player_id AND (identity_alias.season_from = 0 OR identity_alias.season_from <= games.year) AND (identity_alias.season_to = 0 OR identity_alias.season_to >= games.year) WHERE identity_profile.player_id = ? AND ( LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) = LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(identity_profile.canonical_name, identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) = LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(identity_alias.alias, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) OR ( LENGTH(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜'))) >= 1 AND LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(identity_profile.canonical_name, identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%' AND LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(json_extract(identity_profile.year_teams_json, '$."' || games.year || '"'), ''), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) <> '' AND (LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(json_extract(identity_profile.year_teams_json, '$."' || games.year || '"'), ''), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE '%' || LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.team, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%' OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.team, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE '%' || LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(json_extract(identity_profile.year_teams_json, '$."' || games.year || '"'), ''), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%') ) OR ( LENGTH(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜'))) >= 3 AND (LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(identity_profile.canonical_name, identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%' OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(identity_profile.canonical_name, identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%') AND NOT EXISTS ( SELECT 1 FROM player_profiles AS other_identity_profile WHERE other_identity_profile.player_id <> identity_profile.player_id AND LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(other_identity_profile.canonical_name, other_identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) <> LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(identity_profile.canonical_name, identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) AND (LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(other_identity_profile.canonical_name, other_identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%' OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(other_identity_profile.canonical_name, other_identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%') ) ) ) ) ) AND pitching_lines.team IN (?) GROUP BY pitching_lines.pitcher_name, pitching_lines.team HAVING SUM(CASE WHEN pitching_lines.innings_pitched LIKE '%.%' THEN CAST(SUBSTR(pitching_lines.innings_pitched,1,INSTR(pitching_lines.innings_pitched,'.')-1) AS REAL)+CAST(SUBSTR(pitching_lines.innings_pitched,INSTR(pitching_lines.innings_pitched,'.')+1) AS REAL)/3.0 ELSE CAST(COALESCE(pitching_lines.innings_pitched,'0') AS REAL) END) >= 5 AND SUM(CASE WHEN pitching_lines.innings_pitched LIKE '%.%' THEN CAST(SUBSTR(pitching_lines.innings_pitched,1,INSTR(pitching_lines.innings_pitched,'.')-1) AS REAL)+CAST(SUBSTR(pitching_lines.innings_pitched,INSTR(pitching_lines.innings_pitched,'.')+1) AS REAL)/3.0 ELSE CAST(COALESCE(pitching_lines.innings_pitched,'0') AS REAL) END) / COUNT(*) >= 5 AND COUNT(*) >= 3 ORDER BY CASE WHEN SUM(CASE WHEN pitching_lines.innings_pitched LIKE '%.%' THEN CAST(SUBSTR(pitching_lines.innings_pitched,1,INSTR(pitching_lines.innings_pitched,'.')-1) AS REAL)+CAST(SUBSTR(pitching_lines.innings_pitched,INSTR(pitching_lines.innings_pitched,'.')+1) AS REAL)/3.0 ELSE CAST(COALESCE(pitching_lines.innings_pitched,'0') AS REAL) END) > 0 THEN SUM(pitching_lines.earned_runs)*9.0/SUM(CASE WHEN pitching_lines.innings_pitched LIKE '%.%' THEN CAST(SUBSTR(pitching_lines.innings_pitched,1,INSTR(pitching_lines.innings_pitched,'.')-1) AS REAL)+CAST(SUBSTR(pitching_lines.innings_pitched,INSTR(pitching_lines.innings_pitched,'.')+1) AS REAL)/3.0 ELSE CAST(COALESCE(pitching_lines.innings_pitched,'0') AS REAL) END) ELSE 999 END ASC, label ASC LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SEARCH teams USING COVERING INDEX sqlite_autoindex_teams_1 (team_name=?)
SEARCH game_facts USING INDEX idx_games_year_date (year=?)
SEARCH pitching_line_facts USING INDEX sqlite_autoindex_pitching_line_facts_1 (game_id=? AND team_id=?)
SEARCH pitcher_name USING INTEGER PRIMARY KEY (rowid=?)
CORRELATED SCALAR SUBQUERY 1
SEARCH pitcher_name USING COVERING INDEX sqlite_autoindex_person_names_1 (name=?)
SEARCH event_facts USING INDEX sqlite_autoindex_event_facts_1 (game_id=?)
SEARCH event_types USING INTEGER PRIMARY KEY (rowid=?)
SEARCH event_subtypes USING INTEGER PRIMARY KEY (rowid=?)
SEARCH result_codes USING INTEGER PRIMARY KEY (rowid=?)
CORRELATED SCALAR SUBQUERY 3
SEARCH identity_profile USING INDEX sqlite_autoindex_player_profiles_1 (player_id=?)
SEARCH identity_alias USING INDEX sqlite_autoindex_player_aliases_1 (player_id=?) LEFT-JOIN
CORRELATED SCALAR SUBQUERY 2
SCAN other_identity_profile
SEARCH source_snapshot_facts USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH away USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH home USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH venues USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH index_source USING COVERING INDEX sqlite_autoindex_source_snapshot_facts_1 (game_id=? AND source_key=?) LEFT-JOIN
USE TEMP B-TREE FOR GROUP BY
USE TEMP B-TREE FOR ORDER BY
```

索引: SEARCH teams USING COVERING INDEX sqlite_autoindex_teams_1 (team_name=?) / SEARCH game_facts USING INDEX idx_games_year_date (year=?) / SEARCH pitching_line_facts USING INDEX sqlite_autoindex_pitching_line_facts_1 (game_id=? AND team_id=?) / SEARCH pitcher_name USING INTEGER PRIMARY KEY (rowid=?) / SEARCH pitcher_name USING COVERING INDEX sqlite_autoindex_person_names_1 (name=?) / SEARCH event_facts USING INDEX sqlite_autoindex_event_facts_1 (game_id=?) / SEARCH event_types USING INTEGER PRIMARY KEY (rowid=?) / SEARCH event_subtypes USING INTEGER PRIMARY KEY (rowid=?) / SEARCH result_codes USING INTEGER PRIMARY KEY (rowid=?) / SEARCH identity_profile USING INDEX sqlite_autoindex_player_profiles_1 (player_id=?) / SEARCH identity_alias USING INDEX sqlite_autoindex_player_aliases_1 (player_id=?) LEFT-JOIN / SEARCH source_snapshot_facts USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH away USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH home USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH venues USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH index_source USING COVERING INDEX sqlite_autoindex_source_snapshot_facts_1 (game_id=? AND source_key=?) LEFT-JOIN

走査箇所: SCAN other_identity_profile

走査の分析: 上記SQLの名前正規化・部分一致・相関照合による辞書検索、または集計中間結果の読み取り。関数を適用した名前条件は既存の生文字列INDEXと一致しない。中間結果のSCANは元テーブル全走査を意味しない。

## S21

使用箇所: B05

```sql
SELECT pitching_lines.pitcher_name AS label, pitching_lines.team AS team, COUNT(*) AS games, SUM(pitching_lines.pitch_count) AS pitches, SUM(pitching_lines.batters_faced) AS battersFaced, SUM(pitching_lines.hits) AS hitsAllowed, SUM(pitching_lines.home_runs) AS homeRunsAllowed, SUM(pitching_lines.walks) AS walks, SUM(pitching_lines.hit_batters) AS hitBatters, SUM(pitching_lines.strikeouts) AS strikeouts, SUM(pitching_lines.runs) AS runsAllowed, SUM(pitching_lines.earned_runs) AS earnedRuns, SUM(CASE WHEN pitching_lines.decision IN ('○', '勝', 'W') OR pitching_lines.win_loss_save_hold IN ('○', '勝', 'W') THEN 1 ELSE 0 END) AS wins, SUM(CASE WHEN pitching_lines.decision IN ('●', '敗', 'L') OR pitching_lines.win_loss_save_hold IN ('●', '敗', 'L') THEN 1 ELSE 0 END) AS losses, SUM(CASE WHEN pitching_lines.decision = 'S' OR pitching_lines.win_loss_save_hold = 'S' THEN 1 ELSE 0 END) AS saves, SUM(CASE WHEN pitching_lines.innings_pitched LIKE '%.%' THEN CAST(SUBSTR(pitching_lines.innings_pitched,1,INSTR(pitching_lines.innings_pitched,'.')-1) AS REAL)+CAST(SUBSTR(pitching_lines.innings_pitched,INSTR(pitching_lines.innings_pitched,'.')+1) AS REAL)/3.0 ELSE CAST(COALESCE(pitching_lines.innings_pitched,'0') AS REAL) END) AS inningsPitched FROM pitching_lines INNER JOIN games ON games.game_id = pitching_lines.game_id WHERE games.year = ? AND ( pitching_lines.pitcher_url LIKE ? OR EXISTS ( SELECT 1 FROM events player_id_events WHERE player_id_events.game_id = pitching_lines.game_id AND player_id_events.pitcher_name = pitching_lines.pitcher_name AND player_id_events.pitcher_url LIKE ? ) OR EXISTS ( SELECT 1 FROM player_profiles AS identity_profile LEFT JOIN player_aliases AS identity_alias ON identity_alias.player_id = identity_profile.player_id AND (identity_alias.season_from = 0 OR identity_alias.season_from <= games.year) AND (identity_alias.season_to = 0 OR identity_alias.season_to >= games.year) WHERE identity_profile.player_id = ? AND ( LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) = LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(identity_profile.canonical_name, identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) = LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(identity_alias.alias, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) OR ( LENGTH(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜'))) >= 1 AND LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(identity_profile.canonical_name, identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%' AND LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(json_extract(identity_profile.year_teams_json, '$."' || games.year || '"'), ''), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) <> '' AND (LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(json_extract(identity_profile.year_teams_json, '$."' || games.year || '"'), ''), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE '%' || LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.team, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%' OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.team, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE '%' || LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(json_extract(identity_profile.year_teams_json, '$."' || games.year || '"'), ''), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%') ) OR ( LENGTH(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜'))) >= 3 AND (LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(identity_profile.canonical_name, identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%' OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(identity_profile.canonical_name, identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%') AND NOT EXISTS ( SELECT 1 FROM player_profiles AS other_identity_profile WHERE other_identity_profile.player_id <> identity_profile.player_id AND LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(other_identity_profile.canonical_name, other_identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) <> LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(identity_profile.canonical_name, identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) AND (LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(other_identity_profile.canonical_name, other_identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%' OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(other_identity_profile.canonical_name, other_identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%') ) ) ) ) ) AND pitching_lines.team IN (?) GROUP BY pitching_lines.pitcher_name, pitching_lines.team HAVING SUM(CASE WHEN pitching_lines.innings_pitched LIKE '%.%' THEN CAST(SUBSTR(pitching_lines.innings_pitched,1,INSTR(pitching_lines.innings_pitched,'.')-1) AS REAL)+CAST(SUBSTR(pitching_lines.innings_pitched,INSTR(pitching_lines.innings_pitched,'.')+1) AS REAL)/3.0 ELSE CAST(COALESCE(pitching_lines.innings_pitched,'0') AS REAL) END) >= 5 AND SUM(CASE WHEN pitching_lines.innings_pitched LIKE '%.%' THEN CAST(SUBSTR(pitching_lines.innings_pitched,1,INSTR(pitching_lines.innings_pitched,'.')-1) AS REAL)+CAST(SUBSTR(pitching_lines.innings_pitched,INSTR(pitching_lines.innings_pitched,'.')+1) AS REAL)/3.0 ELSE CAST(COALESCE(pitching_lines.innings_pitched,'0') AS REAL) END) / COUNT(*) >= 5 AND COUNT(*) >= 3 ORDER BY CASE WHEN SUM(CASE WHEN pitching_lines.innings_pitched LIKE '%.%' THEN CAST(SUBSTR(pitching_lines.innings_pitched,1,INSTR(pitching_lines.innings_pitched,'.')-1) AS REAL)+CAST(SUBSTR(pitching_lines.innings_pitched,INSTR(pitching_lines.innings_pitched,'.')+1) AS REAL)/3.0 ELSE CAST(COALESCE(pitching_lines.innings_pitched,'0') AS REAL) END) > 0 THEN SUM(pitching_lines.earned_runs)*9.0/SUM(CASE WHEN pitching_lines.innings_pitched LIKE '%.%' THEN CAST(SUBSTR(pitching_lines.innings_pitched,1,INSTR(pitching_lines.innings_pitched,'.')-1) AS REAL)+CAST(SUBSTR(pitching_lines.innings_pitched,INSTR(pitching_lines.innings_pitched,'.')+1) AS REAL)/3.0 ELSE CAST(COALESCE(pitching_lines.innings_pitched,'0') AS REAL) END) ELSE 999 END ASC, label ASC LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SEARCH teams USING COVERING INDEX sqlite_autoindex_teams_1 (team_name=?)
SEARCH game_facts USING INDEX idx_games_year_date (year=?)
SEARCH pitching_line_facts USING INDEX sqlite_autoindex_pitching_line_facts_1 (game_id=? AND team_id=?)
SEARCH pitcher_name USING INTEGER PRIMARY KEY (rowid=?)
CORRELATED SCALAR SUBQUERY 1
SEARCH pitcher_name USING COVERING INDEX sqlite_autoindex_person_names_1 (name=?)
SEARCH event_facts USING INDEX sqlite_autoindex_event_facts_1 (game_id=?)
SEARCH event_types USING INTEGER PRIMARY KEY (rowid=?)
SEARCH event_subtypes USING INTEGER PRIMARY KEY (rowid=?)
SEARCH result_codes USING INTEGER PRIMARY KEY (rowid=?)
CORRELATED SCALAR SUBQUERY 3
SEARCH identity_profile USING INDEX sqlite_autoindex_player_profiles_1 (player_id=?)
SEARCH identity_alias USING INDEX sqlite_autoindex_player_aliases_1 (player_id=?) LEFT-JOIN
CORRELATED SCALAR SUBQUERY 2
SCAN other_identity_profile
SEARCH source_snapshot_facts USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH away USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH home USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH venues USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH index_source USING COVERING INDEX sqlite_autoindex_source_snapshot_facts_1 (game_id=? AND source_key=?) LEFT-JOIN
USE TEMP B-TREE FOR GROUP BY
USE TEMP B-TREE FOR ORDER BY
```

索引: SEARCH teams USING COVERING INDEX sqlite_autoindex_teams_1 (team_name=?) / SEARCH game_facts USING INDEX idx_games_year_date (year=?) / SEARCH pitching_line_facts USING INDEX sqlite_autoindex_pitching_line_facts_1 (game_id=? AND team_id=?) / SEARCH pitcher_name USING INTEGER PRIMARY KEY (rowid=?) / SEARCH pitcher_name USING COVERING INDEX sqlite_autoindex_person_names_1 (name=?) / SEARCH event_facts USING INDEX sqlite_autoindex_event_facts_1 (game_id=?) / SEARCH event_types USING INTEGER PRIMARY KEY (rowid=?) / SEARCH event_subtypes USING INTEGER PRIMARY KEY (rowid=?) / SEARCH result_codes USING INTEGER PRIMARY KEY (rowid=?) / SEARCH identity_profile USING INDEX sqlite_autoindex_player_profiles_1 (player_id=?) / SEARCH identity_alias USING INDEX sqlite_autoindex_player_aliases_1 (player_id=?) LEFT-JOIN / SEARCH source_snapshot_facts USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH away USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH home USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH venues USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH index_source USING COVERING INDEX sqlite_autoindex_source_snapshot_facts_1 (game_id=? AND source_key=?) LEFT-JOIN

走査箇所: SCAN other_identity_profile

走査の分析: 上記SQLの名前正規化・部分一致・相関照合による辞書検索、または集計中間結果の読み取り。関数を適用した名前条件は既存の生文字列INDEXと一致しない。中間結果のSCANは元テーブル全走査を意味しない。

## S22

使用箇所: B05

```sql
SELECT pitching_lines.pitcher_name AS label, pitching_lines.team AS team, COUNT(*) AS games, SUM(pitching_lines.pitch_count) AS pitches, SUM(pitching_lines.batters_faced) AS battersFaced, SUM(pitching_lines.hits) AS hitsAllowed, SUM(pitching_lines.home_runs) AS homeRunsAllowed, SUM(pitching_lines.walks) AS walks, SUM(pitching_lines.hit_batters) AS hitBatters, SUM(pitching_lines.strikeouts) AS strikeouts, SUM(pitching_lines.runs) AS runsAllowed, SUM(pitching_lines.earned_runs) AS earnedRuns, SUM(CASE WHEN pitching_lines.decision IN ('○', '勝', 'W') OR pitching_lines.win_loss_save_hold IN ('○', '勝', 'W') THEN 1 ELSE 0 END) AS wins, SUM(CASE WHEN pitching_lines.decision IN ('●', '敗', 'L') OR pitching_lines.win_loss_save_hold IN ('●', '敗', 'L') THEN 1 ELSE 0 END) AS losses, SUM(CASE WHEN pitching_lines.decision = 'S' OR pitching_lines.win_loss_save_hold = 'S' THEN 1 ELSE 0 END) AS saves, SUM(CASE WHEN pitching_lines.innings_pitched LIKE '%.%' THEN CAST(SUBSTR(pitching_lines.innings_pitched,1,INSTR(pitching_lines.innings_pitched,'.')-1) AS REAL)+CAST(SUBSTR(pitching_lines.innings_pitched,INSTR(pitching_lines.innings_pitched,'.')+1) AS REAL)/3.0 ELSE CAST(COALESCE(pitching_lines.innings_pitched,'0') AS REAL) END) AS inningsPitched FROM pitching_lines INNER JOIN games ON games.game_id = pitching_lines.game_id WHERE games.year = ? AND ( pitching_lines.pitcher_url LIKE ? OR EXISTS ( SELECT 1 FROM events player_id_events WHERE player_id_events.game_id = pitching_lines.game_id AND player_id_events.pitcher_name = pitching_lines.pitcher_name AND player_id_events.pitcher_url LIKE ? ) OR EXISTS ( SELECT 1 FROM player_profiles AS identity_profile LEFT JOIN player_aliases AS identity_alias ON identity_alias.player_id = identity_profile.player_id AND (identity_alias.season_from = 0 OR identity_alias.season_from <= games.year) AND (identity_alias.season_to = 0 OR identity_alias.season_to >= games.year) WHERE identity_profile.player_id = ? AND ( LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) = LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(identity_profile.canonical_name, identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) = LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(identity_alias.alias, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) OR ( LENGTH(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜'))) >= 1 AND LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(identity_profile.canonical_name, identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%' AND LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(json_extract(identity_profile.year_teams_json, '$."' || games.year || '"'), ''), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) <> '' AND (LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(json_extract(identity_profile.year_teams_json, '$."' || games.year || '"'), ''), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE '%' || LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.team, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%' OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.team, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE '%' || LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(json_extract(identity_profile.year_teams_json, '$."' || games.year || '"'), ''), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%') ) OR ( LENGTH(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜'))) >= 3 AND (LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(identity_profile.canonical_name, identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%' OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(identity_profile.canonical_name, identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%') AND NOT EXISTS ( SELECT 1 FROM player_profiles AS other_identity_profile WHERE other_identity_profile.player_id <> identity_profile.player_id AND LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(other_identity_profile.canonical_name, other_identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) <> LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(identity_profile.canonical_name, identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) AND (LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(other_identity_profile.canonical_name, other_identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%' OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(other_identity_profile.canonical_name, other_identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%') ) ) ) ) ) AND pitching_lines.team IN (?) GROUP BY pitching_lines.pitcher_name, pitching_lines.team HAVING SUM(CASE WHEN pitching_lines.innings_pitched LIKE '%.%' THEN CAST(SUBSTR(pitching_lines.innings_pitched,1,INSTR(pitching_lines.innings_pitched,'.')-1) AS REAL)+CAST(SUBSTR(pitching_lines.innings_pitched,INSTR(pitching_lines.innings_pitched,'.')+1) AS REAL)/3.0 ELSE CAST(COALESCE(pitching_lines.innings_pitched,'0') AS REAL) END) >= 5 AND SUM(CASE WHEN pitching_lines.innings_pitched LIKE '%.%' THEN CAST(SUBSTR(pitching_lines.innings_pitched,1,INSTR(pitching_lines.innings_pitched,'.')-1) AS REAL)+CAST(SUBSTR(pitching_lines.innings_pitched,INSTR(pitching_lines.innings_pitched,'.')+1) AS REAL)/3.0 ELSE CAST(COALESCE(pitching_lines.innings_pitched,'0') AS REAL) END) / COUNT(*) >= 5 AND COUNT(*) >= 3 ORDER BY CASE WHEN SUM(CASE WHEN pitching_lines.innings_pitched LIKE '%.%' THEN CAST(SUBSTR(pitching_lines.innings_pitched,1,INSTR(pitching_lines.innings_pitched,'.')-1) AS REAL)+CAST(SUBSTR(pitching_lines.innings_pitched,INSTR(pitching_lines.innings_pitched,'.')+1) AS REAL)/3.0 ELSE CAST(COALESCE(pitching_lines.innings_pitched,'0') AS REAL) END) > 0 THEN SUM(pitching_lines.earned_runs)*9.0/SUM(CASE WHEN pitching_lines.innings_pitched LIKE '%.%' THEN CAST(SUBSTR(pitching_lines.innings_pitched,1,INSTR(pitching_lines.innings_pitched,'.')-1) AS REAL)+CAST(SUBSTR(pitching_lines.innings_pitched,INSTR(pitching_lines.innings_pitched,'.')+1) AS REAL)/3.0 ELSE CAST(COALESCE(pitching_lines.innings_pitched,'0') AS REAL) END) ELSE 999 END ASC, label ASC LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SEARCH teams USING COVERING INDEX sqlite_autoindex_teams_1 (team_name=?)
SEARCH game_facts USING INDEX idx_games_year_date (year=?)
SEARCH pitching_line_facts USING INDEX sqlite_autoindex_pitching_line_facts_1 (game_id=? AND team_id=?)
SEARCH pitcher_name USING INTEGER PRIMARY KEY (rowid=?)
CORRELATED SCALAR SUBQUERY 1
SEARCH pitcher_name USING COVERING INDEX sqlite_autoindex_person_names_1 (name=?)
SEARCH event_facts USING INDEX sqlite_autoindex_event_facts_1 (game_id=?)
SEARCH event_types USING INTEGER PRIMARY KEY (rowid=?)
SEARCH event_subtypes USING INTEGER PRIMARY KEY (rowid=?)
SEARCH result_codes USING INTEGER PRIMARY KEY (rowid=?)
CORRELATED SCALAR SUBQUERY 3
SEARCH identity_profile USING INDEX sqlite_autoindex_player_profiles_1 (player_id=?)
SEARCH identity_alias USING INDEX sqlite_autoindex_player_aliases_1 (player_id=?) LEFT-JOIN
CORRELATED SCALAR SUBQUERY 2
SCAN other_identity_profile
SEARCH source_snapshot_facts USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH away USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH home USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH venues USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH index_source USING COVERING INDEX sqlite_autoindex_source_snapshot_facts_1 (game_id=? AND source_key=?) LEFT-JOIN
USE TEMP B-TREE FOR GROUP BY
USE TEMP B-TREE FOR ORDER BY
```

索引: SEARCH teams USING COVERING INDEX sqlite_autoindex_teams_1 (team_name=?) / SEARCH game_facts USING INDEX idx_games_year_date (year=?) / SEARCH pitching_line_facts USING INDEX sqlite_autoindex_pitching_line_facts_1 (game_id=? AND team_id=?) / SEARCH pitcher_name USING INTEGER PRIMARY KEY (rowid=?) / SEARCH pitcher_name USING COVERING INDEX sqlite_autoindex_person_names_1 (name=?) / SEARCH event_facts USING INDEX sqlite_autoindex_event_facts_1 (game_id=?) / SEARCH event_types USING INTEGER PRIMARY KEY (rowid=?) / SEARCH event_subtypes USING INTEGER PRIMARY KEY (rowid=?) / SEARCH result_codes USING INTEGER PRIMARY KEY (rowid=?) / SEARCH identity_profile USING INDEX sqlite_autoindex_player_profiles_1 (player_id=?) / SEARCH identity_alias USING INDEX sqlite_autoindex_player_aliases_1 (player_id=?) LEFT-JOIN / SEARCH source_snapshot_facts USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH away USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH home USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH venues USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH index_source USING COVERING INDEX sqlite_autoindex_source_snapshot_facts_1 (game_id=? AND source_key=?) LEFT-JOIN

走査箇所: SCAN other_identity_profile

走査の分析: 上記SQLの名前正規化・部分一致・相関照合による辞書検索、または集計中間結果の読み取り。関数を適用した名前条件は既存の生文字列INDEXと一致しない。中間結果のSCANは元テーブル全走査を意味しない。

## S23

使用箇所: B05

```sql
SELECT pitching_lines.pitcher_name AS label, pitching_lines.team AS team, COUNT(*) AS games, SUM(pitching_lines.pitch_count) AS pitches, SUM(pitching_lines.batters_faced) AS battersFaced, SUM(pitching_lines.hits) AS hitsAllowed, SUM(pitching_lines.home_runs) AS homeRunsAllowed, SUM(pitching_lines.walks) AS walks, SUM(pitching_lines.hit_batters) AS hitBatters, SUM(pitching_lines.strikeouts) AS strikeouts, SUM(pitching_lines.runs) AS runsAllowed, SUM(pitching_lines.earned_runs) AS earnedRuns, SUM(CASE WHEN pitching_lines.decision IN ('○', '勝', 'W') OR pitching_lines.win_loss_save_hold IN ('○', '勝', 'W') THEN 1 ELSE 0 END) AS wins, SUM(CASE WHEN pitching_lines.decision IN ('●', '敗', 'L') OR pitching_lines.win_loss_save_hold IN ('●', '敗', 'L') THEN 1 ELSE 0 END) AS losses, SUM(CASE WHEN pitching_lines.decision = 'S' OR pitching_lines.win_loss_save_hold = 'S' THEN 1 ELSE 0 END) AS saves, SUM(CASE WHEN pitching_lines.innings_pitched LIKE '%.%' THEN CAST(SUBSTR(pitching_lines.innings_pitched,1,INSTR(pitching_lines.innings_pitched,'.')-1) AS REAL)+CAST(SUBSTR(pitching_lines.innings_pitched,INSTR(pitching_lines.innings_pitched,'.')+1) AS REAL)/3.0 ELSE CAST(COALESCE(pitching_lines.innings_pitched,'0') AS REAL) END) AS inningsPitched FROM pitching_lines INNER JOIN games ON games.game_id = pitching_lines.game_id WHERE games.year = ? AND ( pitching_lines.pitcher_url LIKE ? OR EXISTS ( SELECT 1 FROM events player_id_events WHERE player_id_events.game_id = pitching_lines.game_id AND player_id_events.pitcher_name = pitching_lines.pitcher_name AND player_id_events.pitcher_url LIKE ? ) OR EXISTS ( SELECT 1 FROM player_profiles AS identity_profile LEFT JOIN player_aliases AS identity_alias ON identity_alias.player_id = identity_profile.player_id AND (identity_alias.season_from = 0 OR identity_alias.season_from <= games.year) AND (identity_alias.season_to = 0 OR identity_alias.season_to >= games.year) WHERE identity_profile.player_id = ? AND ( LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) = LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(identity_profile.canonical_name, identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) = LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(identity_alias.alias, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) OR ( LENGTH(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜'))) >= 1 AND LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(identity_profile.canonical_name, identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%' AND LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(json_extract(identity_profile.year_teams_json, '$."' || games.year || '"'), ''), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) <> '' AND (LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(json_extract(identity_profile.year_teams_json, '$."' || games.year || '"'), ''), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE '%' || LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.team, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%' OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.team, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE '%' || LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(json_extract(identity_profile.year_teams_json, '$."' || games.year || '"'), ''), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%') ) OR ( LENGTH(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜'))) >= 3 AND (LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(identity_profile.canonical_name, identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%' OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(identity_profile.canonical_name, identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%') AND NOT EXISTS ( SELECT 1 FROM player_profiles AS other_identity_profile WHERE other_identity_profile.player_id <> identity_profile.player_id AND LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(other_identity_profile.canonical_name, other_identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) <> LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(identity_profile.canonical_name, identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) AND (LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(other_identity_profile.canonical_name, other_identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%' OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(pitching_lines.pitcher_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(other_identity_profile.canonical_name, other_identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%') ) ) ) ) ) AND pitching_lines.team IN (?) GROUP BY pitching_lines.pitcher_name, pitching_lines.team HAVING SUM(CASE WHEN pitching_lines.innings_pitched LIKE '%.%' THEN CAST(SUBSTR(pitching_lines.innings_pitched,1,INSTR(pitching_lines.innings_pitched,'.')-1) AS REAL)+CAST(SUBSTR(pitching_lines.innings_pitched,INSTR(pitching_lines.innings_pitched,'.')+1) AS REAL)/3.0 ELSE CAST(COALESCE(pitching_lines.innings_pitched,'0') AS REAL) END) >= 5 AND SUM(CASE WHEN pitching_lines.innings_pitched LIKE '%.%' THEN CAST(SUBSTR(pitching_lines.innings_pitched,1,INSTR(pitching_lines.innings_pitched,'.')-1) AS REAL)+CAST(SUBSTR(pitching_lines.innings_pitched,INSTR(pitching_lines.innings_pitched,'.')+1) AS REAL)/3.0 ELSE CAST(COALESCE(pitching_lines.innings_pitched,'0') AS REAL) END) / COUNT(*) >= 5 AND COUNT(*) >= 3 ORDER BY CASE WHEN SUM(CASE WHEN pitching_lines.innings_pitched LIKE '%.%' THEN CAST(SUBSTR(pitching_lines.innings_pitched,1,INSTR(pitching_lines.innings_pitched,'.')-1) AS REAL)+CAST(SUBSTR(pitching_lines.innings_pitched,INSTR(pitching_lines.innings_pitched,'.')+1) AS REAL)/3.0 ELSE CAST(COALESCE(pitching_lines.innings_pitched,'0') AS REAL) END) > 0 THEN SUM(pitching_lines.earned_runs)*9.0/SUM(CASE WHEN pitching_lines.innings_pitched LIKE '%.%' THEN CAST(SUBSTR(pitching_lines.innings_pitched,1,INSTR(pitching_lines.innings_pitched,'.')-1) AS REAL)+CAST(SUBSTR(pitching_lines.innings_pitched,INSTR(pitching_lines.innings_pitched,'.')+1) AS REAL)/3.0 ELSE CAST(COALESCE(pitching_lines.innings_pitched,'0') AS REAL) END) ELSE 999 END ASC, label ASC LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SEARCH teams USING COVERING INDEX sqlite_autoindex_teams_1 (team_name=?)
SEARCH game_facts USING INDEX idx_games_year_date (year=?)
SEARCH pitching_line_facts USING INDEX sqlite_autoindex_pitching_line_facts_1 (game_id=? AND team_id=?)
SEARCH pitcher_name USING INTEGER PRIMARY KEY (rowid=?)
CORRELATED SCALAR SUBQUERY 1
SEARCH pitcher_name USING COVERING INDEX sqlite_autoindex_person_names_1 (name=?)
SEARCH event_facts USING INDEX sqlite_autoindex_event_facts_1 (game_id=?)
SEARCH event_types USING INTEGER PRIMARY KEY (rowid=?)
SEARCH event_subtypes USING INTEGER PRIMARY KEY (rowid=?)
SEARCH result_codes USING INTEGER PRIMARY KEY (rowid=?)
CORRELATED SCALAR SUBQUERY 3
SEARCH identity_profile USING INDEX sqlite_autoindex_player_profiles_1 (player_id=?)
SEARCH identity_alias USING INDEX sqlite_autoindex_player_aliases_1 (player_id=?) LEFT-JOIN
CORRELATED SCALAR SUBQUERY 2
SCAN other_identity_profile
SEARCH source_snapshot_facts USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH away USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH home USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH venues USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH index_source USING COVERING INDEX sqlite_autoindex_source_snapshot_facts_1 (game_id=? AND source_key=?) LEFT-JOIN
USE TEMP B-TREE FOR GROUP BY
USE TEMP B-TREE FOR ORDER BY
```

索引: SEARCH teams USING COVERING INDEX sqlite_autoindex_teams_1 (team_name=?) / SEARCH game_facts USING INDEX idx_games_year_date (year=?) / SEARCH pitching_line_facts USING INDEX sqlite_autoindex_pitching_line_facts_1 (game_id=? AND team_id=?) / SEARCH pitcher_name USING INTEGER PRIMARY KEY (rowid=?) / SEARCH pitcher_name USING COVERING INDEX sqlite_autoindex_person_names_1 (name=?) / SEARCH event_facts USING INDEX sqlite_autoindex_event_facts_1 (game_id=?) / SEARCH event_types USING INTEGER PRIMARY KEY (rowid=?) / SEARCH event_subtypes USING INTEGER PRIMARY KEY (rowid=?) / SEARCH result_codes USING INTEGER PRIMARY KEY (rowid=?) / SEARCH identity_profile USING INDEX sqlite_autoindex_player_profiles_1 (player_id=?) / SEARCH identity_alias USING INDEX sqlite_autoindex_player_aliases_1 (player_id=?) LEFT-JOIN / SEARCH source_snapshot_facts USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH away USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH home USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH venues USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH index_source USING COVERING INDEX sqlite_autoindex_source_snapshot_facts_1 (game_id=? AND source_key=?) LEFT-JOIN

走査箇所: SCAN other_identity_profile

走査の分析: 上記SQLの名前正規化・部分一致・相関照合による辞書検索、または集計中間結果の読み取り。関数を適用した名前条件は既存の生文字列INDEXと一致しない。中間結果のSCANは元テーブル全走査を意味しない。

## S24

使用箇所: B06

```sql
SELECT player_batting_stats.player_name AS label, MAX(player_batting_stats.team_name) AS team, COUNT(*) AS rows, SUM(CAST(COALESCE(json_extract(values_json, '$.試合'), '0') AS INTEGER)) AS games, SUM(CAST(COALESCE(json_extract(values_json, '$.打席'), '0') AS INTEGER)) AS plateAppearances, SUM(CAST(COALESCE(json_extract(values_json, '$.打数'), '0') AS INTEGER)) AS atBats, SUM(CAST(COALESCE(json_extract(values_json, '$.得点'), '0') AS INTEGER)) AS runs, SUM(CAST(COALESCE(json_extract(values_json, '$.安打'), '0') AS INTEGER)) AS hits, SUM(CAST(COALESCE(json_extract(values_json, '$.本塁打'), '0') AS INTEGER)) AS homeRuns, SUM(CAST(COALESCE(json_extract(values_json, '$.塁打'), '0') AS INTEGER)) AS totalBases, SUM(CAST(COALESCE(json_extract(values_json, '$.打点'), '0') AS INTEGER)) AS runsBattedIn, SUM(CAST(COALESCE(json_extract(values_json, '$.盗塁'), '0') AS INTEGER)) AS stolenBases, SUM(CAST(COALESCE(json_extract(values_json, '$.四球'), '0') AS INTEGER)) AS walks, SUM(CAST(COALESCE(json_extract(values_json, '$.死球'), '0') AS INTEGER)) AS hitByPitch, SUM(CAST(COALESCE(json_extract(values_json, '$.犠飛'), '0') AS INTEGER)) AS sacrificeFlies, SUM(CAST(COALESCE(json_extract(values_json, '$.三振'), '0') AS INTEGER)) AS strikeouts FROM player_batting_stats WHERE json_extract(values_json, '$.試合') IS NOT NULL AND player_batting_stats.year = ? GROUP BY player_batting_stats.player_name ORDER BY SUM(CAST(COALESCE(json_extract(values_json, '$.本塁打'), '0') AS INTEGER)) DESC, label ASC LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SEARCH player_batting_stats USING INDEX sqlite_autoindex_player_batting_stats_1 (year=?)
USE TEMP B-TREE FOR GROUP BY
USE TEMP B-TREE FOR ORDER BY
```

索引: SEARCH player_batting_stats USING INDEX sqlite_autoindex_player_batting_stats_1 (year=?)

この計画にSCANはない。

## S25

使用箇所: B07

```sql
SELECT COUNT(DISTINCT player_batting_stats.team_name) AS teamCount FROM player_batting_stats WHERE json_extract(values_json, '$.試合') IS NOT NULL AND player_batting_stats.year = ? AND player_batting_stats.team_name IN (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
```

EXPLAIN QUERY PLAN:

```text
USE TEMP B-TREE FOR count(DISTINCT)
SEARCH player_batting_stats USING INDEX sqlite_autoindex_player_batting_stats_1 (year=?)
```

索引: SEARCH player_batting_stats USING INDEX sqlite_autoindex_player_batting_stats_1 (year=?)

この計画にSCANはない。

## S26

使用箇所: B07

```sql
SELECT player_batting_stats.player_name AS label, MAX(player_batting_stats.team_name) AS team, COUNT(*) AS rows, SUM(CAST(COALESCE(json_extract(values_json, '$.試合'), '0') AS INTEGER)) AS games, SUM(CAST(COALESCE(json_extract(values_json, '$.打席'), '0') AS INTEGER)) AS plateAppearances, SUM(CAST(COALESCE(json_extract(values_json, '$.打数'), '0') AS INTEGER)) AS atBats, SUM(CAST(COALESCE(json_extract(values_json, '$.得点'), '0') AS INTEGER)) AS runs, SUM(CAST(COALESCE(json_extract(values_json, '$.安打'), '0') AS INTEGER)) AS hits, SUM(CAST(COALESCE(json_extract(values_json, '$.本塁打'), '0') AS INTEGER)) AS homeRuns, SUM(CAST(COALESCE(json_extract(values_json, '$.塁打'), '0') AS INTEGER)) AS totalBases, SUM(CAST(COALESCE(json_extract(values_json, '$.打点'), '0') AS INTEGER)) AS runsBattedIn, SUM(CAST(COALESCE(json_extract(values_json, '$.盗塁'), '0') AS INTEGER)) AS stolenBases, SUM(CAST(COALESCE(json_extract(values_json, '$.四球'), '0') AS INTEGER)) AS walks, SUM(CAST(COALESCE(json_extract(values_json, '$.死球'), '0') AS INTEGER)) AS hitByPitch, SUM(CAST(COALESCE(json_extract(values_json, '$.犠飛'), '0') AS INTEGER)) AS sacrificeFlies, SUM(CAST(COALESCE(json_extract(values_json, '$.三振'), '0') AS INTEGER)) AS strikeouts FROM player_batting_stats WHERE json_extract(values_json, '$.試合') IS NOT NULL AND player_batting_stats.year = ? AND player_batting_stats.team_name IN (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) GROUP BY player_batting_stats.player_name ORDER BY SUM(CAST(COALESCE(json_extract(values_json, '$.本塁打'), '0') AS INTEGER)) DESC, label ASC LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SEARCH player_batting_stats USING INDEX sqlite_autoindex_player_batting_stats_1 (year=?)
USE TEMP B-TREE FOR GROUP BY
USE TEMP B-TREE FOR ORDER BY
```

索引: SEARCH player_batting_stats USING INDEX sqlite_autoindex_player_batting_stats_1 (year=?)

この計画にSCANはない。

## S27

使用箇所: B08

```sql
SELECT player_batting_stats.player_name AS label, MAX(player_batting_stats.team_name) AS team, COUNT(*) AS rows, SUM(CAST(COALESCE(json_extract(values_json, '$.試合'), '0') AS INTEGER)) AS games, SUM(CAST(COALESCE(json_extract(values_json, '$.打席'), '0') AS INTEGER)) AS plateAppearances, SUM(CAST(COALESCE(json_extract(values_json, '$.打数'), '0') AS INTEGER)) AS atBats, SUM(CAST(COALESCE(json_extract(values_json, '$.得点'), '0') AS INTEGER)) AS runs, SUM(CAST(COALESCE(json_extract(values_json, '$.安打'), '0') AS INTEGER)) AS hits, SUM(CAST(COALESCE(json_extract(values_json, '$.本塁打'), '0') AS INTEGER)) AS homeRuns, SUM(CAST(COALESCE(json_extract(values_json, '$.塁打'), '0') AS INTEGER)) AS totalBases, SUM(CAST(COALESCE(json_extract(values_json, '$.打点'), '0') AS INTEGER)) AS runsBattedIn, SUM(CAST(COALESCE(json_extract(values_json, '$.盗塁'), '0') AS INTEGER)) AS stolenBases, SUM(CAST(COALESCE(json_extract(values_json, '$.四球'), '0') AS INTEGER)) AS walks, SUM(CAST(COALESCE(json_extract(values_json, '$.死球'), '0') AS INTEGER)) AS hitByPitch, SUM(CAST(COALESCE(json_extract(values_json, '$.犠飛'), '0') AS INTEGER)) AS sacrificeFlies, SUM(CAST(COALESCE(json_extract(values_json, '$.三振'), '0') AS INTEGER)) AS strikeouts FROM player_batting_stats WHERE json_extract(values_json, '$.試合') IS NOT NULL AND player_batting_stats.year = ? AND player_batting_stats.team_name IN (?, ?) GROUP BY player_batting_stats.player_name ORDER BY SUM(CAST(COALESCE(json_extract(values_json, '$.安打'), '0') AS INTEGER)) DESC, SUM(CAST(COALESCE(json_extract(values_json, '$.打数'), '0') AS INTEGER)) DESC, label ASC LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SEARCH player_batting_stats USING INDEX sqlite_autoindex_player_batting_stats_1 (year=?)
USE TEMP B-TREE FOR GROUP BY
USE TEMP B-TREE FOR ORDER BY
```

索引: SEARCH player_batting_stats USING INDEX sqlite_autoindex_player_batting_stats_1 (year=?)

この計画にSCANはない。

## S28

使用箇所: B08

```sql
SELECT player_batting_stats.player_name AS label, MAX(player_batting_stats.team_name) AS team, COUNT(*) AS rows, SUM(CAST(COALESCE(json_extract(values_json, '$.試合'), '0') AS INTEGER)) AS games, SUM(CAST(COALESCE(json_extract(values_json, '$.打席'), '0') AS INTEGER)) AS plateAppearances, SUM(CAST(COALESCE(json_extract(values_json, '$.打数'), '0') AS INTEGER)) AS atBats, SUM(CAST(COALESCE(json_extract(values_json, '$.得点'), '0') AS INTEGER)) AS runs, SUM(CAST(COALESCE(json_extract(values_json, '$.安打'), '0') AS INTEGER)) AS hits, SUM(CAST(COALESCE(json_extract(values_json, '$.本塁打'), '0') AS INTEGER)) AS homeRuns, SUM(CAST(COALESCE(json_extract(values_json, '$.塁打'), '0') AS INTEGER)) AS totalBases, SUM(CAST(COALESCE(json_extract(values_json, '$.打点'), '0') AS INTEGER)) AS runsBattedIn, SUM(CAST(COALESCE(json_extract(values_json, '$.盗塁'), '0') AS INTEGER)) AS stolenBases, SUM(CAST(COALESCE(json_extract(values_json, '$.四球'), '0') AS INTEGER)) AS walks, SUM(CAST(COALESCE(json_extract(values_json, '$.死球'), '0') AS INTEGER)) AS hitByPitch, SUM(CAST(COALESCE(json_extract(values_json, '$.犠飛'), '0') AS INTEGER)) AS sacrificeFlies, SUM(CAST(COALESCE(json_extract(values_json, '$.三振'), '0') AS INTEGER)) AS strikeouts FROM player_batting_stats WHERE json_extract(values_json, '$.試合') IS NOT NULL AND player_batting_stats.year = ? AND player_batting_stats.team_name IN (?, ?) GROUP BY player_batting_stats.player_name ORDER BY SUM(CAST(COALESCE(json_extract(values_json, '$.安打'), '0') AS INTEGER)) DESC, SUM(CAST(COALESCE(json_extract(values_json, '$.打数'), '0') AS INTEGER)) DESC, label ASC LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SEARCH player_batting_stats USING INDEX sqlite_autoindex_player_batting_stats_1 (year=?)
USE TEMP B-TREE FOR GROUP BY
USE TEMP B-TREE FOR ORDER BY
```

索引: SEARCH player_batting_stats USING INDEX sqlite_autoindex_player_batting_stats_1 (year=?)

この計画にSCANはない。

## S29

使用箇所: B09, B12, MT02-Turn1, MT02-Turn2

```sql
SELECT player_batting_stats.player_name AS label, MAX(player_batting_stats.team_name) AS team, COUNT(*) AS rows, SUM(CAST(COALESCE(json_extract(values_json, '$.試合'), '0') AS INTEGER)) AS games, SUM(CAST(COALESCE(json_extract(values_json, '$.打席'), '0') AS INTEGER)) AS plateAppearances, SUM(CAST(COALESCE(json_extract(values_json, '$.打数'), '0') AS INTEGER)) AS atBats, SUM(CAST(COALESCE(json_extract(values_json, '$.得点'), '0') AS INTEGER)) AS runs, SUM(CAST(COALESCE(json_extract(values_json, '$.安打'), '0') AS INTEGER)) AS hits, SUM(CAST(COALESCE(json_extract(values_json, '$.本塁打'), '0') AS INTEGER)) AS homeRuns, SUM(CAST(COALESCE(json_extract(values_json, '$.塁打'), '0') AS INTEGER)) AS totalBases, SUM(CAST(COALESCE(json_extract(values_json, '$.打点'), '0') AS INTEGER)) AS runsBattedIn, SUM(CAST(COALESCE(json_extract(values_json, '$.盗塁'), '0') AS INTEGER)) AS stolenBases, SUM(CAST(COALESCE(json_extract(values_json, '$.四球'), '0') AS INTEGER)) AS walks, SUM(CAST(COALESCE(json_extract(values_json, '$.死球'), '0') AS INTEGER)) AS hitByPitch, SUM(CAST(COALESCE(json_extract(values_json, '$.犠飛'), '0') AS INTEGER)) AS sacrificeFlies, SUM(CAST(COALESCE(json_extract(values_json, '$.三振'), '0') AS INTEGER)) AS strikeouts FROM player_batting_stats WHERE json_extract(values_json, '$.試合') IS NOT NULL AND player_batting_stats.year = ? AND player_batting_stats.team_name IN (?, ?) AND REPLACE(REPLACE(REPLACE(REPLACE(player_batting_stats.player_name, ' ', ''), char(12288), ''), '*', ''), '＊', '') LIKE ? GROUP BY player_batting_stats.player_name ORDER BY SUM(CAST(COALESCE(json_extract(values_json, '$.安打'), '0') AS INTEGER)) DESC, SUM(CAST(COALESCE(json_extract(values_json, '$.打数'), '0') AS INTEGER)) DESC, label ASC LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SEARCH player_batting_stats USING INDEX sqlite_autoindex_player_batting_stats_1 (year=?)
USE TEMP B-TREE FOR GROUP BY
USE TEMP B-TREE FOR ORDER BY
```

索引: SEARCH player_batting_stats USING INDEX sqlite_autoindex_player_batting_stats_1 (year=?)

この計画にSCANはない。

## S30

使用箇所: B09, B12, MT02-Turn1, MT02-Turn2

```sql
WITH selected_batting AS MATERIALIZED ( SELECT batting_line_facts.* FROM batting_line_facts INDEXED BY idx_batting_name_game INNER JOIN game_facts ON game_facts.game_id = batting_line_facts.game_id INNER JOIN teams ON teams.team_id = batting_line_facts.team_id INNER JOIN person_names ON person_names.name_id = batting_line_facts.player_name_id LEFT JOIN positions ON positions.position_id = batting_line_facts.position_id WHERE game_facts.year = ? AND batting_line_facts.player_name_id IN ( SELECT person_names.name_id FROM person_names WHERE (SUBSTR(REPLACE(REPLACE(REPLACE(REPLACE(?, ' ', ''), char(12288), ''), '*', ''), '＊', ''), 1, LENGTH(REPLACE(REPLACE(REPLACE(REPLACE(person_names.name, ' ', ''), char(12288), ''), '*', ''), '＊', ''))) = REPLACE(REPLACE(REPLACE(REPLACE(person_names.name, ' ', ''), char(12288), ''), '*', ''), '＊', '') AND LENGTH(REPLACE(REPLACE(REPLACE(REPLACE(person_names.name, ' ', ''), char(12288), ''), '*', ''), '＊', '')) >= 1) ) AND teams.team_name IN (?, ?) ) SELECT MAX(person_names.name) AS label, MAX(person_names.name) AS playerName, MAX(teams.team_name) AS team, COUNT(*) AS games, SUM(batting_line_facts.at_bats) AS atBats, SUM(batting_line_facts.runs) AS runs, SUM(batting_line_facts.hits) AS hits, SUM(batting_line_facts.runs_batted_in) AS runsBattedIn, SUM(batting_line_facts.stolen_bases) AS stolenBases, SUM(COALESCE(batting_line_facts.walks, 0)) AS walks, SUM(COALESCE(batting_line_facts.strikeouts, 0)) AS strikeouts, COALESCE(SUM(hr_stats.hr_count), 0) AS homeRuns, COALESCE(SUM(hr_stats.extra_bases), 0) AS extraBases FROM selected_batting AS batting_line_facts INNER JOIN game_facts ON game_facts.game_id = batting_line_facts.game_id INNER JOIN teams ON teams.team_id = batting_line_facts.team_id INNER JOIN person_names ON person_names.name_id = batting_line_facts.player_name_id LEFT JOIN positions ON positions.position_id = batting_line_facts.position_id LEFT JOIN ( SELECT event_facts.game_id, event_facts.batter_player_id, batter_name.name AS batter_name, SUM(CASE WHEN result_codes.result_text LIKE '%ホームラン%' THEN 1 ELSE 0 END) AS hr_count, SUM(CASE WHEN result_codes.result_text LIKE '%ホームラン%' THEN 3 WHEN result_codes.result_text LIKE '%三塁打%' OR result_codes.result_text LIKE '%スリーベース%' THEN 2 WHEN result_codes.result_text LIKE '%二塁打%' OR result_codes.result_text LIKE '%ツーベース%' THEN 1 ELSE 0 END) AS extra_bases FROM event_facts INNER JOIN game_facts AS hr_games ON hr_games.game_id = event_facts.game_id INNER JOIN result_codes ON result_codes.result_code_id = event_facts.result_code_id LEFT JOIN person_names AS batter_name ON batter_name.name_id = event_facts.batter_name_id WHERE (result_codes.result_text LIKE '%ホームラン%' OR result_codes.result_text LIKE '%三塁打%' OR result_codes.result_text LIKE '%スリーベース%' OR result_codes.result_text LIKE '%二塁打%' OR result_codes.result_text LIKE '%ツーベース%') AND event_facts.game_id IN (SELECT game_id FROM selected_batting) AND hr_games.year = ? GROUP BY event_facts.game_id, event_facts.batter_player_id, batter_name.name ) hr_stats ON hr_stats.game_id = batting_line_facts.game_id AND ( (hr_stats.batter_player_id IS NOT NULL AND hr_stats.batter_player_id = batting_line_facts.player_id) OR hr_stats.batter_name = person_names.name ) GROUP BY CASE WHEN batting_line_facts.player_id IS NOT NULL AND batting_line_facts.player_id <> '' THEN 'id:' || batting_line_facts.player_id ELSE 'name:' || REPLACE(REPLACE(REPLACE(REPLACE(person_names.name, ' ', ''), char(12288), ''), '*', ''), '＊', '') END ORDER BY SUM(batting_line_facts.hits) DESC, SUM(batting_line_facts.at_bats) DESC, label ASC LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
MATERIALIZE selected_batting
SEARCH batting_line_facts USING INDEX idx_batting_name_game (player_name_id=?)
LIST SUBQUERY 1
SCAN person_names
SEARCH game_facts USING INDEX sqlite_autoindex_game_facts_1 (game_id=?)
SEARCH teams USING INTEGER PRIMARY KEY (rowid=?)
SEARCH person_names USING INTEGER PRIMARY KEY (rowid=?)
MATERIALIZE hr_stats
SEARCH hr_games USING INDEX idx_games_year_date (year=?)
LIST SUBQUERY 3
SCAN selected_batting
SEARCH event_facts USING INDEX sqlite_autoindex_event_facts_1 (game_id=?)
SEARCH result_codes USING INTEGER PRIMARY KEY (rowid=?)
SEARCH batter_name USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
USE TEMP B-TREE FOR GROUP BY
SCAN batting_line_facts
SEARCH teams USING INTEGER PRIMARY KEY (rowid=?)
SEARCH person_names USING INTEGER PRIMARY KEY (rowid=?)
SEARCH game_facts USING COVERING INDEX sqlite_autoindex_game_facts_1 (game_id=?)
SEARCH positions USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH hr_stats USING AUTOMATIC COVERING INDEX (game_id=?) LEFT-JOIN
USE TEMP B-TREE FOR GROUP BY
USE TEMP B-TREE FOR ORDER BY
```

索引: SEARCH batting_line_facts USING INDEX idx_batting_name_game (player_name_id=?) / SEARCH game_facts USING INDEX sqlite_autoindex_game_facts_1 (game_id=?) / SEARCH teams USING INTEGER PRIMARY KEY (rowid=?) / SEARCH person_names USING INTEGER PRIMARY KEY (rowid=?) / SEARCH hr_games USING INDEX idx_games_year_date (year=?) / SEARCH event_facts USING INDEX sqlite_autoindex_event_facts_1 (game_id=?) / SEARCH result_codes USING INTEGER PRIMARY KEY (rowid=?) / SEARCH batter_name USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH game_facts USING COVERING INDEX sqlite_autoindex_game_facts_1 (game_id=?) / SEARCH positions USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH hr_stats USING AUTOMATIC COVERING INDEX (game_id=?) LEFT-JOIN

走査箇所: SCAN person_names / SCAN selected_batting / SCAN batting_line_facts

fact走査の分析: 上記SQLの文字列・名前・URL条件、OR/相関条件、対象全体の集計を区別する必要がある。この仮引数の計画ではfact索引への検索に変換されていない。対象全体の集計は集合の読み取りが必要であり、SCAN表示のみから不要な走査とは断定しない。

## S31

使用箇所: B11

```sql
SELECT 'bis:' || player_pitching_stats.year || ':' || player_pitching_stats.team_id || ':' || CASE WHEN player_pitching_stats.source_url LIKE '%idp2%' THEN 'idp2' ELSE 'idp1' END AS gameId, printf('%04d-01-01', player_pitching_stats.year) AS gameDate, player_pitching_stats.team_name AS team, player_pitching_stats.player_name AS pitcherName, COALESCE(json_extract(player_pitching_stats.values_json, '$.投球回'), '0') AS inningsPitched, CAST(COALESCE(json_extract(player_pitching_stats.values_json, '$.投球数'), '0') AS INTEGER) AS pitchCount, CAST(COALESCE(json_extract(player_pitching_stats.values_json, '$.三振'), json_extract(player_pitching_stats.values_json, '$.奪三振'), '0') AS INTEGER) AS strikeouts, CAST(COALESCE(json_extract(player_pitching_stats.values_json, '$.失点'), '0') AS INTEGER) AS runs, CAST(COALESCE(json_extract(player_pitching_stats.values_json, '$.自責点'), '0') AS INTEGER) AS earnedRuns, CASE WHEN player_pitching_stats.source_url LIKE '%idp2%' THEN 'bis_pitching_farm' ELSE 'bis_pitching' END AS sourceKind, player_pitching_stats.source_url AS sourceUrl, player_pitching_stats.values_json AS statsJson FROM player_pitching_stats WHERE player_pitching_stats.year = ? AND player_pitching_stats.team_name IN (?, ?) AND REPLACE(REPLACE(REPLACE(REPLACE(player_pitching_stats.player_name, ' ', ''), char(12288), ''), '*', ''), '＊', '') LIKE ? ORDER BY player_pitching_stats.year DESC, player_pitching_stats.team_id ASC, player_pitching_stats.row_index ASC LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SEARCH player_pitching_stats USING INDEX sqlite_autoindex_player_pitching_stats_1 (year=?)
USE TEMP B-TREE FOR RIGHT PART OF ORDER BY
```

索引: SEARCH player_pitching_stats USING INDEX sqlite_autoindex_player_pitching_stats_1 (year=?)

この計画にSCANはない。

## S32

使用箇所: B11

```sql
SELECT pitching_line_facts.game_id AS gameId, game_facts.game_date AS gameDate, teams.team_name AS team, person_names.name AS pitcherName, pitching_line_facts.innings_pitched AS inningsPitched, pitching_line_facts.pitch_count AS pitchCount, pitching_line_facts.strikeouts AS strikeouts, pitching_line_facts.runs AS runs, pitching_line_facts.earned_runs AS earnedRuns, 'box' AS sourceKind, source_snapshot_facts.source_url AS sourceUrl, NULL AS statsJson FROM pitching_line_facts INNER JOIN game_facts ON game_facts.game_id = pitching_line_facts.game_id INNER JOIN teams ON teams.team_id = pitching_line_facts.team_id INNER JOIN person_names ON person_names.name_id = pitching_line_facts.pitcher_name_id LEFT JOIN source_snapshot_facts ON source_snapshot_facts.source_snapshot_id = pitching_line_facts.source_snapshot_id WHERE (SUBSTR(REPLACE(REPLACE(REPLACE(REPLACE(?, ' ', ''), char(12288), ''), '*', ''), '＊', ''), 1, LENGTH(REPLACE(REPLACE(REPLACE(REPLACE(person_names.name, ' ', ''), char(12288), ''), '*', ''), '＊', ''))) = REPLACE(REPLACE(REPLACE(REPLACE(person_names.name, ' ', ''), char(12288), ''), '*', ''), '＊', '') AND LENGTH(REPLACE(REPLACE(REPLACE(REPLACE(person_names.name, ' ', ''), char(12288), ''), '*', ''), '＊', '')) >= 1) AND game_facts.year = ? AND teams.team_name IN (?, ?) ORDER BY game_facts.game_date ASC, pitching_line_facts.game_id ASC, pitching_line_facts.row_index ASC LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SEARCH game_facts USING INDEX idx_games_year_date (year=?)
SEARCH pitching_line_facts USING INDEX sqlite_autoindex_pitching_line_facts_1 (game_id=?)
SEARCH person_names USING INTEGER PRIMARY KEY (rowid=?)
SEARCH teams USING INTEGER PRIMARY KEY (rowid=?)
SEARCH source_snapshot_facts USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
USE TEMP B-TREE FOR RIGHT PART OF ORDER BY
```

索引: SEARCH game_facts USING INDEX idx_games_year_date (year=?) / SEARCH pitching_line_facts USING INDEX sqlite_autoindex_pitching_line_facts_1 (game_id=?) / SEARCH person_names USING INTEGER PRIMARY KEY (rowid=?) / SEARCH teams USING INTEGER PRIMARY KEY (rowid=?) / SEARCH source_snapshot_facts USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN

この計画にSCANはない。

## S33

使用箇所: B11

```sql
SELECT 'bis:' || player_pitching_stats.year || ':' || player_pitching_stats.team_id || ':' || CASE WHEN player_pitching_stats.source_url LIKE '%idp2%' THEN 'idp2' ELSE 'idp1' END AS gameId, printf('%04d-01-01', player_pitching_stats.year) AS gameDate, player_pitching_stats.team_name AS team, player_pitching_stats.player_name AS pitcherName, COALESCE(json_extract(player_pitching_stats.values_json, '$.投球回'), '0') AS inningsPitched, CAST(COALESCE(json_extract(player_pitching_stats.values_json, '$.投球数'), '0') AS INTEGER) AS pitchCount, CAST(COALESCE(json_extract(player_pitching_stats.values_json, '$.三振'), json_extract(player_pitching_stats.values_json, '$.奪三振'), '0') AS INTEGER) AS strikeouts, CAST(COALESCE(json_extract(player_pitching_stats.values_json, '$.失点'), '0') AS INTEGER) AS runs, CAST(COALESCE(json_extract(player_pitching_stats.values_json, '$.自責点'), '0') AS INTEGER) AS earnedRuns, CASE WHEN player_pitching_stats.source_url LIKE '%idp2%' THEN 'bis_pitching_farm' ELSE 'bis_pitching' END AS sourceKind, player_pitching_stats.source_url AS sourceUrl, player_pitching_stats.values_json AS statsJson FROM player_pitching_stats WHERE player_pitching_stats.year = ? AND player_pitching_stats.team_name IN (?, ?) AND REPLACE(REPLACE(REPLACE(REPLACE(player_pitching_stats.player_name, ' ', ''), char(12288), ''), '*', ''), '＊', '') LIKE ? ORDER BY player_pitching_stats.year DESC, player_pitching_stats.team_id ASC, player_pitching_stats.row_index ASC LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SEARCH player_pitching_stats USING INDEX sqlite_autoindex_player_pitching_stats_1 (year=?)
USE TEMP B-TREE FOR RIGHT PART OF ORDER BY
```

索引: SEARCH player_pitching_stats USING INDEX sqlite_autoindex_player_pitching_stats_1 (year=?)

この計画にSCANはない。

## S34

使用箇所: B11

```sql
SELECT pitching_line_facts.game_id AS gameId, game_facts.game_date AS gameDate, teams.team_name AS team, person_names.name AS pitcherName, pitching_line_facts.innings_pitched AS inningsPitched, pitching_line_facts.pitch_count AS pitchCount, pitching_line_facts.strikeouts AS strikeouts, pitching_line_facts.runs AS runs, pitching_line_facts.earned_runs AS earnedRuns, 'box' AS sourceKind, source_snapshot_facts.source_url AS sourceUrl, NULL AS statsJson FROM pitching_line_facts INNER JOIN game_facts ON game_facts.game_id = pitching_line_facts.game_id INNER JOIN teams ON teams.team_id = pitching_line_facts.team_id INNER JOIN person_names ON person_names.name_id = pitching_line_facts.pitcher_name_id LEFT JOIN source_snapshot_facts ON source_snapshot_facts.source_snapshot_id = pitching_line_facts.source_snapshot_id WHERE game_facts.game_date = ? ORDER BY game_facts.game_date ASC, pitching_line_facts.game_id ASC, pitching_line_facts.row_index ASC LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SEARCH game_facts USING INDEX idx_games_date (game_date=?)
SEARCH pitching_line_facts USING INDEX sqlite_autoindex_pitching_line_facts_1 (game_id=?)
SEARCH teams USING INTEGER PRIMARY KEY (rowid=?)
SEARCH person_names USING INTEGER PRIMARY KEY (rowid=?)
SEARCH source_snapshot_facts USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
USE TEMP B-TREE FOR RIGHT PART OF ORDER BY
```

索引: SEARCH game_facts USING INDEX idx_games_date (game_date=?) / SEARCH pitching_line_facts USING INDEX sqlite_autoindex_pitching_line_facts_1 (game_id=?) / SEARCH teams USING INTEGER PRIMARY KEY (rowid=?) / SEARCH person_names USING INTEGER PRIMARY KEY (rowid=?) / SEARCH source_snapshot_facts USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN

この計画にSCANはない。

## S35

使用箇所: B13, B27, MT01-Turn1, MT01-Turn2, MT01-Turn3

```sql
SELECT '阪神' AS label, COUNT(*) AS total_games, SUM(CASE WHEN ((games.home_team_name IN ('阪神', '阪神タイガース', 'Hanshin') AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER) > CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER)) OR (games.away_team_name IN ('阪神', '阪神タイガース', 'Hanshin') AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER) > CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER))) THEN 1 ELSE 0 END) AS wins, SUM(CASE WHEN ((games.home_team_name IN ('阪神', '阪神タイガース', 'Hanshin') AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER) < CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER)) OR (games.away_team_name IN ('阪神', '阪神タイガース', 'Hanshin') AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER) < CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER))) THEN 1 ELSE 0 END) AS losses, SUM(CASE WHEN CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER) IS NOT NULL AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER) = CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER) THEN 1 ELSE 0 END) AS draws FROM games WHERE games.game_id NOT LIKE 'f%' AND (games.home_team_name IN ('阪神', '阪神タイガース', 'Hanshin') OR games.away_team_name IN ('阪神', '阪神タイガース', 'Hanshin')) AND games.year = ? ORDER BY wins DESC, losses ASC, label ASC LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SEARCH game_facts USING INDEX idx_games_year_date (year=?)
SEARCH away USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH home USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH venues USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH index_source USING COVERING INDEX sqlite_autoindex_source_snapshot_facts_1 (game_id=? AND source_key=?) LEFT-JOIN
```

索引: SEARCH game_facts USING INDEX idx_games_year_date (year=?) / SEARCH away USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH home USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH venues USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH index_source USING COVERING INDEX sqlite_autoindex_source_snapshot_facts_1 (game_id=? AND source_key=?) LEFT-JOIN

この計画にSCANはない。

## S36

使用箇所: B17

```sql
SELECT player_id, full_name, team_name, year_teams_json FROM player_profiles WHERE (LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(player_profiles.canonical_name, player_profiles.full_name), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) = ? OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(player_profiles.canonical_name, player_profiles.full_name), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE ? OR (LENGTH(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(player_profiles.canonical_name, player_profiles.full_name), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜'))) >= 3 AND ? LIKE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(player_profiles.canonical_name, player_profiles.full_name), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%')) LIMIT 30
```

EXPLAIN QUERY PLAN:

```text
SCAN player_profiles
```

索引: 計画上の索引指定なし

走査箇所: SCAN player_profiles

走査の分析: 上記SQLの名前正規化・部分一致・相関照合による辞書検索、または集計中間結果の読み取り。関数を適用した名前条件は既存の生文字列INDEXと一致しない。中間結果のSCANは元テーブル全走査を意味しない。

## S37

使用箇所: B17

```sql
SELECT player_profiles.player_id, COALESCE(player_profiles.canonical_name, player_profiles.full_name) AS full_name, player_profiles.team_name, player_profiles.year_teams_json, player_profiles.current_team, player_aliases.season_from, player_aliases.season_to FROM player_aliases INNER JOIN player_profiles ON player_profiles.player_id = player_aliases.player_id WHERE (LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(player_aliases.alias, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) = ? OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(player_aliases.normalized_alias, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) = ?) LIMIT 50
```

EXPLAIN QUERY PLAN:

```text
SCAN player_aliases
SEARCH player_profiles USING INDEX sqlite_autoindex_player_profiles_1 (player_id=?)
```

索引: SEARCH player_profiles USING INDEX sqlite_autoindex_player_profiles_1 (player_id=?)

走査箇所: SCAN player_aliases

走査の分析: 上記SQLの名前正規化・部分一致・相関照合による辞書検索、または集計中間結果の読み取り。関数を適用した名前条件は既存の生文字列INDEXと一致しない。中間結果のSCANは元テーブル全走査を意味しない。

## S38

使用箇所: B17

```sql
SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1
```

EXPLAIN QUERY PLAN:

```text
SCAN sqlite_master
```

索引: 計画上の索引指定なし

走査箇所: SCAN sqlite_master

走査の分析: 上記SQLの名前正規化・部分一致・相関照合による辞書検索、または集計中間結果の読み取り。関数を適用した名前条件は既存の生文字列INDEXと一致しない。中間結果のSCANは元テーブル全走査を意味しない。

## S39

使用箇所: B17

```sql
SELECT name_id AS nameId, name FROM person_names WHERE (LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(person_names.name, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) = ? OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(person_names.name, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE ? OR (SUBSTR(?, 1, LENGTH(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(person_names.name, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')))) = LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(person_names.name, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) AND LENGTH(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(person_names.name, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜'))) >= 2)) LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SCAN person_names
```

索引: 計画上の索引指定なし

走査箇所: SCAN person_names

走査の分析: 上記SQLの名前正規化・部分一致・相関照合による辞書検索、または集計中間結果の読み取り。関数を適用した名前条件は既存の生文字列INDEXと一致しない。中間結果のSCANは元テーブル全走査を意味しない。

## S40

使用箇所: B17

```sql
SELECT person_names.name AS name, CASE WHEN batting_line_facts.player_id IS NOT NULL THEN 'https://npb.jp/bis/players/' || batting_line_facts.player_id || '.html' ELSE NULL END AS player_url, ? AS role, teams.team_name AS team, game_facts.year AS year FROM person_names INNER JOIN batting_line_facts INDEXED BY idx_batting_name_game ON batting_line_facts.player_name_id = person_names.name_id INNER JOIN game_facts ON game_facts.game_id = batting_line_facts.game_id INNER JOIN teams ON teams.team_id = batting_line_facts.team_id WHERE person_names.name_id IN (?, ?) LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SEARCH person_names USING INTEGER PRIMARY KEY (rowid=?)
SEARCH batting_line_facts USING INDEX idx_batting_name_game (player_name_id=?)
SEARCH game_facts USING INDEX sqlite_autoindex_game_facts_1 (game_id=?)
SEARCH teams USING INTEGER PRIMARY KEY (rowid=?)
```

索引: SEARCH person_names USING INTEGER PRIMARY KEY (rowid=?) / SEARCH batting_line_facts USING INDEX idx_batting_name_game (player_name_id=?) / SEARCH game_facts USING INDEX sqlite_autoindex_game_facts_1 (game_id=?) / SEARCH teams USING INTEGER PRIMARY KEY (rowid=?)

この計画にSCANはない。

## S41

使用箇所: B17

```sql
SELECT person_names.name AS name, CASE WHEN pitching_line_facts.pitcher_id IS NOT NULL THEN 'https://npb.jp/bis/players/' || pitching_line_facts.pitcher_id || '.html' ELSE NULL END AS player_url, ? AS role, teams.team_name AS team, game_facts.year AS year FROM person_names INNER JOIN pitching_line_facts INDEXED BY idx_pitching_name_game ON pitching_line_facts.pitcher_name_id = person_names.name_id INNER JOIN game_facts ON game_facts.game_id = pitching_line_facts.game_id INNER JOIN teams ON teams.team_id = pitching_line_facts.team_id WHERE person_names.name_id IN (?, ?) LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SEARCH person_names USING INTEGER PRIMARY KEY (rowid=?)
SEARCH pitching_line_facts USING INDEX idx_pitching_name_game (pitcher_name_id=?)
SEARCH game_facts USING INDEX sqlite_autoindex_game_facts_1 (game_id=?)
SEARCH teams USING INTEGER PRIMARY KEY (rowid=?)
```

索引: SEARCH person_names USING INTEGER PRIMARY KEY (rowid=?) / SEARCH pitching_line_facts USING INDEX idx_pitching_name_game (pitcher_name_id=?) / SEARCH game_facts USING INDEX sqlite_autoindex_game_facts_1 (game_id=?) / SEARCH teams USING INTEGER PRIMARY KEY (rowid=?)

この計画にSCANはない。

## S42

使用箇所: B17

```sql
SELECT person_names.name AS name, CASE WHEN roster_entry_facts.player_id IS NOT NULL THEN 'https://npb.jp/bis/players/' || roster_entry_facts.player_id || '.html' ELSE NULL END AS player_url, ? AS role, teams.team_name AS team, game_facts.year AS year FROM person_names INNER JOIN roster_entry_facts INDEXED BY idx_roster_name_game ON roster_entry_facts.player_name_id = person_names.name_id INNER JOIN game_facts ON game_facts.game_id = roster_entry_facts.game_id INNER JOIN teams ON teams.team_id = roster_entry_facts.team_id WHERE person_names.name_id IN (?, ?) LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SEARCH person_names USING INTEGER PRIMARY KEY (rowid=?)
SEARCH roster_entry_facts USING INDEX idx_roster_name_game (player_name_id=?)
SEARCH game_facts USING INDEX sqlite_autoindex_game_facts_1 (game_id=?)
SEARCH teams USING INTEGER PRIMARY KEY (rowid=?)
```

索引: SEARCH person_names USING INTEGER PRIMARY KEY (rowid=?) / SEARCH roster_entry_facts USING INDEX idx_roster_name_game (player_name_id=?) / SEARCH game_facts USING INDEX sqlite_autoindex_game_facts_1 (game_id=?) / SEARCH teams USING INTEGER PRIMARY KEY (rowid=?)

この計画にSCANはない。

## S43

使用箇所: B17

```sql
SELECT current_team_roster.year AS year, 'bis:' || current_team_roster.year || ':' || current_team_roster.team_id || ':rst' AS gameId, printf('%04d-01-01', current_team_roster.year) AS gameDate, current_team_roster.team_name AS team, current_team_roster.player_name AS playerName, current_team_roster.player_id AS playerId, 'bis_roster' AS sourceKind, current_team_roster.source_url AS sourceUrl, 0 AS sourceRank FROM current_team_roster WHERE current_team_roster.player_key NOT LIKE 'f%' AND current_team_roster.player_name IS NOT NULL AND current_team_roster.player_name <> '' AND (current_team_roster.player_id = ?) AND current_team_roster.year = ? LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SEARCH current_team_roster USING INDEX idx_current_team_roster_player_id (player_id=?)
```

索引: SEARCH current_team_roster USING INDEX idx_current_team_roster_player_id (player_id=?)

この計画にSCANはない。

## S44

使用箇所: B17

```sql
SELECT games.year AS year, roster_entries.game_id AS gameId, games.date AS gameDate, roster_entries.team AS team, roster_entries.player_name AS playerName, CASE WHEN roster_entries.player_url LIKE '%/players/%.html' THEN REPLACE(SUBSTR(roster_entries.player_url, INSTR(roster_entries.player_url, '/players/') + 9), '.html', '') WHEN roster_entries.player_url IS NOT NULL AND roster_entries.player_url <> '' THEN roster_entries.player_url ELSE NULL END AS playerId, 'roster' AS sourceKind, COALESCE(roster_entries.source_url, roster_source.source_url) AS sourceUrl, 1 AS sourceRank FROM roster_entries INNER JOIN games ON games.game_id = roster_entries.game_id LEFT JOIN source_snapshots AS roster_source ON roster_source.game_id = roster_entries.game_id AND roster_source.source_key = 'roster' WHERE roster_entries.game_id NOT LIKE 'f%' AND roster_entries.player_name IS NOT NULL AND roster_entries.player_name <> '' AND (CASE WHEN roster_entries.player_url LIKE '%/players/%.html' THEN REPLACE(SUBSTR(roster_entries.player_url, INSTR(roster_entries.player_url, '/players/') + 9), '.html', '') WHEN roster_entries.player_url IS NOT NULL AND roster_entries.player_url <> '' THEN roster_entries.player_url ELSE NULL END = ?) AND games.year = ? LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SEARCH game_facts USING INDEX idx_games_year_date (year=?)
SEARCH roster_entry_facts USING INDEX sqlite_autoindex_roster_entry_facts_1 (game_id=?)
SEARCH player_name USING INTEGER PRIMARY KEY (rowid=?)
SEARCH teams USING INTEGER PRIMARY KEY (rowid=?)
SEARCH roster_groups USING INTEGER PRIMARY KEY (rowid=?)
SEARCH source_snapshot_facts USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH source_snapshot_facts USING INDEX sqlite_autoindex_source_snapshot_facts_1 (game_id=? AND source_key=?) LEFT-JOIN
```

索引: SEARCH game_facts USING INDEX idx_games_year_date (year=?) / SEARCH roster_entry_facts USING INDEX sqlite_autoindex_roster_entry_facts_1 (game_id=?) / SEARCH player_name USING INTEGER PRIMARY KEY (rowid=?) / SEARCH teams USING INTEGER PRIMARY KEY (rowid=?) / SEARCH roster_groups USING INTEGER PRIMARY KEY (rowid=?) / SEARCH source_snapshot_facts USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH source_snapshot_facts USING INDEX sqlite_autoindex_source_snapshot_facts_1 (game_id=? AND source_key=?) LEFT-JOIN

この計画にSCANはない。

## S45

使用箇所: B17

```sql
SELECT games.year AS year, batting_lines.game_id AS gameId, games.date AS gameDate, batting_lines.team AS team, batting_lines.player_name AS playerName, CASE WHEN batting_lines.player_url LIKE '%/players/%.html' THEN REPLACE(SUBSTR(batting_lines.player_url, INSTR(batting_lines.player_url, '/players/') + 9), '.html', '') WHEN batting_lines.player_url IS NOT NULL AND batting_lines.player_url <> '' THEN batting_lines.player_url ELSE NULL END AS playerId, 'batting' AS sourceKind, COALESCE(batting_lines.source_url, box_source.source_url) AS sourceUrl, 2 AS sourceRank FROM batting_lines INNER JOIN games ON games.game_id = batting_lines.game_id LEFT JOIN source_snapshots AS box_source ON box_source.game_id = batting_lines.game_id AND box_source.source_key = 'box' WHERE batting_lines.game_id NOT LIKE 'f%' AND batting_lines.player_name IS NOT NULL AND batting_lines.player_name <> '' AND (CASE WHEN batting_lines.player_url LIKE '%/players/%.html' THEN REPLACE(SUBSTR(batting_lines.player_url, INSTR(batting_lines.player_url, '/players/') + 9), '.html', '') WHEN batting_lines.player_url IS NOT NULL AND batting_lines.player_url <> '' THEN batting_lines.player_url ELSE NULL END = ?) AND games.year = ? LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SEARCH game_facts USING INDEX idx_games_year_date (year=?)
SEARCH batting_line_facts USING INDEX sqlite_autoindex_batting_line_facts_1 (game_id=?)
SEARCH player_name USING INTEGER PRIMARY KEY (rowid=?)
SEARCH teams USING INTEGER PRIMARY KEY (rowid=?)
SEARCH source_snapshot_facts USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH source_snapshot_facts USING INDEX sqlite_autoindex_source_snapshot_facts_1 (game_id=? AND source_key=?) LEFT-JOIN
```

索引: SEARCH game_facts USING INDEX idx_games_year_date (year=?) / SEARCH batting_line_facts USING INDEX sqlite_autoindex_batting_line_facts_1 (game_id=?) / SEARCH player_name USING INTEGER PRIMARY KEY (rowid=?) / SEARCH teams USING INTEGER PRIMARY KEY (rowid=?) / SEARCH source_snapshot_facts USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH source_snapshot_facts USING INDEX sqlite_autoindex_source_snapshot_facts_1 (game_id=? AND source_key=?) LEFT-JOIN

この計画にSCANはない。

## S46

使用箇所: B17

```sql
SELECT games.year AS year, pitching_lines.game_id AS gameId, games.date AS gameDate, pitching_lines.team AS team, pitching_lines.pitcher_name AS playerName, CASE WHEN pitching_lines.pitcher_url LIKE '%/players/%.html' THEN REPLACE(SUBSTR(pitching_lines.pitcher_url, INSTR(pitching_lines.pitcher_url, '/players/') + 9), '.html', '') WHEN pitching_lines.pitcher_url IS NOT NULL AND pitching_lines.pitcher_url <> '' THEN pitching_lines.pitcher_url ELSE NULL END AS playerId, 'pitching' AS sourceKind, COALESCE(pitching_lines.source_url, box_source.source_url) AS sourceUrl, 3 AS sourceRank FROM pitching_lines INNER JOIN games ON games.game_id = pitching_lines.game_id LEFT JOIN source_snapshots AS box_source ON box_source.game_id = pitching_lines.game_id AND box_source.source_key = 'box' WHERE pitching_lines.game_id NOT LIKE 'f%' AND pitching_lines.pitcher_name IS NOT NULL AND pitching_lines.pitcher_name <> '' AND (CASE WHEN pitching_lines.pitcher_url LIKE '%/players/%.html' THEN REPLACE(SUBSTR(pitching_lines.pitcher_url, INSTR(pitching_lines.pitcher_url, '/players/') + 9), '.html', '') WHEN pitching_lines.pitcher_url IS NOT NULL AND pitching_lines.pitcher_url <> '' THEN pitching_lines.pitcher_url ELSE NULL END = ?) AND games.year = ? LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SEARCH game_facts USING INDEX idx_games_year_date (year=?)
SEARCH pitching_line_facts USING INDEX sqlite_autoindex_pitching_line_facts_1 (game_id=?)
SEARCH pitcher_name USING INTEGER PRIMARY KEY (rowid=?)
SEARCH teams USING INTEGER PRIMARY KEY (rowid=?)
SEARCH source_snapshot_facts USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH source_snapshot_facts USING INDEX sqlite_autoindex_source_snapshot_facts_1 (game_id=? AND source_key=?) LEFT-JOIN
```

索引: SEARCH game_facts USING INDEX idx_games_year_date (year=?) / SEARCH pitching_line_facts USING INDEX sqlite_autoindex_pitching_line_facts_1 (game_id=?) / SEARCH pitcher_name USING INTEGER PRIMARY KEY (rowid=?) / SEARCH teams USING INTEGER PRIMARY KEY (rowid=?) / SEARCH source_snapshot_facts USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH source_snapshot_facts USING INDEX sqlite_autoindex_source_snapshot_facts_1 (game_id=? AND source_key=?) LEFT-JOIN

この計画にSCANはない。

## S47

使用箇所: B17

```sql
SELECT games.year AS year, events.game_id AS gameId, games.date AS gameDate, events.offense_team AS team, events.batter_name AS playerName, CASE WHEN events.batter_url LIKE '%/players/%.html' THEN REPLACE(SUBSTR(events.batter_url, INSTR(events.batter_url, '/players/') + 9), '.html', '') WHEN events.batter_url IS NOT NULL AND events.batter_url <> '' THEN events.batter_url ELSE NULL END AS playerId, 'event' AS sourceKind, COALESCE(events.source_url, play_source.source_url) AS sourceUrl, 4 AS sourceRank FROM events INNER JOIN games ON games.game_id = events.game_id LEFT JOIN source_snapshots AS play_source ON play_source.game_id = events.game_id AND play_source.source_key = 'playbyplay' WHERE events.game_id NOT LIKE 'f%' AND events.batter_name IS NOT NULL AND events.batter_name <> '' AND (CASE WHEN events.batter_url LIKE '%/players/%.html' THEN REPLACE(SUBSTR(events.batter_url, INSTR(events.batter_url, '/players/') + 9), '.html', '') WHEN events.batter_url IS NOT NULL AND events.batter_url <> '' THEN events.batter_url ELSE NULL END = ?) AND games.year = ? LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SEARCH game_facts USING INDEX idx_games_year_date (year=?)
SEARCH event_facts USING INDEX sqlite_autoindex_event_facts_1 (game_id=?)
SEARCH batter_name USING INTEGER PRIMARY KEY (rowid=?)
SEARCH result_codes USING INTEGER PRIMARY KEY (rowid=?)
SEARCH teams USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH event_types USING INTEGER PRIMARY KEY (rowid=?)
SEARCH event_subtypes USING INTEGER PRIMARY KEY (rowid=?)
SEARCH source_snapshot_facts USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH source_snapshot_facts USING INDEX sqlite_autoindex_source_snapshot_facts_1 (game_id=? AND source_key=?) LEFT-JOIN
```

索引: SEARCH game_facts USING INDEX idx_games_year_date (year=?) / SEARCH event_facts USING INDEX sqlite_autoindex_event_facts_1 (game_id=?) / SEARCH batter_name USING INTEGER PRIMARY KEY (rowid=?) / SEARCH result_codes USING INTEGER PRIMARY KEY (rowid=?) / SEARCH teams USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH event_types USING INTEGER PRIMARY KEY (rowid=?) / SEARCH event_subtypes USING INTEGER PRIMARY KEY (rowid=?) / SEARCH source_snapshot_facts USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH source_snapshot_facts USING INDEX sqlite_autoindex_source_snapshot_facts_1 (game_id=? AND source_key=?) LEFT-JOIN

この計画にSCANはない。

## S48

使用箇所: B17

```sql
SELECT games.year AS year, events.game_id AS gameId, games.date AS gameDate, events.offense_team AS team, events.runner_name AS playerName, CASE WHEN events.runner_url LIKE '%/players/%.html' THEN REPLACE(SUBSTR(events.runner_url, INSTR(events.runner_url, '/players/') + 9), '.html', '') WHEN events.runner_url IS NOT NULL AND events.runner_url <> '' THEN events.runner_url ELSE NULL END AS playerId, 'event' AS sourceKind, COALESCE(events.source_url, play_source.source_url) AS sourceUrl, 5 AS sourceRank FROM events INNER JOIN games ON games.game_id = events.game_id LEFT JOIN source_snapshots AS play_source ON play_source.game_id = events.game_id AND play_source.source_key = 'playbyplay' WHERE events.game_id NOT LIKE 'f%' AND events.runner_name IS NOT NULL AND events.runner_name <> '' AND (CASE WHEN events.runner_url LIKE '%/players/%.html' THEN REPLACE(SUBSTR(events.runner_url, INSTR(events.runner_url, '/players/') + 9), '.html', '') WHEN events.runner_url IS NOT NULL AND events.runner_url <> '' THEN events.runner_url ELSE NULL END = ?) AND games.year = ? LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SEARCH game_facts USING INDEX idx_games_year_date (year=?)
SEARCH event_facts USING INDEX sqlite_autoindex_event_facts_1 (game_id=?)
SEARCH runner_name USING INTEGER PRIMARY KEY (rowid=?)
SEARCH result_codes USING INTEGER PRIMARY KEY (rowid=?)
SEARCH teams USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH event_types USING INTEGER PRIMARY KEY (rowid=?)
SEARCH event_subtypes USING INTEGER PRIMARY KEY (rowid=?)
SEARCH source_snapshot_facts USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH source_snapshot_facts USING INDEX sqlite_autoindex_source_snapshot_facts_1 (game_id=? AND source_key=?) LEFT-JOIN
```

索引: SEARCH game_facts USING INDEX idx_games_year_date (year=?) / SEARCH event_facts USING INDEX sqlite_autoindex_event_facts_1 (game_id=?) / SEARCH runner_name USING INTEGER PRIMARY KEY (rowid=?) / SEARCH result_codes USING INTEGER PRIMARY KEY (rowid=?) / SEARCH teams USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH event_types USING INTEGER PRIMARY KEY (rowid=?) / SEARCH event_subtypes USING INTEGER PRIMARY KEY (rowid=?) / SEARCH source_snapshot_facts USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH source_snapshot_facts USING INDEX sqlite_autoindex_source_snapshot_facts_1 (game_id=? AND source_key=?) LEFT-JOIN

この計画にSCANはない。

## S49

使用箇所: B17

```sql
SELECT game_id AS game_id, source_key AS source_key, source_url AS source_url FROM source_snapshots WHERE game_id IN (?, ?, ?, ?) ORDER BY game_id ASC, source_key ASC
```

EXPLAIN QUERY PLAN:

```text
SEARCH source_snapshot_facts USING INDEX sqlite_autoindex_source_snapshot_facts_1 (game_id=?)
```

索引: SEARCH source_snapshot_facts USING INDEX sqlite_autoindex_source_snapshot_facts_1 (game_id=?)

この計画にSCANはない。

## S50

使用箇所: B18, B25

```sql
SELECT 'ロッテ' AS label, COUNT(*) AS total_games, SUM(CASE WHEN ((games.home_team_name IN ('ロッテ', '千葉ロッテマリーンズ', 'Lotte') AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER) > CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER)) OR (games.away_team_name IN ('ロッテ', '千葉ロッテマリーンズ', 'Lotte') AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER) > CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER))) THEN 1 ELSE 0 END) AS wins, SUM(CASE WHEN ((games.home_team_name IN ('ロッテ', '千葉ロッテマリーンズ', 'Lotte') AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER) < CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER)) OR (games.away_team_name IN ('ロッテ', '千葉ロッテマリーンズ', 'Lotte') AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER) < CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER))) THEN 1 ELSE 0 END) AS losses, SUM(CASE WHEN CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER) IS NOT NULL AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER) = CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER) THEN 1 ELSE 0 END) AS draws FROM games WHERE games.game_id NOT LIKE 'f%' AND (games.home_team_name IN ('ロッテ', '千葉ロッテマリーンズ', 'Lotte') OR games.away_team_name IN ('ロッテ', '千葉ロッテマリーンズ', 'Lotte')) AND games.year = ? ORDER BY wins DESC, losses ASC, label ASC LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SEARCH game_facts USING INDEX idx_games_year_date (year=?)
SEARCH away USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH home USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH venues USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH index_source USING COVERING INDEX sqlite_autoindex_source_snapshot_facts_1 (game_id=? AND source_key=?) LEFT-JOIN
```

索引: SEARCH game_facts USING INDEX idx_games_year_date (year=?) / SEARCH away USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH home USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH venues USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH index_source USING COVERING INDEX sqlite_autoindex_source_snapshot_facts_1 (game_id=? AND source_key=?) LEFT-JOIN

この計画にSCANはない。

## S51

使用箇所: B18, B25

```sql
SELECT 'オリックス' AS label, COUNT(*) AS total_games, SUM(CASE WHEN ((games.home_team_name IN ('オリックス', 'オリックス・バファローズ', 'ORIX') AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER) > CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER)) OR (games.away_team_name IN ('オリックス', 'オリックス・バファローズ', 'ORIX') AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER) > CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER))) THEN 1 ELSE 0 END) AS wins, SUM(CASE WHEN ((games.home_team_name IN ('オリックス', 'オリックス・バファローズ', 'ORIX') AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER) < CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER)) OR (games.away_team_name IN ('オリックス', 'オリックス・バファローズ', 'ORIX') AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER) < CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER))) THEN 1 ELSE 0 END) AS losses, SUM(CASE WHEN CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER) IS NOT NULL AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER) = CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER) THEN 1 ELSE 0 END) AS draws FROM games WHERE games.game_id NOT LIKE 'f%' AND (games.home_team_name IN ('オリックス', 'オリックス・バファローズ', 'ORIX') OR games.away_team_name IN ('オリックス', 'オリックス・バファローズ', 'ORIX')) AND games.year = ? ORDER BY wins DESC, losses ASC, label ASC LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SEARCH game_facts USING INDEX idx_games_year_date (year=?)
SEARCH away USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH home USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH venues USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH index_source USING COVERING INDEX sqlite_autoindex_source_snapshot_facts_1 (game_id=? AND source_key=?) LEFT-JOIN
```

索引: SEARCH game_facts USING INDEX idx_games_year_date (year=?) / SEARCH away USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH home USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH venues USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH index_source USING COVERING INDEX sqlite_autoindex_source_snapshot_facts_1 (game_id=? AND source_key=?) LEFT-JOIN

この計画にSCANはない。

## S52

使用箇所: B19

```sql
SELECT pitching_lines.pitcher_name AS label, pitching_lines.team AS team, COUNT(*) AS games, SUM(pitching_lines.pitch_count) AS pitches, SUM(pitching_lines.batters_faced) AS battersFaced, SUM(pitching_lines.hits) AS hitsAllowed, SUM(pitching_lines.home_runs) AS homeRunsAllowed, SUM(pitching_lines.walks) AS walks, SUM(pitching_lines.hit_batters) AS hitBatters, SUM(pitching_lines.strikeouts) AS strikeouts, SUM(pitching_lines.runs) AS runsAllowed, SUM(pitching_lines.earned_runs) AS earnedRuns, SUM(CASE WHEN pitching_lines.decision IN ('○', '勝', 'W') OR pitching_lines.win_loss_save_hold IN ('○', '勝', 'W') THEN 1 ELSE 0 END) AS wins, SUM(CASE WHEN pitching_lines.decision IN ('●', '敗', 'L') OR pitching_lines.win_loss_save_hold IN ('●', '敗', 'L') THEN 1 ELSE 0 END) AS losses, SUM(CASE WHEN pitching_lines.decision = 'S' OR pitching_lines.win_loss_save_hold = 'S' THEN 1 ELSE 0 END) AS saves, SUM(CASE WHEN pitching_lines.innings_pitched LIKE '%.%' THEN CAST(SUBSTR(pitching_lines.innings_pitched,1,INSTR(pitching_lines.innings_pitched,'.')-1) AS REAL)+CAST(SUBSTR(pitching_lines.innings_pitched,INSTR(pitching_lines.innings_pitched,'.')+1) AS REAL)/3.0 ELSE CAST(COALESCE(pitching_lines.innings_pitched,'0') AS REAL) END) AS inningsPitched FROM pitching_lines INNER JOIN games ON games.game_id = pitching_lines.game_id WHERE games.year >= ? AND games.year <= ? AND (SUBSTR(REPLACE(REPLACE(REPLACE(REPLACE(?, ' ', ''), char(12288), ''), '*', ''), '＊', ''), 1, LENGTH(REPLACE(REPLACE(REPLACE(REPLACE(pitching_lines.pitcher_name, ' ', ''), char(12288), ''), '*', ''), '＊', ''))) = REPLACE(REPLACE(REPLACE(REPLACE(pitching_lines.pitcher_name, ' ', ''), char(12288), ''), '*', ''), '＊', '') AND LENGTH(REPLACE(REPLACE(REPLACE(REPLACE(pitching_lines.pitcher_name, ' ', ''), char(12288), ''), '*', ''), '＊', '')) >= 1) AND pitching_lines.team IN (?, ?) GROUP BY pitching_lines.pitcher_name, pitching_lines.team ORDER BY SUM(pitching_lines.strikeouts) DESC, COUNT(*) DESC, label ASC LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SEARCH game_facts USING INDEX idx_games_year_date (year>? AND year<?)
SEARCH pitching_line_facts USING INDEX sqlite_autoindex_pitching_line_facts_1 (game_id=?)
SEARCH pitcher_name USING INTEGER PRIMARY KEY (rowid=?)
SEARCH teams USING INTEGER PRIMARY KEY (rowid=?)
SEARCH source_snapshot_facts USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH away USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH home USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH venues USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH index_source USING COVERING INDEX sqlite_autoindex_source_snapshot_facts_1 (game_id=? AND source_key=?) LEFT-JOIN
USE TEMP B-TREE FOR GROUP BY
USE TEMP B-TREE FOR ORDER BY
```

索引: SEARCH game_facts USING INDEX idx_games_year_date (year>? AND year<?) / SEARCH pitching_line_facts USING INDEX sqlite_autoindex_pitching_line_facts_1 (game_id=?) / SEARCH pitcher_name USING INTEGER PRIMARY KEY (rowid=?) / SEARCH teams USING INTEGER PRIMARY KEY (rowid=?) / SEARCH source_snapshot_facts USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH away USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH home USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH venues USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH index_source USING COVERING INDEX sqlite_autoindex_source_snapshot_facts_1 (game_id=? AND source_key=?) LEFT-JOIN

この計画にSCANはない。

## S53

使用箇所: B19

```sql
SELECT pitching_lines.pitcher_name AS label, pitching_lines.team AS team, COUNT(*) AS games, SUM(pitching_lines.pitch_count) AS pitches, SUM(pitching_lines.batters_faced) AS battersFaced, SUM(pitching_lines.hits) AS hitsAllowed, SUM(pitching_lines.home_runs) AS homeRunsAllowed, SUM(pitching_lines.walks) AS walks, SUM(pitching_lines.hit_batters) AS hitBatters, SUM(pitching_lines.strikeouts) AS strikeouts, SUM(pitching_lines.runs) AS runsAllowed, SUM(pitching_lines.earned_runs) AS earnedRuns, SUM(CASE WHEN pitching_lines.decision IN ('○', '勝', 'W') OR pitching_lines.win_loss_save_hold IN ('○', '勝', 'W') THEN 1 ELSE 0 END) AS wins, SUM(CASE WHEN pitching_lines.decision IN ('●', '敗', 'L') OR pitching_lines.win_loss_save_hold IN ('●', '敗', 'L') THEN 1 ELSE 0 END) AS losses, SUM(CASE WHEN pitching_lines.decision = 'S' OR pitching_lines.win_loss_save_hold = 'S' THEN 1 ELSE 0 END) AS saves, SUM(CASE WHEN pitching_lines.innings_pitched LIKE '%.%' THEN CAST(SUBSTR(pitching_lines.innings_pitched,1,INSTR(pitching_lines.innings_pitched,'.')-1) AS REAL)+CAST(SUBSTR(pitching_lines.innings_pitched,INSTR(pitching_lines.innings_pitched,'.')+1) AS REAL)/3.0 ELSE CAST(COALESCE(pitching_lines.innings_pitched,'0') AS REAL) END) AS inningsPitched FROM pitching_lines INNER JOIN games ON games.game_id = pitching_lines.game_id WHERE games.year >= ? AND games.year <= ? AND (SUBSTR(REPLACE(REPLACE(REPLACE(REPLACE(?, ' ', ''), char(12288), ''), '*', ''), '＊', ''), 1, LENGTH(REPLACE(REPLACE(REPLACE(REPLACE(pitching_lines.pitcher_name, ' ', ''), char(12288), ''), '*', ''), '＊', ''))) = REPLACE(REPLACE(REPLACE(REPLACE(pitching_lines.pitcher_name, ' ', ''), char(12288), ''), '*', ''), '＊', '') AND LENGTH(REPLACE(REPLACE(REPLACE(REPLACE(pitching_lines.pitcher_name, ' ', ''), char(12288), ''), '*', ''), '＊', '')) >= 1) AND pitching_lines.team IN (?, ?) GROUP BY pitching_lines.pitcher_name, pitching_lines.team ORDER BY SUM(pitching_lines.strikeouts) DESC, COUNT(*) DESC, label ASC LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SEARCH game_facts USING INDEX idx_games_year_date (year>? AND year<?)
SEARCH pitching_line_facts USING INDEX sqlite_autoindex_pitching_line_facts_1 (game_id=?)
SEARCH pitcher_name USING INTEGER PRIMARY KEY (rowid=?)
SEARCH teams USING INTEGER PRIMARY KEY (rowid=?)
SEARCH source_snapshot_facts USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH away USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH home USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH venues USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH index_source USING COVERING INDEX sqlite_autoindex_source_snapshot_facts_1 (game_id=? AND source_key=?) LEFT-JOIN
USE TEMP B-TREE FOR GROUP BY
USE TEMP B-TREE FOR ORDER BY
```

索引: SEARCH game_facts USING INDEX idx_games_year_date (year>? AND year<?) / SEARCH pitching_line_facts USING INDEX sqlite_autoindex_pitching_line_facts_1 (game_id=?) / SEARCH pitcher_name USING INTEGER PRIMARY KEY (rowid=?) / SEARCH teams USING INTEGER PRIMARY KEY (rowid=?) / SEARCH source_snapshot_facts USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH away USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH home USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH venues USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH index_source USING COVERING INDEX sqlite_autoindex_source_snapshot_facts_1 (game_id=? AND source_key=?) LEFT-JOIN

この計画にSCANはない。

## S54

使用箇所: B23

```sql
SELECT '巨人' AS label, COUNT(*) AS total_games, SUM(CASE WHEN ((games.home_team_name IN ('巨人', '読売ジャイアンツ', 'Yomiuri') AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER) > CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER)) OR (games.away_team_name IN ('巨人', '読売ジャイアンツ', 'Yomiuri') AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER) > CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER))) THEN 1 ELSE 0 END) AS wins, SUM(CASE WHEN ((games.home_team_name IN ('巨人', '読売ジャイアンツ', 'Yomiuri') AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER) < CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER)) OR (games.away_team_name IN ('巨人', '読売ジャイアンツ', 'Yomiuri') AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER) < CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER))) THEN 1 ELSE 0 END) AS losses, SUM(CASE WHEN CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER) IS NOT NULL AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER) = CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER) THEN 1 ELSE 0 END) AS draws FROM games WHERE games.game_id NOT LIKE 'f%' AND ((games.home_team_name IN ('巨人', '読売ジャイアンツ', 'Yomiuri') AND games.away_team_name IN ('阪神', '阪神タイガース', 'Hanshin')) OR (games.home_team_name IN ('阪神', '阪神タイガース', 'Hanshin') AND games.away_team_name IN ('巨人', '読売ジャイアンツ', 'Yomiuri'))) AND games.year = ? ORDER BY wins DESC, losses ASC, label ASC LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SEARCH game_facts USING INDEX idx_games_year_date (year=?)
SEARCH away USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH home USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH venues USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH index_source USING COVERING INDEX sqlite_autoindex_source_snapshot_facts_1 (game_id=? AND source_key=?) LEFT-JOIN
```

索引: SEARCH game_facts USING INDEX idx_games_year_date (year=?) / SEARCH away USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH home USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH venues USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH index_source USING COVERING INDEX sqlite_autoindex_source_snapshot_facts_1 (game_id=? AND source_key=?) LEFT-JOIN

この計画にSCANはない。

## S55

使用箇所: B25

```sql
SELECT '日本ハム' AS label, COUNT(*) AS total_games, SUM(CASE WHEN ((games.home_team_name IN ('日本ハム', '北海道日本ハムファイターズ', 'Nippon-Ham') AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER) > CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER)) OR (games.away_team_name IN ('日本ハム', '北海道日本ハムファイターズ', 'Nippon-Ham') AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER) > CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER))) THEN 1 ELSE 0 END) AS wins, SUM(CASE WHEN ((games.home_team_name IN ('日本ハム', '北海道日本ハムファイターズ', 'Nippon-Ham') AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER) < CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER)) OR (games.away_team_name IN ('日本ハム', '北海道日本ハムファイターズ', 'Nippon-Ham') AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER) < CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER))) THEN 1 ELSE 0 END) AS losses, SUM(CASE WHEN CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER) IS NOT NULL AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER) = CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER) THEN 1 ELSE 0 END) AS draws FROM games WHERE games.game_id NOT LIKE 'f%' AND (games.home_team_name IN ('日本ハム', '北海道日本ハムファイターズ', 'Nippon-Ham') OR games.away_team_name IN ('日本ハム', '北海道日本ハムファイターズ', 'Nippon-Ham')) AND games.year = ? ORDER BY wins DESC, losses ASC, label ASC LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SEARCH game_facts USING INDEX idx_games_year_date (year=?)
SEARCH away USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH home USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH venues USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH index_source USING COVERING INDEX sqlite_autoindex_source_snapshot_facts_1 (game_id=? AND source_key=?) LEFT-JOIN
```

索引: SEARCH game_facts USING INDEX idx_games_year_date (year=?) / SEARCH away USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH home USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH venues USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH index_source USING COVERING INDEX sqlite_autoindex_source_snapshot_facts_1 (game_id=? AND source_key=?) LEFT-JOIN

この計画にSCANはない。

## S56

使用箇所: B25

```sql
SELECT '楽天' AS label, COUNT(*) AS total_games, SUM(CASE WHEN ((games.home_team_name IN ('楽天', '東北楽天ゴールデンイーグルス', 'Rakuten') AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER) > CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER)) OR (games.away_team_name IN ('楽天', '東北楽天ゴールデンイーグルス', 'Rakuten') AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER) > CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER))) THEN 1 ELSE 0 END) AS wins, SUM(CASE WHEN ((games.home_team_name IN ('楽天', '東北楽天ゴールデンイーグルス', 'Rakuten') AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER) < CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER)) OR (games.away_team_name IN ('楽天', '東北楽天ゴールデンイーグルス', 'Rakuten') AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER) < CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER))) THEN 1 ELSE 0 END) AS losses, SUM(CASE WHEN CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER) IS NOT NULL AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER) = CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER) THEN 1 ELSE 0 END) AS draws FROM games WHERE games.game_id NOT LIKE 'f%' AND (games.home_team_name IN ('楽天', '東北楽天ゴールデンイーグルス', 'Rakuten') OR games.away_team_name IN ('楽天', '東北楽天ゴールデンイーグルス', 'Rakuten')) AND games.year = ? ORDER BY wins DESC, losses ASC, label ASC LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SEARCH game_facts USING INDEX idx_games_year_date (year=?)
SEARCH away USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH home USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH venues USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH index_source USING COVERING INDEX sqlite_autoindex_source_snapshot_facts_1 (game_id=? AND source_key=?) LEFT-JOIN
```

索引: SEARCH game_facts USING INDEX idx_games_year_date (year=?) / SEARCH away USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH home USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH venues USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH index_source USING COVERING INDEX sqlite_autoindex_source_snapshot_facts_1 (game_id=? AND source_key=?) LEFT-JOIN

この計画にSCANはない。

## S57

使用箇所: B25

```sql
SELECT '西武' AS label, COUNT(*) AS total_games, SUM(CASE WHEN ((games.home_team_name IN ('西武', '埼玉西武ライオンズ', 'Seibu') AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER) > CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER)) OR (games.away_team_name IN ('西武', '埼玉西武ライオンズ', 'Seibu') AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER) > CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER))) THEN 1 ELSE 0 END) AS wins, SUM(CASE WHEN ((games.home_team_name IN ('西武', '埼玉西武ライオンズ', 'Seibu') AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER) < CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER)) OR (games.away_team_name IN ('西武', '埼玉西武ライオンズ', 'Seibu') AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER) < CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER))) THEN 1 ELSE 0 END) AS losses, SUM(CASE WHEN CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER) IS NOT NULL AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER) = CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER) THEN 1 ELSE 0 END) AS draws FROM games WHERE games.game_id NOT LIKE 'f%' AND (games.home_team_name IN ('西武', '埼玉西武ライオンズ', 'Seibu') OR games.away_team_name IN ('西武', '埼玉西武ライオンズ', 'Seibu')) AND games.year = ? ORDER BY wins DESC, losses ASC, label ASC LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SEARCH game_facts USING INDEX idx_games_year_date (year=?)
SEARCH away USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH home USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH venues USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH index_source USING COVERING INDEX sqlite_autoindex_source_snapshot_facts_1 (game_id=? AND source_key=?) LEFT-JOIN
```

索引: SEARCH game_facts USING INDEX idx_games_year_date (year=?) / SEARCH away USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH home USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH venues USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH index_source USING COVERING INDEX sqlite_autoindex_source_snapshot_facts_1 (game_id=? AND source_key=?) LEFT-JOIN

この計画にSCANはない。

## S58

使用箇所: B25

```sql
SELECT 'ソフトバンク' AS label, COUNT(*) AS total_games, SUM(CASE WHEN ((games.home_team_name IN ('ソフトバンク', '福岡ソフトバンクホークス', 'SoftBank') AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER) > CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER)) OR (games.away_team_name IN ('ソフトバンク', '福岡ソフトバンクホークス', 'SoftBank') AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER) > CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER))) THEN 1 ELSE 0 END) AS wins, SUM(CASE WHEN ((games.home_team_name IN ('ソフトバンク', '福岡ソフトバンクホークス', 'SoftBank') AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER) < CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER)) OR (games.away_team_name IN ('ソフトバンク', '福岡ソフトバンクホークス', 'SoftBank') AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER) < CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER))) THEN 1 ELSE 0 END) AS losses, SUM(CASE WHEN CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER) IS NOT NULL AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER) = CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER) THEN 1 ELSE 0 END) AS draws FROM games WHERE games.game_id NOT LIKE 'f%' AND (games.home_team_name IN ('ソフトバンク', '福岡ソフトバンクホークス', 'SoftBank') OR games.away_team_name IN ('ソフトバンク', '福岡ソフトバンクホークス', 'SoftBank')) AND games.year = ? ORDER BY wins DESC, losses ASC, label ASC LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SEARCH game_facts USING INDEX idx_games_year_date (year=?)
SEARCH away USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH home USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH venues USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH index_source USING COVERING INDEX sqlite_autoindex_source_snapshot_facts_1 (game_id=? AND source_key=?) LEFT-JOIN
```

索引: SEARCH game_facts USING INDEX idx_games_year_date (year=?) / SEARCH away USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH home USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH venues USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH index_source USING COVERING INDEX sqlite_autoindex_source_snapshot_facts_1 (game_id=? AND source_key=?) LEFT-JOIN

この計画にSCANはない。

## S59

使用箇所: B26

```sql
SELECT player_id, full_name, team_name, year_teams_json FROM player_profiles WHERE (LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(player_profiles.canonical_name, player_profiles.full_name), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) = ? OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(player_profiles.canonical_name, player_profiles.full_name), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE ? OR (LENGTH(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(player_profiles.canonical_name, player_profiles.full_name), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜'))) >= 3 AND ? LIKE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(player_profiles.canonical_name, player_profiles.full_name), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%')) LIMIT 30
```

EXPLAIN QUERY PLAN:

```text
SCAN player_profiles
```

索引: 計画上の索引指定なし

走査箇所: SCAN player_profiles

走査の分析: 上記SQLの名前正規化・部分一致・相関照合による辞書検索、または集計中間結果の読み取り。関数を適用した名前条件は既存の生文字列INDEXと一致しない。中間結果のSCANは元テーブル全走査を意味しない。

## S60

使用箇所: B26

```sql
SELECT player_profiles.player_id, COALESCE(player_profiles.canonical_name, player_profiles.full_name) AS full_name, player_profiles.team_name, player_profiles.year_teams_json, player_profiles.current_team, player_aliases.season_from, player_aliases.season_to FROM player_aliases INNER JOIN player_profiles ON player_profiles.player_id = player_aliases.player_id WHERE (LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(player_aliases.alias, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) = ? OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(player_aliases.normalized_alias, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) = ?) LIMIT 50
```

EXPLAIN QUERY PLAN:

```text
SCAN player_aliases
SEARCH player_profiles USING INDEX sqlite_autoindex_player_profiles_1 (player_id=?)
```

索引: SEARCH player_profiles USING INDEX sqlite_autoindex_player_profiles_1 (player_id=?)

走査箇所: SCAN player_aliases

走査の分析: 上記SQLの名前正規化・部分一致・相関照合による辞書検索、または集計中間結果の読み取り。関数を適用した名前条件は既存の生文字列INDEXと一致しない。中間結果のSCANは元テーブル全走査を意味しない。

## S61

使用箇所: B26

```sql
SELECT COUNT(*) AS count FROM player_batting_stats WHERE player_id = ?
```

EXPLAIN QUERY PLAN:

```text
SEARCH player_batting_stats USING COVERING INDEX idx_player_batting_stats_player_id (player_id=?)
```

索引: SEARCH player_batting_stats USING COVERING INDEX idx_player_batting_stats_player_id (player_id=?)

この計画にSCANはない。

## S62

使用箇所: B26

```sql
SELECT COUNT(*) AS count FROM player_pitching_stats WHERE player_id = ?
```

EXPLAIN QUERY PLAN:

```text
SEARCH player_pitching_stats USING COVERING INDEX idx_player_pitching_stats_player_id (player_id=?)
```

索引: SEARCH player_pitching_stats USING COVERING INDEX idx_player_pitching_stats_player_id (player_id=?)

この計画にSCANはない。

## S63

使用箇所: B26

```sql
SELECT year, team_id, team_name, player_name FROM current_team_roster WHERE current_team_roster.player_id = ? AND current_team_roster.year = ? AND current_team_roster.team_name IN (?) LIMIT 2
```

EXPLAIN QUERY PLAN:

```text
SEARCH current_team_roster USING INDEX idx_current_team_roster_player_id (player_id=?)
```

索引: SEARCH current_team_roster USING INDEX idx_current_team_roster_player_id (player_id=?)

この計画にSCANはない。

## S64

使用箇所: B26

```sql
SELECT 'bis:' || player_batting_stats.year || ':' || player_batting_stats.team_id || ':idb1' AS gameId, printf('%04d-01-01', player_batting_stats.year) AS gameDate, player_batting_stats.team_name AS team, player_batting_stats.player_name AS playerName, NULL AS battingOrder, NULL AS position, CAST(COALESCE(json_extract(player_batting_stats.values_json, '$.打数'), '0') AS INTEGER) AS atBats, CAST(COALESCE(json_extract(player_batting_stats.values_json, '$.得点'), '0') AS INTEGER) AS runs, CAST(COALESCE(json_extract(player_batting_stats.values_json, '$.安打'), '0') AS INTEGER) AS hits, CAST(COALESCE(json_extract(player_batting_stats.values_json, '$.打点'), '0') AS INTEGER) AS runsBattedIn, CAST(COALESCE(json_extract(player_batting_stats.values_json, '$.盗塁'), '0') AS INTEGER) AS stolenBases, CAST(COALESCE(json_extract(player_batting_stats.values_json, '$.三振'), '0') AS INTEGER) AS strikeouts, CAST(COALESCE(json_extract(player_batting_stats.values_json, '$.四球'), '0') AS INTEGER) AS walks, player_batting_stats.values_json AS rawText, 'bis_batting' AS sourceKind, player_batting_stats.source_url AS sourceUrl, player_batting_stats.values_json AS statsJson FROM player_batting_stats WHERE player_batting_stats.year = ? AND player_batting_stats.team_name IN (?) AND player_batting_stats.player_id = ? AND player_batting_stats.year = ? AND player_batting_stats.team_id = ? ORDER BY player_batting_stats.year DESC, player_batting_stats.team_id ASC, player_batting_stats.row_index ASC LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SEARCH player_batting_stats USING INDEX sqlite_autoindex_player_batting_stats_1 (year=? AND team_id=?)
USE TEMP B-TREE FOR RIGHT PART OF ORDER BY
```

索引: SEARCH player_batting_stats USING INDEX sqlite_autoindex_player_batting_stats_1 (year=? AND team_id=?)

この計画にSCANはない。

## S65

使用箇所: B26

```sql
SELECT game_id AS game_id, source_key AS source_key, source_url AS source_url FROM source_snapshots WHERE game_id IN (?) ORDER BY game_id ASC, source_key ASC
```

EXPLAIN QUERY PLAN:

```text
SEARCH source_snapshot_facts USING INDEX sqlite_autoindex_source_snapshot_facts_1 (game_id=?)
```

索引: SEARCH source_snapshot_facts USING INDEX sqlite_autoindex_source_snapshot_facts_1 (game_id=?)

この計画にSCANはない。

## S66

使用箇所: B28, MT01-Turn2

```sql
SELECT '巨人' AS label, COUNT(*) AS total_games, SUM(CASE WHEN ((games.home_team_name IN ('巨人', '読売ジャイアンツ', 'Yomiuri') AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER) > CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER)) OR (games.away_team_name IN ('巨人', '読売ジャイアンツ', 'Yomiuri') AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER) > CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER))) THEN 1 ELSE 0 END) AS wins, SUM(CASE WHEN ((games.home_team_name IN ('巨人', '読売ジャイアンツ', 'Yomiuri') AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER) < CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER)) OR (games.away_team_name IN ('巨人', '読売ジャイアンツ', 'Yomiuri') AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER) < CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER))) THEN 1 ELSE 0 END) AS losses, SUM(CASE WHEN CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER) IS NOT NULL AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER) = CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER) THEN 1 ELSE 0 END) AS draws FROM games WHERE games.game_id NOT LIKE 'f%' AND (games.home_team_name IN ('巨人', '読売ジャイアンツ', 'Yomiuri') OR games.away_team_name IN ('巨人', '読売ジャイアンツ', 'Yomiuri')) AND games.year = ? ORDER BY wins DESC, losses ASC, label ASC LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SEARCH game_facts USING INDEX idx_games_year_date (year=?)
SEARCH away USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH home USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH venues USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH index_source USING COVERING INDEX sqlite_autoindex_source_snapshot_facts_1 (game_id=? AND source_key=?) LEFT-JOIN
```

索引: SEARCH game_facts USING INDEX idx_games_year_date (year=?) / SEARCH away USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH home USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH venues USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH index_source USING COVERING INDEX sqlite_autoindex_source_snapshot_facts_1 (game_id=? AND source_key=?) LEFT-JOIN

この計画にSCANはない。

## S67

使用箇所: B31

```sql
SELECT player_id, full_name, team_name, year_teams_json FROM player_profiles WHERE (LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(player_profiles.canonical_name, player_profiles.full_name), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) = ? OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(player_profiles.canonical_name, player_profiles.full_name), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE ? OR (LENGTH(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(player_profiles.canonical_name, player_profiles.full_name), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜'))) >= 3 AND ? LIKE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(player_profiles.canonical_name, player_profiles.full_name), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%')) LIMIT 30
```

EXPLAIN QUERY PLAN:

```text
SCAN player_profiles
```

索引: 計画上の索引指定なし

走査箇所: SCAN player_profiles

走査の分析: 上記SQLの名前正規化・部分一致・相関照合による辞書検索、または集計中間結果の読み取り。関数を適用した名前条件は既存の生文字列INDEXと一致しない。中間結果のSCANは元テーブル全走査を意味しない。

## S68

使用箇所: B31

```sql
SELECT player_id, full_name FROM player_profiles WHERE player_id IN (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
```

EXPLAIN QUERY PLAN:

```text
SEARCH player_profiles USING INDEX sqlite_autoindex_player_profiles_1 (player_id=?)
```

索引: SEARCH player_profiles USING INDEX sqlite_autoindex_player_profiles_1 (player_id=?)

この計画にSCANはない。

## S69

使用箇所: B31

```sql
SELECT player_profiles.player_id, COALESCE(player_profiles.canonical_name, player_profiles.full_name) AS full_name, player_profiles.team_name, player_profiles.year_teams_json, player_profiles.current_team, player_aliases.season_from, player_aliases.season_to FROM player_aliases INNER JOIN player_profiles ON player_profiles.player_id = player_aliases.player_id WHERE (LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(player_aliases.alias, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) = ? OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(player_aliases.normalized_alias, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) = ?) LIMIT 50
```

EXPLAIN QUERY PLAN:

```text
SCAN player_aliases
SEARCH player_profiles USING INDEX sqlite_autoindex_player_profiles_1 (player_id=?)
```

索引: SEARCH player_profiles USING INDEX sqlite_autoindex_player_profiles_1 (player_id=?)

走査箇所: SCAN player_aliases

走査の分析: 上記SQLの名前正規化・部分一致・相関照合による辞書検索、または集計中間結果の読み取り。関数を適用した名前条件は既存の生文字列INDEXと一致しない。中間結果のSCANは元テーブル全走査を意味しない。

## S70

使用箇所: B31

```sql
SELECT name_id AS nameId, name FROM person_names WHERE (LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(person_names.name, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) = ? OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(person_names.name, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE ? OR (SUBSTR(?, 1, LENGTH(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(person_names.name, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')))) = LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(person_names.name, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) AND LENGTH(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(person_names.name, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜'))) >= 2)) LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SCAN person_names
```

索引: 計画上の索引指定なし

走査箇所: SCAN person_names

走査の分析: 上記SQLの名前正規化・部分一致・相関照合による辞書検索、または集計中間結果の読み取り。関数を適用した名前条件は既存の生文字列INDEXと一致しない。中間結果のSCANは元テーブル全走査を意味しない。

## S71

使用箇所: B31

```sql
SELECT person_names.name AS name, CASE WHEN batting_line_facts.player_id IS NOT NULL THEN 'https://npb.jp/bis/players/' || batting_line_facts.player_id || '.html' ELSE NULL END AS player_url, ? AS role, teams.team_name AS team, game_facts.year AS year FROM person_names INNER JOIN batting_line_facts INDEXED BY idx_batting_name_game ON batting_line_facts.player_name_id = person_names.name_id INNER JOIN game_facts ON game_facts.game_id = batting_line_facts.game_id INNER JOIN teams ON teams.team_id = batting_line_facts.team_id WHERE person_names.name_id IN (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SEARCH person_names USING INTEGER PRIMARY KEY (rowid=?)
SEARCH batting_line_facts USING INDEX idx_batting_name_game (player_name_id=?)
SEARCH game_facts USING INDEX sqlite_autoindex_game_facts_1 (game_id=?)
SEARCH teams USING INTEGER PRIMARY KEY (rowid=?)
```

索引: SEARCH person_names USING INTEGER PRIMARY KEY (rowid=?) / SEARCH batting_line_facts USING INDEX idx_batting_name_game (player_name_id=?) / SEARCH game_facts USING INDEX sqlite_autoindex_game_facts_1 (game_id=?) / SEARCH teams USING INTEGER PRIMARY KEY (rowid=?)

この計画にSCANはない。

## S72

使用箇所: B31

```sql
SELECT current_team_roster.player_name AS name, current_team_roster.player_id AS player_url, ? AS role, current_team_roster.team_name AS team, current_team_roster.year AS year FROM current_team_roster WHERE current_team_roster.player_name IS NOT NULL AND current_team_roster.player_name <> '' AND ((LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(current_team_roster.player_name, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) = ? OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(current_team_roster.player_name, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE ? OR (SUBSTR(?, 1, LENGTH(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(current_team_roster.player_name, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')))) = LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(current_team_roster.player_name, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) AND LENGTH(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(current_team_roster.player_name, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜'))) >= 2))) LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SCAN current_team_roster
```

索引: 計画上の索引指定なし

走査箇所: SCAN current_team_roster

走査の分析: 上記SQLの名前正規化・部分一致・相関照合による辞書検索、または集計中間結果の読み取り。関数を適用した名前条件は既存の生文字列INDEXと一致しない。中間結果のSCANは元テーブル全走査を意味しない。

## S73

使用箇所: B31

```sql
SELECT player_batting_stats.player_name AS name, player_batting_stats.player_id AS player_url, ? AS role, player_batting_stats.team_name AS team, player_batting_stats.year AS year FROM player_batting_stats WHERE player_batting_stats.player_name IS NOT NULL AND player_batting_stats.player_name <> '' AND ((LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(player_batting_stats.player_name, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) = ? OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(player_batting_stats.player_name, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE ? OR (SUBSTR(?, 1, LENGTH(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(player_batting_stats.player_name, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')))) = LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(player_batting_stats.player_name, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) AND LENGTH(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(player_batting_stats.player_name, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜'))) >= 2))) LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SCAN player_batting_stats
```

索引: 計画上の索引指定なし

走査箇所: SCAN player_batting_stats

走査の分析: 上記SQLの名前正規化・部分一致・相関照合による辞書検索、または集計中間結果の読み取り。関数を適用した名前条件は既存の生文字列INDEXと一致しない。中間結果のSCANは元テーブル全走査を意味しない。

## S74

使用箇所: B31

```sql
SELECT player_pitching_stats.player_name AS name, player_pitching_stats.player_id AS player_url, ? AS role, player_pitching_stats.team_name AS team, player_pitching_stats.year AS year FROM player_pitching_stats WHERE player_pitching_stats.player_name IS NOT NULL AND player_pitching_stats.player_name <> '' AND ((LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(player_pitching_stats.player_name, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) = ? OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(player_pitching_stats.player_name, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE ? OR (SUBSTR(?, 1, LENGTH(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(player_pitching_stats.player_name, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')))) = LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(player_pitching_stats.player_name, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) AND LENGTH(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(player_pitching_stats.player_name, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜'))) >= 2))) LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SCAN player_pitching_stats
```

索引: 計画上の索引指定なし

走査箇所: SCAN player_pitching_stats

走査の分析: 上記SQLの名前正規化・部分一致・相関照合による辞書検索、または集計中間結果の読み取り。関数を適用した名前条件は既存の生文字列INDEXと一致しない。中間結果のSCANは元テーブル全走査を意味しない。

## S75

使用箇所: B31

```sql
SELECT batting_lines.player_name AS name, NULLIF(batting_lines.player_url, '') AS player_url, ? AS role, batting_lines.team AS team, games.year AS year FROM batting_lines INNER JOIN games ON games.game_id = batting_lines.game_id WHERE batting_lines.player_name IS NOT NULL AND batting_lines.player_name <> '' AND ((LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(batting_lines.player_name, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) = ? OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(batting_lines.player_name, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE ? OR (SUBSTR(?, 1, LENGTH(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(batting_lines.player_name, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')))) = LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(batting_lines.player_name, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) AND LENGTH(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(batting_lines.player_name, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜'))) >= 2))) LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SCAN batting_line_facts
SEARCH player_name USING INTEGER PRIMARY KEY (rowid=?)
SEARCH teams USING INTEGER PRIMARY KEY (rowid=?)
SEARCH game_facts USING INDEX sqlite_autoindex_game_facts_1 (game_id=?)
```

索引: SEARCH player_name USING INTEGER PRIMARY KEY (rowid=?) / SEARCH teams USING INTEGER PRIMARY KEY (rowid=?) / SEARCH game_facts USING INDEX sqlite_autoindex_game_facts_1 (game_id=?)

走査箇所: SCAN batting_line_facts

fact走査の分析: 上記SQLの文字列・名前・URL条件、OR/相関条件、対象全体の集計を区別する必要がある。この仮引数の計画ではfact索引への検索に変換されていない。対象全体の集計は集合の読み取りが必要であり、SCAN表示のみから不要な走査とは断定しない。

## S76

使用箇所: B31

```sql
SELECT pitching_lines.pitcher_name AS name, NULLIF(pitching_lines.pitcher_url, '') AS player_url, ? AS role, pitching_lines.team AS team, games.year AS year FROM pitching_lines INNER JOIN games ON games.game_id = pitching_lines.game_id WHERE pitching_lines.pitcher_name IS NOT NULL AND pitching_lines.pitcher_name <> '' AND ((LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(pitching_lines.pitcher_name, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) = ? OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(pitching_lines.pitcher_name, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE ? OR (SUBSTR(?, 1, LENGTH(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(pitching_lines.pitcher_name, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')))) = LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(pitching_lines.pitcher_name, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) AND LENGTH(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(pitching_lines.pitcher_name, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜'))) >= 2))) LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SCAN pitching_line_facts
SEARCH pitcher_name USING INTEGER PRIMARY KEY (rowid=?)
SEARCH teams USING INTEGER PRIMARY KEY (rowid=?)
SEARCH game_facts USING INDEX sqlite_autoindex_game_facts_1 (game_id=?)
```

索引: SEARCH pitcher_name USING INTEGER PRIMARY KEY (rowid=?) / SEARCH teams USING INTEGER PRIMARY KEY (rowid=?) / SEARCH game_facts USING INDEX sqlite_autoindex_game_facts_1 (game_id=?)

走査箇所: SCAN pitching_line_facts

fact走査の分析: 上記SQLの文字列・名前・URL条件、OR/相関条件、対象全体の集計を区別する必要がある。この仮引数の計画ではfact索引への検索に変換されていない。対象全体の集計は集合の読み取りが必要であり、SCAN表示のみから不要な走査とは断定しない。

## S77

使用箇所: B31

```sql
SELECT roster_entries.player_name AS name, NULLIF(roster_entries.player_url, '') AS player_url, ? AS role, roster_entries.team AS team, games.year AS year FROM roster_entries INNER JOIN games ON games.game_id = roster_entries.game_id WHERE roster_entries.player_name IS NOT NULL AND roster_entries.player_name <> '' AND ((LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(roster_entries.player_name, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) = ? OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(roster_entries.player_name, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE ? OR (SUBSTR(?, 1, LENGTH(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(roster_entries.player_name, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')))) = LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(roster_entries.player_name, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) AND LENGTH(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(roster_entries.player_name, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜'))) >= 2))) LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SCAN roster_entry_facts
SEARCH player_name USING INTEGER PRIMARY KEY (rowid=?)
SEARCH teams USING INTEGER PRIMARY KEY (rowid=?)
SEARCH roster_groups USING INTEGER PRIMARY KEY (rowid=?)
SEARCH game_facts USING INDEX sqlite_autoindex_game_facts_1 (game_id=?)
```

索引: SEARCH player_name USING INTEGER PRIMARY KEY (rowid=?) / SEARCH teams USING INTEGER PRIMARY KEY (rowid=?) / SEARCH roster_groups USING INTEGER PRIMARY KEY (rowid=?) / SEARCH game_facts USING INDEX sqlite_autoindex_game_facts_1 (game_id=?)

走査箇所: SCAN roster_entry_facts

fact走査の分析: 上記SQLの文字列・名前・URL条件、OR/相関条件、対象全体の集計を区別する必要がある。この仮引数の計画ではfact索引への検索に変換されていない。対象全体の集計は集合の読み取りが必要であり、SCAN表示のみから不要な走査とは断定しない。

## S78

使用箇所: B31

```sql
SELECT player_id, full_name FROM player_profiles WHERE player_id IN (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
```

EXPLAIN QUERY PLAN:

```text
SEARCH player_profiles USING INDEX sqlite_autoindex_player_profiles_1 (player_id=?)
```

索引: SEARCH player_profiles USING INDEX sqlite_autoindex_player_profiles_1 (player_id=?)

この計画にSCANはない。

## S79

使用箇所: B32

```sql
SELECT player_id, full_name, team_name, year_teams_json FROM player_profiles WHERE (LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(player_profiles.canonical_name, player_profiles.full_name), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) = ? OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(player_profiles.canonical_name, player_profiles.full_name), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE ? OR (LENGTH(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(player_profiles.canonical_name, player_profiles.full_name), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜'))) >= 3 AND ? LIKE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(player_profiles.canonical_name, player_profiles.full_name), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%')) LIMIT 30
```

EXPLAIN QUERY PLAN:

```text
SCAN player_profiles
```

索引: 計画上の索引指定なし

走査箇所: SCAN player_profiles

走査の分析: 上記SQLの名前正規化・部分一致・相関照合による辞書検索、または集計中間結果の読み取り。関数を適用した名前条件は既存の生文字列INDEXと一致しない。中間結果のSCANは元テーブル全走査を意味しない。

## S80

使用箇所: B32

```sql
SELECT player_id, full_name FROM player_profiles WHERE player_id IN (?, ?, ?, ?)
```

EXPLAIN QUERY PLAN:

```text
SEARCH player_profiles USING INDEX sqlite_autoindex_player_profiles_1 (player_id=?)
```

索引: SEARCH player_profiles USING INDEX sqlite_autoindex_player_profiles_1 (player_id=?)

この計画にSCANはない。

## S81

使用箇所: B32

```sql
SELECT player_profiles.player_id, COALESCE(player_profiles.canonical_name, player_profiles.full_name) AS full_name, player_profiles.team_name, player_profiles.year_teams_json, player_profiles.current_team, player_aliases.season_from, player_aliases.season_to FROM player_aliases INNER JOIN player_profiles ON player_profiles.player_id = player_aliases.player_id WHERE (LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(player_aliases.alias, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) = ? OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(player_aliases.normalized_alias, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) = ?) LIMIT 50
```

EXPLAIN QUERY PLAN:

```text
SCAN player_aliases
SEARCH player_profiles USING INDEX sqlite_autoindex_player_profiles_1 (player_id=?)
```

索引: SEARCH player_profiles USING INDEX sqlite_autoindex_player_profiles_1 (player_id=?)

走査箇所: SCAN player_aliases

走査の分析: 上記SQLの名前正規化・部分一致・相関照合による辞書検索、または集計中間結果の読み取り。関数を適用した名前条件は既存の生文字列INDEXと一致しない。中間結果のSCANは元テーブル全走査を意味しない。

## S82

使用箇所: B32

```sql
SELECT name_id AS nameId, name FROM person_names WHERE (LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(person_names.name, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) = ? OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(person_names.name, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE ? OR (SUBSTR(?, 1, LENGTH(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(person_names.name, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')))) = LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(person_names.name, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) AND LENGTH(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(person_names.name, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜'))) >= 2)) LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SCAN person_names
```

索引: 計画上の索引指定なし

走査箇所: SCAN person_names

走査の分析: 上記SQLの名前正規化・部分一致・相関照合による辞書検索、または集計中間結果の読み取り。関数を適用した名前条件は既存の生文字列INDEXと一致しない。中間結果のSCANは元テーブル全走査を意味しない。

## S83

使用箇所: B32

```sql
SELECT person_names.name AS name, CASE WHEN batting_line_facts.player_id IS NOT NULL THEN 'https://npb.jp/bis/players/' || batting_line_facts.player_id || '.html' ELSE NULL END AS player_url, ? AS role, teams.team_name AS team, game_facts.year AS year FROM person_names INNER JOIN batting_line_facts INDEXED BY idx_batting_name_game ON batting_line_facts.player_name_id = person_names.name_id INNER JOIN game_facts ON game_facts.game_id = batting_line_facts.game_id INNER JOIN teams ON teams.team_id = batting_line_facts.team_id WHERE person_names.name_id IN (?, ?, ?, ?, ?) AND game_facts.year = ? LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SEARCH person_names USING INTEGER PRIMARY KEY (rowid=?)
SEARCH batting_line_facts USING INDEX idx_batting_name_game (player_name_id=?)
SEARCH game_facts USING INDEX sqlite_autoindex_game_facts_1 (game_id=?)
SEARCH teams USING INTEGER PRIMARY KEY (rowid=?)
```

索引: SEARCH person_names USING INTEGER PRIMARY KEY (rowid=?) / SEARCH batting_line_facts USING INDEX idx_batting_name_game (player_name_id=?) / SEARCH game_facts USING INDEX sqlite_autoindex_game_facts_1 (game_id=?) / SEARCH teams USING INTEGER PRIMARY KEY (rowid=?)

この計画にSCANはない。

## S84

使用箇所: B32

```sql
SELECT player_id, full_name FROM player_profiles WHERE player_id IN (?)
```

EXPLAIN QUERY PLAN:

```text
SEARCH player_profiles USING INDEX sqlite_autoindex_player_profiles_1 (player_id=?)
```

索引: SEARCH player_profiles USING INDEX sqlite_autoindex_player_profiles_1 (player_id=?)

この計画にSCANはない。

## S85

使用箇所: B32

```sql
SELECT player_batting_stats.player_name AS label, MAX(player_batting_stats.team_name) AS team, COUNT(*) AS rows, SUM(CAST(COALESCE(json_extract(values_json, '$.試合'), '0') AS INTEGER)) AS games, SUM(CAST(COALESCE(json_extract(values_json, '$.打席'), '0') AS INTEGER)) AS plateAppearances, SUM(CAST(COALESCE(json_extract(values_json, '$.打数'), '0') AS INTEGER)) AS atBats, SUM(CAST(COALESCE(json_extract(values_json, '$.得点'), '0') AS INTEGER)) AS runs, SUM(CAST(COALESCE(json_extract(values_json, '$.安打'), '0') AS INTEGER)) AS hits, SUM(CAST(COALESCE(json_extract(values_json, '$.本塁打'), '0') AS INTEGER)) AS homeRuns, SUM(CAST(COALESCE(json_extract(values_json, '$.塁打'), '0') AS INTEGER)) AS totalBases, SUM(CAST(COALESCE(json_extract(values_json, '$.打点'), '0') AS INTEGER)) AS runsBattedIn, SUM(CAST(COALESCE(json_extract(values_json, '$.盗塁'), '0') AS INTEGER)) AS stolenBases, SUM(CAST(COALESCE(json_extract(values_json, '$.四球'), '0') AS INTEGER)) AS walks, SUM(CAST(COALESCE(json_extract(values_json, '$.死球'), '0') AS INTEGER)) AS hitByPitch, SUM(CAST(COALESCE(json_extract(values_json, '$.犠飛'), '0') AS INTEGER)) AS sacrificeFlies, SUM(CAST(COALESCE(json_extract(values_json, '$.三振'), '0') AS INTEGER)) AS strikeouts FROM player_batting_stats WHERE json_extract(values_json, '$.試合') IS NOT NULL AND player_batting_stats.year = ? AND ( ( player_batting_stats.player_id = ? AND ( NOT EXISTS (SELECT 1 FROM player_profiles WHERE player_id = player_batting_stats.player_id) OR EXISTS ( SELECT 1 FROM player_profiles AS direct_identity_profile WHERE direct_identity_profile.player_id = player_batting_stats.player_id AND json_extract(direct_identity_profile.year_teams_json, '$."' || player_batting_stats.year || '"') IS NOT NULL AND LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(direct_identity_profile.canonical_name, direct_identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(player_batting_stats.player_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%' ) ) ) OR EXISTS ( SELECT 1 FROM player_profiles AS identity_profile LEFT JOIN player_aliases AS identity_alias ON identity_alias.player_id = identity_profile.player_id AND (identity_alias.season_from = 0 OR identity_alias.season_from <= player_batting_stats.year) AND (identity_alias.season_to = 0 OR identity_alias.season_to >= player_batting_stats.year) WHERE identity_profile.player_id = ? AND ( LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(player_batting_stats.player_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) = LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(identity_profile.canonical_name, identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(player_batting_stats.player_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) = LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(identity_alias.alias, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) OR ( LENGTH(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(player_batting_stats.player_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜'))) >= 1 AND LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(identity_profile.canonical_name, identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(player_batting_stats.player_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%' AND LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(json_extract(identity_profile.year_teams_json, '$."' || player_batting_stats.year || '"'), ''), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) <> '' AND (LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(json_extract(identity_profile.year_teams_json, '$."' || player_batting_stats.year || '"'), ''), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE '%' || LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(player_batting_stats.team_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%' OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(player_batting_stats.team_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE '%' || LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(json_extract(identity_profile.year_teams_json, '$."' || player_batting_stats.year || '"'), ''), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%') ) OR ( LENGTH(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(player_batting_stats.player_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜'))) >= 3 AND (LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(identity_profile.canonical_name, identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(player_batting_stats.player_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%' OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(player_batting_stats.player_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(identity_profile.canonical_name, identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%') AND NOT EXISTS ( SELECT 1 FROM player_profiles AS other_identity_profile WHERE other_identity_profile.player_id <> identity_profile.player_id AND LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(other_identity_profile.canonical_name, other_identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) <> LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(identity_profile.canonical_name, identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) AND (LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(other_identity_profile.canonical_name, other_identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(player_batting_stats.player_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%' OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(player_batting_stats.player_name, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(COALESCE(other_identity_profile.canonical_name, other_identity_profile.full_name), ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) || '%') ) ) ) ) ) GROUP BY player_batting_stats.player_name ORDER BY SUM(CAST(COALESCE(json_extract(values_json, '$.安打'), '0') AS INTEGER)) DESC, SUM(CAST(COALESCE(json_extract(values_json, '$.打数'), '0') AS INTEGER)) DESC, label ASC LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SEARCH player_batting_stats USING INDEX sqlite_autoindex_player_batting_stats_1 (year=?)
CORRELATED SCALAR SUBQUERY 1
SEARCH player_profiles USING COVERING INDEX sqlite_autoindex_player_profiles_1 (player_id=?)
CORRELATED SCALAR SUBQUERY 2
SEARCH direct_identity_profile USING INDEX sqlite_autoindex_player_profiles_1 (player_id=?)
CORRELATED SCALAR SUBQUERY 4
SEARCH identity_profile USING INDEX sqlite_autoindex_player_profiles_1 (player_id=?)
SEARCH identity_alias USING INDEX sqlite_autoindex_player_aliases_1 (player_id=?) LEFT-JOIN
CORRELATED SCALAR SUBQUERY 3
SCAN other_identity_profile
USE TEMP B-TREE FOR GROUP BY
USE TEMP B-TREE FOR ORDER BY
```

索引: SEARCH player_batting_stats USING INDEX sqlite_autoindex_player_batting_stats_1 (year=?) / SEARCH player_profiles USING COVERING INDEX sqlite_autoindex_player_profiles_1 (player_id=?) / SEARCH direct_identity_profile USING INDEX sqlite_autoindex_player_profiles_1 (player_id=?) / SEARCH identity_profile USING INDEX sqlite_autoindex_player_profiles_1 (player_id=?) / SEARCH identity_alias USING INDEX sqlite_autoindex_player_aliases_1 (player_id=?) LEFT-JOIN

走査箇所: SCAN other_identity_profile

走査の分析: 上記SQLの名前正規化・部分一致・相関照合による辞書検索、または集計中間結果の読み取り。関数を適用した名前条件は既存の生文字列INDEXと一致しない。中間結果のSCANは元テーブル全走査を意味しない。

## S86

使用箇所: MT01-Turn2

```sql
SELECT 'ヤクルト' AS label, COUNT(*) AS total_games, SUM(CASE WHEN ((games.home_team_name IN ('ヤクルト', '東京ヤクルトスワローズ', 'Yakult') AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER) > CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER)) OR (games.away_team_name IN ('ヤクルト', '東京ヤクルトスワローズ', 'Yakult') AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER) > CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER))) THEN 1 ELSE 0 END) AS wins, SUM(CASE WHEN ((games.home_team_name IN ('ヤクルト', '東京ヤクルトスワローズ', 'Yakult') AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER) < CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER)) OR (games.away_team_name IN ('ヤクルト', '東京ヤクルトスワローズ', 'Yakult') AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER) < CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER))) THEN 1 ELSE 0 END) AS losses, SUM(CASE WHEN CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER) IS NOT NULL AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER) = CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER) THEN 1 ELSE 0 END) AS draws FROM games WHERE games.game_id NOT LIKE 'f%' AND (games.home_team_name IN ('ヤクルト', '東京ヤクルトスワローズ', 'Yakult') OR games.away_team_name IN ('ヤクルト', '東京ヤクルトスワローズ', 'Yakult')) AND games.year = ? ORDER BY wins DESC, losses ASC, label ASC LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SEARCH game_facts USING INDEX idx_games_year_date (year=?)
SEARCH away USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH home USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH venues USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH index_source USING COVERING INDEX sqlite_autoindex_source_snapshot_facts_1 (game_id=? AND source_key=?) LEFT-JOIN
```

索引: SEARCH game_facts USING INDEX idx_games_year_date (year=?) / SEARCH away USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH home USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH venues USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH index_source USING COVERING INDEX sqlite_autoindex_source_snapshot_facts_1 (game_id=? AND source_key=?) LEFT-JOIN

この計画にSCANはない。

## S87

使用箇所: MT01-Turn2

```sql
SELECT 'DeNA' AS label, COUNT(*) AS total_games, SUM(CASE WHEN ((games.home_team_name IN ('DeNA', '横浜DeNAベイスターズ') AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER) > CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER)) OR (games.away_team_name IN ('DeNA', '横浜DeNAベイスターズ') AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER) > CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER))) THEN 1 ELSE 0 END) AS wins, SUM(CASE WHEN ((games.home_team_name IN ('DeNA', '横浜DeNAベイスターズ') AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER) < CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER)) OR (games.away_team_name IN ('DeNA', '横浜DeNAベイスターズ') AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER) < CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER))) THEN 1 ELSE 0 END) AS losses, SUM(CASE WHEN CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER) IS NOT NULL AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER) = CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER) THEN 1 ELSE 0 END) AS draws FROM games WHERE games.game_id NOT LIKE 'f%' AND (games.home_team_name IN ('DeNA', '横浜DeNAベイスターズ') OR games.away_team_name IN ('DeNA', '横浜DeNAベイスターズ')) AND games.year = ? ORDER BY wins DESC, losses ASC, label ASC LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SEARCH game_facts USING INDEX idx_games_year_date (year=?)
SEARCH away USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH home USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH venues USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH index_source USING COVERING INDEX sqlite_autoindex_source_snapshot_facts_1 (game_id=? AND source_key=?) LEFT-JOIN
```

索引: SEARCH game_facts USING INDEX idx_games_year_date (year=?) / SEARCH away USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH home USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH venues USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH index_source USING COVERING INDEX sqlite_autoindex_source_snapshot_facts_1 (game_id=? AND source_key=?) LEFT-JOIN

この計画にSCANはない。

## S88

使用箇所: MT01-Turn2

```sql
SELECT '中日' AS label, COUNT(*) AS total_games, SUM(CASE WHEN ((games.home_team_name IN ('中日', '中日ドラゴンズ', 'Chunichi') AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER) > CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER)) OR (games.away_team_name IN ('中日', '中日ドラゴンズ', 'Chunichi') AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER) > CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER))) THEN 1 ELSE 0 END) AS wins, SUM(CASE WHEN ((games.home_team_name IN ('中日', '中日ドラゴンズ', 'Chunichi') AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER) < CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER)) OR (games.away_team_name IN ('中日', '中日ドラゴンズ', 'Chunichi') AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER) < CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER))) THEN 1 ELSE 0 END) AS losses, SUM(CASE WHEN CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER) IS NOT NULL AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER) = CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER) THEN 1 ELSE 0 END) AS draws FROM games WHERE games.game_id NOT LIKE 'f%' AND (games.home_team_name IN ('中日', '中日ドラゴンズ', 'Chunichi') OR games.away_team_name IN ('中日', '中日ドラゴンズ', 'Chunichi')) AND games.year = ? ORDER BY wins DESC, losses ASC, label ASC LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SEARCH game_facts USING INDEX idx_games_year_date (year=?)
SEARCH away USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH home USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH venues USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH index_source USING COVERING INDEX sqlite_autoindex_source_snapshot_facts_1 (game_id=? AND source_key=?) LEFT-JOIN
```

索引: SEARCH game_facts USING INDEX idx_games_year_date (year=?) / SEARCH away USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH home USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH venues USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH index_source USING COVERING INDEX sqlite_autoindex_source_snapshot_facts_1 (game_id=? AND source_key=?) LEFT-JOIN

この計画にSCANはない。

## S89

使用箇所: MT01-Turn2

```sql
SELECT '広島' AS label, COUNT(*) AS total_games, SUM(CASE WHEN ((games.home_team_name IN ('広島', '広島東洋カープ', 'Hiroshima') AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER) > CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER)) OR (games.away_team_name IN ('広島', '広島東洋カープ', 'Hiroshima') AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER) > CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER))) THEN 1 ELSE 0 END) AS wins, SUM(CASE WHEN ((games.home_team_name IN ('広島', '広島東洋カープ', 'Hiroshima') AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER) < CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER)) OR (games.away_team_name IN ('広島', '広島東洋カープ', 'Hiroshima') AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER) < CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER))) THEN 1 ELSE 0 END) AS losses, SUM(CASE WHEN CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER) IS NOT NULL AND CAST(COALESCE(json_extract(games.linescore_json, '$.runs.home'), json_extract(games.linescore_json, '$.home.totals.runs')) AS INTEGER) = CAST(COALESCE(json_extract(games.linescore_json, '$.runs.away'), json_extract(games.linescore_json, '$.away.totals.runs')) AS INTEGER) THEN 1 ELSE 0 END) AS draws FROM games WHERE games.game_id NOT LIKE 'f%' AND (games.home_team_name IN ('広島', '広島東洋カープ', 'Hiroshima') OR games.away_team_name IN ('広島', '広島東洋カープ', 'Hiroshima')) AND games.year = ? ORDER BY wins DESC, losses ASC, label ASC LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SEARCH game_facts USING INDEX idx_games_year_date (year=?)
SEARCH away USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH home USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH venues USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH index_source USING COVERING INDEX sqlite_autoindex_source_snapshot_facts_1 (game_id=? AND source_key=?) LEFT-JOIN
```

索引: SEARCH game_facts USING INDEX idx_games_year_date (year=?) / SEARCH away USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH home USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH venues USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH index_source USING COVERING INDEX sqlite_autoindex_source_snapshot_facts_1 (game_id=? AND source_key=?) LEFT-JOIN

この計画にSCANはない。

## S90

使用箇所: MT01-Turn3

```sql
SELECT games.game_id AS gameId, games.date AS date, games.away_team_name AS awayTeamName, games.home_team_name AS homeTeamName, games.matchup_text AS matchupText, games.venue AS venue, games.linescore_json AS linescoreJson FROM games WHERE games.game_id NOT LIKE 'f%' AND games.year = ? AND ((games.home_team_name LIKE ? OR games.away_team_name LIKE ?) OR (games.home_team_name LIKE ? OR games.away_team_name LIKE ?) OR (games.home_team_name LIKE ? OR games.away_team_name LIKE ?)) ORDER BY games.date ASC, games.game_id ASC LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SEARCH game_facts USING INDEX idx_games_year_date (year=?)
SEARCH away USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH home USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH venues USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
USE TEMP B-TREE FOR RIGHT PART OF ORDER BY
```

索引: SEARCH game_facts USING INDEX idx_games_year_date (year=?) / SEARCH away USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH home USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH venues USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN

この計画にSCANはない。

## S91

使用箇所: MT02-Turn2

```sql
SELECT player_batting_stats.player_name AS label, MAX(player_batting_stats.team_name) AS team, COUNT(*) AS rows, SUM(CAST(COALESCE(json_extract(values_json, '$.試合'), '0') AS INTEGER)) AS games, SUM(CAST(COALESCE(json_extract(values_json, '$.打席'), '0') AS INTEGER)) AS plateAppearances, SUM(CAST(COALESCE(json_extract(values_json, '$.打数'), '0') AS INTEGER)) AS atBats, SUM(CAST(COALESCE(json_extract(values_json, '$.得点'), '0') AS INTEGER)) AS runs, SUM(CAST(COALESCE(json_extract(values_json, '$.安打'), '0') AS INTEGER)) AS hits, SUM(CAST(COALESCE(json_extract(values_json, '$.本塁打'), '0') AS INTEGER)) AS homeRuns, SUM(CAST(COALESCE(json_extract(values_json, '$.塁打'), '0') AS INTEGER)) AS totalBases, SUM(CAST(COALESCE(json_extract(values_json, '$.打点'), '0') AS INTEGER)) AS runsBattedIn, SUM(CAST(COALESCE(json_extract(values_json, '$.盗塁'), '0') AS INTEGER)) AS stolenBases, SUM(CAST(COALESCE(json_extract(values_json, '$.四球'), '0') AS INTEGER)) AS walks, SUM(CAST(COALESCE(json_extract(values_json, '$.死球'), '0') AS INTEGER)) AS hitByPitch, SUM(CAST(COALESCE(json_extract(values_json, '$.犠飛'), '0') AS INTEGER)) AS sacrificeFlies, SUM(CAST(COALESCE(json_extract(values_json, '$.三振'), '0') AS INTEGER)) AS strikeouts FROM player_batting_stats WHERE json_extract(values_json, '$.試合') IS NOT NULL AND player_batting_stats.year = ? AND player_batting_stats.team_name IN (?, ?) AND REPLACE(REPLACE(REPLACE(REPLACE(player_batting_stats.player_name, ' ', ''), char(12288), ''), '*', ''), '＊', '') LIKE ? GROUP BY player_batting_stats.player_name ORDER BY SUM(CAST(COALESCE(json_extract(values_json, '$.安打'), '0') AS INTEGER)) DESC, SUM(CAST(COALESCE(json_extract(values_json, '$.打数'), '0') AS INTEGER)) DESC, label ASC LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SEARCH player_batting_stats USING INDEX sqlite_autoindex_player_batting_stats_1 (year=?)
USE TEMP B-TREE FOR GROUP BY
USE TEMP B-TREE FOR ORDER BY
```

索引: SEARCH player_batting_stats USING INDEX sqlite_autoindex_player_batting_stats_1 (year=?)

この計画にSCANはない。

## S92

使用箇所: MT02-Turn2

```sql
WITH selected_batting AS MATERIALIZED ( SELECT batting_line_facts.* FROM batting_line_facts INDEXED BY idx_batting_name_game INNER JOIN game_facts ON game_facts.game_id = batting_line_facts.game_id INNER JOIN teams ON teams.team_id = batting_line_facts.team_id INNER JOIN person_names ON person_names.name_id = batting_line_facts.player_name_id LEFT JOIN positions ON positions.position_id = batting_line_facts.position_id WHERE game_facts.year = ? AND batting_line_facts.player_name_id IN ( SELECT person_names.name_id FROM person_names WHERE (SUBSTR(REPLACE(REPLACE(REPLACE(REPLACE(?, ' ', ''), char(12288), ''), '*', ''), '＊', ''), 1, LENGTH(REPLACE(REPLACE(REPLACE(REPLACE(person_names.name, ' ', ''), char(12288), ''), '*', ''), '＊', ''))) = REPLACE(REPLACE(REPLACE(REPLACE(person_names.name, ' ', ''), char(12288), ''), '*', ''), '＊', '') AND LENGTH(REPLACE(REPLACE(REPLACE(REPLACE(person_names.name, ' ', ''), char(12288), ''), '*', ''), '＊', '')) >= 1) ) AND teams.team_name IN (?, ?) ) SELECT MAX(person_names.name) AS label, MAX(person_names.name) AS playerName, MAX(teams.team_name) AS team, COUNT(*) AS games, SUM(batting_line_facts.at_bats) AS atBats, SUM(batting_line_facts.runs) AS runs, SUM(batting_line_facts.hits) AS hits, SUM(batting_line_facts.runs_batted_in) AS runsBattedIn, SUM(batting_line_facts.stolen_bases) AS stolenBases, SUM(COALESCE(batting_line_facts.walks, 0)) AS walks, SUM(COALESCE(batting_line_facts.strikeouts, 0)) AS strikeouts, COALESCE(SUM(hr_stats.hr_count), 0) AS homeRuns, COALESCE(SUM(hr_stats.extra_bases), 0) AS extraBases FROM selected_batting AS batting_line_facts INNER JOIN game_facts ON game_facts.game_id = batting_line_facts.game_id INNER JOIN teams ON teams.team_id = batting_line_facts.team_id INNER JOIN person_names ON person_names.name_id = batting_line_facts.player_name_id LEFT JOIN positions ON positions.position_id = batting_line_facts.position_id LEFT JOIN ( SELECT event_facts.game_id, event_facts.batter_player_id, batter_name.name AS batter_name, SUM(CASE WHEN result_codes.result_text LIKE '%ホームラン%' THEN 1 ELSE 0 END) AS hr_count, SUM(CASE WHEN result_codes.result_text LIKE '%ホームラン%' THEN 3 WHEN result_codes.result_text LIKE '%三塁打%' OR result_codes.result_text LIKE '%スリーベース%' THEN 2 WHEN result_codes.result_text LIKE '%二塁打%' OR result_codes.result_text LIKE '%ツーベース%' THEN 1 ELSE 0 END) AS extra_bases FROM event_facts INNER JOIN game_facts AS hr_games ON hr_games.game_id = event_facts.game_id INNER JOIN result_codes ON result_codes.result_code_id = event_facts.result_code_id LEFT JOIN person_names AS batter_name ON batter_name.name_id = event_facts.batter_name_id WHERE (result_codes.result_text LIKE '%ホームラン%' OR result_codes.result_text LIKE '%三塁打%' OR result_codes.result_text LIKE '%スリーベース%' OR result_codes.result_text LIKE '%二塁打%' OR result_codes.result_text LIKE '%ツーベース%') AND event_facts.game_id IN (SELECT game_id FROM selected_batting) AND hr_games.year = ? GROUP BY event_facts.game_id, event_facts.batter_player_id, batter_name.name ) hr_stats ON hr_stats.game_id = batting_line_facts.game_id AND ( (hr_stats.batter_player_id IS NOT NULL AND hr_stats.batter_player_id = batting_line_facts.player_id) OR hr_stats.batter_name = person_names.name ) GROUP BY CASE WHEN batting_line_facts.player_id IS NOT NULL AND batting_line_facts.player_id <> '' THEN 'id:' || batting_line_facts.player_id ELSE 'name:' || REPLACE(REPLACE(REPLACE(REPLACE(person_names.name, ' ', ''), char(12288), ''), '*', ''), '＊', '') END ORDER BY SUM(batting_line_facts.hits) DESC, SUM(batting_line_facts.at_bats) DESC, label ASC LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
MATERIALIZE selected_batting
SEARCH batting_line_facts USING INDEX idx_batting_name_game (player_name_id=?)
LIST SUBQUERY 1
SCAN person_names
SEARCH game_facts USING INDEX sqlite_autoindex_game_facts_1 (game_id=?)
SEARCH teams USING INTEGER PRIMARY KEY (rowid=?)
SEARCH person_names USING INTEGER PRIMARY KEY (rowid=?)
MATERIALIZE hr_stats
SEARCH hr_games USING INDEX idx_games_year_date (year=?)
LIST SUBQUERY 3
SCAN selected_batting
SEARCH event_facts USING INDEX sqlite_autoindex_event_facts_1 (game_id=?)
SEARCH result_codes USING INTEGER PRIMARY KEY (rowid=?)
SEARCH batter_name USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
USE TEMP B-TREE FOR GROUP BY
SCAN batting_line_facts
SEARCH teams USING INTEGER PRIMARY KEY (rowid=?)
SEARCH person_names USING INTEGER PRIMARY KEY (rowid=?)
SEARCH game_facts USING COVERING INDEX sqlite_autoindex_game_facts_1 (game_id=?)
SEARCH positions USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH hr_stats USING AUTOMATIC COVERING INDEX (game_id=?) LEFT-JOIN
USE TEMP B-TREE FOR GROUP BY
USE TEMP B-TREE FOR ORDER BY
```

索引: SEARCH batting_line_facts USING INDEX idx_batting_name_game (player_name_id=?) / SEARCH game_facts USING INDEX sqlite_autoindex_game_facts_1 (game_id=?) / SEARCH teams USING INTEGER PRIMARY KEY (rowid=?) / SEARCH person_names USING INTEGER PRIMARY KEY (rowid=?) / SEARCH hr_games USING INDEX idx_games_year_date (year=?) / SEARCH event_facts USING INDEX sqlite_autoindex_event_facts_1 (game_id=?) / SEARCH result_codes USING INTEGER PRIMARY KEY (rowid=?) / SEARCH batter_name USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH game_facts USING COVERING INDEX sqlite_autoindex_game_facts_1 (game_id=?) / SEARCH positions USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH hr_stats USING AUTOMATIC COVERING INDEX (game_id=?) LEFT-JOIN

走査箇所: SCAN person_names / SCAN selected_batting / SCAN batting_line_facts

fact走査の分析: 上記SQLの文字列・名前・URL条件、OR/相関条件、対象全体の集計を区別する必要がある。この仮引数の計画ではfact索引への検索に変換されていない。対象全体の集計は集合の読み取りが必要であり、SCAN表示のみから不要な走査とは断定しない。

## S93

使用箇所: MT02-Turn3

```sql
SELECT player_batting_stats.player_name AS label, MAX(player_batting_stats.team_name) AS team, COUNT(*) AS rows, SUM(CAST(COALESCE(json_extract(values_json, '$.試合'), '0') AS INTEGER)) AS games, SUM(CAST(COALESCE(json_extract(values_json, '$.打席'), '0') AS INTEGER)) AS plateAppearances, SUM(CAST(COALESCE(json_extract(values_json, '$.打数'), '0') AS INTEGER)) AS atBats, SUM(CAST(COALESCE(json_extract(values_json, '$.得点'), '0') AS INTEGER)) AS runs, SUM(CAST(COALESCE(json_extract(values_json, '$.安打'), '0') AS INTEGER)) AS hits, SUM(CAST(COALESCE(json_extract(values_json, '$.本塁打'), '0') AS INTEGER)) AS homeRuns, SUM(CAST(COALESCE(json_extract(values_json, '$.塁打'), '0') AS INTEGER)) AS totalBases, SUM(CAST(COALESCE(json_extract(values_json, '$.打点'), '0') AS INTEGER)) AS runsBattedIn, SUM(CAST(COALESCE(json_extract(values_json, '$.盗塁'), '0') AS INTEGER)) AS stolenBases, SUM(CAST(COALESCE(json_extract(values_json, '$.四球'), '0') AS INTEGER)) AS walks, SUM(CAST(COALESCE(json_extract(values_json, '$.死球'), '0') AS INTEGER)) AS hitByPitch, SUM(CAST(COALESCE(json_extract(values_json, '$.犠飛'), '0') AS INTEGER)) AS sacrificeFlies, SUM(CAST(COALESCE(json_extract(values_json, '$.三振'), '0') AS INTEGER)) AS strikeouts FROM player_batting_stats WHERE json_extract(values_json, '$.試合') IS NOT NULL AND player_batting_stats.year = ? AND player_batting_stats.team_name IN (?, ?) GROUP BY player_batting_stats.player_name ORDER BY SUM(CAST(COALESCE(json_extract(values_json, '$.本塁打'), '0') AS INTEGER)) DESC, label ASC LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SEARCH player_batting_stats USING INDEX sqlite_autoindex_player_batting_stats_1 (year=?)
USE TEMP B-TREE FOR GROUP BY
USE TEMP B-TREE FOR ORDER BY
```

索引: SEARCH player_batting_stats USING INDEX sqlite_autoindex_player_batting_stats_1 (year=?)

この計画にSCANはない。

## S94

使用箇所: MT02-Turn3

```sql
WITH selected_batting AS MATERIALIZED ( SELECT batting_line_facts.* FROM batting_line_facts INNER JOIN game_facts ON game_facts.game_id = batting_line_facts.game_id INNER JOIN teams ON teams.team_id = batting_line_facts.team_id INNER JOIN person_names ON person_names.name_id = batting_line_facts.player_name_id LEFT JOIN positions ON positions.position_id = batting_line_facts.position_id WHERE game_facts.year = ? AND teams.team_name IN (?, ?) ) SELECT MAX(person_names.name) AS label, MAX(person_names.name) AS playerName, MAX(teams.team_name) AS team, COUNT(*) AS games, SUM(batting_line_facts.at_bats) AS atBats, SUM(batting_line_facts.runs) AS runs, SUM(batting_line_facts.hits) AS hits, SUM(batting_line_facts.runs_batted_in) AS runsBattedIn, SUM(batting_line_facts.stolen_bases) AS stolenBases, SUM(COALESCE(batting_line_facts.walks, 0)) AS walks, SUM(COALESCE(batting_line_facts.strikeouts, 0)) AS strikeouts, COALESCE(SUM(hr_stats.hr_count), 0) AS homeRuns, COALESCE(SUM(hr_stats.extra_bases), 0) AS extraBases FROM selected_batting AS batting_line_facts INNER JOIN game_facts ON game_facts.game_id = batting_line_facts.game_id INNER JOIN teams ON teams.team_id = batting_line_facts.team_id INNER JOIN person_names ON person_names.name_id = batting_line_facts.player_name_id LEFT JOIN positions ON positions.position_id = batting_line_facts.position_id LEFT JOIN ( SELECT event_facts.game_id, event_facts.batter_player_id, batter_name.name AS batter_name, SUM(CASE WHEN result_codes.result_text LIKE '%ホームラン%' THEN 1 ELSE 0 END) AS hr_count, SUM(CASE WHEN result_codes.result_text LIKE '%ホームラン%' THEN 3 WHEN result_codes.result_text LIKE '%三塁打%' OR result_codes.result_text LIKE '%スリーベース%' THEN 2 WHEN result_codes.result_text LIKE '%二塁打%' OR result_codes.result_text LIKE '%ツーベース%' THEN 1 ELSE 0 END) AS extra_bases FROM event_facts INNER JOIN game_facts AS hr_games ON hr_games.game_id = event_facts.game_id INNER JOIN result_codes ON result_codes.result_code_id = event_facts.result_code_id LEFT JOIN person_names AS batter_name ON batter_name.name_id = event_facts.batter_name_id WHERE (result_codes.result_text LIKE '%ホームラン%' OR result_codes.result_text LIKE '%三塁打%' OR result_codes.result_text LIKE '%スリーベース%' OR result_codes.result_text LIKE '%二塁打%' OR result_codes.result_text LIKE '%ツーベース%') AND event_facts.game_id IN (SELECT game_id FROM selected_batting) AND hr_games.year = ? GROUP BY event_facts.game_id, event_facts.batter_player_id, batter_name.name ) hr_stats ON hr_stats.game_id = batting_line_facts.game_id AND ( (hr_stats.batter_player_id IS NOT NULL AND hr_stats.batter_player_id = batting_line_facts.player_id) OR hr_stats.batter_name = person_names.name ) GROUP BY CASE WHEN batting_line_facts.player_id IS NOT NULL AND batting_line_facts.player_id <> '' THEN 'id:' || batting_line_facts.player_id ELSE 'name:' || REPLACE(REPLACE(REPLACE(REPLACE(person_names.name, ' ', ''), char(12288), ''), '*', ''), '＊', '') END ORDER BY COALESCE(SUM(hr_stats.hr_count), 0) DESC, label ASC LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
MATERIALIZE selected_batting
SEARCH game_facts USING INDEX idx_games_year_date (year=?)
SEARCH batting_line_facts USING INDEX sqlite_autoindex_batting_line_facts_1 (game_id=?)
SEARCH person_names USING INTEGER PRIMARY KEY (rowid=?)
SEARCH teams USING INTEGER PRIMARY KEY (rowid=?)
MATERIALIZE hr_stats
SEARCH hr_games USING INDEX idx_games_year_date (year=?)
LIST SUBQUERY 2
SCAN selected_batting
SEARCH event_facts USING INDEX sqlite_autoindex_event_facts_1 (game_id=?)
SEARCH result_codes USING INTEGER PRIMARY KEY (rowid=?)
SEARCH batter_name USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
USE TEMP B-TREE FOR GROUP BY
SCAN batting_line_facts
SEARCH teams USING INTEGER PRIMARY KEY (rowid=?)
SEARCH person_names USING INTEGER PRIMARY KEY (rowid=?)
SEARCH game_facts USING COVERING INDEX sqlite_autoindex_game_facts_1 (game_id=?)
SEARCH positions USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH hr_stats USING AUTOMATIC COVERING INDEX (game_id=?) LEFT-JOIN
USE TEMP B-TREE FOR GROUP BY
USE TEMP B-TREE FOR ORDER BY
```

索引: SEARCH game_facts USING INDEX idx_games_year_date (year=?) / SEARCH batting_line_facts USING INDEX sqlite_autoindex_batting_line_facts_1 (game_id=?) / SEARCH person_names USING INTEGER PRIMARY KEY (rowid=?) / SEARCH teams USING INTEGER PRIMARY KEY (rowid=?) / SEARCH hr_games USING INDEX idx_games_year_date (year=?) / SEARCH event_facts USING INDEX sqlite_autoindex_event_facts_1 (game_id=?) / SEARCH result_codes USING INTEGER PRIMARY KEY (rowid=?) / SEARCH batter_name USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH game_facts USING COVERING INDEX sqlite_autoindex_game_facts_1 (game_id=?) / SEARCH positions USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH hr_stats USING AUTOMATIC COVERING INDEX (game_id=?) LEFT-JOIN

走査箇所: SCAN selected_batting / SCAN batting_line_facts

fact走査の分析: 上記SQLの文字列・名前・URL条件、OR/相関条件、対象全体の集計を区別する必要がある。この仮引数の計画ではfact索引への検索に変換されていない。対象全体の集計は集合の読み取りが必要であり、SCAN表示のみから不要な走査とは断定しない。

## S95

使用箇所: MT04-Turn1

```sql
SELECT pitching_lines.pitcher_name AS label, pitching_lines.team AS team, COUNT(*) AS games, SUM(pitching_lines.pitch_count) AS pitches, SUM(pitching_lines.batters_faced) AS battersFaced, SUM(pitching_lines.hits) AS hitsAllowed, SUM(pitching_lines.home_runs) AS homeRunsAllowed, SUM(pitching_lines.walks) AS walks, SUM(pitching_lines.hit_batters) AS hitBatters, SUM(pitching_lines.strikeouts) AS strikeouts, SUM(pitching_lines.runs) AS runsAllowed, SUM(pitching_lines.earned_runs) AS earnedRuns, SUM(CASE WHEN pitching_lines.decision IN ('○', '勝', 'W') OR pitching_lines.win_loss_save_hold IN ('○', '勝', 'W') THEN 1 ELSE 0 END) AS wins, SUM(CASE WHEN pitching_lines.decision IN ('●', '敗', 'L') OR pitching_lines.win_loss_save_hold IN ('●', '敗', 'L') THEN 1 ELSE 0 END) AS losses, SUM(CASE WHEN pitching_lines.decision = 'S' OR pitching_lines.win_loss_save_hold = 'S' THEN 1 ELSE 0 END) AS saves, SUM(CASE WHEN pitching_lines.innings_pitched LIKE '%.%' THEN CAST(SUBSTR(pitching_lines.innings_pitched,1,INSTR(pitching_lines.innings_pitched,'.')-1) AS REAL)+CAST(SUBSTR(pitching_lines.innings_pitched,INSTR(pitching_lines.innings_pitched,'.')+1) AS REAL)/3.0 ELSE CAST(COALESCE(pitching_lines.innings_pitched,'0') AS REAL) END) AS inningsPitched FROM pitching_lines INNER JOIN games ON games.game_id = pitching_lines.game_id WHERE games.year = ? AND (SUBSTR(REPLACE(REPLACE(REPLACE(REPLACE(?, ' ', ''), char(12288), ''), '*', ''), '＊', ''), 1, LENGTH(REPLACE(REPLACE(REPLACE(REPLACE(pitching_lines.pitcher_name, ' ', ''), char(12288), ''), '*', ''), '＊', ''))) = REPLACE(REPLACE(REPLACE(REPLACE(pitching_lines.pitcher_name, ' ', ''), char(12288), ''), '*', ''), '＊', '') AND LENGTH(REPLACE(REPLACE(REPLACE(REPLACE(pitching_lines.pitcher_name, ' ', ''), char(12288), ''), '*', ''), '＊', '')) >= 1) AND pitching_lines.team IN (?, ?) GROUP BY pitching_lines.pitcher_name, pitching_lines.team ORDER BY SUM(pitching_lines.strikeouts) DESC, COUNT(*) DESC, label ASC LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SEARCH game_facts USING INDEX idx_games_year_date (year=?)
SEARCH pitching_line_facts USING INDEX sqlite_autoindex_pitching_line_facts_1 (game_id=?)
SEARCH pitcher_name USING INTEGER PRIMARY KEY (rowid=?)
SEARCH teams USING INTEGER PRIMARY KEY (rowid=?)
SEARCH source_snapshot_facts USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH away USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH home USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH venues USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH index_source USING COVERING INDEX sqlite_autoindex_source_snapshot_facts_1 (game_id=? AND source_key=?) LEFT-JOIN
USE TEMP B-TREE FOR GROUP BY
USE TEMP B-TREE FOR ORDER BY
```

索引: SEARCH game_facts USING INDEX idx_games_year_date (year=?) / SEARCH pitching_line_facts USING INDEX sqlite_autoindex_pitching_line_facts_1 (game_id=?) / SEARCH pitcher_name USING INTEGER PRIMARY KEY (rowid=?) / SEARCH teams USING INTEGER PRIMARY KEY (rowid=?) / SEARCH source_snapshot_facts USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH away USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH home USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH venues USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH index_source USING COVERING INDEX sqlite_autoindex_source_snapshot_facts_1 (game_id=? AND source_key=?) LEFT-JOIN

この計画にSCANはない。

## S96

使用箇所: MT05-Turn1, MT05-Turn3

```sql
SELECT player_batting_stats.player_name AS label, MAX(player_batting_stats.team_name) AS team, COUNT(*) AS rows, SUM(CAST(COALESCE(json_extract(values_json, '$.試合'), '0') AS INTEGER)) AS games, SUM(CAST(COALESCE(json_extract(values_json, '$.打席'), '0') AS INTEGER)) AS plateAppearances, SUM(CAST(COALESCE(json_extract(values_json, '$.打数'), '0') AS INTEGER)) AS atBats, SUM(CAST(COALESCE(json_extract(values_json, '$.得点'), '0') AS INTEGER)) AS runs, SUM(CAST(COALESCE(json_extract(values_json, '$.安打'), '0') AS INTEGER)) AS hits, SUM(CAST(COALESCE(json_extract(values_json, '$.本塁打'), '0') AS INTEGER)) AS homeRuns, SUM(CAST(COALESCE(json_extract(values_json, '$.塁打'), '0') AS INTEGER)) AS totalBases, SUM(CAST(COALESCE(json_extract(values_json, '$.打点'), '0') AS INTEGER)) AS runsBattedIn, SUM(CAST(COALESCE(json_extract(values_json, '$.盗塁'), '0') AS INTEGER)) AS stolenBases, SUM(CAST(COALESCE(json_extract(values_json, '$.四球'), '0') AS INTEGER)) AS walks, SUM(CAST(COALESCE(json_extract(values_json, '$.死球'), '0') AS INTEGER)) AS hitByPitch, SUM(CAST(COALESCE(json_extract(values_json, '$.犠飛'), '0') AS INTEGER)) AS sacrificeFlies, SUM(CAST(COALESCE(json_extract(values_json, '$.三振'), '0') AS INTEGER)) AS strikeouts FROM player_batting_stats WHERE json_extract(values_json, '$.試合') IS NOT NULL AND player_batting_stats.year = ? AND player_batting_stats.team_name IN (?, ?) AND REPLACE(REPLACE(REPLACE(REPLACE(player_batting_stats.player_name, ' ', ''), char(12288), ''), '*', ''), '＊', '') LIKE ? GROUP BY player_batting_stats.player_name ORDER BY SUM(CAST(COALESCE(json_extract(values_json, '$.安打'), '0') AS INTEGER)) DESC, SUM(CAST(COALESCE(json_extract(values_json, '$.打数'), '0') AS INTEGER)) DESC, label ASC LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SEARCH player_batting_stats USING INDEX sqlite_autoindex_player_batting_stats_1 (year=?)
USE TEMP B-TREE FOR GROUP BY
USE TEMP B-TREE FOR ORDER BY
```

索引: SEARCH player_batting_stats USING INDEX sqlite_autoindex_player_batting_stats_1 (year=?)

この計画にSCANはない。

## S97

使用箇所: MT05-Turn1, MT05-Turn3

```sql
WITH selected_batting AS MATERIALIZED ( SELECT batting_line_facts.* FROM batting_line_facts INDEXED BY idx_batting_name_game INNER JOIN game_facts ON game_facts.game_id = batting_line_facts.game_id INNER JOIN teams ON teams.team_id = batting_line_facts.team_id INNER JOIN person_names ON person_names.name_id = batting_line_facts.player_name_id LEFT JOIN positions ON positions.position_id = batting_line_facts.position_id WHERE game_facts.year = ? AND batting_line_facts.player_name_id IN ( SELECT person_names.name_id FROM person_names WHERE (SUBSTR(REPLACE(REPLACE(REPLACE(REPLACE(?, ' ', ''), char(12288), ''), '*', ''), '＊', ''), 1, LENGTH(REPLACE(REPLACE(REPLACE(REPLACE(person_names.name, ' ', ''), char(12288), ''), '*', ''), '＊', ''))) = REPLACE(REPLACE(REPLACE(REPLACE(person_names.name, ' ', ''), char(12288), ''), '*', ''), '＊', '') AND LENGTH(REPLACE(REPLACE(REPLACE(REPLACE(person_names.name, ' ', ''), char(12288), ''), '*', ''), '＊', '')) >= 1) ) AND teams.team_name IN (?, ?) ) SELECT MAX(person_names.name) AS label, MAX(person_names.name) AS playerName, MAX(teams.team_name) AS team, COUNT(*) AS games, SUM(batting_line_facts.at_bats) AS atBats, SUM(batting_line_facts.runs) AS runs, SUM(batting_line_facts.hits) AS hits, SUM(batting_line_facts.runs_batted_in) AS runsBattedIn, SUM(batting_line_facts.stolen_bases) AS stolenBases, SUM(COALESCE(batting_line_facts.walks, 0)) AS walks, SUM(COALESCE(batting_line_facts.strikeouts, 0)) AS strikeouts, COALESCE(SUM(hr_stats.hr_count), 0) AS homeRuns, COALESCE(SUM(hr_stats.extra_bases), 0) AS extraBases FROM selected_batting AS batting_line_facts INNER JOIN game_facts ON game_facts.game_id = batting_line_facts.game_id INNER JOIN teams ON teams.team_id = batting_line_facts.team_id INNER JOIN person_names ON person_names.name_id = batting_line_facts.player_name_id LEFT JOIN positions ON positions.position_id = batting_line_facts.position_id LEFT JOIN ( SELECT event_facts.game_id, event_facts.batter_player_id, batter_name.name AS batter_name, SUM(CASE WHEN result_codes.result_text LIKE '%ホームラン%' THEN 1 ELSE 0 END) AS hr_count, SUM(CASE WHEN result_codes.result_text LIKE '%ホームラン%' THEN 3 WHEN result_codes.result_text LIKE '%三塁打%' OR result_codes.result_text LIKE '%スリーベース%' THEN 2 WHEN result_codes.result_text LIKE '%二塁打%' OR result_codes.result_text LIKE '%ツーベース%' THEN 1 ELSE 0 END) AS extra_bases FROM event_facts INNER JOIN game_facts AS hr_games ON hr_games.game_id = event_facts.game_id INNER JOIN result_codes ON result_codes.result_code_id = event_facts.result_code_id LEFT JOIN person_names AS batter_name ON batter_name.name_id = event_facts.batter_name_id WHERE (result_codes.result_text LIKE '%ホームラン%' OR result_codes.result_text LIKE '%三塁打%' OR result_codes.result_text LIKE '%スリーベース%' OR result_codes.result_text LIKE '%二塁打%' OR result_codes.result_text LIKE '%ツーベース%') AND event_facts.game_id IN (SELECT game_id FROM selected_batting) AND hr_games.year = ? GROUP BY event_facts.game_id, event_facts.batter_player_id, batter_name.name ) hr_stats ON hr_stats.game_id = batting_line_facts.game_id AND ( (hr_stats.batter_player_id IS NOT NULL AND hr_stats.batter_player_id = batting_line_facts.player_id) OR hr_stats.batter_name = person_names.name ) GROUP BY CASE WHEN batting_line_facts.player_id IS NOT NULL AND batting_line_facts.player_id <> '' THEN 'id:' || batting_line_facts.player_id ELSE 'name:' || REPLACE(REPLACE(REPLACE(REPLACE(person_names.name, ' ', ''), char(12288), ''), '*', ''), '＊', '') END ORDER BY SUM(batting_line_facts.hits) DESC, SUM(batting_line_facts.at_bats) DESC, label ASC LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
MATERIALIZE selected_batting
SEARCH batting_line_facts USING INDEX idx_batting_name_game (player_name_id=?)
LIST SUBQUERY 1
SCAN person_names
SEARCH game_facts USING INDEX sqlite_autoindex_game_facts_1 (game_id=?)
SEARCH teams USING INTEGER PRIMARY KEY (rowid=?)
SEARCH person_names USING INTEGER PRIMARY KEY (rowid=?)
MATERIALIZE hr_stats
SEARCH hr_games USING INDEX idx_games_year_date (year=?)
LIST SUBQUERY 3
SCAN selected_batting
SEARCH event_facts USING INDEX sqlite_autoindex_event_facts_1 (game_id=?)
SEARCH result_codes USING INTEGER PRIMARY KEY (rowid=?)
SEARCH batter_name USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
USE TEMP B-TREE FOR GROUP BY
SCAN batting_line_facts
SEARCH teams USING INTEGER PRIMARY KEY (rowid=?)
SEARCH person_names USING INTEGER PRIMARY KEY (rowid=?)
SEARCH game_facts USING COVERING INDEX sqlite_autoindex_game_facts_1 (game_id=?)
SEARCH positions USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH hr_stats USING AUTOMATIC COVERING INDEX (game_id=?) LEFT-JOIN
USE TEMP B-TREE FOR GROUP BY
USE TEMP B-TREE FOR ORDER BY
```

索引: SEARCH batting_line_facts USING INDEX idx_batting_name_game (player_name_id=?) / SEARCH game_facts USING INDEX sqlite_autoindex_game_facts_1 (game_id=?) / SEARCH teams USING INTEGER PRIMARY KEY (rowid=?) / SEARCH person_names USING INTEGER PRIMARY KEY (rowid=?) / SEARCH hr_games USING INDEX idx_games_year_date (year=?) / SEARCH event_facts USING INDEX sqlite_autoindex_event_facts_1 (game_id=?) / SEARCH result_codes USING INTEGER PRIMARY KEY (rowid=?) / SEARCH batter_name USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH game_facts USING COVERING INDEX sqlite_autoindex_game_facts_1 (game_id=?) / SEARCH positions USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH hr_stats USING AUTOMATIC COVERING INDEX (game_id=?) LEFT-JOIN

走査箇所: SCAN person_names / SCAN selected_batting / SCAN batting_line_facts

fact走査の分析: 上記SQLの文字列・名前・URL条件、OR/相関条件、対象全体の集計を区別する必要がある。この仮引数の計画ではfact索引への検索に変換されていない。対象全体の集計は集合の読み取りが必要であり、SCAN表示のみから不要な走査とは断定しない。

## S98

使用箇所: MT05-Turn2, MT05-Turn3

```sql
SELECT player_batting_stats.player_name AS label, MAX(player_batting_stats.team_name) AS team, COUNT(*) AS rows, SUM(CAST(COALESCE(json_extract(values_json, '$.試合'), '0') AS INTEGER)) AS games, SUM(CAST(COALESCE(json_extract(values_json, '$.打席'), '0') AS INTEGER)) AS plateAppearances, SUM(CAST(COALESCE(json_extract(values_json, '$.打数'), '0') AS INTEGER)) AS atBats, SUM(CAST(COALESCE(json_extract(values_json, '$.得点'), '0') AS INTEGER)) AS runs, SUM(CAST(COALESCE(json_extract(values_json, '$.安打'), '0') AS INTEGER)) AS hits, SUM(CAST(COALESCE(json_extract(values_json, '$.本塁打'), '0') AS INTEGER)) AS homeRuns, SUM(CAST(COALESCE(json_extract(values_json, '$.塁打'), '0') AS INTEGER)) AS totalBases, SUM(CAST(COALESCE(json_extract(values_json, '$.打点'), '0') AS INTEGER)) AS runsBattedIn, SUM(CAST(COALESCE(json_extract(values_json, '$.盗塁'), '0') AS INTEGER)) AS stolenBases, SUM(CAST(COALESCE(json_extract(values_json, '$.四球'), '0') AS INTEGER)) AS walks, SUM(CAST(COALESCE(json_extract(values_json, '$.死球'), '0') AS INTEGER)) AS hitByPitch, SUM(CAST(COALESCE(json_extract(values_json, '$.犠飛'), '0') AS INTEGER)) AS sacrificeFlies, SUM(CAST(COALESCE(json_extract(values_json, '$.三振'), '0') AS INTEGER)) AS strikeouts FROM player_batting_stats WHERE json_extract(values_json, '$.試合') IS NOT NULL AND player_batting_stats.year = ? AND player_batting_stats.team_name IN (?, ?) AND REPLACE(REPLACE(REPLACE(REPLACE(player_batting_stats.player_name, ' ', ''), char(12288), ''), '*', ''), '＊', '') LIKE ? GROUP BY player_batting_stats.player_name ORDER BY SUM(CAST(COALESCE(json_extract(values_json, '$.安打'), '0') AS INTEGER)) DESC, SUM(CAST(COALESCE(json_extract(values_json, '$.打数'), '0') AS INTEGER)) DESC, label ASC LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
SEARCH player_batting_stats USING INDEX sqlite_autoindex_player_batting_stats_1 (year=?)
USE TEMP B-TREE FOR GROUP BY
USE TEMP B-TREE FOR ORDER BY
```

索引: SEARCH player_batting_stats USING INDEX sqlite_autoindex_player_batting_stats_1 (year=?)

この計画にSCANはない。

## S99

使用箇所: MT05-Turn2, MT05-Turn3

```sql
WITH selected_batting AS MATERIALIZED ( SELECT batting_line_facts.* FROM batting_line_facts INDEXED BY idx_batting_name_game INNER JOIN game_facts ON game_facts.game_id = batting_line_facts.game_id INNER JOIN teams ON teams.team_id = batting_line_facts.team_id INNER JOIN person_names ON person_names.name_id = batting_line_facts.player_name_id LEFT JOIN positions ON positions.position_id = batting_line_facts.position_id WHERE game_facts.year = ? AND batting_line_facts.player_name_id IN ( SELECT person_names.name_id FROM person_names WHERE (SUBSTR(REPLACE(REPLACE(REPLACE(REPLACE(?, ' ', ''), char(12288), ''), '*', ''), '＊', ''), 1, LENGTH(REPLACE(REPLACE(REPLACE(REPLACE(person_names.name, ' ', ''), char(12288), ''), '*', ''), '＊', ''))) = REPLACE(REPLACE(REPLACE(REPLACE(person_names.name, ' ', ''), char(12288), ''), '*', ''), '＊', '') AND LENGTH(REPLACE(REPLACE(REPLACE(REPLACE(person_names.name, ' ', ''), char(12288), ''), '*', ''), '＊', '')) >= 1) ) AND teams.team_name IN (?, ?) ) SELECT MAX(person_names.name) AS label, MAX(person_names.name) AS playerName, MAX(teams.team_name) AS team, COUNT(*) AS games, SUM(batting_line_facts.at_bats) AS atBats, SUM(batting_line_facts.runs) AS runs, SUM(batting_line_facts.hits) AS hits, SUM(batting_line_facts.runs_batted_in) AS runsBattedIn, SUM(batting_line_facts.stolen_bases) AS stolenBases, SUM(COALESCE(batting_line_facts.walks, 0)) AS walks, SUM(COALESCE(batting_line_facts.strikeouts, 0)) AS strikeouts, COALESCE(SUM(hr_stats.hr_count), 0) AS homeRuns, COALESCE(SUM(hr_stats.extra_bases), 0) AS extraBases FROM selected_batting AS batting_line_facts INNER JOIN game_facts ON game_facts.game_id = batting_line_facts.game_id INNER JOIN teams ON teams.team_id = batting_line_facts.team_id INNER JOIN person_names ON person_names.name_id = batting_line_facts.player_name_id LEFT JOIN positions ON positions.position_id = batting_line_facts.position_id LEFT JOIN ( SELECT event_facts.game_id, event_facts.batter_player_id, batter_name.name AS batter_name, SUM(CASE WHEN result_codes.result_text LIKE '%ホームラン%' THEN 1 ELSE 0 END) AS hr_count, SUM(CASE WHEN result_codes.result_text LIKE '%ホームラン%' THEN 3 WHEN result_codes.result_text LIKE '%三塁打%' OR result_codes.result_text LIKE '%スリーベース%' THEN 2 WHEN result_codes.result_text LIKE '%二塁打%' OR result_codes.result_text LIKE '%ツーベース%' THEN 1 ELSE 0 END) AS extra_bases FROM event_facts INNER JOIN game_facts AS hr_games ON hr_games.game_id = event_facts.game_id INNER JOIN result_codes ON result_codes.result_code_id = event_facts.result_code_id LEFT JOIN person_names AS batter_name ON batter_name.name_id = event_facts.batter_name_id WHERE (result_codes.result_text LIKE '%ホームラン%' OR result_codes.result_text LIKE '%三塁打%' OR result_codes.result_text LIKE '%スリーベース%' OR result_codes.result_text LIKE '%二塁打%' OR result_codes.result_text LIKE '%ツーベース%') AND event_facts.game_id IN (SELECT game_id FROM selected_batting) AND hr_games.year = ? GROUP BY event_facts.game_id, event_facts.batter_player_id, batter_name.name ) hr_stats ON hr_stats.game_id = batting_line_facts.game_id AND ( (hr_stats.batter_player_id IS NOT NULL AND hr_stats.batter_player_id = batting_line_facts.player_id) OR hr_stats.batter_name = person_names.name ) GROUP BY CASE WHEN batting_line_facts.player_id IS NOT NULL AND batting_line_facts.player_id <> '' THEN 'id:' || batting_line_facts.player_id ELSE 'name:' || REPLACE(REPLACE(REPLACE(REPLACE(person_names.name, ' ', ''), char(12288), ''), '*', ''), '＊', '') END ORDER BY SUM(batting_line_facts.hits) DESC, SUM(batting_line_facts.at_bats) DESC, label ASC LIMIT ?
```

EXPLAIN QUERY PLAN:

```text
MATERIALIZE selected_batting
SEARCH batting_line_facts USING INDEX idx_batting_name_game (player_name_id=?)
LIST SUBQUERY 1
SCAN person_names
SEARCH game_facts USING INDEX sqlite_autoindex_game_facts_1 (game_id=?)
SEARCH teams USING INTEGER PRIMARY KEY (rowid=?)
SEARCH person_names USING INTEGER PRIMARY KEY (rowid=?)
MATERIALIZE hr_stats
SEARCH hr_games USING INDEX idx_games_year_date (year=?)
LIST SUBQUERY 3
SCAN selected_batting
SEARCH event_facts USING INDEX sqlite_autoindex_event_facts_1 (game_id=?)
SEARCH result_codes USING INTEGER PRIMARY KEY (rowid=?)
SEARCH batter_name USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
USE TEMP B-TREE FOR GROUP BY
SCAN batting_line_facts
SEARCH teams USING INTEGER PRIMARY KEY (rowid=?)
SEARCH person_names USING INTEGER PRIMARY KEY (rowid=?)
SEARCH game_facts USING COVERING INDEX sqlite_autoindex_game_facts_1 (game_id=?)
SEARCH positions USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN
SEARCH hr_stats USING AUTOMATIC COVERING INDEX (game_id=?) LEFT-JOIN
USE TEMP B-TREE FOR GROUP BY
USE TEMP B-TREE FOR ORDER BY
```

索引: SEARCH batting_line_facts USING INDEX idx_batting_name_game (player_name_id=?) / SEARCH game_facts USING INDEX sqlite_autoindex_game_facts_1 (game_id=?) / SEARCH teams USING INTEGER PRIMARY KEY (rowid=?) / SEARCH person_names USING INTEGER PRIMARY KEY (rowid=?) / SEARCH hr_games USING INDEX idx_games_year_date (year=?) / SEARCH event_facts USING INDEX sqlite_autoindex_event_facts_1 (game_id=?) / SEARCH result_codes USING INTEGER PRIMARY KEY (rowid=?) / SEARCH batter_name USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH game_facts USING COVERING INDEX sqlite_autoindex_game_facts_1 (game_id=?) / SEARCH positions USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN / SEARCH hr_stats USING AUTOMATIC COVERING INDEX (game_id=?) LEFT-JOIN

走査箇所: SCAN person_names / SCAN selected_batting / SCAN batting_line_facts

fact走査の分析: 上記SQLの文字列・名前・URL条件、OR/相関条件、対象全体の集計を区別する必要がある。この仮引数の計画ではfact索引への検索に変換されていない。対象全体の集計は集合の読み取りが必要であり、SCAN表示のみから不要な走査とは断定しない。
