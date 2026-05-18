# デプロイ手順（Cloudflare Workers + D1 + R2）

このドキュメントを、Cloudflare へデプロイするための正の手順書とする。`production-readiness.md` は本番投入時の確認用であり、デプロイ手順はここに集約する。

本番用の secret はリポジトリに含めない。`wrangler.toml` の D1 / R2 設定は、Cloudflare で作成した実リソースに合わせる。

環境変数 / secret の設定先は [env-reference.md](./env-reference.md) に集約している。ここでは Cloudflare デプロイの流れだけを追う。

## 先に結論

このプロジェクトでは repo root の `wrangler.toml` だけを使う。

やることは次の順番だけ。

1. D1 / R2 を確認する
2. `wrangler.toml` を埋める
3. secret を入れる
4. D1 migration を流す
5. `pnpm build:cf`
6. `wrangler deploy`

Cloudflare 側で新しい Git リポジトリを作る手順は使わない。

## 実行順

### 1. ローカル確認

repo root で実行する。

```bash
pnpm install
pnpm --filter @npb/db test
pnpm --filter @npb/web test
pnpm --filter @npb/web typecheck
```

### 2. Cloudflare リソース作成

Cloudflare dashboard で以下を作る。

- Worker
- D1 database（検索データ用）
- D1 database（account / usage 用）
- R2 bucket

手元のコマンドで作るなら:

```bash
wrangler login
wrangler d1 create npb-archive-chat-import
wrangler r2 bucket create npb-archive-chat-raw
```

既に存在する場合は作り直さない。`wrangler d1 list` と `wrangler r2 bucket list` で既存のものを確認して、その `database_id` / `bucket_name` を使う。

### 3. `wrangler.toml` を埋める

repo root の [wrangler.toml](../wrangler.toml) を編集する。

必ず確認する項目:

- `name`
- `database_id`
- `bucket_name`
- `main = "apps/web/.output/server/index.mjs"`
- `directory = "apps/web/.output/public"`

このリポジトリでは、既存の D1 は `npb-archive-chat-import` / `14c099c3-03ac-4307-9704-7a770b31d108`、既存の R2 は `npb-archive-chat-raw` を使う。

### 4. secrets を設定する

```bash
wrangler secret put NPB_AUTH_SHARED_SECRET
wrangler secret put NPB_GOOGLE_CLIENT_ID
wrangler secret put NPB_GOOGLE_CLIENT_SECRET
wrangler secret put NPB_GOOGLE_REDIRECT_URL
```

LLM を使うなら追加で:

```bash
wrangler secret put CHAT_QUERY_LLM_API_KEY
wrangler secret put CHAT_ANSWER_LLM_API_KEY
```

ここに入れる値は OpenAI Platform の API keys 画面（`https://platform.openai.com/api-keys`）で作る Project API key（通常は `sk-proj-...`）である。
同じ API key を `CHAT_QUERY_LLM_API_KEY` と `CHAT_ANSWER_LLM_API_KEY` の両方に設定してよい。
1つの変数に2つの key を入れるのではなく、2つの変数へ同じ `sk-proj-...` をそれぞれ設定する。

### 5. D1 migration を適用する

これは **schema の適用** だけである。**本番データの投入ではない**。

```bash
wrangler d1 execute npb-archive-chat-import --remote --file=packages/db/migrations/0001_initial.sql
wrangler d1 execute npb-archive-chat-import --remote --file=packages/db/migrations/0002_chat_usage.sql
wrangler d1 execute npb-archive-chat-import --remote --file=packages/db/migrations/0003_scores_calendar_rebuild.sql
wrangler d1 execute npb-archive-chat-import --remote --file=packages/db/migrations/0004_bis_current.sql
wrangler d1 execute npb-archive-chat-import --remote --file=packages/db/migrations/0005_chat_accounts.sql
```

このコマンドで D1 の schema を揃える。`games` / `events` / `current_team_roster` などの実データは次の `sync:d1` で入れる。

### 5-2. 本番データを D1 に流し込む

以下のコマンドで、`data/npb-2016.sqlite` から `data/npb-2026.sqlite` までの年別 SQLite をまとめて remote D1 に同期する。

