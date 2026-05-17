# DB Loader / Search DB

## 目的

`data/structured/{year}/{mmdd}/{game_id}/...` の structured JSON から検索用DBへ正規化投入するための構成を定義する。

このDBは structured JSON から再生成可能であり、検索の中心は `events` テーブルとする。

現在の正規データフロー:

```text
discover
→ update:year
→ backfill:scores-canonical
→ enrich:scores-calendar
```


## 方針

- migration を必須にする
- structured JSON は source of truth ではないが、DB は structured JSON から再構築できるようにする
- 1イベント = 1行 を基本とし、イベント分裂はしない
- parser が出した `event_type` / `event_subtype` / `event_attributes` をそのまま保持する
- source URL と保存パスは `source_snapshots` と各検索行の `sourceUrl` に残す


## テーブル一覧

### `games`

1試合につき1行の概要テーブル。

保持するもの:

- 試合ID、日付、球場、カード、試合番号、試合状態
- 開始時刻、終了時刻、試合時間、入場者数
- ホーム/ビジターの正式名・短縮名
- ラインスコアとトップ要約 (`linescore_json`, `result_pitchers_json`, `batteries_json`, `home_runs_json`, `latest_order_json`)
- structured JSON の `fetched_at`

責務:

- `events` など明細テーブルの親
- 試合メタ検索の起点
- structured JSON のトップ要約再利用


### `events`

検索の中心テーブル。1イベント = 1行。

保持するもの:

- `game_id`
- `event_index`
- `sequence`
- `inning`
- `half`
- `inning_label`
- `offense_team`
- `event_type`
- `event_subtype`
- `outs`
- `bases`
- `count_text`
- `batter_role_prefix`
- `batter_name`
- `batter_url`
- `batter_raw_text`
- `pitcher_name`
- `pitcher_url`
- `runner_name`
- `runner_url`
- `result_text`
- `result_runs_batted_in`
- `result_links_json`
- `event_attributes_json`
- `raw_row_html`
- `source_url`
- `source_text`

責務:

- 「いつ」「どこで」「何回に」「誰が」「何をしたか」を引く
- `event_type` を主分類として検索する
- `event_subtype` を詳細分類として検索する
- `event_attributes_json` に追加情報を保持する
- batter / pitcher / runner を列として持ち、人物軸の検索を軽くする
- raw HTML 行を残し、parser の再検証に使えるようにする
- source URL を検索結果の根拠として返せるようにする


### `batting_lines`

box score の打撃成績を保持する。

保持するもの:

- チーム
- 行番号
- 打順
- 守備位置
- 選手名 / URL
- 打数、得点、安打、打点、盗塁
- 打席ごとの結果 JSON
- ヘッダー JSON

責務:

- 個人成績検索
- 試合単位の打撃成績参照
- box score の再表示補助


### `pitching_lines`

box score の投手成績を保持する。

保持するもの:

- チーム
- 行番号
- 勝敗記号
- 投手名 / URL
- 球数、打者数、投球回、被安打、被本塁打、与四球、与死球、奪三振、暴投、ボーク、失点、自責点
- ヘッダー JSON

責務:

- 個人成績検索
- 試合単位の投手成績参照


### `roster_entries`

roster.html の名簿を保持する。

保持するもの:

- チーム
- グループラベル
- 行番号
- 背番号
- 選手名 / URL
- 投 / 打
- 生の利き手表記
- スタメン判定、打順、守備位置（scores calendar enrichment 後）

責務:

- ベンチ入り選手の確認
- 未出場選手を含む試合時点名簿の保存


### `source_snapshots`

raw source への参照を保持する。

保持するもの:

- `game_id`
- `source_key` (`index`, `playbyplay`, `box`, `roster`)
- `source_url`
- `source_path`
- `fetched_at`

責務:

- source URL の永続化
- raw HTML / structured JSON のトレース補助

### BIS current tables

`update:bis-current` が投入する補助テーブル。scores の試合単位 enrichment とは別系統。

