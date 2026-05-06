# npb-archive-chat

NPB の試合履歴を検索・チャットで扱うモノレポ（Nuxt 3、`packages/db` / `packages/schemas` など）。

## クイックスタート

```bash
pnpm install
```

ローカル開発:

```bash
# SQLite ファイルを絶対パスで指定
export NPB_SQLITE_PATH="$PWD/data/npb-2025.sqlite"
export NPB_SQLITE_DIR="$PWD/data"
pnpm dev
```

- 起動・基本操作の最短手順: [`docs/getting-started.md`](docs/getting-started.md)
- セットアップ詳細: [`docs/bootstrap.md`](docs/bootstrap.md)
- **Cloudflare Workers / D1 / R2 のビルド・migration・デプロイ**: [`docs/deploy.md`](docs/deploy.md)

## ドキュメント

全体の入口: [`docs/README.md`](docs/README.md)

| ドキュメント | 内容 |
|--------------|------|
| [`docs/getting-started.md`](docs/getting-started.md) | ローカル起動、画面操作、API確認、日次更新の基本操作 |
| [`docs/current-status.md`](docs/current-status.md) | 現在の実装状態 |
| [`docs/production-todo.md`](docs/production-todo.md) | 本番運用に残っている作業と手順 |
| [`docs/bootstrap.md`](docs/bootstrap.md) | 初回セットアップ・よく使うコマンド |
| [`docs/deploy.md`](docs/deploy.md) | Cloudflare 向けビルド、D1 migration、デプロイ手順 |
| [`docs/ui-chat.md`](docs/ui-chat.md) | `/chat` 画面の表示項目と操作 |
| [`docs/chat-backend.md`](docs/chat-backend.md) | `/api/chat` の処理フロー |
| [`docs/update-job.md`](docs/update-job.md) | `update:daily` とデータ更新 |
| [`docs/usage-limit.md`](docs/usage-limit.md) | チャット回数制限（`/api/chat` のみ） |

## ライセンス・方針

プロジェクトルールは [`AGENTS.md`](AGENTS.md) を参照。