```bash
pnpm --filter @npb/db run sync:d1 -- --sqlite-dir ./data --d1-database npb-archive-chat-import --keep-files
```

このコマンドは次を行う。

- `data/npb-YYYY.sqlite` を export 前に migrate する
- `data/npb-YYYY.sqlite` を年ごとに読み込む
- D1 用 SQL を `data/logs/d1-sync/YYYY.sql` に生成する
- 年ごとのデータを remote D1 に `wrangler d1 execute` で流し込む
- `data/logs/d1-sync/summary.json` に件数サマリーを残す

### 5-3. D1 import 後の件数検証

`sync:d1` は import 後に各 table の件数を自動で検証し、`data/logs/d1-sync/summary.json` に残す。
scores 由来の履歴テーブルは年をまたいで累積され、`bis_source_snapshots` / `current_team_roster` / `team_index` / `team_yearly_stats` / `player_batting_stats` / `player_pitching_stats` / `player_fielding_stats` / `team_monthly_results` は最新 BIS スナップショットとして検証される。

verify を明示したいなら `--verify` を付ける。検証を省略したい場合のみ `--no-verify` を使う。

```bash
pnpm --filter @npb/db run sync:d1 -- --sqlite-dir ./data --d1-database npb-archive-chat-import --keep-files --verify
```

`summary.json` が出ていて、コマンドが non-zero で落ちていなければ、本番データ投入は完了とみなせる。

### 6. build する

```bash
pnpm build:cf
```

### 7. deploy する

```bash
wrangler deploy
```

### 8. 動作確認する

```bash
curl -s https://<worker-domain>/api/account
curl -s https://<worker-domain>/api/chat/usage
curl -s https://<worker-domain>/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"藤浪晋太郎の所属チームは"}'
```

確認ポイント:

- `/api/account` が 200 で account を返す
- `/api/chat/usage` が plan に応じた usage を返す
- `/api/chat` が source URL 付きで応答する
- free で上限到達時に 429 になる
- `X-NPB-Plan` header ではなく `chat_accounts.plan` が正になる
- 0件 / ambiguous では LLM に逃がさず deterministic fallback になる

### 9. 更新ジョブを有効化する

Cloudflare Cron を有効にし、GitHub Actions の `workflow_dispatch` で手動再実行できるようにする。

## Wrangler 設定ファイル

repo root の [wrangler.toml](../wrangler.toml) を使う。

```text
wrangler.toml
apps/web/.output/server/index.mjs
apps/web/.output/public
```

## ローカル（Node）と Cloudflare の違い

| 項目 | ローカル開発・従来ビルド | Cloudflare 向けビルド |
|------|-------------------------|------------------------|
| Nitro プリセット | `node-server`（既定） | `cloudflare_module`（`pnpm build:cf`） |
| DB（検索） | `NPB_SQLITE_PATH` → `openDatabase` → **`sqliteDatabaseToQuery`**（`QueryDatabase`） | **`event.context.cloudflare.env.NPB_DB`**（D1）→ **`createQueryDatabaseFromD1`**（同じ `QueryDatabase`） |
| DB（account / usage） | `NPB_SQLITE_PATH` → `openDatabase` → **`sqliteDatabaseToQuery`** | **`event.context.cloudflare.env.NPB_META_DB`**（D1）→ **`createQueryDatabaseFromD1`**。未設定時だけ `NPB_DB` に fallback。 |
| マイグレーション（スキーマ） | 起動時に `migrateDatabase`（同期・SQLite ファイル） | **デプロイ前に** `wrangler d1 execute ...` で適用（ランタイムでは D1 に migrate しない） |
| オブジェクトストレージ | `local` storage（ワークスペースの `data/`） | **R2**（raw / structured 正規保存先、年別 SQLite backup 保存先） |
| ランタイム設定 | `runtimeConfig.npbSqlitePath` が必須（SQLite パス） | D1 利用時は **`NPB_DB` と `NPB_META_DB` があれば `npbSqlitePath` は未設定でも可** |

## 実装状況

Done:

