# 2026-09-20 D1エラーの新規実測と全文比較

過去の原因推測ではなく、新しく送信した本番APIリクエスト2件のWorker tailで日次上限エラーを確認した。完全リリース完了ではない。

## 新規リクエストと識別子

| 項目 | リクエスト1 | リクエスト2 |
| --- | --- | --- |
| Worker eventTimestamp（UTC） | 2026-09-20T03:31:39.252000+00:00 | 2026-09-20T03:32:20.018000+00:00 |
| 応答Ray ID | a3ddc22a2eb3689b-SJC | a3ddc3290b447e56-SJC |
| tail内cf-ray | a3ddc22a2eb3689b | a3ddc3290b447e56 |
| Worker Version | b76e5b68-f602-497e-842e-ab4a573c9ebe | b76e5b68-f602-497e-842e-ab4a573c9ebe |
| HTTP status | 500 | 500 |
| tail truncated | False | False |
| リクエスト識別用User-Agent | npb-d1-proof-20260920-01 | npb-d1-proof-20260920-02 |

応答Ray IDのハッシュ部分とtailのcf-rayが両件とも一致する。Cloudflare Request IDとして独立した`requestId` / `request_id` / `cf-request-id` / `x-request-id`は応答・tailに現れていないため取得不能。Ray IDを別のRequest IDと称して補完しない。Cloudflareの数値Error Codeも記録されていない。取得できた例外識別子は`D1_ERROR`、例外名は`Error`。HTTP500は公開HTTP statusでありCloudflare固有Error Codeではない。

## D1_ERROR全文

```text
D1_ERROR: Your account has exceeded D1's free tier daily row read limit. Upgrade to a paid plan or wait until tomorrow (midnight UTC) to continue. See https://developers.cloudflare.com/d1/platform/limits/ for more details.
```

## Runtime例外とスタック全文

両件ともWorker tail最上位は`outcome: "ok"`、`exceptions: []`。Runtimeの未捕捉例外一覧は空であり、Workerクラッシュとは記録されていない。一方、`logs[].errorInfo`に以下の例外が記録され、HTTP500応答になっている。

### リクエスト1

```json
{
  "errorInfo": [
    null,
    {
      "name": "Error",
      "message": "D1_ERROR: Your account has exceeded D1's free tier daily row read limit. Upgrade to a paid plan or wait until tomorrow (midnight UTC) to continue. See https://developers.cloudflare.com/d1/platform/limits/ for more details.",
      "stack": "    at D1DatabaseSessionAlwaysPrimary._sendOrThrow (cloudflare-internal:d1-api:188:19)\n    at async cloudflare-internal:d1-api:497:19\n    at async measureD1 (index.js:15053:17)\n    at async Object.get (index.js:15068:27)\n    at async consumeChatUsageToken (index.js:15750:14)\n    at async JSON.stringify (index.js:19154:25)\n    at async index.js:15034:14\n    at async Object.handler (index.js:20313:21)\n    at async index.js:20395:7\n    at async b (index.js:19929:232)"
    }
  ],
  "message": [
    "[chat.post] usage persistence unavailable; continuing",
    "Error: D1_ERROR: Your account has exceeded D1's free tier daily row read limit. Upgrade to a paid plan or wait until tomorrow (midnight UTC) to continue. See https://developers.cloudflare.com/d1/platform/limits/ for more details."
  ],
  "level": "error",
  "timestamp": 1789875099740
}
```

```json
{
  "errorInfo": [
    null,
    {
      "name": "Error",
      "message": "D1_ERROR: Your account has exceeded D1's free tier daily row read limit. Upgrade to a paid plan or wait until tomorrow (midnight UTC) to continue. See https://developers.cloudflare.com/d1/platform/limits/ for more details.",
      "stack": "    at D1DatabaseSessionAlwaysPrimary._sendOrThrow (cloudflare-internal:d1-api:188:19)\n    at async cloudflare-internal:d1-api:497:19\n    at async measureD1 (index.js:15053:17)\n    at async Object.all (index.js:15071:13)\n    at async index.js:15082:20\n    at async getServerDatabase (index.js:15088:12)\n    at async getServerChatQueryService (index.js:15111:113)\n    at async Proxy.<anonymous> (index.js:19185:28)\n    at async resolveStructuredQueryPlayer (index.js:17502:12)\n    at async resolvePlayerWithScope (index.js:17684:14)"
    }
  ],
  "message": [
    "[chat.post] unhandled error",
    "Error: D1_ERROR: Your account has exceeded D1's free tier daily row read limit. Upgrade to a paid plan or wait until tomorrow (midnight UTC) to continue. See https://developers.cloudflare.com/d1/platform/limits/ for more details."
  ],
  "level": "error",
  "timestamp": 1789875102098
}
```

