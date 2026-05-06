# カレンダー discovery のデバッグ（実 HTML の確認）

## 環境変数 `NPB_CRAWLER_DEBUG_CALENDAR`

`1` / `true` / `yes` のとき、**各カレンダー URL を fetch した直後**に `parseCalendarPage` へ渡す HTML の先頭約 500 文字と、リンク抽出の統計を **stderr** に 1 行 JSON で出します。

例（リポジトリルート、PowerShell）:

```powershell
$env:NPB_CRAWLER_DEBUG_CALENDAR = '1'
pnpm --filter @npb/crawler discover -- --year 2025
```

bash:

```bash
NPB_CRAWLER_DEBUG_CALENDAR=1 pnpm --filter @npb/crawler discover -- --year 2025
```

`update:year` 経由でも、crawler の `discoverGamesByYear` が走れば同じログが出ます。

## ログの読み方（`dailyPages` が空になる理由の切り分け）

1. **`htmlLength` が極端に小さい**  
   エラーページやリダイレクト先の短い HTML の可能性。`Request failed` が出ていないかも確認。

2. **`rawHtmlHrefToGamesCount` が 0**  
   取得 HTML に `/games/` への `href` が無い = **サーバーが別物を返している**（ボット対策、地域、認証ページなど）。この場合は **User-Agent / Accept** の調整が効くことがある（本パッケージでは discovery 用にブラウザ相当ヘッダを付与済み）。

3. **`resolvedUrlsUnderGames` はあるが `parsedDailyPageCount` が 0**  
   `href` はあるが **URL 形式が正規表現に合わない**（例: ドメイン・パス・ファイル名の変更）。`sampleResolvedGameUrls` を見て `parseCalendarPage` のパターンを見直す。

4. **`resolvedHrefTotal` が少ない**  
   相対 `href` の解決基準（`calendarPageUrl`）と実 HTML の組み合わせを疑う。

## curl での比較（crawler と同じ User-Agent）

crawler の discovery は概ね次のヘッダで GET します（`packages/crawler/src/index.ts` の `DISCOVERY_FETCH_HEADERS` と同値）。

```bash
curl -sS -L \
  -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' \
  -H 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8' \
  -H 'Accept-Language: en-US,en;q=0.9' \
  'https://npb.jp/bis/eng/2025/calendar/' | head -c 2000
```

`grep` で日別リンクの有無:

```bash
curl -sS -L \
  -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' \
  'https://npb.jp/bis/eng/2025/calendar/' | grep -Eo '/bis/eng/2025/games/[^"\047>]+' | head
```

- **curl では `/games/` が出るのに、デバッグログの `rawHtmlHrefToGamesCount` が 0**  
  → 実行時の fetch が別レスポンス（プロキシ、キャッシュ、異なる UA など）を返している。

- **どちらも `/games/` が無い**  
  → 当該 URL・時点のサイト構造の問題。別のカレンダー入口（月ページなど）を確認する。

## 既定の discovery リクエスト

`discoverGamesByYear` / `collectCalendarPages` および日別ページ取得では、上記 **`DISCOVERY_FETCH_HEADERS`** を付与した `fetch` を使います（download 用の `--user-agent` とは別経路）。
