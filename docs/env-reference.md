# Environment Reference

このドキュメントは、各環境変数と secret を「どこに設定するか」を固定するための参照表である。

使い分けは3つだけに分ける。

- **Local shell / `.env`**: ローカル起動、CLI、テスト
- **Cloudflare Workers secrets**: デプロイ済み Worker の実行時 secret
- **GitHub Actions repository secrets**: 日次更新 workflow から参照する secret

Cloudflare のリソース ID や Stripe の Price / webhook / portal 設定は、ここでは「値の出どころ」としても書く。

## Local shell / `.env`

ローカルの `pnpm dev`、`pnpm test`、`pnpm --filter ... run ...` で使う。
`pnpm dev` で web app を動かす場合は `apps/web/.env` に置く。
repo root の `.env` は Nuxt app root から読まれないため、`./.env` ではなく `./apps/web/.env` を作る。

`apps/web/.env` の全体テンプレート:

```dotenv
# Required for local DB access.
NPB_SQLITE_PATH=data/npb-2025.sqlite
NPB_SQLITE_DIR=data

# Local auth. In dev, header fallback defaults to true, so these can usually stay empty/omitted.
NPB_AUTH_HEADER_FALLBACK=true
NPB_AUTH_SHARED_SECRET=
NPB_DEFAULT_PLAN=free

# Stripe test mode values for local billing.
NPB_STRIPE_SECRET_KEY=sk_test_...
NPB_STRIPE_WEBHOOK_SECRET=whsec_...
NPB_STRIPE_PRO_PRICE_ID=price_...
NPB_STRIPE_CHECKOUT_SUCCESS_URL=http://localhost:3000/chat?billing=success
NPB_STRIPE_CHECKOUT_CANCEL_URL=http://localhost:3000/chat?billing=cancel
NPB_STRIPE_PORTAL_RETURN_URL=http://localhost:3000/chat?billing=portal

# Optional LLM settings. Leave blank to use local fallback behavior.
CHAT_QUERY_LLM_BASE_URL=https://api.openai.com/v1
CHAT_QUERY_LLM_API_KEY=
CHAT_QUERY_LLM_MODEL=
CHAT_ANSWER_LLM_BASE_URL=https://api.openai.com/v1
CHAT_ANSWER_LLM_API_KEY=
CHAT_ANSWER_LLM_MODEL=

# Optional GitHub workflow dispatch settings. Not needed for normal pnpm dev.
NPB_DAILY_UPDATE_GITHUB_OWNER=
NPB_DAILY_UPDATE_GITHUB_REPO=
NPB_DAILY_UPDATE_GITHUB_WORKFLOW=daily-update.yml
NPB_DAILY_UPDATE_GITHUB_REF=main
NPB_DAILY_UPDATE_GITHUB_TOKEN=
```

通常のローカル確認で値を入れる必要があるのは `NPB_SQLITE_PATH` / `NPB_SQLITE_DIR` と、Stripe を使うなら `NPB_STRIPE_*` の6項目である。
LLM と GitHub workflow dispatch は機能を試すときだけ値を入れる。

| 変数 | 設定先 | 設定方法 |
|------|--------|----------|
| `NPB_SQLITE_PATH` | Local shell / `.env` | `export NPB_SQLITE_PATH="$PWD/data/npb-2025.sqlite"` |
| `NPB_SQLITE_DIR` | Local shell / `.env` | `export NPB_SQLITE_DIR="$PWD/data"` |
| `CHAT_QUERY_LLM_BASE_URL` | Local shell / `.env` | 必要なら `export` で上書き |
| `CHAT_QUERY_LLM_API_KEY` | Local shell / `.env` | `export` か `.env` に記載。未設定なら heuristic fallback |
| `CHAT_QUERY_LLM_MODEL` | Local shell / `.env` | `export` か `.env` に記載 |
| `CHAT_ANSWER_LLM_BASE_URL` | Local shell / `.env` | 必要なら `export` で上書き |
| `CHAT_ANSWER_LLM_API_KEY` | Local shell / `.env` | `export` か `.env` に記載。未設定なら formatter fallback |
| `CHAT_ANSWER_LLM_MODEL` | Local shell / `.env` | `export` か `.env` に記載 |
| `NPB_AUTH_HEADER_FALLBACK` | Local shell / `.env` | dev で header fallback を切り替えるときだけ使う |
| `NPB_STRIPE_SECRET_KEY` | Local shell / `.env` | Stripe test mode の `sk_test_...`。ローカルで課金動作を確認するときだけ使う |
| `NPB_STRIPE_WEBHOOK_SECRET` | Local shell / `.env` | Stripe test mode の webhook endpoint / Stripe CLI forwarding の `whsec_...` |
| `NPB_STRIPE_PRO_PRICE_ID` | Local shell / `.env` | Stripe test mode で作った `price_...` |
| `NPB_STRIPE_CHECKOUT_SUCCESS_URL` | Local shell / `.env` | `http://localhost:3000/chat?billing=success` |
| `NPB_STRIPE_CHECKOUT_CANCEL_URL` | Local shell / `.env` | `http://localhost:3000/chat?billing=cancel` |
| `NPB_STRIPE_PORTAL_RETURN_URL` | Local shell / `.env` | `http://localhost:3000/chat?billing=portal` |

