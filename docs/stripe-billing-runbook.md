# Stripe Billing Runbook

この手順は、Stripe を使った `pro` 課金を有効にするためのもの。
`deploy.md` は Cloudflare Worker / D1 / R2 のデプロイ手順、`production-readiness.md` は本番確認項目、ここは Stripe 固有の初期設定だけを扱う。

設定先の見分けは [env-reference.md](./env-reference.md) を見る。Stripe 固有の値は基本的に Cloudflare Workers secrets に入れる。

## 何を用意するか

必要なもの:

- Stripe アカウント
- Stripe API シークレットキー
- `pro` 用の月額 Price
- Webhook エンドポイント
- カスタマーポータル設定
- Cloudflare Workers secrets

Stripe の概念と API は公式 docs を参照する。

- Checkout Session: https://docs.stripe.com/api/checkout/sessions/create?lang=create_subscription
- Billing Portal Session: https://docs.stripe.com/api/customer_portal/sessions/create?lang=node
- Webhook signature verification: https://docs.stripe.com/webhooks/signatures
- API keys: https://docs.stripe.com/keys

## 1. 設定対象を決める

この repo の `wrangler.toml` で管理している Cloudflare Worker は1つである。
この Worker の Cloudflare Workers secrets に入れる Stripe 値は live mode の値だけにする。

Cloudflare Workers secrets に入れる値:

- `NPB_STRIPE_SECRET_KEY`: `sk_live_...`
- `NPB_STRIPE_WEBHOOK_SECRET`: live mode で作った webhook endpoint の `whsec_...`
- `NPB_STRIPE_PRO_PRICE_ID`: live mode で作った Price の `price_...`
- Checkout / Portal の戻り URL: デプロイ済み Worker の URL

ローカルで Stripe のテスト決済を確認する場合は、apps/web の `.env` に test mode の値を入れる。

Stripe Dashboard のモード:

- Cloudflare Workers secrets に入れる値を作るときは、Dashboard の `テスト環境` を無効にする
- ローカルテスト用の値を作るときは、Dashboard の `テスト環境` を有効にする
- live mode と test mode の API key / Price / Webhook secret を混ぜない

ローカルでアプリを動かす `.env` 例:

```dotenv
NPB_SQLITE_PATH=data/npb-2025.sqlite
NPB_SQLITE_DIR=data
NPB_STRIPE_SECRET_KEY=sk_test_...
NPB_STRIPE_WEBHOOK_SECRET=whsec_...
NPB_STRIPE_PRO_PRICE_ID=price_...
NPB_STRIPE_CHECKOUT_SUCCESS_URL=http://localhost:3000/chat?billing=success
NPB_STRIPE_CHECKOUT_CANCEL_URL=http://localhost:3000/chat?billing=cancel
NPB_STRIPE_PORTAL_RETURN_URL=http://localhost:3000/chat?billing=portal
```

この `.env` は `apps/web/.env` に置く。
`pnpm dev` は `apps/web` を Nuxt app root として起動するため、ローカル Stripe 設定も `apps/web/.env` に入れる。

`NPB_SQLITE_PATH` と `NPB_SQLITE_DIR` は、ローカル API が D1 の代わりに SQLite を読むために必要である。
Cloudflare Workers secrets に入れた値はローカルの `pnpm dev` からは読まれない。
Stripe の test mode 値は、Stripe Dashboard の `テスト環境` または Stripe CLI から取得して `.env` に入れる。

dev では `NPB_AUTH_HEADER_FALLBACK` は既定で `true` なので、この `.env` には書かなくてよい。
LLM API key は任意である。
未設定時は query parser / answer formatter の fallback 実装が使われる。
ローカルで外部 LLM まで使って確認する場合だけ、`CHAT_QUERY_LLM_API_KEY` / `CHAT_ANSWER_LLM_API_KEY` / model 名を追加する。