- Cloudflare Workers 向け build 設定（`pnpm build:cf`）
- D1 adapter（`createQueryDatabaseFromD1`）
- root `wrangler.toml`
- SQLite / D1 の query boundary
- Cloudflare Cron / GitHub Actions workflow_dispatch による `update:daily`
- production signed-cookie identity のコード
- R2 raw / structured storage adapter
- `update:daily --storage r2`
- `rebuild:r2-year`

本番環境で確認する項目:

- 実アカウント上の Worker / D1 / R2 / secrets / domain 設定

## ここまでやれば「本番 deploy 完了」

1. `wrangler.toml` の `database_id` と `bucket_name` を実リソースに合わせる。
2. `wrangler secret put NPB_AUTH_SHARED_SECRET` を入れる。
3. D1 migration を適用する。
4. `pnpm --filter @npb/db run sync:d1 -- --sqlite-dir ./data --d1-database npb-archive-chat-import --keep-files --verify` を通す。
5. `summary.json` に件数サマリーと verification が出ることを確認する。
6. `pnpm build:cf` を通す。
7. `wrangler deploy` を通す。
8. `/api/account` / `/api/chat/usage` / `/api/chat` を確認する。
9. Cloudflare Cron を有効化する。具体手順は [daily-update-runbook.md](./daily-update-runbook.md) を読む。

本番確認項目は [production-readiness.md](./production-readiness.md) にある。デプロイ手順はこの `deploy.md`、日次更新ジョブの本番運用手順は [daily-update-runbook.md](./daily-update-runbook.md) を読む。

### DB 接続層（`QueryDatabase`）

- **`packages/db`** の検索・チャット用リポジトリは、非同期の **`QueryDatabase`**（`prepare` → `run` / `get` / `all` が `Promise`）を受け取る。
- **ローカル**: 同期の `SqliteDatabase`（`node:sqlite`）を **`sqliteDatabaseToQuery`** でラップする。CLI の **loader / `migrateDatabase`** は従来どおり同期 `SqliteDatabase` のみ（変更なし）。
- **Workers**: **`apps/web/server/utils/d1-query-database.ts`** の **`createQueryDatabaseFromD1`** が Cloudflare の **`D1Database`** を `QueryDatabase` に適合させる。Wrangler の binding 名は **`NPB_DB`**（root `wrangler.toml` の `d1_databases.binding` と一致）。
- **切り替え条件**: `apps/web/server/utils/server-database.ts` の **`getServerDatabase(event, npbSqlitePath)`** が、`event.context.cloudflare.env.NPB_DB` の有無で分岐する（詳細は下記「SQLite と D1 の切り替え条件」）。

## 前提ツール

- Node.js 20+
- [pnpm](https://pnpm.io/) 9（ルート `packageManager` と一致）
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/)（`npm i -g wrangler` または `pnpm dlx wrangler`）
- Cloudflare アカウント（Workers / D1 / R2 を利用可能）

## ローカル確認

ローカルの動作確認だけしたい場合は、repo root で次を実行する。

```bash
export NPB_SQLITE_PATH="$PWD/data/npb-2025.sqlite"
export NPB_SQLITE_DIR="$PWD/data"
pnpm dev
```

別 shell で:

```bash
curl -s http://127.0.0.1:3000/api/account
curl -s http://127.0.0.1:3000/api/chat/usage
curl -s http://127.0.0.1:3000/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"藤浪晋太郎の所属チームは"}'
```

`NPB_SQLITE_PATH` が無いと API は 503 になる。

## 1. Cloudflare リソース作成

Cloudflare dashboard または Wrangler で作成するもの:

- Worker
- D1 database
- R2 bucket

作成後、root の `wrangler.toml` を埋める。

```toml
[[d1_databases]]
binding = "NPB_DB"
database_name = "npb-archive-chat-import"
database_id = "<Cloudflare が発行した D1 database UUID>"

[[d1_databases]]
binding = "NPB_META_DB"
database_name = "npb-archive-chat-meta"
database_id = "<Cloudflare が発行した D1 database UUID>"

[[r2_buckets]]
binding = "NPB_R2_RAW"
bucket_name = "npb-archive-chat-raw"
```

`binding` はアプリ側が参照する名前なので、通常は `NPB_DB` / `NPB_META_DB` / `NPB_R2_RAW` のままにする。

