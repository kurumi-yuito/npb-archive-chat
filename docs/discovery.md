# Discovery

`packages/crawler` には、年別・日別の試合一覧からその年に存在する試合を列挙し、`data/discovery/{year}.json` を生成する `discover` CLI があります。

この段階では以下だけを行います。

- 月別カレンダーから実在する日別一覧ページを収集する
- 日別一覧からホーム/ビジターの組み合わせを収集する
- 同一カードの年間出現順から `gameId` を割り当てる
- downloader に渡すための `scores/*` URL 群を JSON に保存する

現在の年次 DB 更新の正規フローでは、discovery の次に `update:year → backfill:scores-canonical → enrich:scores-calendar` を実行する。discovery が保持する `downloader.pages.*` は crawler download 用にも使えるが、DB 補完の正規 source は `backfill:scores-canonical` で確認された `games.canonical_url` とする。

この段階では以下は行いません。

- `index.html` / `playbyplay.html` / `box.html` / `roster.html` の取得
- HTML のパース
- DB への投入

## 実行例

リポジトリルートで実行します。

```bash
pnpm crawler:discover --year 2026
```

成功すると標準出力に出力先パスが表示され、`data/discovery/2026.json` が生成されます。

## 収集元ページ

discovery は NPB 英語版 BIS の一覧ページだけを起点にします。

- 年別カレンダー: `https://npb.jp/bis/eng/{year}/calendar/`
- 年別カレンダー Farm: `https://npb.jp/bis/eng/{year}/calendar/index_farm.html`
- 月送りリンク:
  regular は `index_05.html` のような月別ページ、farm は `index_farm_05.html` のような月別ページ
- 日別一覧リンク（カレンダー上の `href`）:
  - **従来形式**: regular は `gmYYYYMMDD.html`、farm は `fgmYYYYMMDD.html`
  - **2025 年頃の bis 英語版**: regular は `s` + `YYYYMMDD` + 試合 ID 数字 + `.html`（例: `s2025032800105.html` の先頭 8 桁 `20250328` が暦日）、farm は `fs` + 同様（例: `fs2025100401984.html`）
  - discovery は上記の両方を認識し、暦日はファイル名から復元する

各ページから取っているものは次のとおりです。

- 年別/毎月カレンダー:
  `href` から次に巡回するカレンダーページと、その日に対応する日別一覧ページ URL を取る
- 日別一覧:
  対戦カード、球場、開始時刻、掲載状態を取る
- `scores/*` 側 URL:
  一覧ページ上に直接は無いため、`gameId` を確定したあと `https://npb.jp/scores/{year}/{mmdd}/{gameId}/...` を組み立てる

実サイトの 2026 年カレンダーページでは `href="/bis/eng/..."` や `href="index_05.html"` のような相対リンクが混在しているため、discovery 側でカレンダーページ URL を基準に絶対 URL へ解決してから巡回します。

### 日別ページ（Scores）の HTML と抽出ロジック

`(Scores)` / `(Schedules)` の有無で `listingType` を判定します。

- **従来（アンカー一行）**: `<a>` 内に `HomeTeam R Game n Venue R AwayTeam` のような一行テキストがある場合、そこから対戦と球場を取ります。
- **2025 年頃の bis 英語版（表・改行）**: 日別一覧 `gmYYYYMMDD.html` では、`<table>` のセルが改行区切りのテキストになり、概ね **ホーム名 → 得点 → `-` → 得点 → ビジター名** の 5 行が 1 試合のスコアサマリになります。続く行に `Game n` と球場名が並ぶことが多いです。
- **単一試合 `s…html`**: 同じく表由来で **ホーム名 → 得点 → ビジター名 → 得点** の 4 行（中央に `-` が無い）になることがあります。

アンカー形式で 1 件も取れない場合のみ、上記の **5 行 / 4 行ブロック**を走査して `RawGame` を組み立てます（カレンダー由来の日付・URL は従来どおり）。

### デバッグ環境変数

- `NPB_CRAWLER_DEBUG_CALENDAR=1`: カレンダー取得直後のリンク解決件数・日別 URL 件数など（別紙 `packages/crawler/DEBUG_CALENDAR.md`）。
- `NPB_CRAWLER_DEBUG_DAILY=1`: **各日別ページをパースしたあと**の `rawGameCount`（その URL で何試合取れたか）を標準エラーに出します。

