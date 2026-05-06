# Production TODO

このファイルは、本番運用に残っている作業と完了条件を確認するための一覧である。Cloudflare への具体的な実行手順は [deploy.md](./deploy.md) を正とする。

## 読み分け

| 目的 | 参照先 |
|------|--------|
| Cloudflare へ実際に deploy する | [deploy.md](./deploy.md) |
| 日次更新ジョブの仕様と GitHub Actions | [update-job.md](./update-job.md) |
| usage / plan / account の仕様 | [usage-limit.md](./usage-limit.md) |
| UI の構成と変更箇所 | [ui-chat.md](./ui-chat.md) |
| 現在の実装状態 | [current-status.md](./current-status.md) |

## 残作業

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

Not implemented in repository:

- SQLite から D1 へ 2016-2026 の normalized rows を全量投入する専用コマンド
- D1 import 後の自動件数検証コマンド

現状:

- migration SQL は `packages/db/migrations/` にある。
- アプリの query layer は D1 binding `NPB_DB` に対応済み。
- 本番 D1 への全量投入は運用作業として残る。

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

Not implemented in repository:

- Worker `scheduled` handler で `update:daily` 相当を完結させる実装
- Cloudflare Cron trigger 設定

現状:

- `pnpm --filter @npb/db run update:daily` は Node CLI として実装済み。
- `.github/workflows/daily-update.yml` に GitHub Actions schedule / workflow_dispatch は実装済み。

完了条件:

- GitHub Actions または Cloudflare Cron のどちらかで、人間が毎日手動実行しなくても差分更新される。
- 失敗時に non-zero / failed status になり、summary log が残る。

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
