# Bootstrap

このドキュメントは、モノレポ初期化の内容と次の作業の指針をまとめたものです。

## 前提

- Node.js 20 以上
- [pnpm](https://pnpm.io/) 9（ルート `package.json` の `packageManager` フィールドと揃えています）

### `pnpm: command not found` のとき（WSL / Linux など）

OS に pnpm が入っていないだけです。次のいずれかで入れてください。

**Corepack を使う（Node に付属。推奨）**

```bash
corepack enable
corepack prepare pnpm@9.15.4 --activate
pnpm --version   # 9.15.4 付近であることを確認
```

**npm でグローバル導入する場合**

```bash
npm install -g pnpm@9.15.4
```

## 初回セットアップ

リポジトリルートで次を実行します。

```bash
pnpm install
```

`apps/web` の `postinstall` で `nuxt prepare` が走り、`.nuxt` 配下の型定義が生成されます。初回の `pnpm typecheck` の前に `pnpm install` が必要です。`apps/web` の型チェックは `nuxi typecheck` ではなく `vue-tsc` を使い、PATH に `npx` が無い環境でも動くようにしています。

## よく使うコマンド

| コマンド | 説明 |
|---------|------|
| `pnpm dev` | `apps/web` の Nuxt 開発サーバー（ルートは `node` で `nuxt.mjs` を起動し、`pnpm` のネストを避ける） |
| `pnpm build` | `apps/web` の本番ビルド（Nitro 既定: `node-server`） |
| `pnpm build:cf` | Cloudflare Workers 向け Nitro ビルド（`cloudflare_module`）。手順は [`deploy.md`](deploy.md) |
| `pnpm lint` | `eslint.config.mjs` と `apps/web` / `packages` / `scripts` を一括で静的解析 |
| `pnpm typecheck` | `scripts/typecheck.mjs` 経由で `vue-tsc`（web）と `tsc`（各 `packages/*`）を実行 |
| `pnpm test` | ルートの `vitest.workspace.ts` に基づき全ワークスペースのテストを実行 |

個別のワークスペースだけ動かす例:

```bash
pnpm --filter @npb/crawler lint
pnpm --filter @npb/web typecheck
pnpm --filter @npb/schemas test
```

## ディレクトリ構成

| パス | 役割 |
|------|------|
| `apps/web` | Nuxt 3 フロントおよびサーバールート |
| `packages/crawler` | 試合の発見と raw HTML の取得 |
| `packages/parser` | raw HTML からリッチな中間 JSON へのパース |
| `packages/db` | マイグレーション、ローダー、クエリ層 |
| `packages/schemas` | 共有 Zod スキーマ（外部境界・パース境界向け） |

## 現在の実装状況

Done:

- Nuxt 3 アプリとサーバールート
- 2016-2026 のローカル SQLite データ基盤
- `/api/search/*` と `/api/chat` の最小実装
- Cloudflare Workers / D1 向けの接続層と build scaffold
- `/` から `/chat` へのリダイレクト
- `/chat` UI
- `update:daily` と Cloudflare Cron / GitHub Actions workflow_dispatch
- production signed-cookie identity / dev header fallback
- `chat_accounts` による account/profile/subscription 永続化

Not implemented:

- UI のアクセシビリティ監査
- 更新ジョブの監視、リトライ、通知
- D1 / R2 への本番データ運用

## この初期化でやっていなかったこと（履歴）

- 外部サイト API やスクレイパー実装の追加（`packages/crawler` 等は別途）
- Cloudflare Workers 上での本番運用（root `wrangler.toml` と [`deploy.md`](deploy.md) の手順のみ。ローカル SQLite は従来どおり）

**Cloudflare 向けの雛形**（root `wrangler.toml`、`pnpm build:cf`）とデプロイ・migration 手順は [`deploy.md`](deploy.md) を参照。

## 次にやるとよいこと（提案）

1. **本番データ**: D1 にスキーマ適用・データ投入後、Workers で動作確認する（[`deploy.md`](deploy.md)）。
2. **`packages/db`**: スキーマ変更は必ずマイグレーション経由にする（AGENTS.md）。
3. **`packages/schemas`**: クローラー・パーサー・API の境界ごとに Zod スキーマを追加し、`parser` の変更時はフィクスチャとテストを更新する。
4. **ワークスペース参照**: `parser` から `@npb/schemas` を参照するなど、`package.json` の `workspace:*` で依存を張る。
5. **CI**: `pnpm install` → `pnpm lint` → `pnpm typecheck` → `pnpm test` → `pnpm build` のパイプラインを用意する。

## トラブルシュート

- **`extends "./.nuxt/tsconfig.json"` が見つからない**  
  `pnpm install` を実行し、`apps/web` で `nuxt prepare` が成功しているか確認する。

- **ESLint が Vue ファイルで失敗する**  
  ルートの `eslint.config.mjs` を確認し、`eslint-plugin-vue` と `typescript-eslint` のバージョン整合を取る。

- **`pnpm install` 時の `@nuxt/schema` peer の警告**  
  現状は Nuxt の解決バージョンと CLI の peer 指定の差による警告です。問題が出る場合は Nuxt をプロジェクト方針に合わせてピン留めするか、`pnpm.overrides` で整合させる。

## 初期化で追加された主なパス

- ルート: `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `tsconfig.base.json`, `eslint.config.mjs`, `vitest.workspace.ts`, `scripts/typecheck.mjs`, `.gitignore`
- `apps/web/`: Nuxt 3 最小アプリ、`vitest.config.ts`、`tests/smoke.test.ts`
- `packages/{crawler,parser,db,schemas}/`: `package.json`, `tsconfig.json`, `src/index.ts`（および Vitest のスモーク）、`vitest.config.ts`
- `docs/bootstrap.md`: 本書
- `docs/workspace.md`: `packages/*` の `workspace:*` 依存と TypeScript の `paths`
