# Downloader

`packages/crawler` には、`data/discovery/{year}.json` を入力として各試合の 4 ページ生 HTML を保存する `download` CLI があります。

注意: 現在の年次 DB 更新の正規フローは `discover → update:year → backfill:scores-canonical → enrich:scores-calendar` です。`crawler:download` は個別 raw HTML の取得・調査用 CLI として残っていますが、正規の年次 DB 更新導線ではありません。

対象ページは次の 4 つです。

- `index.html`
- `playbyplay.html`
- `box.html`
- `roster.html`

保存先は次です。

```text
data/raw/{year}/{mmdd}/{game_id}/
```

既存ファイルがある場合は再取得しません。

## 前提

事前に discovery JSON を作成しておきます。

```bash
pnpm crawler:discover --year 2026
```

## 実行例

年単位で discovery JSON に含まれる全試合を取得する場合:

```bash
pnpm crawler:download --year 2026
```

1 試合だけ取得する場合:

```bash
pnpm crawler:download --year 2026 --game-id r20260327g-t-01
```

リクエスト間隔と User-Agent を明示する場合:

```bash
pnpm crawler:download --year 2026 --delay-ms 1500 --user-agent "npb-archive-chat/0.0.0"
```

## CLI 引数

- `--year`: 必須。`data/discovery/{year}.json` を読む
- `--game-id`: 任意。指定した `gameId` だけ取得する
- `--delay-ms`: 任意。各 HTTP リクエスト後の待機ミリ秒。デフォルトは `1000`
- `--user-agent`: 任意。HTTP リクエストの `User-Agent`。デフォルト値あり

## 保存構成

たとえば `2026-03-27` の `r20260327g-t-01` は次に保存されます。

```text
data/raw/2026/0327/r20260327g-t-01/index.html
data/raw/2026/0327/r20260327g-t-01/playbyplay.html
data/raw/2026/0327/r20260327g-t-01/box.html
data/raw/2026/0327/r20260327g-t-01/roster.html
```

## 動作

- discovery JSON の `downloader.pages.*` をそのまま取得対象に使う
- ファイルが既に存在する場合は `skip` として扱う
- 保存先ディレクトリは無ければ自動作成する
- ログに `game`, `fetch`, `saved`, `skip` を出す
- 取得ログは `data/logs/download.log` に追記する

## 関連コマンド

- `pnpm crawler:discover --year 2026`
- `pnpm crawler:download --year 2026`
- `pnpm crawler:download --year 2026 --game-id r20260327g-t-01`

運用手順（1 試合・1 年・失敗時の再実行）は [download-runbook.md](./download-runbook.md) を参照してください。