## 生成JSONの形

`data/discovery/{year}.json` は `@npb/schemas` の `discoveryYearSchema` に従います。

```json
{
  "schemaVersion": 1,
  "year": 2026,
  "generatedAt": "2026-04-18T01:23:45.000Z",
  "games": [
    {
      "year": 2026,
      "date": "2026-03-27",
      "mmdd": "0327",
      "gameId": "r20260327g-t-01",
      "gameNumber": 1,
      "competition": "regular",
      "listingType": "scores",
      "listingStatus": "listed",
      "startsAt": null,
      "venue": "Tokyo Dome",
      "homeTeam": {
        "code": "g",
        "label": "Yomiuri"
      },
      "awayTeam": {
        "code": "t",
        "label": "Hanshin"
      },
      "source": {
        "calendarPageUrl": "https://npb.jp/bis/eng/2026/calendar/",
        "dailyPageUrl": "https://npb.jp/bis/eng/2026/games/gm20260327.html"
      },
      "downloader": {
        "scoreBaseUrl": "https://npb.jp/scores/2026/0327/g-t-01",
        "pages": {
          "index": "https://npb.jp/scores/2026/0327/g-t-01/index.html",
          "playByPlay": "https://npb.jp/scores/2026/0327/g-t-01/playbyplay.html",
          "box": "https://npb.jp/scores/2026/0327/g-t-01/box.html",
          "roster": "https://npb.jp/scores/2026/0327/g-t-01/roster.html"
        }
      }
    }
  ]
}
```

## `gameId` の決め方

- JSON の **`gameId`**（および raw / structured のディレクトリ名）は **`{r|f}{YYYYMMDD}{homeCode}-{awayCode}-{nn}`** です（`@npb/schemas` の **`DISCOVERY_GAME_ID_REGEX`** と一致。先頭の `[a-z0-9]+` に日付と competition プレフィックスを含めます）。
  - **`r`**: セ・パ（regular）、**`f`**: ファーム（farm）。regular / farm で **別カウント**です。
  - **`YYYYMMDD`**: `games[].date` の暦日（重複しないストレージ用キー）。
  - **`{homeCode}-{awayCode}-{nn}`**: その日の **NPB `scores` パス用スラグ**と同じ並び。`nn` は **2 桁**（`01`–`99`）。
- **グルーピングキー**（通番の単位）は **`{date}:{competition}:{ソート済み home/away ペア}`** です。年をまたいで累積しないため、**同一暦日・同一 competition・同一カード**ごとに `nn` が 01 から振り直されます（同一日ダブルヘッダは 02, 03…）。
- 試合の並びは `date` → `competition`（regular を farm より先）→ 日別ページ内の `order` → `dailyPageUrl` の順で安定ソートします。
- 例: `r20260327g-t-01`, `f20260327m-a-01`, `r20260415d-c-01`

**`downloader.scoreBaseUrl` / `downloader.pages.*`** のパス末尾は、npb.jp 実サイトに合わせ **`{homeCode}-{awayCode}-{nn}`**（例: `https://npb.jp/scores/2026/0327/g-t-01`）です。`gameId` とは異なります（raw は `data/raw/{year}/{mmdd}/{gameId}/` で一意、取得 URL は従来の短いスラグ）。

### デバッグ（gameId）

`NPB_CRAWLER_DEBUG_GAMEID=1` を付けると、`discoveryYearSchema.parse` の直前に **`DISCOVERY_GAME_ID_REGEX` に合わない `gameId`** があれば、件数と先頭数件のサンプル（`date` / `homeCode` / `awayCode` / `gameNumber`）を標準エラーに出します（通常は生成ロジックで弾くため、出た場合はバグ調査用です）。

このため discovery の責務は「一覧に存在した試合を年内の時系列で確定すること」です。

## Downloader に渡すインターフェース

downloader は discovery JSON の `games[]` をそのまま入力にできます。最低限必要なのは次の項目です。

- `date`
- `mmdd`
- `gameId`
- `downloader.scoreBaseUrl`
- `downloader.pages.index`
- `downloader.pages.playByPlay`
- `downloader.pages.box`
- `downloader.pages.roster`

downloader 側では `listingStatus` を見て取得可否を制御できます。たとえば `postponed` はスキップし、`scheduled` / `listed` だけ取得対象にする、という扱いができます。
