# Daily Update Runbook

このドキュメントは、本番の日次更新ジョブを有効化・手動実行・確認・復旧するときに読む。

## いつ読むか

| タイミング | やること |
|------------|----------|
| 初回リリース前 | [初回セットアップ](#初回セットアップ) を上から実行する |
| リリース後の疎通確認 | [手動 dry run](#手動-dry-run) → [手動本番更新](#手動本番更新) を実行する |
| 毎日の自動運用 | [Cron の確認](#cron-の確認) と [ログ確認](#ログ確認) を見る |
| 更新失敗時 | [失敗時の見る順番](#失敗時の見る順番) と [復旧](#復旧) を見る |

## 正規フロー

```text
Cloudflare Cron
→ Worker scheduled handler
→ GitHub Actions daily-update.yml を workflow_dispatch
→ R2 から年別 SQLite backup を復元
→ pnpm --filter @npb/db run update:daily -- --storage r2
→ raw / structured を R2 に保存
→ pnpm --filter @npb/db run sync:d1
→ production D1 へ反映
→ 更新後の年別 SQLite backup を R2 に保存
```

Cloudflare Cron は `wrangler.toml` で定義する。

```toml
[triggers]
crons = ["5 1,7,13 * * *"]
```

これは UTC なので、JST では毎日 `10:05 / 16:05 / 22:05` に実行される。

## 初回セットアップ

### 1. GitHub Actions secrets を設定する

GitHub repo で次を開く。

```text
Settings
→ Secrets and variables
→ Actions
→ Repository secrets
```

追加する secret:

| Secret | 値 |
|--------|----|
| `CLOUDFLARE_D1_API_TOKEN` | Cloudflare API token。D1 edit 用 |
| `CLOUDFLARE_R2_ACCESS_KEY_ID` | R2 S3 API token の Access Key ID |
| `CLOUDFLARE_R2_SECRET_ACCESS_KEY` | R2 S3 API token の Secret Access Key |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |

Cloudflare token は用途で分けて作る。

R2 用 token は Cloudflare API token ではなく、R2 の S3 API token を使う。

```text
Cloudflare Dashboard
→ R2
→ Manage R2 API Tokens
→ Create API token
```

Permissions:

```text
Object Read & Write
```

Buckets:

```text
npb-archive-chat-raw
```

作成後に表示される `Access Key ID` を `CLOUDFLARE_R2_ACCESS_KEY_ID`、`Secret Access Key` を `CLOUDFLARE_R2_SECRET_ACCESS_KEY` として GitHub Actions repository secrets に保存する。これは一度しか表示されない。

D1 用 token:

```text
Cloudflare Dashboard
→ My Profile
→ API Tokens
→ Create Token
→ Custom token
```

Permissions:

```text
Account / D1 / Edit
```

Account Resources:

```text
Include / <対象 Cloudflare account>
```

GitHub Actions では、D1 用 Cloudflare API token を `CLOUDFLARE_D1_API_TOKEN` に保存する。これは Zone resource ではなく Account resource の token にする。

workflow 内では次のように使い分ける。

- R2 SQLite backup 復元 / 保存 step: `aws s3 cp` に `CLOUDFLARE_R2_ACCESS_KEY_ID` / `CLOUDFLARE_R2_SECRET_ACCESS_KEY` を渡す
- D1 sync step: `CLOUDFLARE_API_TOKEN=${{ secrets.CLOUDFLARE_D1_API_TOKEN }}`

D1 と R2 の権限は分ける。R2 object 操作に Cloudflare API token は使わない。

### 2. Cloudflare Worker secrets を設定する

repo root で実行する。

```bash
wrangler secret put NPB_DAILY_UPDATE_GITHUB_OWNER
```

値:

```text
kurumi-yuito
```

```bash
wrangler secret put NPB_DAILY_UPDATE_GITHUB_REPO
```

値:

```text
npb-archive-chat
```

```bash
wrangler secret put NPB_DAILY_UPDATE_GITHUB_WORKFLOW
```

値:

```text
daily-update.yml
```

```bash
wrangler secret put NPB_DAILY_UPDATE_GITHUB_REF
```

値:

```text
main
```

```bash
wrangler secret put NPB_DAILY_UPDATE_GITHUB_TOKEN
```

値:

```text
GitHub workflow_dispatch 用 token
```

`NPB_DAILY_UPDATE_GITHUB_TOKEN` は GitHub Actions workflow を起動できる権限が必要。

### 3. 初回 R2 backup を作る

GitHub Actions runner はローカルの `data/` を見られない。初回だけ、現在の年別 SQLite を R2 にアップロードする。

repo root で実行する。

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

Wrangler の `r2 object put` は 300MiB を超える単一ファイルをアップロードできないため、`data/` 全体の tarball は使わない。年別 SQLite はそれぞれ 300MiB 未満なので、年別 object として保存する。

この object 群がないと、GitHub Actions の `Restore SQLite backups from R2` で失敗する。

### 4. 最新コードを push する

`.github/workflows/daily-update.yml` は GitHub 上の default branch にある内容が実行される。ローカル変更だけでは動かない。

```bash
git status --short
git add .
git commit -m "Configure production daily update"
git push
```

既に commit 済みなら `git push` だけでよい。

### 5. Worker を deploy する

Cloudflare Cron の scheduled handler は Worker 側にある。secret 設定後に deploy 済みであることを確認する。

```bash
wrangler deploy
```

deploy output に以下が出ることを確認する。

```text
schedule: 5 1,7,13 * * *
```

## 手動 dry run

目的:

- GitHub Actions が起動すること
- `update:daily --dry-run` が通ること
- D1 / R2 を更新しないこと

GitHub CLI:

```bash
gh workflow run daily-update.yml -f dry_run=true -f days=3
```

GitHub UI:

```text
Actions
→ Daily NPB Scores Update
→ Run workflow
→ dry_run: true
→ days: 3
→ Run workflow
```

確認:

```text
Actions → Daily NPB Scores Update → 実行結果
```

成功条件:

- workflow が green
- job env の `IS_DRY_RUN` が `true`
- `Install Wrangler` / `Restore SQLite backups from R2` / `Sync updated SQLite data to D1` / `Save SQLite backups to R2` は skipped
- Step Summary に `data/logs/update-daily-summary.json` の内容が出る
- `Restore SQLite backups from R2` / `Sync updated SQLite data to D1` / `Save SQLite backups to R2` は dry run では実行されない
- dry run では `sync:d1` を実行しないため、`data/logs/d1-sync/summary.json` は作られない。確認するのは `data/logs/update-daily-summary.json` だけ。

`Restore SQLite backups from R2` が実行され、`IS_DRY_RUN: false` と表示されている場合は dry run ではなく本番更新として起動している。GitHub UI の `dry_run` を `true` にして再実行する。
`IS_DRY_RUN: true` なのに `Restore SQLite backups from R2` が実行される場合は、workflow の dry run 判定が古い。最新の `.github/workflows/daily-update.yml` を `main` に push してから再実行する。

## 手動本番更新

目的:

- R2 の年別 SQLite backup を復元する
- `update:daily --storage r2` を実行し、raw / structured を R2 に保存する
- production D1 に反映する
- 更新後の年別 SQLite を R2 backup として保存する

GitHub CLI:

```bash
gh workflow run daily-update.yml -f days=3
```

特定日だけ更新:

```bash
gh workflow run daily-update.yml -f date=2026-05-09
```

期間指定:

```bash
gh workflow run daily-update.yml -f from=2026-05-07 -f to=2026-05-09
```

成功条件:

- workflow が green
- `Verify D1 sync summary` が成功する
- artifact `daily-update-logs` が作成される
- `data/logs/update-daily-summary.json` が artifact に含まれる
- `data/logs/d1-sync/summary.json` が artifact に含まれる
- `d1-sync` の verification が `mismatches: []`

`data/logs/d1-sync/summary.json` は GitHub Actions runner 上で作られる。ローカルの `data/logs/d1-sync/summary.json` に自動では戻らない。確認場所は次のどちらか。

- GitHub Actions run の Step Summary にある `sync:d1`
- artifact `daily-update-logs` をダウンロードして中の `data/logs/d1-sync/summary.json`

ローカルに同じファイルが必要な場合は、ローカルで `sync:d1` を実行する。dry run では `sync:d1` を実行しないため、このファイルは出ない。

本番 API 確認:

```bash
curl -s https://npb-archive-chat-web.mr-y50-0104.workers.dev/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"藤浪晋太郎の所属チームは"}'
```

## Cron の確認

Cloudflare dashboard:

```text
Workers & Pages
→ npb-archive-chat-web
→ Triggers
```

確認する値:

```text
5 1,7,13 * * *
```

Wrangler:

```bash
wrangler deployments list
```

直近 deploy が現在の Worker であることを確認する。

## Cron を待たずに更新処理を確認する

Cloudflare dashboard の Cron Triggers には、環境や UI によって手動 `Test` が表示されない。そのため、Cron を待たずに確認したい場合は GitHub Actions を直接 `workflow_dispatch` する。

dry run:

```bash
gh workflow run daily-update.yml --ref main -f dry_run=true -f days=3
```

本番更新:

```bash
gh workflow run daily-update.yml --ref main -f days=3
```

これで GitHub Actions 側の `update:daily --storage r2` / raw・structured R2保存 / R2 restore / D1 sync / R2 save は確認できる。

Cloudflare Cron から Worker scheduled handler が GitHub Actions を起動する経路は、次回 Cron 発火後に確認する。JST の実行時刻は `10:05 / 16:05 / 22:05`。

## ログ確認

GitHub Actions:

```text
Actions
→ Daily NPB Scores Update
→ 対象 run
```

見る場所:

- `Run update:daily`
- `Sync updated SQLite data to D1`
- `Save SQLite backups to R2`
- `Summary`
- artifact `daily-update-logs`

Cloudflare Worker:

```bash
wrangler tail npb-archive-chat-web
```

見るログ:

```text
[cloudflare-cron] dispatching daily update workflow ...
[cloudflare-cron] dispatch succeeded ...
```

## 失敗時の見る順番

1. GitHub Actions run が作られているか
   - 作られていない: Worker scheduled handler / GitHub dispatch secret を確認
   - 作られている: GitHub Actions の各 step を確認
2. `Restore SQLite backups from R2`
   - 失敗時は `npb-archive-chat-raw/backups/sqlite/npb-YYYY.sqlite` があるか確認
   - `CLOUDFLARE_R2_ACCESS_KEY_ID` / `CLOUDFLARE_R2_SECRET_ACCESS_KEY` / `CLOUDFLARE_ACCOUNT_ID` を確認
   - 403 の場合は R2 S3 API token に `npb-archive-chat-raw` bucket の Object Read & Write 権限がない。Cloudflare Dashboard の R2 API token を作り直し、GitHub secrets を更新する。
   - Cloudflare API token の `CLOUDFLARE_R2_API_TOKEN` は使わない。R2 backup 復元 / 保存は S3 互換 API で実行する。
3. `Run update:daily`
   - 404 warning は通常許容
   - parse failure / DB write failure は修正が必要
4. `Sync updated SQLite data to D1`
   - `data/logs/d1-sync/summary.json` の `mismatches` を確認
   - `CLOUDFLARE_D1_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` を確認
5. `Save SQLite backups to R2`
   - R2 write 権限を確認
   - `CLOUDFLARE_R2_ACCESS_KEY_ID` / `CLOUDFLARE_R2_SECRET_ACCESS_KEY` / `CLOUDFLARE_ACCOUNT_ID` を確認

## 復旧

同じ日付範囲で再実行できる。

```bash
gh workflow run daily-update.yml -f date=2026-05-09
```

複数日を戻して再実行する。

```bash
gh workflow run daily-update.yml -f from=2026-05-07 -f to=2026-05-09
```

D1 同期だけやり直したい場合はローカルから実行する。

```bash
pnpm --filter @npb/db run sync:d1 -- \
  --sqlite-dir ./data \
  --d1-database npb-archive-chat-import \
  --keep-files \
  --verify
```

## 関連ファイル

| ファイル | 役割 |
|----------|------|
| `.github/workflows/daily-update.yml` | GitHub Actions の実行本体 |
| `wrangler.toml` | Cloudflare Cron schedule |
| `apps/web/server/plugins/cloudflare-cron.ts` | Worker scheduled handler |
| `apps/web/server/services/cloudflare-cron-update-dispatch.ts` | GitHub workflow dispatch request |
| `packages/db/src/update-daily.ts` | `update:daily` 実装 |
| `packages/db/src/d1-sync.ts` | 年別 SQLite → D1 同期 |
| `docs/update-job.md` | 更新ジョブの仕様 |
| `docs/deploy.md` | Cloudflare deploy 手順 |
| `docs/production-todo.md` | 本番運用の完了条件 |
