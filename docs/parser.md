# Parser

## 目的

`packages/parser` は保存済みの raw HTML から、DB 投入用の structured intermediate object を生成する。

現行フローでは、年次取得と scores 補完の正規ルートは以下。

```text
discover
→ update:year
→ backfill:scores-canonical
→ enrich:scores-calendar
```

- `update:year`: discovery 結果から `games` の土台を作り、DB に投入する
- `backfill:scores-canonical`: scores canonical URL を確認済み URL として補完する
- `enrich:scores-calendar`: scores 4HTML を `data/raw/{year}/{mmdd}/{game_id}/...` に保存し、structured JSON を `data/structured/{year}/{mmdd}/{game_id}/...` に保存して DB を補完する

## 入力ページ

| ページ | 主責務 | 主な抽出項目 |
| --- | --- | --- |
| `index.html` | 試合トップの概要 | `game_meta`, `top_summary.linescore`, `top_summary.result_pitchers`, `top_summary.batteries`, `top_summary.home_runs`, `top_summary.latest_order` |
| `playbyplay.html` | イベント時系列 | `play_by_play` |
| `box.html` | 投打成績 | `batting_box`, `pitching_box` |
| `roster.html` | ベンチ入り名簿 | `roster` |

BIS current parser は scores parser と別に実装する。

| ページ | 主責務 | 主な抽出項目 |
| --- | --- | --- |
| `rst_{team_id}.html` | 最新選手一覧 | team, player_id, player_name, position, uniform_number, throws, bats |
| `index_{team_id}.html` | チーム一覧/概要 | table row values |
| `yearly_{team_id}.html` | 年度別チーム成績 | table row values |
| `idb1_{team_id}.html` | 個人打撃成績 | player_id, player_name, stats values |
| `idp1_{team_id}.html` | 個人投手成績 | player_id, player_name, stats values |
| `idf1_{team_id}.html` | 個人守備成績 | player_id, player_name, stats values |
| `results_{team_id}_{mm}.html` | チーム月別試合結果 | month, game_date, row values |

## 出力 JSON

| キー | 説明 |
| --- | --- |
| `schemaVersion` | structured JSON schema version。現状は `1` 固定 |
| `game_meta` | 試合単位メタ情報。日付、球場、カード、試合番号、開始/終了/試合時間、観客数、審判、canonical URL を保持 |
| `top_summary` | 試合トップ由来の要約情報 |
| `play_by_play` | `playbyplay.html` の source order を保ったイベント配列 |
| `batting_box` | チーム別打撃成績。打席ごとの inning cell を保持 |
| `pitching_box` | チーム別投手成績 |
| `roster` | チーム別ベンチ入り名簿。投手/捕手/内野手/外野手などの group を保持 |
| `sources` | 各 raw HTML の URL とローカルパス |
| `fetched_at` | 入力 HTML のうち最新 mtime を ISO8601 で保持 |

BIS current は `data/structured/bis/{year}/bis-current.json` にまとめて保存する。

## `play_by_play` の方針

- `playbyplay.html` の並び順をそのまま保持する
- 1 行を 1 event として扱う
- `kind` は使わず、`event_type` / `event_subtype` で整理する
- 打者・結果内のリンクは消さずに `PlayerRef` として保持する
- 打点は結果文から取れる場合のみ `runs_batted_in` に抽出する

### `event_type`

| 値 | 説明 |
| --- | --- |
| `game_note` | 試合進行メモ。現状は `先発投手` 行 |
| `substitution` | 独立した交代イベント行 |
| `plate_appearance` | 打者が存在する通常の打席結果行 |
| `runner_event` | 打者列が空で、走者処理だけが記録されている行 |

### `event_subtype`

| 値 | 主に対応する `event_type` | 説明 |
| --- | --- | --- |
| `starting_pitcher` | `game_note` | `（先発投手）` |
| `pitching_change` | `substitution` | `（投手交代）` |
| `defensive_switch` | `substitution` | `（守備変更）` |
| `pinch_hitter` | `plate_appearance` | 打者列が `代打・` で始まる打席 |
| `pinch_runner` | `substitution` | `（代走）`, `（臨時代走）` |
| `standard` | `plate_appearance` | 通常の打席 |
| `stolen_base` | `runner_event` | `盗塁成功` |
| `caught_stealing` | `runner_event` | `盗塁失敗`, `牽制` |
| `advance` | `runner_event` | `ワイルドピッチ`, `ボーク` など |
| `other` | 全種別 | 上記以外で raw text は保持するが細分類しないケース |

### 追加属性

`event_type` をこれ以上分裂させずに補助情報を持たせたい場合は、`play_by_play[].event_attributes` に寄せる。

| 属性 | 用途 |
| --- | --- |
| `runner` | `runner_event` の `（走者・...）` を `PlayerRef` として保持する |
| `implied_substitution_subtype` | raw HTML に独立した交代行はないが、直前イベントとの関係から補助的に推定できる交代種別を保持する。現状は `pinch_runner` のみ |

## `batting_box` / `pitching_box` の方針

- team table の header を保持する
- チーム計は `team_totals` に分離する
- 打撃 table の inning 列は `inning_results[]` に展開する
- inning cell の CSS class は `hit`, `walk`, `rbi` などを落とさず `classes[]` に保持する
- 投球回セルは inner table を潰して文字列化して保持する

## `roster` の方針

- 名簿カテゴリごとに `groups[]` を作る
- `右投左打` などの表記は `raw_handedness` に原文保持しつつ `throws`, `bats` に分解する

## 実行方法

現行の年次導線では parser CLI を直接使うのではなく、`enrich:scores-calendar` が parser と loader を呼び出す。

```bash
pnpm --filter @npb/db run enrich:scores-calendar --year 2025 --sqlite-path ./data/npb-2025.sqlite
```

BIS current:

```bash
pnpm --filter @npb/db run update:bis-current -- --year 2026 --team db --sqlite-path ./data/npb-2026.sqlite
```

単体調査用に parser CLI を使う場合:

```bash
pnpm --filter @npb/parser parse:game data/raw/2026/0327/r20260327g-t-01
```

任意の出力先を指定する場合:

```bash
pnpm --filter @npb/parser parse:game data/raw/2026/0327/r20260327g-t-01 /tmp/r20260327g-t-01.json
```

Not implemented:

- parser CLI を正規の年次更新導線として使う運用

## テスト

```bash
pnpm --filter @npb/parser test
pnpm --filter @npb/parser typecheck
pnpm --filter @npb/schemas test
```
