# R2 Canonical Storage Runbook

R2 を raw HTML / structured JSON の保存先として扱うときの手順書。

このドキュメントは R2 storage だけを書く。日次更新ジョブや GitHub Actions の運用は [daily-update-runbook.md](./daily-update-runbook.md) を見る。

## 使うコマンド

R2 を直接触るコマンドは、`wrangler r2 object put/get` か `pnpm --filter @npb/db run rebuild:r2-year -- ...` を使う。

```bash
pnpm --filter @npb/db run rebuild:r2-year -- --year 2026 --storage r2 --r2-bucket npb-archive-chat-raw --sqlite-path ./data/npb-2026.rebuilt.sqlite --clean
```

## やること

1. R2 bucket `npb-archive-chat-raw` を使う。
2. R2 S3 API token を用意する。
3. raw HTML と structured JSON を R2 に置く。
4. 必要なら R2 から年別 SQLite を再構築する。

## 初回セットアップ

### 1. R2 S3 API token を用意する

Cloudflare Dashboard:

```text
R2
→ Manage R2 API Tokens
→ Create API token
```

必要な値:

- `Access Key ID`
- `Secret Access Key`

保存先:

- `CLOUDFLARE_R2_ACCESS_KEY_ID`
- `CLOUDFLARE_R2_SECRET_ACCESS_KEY`
- `CLOUDFLARE_ACCOUNT_ID`

### 2. raw / structured の置き場所を確認する

R2 object key はローカル `data/` 配下と対応させる。

| 種別 | R2 key |
|------|--------|
| scores raw HTML | `raw/{year}/{mmdd}/{game_id}/{page}.html` |
| scores structured JSON | `structured/{year}/{mmdd}/{game_id}/{game,events,batting_lines,pitching_lines,roster,linescore,sources}.json` |
| scores calendar raw | `raw-scores-calendar/{year}/{mmdd}/index.html` |
| BIS current raw | `raw/bis/{year}/{team_id}-{page}.html` |
| BIS current structured | `structured/bis/{year}/bis-current.json` |

### 3. raw / structured を R2 に置く

local のファイルを R2 に上げる場合は `wrangler r2 object put` を使う。下の例はこのリポジトリ内に実在するファイルを使っている。

```bash
wrangler r2 object put "npb-archive-chat-raw/raw/2026/0327/r20260327b-e-01/index.html" \
  --file ./data/raw/2026/0327/r20260327b-e-01/index.html \
  --content-type text/html \
  --remote

wrangler r2 object put "npb-archive-chat-raw/structured/2026/0327/r20260327b-e-01/events.json" \
  --file ./data/structured/2026/0327/r20260327b-e-01/events.json \
  --content-type application/json \
  --remote
```

## R2 由来 mirror から再構築する

R2 由来のローカル mirror (`data/raw` / `data/structured`) から年別 SQLite を再構築する。

```bash
pnpm --filter @npb/db run rebuild:r2-year -- --year 2026 --storage r2 --r2-bucket npb-archive-chat-raw --sqlite-path ./data/npb-2026.rebuilt.sqlite --clean
```

確認:

```bash
pnpm --filter @npb/db run sync:d1 -- --sqlite-dir ./data --d1-database npb-archive-chat-import --verify
```

期待:

- `verification.mismatches` が `[]`
- `/api/chat` が source URL 付きで回答する

## 確認

R2 に object があるかを確認する。

```bash
wrangler r2 object get "npb-archive-chat-raw/raw/2026/0327/r20260327b-e-01/index.html" \
  --file /tmp/index.html \
  --remote
```

## 禁止事項

- R2 上の raw HTML を削除しない
- R2 lifecycle rule で raw / structured を削除しない
- `/api/chat` から R2 raw を直接読まない
- R2 object を public API として公開しない
