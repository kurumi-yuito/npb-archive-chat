# NPB Source Structure

## 目的

この文書は、NPB公式サイトから試合データを収集する際の前提構造を固定するための仕様書である。

Crawler / Downloader / Parser / DB Loader / Chat API を実装する際は、この文書の内容を前提として扱うこと。

このプロジェクトでは、NPB公式サイト上の試合詳細ページをもとに、各試合について以下を行う。

1. 試合IDを収集する
2. 試合単位の生HTMLを保存する
3. 生HTMLから structured JSON を生成する
4. structured JSON から検索用DBへ正規化投入する

現在の正規データフロー:

```text
discover
→ update:year
→ backfill:scores-canonical
→ enrich:scores-calendar
```

BIS の最新系情報は scores enrichment と分け、次の別コマンドで取得する。

```text
update:bis-current
```


## 収集方針

### 基本方針

- URL総当たりはしない
- まず「存在する試合」を列挙する
- その後、各試合について詳細ページ4種を取得する
- 生HTMLは再パース可能性のため必ず保存する
- 取得済みファイルは再取得しない
- 試合ID単位で冪等に扱う


### 試合IDの収集元

試合IDは、年別・日別の試合一覧ページを起点として収集する。

URLを決め打ちして生成するのではなく、一覧上に存在する試合のみを対象とする。


## 1試合あたりの詳細ページ構成

各試合について、以下の4ページが存在する前提で処理する。

- index.html
- playbyplay.html
- box.html
- roster.html


### URL形式

https://npb.jp/scores/yyyy/mmdd/score_slug/index.html  
https://npb.jp/scores/yyyy/mmdd/score_slug/playbyplay.html  
https://npb.jp/scores/yyyy/mmdd/score_slug/box.html  
https://npb.jp/scores/yyyy/mmdd/score_slug/roster.html  

`score_slug` は `g-t-01` のような npb.jp scores 側の短い slug。ローカル保存に使う `game_id` は `r20260327g-t-01` のように competition prefix と日付を含む。


### 実例

2026年3月27日 読売ジャイアンツ vs 阪神タイガース

https://npb.jp/scores/2026/0327/g-t-01/index.html  
https://npb.jp/scores/2026/0327/g-t-01/playbyplay.html  
https://npb.jp/scores/2026/0327/g-t-01/box.html  
https://npb.jp/scores/2026/0327/g-t-01/roster.html  


## 各ページの役割

### index.html（試合トップ）

- 試合日
- 球場
- 対戦カード
- 試合種別
- ラインスコア
- 開始時刻 / 終了時刻 / 試合時間
- 入場者数
- 勝投手 / 敗投手 / セーブ
- 本塁打

→ 試合の概要情報


### playbyplay.html（試合経過）

- 回
- 表裏
- 打者
- 投手
- 結果
- アウト
- 塁状況
- 得点変動
- 打点
- 交代情報

→ イベント単位データ（最重要）


### box.html（投打成績）

- 打者成績
- 投手成績
- 各打席結果
- 守備位置

→ 個人成績補完


### roster.html（ベンチ入り選手）

- ベンチ入り全選手
- 背番号
- 投打

→ 出場していない選手も含む名簿


## 保存方針

### 生HTMLは必ず保存

理由

- 後から再パースできる
- DBを作り直せる
- 仕様変更に耐えられる


### 保存パス

data/raw/{year}/{mmdd}/{game_id}/index.html  
data/raw/{year}/{mmdd}/{game_id}/playbyplay.html  
data/raw/{year}/{mmdd}/{game_id}/box.html  
data/raw/{year}/{mmdd}/{game_id}/roster.html  


## Structured JSON 方針

1試合につき、用途別 JSON を `data/structured/{year}/{mmdd}/{game_id}/` に保存する。

例

```text
game.json
events.json
batting_lines.json
pitching_lines.json
roster.json
linescore.json
sources.json
unresolved.json
```


### 原則

- 取れる情報は削らない
- 後で使うか不明でも保持する
- source URL は必ず持つ


## DB方針

主テーブル

- games
- events
- batting_lines
- pitching_lines
- roster_entries


### 最重要

events テーブル

目的

「いつ」「どこで」「何回に」「誰が」「何をしたか」を引けること


## 差分更新

Done:

- R2 を正規保存先にした raw / structured 管理
- 本番更新ジョブの運用

流れ

1. 新しい試合一覧取得
2. 未取得game_id抽出
3. 4ページ取得
4. JSON生成
5. DB追加


## 禁止事項

- URL総当たり
- 生HTMLを保存しない
- playbyplayを無視
- JSONを省略して直接DB投入
- source URLを持たない


## AI実装ルール

- 試合IDは一覧から取得
- 1試合4ページ取得
- 生HTML保存
- JSONは網羅
- events中心
- DBは再生成可能

## BIS Current Sources

最新所属・チーム一覧・年度別チーム成績・個人打撃/投手/守備成績・月別試合結果は `npb.jp/bis` を補助 source として取得する。

保存先:

```text
data/raw/bis/{year}/rst_{team_id}.html
data/raw/bis/{year}/index_{team_id}.html
data/raw/bis/{year}/yearly_{team_id}.html
data/raw/bis/{year}/idb1_{team_id}.html
data/raw/bis/{year}/idp1_{team_id}.html
data/raw/bis/{year}/idf1_{team_id}.html
data/raw/bis/{year}/results_{team_id}_{mm}.html
data/structured/bis/{year}/bis-current.json
```

実装済み URL:

- `https://npb.jp/bis/teams/rst_{team_id}.html`
- `https://npb.jp/bis/teams/index_{team_id}.html`
- `https://npb.jp/bis/teams/yearly_{team_id}.html`
- `https://npb.jp/bis/{year}/stats/idb1_{team_id}.html`
- `https://npb.jp/bis/{year}/stats/idp1_{team_id}.html`
- `https://npb.jp/bis/{year}/stats/idf1_{team_id}.html`
- `https://npb.jp/bis/teams/results_{team_id}_{mm}.html`

月別結果は存在しない月があるため、404 はその月だけ skip する。
