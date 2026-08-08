# チャット利用制限・ゲスト利用ポリシー

## 利用制限

- 制限対象は `POST /api/chat` のみ。`GET /api/search/*` は対象外。
- Guest と Free はトークンバケット方式。初期値・最大保持数は10回、2時間ごとに1回回復する。
- 未使用分は最大保持数まで蓄積する。固定の日次・月次リセットは行わない。
- 時刻はAPIで `Asia/Tokyo` と明示し、次回回復・満タン時刻をJSTで返す。
- Proは無制限。`plan=pro` かつ課金状態が `active` または `trialing` の場合だけProとして扱う。
- 回答生成に失敗した場合は、消費したトークンを返却する。

## Runtime Config

| 変数 | 既定値 | 用途 |
|---|---:|---|
| `NPB_FREE_TOKEN_CAPACITY` | `10` | Free/Guestの最大保持数（1〜100） |
| `NPB_FREE_TOKEN_REFILL_MINUTES` | `120` | 1トークンの回復間隔（分） |
| `NPB_GUEST_GUARD_ENABLED` | `true` | ゲスト用の軽量な再発行抑止 |

Cloudflare WorkerのRuntime Configとして解決するため、運用中はコード変更なしで値を変更できる。無効値は安全な既定値へフォールバックする。

## 識別方法

| mode | 制御単位 |
|---|---|
| development/internal | `X-NPB-User-Id` のアカウントバケット |
| production guest | 署名付きCookie `npb_chat_user` のアカウントバケットと、ゲストガードバケットの両方 |
| production logged-in | Google連携済み `user_id` のアカウントバケットのみ |

ゲストガードは、Cloudflareの接続元ネットワーク情報とUser-Agent、言語、platform/mobile hintからHMAC識別子を作る。生のIP・User-AgentはDBへ保存しない。Cookieを削除しても同じ環境ではガード側の残量が維持される。一方、Googleログインユーザーには適用しない。

これは完全な不正防止ではない。共有回線での誤制限を抑えるためブラウザ特性も組み合わせ、ネットワーク変更等による回避は許容する「軽い抑止」とする。

## DB

`0010_chat_usage_token_buckets.sql` の `chat_usage_token_buckets` を利用する。

- `bucket_key`: `account:<user_id>` またはHMAC済み `guest-guard:<digest>`
- `tokens`: 現在の整数トークン数
- `last_refill_at`: 回復計算の基準Unix秒
- `updated_at`: 最終更新Unix秒

既存の `chat_usage_monthly` は過去データとして残すが、新しい制限判定には使用しない。新方式への初回アクセス時は満タンから開始する。

## API/UI

`GET /api/chat/usage` と `POST /api/chat` の `usage` は、残り回数、最大数、回復間隔、次回回復時刻、満タン時刻、`Asia/Tokyo` を返す。残量0では `POST /api/chat` がHTTP 429と同じusage snapshotを返す。

UIは「残り質問数」「次の1回まで」「満タンまで」「回復間隔」を表示する。429時も残り回数と次回利用可能までを利用者向け文言にする。

## 主な実装

- `packages/db/src/repository/chat-usage-repository.ts`
- `packages/db/migrations/0010_chat_usage_token_buckets.sql`
- `apps/web/server/utils/chat-runtime-config.ts`
- `apps/web/server/utils/guest-usage-guard.ts`
- `apps/web/server/api/chat.post.ts`
- `apps/web/server/api/chat/usage.get.ts`
- `apps/web/composables/useChat.ts`
- `apps/web/pages/chat.vue`
