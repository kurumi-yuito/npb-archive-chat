# Production TODO

このファイルは、本番運用に残っている作業と完了条件を確認するための一覧である。
Cloudflare への具体的な実行手順は [deploy.md](./deploy.md) を正とする。

重要:

- チャット、account/profile、subscription、usage はアプリ実装として完了している。
- したがって、account / billing についての残作業は「本番 secret と本番環境の確認」に限る。
- ここに書く残作業は、主に本番データ投入と運用基盤である。

## 読み分け

| 目的 | 参照先 |
|------|--------|
| Cloudflare へ実際に deploy する | [deploy.md](./deploy.md) |
| 日次更新ジョブの仕様と GitHub Actions | [update-job.md](./update-job.md) |
| usage / plan / account の仕様 | [usage-limit.md](./usage-limit.md) |
| UI の構成と変更箇所 | [ui-chat.md](./ui-chat.md) |
| 現在の実装状態 | [current-status.md](./current-status.md) |

## 残作業

### 0. 本番に入れる前の最終確認

まず、アプリ側に未完了の account / billing 実装がないことを確認する。

- `GET /api/account`
- `PATCH /api/account`
- `PUT /api/billing/subscription`
- `GET /api/chat/usage`

これらは実装済みである。残っているのは本番環境に値を入れて確認することだけである。

### 1. Cloudflare 実リソース設定

Not implemented in repository:

- 本番 Cloudflare account 上の Worker 作成/確認
- D1 database 作成
- R2 bucket 作成
- root `wrangler.toml` の D1 `database_id` / R2 `bucket_name` の実値確認
- production secrets 設定
- 必要なら custom domain / route 設定

完了条件:

- `wrangler deploy` が対象 account に対して成功する。
- 本番 URL で `/api/account` / `/api/chat/usage` / `/api/chat` が応答する。

### 2. D1 本番データ投入

Implemented in repository:

- `pnpm --filter @npb/db run sync:d1` で、年別 SQLite から D1 へ normalized rows を投入できる
- `data/logs/d1-sync/summary.json` に件数サマリーが残る
- deploy 手順に D1 import / 件数検証コマンドを明記済み

完了条件:

- D1 に `games` / `events` / `current_team_roster` / `player_batting_stats` などの本番データが入っている。
- 本番 `/api/chat` が D1 上のデータを根拠に回答する。

### 3. R2 正規保存先化

Not implemented in repository:

- R2 を raw HTML / structured JSON の正規保存先にする storage adapter
- `update:daily` が R2 へ raw / structured を読み書きする経路

現状:

- R2 binding `NPB_R2_RAW` の deploy scaffold はある。
- 現行の検索/チャット API は D1/SQLite の normalized DB を読む。

完了条件:

- raw HTML を削除せず R2 に保存できる。
- structured JSON を R2 に保存できる。
- normalized DB は R2 上の raw / structured から再構築できる。

### 4. Cloudflare Cron 単体運用

Implemented in repository:

- Worker `scheduled` handler で Cloudflare Cron から GitHub Actions workflow dispatch を起動する実装
- root `wrangler.toml` の Cloudflare Cron trigger 設定
- `.github/workflows/daily-update.yml` の `workflow_dispatch`

完了条件:

- GitHub Actions の `workflow_dispatch` を Cloudflare Cron または手動から起動できる。
- 失敗時に non-zero / failed status になり、summary log が残る。

### 5. 完了済みだが本番で確認すべき項目

以下は実装済みなので、やることは本番 smoke test だけである。

- account / profile 保存
- subscription plan 切り替え
- usage 上限 429
- dev header fallback
- production signed-cookie identity
- `/api/chat` の deterministic formatter / LLM fallback

確認コマンド:

```bash
curl -s https://<worker-domain>/api/account
curl -s https://<worker-domain>/api/chat/usage
curl -s https://<worker-domain>/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"藤浪晋太郎の所属チームは"}'
```

## 本番確認チェックリスト

deploy 後に確認する。

- `/` が `/chat` に遷移する。
- `/api/account` が account を作成/取得する。
- `/api/billing/subscription` で `free` / `pro` が切り替わる。
- `/api/chat/usage` が DB の account plan を読む。
- free で月間上限到達時に 429 になる。
- pro で `limit: null` / `remaining: null` になる。
- `/api/chat` が source URL 付きで回答する。
- ambiguous は候補提示のみで検索しない。
- production request では `X-NPB-Plan` header に依存しない。