## 2. 環境変数 / secrets

設定先の一覧は [env-reference.md](./env-reference.md) を見る。

必須:

| 名前 | 用途 |
|------|------|
| `NPB_SQLITE_PATH` | ローカル Node で usage DB / single-year fallback に使う SQLite。D1 binding がある Workers では不要。 |
| `NPB_SQLITE_DIR` | ローカル Node で multi-year query layer が読む `npb-{year}.sqlite` のディレクトリ。 |
| `NPB_AUTH_SHARED_SECRET` | production の signed-cookie / internal bearer request の署名 secret。production では必須。 |

任意:

| 名前 | 既定 | 用途 |
|------|------|------|
| `NPB_AUTH_HEADER_FALLBACK` | dev: `true`, production: `false` | dev header fallback を許可するか。production では `false`。 |
| `NPB_DEFAULT_PLAN` | `free` | 初回 account 作成時の既定 plan。 |
| `NPB_STRIPE_SECRET_KEY` | 空 | Stripe Dashboard の `開発者` → `API キー` にある live mode の `sk_live_...`。`/api/billing/subscription` と webhook 同期で使う。 |
| `NPB_STRIPE_WEBHOOK_SECRET` | 空 | live mode の Stripe webhook signing secret。 |
| `NPB_STRIPE_PRO_PRICE_ID` | 空 | live mode の Stripe pro 月額 Price ID。 |
| `NPB_STRIPE_CHECKOUT_SUCCESS_URL` | 空 | Checkout 成功後の戻り URL。 |
| `NPB_STRIPE_CHECKOUT_CANCEL_URL` | 空 | Checkout キャンセル後の戻り URL。 |
| `NPB_STRIPE_PORTAL_RETURN_URL` | 空 | Billing Portal から戻る URL。 |
| `CHAT_QUERY_LLM_BASE_URL` | `https://api.openai.com/v1` | structured query LLM の base URL。 |
| `CHAT_QUERY_LLM_API_KEY` | 空 | production chat では必須。OpenAI Platform の Project API key、通常は `sk-proj-...`。 |
| `CHAT_QUERY_LLM_MODEL` | `gpt-4.1-mini` | production chat では必須。structured query LLM model。 |
| `CHAT_ALLOW_HEURISTIC_FALLBACK` | `false` | dev/test 用。production では `false` のままにする。 |
| `CHAT_ANSWER_LLM_BASE_URL` | `https://api.openai.com/v1` | final answer LLM の base URL。 |
| `CHAT_ANSWER_LLM_API_KEY` | 空 | production chat では必須。`CHAT_QUERY_LLM_API_KEY` と同じ OpenAI Project API key でよい。 |
| `CHAT_ANSWER_LLM_MODEL` | `gpt-4.1-mini` | production chat では必須。final answer LLM model。 |
| `CHAT_ALLOW_DETERMINISTIC_ANSWER_FALLBACK` | `false` | dev/test 用。production では `false` のままにする。 |
| `NPB_DAILY_UPDATE_GITHUB_OWNER` | 空 | Cloudflare Cron が `workflow_dispatch` する GitHub owner。 |
| `NPB_DAILY_UPDATE_GITHUB_REPO` | 空 | Cloudflare Cron が `workflow_dispatch` する GitHub repo。 |
| `NPB_DAILY_UPDATE_GITHUB_WORKFLOW` | `daily-update.yml` | 叩く workflow file 名。 |
| `NPB_DAILY_UPDATE_GITHUB_REF` | `main` | `workflow_dispatch` の ref。 |
| `NPB_DAILY_UPDATE_GITHUB_TOKEN` | 空 | `actions: write` 権限を持つ token。Cloudflare Cron で必須。 |

missing env:

- SQLite/D1 がどちらも無い場合は API が 503 `missing_env`。
- production で `NPB_AUTH_SHARED_SECRET` が無い場合は 503 `auth_not_configured`。

Workers production では secret を Wrangler で設定する。

```bash
wrangler secret put NPB_AUTH_SHARED_SECRET
```