`NPB_STRIPE_WEBHOOK_SECRET` は、ローカルへ webhook を送る方法によって値が変わる。
Stripe CLI forwarding を使う場合は Stripe CLI が表示する `whsec_...` を入れる。
Dashboard でローカル転送サービスの URL を webhook endpoint として作る場合は、その endpoint 詳細画面の `署名シークレット` の `whsec_...` を入れる。

ローカルで Stripe CLI forwarding を使う場合:

```bash
stripe listen --forward-to localhost:3000/api/billing/webhook
```

このコマンドの出力に表示される `whsec_...` を、apps/web の `.env` の `NPB_STRIPE_WEBHOOK_SECRET` に入れる。

Dashboard の `テスト環境` で webhook endpoint を作る場合:

- `テスト環境` を有効にする
- Webhook endpoint の URL にはローカル転送サービスなどの公開 URL を使う
- endpoint 作成後、endpoint 詳細画面の `署名シークレット` を表示する
- 表示された `whsec_...` を、apps/web の `.env` の `NPB_STRIPE_WEBHOOK_SECRET` に入れる

Cloudflare Workers secrets に入れる `NPB_STRIPE_WEBHOOK_SECRET` は、live mode の webhook endpoint から取得した別の `whsec_...` である。

## 2. Stripe API シークレットキーを控える

Stripe Dashboard の `開発者` → `API キー` を開く。
Cloudflare Workers secrets に入れる値を作るので、`テスト環境` は無効にする。

控える値:

- `シークレットキー` の `sk_live_...`

`シークレットキー` がマスクされている場合:

- `表示` / `キーを表示` / `Reveal` を押す
- Stripe が確認コードや再認証を求めたら完了する
- 表示された `sk_live_...` を控える

既存のシークレットキーを表示できない場合:

- `シークレットキーを作成` を押す
- `このキーの使用方法` が表示されたら、自分のアプリ / 自分のサーバーで Stripe API を呼び出す用途の項目を選ぶ
- 外部サービス、別サイト、サードパーティーにこのキーを渡す用途の項目は選ばない
- `続行` を押す
- 確認コードや再認証を求められたら完了する
- キー名に `npb-archive-chat production` のように用途を入れる
- ほかの任意項目が表示される場合はデフォルトのままにする
- 作成後に表示される `sk_live_...` を控える
- その値は後で再表示できない場合があるため、Cloudflare Workers secret に入れるまで失わない

このアプリの runbook では、まず Stripe の標準のシークレットキー `sk_live_...` を使う。
`制限付きキーを作成` から作る `rk_live_...` は、Checkout Session 作成、Billing Portal Session 作成、Subscription 取得に必要な権限を別途設計する必要があるため、この手順では扱わない。

`公開可能キー` の `pk_...` はこのアプリでは使わない。
`NPB_STRIPE_SECRET_KEY` に入れる値は1つだけである。
Cloudflare Workers secrets には `sk_live_...` だけを入れる。
webhook の `whsec_...` とは別の値なので混同しない。

```bash
wrangler secret put NPB_STRIPE_SECRET_KEY
```

## 3. Stripe で Product と Price を作る

Stripe Dashboard で `pro` 用の月額 Price を作成する。
Cloudflare Workers secrets に入れる値を作るので、`テスト環境` は無効にする。

作成する内容:

- 商品名: `NPB Archive Chat Pro`
- 価格: `980`
- 通貨: `JPY`
- 課金方法: `継続`
- 請求期間: `月次`

Dashboard の操作:

- `商品カタログ` / `商品` を開く
- `商品を追加` を押す
- 商品名を入れる
- 料金で `継続` を選ぶ
- 金額 `980`、通貨 `JPY`、請求期間 `月次` を選ぶ
- 商品を保存する
- 作成された Price の ID `price_...` を控える

控えた `price_...` を `NPB_STRIPE_PRO_PRICE_ID` に入れる。
Product ID の `prod_...` ではない。

