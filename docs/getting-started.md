# Getting Started

ローカルで NPB アーカイブ検索チャットを起動し、画面と API を確認するための最短手順です。

詳細な背景は次を参照してください。

- ドキュメント全体の入口: [README.md](./README.md)
- 初回セットアップと開発コマンド: [bootstrap.md](./bootstrap.md)
- チャット UI の仕様: [ui-chat.md](./ui-chat.md)
- チャット API の仕様: [chat-backend.md](./chat-backend.md)
- usage / plan / 認証境界: [usage-limit.md](./usage-limit.md)
- 日次更新ジョブの本番運用: [daily-update-runbook.md](./daily-update-runbook.md)
- 日次更新ジョブの仕様: [update-job.md](./update-job.md)
- Cloudflare / D1 / R2 / デプロイ手順: [deploy.md](./deploy.md)
- 本番運用に残る作業: [production-todo.md](./production-todo.md)

## 前提

- Node.js 20 以上
- pnpm 9.15.4 付近
- repo root で作業する
- `data/npb-{year}.sqlite` が存在する

pnpm が無い場合:

```bash
corepack enable
corepack prepare pnpm@9.15.4 --activate
```

初回セットアップ:

```bash
pnpm install
```

## ローカル起動

repo root で、SQLite の絶対パスを指定して起動します。

```bash
export NPB_SQLITE_PATH="$PWD/data/npb-2025.sqlite"
export NPB_SQLITE_DIR="$PWD/data"
pnpm dev
```

起動後:

- ルート: <http://127.0.0.1:3000/> （`/chat` へリダイレクト）
- チャット: <http://127.0.0.1:3000/chat>

注意:

- `NPB_SQLITE_PATH` は usage DB / single-year fallback 用です。
- `NPB_SQLITE_DIR` は multi-year query layer が `npb-{year}.sqlite` を探すディレクトリです。
- 相対パスは起動方法によって `apps/web` 起点になることがあるため、ローカル確認では絶対パスを推奨します。

## 画面の基本操作

1. `/` または `/chat` を開く。
2. 入力欄に質問を入れる。
3. Enter または送信ボタンで送る。
4. 回答本文、件数、events 一覧、source URL、usage 残回数を確認する。
5. 曖昧な選手名では候補だけが表示され、DB 検索は実行されない。

例:

```text
2025年にヤクルトの山田が打ったホームラン一覧
2025年4月5日のヤクルト対中日の試合詳細
2025年4月5日のヤクルト対中日のスタメン
```

## API 確認

usage:

```bash
curl -s http://127.0.0.1:3000/api/chat/usage \
  -H 'X-NPB-User-Id: local'
```

chat:

```bash
curl -s http://127.0.0.1:3000/api/chat \
  -H 'Content-Type: application/json' \
  -H 'X-NPB-User-Id: local' \
  -d '{"message":"2025年にヤクルトの山田が打ったホームラン一覧"}'
```

プランは `/api/billing/subscription` または UI のプラン設定で変更します。`X-NPB-Plan` は使いません。

## 日次更新の基本操作

対象日を実更新せず確認:

```bash
pnpm --filter @npb/db run update:daily -- --date 2025-04-05 --dry-run
```

既定の直近3日を更新:

```bash
pnpm --filter @npb/db run update:daily
```

日付指定:

```bash
pnpm --filter @npb/db run update:daily -- --date 2025-04-05
pnpm --filter @npb/db run update:daily -- --from 2025-04-05 --to 2025-04-07
pnpm --filter @npb/db run update:daily -- --days 5
```

summary:

```text
data/logs/update-daily-summary.json
```

## よく使う確認コマンド

```bash
pnpm --filter @npb/db test
pnpm --filter @npb/web test
pnpm --filter @npb/web typecheck
```

チャット eval だけ確認:

```bash
pnpm --filter @npb/web test -- tests/chat-eval.test.ts
```

## よくある詰まり

- API が 503 になる: `NPB_SQLITE_PATH` / `NPB_SQLITE_DIR` を確認する。
- 期待したデータが出ない: 対象年の `data/npb-{year}.sqlite` が存在するか確認する。
- 起動直後の curl が timeout する: Nuxt dev server は初回に Vite / Nitro build が走るため、`Nuxt Nitro server built` まで待つ。
- `free` で 429 になる: 同じ `X-NPB-User-Id` の月次 usage が上限です。dev 確認では別 user id を使うか、UI/API で account plan を `pro` に変更する。