Workers production のチャットは LLM 必須。
`CHAT_QUERY_LLM_API_KEY` / `CHAT_QUERY_LLM_MODEL` が無い場合、自然文理解を heuristic parser に落とさず 503 にする。
`CHAT_ANSWER_LLM_API_KEY` / `CHAT_ANSWER_LLM_MODEL` が無い場合も deterministic formatter に落とさず 503 にする。

```bash
wrangler secret put CHAT_QUERY_LLM_API_KEY
wrangler secret put CHAT_ANSWER_LLM_API_KEY
```

API key は OpenAI Platform の API keys 画面（`https://platform.openai.com/api-keys`）で作る Project API key を使う。
model / base URL / fallback flags は secret ではないので root の `wrangler.toml` の `[vars]` に置く。
このリポジトリでは次を既定値として入れている。

```toml
[vars]
CHAT_QUERY_LLM_BASE_URL = "https://api.openai.com/v1"
CHAT_QUERY_LLM_MODEL = "gpt-4.1-mini"
CHAT_ALLOW_HEURISTIC_FALLBACK = "false"
CHAT_ANSWER_LLM_BASE_URL = "https://api.openai.com/v1"
CHAT_ANSWER_LLM_MODEL = "gpt-4.1-mini"
CHAT_ALLOW_DETERMINISTIC_ANSWER_FALLBACK = "false"
```

Cloudflare Cron を使う場合は GitHub workflow dispatch 用の secret も設定する。

```bash
wrangler secret put NPB_DAILY_UPDATE_GITHUB_OWNER
wrangler secret put NPB_DAILY_UPDATE_GITHUB_REPO
wrangler secret put NPB_DAILY_UPDATE_GITHUB_WORKFLOW
wrangler secret put NPB_DAILY_UPDATE_GITHUB_REF
wrangler secret put NPB_DAILY_UPDATE_GITHUB_TOKEN
```

## 3. D1 migration（スキーマ適用）

マイグレーション SQL は **`packages/db/migrations/`** が単一のソースです（`0001_initial.sql`、`0002_chat_usage.sql`、`0003_scores_calendar_rebuild.sql` など）。

### ローカル SQLite

`@npb/db` の CLI で、**ファイルパスを指定して**適用します。

```bash
pnpm --filter @npb/db migrate -- ./data/npb.sqlite
```

（`migrate` script は内部で **tsx** を使い `src/cli.ts` を実行する。`pnpm install` 後に利用する。）

（`./data/npb.sqlite` は任意のパスに置き換え。`NPB_SQLITE_PATH` と同じファイルを指すとよいです。）

初回アクセス時に `server-database.ts` が `migrateDatabase` を呼ぶため、**空の DB ファイルを渡せば起動時にマイグレーションが走る**動きも従来どおりです。

### Cloudflare D1

検索 D1 には検索データ用 schema を適用する。

```bash
wrangler d1 execute npb-archive-chat-import --remote --file=packages/db/migrations/0001_initial.sql
wrangler d1 execute npb-archive-chat-import --remote --file=packages/db/migrations/0003_scores_calendar_rebuild.sql
wrangler d1 execute npb-archive-chat-import --remote --file=packages/db/migrations/0004_bis_current.sql
```

メタ D1 には account / usage 用 schema を適用する。

```bash
wrangler d1 execute npb-archive-chat-meta --remote --file=packages/db/migrations/0002_chat_usage.sql
wrangler d1 execute npb-archive-chat-meta --remote --file=packages/db/migrations/0005_chat_accounts.sql
wrangler d1 execute npb-archive-chat-meta --remote --file=packages/db/migrations/0006_stripe_billing.sql
wrangler d1 execute npb-archive-chat-meta --remote --file=packages/db/migrations/0007_google_auth_accounts.sql
```

- `npb-archive-chat-import` / `npb-archive-chat-meta` は `wrangler.toml` の `database_name` と一致させる。
- 新しいマイグレーションが増えたら、**同様に順番に `execute`** する。
- ランタイムでは D1 migration を実行しない。デプロイ前に適用する。

## 4. build と deploy

```bash
pnpm build:cf
wrangler deploy
```

`wrangler deploy` の結果に `Your Worker has access to the following bindings` が出れば、Cloudflare は設定を読めている。

## 5. 本番確認

