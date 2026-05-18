# LLM Usage

## 目的

`/api/chat` では LLM を次の 2 箇所で使える。

- structured query 生成
- DB 結果に基づく final answer drafting

production ではどちらも必須。DB 検索は既存 repository と multi-year query layer を使い、LLM は DB 結果外の情報源として扱わない。

structured query 生成:

- LLM 出力は必ず `@npb/schemas` の `chatStructuredQuerySchema` で validate する。
- validate 失敗時や LLM 呼び出し失敗時は production では 503 にする。
- dev/test だけ `CHAT_ALLOW_HEURISTIC_FALLBACK=true` で stub parser に fallback できる。

final answer drafting:

- deterministic formatter の answer、DB results、source URLs だけを LLM に渡す。
- production では env 未設定時や LLM 呼び出し失敗時は 503 にする。
- dev/test だけ `CHAT_ALLOW_DETERMINISTIC_ANSWER_FALLBACK=true` で deterministic formatter の summary を返せる。
- ambiguous / not_found / 0件 / limit 表示では LLM を呼ばない。


## 実装位置

- `apps/web/server/services/chat-query-parser.ts`
  LLM parser と fallback parser の切り替え
- `apps/web/server/services/chat-query-llm.ts`
  OpenAI 互換 `chat/completions` 呼び出し
- `apps/web/server/services/chat-query-parser-stub.ts`
  既存 heuristic parser
- `apps/web/server/services/chat-query-parser-prompt.ts`
  固定 prompt
- `apps/web/server/services/chat-final-answer-llm.ts`
  DB 結果ベースの final answer drafting


## LLM に渡す入力情報

LLM へ渡す情報は次の最小セットに限定する。

- ユーザー自然文そのもの
- 利用可能な `intent`
  `search_events` / `search_games` / `search_batting` / `search_pitching` / `search_roster` / `game_detail` / `aggregate_batting` / `aggregate_pitching` / `aggregate_events`
- 各 `intent` で許可される `filters` 名
- 既知の正規化ルール
  日付は `YYYY-MM-DD`
  `8回表` -> `inning: 8`, `half: top`
  `8回裏` -> `inning: 8`, `half: bottom`
- 既知のイベント対応
  `代打` -> `plate_appearance` + `pinch_hitter`
  `盗塁` -> `runner_event` + `stolen_base`
  `先発投手` -> `game_note` + `starting_pitcher`
  `投手交代` -> `substitution` + `pitching_change`

DB 結果や source URLs は query 生成段階では渡さない。team / player 名の表記ゆれ吸収は LLM ではなく検索直前の正規化レイヤーで処理する。
player_id resolution と ambiguity handling も LLM ではなく DB 検索直前の service layer で処理する。


## Prompt 方針

system prompt の役割:

- structured query 生成だけに責務を絞る
- JSON オブジェクトのみ返させる
- schema にない field を出させない
- 不確実な値は埋めずに omit させる
- 人名 field には前置きや助詞を入れず、裸の人名だけを出させる

user prompt の役割:

- 元の自然文をそのまま渡す
- 許可される `filters` 一覧を再掲する
- intent 判定ルールを短く補足する
- phrase 系の人名抽出例を与える

固定文はコード上では `chat-query-parser-prompt.ts` に置く。

phrase 改善方針:

- `2025-08-15の8回裏に山村が代打` のような文では `batter_name: "山村"` を出す
- `2025-08-15の益田の投手成績` のような文では `pitcher_name: "益田"` を出す
- 人名 field に `2025-08-15の`, `8回裏に`, `ロッテの` のような前置きは含めない

explicit assignment 改善方針:

- `player_name=益田のイベントを教えて` では `player_name: "益田"` で止める
- `batter_name=山 村` や `pitcher_name=益 田` のような不自然な空白は吸収する
- `team=福岡 ソフトバンク ホークス` のような空白入り別表記も 1 値として受け、その後の正規化レイヤーに渡す


## 期待する JSON 出力例

入力:

```json
{
  "message": "2025-08-15の8回裏、ロッテの山村の代打イベントを教えて"
}
```

期待する出力:

```json
{
  "intent": "search_events",
  "filters": {
    "game_date": "2025-08-15",
    "inning": 8,
    "half": "bottom",
    "team": "ロッテ",
    "batter_name": "山村",
    "event_type": "plate_appearance",
    "event_subtype": "pinch_hitter"
  }
}
```


## Fallback 条件

`CHAT_ALLOW_HEURISTIC_FALLBACK=true` の dev/test では、次の場合に stub parser を使う。

- `CHAT_QUERY_LLM_API_KEY` または `CHAT_QUERY_LLM_MODEL` が未設定
- LLM HTTP 呼び出しが失敗
- LLM が JSON を返さない
- JSON parse に失敗
- `chatStructuredQuerySchema` validate に失敗

production では上記の状態を自然文理解の代替実装として扱わない。
fallback の責務は「ローカルの構成確認やユニットテストで完全停止を避ける」ことに限定する。


## Runtime Config

`apps/web/nuxt.config.ts` に次を定義する。

- `CHAT_QUERY_LLM_BASE_URL`
  既定値は `https://api.openai.com/v1`
- `CHAT_QUERY_LLM_API_KEY`
- `CHAT_QUERY_LLM_MODEL`

production では未設定時に 503 を返す。
dev/test では `CHAT_ALLOW_HEURISTIC_FALLBACK=true` のときだけ fallback parser で動く。

final answer LLM:

- `CHAT_ANSWER_LLM_BASE_URL`
  既定値は `https://api.openai.com/v1`
- `CHAT_ANSWER_LLM_API_KEY`
- `CHAT_ANSWER_LLM_MODEL`
- `CHAT_ALLOW_DETERMINISTIC_ANSWER_FALLBACK`

production では final answer LLM 未設定時に 503 を返す。
dev/test では `CHAT_ALLOW_DETERMINISTIC_ANSWER_FALLBACK=true` のときだけ deterministic formatter に fallback する。


## 次に人間が確認すべき点

- 実運用で使うモデル名と provider
- prompt に追加すべき NPB 固有の表記ゆれ
  例: `ロッテ` / `千葉ロッテマリーンズ`
- `search_games` に将来追加したい filter
  例: 球場、対戦カード
- fallback 発生率の観測方法
  現状は `warn` ログのみ
- LLM へ渡す将来の補助情報
  例: チーム別別名辞書を追加するかどうか
- query normalization 辞書の canonical 表記をどれに合わせるか
- phrase 系抽出を prompt だけで十分に抑えられるか
- explicit assignment の終端ルールをどこまで自然文寄りに広げるか

## 実装状況

Done:

- OpenAI 互換 chat completions を使う structured query generator
- schema validate
- fallback parser
- OpenAI 互換 chat completions を使う final answer drafting
- deterministic formatter fallback
- ambiguous / not_found / 0件 / limit で final answer LLM を呼ばない制御

運用で確認する項目:

- 外部 LLM eval の CI 固定化
- provider ごとの本番運用設定
