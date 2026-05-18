# Current Status

## Canonical Data Flow

現在の年次データ更新の正規フローは次に統一する。

```text
discover
→ update:year
→ backfill:scores-canonical
→ enrich:scores-calendar
```

- `discover`: `data/discovery/{year}.json` を生成する。
- `update:year`: discovery を元に `games` の土台を作り、年別 SQLite に投入する。
- `backfill:scores-canonical`: 確認済みの scores index URL を `games.canonical_url` に補完する。
- `enrich:scores-calendar`: canonical scores URL から 4HTML を取得し、raw / structured / normalized DB を補完する。

`crawler:download` と parser CLI は調査・個別取得用に残るが、年次 DB 更新の正規導線ではない。

BIS の最新系情報は別導線。

```text
update:bis-current
```

これは最新所属・チーム/個人成績の補助 source であり、scores の試合単位 enrichment とは分離する。

## Done

- 2016-2026 の年別 SQLite データ基盤
- `data/raw/{year}/{mmdd}/{game_id}/...` の raw HTML 保存
- `data/structured/{year}/{mmdd}/{game_id}/...` の structured JSON 保存
- normalized DB tables（`events` 中心）
- multi-year query layer
- `/api/search/*`
- `/api/chat` の最小検索
- player_id resolution
- ambiguity / not_found handling
- `sourceUrl` と `source_snapshots`
- `bis_source_snapshots` と BIS current tables
- DB-backed eval 20件
- deterministic formatter の `search_events` 一覧表示
- `player_affiliation` intent と `current_team_roster` 優先の所属チーム回答
- `update:daily` CLI（JST / 直近3日既定 / 日付範囲 / strict / summary log）
- `update:bis-current` CLI
- `sync:d1` CLI（年別 SQLite → remote D1 同期）
- R2 object storage adapter（local / R2）
- `update:daily --storage r2` による raw / structured の R2 保存
- `rebuild:r2-year` CLI（R2 raw / structured → 年別 SQLite 再構築）
- GitHub Actions `workflow_dispatch` と Cloudflare Cron による日次自動更新入口
- `chat_accounts` による account/profile/subscription 永続化
- free / pro plan と monthly usage 永続化
- `billingPlan` metadata と Stripe subscription の価格設定（free 0円 / pro 月額 980円）
- Stripe Checkout / Billing Portal / webhook による課金同期
- dev user header fallback と production signed-cookie identity
- plan は DB の `chat_accounts.plan` のみを正とし、plan header は使わない
- `/` から `/chat` へのリダイレクト
- `/chat` UI（サイドバー、入力、履歴、summary、件数、events、batting、affiliations、sourceUrl、ambiguous候補、usage、loading/error、account/profile/subscription 設定）
- public `/api/chat` route と service layer 分離
- D1 query adapter と SQLite/D1 切替
- LLM final answer generation（production では env 必須、dev/test のみ deterministic formatter fallback 可）
- BIS current の DeNA smoke 取得・ロード確認
- 2026-05-10 の live smoke で `/api/account` / `/api/chat/usage` / `/api/chat` が workers.dev 上で応答することを確認済み
- `R2 Canonical Storage Runbook` の手順実行と `rebuild:r2-year` の再構築確認

## Production Operations

実際のデプロイ手順は [deploy.md](./deploy.md) を正とする。本番環境で確認する項目は [production-readiness.md](./production-readiness.md) にまとめる。

- UI のアクセシビリティ監査・analytics は運用品質の継続確認項目。
- 更新ジョブの監視、リトライ、通知は GitHub Actions / Cloudflare の運用設定で確認する。
- Cloudflare アカウント上の Worker / D1 / R2 / secrets / domain 設定は [deploy.md](./deploy.md) の手順で確認する。
