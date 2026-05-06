# デプロイ手順（Cloudflare Workers + D1 + R2）

このドキュメントを、Cloudflare へデプロイするための正の手順書とする。`production-todo.md` は残作業の確認用であり、デプロイ手順はここに集約する。

本番用の secret はリポジトリに含めない。`wrangler.toml` の D1 / R2 設定は、Cloudflare で作成した実リソースに合わせる。

## 全体手順

1. ローカルで test / typecheck を通す。
2. Cloudflare の D1 database と R2 bucket を作る。
3. root の `wrangler.toml` を実リソースに合わせる。
4. Cloudflare Workers secrets / vars を設定する。
5. D1 migration を順番に適用する。
6. 本番 D1 に検索データを投入する。
7. `pnpm build:cf` で Cloudflare 用に build する。
8. `wrangler deploy` で Worker を deploy する。
9. `/api/account` / `/api/chat/usage` / `/api/chat` を確認する。
10. GitHub Actions の `update:daily` schedule を有効化し、手動 dispatch で確認する。

## Wrangler 設定ファイル

Cloudflare の Git リポジトリ連携は、既定では repo root の `wrangler.toml` を探す。そのため、このリポジトリでは root の [wrangler.toml](../wrangler.toml) を正とする。

```text
wrangler.toml
apps/web/.output/server/index.mjs
apps/web/.output/public
```

`apps/web/wrangler.toml` は使わない。Wrangler コマンドは repo root から実行する。

## ローカル（Node）と Cloudflare の違い

| 項目 | ローカル開発・従来ビルド | Cloudflare 向けビルド |
|------|-------------------------|------------------------|
| Nitro プリセット | `node-server`（既定） | `cloudflare_module`（`pnpm build:cf`） |
| DB（検索・チャット） | `NPB_SQLITE_PATH` → `openDatabase` → **`sqliteDatabaseToQuery`**（`QueryDatabase`） | **`event.context.cloudflare.env.NPB_DB`**（D1）→ **`createQueryDatabaseFromD1`**（同じ `QueryDatabase`） |
| マイグレーション（スキーマ） | 起動時に `migrateDatabase`（同期・SQLite ファイル） | **デプロイ前に** `wrangler d1 execute ...` で適用（ランタイムでは D1 に migrate しない） |
| オブジェクトストレージ | 未使用（データはワークスペースの `data/`） | **R2**（`NPB_R2_RAW` binding は雛形のみ。raw / structured 配置の本番運用は未実装） |
| ランタイム設定 | `runtimeConfig.npbSqlitePath` が必須（SQLite パス） | D1 利用時は **`NPB_DB` があれば `npbSqlitePath` は未設定でも可** |

## 実装状況

Done:

- Cloudflare Workers 向け build scaffold（`pnpm build:cf`）
- D1 adapter（`createQueryDatabaseFromD1`）
- root `wrangler.toml`
- SQLite / D1 の query boundary
- GitHub Actions schedule による `update:daily`
- production signed-cookie identity のコード

Not implemented:

- 実アカウント上の Worker / D1 / R2 / secrets / domain 設定
- D1 への 2016-2026 データ投入手順の自動化
- R2 を raw / structured の正規保存先にする実装
- Cloudflare Cron だけで `update:daily` 相当を完結させる Worker 実装

残作業の一覧は [production-todo.md](./production-todo.md) にある。ただし実行手順はこの `deploy.md` を読む。

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

## 0. 事前確認

repo root で実行する。

```bash
pnpm install
pnpm --filter @npb/db test
pnpm --filter @npb/web test
pnpm --filter @npb/web typecheck
```

ローカル起動も確認する。

```bash
export NPB_SQLITE_PATH="$PWD/data/npb-2025.sqlite"
export NPB_SQLITE_DIR="$PWD/data"
pnpm dev
```

別 shell で確認する。

```bash
curl -s http://127.0.0.1:3000/api/account
curl -s http://127.0.0.1:3000/api/chat/usage
curl -s http://127.0.0.1:3000/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"藤浪晋太郎の所属チームは"}'
```

## ローカル起動

リポジトリルートで:

```bash
pnpm install
```

SQLite のパスを環境変数で渡してから（例）:

