# Google Auth Runbook

この手順は、NPB Archive Chat の Pro 課金を cookie だけに紐づけないため、Google ログインを有効化する手順である。

本番でやる作業はこの順番。

1. Google Cloud Console で OAuth consent / Google Auth Platform を設定する
2. Google Cloud Console で OAuth クライアント ID を作る
3. Cloudflare Worker secrets に Google の値を入れる
4. D1 meta DB に `0007_google_auth_accounts.sql` を適用する
5. deploy する
6. `/api/account` とブラウザログインを確認する

## 0. このアプリ側の仕様

| 状態 | アプリ上の表示 | DB の状態 | Pro 開始 |
|------|----------------|-----------|----------|
| ゲスト | `ゲスト` | `chat_accounts.auth_provider = 'guest'` | 不可 |
| Google ログイン済み無料 | `Google アカウント` | `auth_provider = 'google'`, `auth_subject = Google sub` | 可 |
| Pro | `Google アカウント` + `plan = 'pro'` | Stripe webhook で subscription を同期 | 済 |

Google ログイン後も自動で Pro にはならない。Google ログインは account を永続化するだけで、Pro 化はその後 Stripe Checkout を完了して webhook が成功した時点で反映される。

## 1. Google Cloud Console を開く

ブラウザで Google Cloud Console を開く。

```text
https://console.cloud.google.com/
```

画面上部の project selector で、このアプリ用の Google Cloud project を選ぶ。
新しく作る場合は project 名を例として次にする。

```text
npb-archive-chat
```

以降の作業は必ずこの project 上で行う。

## 2. OAuth consent / Google Auth Platform を設定する

Google Cloud Console の UI はアカウントによって表示が違う。
どちらかの経路で同じ設定画面に入る。

旧 UI:

```text
ナビゲーション メニュー → API とサービス → OAuth 同意画面
```

新 UI:

```text
ナビゲーション メニュー → Google Auth Platform
```

新 UI の場合は、以下の3画面を設定する。

- `Branding`
- `Audience`
- `Data Access`

旧 UI の場合は、同等の項目が `OAuth 同意画面` の編集フロー内に出る。

### 2.1 Branding / アプリ情報

次を入力する。

| Google Console の項目 | 入れる値 |
|-----------------------|----------|
| アプリ名 | `NPB Archive Chat` |
| ユーザー サポートメール | 自分が受け取れるメールアドレス |
| アプリのロゴ | 未設定でよい |
| アプリのホームページ | `https://npb-chat.dom9th-works.com/` |
| アプリのプライバシー ポリシー リンク | 公開後の `privacy-policy` URL。原稿は [legal/privacy-policy.md](./legal/privacy-policy.md) |
| アプリの利用規約リンク | 公開後の `terms-of-service` URL。原稿は [legal/terms-of-service.md](./legal/terms-of-service.md) |
| 承認済みドメイン | `dom9th-works.com` |
| デベロッパーの連絡先情報 | 自分が受け取れるメールアドレス |

保存する。

### 2.2 Audience / ユーザー

`User type` または `ユーザーの種類` は、外部ユーザーが Google ログインするアプリなので次を選ぶ。

```text
外部 / External
```

公開ステータスは最初は次でよい。

```text
テスト / Testing
```

Testing の場合、ログインできるのは `テストユーザー` に追加した Google アカウントだけである。
動作確認に使う Gmail / Google アカウントを必ず追加する。

設定場所:

```text
Audience → Test users
```

追加する値:

```text
自分の Google アカウントのメールアドレス
```

本番で誰でもログインできるようにする段階では、公開ステータスを `本番環境 / In production` に変更する。
ただし、Google が verification を求める場合があるため、まずは Testing で動作確認する。

### 2.3 Data Access / スコープ

このアプリで使うスコープは次だけ。

```text
openid
email
profile
```

Google Console のスコープ追加画面では、追加で sensitive / restricted scope を選ばない。
Google Drive、Calendar、Gmail などは不要。

理由:

- `openid`: Google のユーザー ID `sub` を得る
- `email`: account のメールを得る
- `profile`: 表示名を得る

保存する。

## 3. OAuth クライアント ID を作成する

Google Cloud Console で次を開く。

```text
API とサービス → 認証情報
```

または新 UI の場合:

```text
Google Auth Platform → Clients
```

次を選ぶ。

```text
認証情報を作成 → OAuth クライアント ID
```

`アプリケーションの種類` は必ず次を選ぶ。

```text
ウェブ アプリケーション
```

名前は管理用なので、次でよい。

```text
NPB Archive Chat Web
```

### 3.1 承認済みの JavaScript 生成元

このアプリの実装では Google OAuth を server-side redirect で行うため、JavaScript 生成元は必須ではない。
Google Console が入力欄を出しても、空欄で保存できるなら空欄でよい。

入力する場合は本番 origin だけを入れる。

