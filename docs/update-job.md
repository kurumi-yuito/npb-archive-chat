# Update Job

## 前提

- repo root で `pnpm install` 済み
- SQLite ファイルを書き込める

## 役割分担

現在の正規データフローは次に統一する。

```text
discover
→ update:year
→ backfill:scores-canonical
→ enrich:scores-calendar
```

`crawler:download` は raw HTML の個別取得用 CLI として残っているが、年次 DB 更新の正規導線ではない。

`update:year`:

- 年単位の discovery を取得し、`games` の土台を作る
- raw HTML を `data/raw/{year}/{mmdd}/{game_id}/...` に保存する
- 正規化 DB に投入する

`backfill:scores-canonical`:

- `games.canonical_url` が scores URL でない試合に対して、全年度共通の候補生成と存在確認で scores index URL を補完する
- 200 確認できた URL だけを `games.canonical_url` に保存する

`enrich:scores-calendar`:

- `backfill:scores-canonical` 済みの `games.canonical_url` を正規 scores index URL として使う
- sibling URL から `index.html` / `playbyplay.html` / `box.html` / `roster.html` を取得する
- raw HTML を `data/raw/{year}/{mmdd}/{game_id}/...` に保存する
- structured JSON を `data/structured/{year}/{mmdd}/{game_id}/...` に保存する
- `events` / `batting_lines` / `pitching_lines` / `roster_entries` / `source_snapshots` を補完する

`update:bis-current`:

- scores enrichment とは別に `npb.jp/bis` の最新系ページを取得する
- raw HTML を `data/raw/bis/{year}/...` に保存する
- structured JSON を `data/structured/bis/{year}/bis-current.json` に保存する
- `current_team_roster` / stats 系テーブル / `bis_source_snapshots` に upsert する

## 実行順

```bash
pnpm crawler:discover --year 2025
pnpm --filter @npb/db run update:year --year 2025 --sqlite-path ./data/npb-2025.sqlite
pnpm --filter @npb/db run backfill:scores-canonical --year 2025 --sqlite-path ./data/npb-2025.sqlite --league regular
pnpm --filter @npb/db run enrich:scores-calendar --year 2025 --sqlite-path ./data/npb-2025.sqlite
pnpm --filter @npb/db run update:bis-current -- --year 2025 --sqlite-path ./data/npb-2025.sqlite
```

live smoke を少数件で確認する場合:

```bash
pnpm --filter @npb/db run enrich:scores-calendar --year 2025 --sqlite-path ./data/npb-2025.sqlite --league regular --limit 20
```

## 日次更新

本番運用では人間が毎日手動実行する前提にしない。日次差分は `update:daily` を scheduler から呼ぶ。

```bash
pnpm --filter @npb/db run update:daily
```

既定値:

- JST 基準
- 今日を含む直近 3 日
- SQLite は `data/npb-{year}.sqlite`
- `backfill:scores-canonical --source calendar-live --league regular`
- `enrich:scores-calendar --league regular`

オプション:

```bash
pnpm --filter @npb/db run update:daily -- --date 2025-04-05
pnpm --filter @npb/db run update:daily -- --from 2025-04-05 --to 2025-04-07
pnpm --filter @npb/db run update:daily -- --days 5
pnpm --filter @npb/db run update:daily -- --strict
pnpm --filter @npb/db run update:daily -- --date 2025-04-05 --dry-run
pnpm --filter @npb/db run update:daily -- --sqlite-dir ./data
pnpm --filter @npb/db run update:daily -- --include-bis-current
```

挙動:

- 対象日の `games` / scores 4HTML / detail tables だけを更新する。
- 再実行しても同じ `game_id` の normalized rows は差し替えられる。
- rain cancelled は正常な skip として扱う。
- 404 は通常 warning、`--strict` では non-zero。
- parse failure / DB write failure は non-zero。
- `data/logs/update-daily-summary.json` に集計と warning / error 理由を残す。
- `--dry-run` は対象 date range / year / sqlite path だけを summary に出し、DB / network 更新を実行しない。
- `--include-bis-current` を付けると、対象年ごとに `update:bis-current` も実行する。BIS current は scores より重いため、必要な scheduler run だけで有効化する。

## 自動実行

本番での有効化・手動実行・ログ確認・復旧手順は [daily-update-runbook.md](./daily-update-runbook.md) を正とする。この章は仕様の要約である。

Cloudflare Cron と GitHub Actions の manual dispatch を組み合わせる。

- Cloudflare Cron: root `wrangler.toml` の `[triggers].crons = ["5 1,7,13 * * *"]`
- Cloudflare Worker の `scheduled` handler が GitHub Actions の `workflow_dispatch` を叩く
- `.github/workflows/daily-update.yml` は `workflow_dispatch` 専用
- `workflow_dispatch` で `date` / `from` / `to` / `days` / `strict` / `dry_run` を指定可能
- コマンドが non-zero なら workflow も失敗する
- logs と summary は artifact / Step Summary に残る

Cloudflare Cron の本番設定:

```bash
wrangler secret put NPB_DAILY_UPDATE_GITHUB_OWNER
wrangler secret put NPB_DAILY_UPDATE_GITHUB_REPO
wrangler secret put NPB_DAILY_UPDATE_GITHUB_WORKFLOW
wrangler secret put NPB_DAILY_UPDATE_GITHUB_REF
wrangler secret put NPB_DAILY_UPDATE_GITHUB_TOKEN
```