```bash
wrangler secret put NPB_STRIPE_PRO_PRICE_ID
```

## 4. Checkout と Portal の戻り URL を決める

デプロイ済み Worker の URL を決めて、以下を用意する。

- `NPB_STRIPE_CHECKOUT_SUCCESS_URL`
- `NPB_STRIPE_CHECKOUT_CANCEL_URL`
- `NPB_STRIPE_PORTAL_RETURN_URL`

例:

```text
https://<worker-domain>/chat?billing=success
https://<worker-domain>/chat?billing=cancel
https://<worker-domain>/chat?billing=portal
```

Cloudflare Workers secret に入れる。

```bash
wrangler secret put NPB_STRIPE_CHECKOUT_SUCCESS_URL
wrangler secret put NPB_STRIPE_CHECKOUT_CANCEL_URL
wrangler secret put NPB_STRIPE_PORTAL_RETURN_URL
```

## 5. Webhook エンドポイントを作る

Stripe Dashboard の `ワークベンチ` / `Webhooks` でイベント送信先を追加する。
Cloudflare Worker 宛ての live mode webhook を作るので、`テスト環境` は無効にする。

Dashboard の操作:

- `ワークベンチ` / `Webhooks` を開く
- `イベント送信先を追加` / `送信先を作成` を押す
- イベント宛先スコープで `お客様のアカウント` を選ぶ
- API バージョンはアカウントの既定バージョンか、Dashboard が提示する最新バージョンを選ぶ
- イベント選択で下の4つを選ぶ
- 送信先タイプで `Webhook エンドポイント` を選ぶ
- エンドポイント URL に下の URL を入れる
- 送信先名はデフォルトでもよい。分かりやすくするなら `npb-archive-chat production` にする
- 作成する

もう一方の `連結アカウント` は Stripe Connect 用なので、このアプリでは選ばない。
このアプリは Connect platform ではなく、自分の Stripe アカウントで作成された Checkout / Subscription のイベントだけを受け取る。

選ぶイベント:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

エンドポイント URL:

```text
https://<worker-domain>/api/billing/webhook
```

作成後、エンドポイントの詳細画面で `署名シークレット` を表示し、`whsec_...` を控える。
この値を Cloudflare Workers secret の `NPB_STRIPE_WEBHOOK_SECRET` に入れる。

```bash
wrangler secret put NPB_STRIPE_WEBHOOK_SECRET
```

このアプリの `/api/billing/webhook` は、Stripe から届く `Stripe-Signature` ヘッダーと raw request body を使って署名検証する。
そのため `NPB_STRIPE_WEBHOOK_SECRET` には API secret key の `sk_...` ではなく、必ず webhook endpoint 固有の `whsec_...` を入れる。
署名検証に失敗した webhook は `400 invalid_signature` で拒否される。

## 6. カスタマーポータル設定を作る

Stripe Dashboard でカスタマーポータル設定を作る。
これは Pro ユーザーが Stripe のポータルで支払い方法の変更、請求履歴の確認、サブスクリプション解約を行うための設定である。
Cloudflare Worker で使う live mode の設定を作るので、`テスト環境` は無効にする。

Dashboard の `設定` → `Billing` → `カスタマーポータル` で次を設定する。

- ビジネス情報: 表示名、サポート連絡先、必要ならプライバシーポリシー URL / 利用規約 URL を入れる
- 請求書履歴: 有効
- 支払い方法を更新: 有効
- サブスクリプションをキャンセル: 有効
- キャンセルのタイミング: `請求期間の終了時`
- キャンセル理由: 任意。有効にしてもアプリ側の必須処理はない
- サブスクリプションを更新: 無効
- プロモーションコード: 無効
- デフォルトの戻り先 URL: `NPB_STRIPE_PORTAL_RETURN_URL` と同じ URL