```bash
# Windows PowerShell の例
$env:NPB_SQLITE_PATH = "C:\path\to\npb-2025.sqlite"
$env:NPB_SQLITE_DIR = "C:\path\to\data"
pnpm dev
```

```bash
# bash の例
export NPB_SQLITE_PATH="$PWD/data/npb-2025.sqlite"
export NPB_SQLITE_DIR="$PWD/data"
pnpm dev
```

- 未設定の場合、`getServerDatabase` が失敗し API は 503 になります。
- 検索 API・チャット API・usage 制限の挙動は従来どおりです。

## 1. Cloudflare リソース作成

Cloudflare dashboard または Wrangler で次を作成する。

1. Worker: `npb-archive-chat-web`
2. D1 database: 例 `npb-archive-chat-import`
3. R2 bucket: 例 `npb-archive-chat-raw`

Wrangler の例:

```bash
wrangler login
wrangler d1 create npb-archive-chat-import
wrangler r2 bucket create npb-archive-chat-raw
```

作成後、root の `wrangler.toml` を確認する。

```toml
[[d1_databases]]
binding = "NPB_DB"
database_name = "npb-archive-chat-import"
database_id = "<Cloudflare が発行した D1 database UUID>"

[[r2_buckets]]
binding = "NPB_R2_RAW"
bucket_name = "npb-archive-chat-raw"
```

`binding` はアプリ側が参照する名前なので、変更する場合はコード側も合わせる。通常は `NPB_DB` / `NPB_R2_RAW` のままにする。

## 2. 環境変数 / secrets

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
| `NPB_BILLING_CONFIGURED` | `false` | `/api/account` の `billingConfigured` 表示用。現行課金は `billing_provider=internal`。 |
| `NPB_DEFAULT_PLAN` | `free` | 初回 account 作成時の既定 plan。 |
| `CHAT_QUERY_LLM_BASE_URL` | `https://api.openai.com/v1` | structured query LLM の base URL。 |
| `CHAT_QUERY_LLM_API_KEY` | 空 | 未設定時は heuristic parser fallback。 |
| `CHAT_QUERY_LLM_MODEL` | 空 | structured query LLM model。 |
| `CHAT_ANSWER_LLM_BASE_URL` | `https://api.openai.com/v1` | final answer LLM の base URL。 |
| `CHAT_ANSWER_LLM_API_KEY` | 空 | 未設定時は deterministic formatter fallback。 |
| `CHAT_ANSWER_LLM_MODEL` | 空 | final answer LLM model。 |

missing env:

- SQLite/D1 がどちらも無い場合は API が 503 `missing_env`。
- production で `NPB_AUTH_SHARED_SECRET` が無い場合は 503 `auth_not_configured`。

Workers production では secret を Wrangler で設定する。

```bash
wrangler secret put NPB_AUTH_SHARED_SECRET
```

LLM を使う場合のみ API key を設定する。未設定時は deterministic formatter fallback で動く。

```bash
wrangler secret put CHAT_QUERY_LLM_API_KEY
wrangler secret put CHAT_ANSWER_LLM_API_KEY
```

model / base URL は secret ではなく `[vars]` で管理してよい。必要なら root の `wrangler.toml` に追加する。