```bash
curl -s https://<worker-domain>/api/account
curl -s https://<worker-domain>/api/chat/usage
curl -s https://<worker-domain>/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"藤浪晋太郎の所属チームは"}'
```

確認項目:

- `/api/account` が account を作成/取得する
- `/api/chat/usage` が DB の account plan を読む
- `/api/chat` が source URL 付きで回答する
- ambiguous は候補提示のみで検索しない
- `X-NPB-Plan` header ではなく `chat_accounts.plan` が plan の正になる

## 関連ファイル

| ファイル | 内容 |
|----------|------|
| `wrangler.toml` | Worker 名、エントリ、D1 / R2 / ASSETS の設定 |
| `apps/web/.dev.vars.example` | `wrangler dev` 用のローカル変数テンプレ（コピーして `.dev.vars`） |
| `scripts/build-cf.mjs` | `NITRO_PRESET=cloudflare_module` でビルド |
| `apps/web/nuxt.config.ts` | `nitro.preset`（環境変数または既定 `node-server`） |
| `apps/web/server/utils/server-database.ts` | `getServerDatabase` — D1 / SQLite の切り替え |
| `apps/web/server/utils/d1-query-database.ts` | D1 → `QueryDatabase` 適合 |
| `packages/db/src/query-driver.ts` | `QueryDatabase` / `sqliteDatabaseToQuery` |

## SQLite と D1 の切り替え条件

`getServerDatabase(event, npbSqlitePath)` は次の順で決まる。

1. **`event.context.cloudflare.env.NPB_DB` が存在する**（Nitro が Cloudflare 上で渡す `D1Database`）→ **D1 を使用**。`npbSqlitePath` は未設定でもよい（未設定のときのエラーは出ない）。
2. **上記が無い**（ローカル `nuxt dev` や `node-server` ビルド）→ **`npbSqlitePath` 必須**。SQLite ファイルを開き、`migrateDatabase` してから `QueryDatabase` にラップする。
3. **D1 も無く `npbSqlitePath` も空** → 503 用のエラー（`NPB_SQLITE_PATH ... not set`）。

`wrangler dev` で D1 をローカルにバインドする場合は、Cloudflare のドキュメントに従い、`NPB_DB` がコンテキストに載ることを確認する。

## 6. 差分更新ジョブ

`update:daily` は GitHub Actions から自動実行する入口を実装済みです。本番での有効化・手動実行・ログ確認・復旧手順は [daily-update-runbook.md](./daily-update-runbook.md) を正とする。

- workflow: `.github/workflows/daily-update.yml`
- schedule: `5 1,7,13 * * *`（10:05 / 16:05 / 22:05 JST）
- manual: `workflow_dispatch` で `date` / `from` / `to` / `days` / `strict`
- summary: `data/logs/update-daily-summary.json`

Cloudflare Cron は `scheduled` handler から GitHub Actions の `workflow_dispatch` を叩く。

Cloudflare Cron の動作:

1. `wrangler.toml` の `[triggers].crons` が発火する。
2. Worker の `scheduled` handler が GitHub Actions の `daily-update.yml` を `workflow_dispatch` する。
3. GitHub Actions が R2 の年別 SQLite backup を復元する。
4. GitHub Actions が `pnpm --filter @npb/db run update:daily` を実行する。
5. GitHub Actions が `sync:d1` で production D1 に反映する。
6. GitHub Actions が更新後の年別 SQLite を R2 backup に保存する。
7. 失敗時は workflow が non-zero で落ち、summary / artifact に残る。

## 7. Rollback

- Worker: `wrangler deployments list` で直近 deployment を確認し、Cloudflare dashboard または Wrangler で直前 version に戻す。
- D1 schema: destructive migration は作らず、追加 migration で戻す。適用前に backup を取る。
- データ: `update:daily` は idempotent な差分更新なので、壊れた日付範囲は修正後に同じ `--date` / `--from --to` で再実行する。

## 8. Backup

- SQLite: `data/npb-{year}.sqlite` を release artifact または object storage に保存する。
- D1: 本番投入前後に `wrangler d1 export` 相当で backup を取得する。
- R2: raw HTML は削除しない。lifecycle rule を設定する場合も raw / structured の削除は禁止。
