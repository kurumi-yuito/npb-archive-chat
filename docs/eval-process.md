# Eval Process

## 目的

`/api/chat` の評価は 2 種類ある。

1. `docs/eval-chat-queries.json`: 自然文から `structured_query` を作る parser + normalization 境界の評価。
2. `apps/web/tests/chat-eval.test.ts`: DB-backed の query plan / DB result / formatter 回帰テスト。曖昧名、player_id resolution、sourceUrl、formatter 一覧表示を含む 10 件。

この文書の前半は 1 の parser eval を説明する。

この評価では answer ではなく、次の 2 点を主に見る。

- parser が返した `structured_query`
- 正規化レイヤー通過後の `structured_query`


## 評価セット

評価セットは `docs/eval-chat-queries.json` に置く。

各ケースは次を持つ。

- `id`
- `message`
- `expected_raw`
  parser 直後の期待値
- `expected_normalized`
  team / player 正規化後の期待値

初期セットは parser / normalization 用ケースで、events / pitching / games を含む。
特に phrase 系ケースでは、人名 field に日付・回・助詞が食い込んでいないかを重点確認する。
explicit assignment 系では、値が説明文まで取り込まれていないか、値内空白が不自然に分断されていないかを確認する。


## 実行方法

`apps/web` で次を実行する。

```bash
pnpm eval:chat-queries
```

内部では `tests/eval-chat-queries.eval.ts` が JSON を読み込み、現在の parser と正規化レイヤーで全件評価する。

dev/test では LLM 設定が無い場合に fallback parser を使える。
production と同じ条件で評価する場合は `CHAT_ALLOW_HEURISTIC_FALLBACK=false` と `CHAT_QUERY_LLM_*` を設定して実行する。

## DB-backed chat eval

`apps/web/tests/chat-eval.test.ts` は LLM 最終回答ではなく、次を検証する。

- structured query / query plan
- player_id resolution
- ambiguous / not_found で検索しないこと
- DB result count
- `sourceUrl`
- `answer.summary` の複数結果一覧

実行:

```bash
pnpm --filter @npb/web test -- tests/chat-eval.test.ts
```

Done:

- 必須 10 ケース
- team qualifier で `batter_player_id=91895133`
- `result_count=12`
- 20 件超過 formatter の単体テスト

運用で確認する項目:

- 本番ログからの eval 自動生成
- LLM answer drafting の品質評価
- CI 上で外部 LLM を使う eval


## 判定基準

各ケースで 2 段階判定する。

- raw pass
  parser 出力が `expected_raw` と一致
- normalized pass
  正規化後の出力が `expected_normalized` と一致

どちらも一致したケースを pass とする。

Vitest の失敗差分で、どの field がずれたか確認できる。
補助的に `console.table` でケースごとの pass / fail を表示する。


## ケース更新方針

- parser を改善したら、まず実結果を確認してから期待値を更新する
- team alias や player alias を辞書に追加したら、正規化後期待値も更新する
- failure を見つけたら、回帰防止のためケースを増やす
- phrase 系改善では raw の改善を優先し、normalized はその結果を前提に確認する
- explicit assignment 改善では raw の終端判定と空白結合を優先して見る


## 次に人間が見るべき観点

- raw では失敗しても normalized で救えているか
- phrase 系で `batter_name` / `pitcher_name` / `runner_name` に前置きや助詞が混ざっていないか
- explicit assignment で `player_name=` / `batter_name=` / `pitcher_name=` / `runner_name=` が後続説明文まで飲み込んでいないか
- explicit assignment の値内空白が 1 つの名前・チームとして扱われているか
- team alias が DB の canonical 表記にちゃんと寄っているか
- player 名の空白・全角半角・異体字の扱いが十分か
- games / events / pitching の intent 判定に偏りがないか