```text
https://npb-chat.dom9th-works.com
```

ローカルも同じ OAuth client で確認するなら追加する。

```text
http://localhost:3000
```

### 3.2 承認済みのリダイレクト URI

本番用として必ずこれを追加する。

```text
https://npb-chat.dom9th-works.com/api/auth/google/callback
```

ローカル確認もするなら追加する。

```text
http://localhost:3000/api/auth/google/callback
```

注意:

- `http` と `https` は別物
- trailing slash ありなしは別物
- path の大文字小文字も別物
- Google Console に登録した URI と、アプリが送る `redirect_uri` は完全一致が必要

このアプリで本番時に送る `redirect_uri` は、Cloudflare secret `NPB_GOOGLE_REDIRECT_URL` の値である。

保存する。

作成後に表示される以下を控える。

| Google Console の値 | このアプリで使う secret |
|---------------------|--------------------------|
| クライアント ID | `NPB_GOOGLE_CLIENT_ID` |
| クライアント シークレット | `NPB_GOOGLE_CLIENT_SECRET` |

## 4. Cloudflare Worker secrets を入れる

repo root で実行する。

```bash
wrangler secret put NPB_GOOGLE_CLIENT_ID
```

プロンプトに Google の `クライアント ID` を貼る。

```bash
wrangler secret put NPB_GOOGLE_CLIENT_SECRET
```

プロンプトに Google の `クライアント シークレット` を貼る。

```bash
wrangler secret put NPB_GOOGLE_REDIRECT_URL
```

プロンプトには本番 callback URL を貼る。

```text
https://npb-chat.dom9th-works.com/api/auth/google/callback
```

`NPB_AUTH_SHARED_SECRET` も必須である。
未設定なら入れる。

```bash
wrangler secret put NPB_AUTH_SHARED_SECRET
```

値はランダムな長い文字列にする。
既に Cloudflare Dashboard に設定済みなら入れ直さなくてよい。

## 5. 本番 D1 meta DB に migration を適用する

この migration は account / usage 用の meta DB にだけ適用する。
検索データ用の `npb-archive-chat-import` ではない。

実行:

```bash
wrangler d1 execute npb-archive-chat-meta --remote --file=packages/db/migrations/0007_google_auth_accounts.sql
```

途中で確認プロンプトが出たら、内容が `npb-archive-chat-meta` であることを確認して `Y`。

確認:

```bash
wrangler d1 execute npb-archive-chat-meta --remote --command "PRAGMA table_info(chat_accounts);"
```

期待する列:

```text
auth_provider
auth_subject
auth_email_verified
```

既存の課金列も残っていることを確認する。

```text
stripe_customer_id
stripe_subscription_id
stripe_price_id
stripe_checkout_session_id
```

## 6. デプロイする

repo root で実行する。

```bash
pnpm lint
pnpm test
pnpm typecheck
pnpm build:cf
wrangler deploy
```

`wrangler deploy` の最後に次が出れば deploy は完了。

```text
Uploaded npb-archive-chat-web
Deployed npb-archive-chat-web triggers
npb-chat.dom9th-works.com
Current Version ID: ...
```

## 7. デプロイ後の API 確認

まず `/api/account` を確認する。

```bash
curl -i -c /tmp/npb-google-auth-cookie.txt https://npb-chat.dom9th-works.com/api/account
```

HTTP status は `200`。

JSON の期待値:

```json
{
  "authProvider": "guest",
  "googleAuthConfigured": true,
  "billingProvider": "stripe",
  "billingConfigured": true
}
```

`googleAuthConfigured` が `false` の場合、Cloudflare Worker secrets の Google 3項目が足りない。

## 8. ブラウザで Google ログインを確認する

ブラウザで開く。

```text
https://npb-chat.dom9th-works.com/chat
```

確認手順:

1. 左サイドバーのアカウント表示が `ゲスト` であることを確認する
2. `Google でログイン` を押す
3. Google のログイン / 同意画面に遷移する
4. Testing 公開の場合は、`テストユーザー` に追加した Google アカウントでログインする
5. 認証後、次の URL に戻ることを確認する

```text
https://npb-chat.dom9th-works.com/chat?auth=google
```

6. 左サイドバーのアカウント表示が `Google アカウント` になることを確認する
7. `Pro` を選ぶ
8. Stripe Checkout に遷移することを確認する

ここでは live 決済を完了しない。
本番で Checkout に進めることまで確認すればよい。

## 9. DB で Google 紐づけを確認する

ログイン後、D1 meta DB を確認する。

```bash
wrangler d1 execute npb-archive-chat-meta --remote --command \
  "SELECT user_id, auth_provider, auth_subject, auth_email_verified, email, plan, billing_status, stripe_customer_id, stripe_subscription_id FROM chat_accounts ORDER BY updated_at DESC LIMIT 5;"
```

期待値:

- `auth_provider` が `google`
- `auth_subject` が空ではない
- `auth_email_verified` が `1`
- `email` に Google アカウントのメールが入る
- Stripe 決済前なら `plan` は `free`

## 10. ローカル確認

Google Cloud Console の同じ OAuth client に、ローカル callback URI を追加しておく。

```text
http://localhost:3000/api/auth/google/callback
```

`apps/web/.env` に入れる。

```dotenv
NPB_SQLITE_PATH=data/npb-2025.sqlite
NPB_SQLITE_DIR=data
NPB_AUTH_SHARED_SECRET=local-dev-secret
NPB_GOOGLE_CLIENT_ID=...
NPB_GOOGLE_CLIENT_SECRET=...
NPB_GOOGLE_REDIRECT_URL=http://localhost:3000/api/auth/google/callback
```

ローカル DB に migration を適用する。
相対パスだと package 側に別 DB を作る事故が起きるので、絶対パスで指定する。

```bash
pnpm --filter @npb/db migrate "$PWD/data/npb-2025.sqlite"
```

起動する。

```bash
pnpm dev
```

ブラウザで開く。

```text
http://localhost:3000/chat
```

確認項目:

- `ゲスト` と表示される
- `Google でログイン` で Google に遷移する
- `http://localhost:3000/chat?auth=google` に戻る
- `Google アカウント` と表示される

## 11. Stripe test mode までローカルで確認する場合

`apps/web/.env` に Stripe test mode の値も入れる。

```dotenv
NPB_STRIPE_SECRET_KEY=sk_test_...
NPB_STRIPE_WEBHOOK_SECRET=whsec_...
NPB_STRIPE_PRO_PRICE_ID=price_...
NPB_STRIPE_CHECKOUT_SUCCESS_URL=http://localhost:3000/chat?billing=success
NPB_STRIPE_CHECKOUT_CANCEL_URL=http://localhost:3000/chat?billing=cancel
NPB_STRIPE_PORTAL_RETURN_URL=http://localhost:3000/chat?billing=portal
```

Stripe CLI forwarding を起動する。

```bash
set -a
. apps/web/.env
set +a

stripe listen --api-key "$NPB_STRIPE_SECRET_KEY" --forward-to http://localhost:3000/api/billing/webhook
```

Stripe CLI が表示した `whsec_...` を `apps/web/.env` の `NPB_STRIPE_WEBHOOK_SECRET` に入れ、`pnpm dev` を再起動する。

Google ログイン後に `Pro` を選び、Stripe test card で決済する。

決済後の期待値:

```bash
sqlite3 data/npb-2025.sqlite \
  "SELECT user_id, auth_provider, plan, billing_status, stripe_customer_id, stripe_subscription_id
   FROM chat_accounts
   WHERE auth_provider = 'google'
   ORDER BY updated_at DESC
   LIMIT 5;"
```

期待:

- `auth_provider = google`
- `plan = pro`
- `billing_status = active`
- `stripe_customer_id` が空ではない
- `stripe_subscription_id` が空ではない

## 12. トラブルシュート

### `503 google_auth_not_configured`

Worker secrets または `apps/web/.env` に次のどれかが無い。

- `NPB_GOOGLE_CLIENT_ID`
- `NPB_GOOGLE_CLIENT_SECRET`
- `NPB_GOOGLE_REDIRECT_URL`

確認:

```bash
curl -s https://npb-chat.dom9th-works.com/api/account
```

`googleAuthConfigured` が `false` なら secret 不足。

### Google の `redirect_uri_mismatch`

Google Console の `承認済みのリダイレクト URI` と、アプリが送っている `redirect_uri` が一致していない。

本番で一致させる値:

```text
https://npb-chat.dom9th-works.com/api/auth/google/callback
```

ローカルで一致させる値:

```text
http://localhost:3000/api/auth/google/callback
```

末尾 `/` を足さない。

### `400 invalid_oauth_state`

OAuth 開始時に発行した state cookie と callback の state が一致していない。

確認すること:

- `/api/auth/google/start` と `/api/auth/google/callback` が同じ host で動いている
- local では `http://localhost:3000` を使い、`127.0.0.1` と混ぜない
- Google Console の redirect URI と `NPB_GOOGLE_REDIRECT_URL` が一致している
- ブラウザで cookie を拒否していない

### Testing でログインできない

OAuth consent / Google Auth Platform の `Test users` に、ログインしようとしている Google アカウントが入っていない。

対応:

```text
Google Auth Platform → Audience → Test users
```

に対象メールアドレスを追加する。

### Pro 選択で Google ログインへ飛ぶ

仕様通り。
Pro は Google ログイン済み account だけ開始できる。

### Google ログイン後も Free のまま

仕様通り。
Google ログインは account を永続化するだけ。
Pro 化は Stripe Checkout 完了後、webhook が `200` で処理されてから反映される。
