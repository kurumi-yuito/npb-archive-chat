# チャット利用制限・アカウント・課金

## 方針

- 制限対象は `POST /api/chat` のみ。`GET /api/search/*` には回数制限をかけない。
- user_id は dev では `X-NPB-User-Id`、production では署名付き cookie `npb_chat_user` を使う。
- プランは **DB の `chat_accounts.plan` だけ**を正とする。`X-NPB-Plan` は使わない。
- `free` は UTC 暦月あたり 9 回。`pro` は無制限。
- 課金状態は `chat_accounts.billing_provider='internal'` / `billing_status='active'` として永続化する。

## 実装状況

Done:

- `chat_accounts` table
- `chat_usage_monthly` table
- `GET /api/account`
- `PATCH /api/account`
- `PUT /api/billing/subscription`
- `POST /api/chat` の free 月次回数チェック
- `GET /api/chat/usage` の usage snapshot
- Free / Pro plan schema
- dev 用 `X-NPB-User-Id` fallback
- production 用 signed-cookie identity
- UI からの profile 保存、subscription plan 更新、usage 表示

## 識別方法

| mode | user_id |
|------|---------|
| dev | `NPB_AUTH_HEADER_FALLBACK=true` のとき `X-NPB-User-Id` を読む。UI は localStorage の UUID を送る |
| production | `NPB_AUTH_HEADER_FALLBACK=false` のとき署名付き cookie `npb_chat_user` を使う。cookie がなければ server が発行する |
| internal | `Authorization: Bearer <NPB_AUTH_SHARED_SECRET>` が一致する request は `X-NPB-User-Id` を指定できる |

検索 API ではこれらのヘッダは読まない。

## DB

`0005_chat_accounts.sql`:

- `chat_accounts.user_id`
- `email`
- `display_name`
- `plan`: `free` / `pro`
- `billing_status`: `active` / `canceled`
- `billing_provider`: `internal`

`0002_chat_usage.sql`:

- `chat_usage_monthly.user_id`
- `month` (`YYYY-MM`)
- `chat_count`

## API

| endpoint | method | 役割 |
|----------|--------|------|
| `/api/account` | GET | account/profile/subscription 状態を返す。なければ作成 |
| `/api/account` | PATCH | `email` / `displayName` を保存 |
| `/api/billing/subscription` | PUT | `plan` を `free` / `pro` に変更 |
| `/api/chat/usage` | GET | DB の account plan に基づく usage snapshot |
| `/api/chat` | POST | DB の account plan に基づいて usage check 後、回答生成 |

## 分岐箇所

1. `apps/web/server/utils/parse-chat-identity.ts`
   - user_id だけを解決する。
   - plan は解決しない。

2. `apps/web/server/utils/chat-account-response.ts`
   - user_id に対応する `chat_accounts` を作成/取得する。

3. `apps/web/server/api/chat.post.ts`
   - `chat_accounts.plan === 'free'` の場合だけ月次 usage を確認・加算する。

4. `apps/web/server/api/chat/usage.get.ts`
   - `chat_accounts.plan` に基づいて usage を返す。

5. `apps/web/composables/useChat.ts`
   - `/api/account` / `/api/billing/subscription` / `/api/chat/usage` / `/api/chat` を呼ぶ。
   - `X-NPB-Plan` は送らない。

## HTTP ステータス

| code | 状況 |
|------|------|
| 400 | user_id 欠如、request body 不正 |
| 429 | free の月次チャット上限到達 |
| 503 | SQLite/D1 未設定、production の `NPB_AUTH_SHARED_SECRET` 未設定 |

## 関連ファイル

- `packages/db/migrations/0005_chat_accounts.sql`
- `packages/db/migrations/0002_chat_usage.sql`
- `packages/db/src/repository/chat-account-repository.ts`
- `packages/db/src/repository/chat-usage-repository.ts`
- `apps/web/server/api/account.get.ts`
- `apps/web/server/api/account.patch.ts`
- `apps/web/server/api/billing/subscription.put.ts`
- `apps/web/server/api/chat.post.ts`
- `apps/web/server/api/chat/usage.get.ts`
- `apps/web/composables/useChat.ts`
- `apps/web/pages/chat.vue`
