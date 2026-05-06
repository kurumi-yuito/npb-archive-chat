# Scores Calendar Enrichment

## 目的

`update:year` が作った `games` を土台に、`backfill:scores-canonical` で補完された `games.canonical_url`（scores index URL）から詳細データを補完する。

正規フロー:

```text
discover
→ update:year
→ backfill:scores-canonical
→ enrich:scores-calendar
```

対象:

- `games`
- `events`
- `batting_lines`
- `pitching_lines`
- `roster_entries`
- `source_snapshots`

## 実行

```bash
pnpm crawler:discover --year 2025
pnpm --filter @npb/db run update:year --year 2025 --sqlite-path ./data/npb-2025.sqlite
pnpm --filter @npb/db run backfill:scores-canonical --year 2025 --sqlite-path ./data/npb-2025.sqlite --league regular
pnpm --filter @npb/db run enrich:scores-calendar --year 2025 --sqlite-path ./data/npb-2025.sqlite
```

日付範囲だけ補完する場合:

```bash
pnpm --filter @npb/db run enrich:scores-calendar --year 2025 --sqlite-path ./data/npb-2025.sqlite --from 2025-04-05 --to 2025-04-07
```

## フロー

1. `games` テーブルから対象年の試合を列挙する
2. `games.canonical_url` が `https://npb.jp/scores/.../index.html` である試合を対象にする
3. canonical index URL から sibling URL を作る
4. `index.html` / `playbyplay.html` / `box.html` / `roster.html` の 4HTML を取得する
5. 成功した raw HTML を `data/raw/{year}/{mmdd}/{game_id}/` に保存する
6. raw HTML から structured JSON を生成する
7. `data/structured/{year}/{mmdd}/{game_id}/` に JSON を保存する
8. structured JSON から DB に replace / upsert する

## 保存先

raw:

```text
data/raw/{year}/{mmdd}/{game_id}/
  index.html
  playbyplay.html
  box.html
  roster.html
```

structured:

```text
data/structured/{year}/{mmdd}/{game_id}/
  game.json
  events.json
  batting_lines.json
  pitching_lines.json
  roster.json
  linescore.json
  sources.json
  unresolved.json
```

## canonical URL

- enrich は `games.canonical_url` を scores 側の正規 source として使う。
- `backfill:scores-canonical` は、scores URL が未補完の試合に対して候補 URL を生成し、HTTP 200 が確認できた URL だけを保存する。
- enrich 側で BIS 日別ページを再解釈して scores URL を推測する運用にはしない。

## source_snapshots

`source_snapshots` には以下を保持する。

- `game_id`
- `source_key`
- `source_url`
- `fetched_at`
- `raw_path`
- `structured_path`

## ログ

成功:

```text
[scores:ok] date=2025-08-15 game_id=r20250815b-l-17 files=index,playbyplay,box,roster
```

失敗:

```text
[scores:failed] date=2025-08-15 game_id=r20250815b-l-17 stage=box reason=status_404
```

対応不能:

```text
TODO: unresolved log format is not documented yet.
```

完了:

```text
[scores:done] year=2025 scanned=3251 existing_days=206 discovered=3251 loaded=3012 unresolved=0 failed=239
```

## 再実行性

- `games` は `game_id` 単位で upsert
- `events` は `game_id` 単位で削除後再投入
- `batting_lines` / `pitching_lines` / `roster_entries` / `source_snapshots` も `game_id` 単位で差し替え
- 同じ年を再実行しても重複しない
- `--from` / `--to` で対象日だけ再実行できる

## 実装状況

Done:

- canonical scores URL から 4HTML を取得
- raw HTML を `data/raw/{year}/{mmdd}/{game_id}/` に保存
- structured JSON を `data/structured/{year}/{mmdd}/{game_id}/` に保存
- `events` / `batting_lines` / `pitching_lines` / `roster_entries` / `source_snapshots` を差し替え
- 日付範囲指定

Not implemented:

- R2 を正規保存先にした enrichment
- 本番ジョブとしての監視、リトライ、アラート