```json
{
  "errorInfo": [
    null,
    {
      "name": "Error",
      "message": "D1_ERROR: Your account has exceeded D1's free tier daily row read limit. Upgrade to a paid plan or wait until tomorrow (midnight UTC) to continue. See https://developers.cloudflare.com/d1/platform/limits/ for more details.",
      "stack": "    at D1DatabaseSessionAlwaysPrimary._sendOrThrow (cloudflare-internal:d1-api:188:19)\n    at async cloudflare-internal:d1-api:497:19\n    at async measureD1 (index.js:15053:17)\n    at async Object.all (index.js:15071:13)\n    at async index.js:15082:20\n    at async getServerDatabase (index.js:15088:12)\n    at async getServerChatQueryService (index.js:15111:113)\n    at async Proxy.<anonymous> (index.js:19185:28)\n    at async resolveStructuredQueryPlayer (index.js:17502:12)\n    at async resolvePlayerWithScope (index.js:17684:14)"
    }
  ],
  "message": [
    "[request error] [unhandled] [POST] https://npb-chat.dom9th-works.com/api/chat\n",
    {
      "message": "D1_ERROR: Your account has exceeded D1's free tier daily row read limit. Upgrade to a paid plan or wait until tomorrow (midnight UTC) to continue. See https://developers.cloudflare.com/d1/platform/limits/ for more details.",
      "statusCode": 500
    }
  ],
  "level": "error",
  "timestamp": 1789875102098
}
```

### リクエスト2

```json
{
  "errorInfo": [
    null,
    {
      "name": "Error",
      "message": "D1_ERROR: Your account has exceeded D1's free tier daily row read limit. Upgrade to a paid plan or wait until tomorrow (midnight UTC) to continue. See https://developers.cloudflare.com/d1/platform/limits/ for more details.",
      "stack": "    at D1DatabaseSessionAlwaysPrimary._sendOrThrow (cloudflare-internal:d1-api:188:19)\n    at async cloudflare-internal:d1-api:497:19\n    at async measureD1 (index.js:15053:17)\n    at async Object.get (index.js:15068:27)\n    at async consumeChatUsageToken (index.js:15750:14)\n    at async JSON.stringify (index.js:19154:25)\n    at async index.js:15034:14\n    at async Object.handler (index.js:20313:21)\n    at async index.js:20395:7\n    at async b (index.js:19929:232)"
    }
  ],
  "message": [
    "[chat.post] usage persistence unavailable; continuing",
    "Error: D1_ERROR: Your account has exceeded D1's free tier daily row read limit. Upgrade to a paid plan or wait until tomorrow (midnight UTC) to continue. See https://developers.cloudflare.com/d1/platform/limits/ for more details."
  ],
  "level": "error",
  "timestamp": 1789875140376
}
```

```json
{
  "errorInfo": [
    null,
    {
      "name": "Error",
      "message": "D1_ERROR: Your account has exceeded D1's free tier daily row read limit. Upgrade to a paid plan or wait until tomorrow (midnight UTC) to continue. See https://developers.cloudflare.com/d1/platform/limits/ for more details.",
      "stack": "    at D1DatabaseSessionAlwaysPrimary._sendOrThrow (cloudflare-internal:d1-api:188:19)\n    at async cloudflare-internal:d1-api:497:19\n    at async measureD1 (index.js:15053:17)\n    at async Object.all (index.js:15071:13)\n    at async index.js:15082:20\n    at async getServerDatabase (index.js:15088:12)\n    at async getServerChatQueryService (index.js:15111:113)\n    at async Proxy.<anonymous> (index.js:19185:28)\n    at async Object.answerQuestion (index.js:18526:148)\n    at async JSON.stringify (index.js:19205:18)"
    }
  ],
  "message": [
    "[chat.post] unhandled error",
    "Error: D1_ERROR: Your account has exceeded D1's free tier daily row read limit. Upgrade to a paid plan or wait until tomorrow (midnight UTC) to continue. See https://developers.cloudflare.com/d1/platform/limits/ for more details."
  ],
  "level": "error",
  "timestamp": 1789875141954
}
```