このプロジェクトでは Stripe Portal 上でプラン変更をさせない。
Free から Pro への変更はアプリの `PUT /api/billing/subscription` から Checkout Session を作る。
Pro の解約や支払い方法変更は Portal に任せる。

このアプリは Stripe の既定のカスタマーポータル設定を使う。
そのため、カスタマーポータル設定 ID `bpc_...` を控える必要はない。

## 7. Cloudflare Workers secrets を確認する

`wrangler secret put` で入れる値は [env-reference.md](./env-reference.md) の **Cloudflare Workers secrets** を見る。

`apps/web` が Stripe を使うので、Cloudflare Worker に次が入っていることを確認する。
Stripe 値はすべて live mode で作った値にする。
Cloudflare Workers secrets に test mode の `sk_test_...`、test mode の `price_...`、test mode の `whsec_...` を入れない。

```bash
wrangler secret put NPB_STRIPE_SECRET_KEY
wrangler secret put NPB_STRIPE_WEBHOOK_SECRET
wrangler secret put NPB_STRIPE_PRO_PRICE_ID
wrangler secret put NPB_STRIPE_CHECKOUT_SUCCESS_URL
wrangler secret put NPB_STRIPE_CHECKOUT_CANCEL_URL
wrangler secret put NPB_STRIPE_PORTAL_RETURN_URL
```

`NPB_AUTH_SHARED_SECRET` も既存どおり必要。

## 8. デプロイ済み Worker の動作確認

ここではデプロイ済み Worker が billing route、D1、Stripe live mode 設定を読めることだけを確認する。
実際の支払い完了までは進めない。
Stripe Checkout の支払い完了と webhook 反映は、次の **9. ローカル test mode で決済完了を確認する** で確認する。

以降の例では Worker URL を変数にして書く。

```bash
BASE_URL=https://<worker-domain>
COOKIE_JAR=/tmp/npb-chat-cookie.txt
```

### 8.1 Billing plan endpoint

```bash
curl -i "$BASE_URL/api/billing/plans"
```

正しい状態:

- HTTP status が `200`
- JSON に `free` と `pro` の2件が返る
- `pro.monthlyPriceYen` が `980`
- `pro.monthlyUsageLimit` が `null`

`404` の場合は、billing route を含む新しい Worker がデプロイされていない。

### 8.2 Account endpoint と cookie

```bash
curl -i -c "$COOKIE_JAR" "$BASE_URL/api/account"
```

正しい状態:

- HTTP status が `200`
- response header に `set-cookie: npb_chat_user=...` がある
- JSON の `billingProvider` が `stripe`
- JSON の `billingConfigured` が `true`
- 初期状態では `plan` が `free`
- 初期状態では `billingStatus` が `active`

`400 missing_user_id` の場合は、Worker が `NPB_AUTH_HEADER_FALLBACK=true` 相当で動いている。
Cloudflare Workers の変数で `NPB_AUTH_HEADER_FALLBACK=false` を設定する。

`500` の場合は、まず D1 meta DB の schema を確認する。

```bash
wrangler d1 execute npb-archive-chat-meta --remote --command "PRAGMA table_info(chat_accounts);"
```

正しい schema には以下の列がある。

- `billing_provider`
- `stripe_customer_id`
- `stripe_subscription_id`
- `stripe_price_id`
- `stripe_checkout_session_id`

無ければ migration を適用する。

```bash
wrangler d1 execute npb-archive-chat-meta --remote --file=packages/db/migrations/0006_stripe_billing.sql
```

### 8.3 Usage endpoint

```bash
curl -i -b "$COOKIE_JAR" -c "$COOKIE_JAR" "$BASE_URL/api/chat/usage"
```

正しい状態:

- HTTP status が `200`
- Free plan では `limit` が `9`
- Free plan では `remaining` が `0` 以上 `9` 以下

### 8.4 Chat endpoint

