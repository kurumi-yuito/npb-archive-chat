# チャット UI

## 目的

NPB公式 scores / BIS 由来のDBを根拠に、ブラウザから自然文で質問し、回答・件数・候補・ソースURLを確認できるチャット画面を提供する。

## ルーティング

| path | 内容 |
|------|------|
| `/` | `/chat` へリダイレクト。独立したトップページは持たない |
| `/chat` | チャットAI画面 |

ルートを変える場合は `apps/web/pages/index.vue` を編集する。

## 現在の画面構成

| 領域 | 表示内容 | 主な編集箇所 |
|------|----------|--------------|
| 左サイドバー | ブランド、アカウント、プラン、usage、直近 query plan | `apps/web/pages/chat.vue` |
| アカウント | ゲスト / Google ログイン済み account、Google ログイン / ログアウト | `apps/web/composables/useChat.ts`, `apps/web/pages/chat.vue` |
| プラン | Free / Pro 選択、DBの `chat_accounts.plan` を更新 | `apps/web/composables/useChat.ts`, `apps/web/pages/chat.vue`, `apps/web/server/api/billing/subscription.put.ts` |
| usage | `GET /api/chat/usage` の結果、月・残回数・無制限表示 | `apps/web/composables/useChat.ts`, `apps/web/pages/chat.vue` |
| 上部バー | サービス名、根拠DBの説明、プラン/残数 | `apps/web/pages/chat.vue` |
| 初期画面 | 質問例ボタン | `examplePrompts` in `apps/web/pages/chat.vue` |
| 会話履歴 | ユーザー発話、AI回答、loading、error | `apps/web/pages/chat.vue`, `apps/web/composables/useChat.ts` |
| 入力欄 | textarea、Enter送信、Shift+Enter改行、送信ボタン | `apps/web/pages/chat.vue` |
| 回答summary | `answer.summary` | formatterは `apps/web/server/services/chat-answer-formatter.ts`、表示は `apps/web/pages/chat.vue` |
| 件数 | `answer.result_count`, `answer.remaining_count` | `apps/web/pages/chat.vue` |
| ambiguous候補 | `answer.resolved_player.candidates` | `apps/web/pages/chat.vue` |
| events一覧 | `results.events` の日付、gameId、回、表裏、resultText、sourceUrl | `apps/web/pages/chat.vue` |
| 打撃成績表 | `results.batting` | `apps/web/pages/chat.vue` |
| 所属表示 | `results.affiliations` | `apps/web/pages/chat.vue` |
| ソースURL | `answer.source_urls` | `apps/web/pages/chat.vue` |
| query plan | 直近成功レスポンスの `structured_query` | `apps/web/pages/chat.vue` |

## データ取得と状態管理

| ファイル | 役割 |
|----------|------|
| `apps/web/composables/useChat.ts` | `/api/chat` と `/api/chat/usage` の fetch、会話履歴、loading/error、usage、localStorage の user_id / plan |
| `apps/web/pages/chat.vue` | 画面レイアウト、表示項目、送信操作、質問例 |
| `apps/web/server/api/chat.post.ts` | public chat endpoint。usage check 後に chat service を呼ぶ |
| `apps/web/server/api/chat/usage.get.ts` | usage snapshot endpoint |
| `apps/web/server/services/chat-answer-formatter.ts` | DB結果から deterministic summary を作る |
| `packages/schemas/src/index.ts` | `ChatResponse` / `ChatUsageInfo` / structured query schema |

## 表示文言を変える場所

| 変更したいもの | 編集箇所 |
|----------------|----------|
| 画面タイトル、ヘッダー説明 | `apps/web/pages/chat.vue` の `topbar` |
| 左サイドバーの文言 | `apps/web/pages/chat.vue` の `sidebar` |
| 質問例 | `apps/web/pages/chat.vue` の `examplePrompts` |
| intent の日本語ラベル | `structuredQueryLabel()` in `apps/web/pages/chat.vue` |
| usage の表示形式 | `usageLabel`, `usageMeterStyle` in `apps/web/pages/chat.vue` |
| API error の文言 | `extractFetchErrorMessage()` / 429処理 in `apps/web/composables/useChat.ts` |
| AI回答本文 | `apps/web/server/services/chat-answer-formatter.ts` |
| LLM最終回答のプロンプト | `apps/web/server/services/chat-final-answer-llm.ts` |

## 見た目を変える場所

CSS は `apps/web/pages/chat.vue` の `<style scoped>` に集約している。

| 変更したいもの | 主な class |
|----------------|------------|
| 全体レイアウト | `.chat-shell`, `.sidebar`, `.workspace` |
| サイドバー | `.sidebar`, `.panel`, `.brand` |
| ヘッダー | `.topbar`, `.topbar__usage` |
| 初期質問例 | `.empty-state`, `.prompt-grid`, `.prompt-card` |
| 会話表示 | `.conversation`, `.turn`, `.message`, `.bubble`, `.answer` |
| 結果セクション | `.result-section`, `.event-list`, `.data-table`, `.source-list` |
| 入力欄 | `.composer`, `.composer__input`, `.composer__send` |
| モバイル対応 | `@media (max-width: 820px)` |

## 認証・課金まわりの現状

Done:

- dev では localStorage 由来の `X-NPB-User-Id` を UI から送る
- アカウント profile 保存 UI
- Free / Pro のsubscription更新 UI
- Free の月間 usage 表示
- 429 usage limit のエラー表示

課金は `billing_provider=internal` としてDBに永続化する。外部決済プロバイダ連携はこのフェーズの前提にしない。