```toml
[vars]
CHAT_QUERY_LLM_MODEL = "gpt-4.1-mini"
CHAT_ANSWER_LLM_MODEL = "gpt-4.1-mini"
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

マイグレーションをファイル順に適用する。

```bash
wrangler d1 execute npb-archive-chat --remote --file=packages/db/migrations/0001_initial.sql
wrangler d1 execute npb-archive-chat --remote --file=packages/db/migrations/0002_chat_usage.sql
wrangler d1 execute npb-archive-chat --remote --file=packages/db/migrations/0003_scores_calendar_rebuild.sql
wrangler d1 execute npb-archive-chat --remote --file=packages/db/migrations/0004_bis_current.sql
wrangler d1 execute npb-archive-chat --remote --file=packages/db/migrations/0005_chat_accounts.sql
```

- `npb-archive-chat` は `wrangler.toml` の `database_name` と一致させる。
- 新しいマイグレーションが増えたら、**同様に順番に `execute`** する（ローカル SQLite と同じ順序を維持）。
- ランタイムでは D1 migration を実行しない。デプロイ前に適用する。

## 4. 本番 D1 へのデータ投入

現在の正規データ基盤はローカル SQLite にある。D1 への 2016-2026 全量投入は、Cloudflare アカウント上で実施する本番運用作業である。

最低限の確認手順:

1. 対象年の `data/npb-{year}.sqlite` が揃っていることを確認する。
2. D1 への export / import 方針を決める。
3. 投入前に D1 backup を取る。
4. 投入後に件数確認を行う。

確認 SQL:

```sql
SELECT COUNT(*) FROM games;
SELECT COUNT(*) FROM events;
SELECT COUNT(*) FROM current_team_roster;
SELECT COUNT(*) FROM player_batting_stats;
SELECT COUNT(*) FROM chat_accounts;
```

TODO: SQLite から D1 へ 2016-2026 の normalized rows を自動投入する専用コマンドは未実装。現状は本番作業として import 方針を決めて実施する。

## 5. Cloudflare 向けビルド

リポジトリルートで:

```bash
pnpm build:cf
```

- 内部で `NITRO_PRESET=cloudflare_module` を設定し、`apps/web/.output` を生成します。
- 通常の `pnpm build` は **`node-server` プリセットのまま**（ローカル検証・従来フロー用）。

## 6. Worker デプロイ

repo root で実行する。

```bash
wrangler deploy
```

- 初回は `wrangler login` が必要な場合があります。
- 静的アセットは `[assets]` で `.output/public` をバインドしています（Nitro の `cloudflare_module` 出力に合わせた雛形）。

## 7. 本番確認

`<worker-domain>` は Cloudflare が発行した Workers domain または設定済み custom domain に置き換える。

```bash
curl -s https://<worker-domain>/api/account
curl -s https://<worker-domain>/api/chat/usage
curl -s https://<worker-domain>/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"藤浪晋太郎の所属チームは"}'
```

確認項目:

- `/` が `/chat` に遷移する。
- `/api/account` が account を作成/取得する。
- `/api/billing/subscription` で `free` / `pro` が切り替わる。
- `/api/chat/usage` が DB の account plan を読む。
- free で月間上限到達時に 429 になる。
- pro で `limit: null` / `remaining: null` になる。
- `/api/chat` が source URL 付きで回答する。
- ambiguous は候補提示のみで検索しない。
- `X-NPB-Plan` header ではなく `chat_accounts.plan` が plan の正になる。

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

## 8. 差分更新ジョブ

`update:daily` は GitHub Actions から自動実行する入口を実装済みです。

- workflow: `.github/workflows/daily-update.yml`
- schedule: `5 1,7,13 * * *`（10:05 / 16:05 / 22:05 JST）
- manual: `workflow_dispatch` で `date` / `from` / `to` / `days` / `strict`
- summary: `data/logs/update-daily-summary.json`

Cloudflare Cron で実行する場合の設計:

1. Worker の `scheduled` handler で JST の対象日範囲を決める。
2. R2 から raw / structured を読み書きする storage adapter を使う。
3. D1 に canonical / structured rows を upsert する write adapter を使う。
4. `update:daily` と同じ failure policy（rain_cancelled 正常、404 warning、strict 相当では error）を適用する。
5. 実行 summary を R2 または Cloudflare Logs に保存する。

TODO: 現在の `update:daily` は Node CLI 実装であり、Cloudflare Cron 単体で動く Worker scheduled handler は未実装。実アカウントの D1/R2 作成、secrets、Cron trigger 設定も本番作業として残る。

## 9. Rollback

- Worker: `wrangler deployments list` で直近 deployment を確認し、Cloudflare dashboard または Wrangler で直前 version に戻す。
- D1 schema: destructive migration は作らず、追加 migration で戻す。適用前に backup を取る。
- データ: `update:daily` は idempotent な差分更新なので、壊れた日付範囲は修正後に同じ `--date` / `--from --to` で再実行する。

## 10. Backup

- SQLite: `data/npb-{year}.sqlite` を release artifact または object storage に保存する。
- D1: 本番投入前後に `wrangler d1 export` 相当で backup を取得する。
- R2: raw HTML は削除しない。lifecycle rule を設定する場合も raw / structured の削除は禁止。