```bash
curl -i -b "$COOKIE_JAR" -c "$COOKIE_JAR" "$BASE_URL/api/chat" \
  -H 'Content-Type: application/json' \
  -d '{"message":"藤浪晋太郎の所属チームは"}'
```

正しい状態:

- HTTP status が `200`
- JSON に `structured_query` がある
- JSON に `answer.summary` がある
- JSON に `usage` がある
- Free plan では `usage.used` が増える

### 8.5 Checkout Session 作成だけ確認する

同じ cookie のユーザーで Pro への Checkout Session を作る。

```bash
curl -i -b "$COOKIE_JAR" -c "$COOKIE_JAR" -X PUT "$BASE_URL/api/billing/subscription" \
  -H 'Content-Type: application/json' \
  -d '{"plan":"pro"}'
```

正しい状態:

- HTTP status が `200`
- JSON に `redirectUrl` がある
- `redirectUrl` は `https://checkout.stripe.com/...` で始まる
- JSON の `provider` が `stripe`

ここで返る `redirectUrl` は live mode の Checkout URL である。
動作確認ではブラウザで開いて支払い完了まで進めない。

この時点ではまだ Pro ではない。
DB 上は Checkout 作成中の状態になる。

```bash
wrangler d1 execute npb-archive-chat-meta --remote --command \
"SELECT user_id, plan, billing_status, stripe_customer_id, stripe_subscription_id, stripe_checkout_session_id FROM chat_accounts ORDER BY updated_at DESC LIMIT 5;"
```

正しい途中状態:

- 対象 user の `plan` は `free`
- `billing_status` は `incomplete`
- `stripe_checkout_session_id` に `cs_live_...` が入る
- `stripe_customer_id` と `stripe_subscription_id` はまだ `null`

確認後、この検証 user を `active` に戻す。

```bash
wrangler d1 execute npb-archive-chat-meta --remote --command \
"UPDATE chat_accounts
 SET billing_status = 'active',
     stripe_checkout_session_id = NULL,
     updated_at = CURRENT_TIMESTAMP
 WHERE user_id = '<user-id-from-account-response>';"
```

戻した後の正しい状態:

- `plan` は `free`
- `billing_status` は `active`
- `stripe_checkout_session_id` は `null`

```bash
curl -i -b "$COOKIE_JAR" -c "$COOKIE_JAR" "$BASE_URL/api/account"
```

この確認でデプロイ済み Worker の live mode 設定確認は完了である。

## 9. ローカル test mode で決済完了を確認する

Stripe Checkout の支払い完了と webhook 反映は、Stripe test mode の値を使ってローカルで確認する。
live mode の Checkout URL で支払い完了まで進めない。

### 9.1 Stripe test mode の値を用意する

Stripe Dashboard で `テスト環境` を有効にして、test mode の値を用意する。

- `NPB_STRIPE_SECRET_KEY`: `sk_test_...`
- `NPB_STRIPE_PRO_PRICE_ID`: test mode で作った `price_...`
- `NPB_STRIPE_CHECKOUT_SUCCESS_URL`: `http://localhost:3000/chat?billing=success`
- `NPB_STRIPE_CHECKOUT_CANCEL_URL`: `http://localhost:3000/chat?billing=cancel`
- `NPB_STRIPE_PORTAL_RETURN_URL`: `http://localhost:3000/chat?billing=portal`

`apps/web/.env` に入れる。

```dotenv
NPB_SQLITE_PATH=data/npb-2025.sqlite
NPB_SQLITE_DIR=data
NPB_AUTH_HEADER_FALLBACK=true
NPB_DEFAULT_PLAN=free
NPB_STRIPE_SECRET_KEY=sk_test_...
NPB_STRIPE_WEBHOOK_SECRET=whsec_...
NPB_STRIPE_PRO_PRICE_ID=price_...
NPB_STRIPE_CHECKOUT_SUCCESS_URL=http://localhost:3000/chat?billing=success
NPB_STRIPE_CHECKOUT_CANCEL_URL=http://localhost:3000/chat?billing=cancel
NPB_STRIPE_PORTAL_RETURN_URL=http://localhost:3000/chat?billing=portal
```

