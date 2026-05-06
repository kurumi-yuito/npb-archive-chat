# ダウンロード実行手順（Runbook）

ダウンロードは **CLI のみ**で行います（管理画面は置かない）。コマンドの詳細は [downloader.md](./downloader.md)、discovery の前提は [discovery.md](./discovery.md) を参照してください。

注意: 現在の年次 DB 更新の正規フローは `discover → update:year → backfill:scores-canonical → enrich:scores-calendar` です。この runbook は `crawler:download` を使う個別 raw HTML 取得・調査用の手順であり、正規の年次 DB 更新手順ではありません。

## 前提

- リポジトリルートで作業する（`pnpm` が使えること）。
- 対象年の discovery JSON が存在すること: `data/discovery/{year}.json`  
  無い場合は先に列挙する。

```bash
pnpm crawler:discover --year 2026
```

- 取得ログは `data/logs/download.log` に追記される。トラブル時はここと標準エラーを併せて見る。

---

## 1 試合だけダウンロードする

### 手順

1. `gameId` を確認する。`data/discovery/{year}.json` の `games[]` 内の `gameId`（例: `r20260327g-t-01`）を使う。
2. 次を実行する（`YYYY` と `GAME_ID` を置き換え）。

```bash
pnpm crawler:download --year YYYY --game-id GAME_ID
```

例（2026 年・`r20260327g-t-01`）:

```bash
pnpm crawler:download --year 2026 --game-id r20260327g-t-01
```

3. 成功時、標準出力に `data/raw` へのパスと `downloaded=` / `skipped=` の集計が出る。  
4. 保存先は次の 4 ファイル（ディレクトリは自動作成）。

```text
data/raw/{year}/{mmdd}/{game_id}/index.html
data/raw/{year}/{mmdd}/{game_id}/playbyplay.html
data/raw/{year}/{mmdd}/{game_id}/box.html
data/raw/{year}/{mmdd}/{game_id}/roster.html
```

`mmdd` と `game_id` は discovery の当該試合エントリに従う。

### 任意オプション

サーバー負荷を下げたいときは間隔を伸ばす。

```bash
pnpm crawler:download --year 2026 --game-id r20260327g-t-01 --delay-ms 1500
```

---

## 1 年分まとめてダウンロードする

### 手順

1. その年の `data/discovery/{year}.json` が最新であることを確認する（試合追加後は [discover を再実行](#discovery-をやり直す場合)）。
2. 次を実行する。

```bash
pnpm crawler:download --year YYYY
```

例:

```bash
pnpm crawler:download --year 2026
```

3. discovery に含まれる **全試合**について、上記 4 ページずつ取得する。既にファイルがあるパスは **再取得せず skip** する。
4. 長時間になる。ネットワークやレート制限に応じて `--delay-ms` を大きくする運用も可。

```bash
pnpm crawler:download --year 2026 --delay-ms 1500
```

---

## 失敗したときの再実行

実装の動きの要点:

- 各 HTTP が失敗（`response.ok` でない）すると **エラーで終了**する。失敗したリクエストより前に保存済みのファイルはディスク上に残る。
- 既存ファイルは **次の実行で skip** される。同じコマンドを再実行すれば、**未取得のページだけ**取りにいく。

### 1. 同じコマンドをそのまま再試行する

一時的なネットワーク障害や 5xx の可能性がある場合、**そのまま同じコマンドをもう一度**実行する（1 試合・1 年どちらも同様）。

```bash
pnpm crawler:download --year 2026 --game-id r20260327g-t-01
```

または

```bash
pnpm crawler:download --year 2026
```

### 2. レート制限・タイムアウトを疑う場合

`--delay-ms` を **大きく**して再実行する（例: `1000` → `2000`）。

```bash
pnpm crawler:download --year 2026 --delay-ms 2000
```

### 3. 一部だけ壊れたファイルや空ファイルがある場合

そのページに対応する **ファイルだけ削除**してから、同じ `download` を再実行する。存在しないパスだけ fetch される。

### 4. 試合ディレクトリをまるごと取り直す場合

当該試合のディレクトリを削除してから、同じ `--year` と `--game-id` で実行する。

```text
data/raw/{year}/{mmdd}/{game_id}/
```

を削除する（親の `data/raw/{year}` までは通常触らない）。

### 5. エラーメッセージが `Request failed: ... (404)` などのとき

- URL 側にページが無い、または discovery の URL が古い可能性がある。
- `pnpm crawler:discover --year YYYY` で discovery を再生成し、`data/discovery/{year}.json` を更新したうえで、もう一度 `download` する。

### 6. discovery をやり直す場合

試合一覧の更新が必要なとき:

```bash
pnpm crawler:discover --year YYYY
pnpm crawler:download --year YYYY
```

`--game-id` で 1 試合だけ直す場合も、先に discover が正しいことを確認する。

---

## 確認すべきログ・ファイル

| 場所 | 内容 |
|------|------|
| `data/logs/download.log` | 取得・skip・ゲーム単位のログ（追記） |
| 標準出力 / 終了コード | 失敗時は非ゼロで終了し、エラーメッセージが出る |
| `data/raw/...` | 4 ファイルの有無・更新時刻 |

---

## 関連ドキュメント

- [downloader.md](./downloader.md) — CLI 引数・保存パス・動作の一覧
- [discovery.md](./discovery.md) — `discover` と `discovery` JSON
- [source-structure.md](./source-structure.md) — ソースサイト上のページ構成
