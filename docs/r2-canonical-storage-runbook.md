# R2 Canonical Storage Runbook

このドキュメントは、R2 を raw HTML / structured JSON の正規保存先として運用・検証する手順である。

現時点の本番日次更新は、R2 を年別 SQLite backup 置き場として使っている。これは稼働済みの運用であり、このドキュメントの対象外である。

このドキュメントの対象は、次の実装済み領域である。

```text
raw HTML / structured JSON
→ R2 に保存
→ 必要に応じて R2 から復元
→ normalized SQLite / D1 を再構築
```

## 目的

- raw HTML をローカル `data/raw/...` だけに置かない。
- structured JSON をローカル `data/structured/...` だけに置かない。
- R2 上の raw / structured を削除しない保存元にする。
- normalized DB は R2 上の raw / structured から再構築可能にする。

## 現在の状態

Implemented:

- `wrangler.toml` に R2 binding `NPB_R2_RAW` がある。
- GitHub Actions は R2 の年別 SQLite backup を復元/保存できる。
- 検索/チャット API は D1 normalized DB を読む。
- raw HTML / structured JSON 用の storage adapter がある。
- `update:daily --storage r2` が raw / structured を R2 に保存する。
- `rebuild:r2-year` が R2 上の raw / structured から年別 SQLite を再構築する。

## 正規キー設計

R2 object key はローカル `data/` 配下の相対パスに揃える。

| 種別 | R2 key |
|------|--------|
| scores raw HTML | `raw/{year}/{mmdd}/{game_id}/{page}.html` |
| scores structured JSON | `structured/{year}/{mmdd}/{game_id}/rich.json` |
| scores calendar raw | `raw-scores-calendar/{year}/{mmdd}/index.html` |
| BIS current raw | `raw/bis/{year}/{team_id}-{page}.html` |
| BIS current structured | `structured/bis/{year}/bis-current.json` |

R2 bucket は既存の `npb-archive-chat-raw` を使う。

## 実装構成

### 1. storage interface

```text
packages/db/src/storage/object-storage.ts
```

実ファイル:

```text
packages/db/src/object-storage.ts
```

最低限の interface:

```ts
export type ObjectStorage = {
  getText(key: string): Promise<string | null>
  putText(key: string, value: string, contentType: string): Promise<void>
  exists(key: string): Promise<boolean>
}
```

実装:

| 実装 | 用途 |
|------|------|
| `LocalObjectStorage` | ローカル開発。`data/` に読み書きする |
| `R2ObjectStorage` | Cloudflare / GitHub Actions。R2 に読み書きする |

### 2. storage 経由の保存対象

対象:

```text
packages/db/src/enrich-scores-calendar.ts
packages/db/src/update-job.ts
packages/db/src/bis-current.ts
packages/parser/src/index.ts
```

方針:

- 既存の local path 生成ロジックは残す。
- ファイル読み書きの直前だけ storage adapter に寄せる。
- raw HTML は存在すれば再取得しない。
- raw HTML は上書き削除しない。
- structured JSON は同じ source から再生成可能なので upsert 可。

### 3. CLI storage mode

対象:

```text
packages/db/src/cli.ts
packages/db/src/update-daily.ts
packages/db/src/enrich-scores-calendar.ts
packages/db/src/bis-current.ts
```

```bash
--storage local
--storage r2
--r2-bucket npb-archive-chat-raw
--r2-prefix ''
```

default は `local` にする。既存ローカル開発とテストを壊さないため。

本番 GitHub Actions では `--storage r2` を使う。

### 4. R2 credential を GitHub Actions に渡す

既存の日次更新 workflow は R2 S3 API token を使っている。

使う secrets:

```text
CLOUDFLARE_R2_ACCESS_KEY_ID
CLOUDFLARE_R2_SECRET_ACCESS_KEY
CLOUDFLARE_ACCOUNT_ID
```

R2 adapter は Node.js 上では S3互換 API を使う。

Cloudflare Worker runtime 上で R2 に触る実装が必要になった場合だけ、binding `NPB_R2_RAW` を使う。

### 5. rebuild CLI

```bash
pnpm --filter @npb/db run rebuild:r2-year -- --year 2026 --storage r2 --r2-bucket npb-archive-chat-raw --sqlite-path ./data/npb-2026.sqlite
```

処理:

```text
R2 raw / structured を読む
→ parser / loader を実行
→ year SQLite を作る
→ sync:d1 で D1 に投入
```

完了条件:

- ローカル `data/raw` を使わず、R2 の object だけで年別 SQLite が作れる。
- 作った SQLite を `sync:d1 --verify` で D1 に入れられる。

### 6. daily-update workflow を切り替える

現在:

```text
R2 SQLite backup
→ update:daily はローカル data/ に raw / structured を保存
→ sync:d1
→ R2 SQLite backup 保存
```

切り替え後:

```text
R2 SQLite backup
→ update:daily --storage r2
→ raw / structured は R2 に保存
→ normalized SQLite を更新
→ sync:d1
→ R2 SQLite backup 保存
```

SQLite backup は当面残す。D1 反映を高速化し、障害時にすぐ復旧するため。

## 検証手順

### ローカル storage

```bash
pnpm --filter @npb/db test
pnpm --filter @npb/db run update:daily -- --date 2026-05-09 --storage local --dry-run
```

### R2 storage dry run

```bash
pnpm --filter @npb/db run update:daily -- --date 2026-05-09 --storage r2 --r2-bucket npb-archive-chat-raw --dry-run
```

期待:

- R2 credential が無い場合は明示的な error。
- dry run では R2 に書かない。

### R2 storage 本実行

```bash
pnpm --filter @npb/db run update:daily -- --date 2026-05-09 --storage r2 --r2-bucket npb-archive-chat-raw
```

期待:

- R2 に raw HTML object が作られる。
- R2 に structured JSON object が作られる。
- SQLite / D1 の件数検証が通る。

確認例:

```bash
aws s3 ls s3://npb-archive-chat-raw/raw/2026/0509/ \
  --endpoint-url "https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com"
```

### rebuild

```bash
pnpm --filter @npb/db run rebuild:r2-year -- --year 2026 --storage r2 --r2-bucket npb-archive-chat-raw --sqlite-path ./data/npb-2026.rebuilt.sqlite --clean
pnpm --filter @npb/db run sync:d1 -- --sqlite-dir ./data --d1-database npb-archive-chat-import --verify
```

期待:

- `verification.mismatches` が `[]`。
- `/api/chat` が source URL 付きで回答する。

## 完了条件

- `ObjectStorage` interface がある。
- local / R2 の2実装がある。
- `update:daily --storage r2` が raw / structured を R2 に保存する。
- `rebuild:r2-year --storage r2` が R2 から SQLite を再構築する。
- GitHub Actions 本番更新が `--storage r2` で成功する。
- docs の `production-todo.md` からこの項目を完了済みに移せる。

## まだやらないこと

- R2 上の raw HTML 削除。
- R2 lifecycle による raw / structured 削除。
- `/api/chat` から R2 raw を直接読むこと。
- public API に R2 object を公開すること。
