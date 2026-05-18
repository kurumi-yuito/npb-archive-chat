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
NPB_AUTH_SHARED_SECRET=local-dev-secret
NPB_DEFAULT_PLAN=free

# Google OAuth for local login testing.
NPB_GOOGLE_CLIENT_ID=...
NPB_GOOGLE_CLIENT_SECRET=...
NPB_GOOGLE_REDIRECT_URL=http://localhost:3000/api/auth/google/callback

# Stripe test mode values for local billing.
NPB_STRIPE_SECRET_KEY=sk_test_...
NPB_STRIPE_WEBHOOK_SECRET=whsec_...
NPB_STRIPE_PRO_PRICE_ID=price_...
NPB_STRIPE_CHECKOUT_SUCCESS_URL=http://localhost:3000/chat?billing=success
NPB_STRIPE_CHECKOUT_CANCEL_URL=http://localhost:3000/chat?billing=cancel
NPB_STRIPE_PORTAL_RETURN_URL=http://localhost:3000/chat?billing=portal

# LLM settings.
# Production-quality chat requires these values.
# Local dev can omit them only when fallback flags are left enabled.
CHAT_QUERY_LLM_BASE_URL=https://api.openai.com/v1
CHAT_QUERY_LLM_API_KEY=
CHAT_QUERY_LLM_MODEL=
CHAT_ALLOW_HEURISTIC_FALLBACK=true
CHAT_ANSWER_LLM_BASE_URL=https://api.openai.com/v1
CHAT_ANSWER_LLM_API_KEY=
CHAT_ANSWER_LLM_MODEL=
CHAT_ALLOW_DETERMINISTIC_ANSWER_FALLBACK=true

# Optional GitHub workflow dispatch settings. Not needed for normal pnpm dev.
NPB_DAILY_UPDATE_GITHUB_OWNER=
NPB_DAILY_UPDATE_GITHUB_REPO=
NPB_DAILY_UPDATE_GITHUB_WORKFLOW=daily-update.yml
NPB_DAILY_UPDATE_GITHUB_REF=main
NPB_DAILY_UPDATE_GITHUB_TOKEN=
```

通常のローカル確認で値を入れる必要があるのは `NPB_SQLITE_PATH` / `NPB_SQLITE_DIR` である。
Google ログインを試すなら `NPB_AUTH_SHARED_SECRET` と `NPB_GOOGLE_*` の3項目を入れる。
Stripe を使うなら `NPB_STRIPE_*` の6項目も入れる。
LLM はローカルの構成確認だけなら未設定でもよいが、その場合は dev/test 用 fallback で動く。
実際のチャット品質を確認する場合と Workers production では `CHAT_QUERY_LLM_*` と `CHAT_ANSWER_LLM_*` を設定する。
GitHub workflow dispatch は機能を試すときだけ値を入れる。

### LLM settings values

OpenAI を使う場合の設定値は次の通り。

| 変数 | 値 |
|------|----|
| `CHAT_QUERY_LLM_BASE_URL` | `https://api.openai.com/v1` |
| `CHAT_QUERY_LLM_API_KEY` | OpenAI Platform の API keys 画面（`https://platform.openai.com/api-keys`）で作成した Project API key。通常は `sk-proj-...`。 |
| `CHAT_QUERY_LLM_MODEL` | structured query 生成用の model。まずは `gpt-4.1-mini`。 |
| `CHAT_ANSWER_LLM_BASE_URL` | `https://api.openai.com/v1` |
| `CHAT_ANSWER_LLM_API_KEY` | OpenAI Platform の API keys 画面（`https://platform.openai.com/api-keys`）で作成した Project API key。`CHAT_QUERY_LLM_API_KEY` と同じ値でよい。 |
| `CHAT_ANSWER_LLM_MODEL` | 最終回答文生成用の model。まずは `gpt-4.1-mini`。回答品質を優先するなら `gpt-4.1` など、Chat Completions 互換かつ JSON/通常応答に対応する model に上げる。 |

`CHAT_QUERY_LLM_API_KEY` と `CHAT_ANSWER_LLM_API_KEY` は別々の環境変数だが、1つの OpenAI Project API key を両方に同じ値として設定してよい。
1つの環境変数に2つの key を入れるのではなく、同じ `sk-proj-...` を2つの変数へそれぞれ入れる。

OpenAI API key の作成元:

