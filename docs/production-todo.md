# Production TODO

このファイルは、本番運用に残っている作業と完了条件を確認するための一覧である。
Cloudflare への具体的な deploy 手順は [deploy.md](./deploy.md) を正とする。
日次更新ジョブの有効化・手動実行・確認・復旧手順は [daily-update-runbook.md](./daily-update-runbook.md) を正とする。

重要:

- チャット、account/profile、subscription、usage はアプリ実装として完了している。
- したがって、account / billing についての残作業は「本番 secret と本番環境の確認」に限る。
- ここに書く残作業は、主に本番データ投入と運用基盤である。

## 読み分け

| 目的 | 参照先 |
|------|--------|
| Cloudflare へ実際に deploy する | [deploy.md](./deploy.md) |
| 日次更新ジョブを本番で有効化・確認する | [daily-update-runbook.md](./daily-update-runbook.md) |
| 日次更新ジョブの仕様を確認する | [update-job.md](./update-job.md) |
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

### 3. 日次更新ジョブの本番有効化

Implemented in repository:

- Worker `scheduled` handler で Cloudflare Cron から GitHub Actions workflow dispatch を起動する実装
- root `wrangler.toml` の Cloudflare Cron trigger 設定
- `.github/workflows/daily-update.yml` の `workflow_dispatch`
- GitHub Actions で R2 の年別 SQLite backup を復元し、`update:daily` 後に `sync:d1` で production D1 に反映する手順
- 更新後の年別 SQLite を R2 backup に戻す手順

参照タイミング:

- 初回リリース前: [daily-update-runbook.md](./daily-update-runbook.md) の「初回セットアップ」を上から実行する。
- リリース直後: 同 runbook の「手動 dry run」→「手動本番更新」を実行する。
- 運用中: 同 runbook の「Cron の確認」「ログ確認」を見る。
- 失敗時: 同 runbook の「失敗時の見る順番」「復旧」を見る。

完了条件:

- GitHub Actions repository secrets に `CLOUDFLARE_D1_API_TOKEN` / `CLOUDFLARE_R2_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` が設定されている。
- Cloudflare Worker secrets に `NPB_DAILY_UPDATE_GITHUB_*` が設定されている。
- R2 `npb-archive-chat-raw/backups/sqlite/npb-YYYY.sqlite` が 2016-2026 年分存在する。
- GitHub Actions `Daily NPB Scores Update` の dry run が成功する。
- GitHub Actions `Daily NPB Scores Update` の本番更新が成功し、`d1-sync` verification が `mismatches: []` になる。
- Cloudflare Cron trigger `5 1,7,13 * * *` が Worker に表示される。

### 4. R2 正規保存先化

Not implemented in repository:

- R2 を raw HTML / structured JSON の正規保存先にする storage adapter
- `update:daily` が raw HTML / structured JSON を R2 へ直接読み書きする経路

現状:

- R2 binding `NPB_R2_RAW` の deploy scaffold はある。
- 現行の検索/チャット API は D1/SQLite の normalized DB を読む。
- 本番日次更新では R2 を年別 SQLite backup 置き場として使う。raw / structured の正規保存先化とは別タスク。

完了条件:

- raw HTML を削除せず R2 に保存できる。
- structured JSON を R2 に保存できる。
- normalized DB は R2 上の raw / structured から再構築できる。

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