### 9.2 Stripe CLI forwarding を起動する

別 terminal で Stripe CLI を起動する。

```bash
set -a
. apps/web/.env
set +a
stripe listen --api-key "$NPB_STRIPE_SECRET_KEY" --forward-to http://localhost:3000/api/billing/webhook
```

Stripe CLI の出力に出る `whsec_...` を `apps/web/.env` の `NPB_STRIPE_WEBHOOK_SECRET` に入れる。
`.env` を変更したら Nuxt dev server を再起動する。
`--api-key "$NPB_STRIPE_SECRET_KEY"` を付けることで、Checkout Session を作った test mode アカウントと Stripe CLI が見るアカウントを揃える。

重要: `stripe listen` を起動し直すと、表示される `whsec_...` が変わる。
そのたびに `apps/web/.env` の `NPB_STRIPE_WEBHOOK_SECRET` を更新し、`pnpm dev` を再起動する。
`stripe listen` は起動したままにしておき、その状態で Checkout Session を新しく作る。

### 9.3 Nuxt dev server を起動する

```bash
pnpm dev
```

以降の例ではローカル URL を変数にして書く。

```bash
BASE_URL=http://localhost:3000
COOKIE_JAR=/tmp/npb-chat-local-cookie.txt
```

### 9.4 ローカル account を作る

```bash
curl -i -c "$COOKIE_JAR" "$BASE_URL/api/account" \
  -H 'X-NPB-User-Id: local-billing-test'
```

正しい状態:

- HTTP status が `200`
- `billingConfigured` が `true`
- `plan` が `free`
- `billingStatus` が `active`

### 9.5 test mode Checkout Session を作る

```bash
curl -i -b "$COOKIE_JAR" -c "$COOKIE_JAR" -X PUT "$BASE_URL/api/billing/subscription" \
  -H 'Content-Type: application/json' \
  -H 'X-NPB-User-Id: local-billing-test' \
  -d '{"plan":"pro"}'
```

正しい状態:

- HTTP status が `200`
- JSON に `redirectUrl` がある
- `redirectUrl` は `https://checkout.stripe.com/...` で始まる
- Stripe Dashboard の test mode に Checkout Session が作成される

### 9.6 Checkout 完了と webhook 反映

`redirectUrl` をブラウザで開き、Stripe Checkout で支払いを完了する。
test mode なので Stripe のテストカードを使う。
完了後、Stripe が `/api/billing/webhook` に `checkout.session.completed` を送る。

Stripe CLI の terminal で確認する。

正しい状態:

- `checkout.session.completed` が表示される
- forwarding の HTTP status が `200`

支払い完了後も account が `billingStatus: incomplete` のままなら、次を確認する。

```bash
sqlite3 data/npb-2025.sqlite \
"SELECT user_id, plan, billing_status, stripe_customer_id, stripe_subscription_id, stripe_checkout_session_id
 FROM chat_accounts
 WHERE user_id = 'local-billing-test';"
```

`stripe_checkout_session_id` が `cs_test_...` のままなら、webhook が処理されていない。
Stripe CLI を起動している terminal を見る。

正しく処理された場合:

- `checkout.session.completed` が表示される
- `POST http://localhost:3000/api/billing/webhook` が `200` になる

失敗例:

- `400 invalid_signature`: `stripe listen` が表示した `whsec_...` と `apps/web/.env` の `NPB_STRIPE_WEBHOOK_SECRET` が違う。`.env` を直して `pnpm dev` を再起動し、Checkout Session を作り直す
- `503 missing_env`: `apps/web/.env` の Stripe 設定が足りない。`.env` を直して `pnpm dev` を再起動する
- Stripe CLI terminal に何も出ない: 支払い完了時に `stripe listen --forward-to localhost:3000/api/billing/webhook` が動いていない。Stripe CLI を起動した状態で Checkout Session を作り直す

