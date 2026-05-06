# Query Normalization

## 目的

`/api/chat` では LLM または fallback parser が作った `structured query` を、そのまま DB 検索へ流さない。

検索の直前に辞書ベースの正規化を挟み、表記ゆれを吸収してから既存の DB 検索を実行する。

- DB schema は変えない
- `/api/search/*` の仕様は変えない
- usage 制限は変えない
- 回答 summary はまず deterministic formatter で作る
- final answer LLM が設定されている場合だけ、DB結果と source URL に基づく drafting を追加で行う


## 適用タイミング

適用順は次の通り。

1. LLM または stub parser が `structured query` を返す
2. `chatStructuredQuerySchema` で validate する
3. `apps/web/server/services/chat-query-normalizer.ts` で正規化する
4. `player-resolution.ts` で候補検索し、単一候補なら `*_player_id` を追加する
5. ambiguous / not_found でなければ正規化済み query で DB 検索を行う
6. deterministic formatter で answer を作る
7. 条件を満たす場合だけ final answer LLM で summary を drafting する

正規化は **DB 検索の直前だけ** に適用する。


## 正規化対象フィールド

対象は intent ごとに次のフィールド。

- `team`
- `batter_name`
- `pitcher_name`
- `runner_name`
- `player_name`
- `result_text_contains`

`search_games` / `game_detail` / `search_roster` でも `team` を正規化する。


## 基本正規化

辞書を見る前に次を行う。

- `NFKC` による全角半角正規化
- 半角 / 全角スペースや改行の除去
- 長音・ダッシュ系文字の吸収
  `ｰ`, `―`, `−` などを `ー` に寄せる

この段階で `山 村`, `益　田` のような余分な空白は吸収する。


## 辞書方針

辞書はコード上では `apps/web/server/services/chat-query-normalizer.ts` に置く。

- team 辞書
  NPB 各球団の代表的な別名を、DB でヒットしやすい短い表記へ寄せる
  例: `千葉ロッテマリーンズ` -> `ロッテ`
  例: `オリックス・バッファローズ` -> `オリックス`
- player 辞書
  初期は最小限にし、明確に必要な alias だけを追加する
  例: `高松` -> `髙松`

更新方針:

- まず基本正規化で吸収できるものを増やす
- それでも DB ヒット率に影響する固有の表記ゆれだけ辞書へ追加する
- 辞書は DB の代表表記に寄せる


## 正規化できなかった場合の挙動

辞書で解決できない値でも、基本正規化後の文字列はそのまま残す。

例:

- `架空チーム` -> `架空チーム`
- ` 謎 の 選手 ` -> `謎の選手`

つまり、正規化不能でも normalization だけでは検索を止めない。ただし player resolution 対象の選手名が ambiguous / not_found になった場合は、推測検索を避けるため chat service が DB 検索を実行しない。


## テスト観点

- team の代表的別名が短い DB 表記へ寄る
- 選手名の空白や全角半角の基本揺れが吸収される
- 辞書 alias が適用される
- `/api/chat` が正規化済み query で既存検索を実行する
- ambiguous / not_found では検索を実行しない


## 次に人間が確認すべき点

- チーム表記の canonical を短縮名で固定してよいか
- player 辞書をどの程度まで手運用するか
- 球団別・年度別で揺れやすい表記をどこまで追加するか
- player 辞書と player_id resolution の責務境界をどこまで広げるか