```json
{
  "errorInfo": [
    null,
    {
      "name": "Error",
      "message": "D1_ERROR: Your account has exceeded D1's free tier daily row read limit. Upgrade to a paid plan or wait until tomorrow (midnight UTC) to continue. See https://developers.cloudflare.com/d1/platform/limits/ for more details.",
      "stack": "    at D1DatabaseSessionAlwaysPrimary._sendOrThrow (cloudflare-internal:d1-api:188:19)\n    at async cloudflare-internal:d1-api:497:19\n    at async measureD1 (index.js:15053:17)\n    at async Object.all (index.js:15071:13)\n    at async index.js:15082:20\n    at async getServerDatabase (index.js:15088:12)\n    at async getServerChatQueryService (index.js:15111:113)\n    at async Proxy.<anonymous> (index.js:19185:28)\n    at async Object.answerQuestion (index.js:18526:148)\n    at async JSON.stringify (index.js:19205:18)"
    }
  ],
  "message": [
    "[request error] [unhandled] [POST] https://npb-chat.dom9th-works.com/api/chat\n",
    {
      "message": "D1_ERROR: Your account has exceeded D1's free tier daily row read limit. Upgrade to a paid plan or wait until tomorrow (midnight UTC) to continue. See https://developers.cloudflare.com/d1/platform/limits/ for more details.",
      "statusCode": 500
    }
  ],
  "level": "error",
  "timestamp": 1789875141954
}
```

## 発生SQLとmetadata以外の確認

### リクエスト1

- category: `meta`、failed: `false`

```sql
INSERT INTO chat_accounts ( user_id, auth_provider, auth_subject, auth_email_verified, plan, billing_status, billing_provider, stripe_customer_id, stripe_subscription_id, stripe_price_id, stripe_checkout_session_id ) VALUES (?, 'guest', NULL, 0, ?, 'active', 'stripe', NULL, NULL, NULL, NULL) ON CONFLICT(user_id) DO NOTHING RETURNING user_id AS userId, auth_provider AS authProvider, auth_subject AS authSubject, auth_email_verified AS authEmailVerified, email, display_name AS displayName, plan, billing_status AS billingStatus, billing_provider AS billingProvider, stripe_customer_id AS stripeCustomerId, stripe_subscription_id AS stripeSubscriptionId, stripe_price_id AS stripePriceId, stripe_checkout_session_id AS stripeCheckoutSessionId, created_at AS createdAt, updated_at AS updatedAt
```

- category: `meta`、failed: `true`

```sql
INSERT INTO chat_usage_token_buckets (bucket_key, tokens, last_refill_at, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(bucket_key) DO UPDATE SET tokens = MIN(?, tokens + CAST(MAX(0, ? - last_refill_at) / ? AS INTEGER)) - 1, last_refill_at = CASE WHEN MIN(?, tokens + CAST(MAX(0, ? - last_refill_at) / ? AS INTEGER)) >= ? THEN ? ELSE last_refill_at + CAST(MAX(0, ? - last_refill_at) / ? AS INTEGER) * ? END, updated_at = ? WHERE MIN(?, tokens + CAST(MAX(0, ? - last_refill_at) / ? AS INTEGER)) > 0 RETURNING tokens, last_refill_at AS lastRefillAt
```

- category: `other`、failed: `false`

```sql
SELECT metadata_value FROM normalized_runtime_metadata WHERE metadata_key='sync_generation'
```

- category: `repository`、failed: `true`

```sql
SELECT metadata_key AS key, metadata_value AS value FROM normalized_runtime_metadata WHERE metadata_key IN ('schema_version', 'runtime_contract')
```

### リクエスト2

- category: `meta`、failed: `false`

```sql
INSERT INTO chat_accounts ( user_id, auth_provider, auth_subject, auth_email_verified, plan, billing_status, billing_provider, stripe_customer_id, stripe_subscription_id, stripe_price_id, stripe_checkout_session_id ) VALUES (?, 'guest', NULL, 0, ?, 'active', 'stripe', NULL, NULL, NULL, NULL) ON CONFLICT(user_id) DO NOTHING RETURNING user_id AS userId, auth_provider AS authProvider, auth_subject AS authSubject, auth_email_verified AS authEmailVerified, email, display_name AS displayName, plan, billing_status AS billingStatus, billing_provider AS billingProvider, stripe_customer_id AS stripeCustomerId, stripe_subscription_id AS stripeSubscriptionId, stripe_price_id AS stripePriceId, stripe_checkout_session_id AS stripeCheckoutSessionId, created_at AS createdAt, updated_at AS updatedAt
```

- category: `meta`、failed: `true`