決済済みの Checkout Session がどの user_id を持っているか確認する場合:

```bash
set -a
. apps/web/.env
set +a
stripe checkout sessions retrieve <cs_test_...> --api-key "$NPB_STRIPE_SECRET_KEY"
```

正しい session:

- `payment_status` が `paid`
- `metadata.user_id` が `local-billing-test`
- `customer` が `cus_...`
- `subscription` が `sub_...`

この session が `paid` なのに DB が `billing_status=incomplete` のままなら、Checkout は完了しているが webhook がローカルアプリに反映されていない。
この場合、既に完了済みの Checkout Session を見直しても DB は更新されない。
Stripe CLI forwarding は、起動中に届いた event を転送する前提なので、次の順で新しい Checkout Session を作り直す。

1. `stripe listen --api-key "$NPB_STRIPE_SECRET_KEY" --forward-to http://localhost:3000/api/billing/webhook` を起動する
2. Stripe CLI が表示した `whsec_...` を `apps/web/.env` の `NPB_STRIPE_WEBHOOK_SECRET` に入れる
3. `pnpm dev` を再起動する
4. `PUT /api/billing/subscription` で新しい Checkout Session を作る
5. 新しい `redirectUrl` をブラウザで開き、test card で支払い完了する
6. Stripe CLI terminal に `checkout.session.completed` と webhook response `200` が出ることを確認する
7. `/api/account` と SQLite を再確認する

Stripe Dashboard で確認する場合:

- `ワークベンチ` → `Webhooks`
- test mode のイベントを見る
- `イベント配信` を見る

正しい状態:

- `checkout.session.completed` の配信が成功している
- HTTP status が `2xx`
- payload の `data.object.metadata.user_id` が対象 user id
- payload の `data.object.customer` が `cus_...`
- payload の `data.object.subscription` が `sub_...`

webhook 反映後に account を確認する。

```bash
curl -i -b "$COOKIE_JAR" -c "$COOKIE_JAR" "$BASE_URL/api/account" \
  -H 'X-NPB-User-Id: local-billing-test'
```

正しい完了状態:

- HTTP status が `200`
- JSON の `plan` が `pro`
- JSON の `billingStatus` が `active`
- JSON の `stripeCustomerId` が `cus_...`
- JSON の `stripeSubscriptionId` が `sub_...`
- `billingPlan.monthlyUsageLimit` が `null`

ローカル SQLite でも確認する。

```bash
sqlite3 data/npb-2025.sqlite \
"SELECT user_id, plan, billing_status, stripe_customer_id, stripe_subscription_id, stripe_checkout_session_id
 FROM chat_accounts
 WHERE user_id = 'local-billing-test';"
```

正しい完了状態:

- 対象 user の `plan` が `pro`
- `billing_status` が `active`
- `stripe_customer_id` が `cus_...`
- `stripe_subscription_id` が `sub_...`
- `stripe_checkout_session_id` は `null`

### 9.7 Pro の usage

```bash
curl -i -b "$COOKIE_JAR" -c "$COOKIE_JAR" "$BASE_URL/api/chat/usage" \
  -H 'X-NPB-User-Id: local-billing-test'
```

正しい状態:

- HTTP status が `200`
- JSON の `plan` が `pro`
- `limit` が `null`
- `remaining` が `null`

## 10. つまずきやすい点

- `whsec_...` は Stripe Dashboard の webhook secret である
- `sk_test_...` / `sk_live_...` は Stripe Dashboard の API secret key である
- `pk_...` は公開可能キーなので `NPB_STRIPE_SECRET_KEY` には入れない
- `price_...` は product ではなく recurring Price の ID である
- Webhook は `Stripe-Signature` header を検証する
- `portal` は billing portal session の URL を返す