1. OpenAI Platform の API keys 画面（`https://platform.openai.com/api-keys`）を開く。
2. 対象 Project を選ぶ。
3. `Create new secret key` で Project API key を作る。
4. 表示された `sk-proj-...` を保存し、`CHAT_QUERY_LLM_API_KEY` と `CHAT_ANSWER_LLM_API_KEY` に設定する。

| 変数 | 設定先 | 設定方法 |
|------|--------|----------|
| `NPB_SQLITE_PATH` | Local shell / `.env` | `export NPB_SQLITE_PATH="$PWD/data/npb-2025.sqlite"` |
| `NPB_SQLITE_DIR` | Local shell / `.env` | `export NPB_SQLITE_DIR="$PWD/data"` |
| `CHAT_QUERY_LLM_BASE_URL` | Local shell / `.env` | 必要なら `export` で上書き |
| `CHAT_QUERY_LLM_API_KEY` | Local shell / `.env` | `export` か `.env` に記載。自然文理解を確認するなら必須 |
| `CHAT_QUERY_LLM_MODEL` | Local shell / `.env` | `export` か `.env` に記載 |
| `CHAT_ALLOW_HEURISTIC_FALLBACK` | Local shell / `.env` | dev/test 用。`false` にすると LLM 未設定/失敗時に 503 |
| `CHAT_ANSWER_LLM_BASE_URL` | Local shell / `.env` | 必要なら `export` で上書き |
| `CHAT_ANSWER_LLM_API_KEY` | Local shell / `.env` | `export` か `.env` に記載。自然な回答文を確認するなら必須 |
| `CHAT_ANSWER_LLM_MODEL` | Local shell / `.env` | `export` か `.env` に記載 |
| `CHAT_ALLOW_DETERMINISTIC_ANSWER_FALLBACK` | Local shell / `.env` | dev/test 用。`false` にすると final answer LLM 未設定/失敗時に 503 |
| `NPB_AUTH_HEADER_FALLBACK` | Local shell / `.env` | dev で header fallback を切り替えるときだけ使う |
| `NPB_AUTH_SHARED_SECRET` | Local shell / `.env` | signed cookie 用。Google ログインをローカルで試すなら必須 |
| `NPB_GOOGLE_CLIENT_ID` | Local shell / `.env` | Google Cloud Console の OAuth 2.0 Client ID |
| `NPB_GOOGLE_CLIENT_SECRET` | Local shell / `.env` | Google Cloud Console の OAuth 2.0 Client Secret |
| `NPB_GOOGLE_REDIRECT_URL` | Local shell / `.env` | `http://localhost:3000/api/auth/google/callback` |
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
| `NPB_GOOGLE_CLIENT_ID` | Cloudflare Workers secrets | Google Cloud Console の OAuth 2.0 Client ID を `wrangler secret put NPB_GOOGLE_CLIENT_ID` |
| `NPB_GOOGLE_CLIENT_SECRET` | Cloudflare Workers secrets | Google Cloud Console の OAuth 2.0 Client Secret を `wrangler secret put NPB_GOOGLE_CLIENT_SECRET` |
| `NPB_GOOGLE_REDIRECT_URL` | Cloudflare Workers secrets | `https://npb-chat.dom9th-works.com/api/auth/google/callback` を `wrangler secret put NPB_GOOGLE_REDIRECT_URL` |
| `CHAT_QUERY_LLM_API_KEY` | Cloudflare Workers secrets | OpenAI Project API key `sk-proj-...` を `wrangler secret put CHAT_QUERY_LLM_API_KEY` |
| `CHAT_ANSWER_LLM_API_KEY` | Cloudflare Workers secrets | 同じ OpenAI Project API key、または回答生成用に分けた key を `wrangler secret put CHAT_ANSWER_LLM_API_KEY` |
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
| Google OAuth Client ID / Secret | Google Cloud Console → APIs & Services → Credentials | Cloudflare Workers secrets `NPB_GOOGLE_CLIENT_ID` / `NPB_GOOGLE_CLIENT_SECRET` |
| Google OAuth authorized redirect URI | Google Cloud Console の OAuth Client 設定 | `https://npb-chat.dom9th-works.com/api/auth/google/callback` と local 用 `http://localhost:3000/api/auth/google/callback` |

## 迷ったらここだけ見る

- ローカルで `pnpm dev` / `pnpm test` を動かす: `Local shell / .env`
- デプロイ済み Worker が読む値を入れる: `Cloudflare Workers secrets`
- GitHub Actions の daily update で読む値を入れる: `GitHub Actions repository secrets`