```sql
INSERT INTO chat_usage_token_buckets (bucket_key, tokens, last_refill_at, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(bucket_key) DO UPDATE SET tokens = MIN(?, tokens + CAST(MAX(0, ? - last_refill_at) / ? AS INTEGER)) - 1, last_refill_at = CASE WHEN MIN(?, tokens + CAST(MAX(0, ? - last_refill_at) / ? AS INTEGER)) >= ? THEN ? ELSE last_refill_at + CAST(MAX(0, ? - last_refill_at) / ? AS INTEGER) * ? END, updated_at = ? WHERE MIN(?, tokens + CAST(MAX(0, ? - last_refill_at) / ? AS INTEGER)) > 0 RETURNING tokens, last_refill_at AS lastRefillAt
```

- category: `other`、failed: `false`

```sql
SELECT metadata_value FROM normalized_runtime_metadata WHERE metadata_key='sync_generation'
```

- category: `repository`、failed: `true`

```sql
SELECT metadata_key AS key, metadata_value AS value FROM normalized_runtime_metadata WHERE metadata_key IN ('schema_version', 'runtime_contract')
```

`chat_usage_token_buckets`へのUPSERTで`consumeChatUsageToken`から同一D1_ERRORが出ている。これはruntime metadataへの問い合わせではない。続く`normalized_runtime_metadata`のschema/runtime contract SELECTでも同一D1_ERRORを記録している。一方、このリクエスト内のアカウント作成とsync_generation読み取りは成功として記録されているため、「すべてのD1操作が必ず失敗する」とは断定しない。成績データのSELECTは初期化失敗で到達しておらず、成績テーブル単体での同一エラーは未確認。DBへの直接操作は行っていない。

## 前回との厳密比較

- 比較元: `/tmp/release-ready-worker-tail.jsonl`。D1_ERROR本文の集合が文字列として完全一致: `true`。スタック全文の完全一致があるか: `false`。
- 比較元: `data/logs/release-ready-20260920/worker-errors.json`。D1_ERROR本文の集合が文字列として完全一致: `true`。スタック全文の完全一致があるか: `false`。

9月13日の保存済み生tailと今回、直前9月20日の保存ログと今回のD1_ERROR本文は完全一致した。Version・時刻・Ray ID・スタック行番号まで同一ではないため、「ログ全体が完全に同じ」とは扱わない。9月16日の報告文はあるが、今回比較に使用した生ログは上記2つに限定する。

今回の2件にある全errorInfoの本文は上記の日次上限文であり、database locked / timeout / internal error / migrationの別エラーはこの2件では観測していない。以前から制限が連続していたのか、日次reset後に再到達したのか、また誰のどの処理が上限を消費したかはこの証拠からは判断できない。経過日数による推測はしない。

## Cloudflare障害情報との照合

同時取得した[公式Status summary](https://www.cloudflarestatus.com/api/v2/summary.json)ではD1とWorkersは`operational`。全体表示は`Minor Service Outage`で、掲載中のincidentはWARP利用者のgeo location問題。取得した[incident一覧](https://www.cloudflarestatus.com/api/v2/incidents.json)に、この失敗をD1障害として説明する未解決incidentは見つからなかった。公開ステータスは未公表・局所障害の不存在を証明しない。今回の直接の観測事実はCloudflare D1が日次上限を明記した例外を返したことである。summaryのpage.updated_atが古い値である点も含め取得JSONを保存し、情報の完全性は断定しない。

## 原本と停止地点

- Worker tail全文（省略・編集なし）: `data/logs/d1-proof-20260920/worker-tail-full.json`
- Runtime error logs全文: `data/logs/d1-proof-20260920/runtime-error-full.json`
- 実APIのヘッダーと本文: `data/logs/d1-proof-20260920/probe-01.headers`, `probe-01.body.json`, `probe-02.headers`, `probe-02.body.json`
- 厳密比較結果: `data/logs/d1-proof-20260920/error-comparison.json`
- Cloudflare Status取得原文: `data/logs/d1-proof-20260920/cloudflare-status-summary.json`, `cloudflare-status-incidents.json`
- 配信履歴: `data/logs/d1-proof-20260920/deployments.txt`

新規リクエスト2件ともCloudflareログ上で前回と同じ日次上限本文を客観的に確認したため停止する。アプリ修正は行っていない。再開条件はD1が本番検索を正常に処理する状態への復旧。エラー本文に示された回避策は有料枠確保またはUTC日次resetであり、コードやHTTP status変更ではCloudflare側の拒否を解除できない。前回Acceptance結果を今回VersionのPassとして流用しない。復旧後は現在HEADのdeploy対応を確定し、Acceptance47件から再開する。再開コマンドと全リリース残作業は[前の停止記録](2026-09-20-release-d1-limit.md#再開条件コマンド)を参照。