`NPB_DAILY_UPDATE_GITHUB_WORKFLOW` の既定値は `daily-update.yml`、`NPB_DAILY_UPDATE_GITHUB_REF` の既定値は `main` である。

GitHub Actions 側の本番設定:

1. GitHub personal access token を作成する。
   - Cloudflare Cron から workflow を起動する token: 対象 repo の Actions workflow dispatch ができる権限。
   - GitHub Actions から Cloudflare D1 を操作する token: D1 edit 権限。
   - GitHub Actions から Cloudflare R2 を操作する token: R2 object read/write 権限。
2. GitHub repo の `Settings → Secrets and variables → Actions → Repository secrets` に追加する。
   - `CLOUDFLARE_D1_API_TOKEN`
   - `CLOUDFLARE_R2_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
3. Cloudflare Worker の secrets に追加する。
   - `NPB_DAILY_UPDATE_GITHUB_OWNER`: `kurumi-yuito`
   - `NPB_DAILY_UPDATE_GITHUB_REPO`: `npb-archive-chat`
   - `NPB_DAILY_UPDATE_GITHUB_WORKFLOW`: `daily-update.yml`
   - `NPB_DAILY_UPDATE_GITHUB_REF`: `main`
   - `NPB_DAILY_UPDATE_GITHUB_TOKEN`: GitHub workflow dispatch 用 token
4. 初回だけ、現在の年別 SQLite を R2 backup としてアップロードする。

```bash
for sqlite_path in data/npb-*.sqlite; do
  file_name="$(basename "$sqlite_path")"
  wrangler r2 object put "npb-archive-chat-raw/backups/sqlite/$file_name" \
    --remote \
    --file "$sqlite_path" \
    --content-type application/vnd.sqlite3 \
    --force
done
```

自動更新時の実処理:

1. Cloudflare Cron が `5 1,7,13 * * *` に発火する。
2. Worker が GitHub Actions `daily-update.yml` を `workflow_dispatch` する。
3. GitHub Actions が R2 の `backups/sqlite/npb-YYYY.sqlite` を復元する。
4. `pnpm --filter @npb/db run update:daily` を実行する。
5. `pnpm --filter @npb/db run sync:d1 -- --sqlite-dir ./data --d1-database npb-archive-chat-import --keep-files --verify` を実行し、production D1 に反映する。
6. 更新後の年別 SQLite を `backups/sqlite/npb-YYYY.sqlite` として R2 に保存する。
7. summary と logs を GitHub Actions artifact に残す。

手動確認:

```bash
# dry run: D1 / R2 を更新しない
gh workflow run daily-update.yml -f dry_run=true -f days=3

# 本番更新: R2 backup を復元し、update:daily 後に D1 同期と R2 backup 更新を行う
gh workflow run daily-update.yml -f days=3
```

Cloudflare dashboard の Cron Triggers には、環境や UI によって手動 `Test` が表示されない。その場合、次回 Cron 発火を待たずに更新処理を確認するには GitHub Actions を直接 `workflow_dispatch` する。Cloudflare Cron から Worker scheduled handler が GitHub Actions を起動する経路は、次回 Cron 発火後に Worker logs と GitHub Actions run で確認する。失敗した場合は Worker logs に `[cloudflare-cron]`、GitHub Actions に `Daily NPB Scores Update` の失敗が残る。

## 保存先

- `data/discovery/{year}.json`
- `data/raw/{year}/{mmdd}/{game_id}/...`
- `data/structured/{year}/{mmdd}/{game_id}/...`
- SQLite: `games`, `events`, `batting_lines`, `pitching_lines`, `roster_entries`, `source_snapshots`
- BIS current: `data/raw/bis/{year}/...`, `data/structured/bis/{year}/bis-current.json`, `current_team_roster`, stats 系テーブル, `bis_source_snapshots`

## 確認

```bash
sqlite3 ./data/npb-2025.sqlite "SELECT COUNT(*) FROM games WHERE canonical_url LIKE 'https://npb.jp/scores/%';"
sqlite3 ./data/npb-2025.sqlite "SELECT COUNT(*) FROM events;"
sqlite3 ./data/npb-2025.sqlite "SELECT COUNT(*) FROM batting_lines;"
sqlite3 ./data/npb-2025.sqlite "SELECT COUNT(*) FROM pitching_lines;"
sqlite3 ./data/npb-2025.sqlite "SELECT COUNT(*) FROM roster_entries;"
sqlite3 ./data/npb-2025.sqlite "SELECT COUNT(*) FROM source_snapshots;"
sqlite3 ./data/npb-2025.sqlite "SELECT COUNT(*) FROM current_team_roster;"
```

詳細は [scores-calendar-enrichment.md](./scores-calendar-enrichment.md) を参照。

## 実装状況

Done:

- 2016-2026 の年別 SQLite データ基盤
- `discover` / `update:year` / `backfill:scores-canonical` / `enrich:scores-calendar` のローカル CLI
- `update:daily` のローカル CLI
- `update:bis-current` のローカル CLI
- GitHub Actions workflow_dispatch
- Cloudflare Cron からの workflow_dispatch 発火
- scores 4HTML の raw 保存、structured JSON 保存、DB 補完
- BIS current の raw 保存、structured JSON 保存、DB 補完

Not implemented:

- 本番運用での監視、リトライ、通知
- R2 を正規保存先にした更新ジョブ