- `bis_source_snapshots`: BIS raw / structured / source URL の追跡
- `current_team_roster`: `rst_{team_id}.html` 由来の最新選手一覧
- `team_index`: `index_{team_id}.html` 由来のチーム一覧/概要
- `team_yearly_stats`: `yearly_{team_id}.html` 由来の年度別チーム成績
- `player_batting_stats`: `idb1_{team_id}.html` 由来の個人打撃成績
- `player_pitching_stats`: `idp1_{team_id}.html` 由来の個人投手成績
- `player_fielding_stats`: `idf1_{team_id}.html` 由来の個人守備成績
- `team_monthly_results`: `results_{team_id}_{mm}.html` 由来の月別試合結果

所属チーム回答では `current_team_roster` を最優先し、存在しない場合だけ scores の `roster_entries` / `batting_lines` / `pitching_lines` / `events` に fallback する。


## `events` カラム設計の詳細

### 識別と順序

- `game_id`: 試合単位の識別子
- `event_index`: structured JSON の `play_by_play[].event_index` をそのまま保存
- `sequence`: 現状は `event_index` と同値。検索・並び替え用の明示列

`sequence` を分けているのは、将来 loader 内で補助的な順序制御が必要になっても `event_index` の原値を壊さないため。


### イニング軸

- `inning`
- `half`
- `inning_label`
- `offense_team`

これで「何回表裏の、どちらの攻撃か」を直接引ける。


### 関係者

- `batter_role_prefix`
- `batter_name`
- `batter_url`
- `batter_raw_text`
- `pitcher_name`
- `pitcher_url`
- `runner_name`
- `runner_url`

`batter` / `pitcher` / `runner` は検索負荷を下げるため列へ展開する。
一方で parser の情報欠落を避けるため、打者の生テキストは `batter_raw_text` に残す。


### 結果

- `result_text`
- `result_runs_batted_in`
- `result_links_json`

イベント結果の可読テキストを主に使い、リンク情報は JSON で保持する。


### 分類

- `event_type`
- `event_subtype`

保存方法:

- どちらも TEXT 列に parser 出力の値をそのまま保存する
- 値の意味付けは parser / schema 側に従う
- loader 側で再分類はしない

例:

- `plate_appearance` + `standard`
- `plate_appearance` + `pinch_hitter`
- `runner_event` + `stolen_base`
- `substitution` + `pitching_change`
- `game_note` + `starting_pitcher`


### 追加属性

- `event_attributes_json`

保存方法:

- SQLite/D1 では JSON 専用型ではなく TEXT に JSON 文字列として保存する
- 値は structured JSON の `event_attributes` をそのまま `JSON.stringify(...)` したもの
- `null` のときは SQL `NULL`

ここには parser が決めた追加情報をそのまま残す。

現状の重要例:

- `runner`
- `implied_substitution_subtype`

したがって、`runner_event` の `implied_substitution_subtype` は `event_attributes_json` に保存される。


## loader の挙動

- loader は最初に migration 済み DB を前提とする
- `games` は `game_id` 単位で upsert する
- `events` / `batting_lines` / `pitching_lines` / `roster_entries` / `source_snapshots` は対象試合分を削除して再投入する
- これにより structured JSON 再生成後の再ロードで整合を取りやすくする


## `searchEvents` の検索条件

`searchEvents` は `events` を主テーブルにしつつ、`games` を `game_id` で結合して `game_date` 条件も扱う。

使える条件:

- `game_date`: `games.date` と完全一致
- `year`: `games.year` と完全一致
- `year_from` / `year_to`: `games.year` の範囲
- `inning`: `events.inning` と完全一致
- `half`: `events.half` と完全一致
- `team`: `events.offense_team` と完全一致
- `batter_name`: `events.batter_name` と完全一致
- `batter_player_id`: `events.batter_url` または `event_attributes_json` の player URL と照合
- `pitcher_name`: `events.pitcher_name` と完全一致
- `pitcher_player_id`: `events.pitcher_url` または `event_attributes_json` の player URL と照合
- `runner_name`: `events.runner_name` と完全一致
- `runner_player_id`: `events.runner_url` または `event_attributes_json` の player URL と照合
- `event_type`: `events.event_type` と完全一致
- `event_subtype`: `events.event_subtype` と完全一致
- `player_name`: `batter_name` / `pitcher_name` / `runner_name` のいずれかと完全一致
- `player_id`: batter / pitcher / runner URL または `event_attributes_json` の player URL と照合
- `result_text_contains`: `events.result_text` の LIKE 検索
- `limit`: 取得上限。未指定時は `50`