## Cloudflare Workers secrets

Cloudflare Workers で動くアプリが読む。`wrangler secret put ...` で設定するか、Cloudflare Dashboard の Worker secrets 画面で入れる。
Stripe は live mode の値だけを入れる。test mode の値は Cloudflare Workers secrets に入れない。

| 変数 | 設定先 | 設定方法 |
|------|--------|----------|
| `NPB_AUTH_SHARED_SECRET` | Cloudflare Workers secrets | `wrangler secret put NPB_AUTH_SHARED_SECRET` |
| `CHAT_QUERY_LLM_API_KEY` | Cloudflare Workers secrets | `wrangler secret put CHAT_QUERY_LLM_API_KEY` |
| `CHAT_ANSWER_LLM_API_KEY` | Cloudflare Workers secrets | `wrangler secret put CHAT_ANSWER_LLM_API_KEY` |
| `NPB_STRIPE_SECRET_KEY` | Cloudflare Workers secrets | Stripe Dashboard の `開発者` → `API キー` にある live mode の `sk_live_...` を `wrangler secret put NPB_STRIPE_SECRET_KEY` |
| `NPB_STRIPE_WEBHOOK_SECRET` | Cloudflare Workers secrets | live mode の webhook endpoint から取得した `whsec_...` を `wrangler secret put NPB_STRIPE_WEBHOOK_SECRET` |
| `NPB_STRIPE_PRO_PRICE_ID` | Cloudflare Workers secrets | live mode で作った Stripe Price の `price_...` を `wrangler secret put NPB_STRIPE_PRO_PRICE_ID` |
| `NPB_STRIPE_CHECKOUT_SUCCESS_URL` | Cloudflare Workers secrets | `wrangler secret put NPB_STRIPE_CHECKOUT_SUCCESS_URL` |
| `NPB_STRIPE_CHECKOUT_CANCEL_URL` | Cloudflare Workers secrets | `wrangler secret put NPB_STRIPE_CHECKOUT_CANCEL_URL` |
| `NPB_STRIPE_PORTAL_RETURN_URL` | Cloudflare Workers secrets | `wrangler secret put NPB_STRIPE_PORTAL_RETURN_URL` |
| `NPB_DAILY_UPDATE_GITHUB_OWNER` | Cloudflare Workers secrets | `wrangler secret put NPB_DAILY_UPDATE_GITHUB_OWNER` |
| `NPB_DAILY_UPDATE_GITHUB_REPO` | Cloudflare Workers secrets | `wrangler secret put NPB_DAILY_UPDATE_GITHUB_REPO` |
| `NPB_DAILY_UPDATE_GITHUB_WORKFLOW` | Cloudflare Workers secrets | `wrangler secret put NPB_DAILY_UPDATE_GITHUB_WORKFLOW` |
| `NPB_DAILY_UPDATE_GITHUB_REF` | Cloudflare Workers secrets | `wrangler secret put NPB_DAILY_UPDATE_GITHUB_REF` |
| `NPB_DAILY_UPDATE_GITHUB_TOKEN` | Cloudflare Workers secrets | `wrangler secret put NPB_DAILY_UPDATE_GITHUB_TOKEN` |

## GitHub Actions repository secrets

GitHub の daily update workflow が読む。GitHub repo の Settings 画面で入れる。

| 変数 | 設定先 | 設定方法 |
|------|--------|----------|
| `CLOUDFLARE_D1_API_TOKEN` | GitHub Actions repository secrets | `Settings → Secrets and variables → Actions → Repository secrets` |
| `CLOUDFLARE_R2_ACCESS_KEY_ID` | GitHub Actions repository secrets | `Settings → Secrets and variables → Actions → Repository secrets` |
| `CLOUDFLARE_R2_SECRET_ACCESS_KEY` | GitHub Actions repository secrets | `Settings → Secrets and variables → Actions → Repository secrets` |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub Actions repository secrets | `Settings → Secrets and variables → Actions → Repository secrets` |

## Cloudflare resources / dashboard values

これは environment variable ではないが、値の出どころとして必要になる。

| 値 | 出どころ | 使い先 |
|----|----------|--------|
| D1 database UUID | Cloudflare Dashboard / `wrangler d1 list` | `wrangler.toml` の `database_id` |
| R2 bucket name | Cloudflare Dashboard / `wrangler r2 bucket list` | `wrangler.toml` の `bucket_name` |
| Stripe API secret key `sk_live_...` | Stripe Dashboard の `開発者` → `API キー` | Cloudflare Workers secret `NPB_STRIPE_SECRET_KEY` |
| Stripe `price_...` | Stripe Dashboard | Cloudflare Workers secret `NPB_STRIPE_PRO_PRICE_ID` |
| Stripe webhook signing secret `whsec_...` | Stripe Dashboard | Cloudflare Workers secret `NPB_STRIPE_WEBHOOK_SECRET` |

## 迷ったらここだけ見る

- ローカルで `pnpm dev` / `pnpm test` を動かす: `Local shell / .env`
- デプロイ済み Worker が読む値を入れる: `Cloudflare Workers secrets`
- GitHub Actions の daily update で読む値を入れる: `GitHub Actions repository secrets`
