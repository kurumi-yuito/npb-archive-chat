# Production TODO / Runbook

現在アプリ機能として残している TODO はない。ここに残るのは、Cloudflare 本番環境で運用するために人間が実アカウントで実行する作業である。

## 事前確認

repo root で確認する。

```bash
pnpm --filter @npb/db test
pnpm --filter @npb/web test
pnpm --filter @npb/web typecheck
```

ローカルで起動確認する。

```bash
export NPB_SQLITE_PATH="$PWD/data/npb-2025.sqlite"
export NPB_SQLITE_DIR="$PWD/data"
pnpm dev
```

## 1. Cloudflare リソース作成

1. Cloudflare account / project を決める。
2. D1 database を作成する。
3. R2 bucket を作成する。
4. `apps/web/wrangler.toml` の D1 `database_id` と R2 `bucket_name` を実値に置き換える。

詳細: [deploy.md](./deploy.md)

## 2. Secrets 設定

production では `NPB_AUTH_SHARED_SECRET` が必須。

```bash
cd apps/web
wrangler secret put NPB_AUTH_SHARED_SECRET
```

LLM を使う場合のみ設定する。

```bash
wrangler secret put CHAT_QUERY_LLM_API_KEY
wrangler secret put CHAT_ANSWER_LLM_API_KEY
```

`CHAT_QUERY_LLM_MODEL` / `CHAT_ANSWER_LLM_MODEL` は deploy 環境の vars で設定する。

## 3. D1 migration 適用

`packages/db/migrations/*.sql` を D1 に適用する。

```bash
cd apps/web
wrangler d1 execute <D1_NAME> --remote --file ../../packages/db/migrations/0001_initial.sql
wrangler d1 execute <D1_NAME> --remote --file ../../packages/db/migrations/0002_chat_usage.sql
wrangler d1 execute <D1_NAME> --remote --file ../../packages/db/migrations/0003_scores_calendar_rebuild.sql
wrangler d1 execute <D1_NAME> --remote --file ../../packages/db/migrations/0004_bis_current.sql
wrangler d1 execute <D1_NAME> --remote --file ../../packages/db/migrations/0005_chat_accounts.sql
```

ランタイムでは D1 migration を実行しない。適用はデプロイ前の作業にする。

## 4. 本番データ投入

現状の正規データ基盤はローカル SQLite にある。D1 への 2016-2026 全量投入は本番運用作業として実施する。

最低限の手順:

1. 対象年の `data/npb-{year}.sqlite` が揃っていることを確認する。
2. D1 に投入するための export / import 方針を決める。
3. 投入前に D1 backup を取る。
4. 投入後、件数確認を行う。

確認例:

```sql
SELECT COUNT(*) FROM games;
SELECT COUNT(*) FROM events;
SELECT COUNT(*) FROM current_team_roster;
SELECT COUNT(*) FROM player_batting_stats;
SELECT COUNT(*) FROM chat_accounts;
```

注意:

- raw HTML と structured JSON は削除しない。
- R2 を raw / structured の正規保存先にする場合は storage adapter が必要。現状は本番運用 TODO。

## 5. Deploy

```bash
cd apps/web
pnpm build:cf
wrangler deploy
```

確認:

```bash
curl -s https://<worker-domain>/api/account
curl -s https://<worker-domain>/api/chat/usage
curl -s https://<worker-domain>/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"藤浪晋太郎の所属チームは"}'
```

production では通常 request に `X-NPB-Plan` は使わない。プランは `chat_accounts.plan` のみを正とする。

## 6. 日次更新の自動実行

GitHub Actions schedule は入口として実装済み。運用時は secrets と実行環境を設定する。

確認するもの:

1. workflow の schedule が有効か。
2. workflow_dispatch で手動実行できるか。
3. 失敗時に non-zero で落ちるか。
4. summary log が保存されるか。

詳細: [update-job.md](./update-job.md)

Cloudflare Cron 単体で `update:daily` 相当を完結させる Worker scheduled handler は未実装。設計は [deploy.md](./deploy.md) に記載。

## 7. Backup / Rollback

D1:

- migration 前に export / backup を取る。
- destructive migration は作らない。
- rollback は追加 migration で戻す。

Worker:

- `wrangler deployments list` で直近 deployment を確認する。
- Cloudflare dashboard または Wrangler で直前 version に戻す。

R2:

- raw HTML は削除しない。
- lifecycle rule を設定する場合も raw / structured の削除は禁止。

## 8. 本番確認チェックリスト

- `/` が `/chat` に遷移する。
- `/api/account` が account を作成/取得する。
- `/api/billing/subscription` で `free` / `pro` が切り替わる。
- `/api/chat/usage` が DB の account plan を読む。
- free で月間上限到達時に 429 になる。
- pro で `limit: null` / `remaining: null` になる。
- `/api/chat` が source URL 付きで回答する。
- ambiguous は候補提示のみで検索しない。
- D1 上で `/api/search/*` と `/api/chat` が同じ `QueryDatabase` 境界で動く。