検索仕様:

- 条件はすべて AND で結合する
- 人物参照は名前ベースに加えて、chat backend の player resolution が追加する player_id filter に対応する
- `game_date` は `YYYY-MM-DD` 形式
- `half` は `top` / `bottom`
- `player_name` は後方互換用の広い検索条件として残している

戻り値には最低限の検索表示用列として `gameId`, `gameDate`, `sequence`, `inning`, `half`, `offenseTeam`, `eventType`, `eventSubtype`, `batterName`, `pitcherName`, `runnerName`, `resultText`, `eventAttributesJson`, `sourceUrl` を返す

## その他の query layer

`packages/db` の repository には次がある。基本は **完全一致** と範囲条件のみ（`venue` / `competition` 条件はまだ持たない）。

- `searchGames`: 条件は `game_date`（`games.date`）、`game_id`（`games.game_id`）。戻りは `gameId`, `date`, `awayTeamName`, `homeTeamName`, `matchupText` のみ。
- `searchBattingLines`: `batting_lines` と `games` を結合。条件は `game_date` / `year` / `year_from` / `year_to`、`player_name`、`team`、`result_text_contains`。
- `searchPitchingLines`: `pitching_lines` と `games` を結合。条件は `game_date`、`pitcher_name`、`team`（`pitching_lines.team`）。戻りは投球結果の要約列のみ。
- `searchRosterEntries`: `roster_entries` と `games` を結合。`starter` / `batting_order` を返す。
- `searchGameDetails`: `games` の詳細を返す。
- `aggregateBattingLines` / `aggregatePitchingLines` / `aggregateEvents`: DB 集計結果だけを返す。
- `searchPlayerCandidates`: events / batting_lines / pitching_lines / roster_entries から player candidate を集約し、chat の player_id resolution に使う。
- `createMultiYearQueryService`: `data/npb-{year}.sqlite` を年別に開き、2016-2026 の横断検索を行う。

Web API からの呼び出しと責務分担は [service-layer.md](./service-layer.md) を参照。


## CLI

`packages/db` には最低限の CLI を置く。

例:

```bash
pnpm --filter @npb/db run migrate -- ./tmp/npb.sqlite
pnpm --filter @npb/db run update:year --year 2025 --sqlite-path ./data/npb-2025.sqlite
pnpm --filter @npb/db run backfill:scores-canonical --year 2025 --sqlite-path ./data/npb-2025.sqlite --league regular
pnpm --filter @npb/db run enrich:scores-calendar --year 2025 --sqlite-path ./data/npb-2025.sqlite
```

（各 script は **tsx** で TypeScript を実行する。`pnpm install` で `@npb/db` の devDependency を入れておくこと。）


## テスト観点

- migration が適用できる
- raw HTML から parse した 1試合分を投入できる
- `events` に複数行入る
- `event_type` / `event_subtype` / 関係者名で簡単な検索ができる
- `source_snapshots` に4ソースが入る
- player_id filter で候補が絞れる
- multi-year query layer で年範囲検索ができる

## 実装状況

Done:

- 2016-2026 の年別 SQLite データ基盤
- `events` 中心の normalized search DB
- source URL / source path の保存
- multi-year query layer
- player candidate search と player_id filter
- chat 用の aggregate / roster / game detail query

設計上の追加検討:

- `players` 専用マスタテーブル
- venue / competition などの高度な検索条件
- D1 本番接続時の adapter 分離は `QueryDatabase` boundary で実装済み。今後の拡張は repository 単位で行う。


## 次に人間が確認すべき点

- `games` に置いたトップ要約 JSON をこのまま保持するか、さらに列分解するか
- `players` 専用マスタを追加するか
- `outs` / `bases` / `count_text` を文字列のままにするか、検索要件に応じて構造化列を追加するか
- `batting_lines` / `pitching_lines` で team totals 専用テーブルが必要か
- D1 本番接続時にこの loader をそのまま使うか、Workers 用 adapter に切り出すか
