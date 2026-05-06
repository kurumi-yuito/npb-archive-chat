# デプロイ（Cloudflare Workers + D1 + R2 前提）

このドキュメントは、**Nuxt アプリ（`apps/web`）を Cloudflare Workers 向けにビルド・デプロイする**ための設定と手順をまとめたものです。  
**本番用のシークレットや実 ID はリポジトリに含めません**（`wrangler.toml` のプレースホルダを置き換える）。

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
- `wrangler.toml` の雛形
- SQLite / D1 の query boundary
- GitHub Actions schedule による `update:daily`
- production signed-cookie identity のコード

Not implemented:

手順は [production-todo.md](./production-todo.md) を正とする。

- 本番 Worker / D1 / R2 の実デプロイ運用
- D1 への 2016-2026 データ投入手順の自動化
- R2 を raw / structured の正規保存先にする実装
- Cloudflare Cron だけで `update:daily` 相当を完結させる Worker 実装

### DB 接続層（`QueryDatabase`）

- **`packages/db`** の検索・チャット用リポジトリは、非同期の **`QueryDatabase`**（`prepare` → `run` / `get` / `all` が `Promise`）を受け取る。
- **ローカル**: 同期の `SqliteDatabase`（`node:sqlite`）を **`sqliteDatabaseToQuery`** でラップする。CLI の **loader / `migrateDatabase`** は従来どおり同期 `SqliteDatabase` のみ（変更なし）。
- **Workers**: **`apps/web/server/utils/d1-query-database.ts`** の **`createQueryDatabaseFromD1`** が Cloudflare の **`D1Database`** を `QueryDatabase` に適合させる。Wrangler の binding 名は **`NPB_DB`**（`apps/web/wrangler.toml` の `d1_databases.binding` と一致）。
- **切り替え条件**: `apps/web/server/utils/server-database.ts` の **`getServerDatabase(event, npbSqlitePath)`** が、`event.context.cloudflare.env.NPB_DB` の有無で分岐する（詳細は下記「SQLite と D1 の切り替え条件」）。

## 前提ツール

- Node.js 20+
- [pnpm](https://pnpm.io/) 9（ルート `packageManager` と一致）
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/)（`npm i -g wrangler` または `pnpm dlx wrangler`）
- Cloudflare アカウント（Workers / D1 / R2 を利用可能）

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

## 環境変数

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

## Migration（スキーマ適用）

マイグレーション SQL は **`packages/db/migrations/`** が単一のソースです（`0001_initial.sql`、`0002_chat_usage.sql`、`0003_scores_calendar_rebuild.sql` など）。

### ローカル SQLite

`@npb/db` の CLI で、**ファイルパスを指定して**適用します。

```bash
pnpm --filter @npb/db migrate -- ./data/npb.sqlite
```

（`migrate` script は内部で **tsx** を使い `src/cli.ts` を実行する。`pnpm install` 後に利用する。）

（`./data/npb.sqlite` は任意のパスに置き換え。`NPB_SQLITE_PATH` と同じファイルを指すとよいです。）

初回アクセス時に `server-database.ts` が `migrateDatabase` を呼ぶため、**空の DB ファイルを渡せば起動時にマイグレーションが走る**動きも従来どおりです。

### リモート D1（Cloudflare）

1. ダッシュボードまたは CLI で D1 データベースを作成する。
2. `apps/web/wrangler.toml` の `database_id` を、**作成した D1 の ID** に置き換える。
3. マイグレーションを **ファイル順**に適用する（例）:

```bash
cd apps/web
wrangler d1 execute npb-archive-chat --remote --file=../../packages/db/migrations/0001_initial.sql
wrangler d1 execute npb-archive-chat --remote --file=../../packages/db/migrations/0002_chat_usage.sql
wrangler d1 execute npb-archive-chat --remote --file=../../packages/db/migrations/0003_scores_calendar_rebuild.sql
```

- `npb-archive-chat` は `wrangler.toml` の `database_name` と一致させる。
- 新しいマイグレーションが増えたら、**同様に順番に `execute`** する（ローカル SQLite と同じ順序を維持）。

## Cloudflare 向けビルド

リポジトリルートで:

```bash
pnpm build:cf
```

- 内部で `NITRO_PRESET=cloudflare_module` を設定し、`apps/web/.output` を生成します。
- 通常の `pnpm build` は **`node-server` プリセットのまま**（ローカル検証・従来フロー用）。

## デプロイ（Workers）

1. `pnpm build:cf` を実行する。
2. `apps/web/wrangler.toml` の **D1 `database_id`** と **R2 `bucket_name`**（バケットはダッシュボードで事前作成）を実環境に合わせる。
3. `apps/web` で Wrangler を実行する:

```bash
cd apps/web
wrangler deploy
```

- 初回は `wrangler login` が必要な場合があります。
- 静的アセットは `[assets]` で `.output/public` をバインドしています（Nitro の `cloudflare_module` 出力に合わせた雛形）。

## 関連ファイル

| ファイル | 内容 |
|----------|------|
| `apps/web/wrangler.toml` | Worker 名、エントリ、D1 / R2 / ASSETS の雛形 |
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

## 差分更新ジョブ

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

## Rollback

- Worker: `wrangler deployments list` で直近 deployment を確認し、Cloudflare dashboard または Wrangler で直前 version に戻す。
- D1 schema: destructive migration は作らず、追加 migration で戻す。適用前に backup を取る。
- データ: `update:daily` は idempotent な差分更新なので、壊れた日付範囲は修正後に同じ `--date` / `--from --to` で再実行する。

## Backup

- SQLite: `data/npb-{year}.sqlite` を release artifact または object storage に保存する。
- D1: 本番投入前後に `wrangler d1 export` 相当で backup を取得する。
- R2: raw HTML は削除しない。lifecycle rule を設定する場合も raw / structured の削除は禁止。

---

## 人間が Cloudflare 側で手動設定すべき項目（一覧）

1. **Workers アプリ名** — `wrangler.toml` の `name`、またはダッシュボード上の Worker 名との整合。
2. **D1 データベースの作成** — 名前は `database_name`（例: `npb-archive-chat`）と揃える。
3. **`database_id` の取得と `wrangler.toml` への反映** — プレースホルダのままではリモート `execute` / `deploy` が成立しない。
4. **R2 バケットの作成** — `bucket_name`（例: `npb-archive-chat-raw`）を実バケットと一致させる。
5. **API トークン / `wrangler login`** — CLI からデプロイするアカウント権限。
6. **（任意）Secrets** — 将来、API キー等を Workers に渡す場合は `wrangler secret put` またはダッシュボードで設定（**リポジトリに書かない**）。
7. **（任意）カスタムドメイン・ルート** — Workers のルートや DNS。

## 次に人間が確認すべき点

1. **`pnpm build:cf` が通り、`apps/web/.output/server/index.mjs` が生成されるか。**
2. **`wrangler deploy` がエラーなく完了するか**（`database_id`・R2 バケット名・権限）。
3. **D1 に `packages/db/migrations` の SQL を適用したうえで**、本番 Worker で `/api/search/*` と `/api/chat` が期待どおり返るか（データ投入は別途。現状は本番データ投入手順の自動化なし）。
4. Nitro / Nuxt のバージョンによって **`event.context.cloudflare` の形が異なる**場合は、`server-database.ts` のプロパティを合わせる。
5. **並行実行時の usage**（`docs/usage-limit.md`）は D1 でも同様の注意。
