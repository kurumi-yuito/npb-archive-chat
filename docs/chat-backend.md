# Chat Backend

## 目的

`/api/chat` は自然文の質問を受け取り、DB検索を主役として回答候補を返す。

LLM は `structured query` 生成と、DB 結果に基づく最終回答文の drafting に使う。production ではどちらも必須で、env 未設定時は 503 にする。DB 検索の直前に正規化レイヤーと player resolution を通す。


## 基本方針

- chat backend の主役は DB 検索
- AI は structured query 生成と最終回答 drafting を補助できるが、DB結果外の断定は禁止する
- final answer LLM の env が無い場合、または LLM が失敗した場合は deterministic formatter を使う
- `structured query` は `packages/schemas` の schema で validate する
- team / player 系 filter は DB 検索直前に辞書ベースで正規化する
- player_id が特定できる場合は `*_player_id` filter を追加し、同姓候補が複数ある場合は検索を実行しない
- source URLs は常に返す
- 既存の `/api/search/events`, `/api/search/games`, `/api/search/pitching` は維持する

## 実装状況

Done:

- `POST /api/chat` の最小検索 route
- multi-year query layer（SQLite 年別 DB を横断）
- player_id resolution
- ambiguity / not_found handling（曖昧または未発見なら DB 検索を実行しない）
- `sourceUrl` / `source_snapshots` 由来の source URL 返却
- DB-backed eval 20件（`apps/web/tests/chat-eval.test.ts`）
- `search_events` の複数結果一覧 formatter（20件まで表示し `remaining_count` を返す）
- `player_affiliation` intent と BIS current roster 優先の所属チーム回答
- production signed-cookie identity / dev header fallback
- `chat_accounts` による account/profile/subscription 永続化
- usage check at API boundary
- final answer LLM（ambiguous / not_found / limit / 0件では呼ばない）

運用で確認する項目:

- production deployment / monitoring / operations


## 入出力

### Request

`POST /api/chat`

```json
{
  "message": "2025-08-15の8回裏、team=ロッテ batter_name=山村 の代打イベントを教えて"
}
```


### Response

HTTP 2xxの成功レスポンスは必須fieldとして`"error": false`を返す。field省略は許可しない。HTTP 4xx/5xxの公開エラーは`"error": true`を返すため、利用者は`error`をliteral discriminantとして安全に分岐できる。ServiceとFormatterが扱う内部`ChatResponseCore`にはHTTP成否を持たせず、Route境界で`error: false`を付与する。

```json
{
  "error": false,
  "message": "2025-08-15の山村の代打イベントを教えて",
  "structured_query": {
    "intent": "search_events",
    "filters": {}
  },
  "answer": {},
  "usage": {},
  "results": {},
  "sources": []
}
```

成功レスポンスは次を返す。

- `error`: 常に`false`。必須
- `message`: 入力原文
- `structured_query`: schema validate 済みの検索意図
- `answer.summary`: 回答文のドラフト
- `answer.result_count`: ヒット件数
- `answer.remaining_count`: `search_events` で 20 件を超える場合の省略件数
- `answer.source_urls`: 参照元 URL 一覧
- `answer.resolved_player`: player resolution の結果。`ambiguous` / `not_found` のときも候補または停止理由を含む
- `results`: DB検索結果
- `sources`: `source_snapshots` 由来の `game_id` / `source_key` / `source_url`

正式なSchemaとTypeScript型は`packages/schemas/src/index.ts`の`chatResponseSchema` / `ChatResponse`を正とする。成功・失敗のunionは`chatApiResponseSchema` / `ChatApiResponse`で表現する。


## Structured Query

intent は次の種類。

- `search_events`
- `search_games`
- `search_batting`
- `search_pitching`
- `search_roster`
- `player_affiliation`
- `game_detail`
- `aggregate_batting`
- `aggregate_pitching`
- `aggregate_events`

`filters` は既存の検索 schema をそのまま利用する。

- `search_events` -> `searchEventsFiltersSchema`
- `search_games` -> `searchGamesFiltersSchema`
- `search_batting` -> `searchBattingLinesFiltersSchema`
- `search_pitching` -> `searchPitchingLinesFiltersSchema`
- `search_roster` -> `searchRosterEntriesFiltersSchema`
- `game_detail` -> `gameDetailFiltersSchema`
- `aggregate_*` -> 各 aggregate filter schema


## 処理フロー

### 1. Route

`apps/web/server/api/chat.post.ts`

- HTTP body を受ける
- `chatRequestSchema` で validate する
- API boundary で identity / plan / usage を処理する
- dev は header fallback、production は signed cookie を使う
- `getServerDatabase` で usage 用 DB を開く
- `getServerChatQueryService` で single-year または multi-year query service を作る
- `createChatService` に処理を委譲する


### 2. Structured Query 生成

`apps/web/server/services/chat-query-parser.ts`

- まず LLM に自然文から `structured query` を生成させる
- LLM には intent / filter 仕様と正規化ルールだけを渡す
- 返ってきた JSON を `chatStructuredQuerySchema` で validate する
- production では LLM 未設定/失敗/validate 失敗時に 503 を返す
- dev/test だけ `CHAT_ALLOW_HEURISTIC_FALLBACK=true` で stub parser に fallback する

注意:

- fallback parser は dev/test の構成確認用で、production の自然文理解として使わない
- LLM を使っても DB 検索以降の構造は変えない
- 詳細は `docs/llm-query-parser.md` を参照


### 3. DB Search

`apps/web/server/services/chat-service.ts`

- `structured_query` を正規化レイヤーに通す
- `player-resolution.ts` で `batter_name` / `pitcher_name` / `runner_name` / `player_name` を候補検索し、単一候補なら `*_player_id` を追加する
- 候補が複数または 0 件なら検索を実行せず、候補提示または not_found summary を返す
- `structured_query.intent` に応じて既存 repository を呼ぶ
- `search_events` -> `searchEvents`
- `search_games` -> `searchGames`
- `search_batting` -> `searchBattingLines`
- `search_pitching` -> `searchPitchingLines`
- `search_roster` -> `searchRosterEntries`
- `player_affiliation` -> `searchPlayerAffiliations`
- `game_detail` -> `searchGameDetails`
- `aggregate_*` -> aggregate repository

ここでは chat backend が SQL を持たず、既存の DB 検索関数を再利用する。

所属チーム質問（`所属チーム`, `どこのチーム`, `所属`, `在籍`, `チームは`）は `player_affiliation` として扱い、`search_events` には落とさない。優先順位は次。

1. `current_team_roster`（BIS `rst_{team_id}.html`）
2. scores `roster_entries`
3. scores `batting_lines`
4. scores `pitching_lines`
5. scores `events`

BIS current に根拠がある場合、回答の `source` は `https://npb.jp/bis/teams/rst_{team_id}.html` を出す。


### 4. Source URLs 収集

`packages/db/src/repository/source-snapshots-repository.ts`

- 検索結果から `game_id` を集約する
- `source_snapshots` から source URL を引く
- `answer.source_urls` と `sources` に詰める

これにより、回答文の根拠 URL を必ず返せる。


### 5. Answer Formatting

`apps/web/server/services/chat-answer-formatter.ts`

- ヒット件数
- `search_events` の場合は最大 20 件の自然文一覧
- 20 件超過時の省略件数
- source URL 一覧

を使って回答文を返す。DB結果に無い情報は補完しない。

final answer LLM が設定されている場合は、formatter の結果、DB results、source URLs だけを渡して日本語回答を drafting する。次の場合は LLM を呼ばない。

- ambiguous
- not_found
- usage limit
- 0件
- `remaining_count` がある limit 表示

LLM が失敗した場合は deterministic formatter の summary を返す。DB結果に無い情報は補完しない。


## ディレクトリ対応

| パス | 役割 |
|------|------|
| `apps/web/server/api/chat.post.ts` | chat route |
| `apps/web/server/services/chat-service.ts` | chat 用ユースケース |
| `apps/web/server/services/chat-query-parser.ts` | LLM query parser orchestration |
| `apps/web/server/services/chat-query-llm.ts` | LLM client |
| `apps/web/server/services/chat-query-parser-stub.ts` | fallback heuristic parser |
| `apps/web/server/services/chat-query-parser-prompt.ts` | fixed prompts |
| `apps/web/server/services/chat-query-normalizer.ts` | DB 検索直前の query normalization |
| `apps/web/server/services/player-resolution.ts` | player_id resolution / ambiguity handling |
| `apps/web/server/services/chat-answer-formatter.ts` | deterministic answer formatter |
| `apps/web/server/services/chat-final-answer-llm.ts` | DB結果ベースの final answer LLM client |
| `apps/web/server/utils/parse-chat-request.ts` | body validation |
| `apps/web/server/utils/parse-chat-identity.ts` | dev header fallback / production signed-cookie identity |
| `packages/db/src/multi-year-query-service.ts` | 年別 SQLite を横断する query layer |
| `packages/schemas/src/index.ts` | chat request / structured query / response schema |
| `packages/db/src/repository/source-snapshots-repository.ts` | source URL 取得 |
| `packages/db/src/repository/player-affiliation-repository.ts` | 所属チーム検索。BIS current roster を優先 |


## テスト観点

- chat request body が schema validate される
- 自然文から structured query が生成される
- chat service が DB検索結果を返す
- source URLs を返す
- ambiguous / not_found では検索しない
- `search_events` の複数結果を一覧表示する
- LLM 成功時に structured query が生成される
- production で LLM validate 失敗時に 503 へ倒す
- team / player 名の表記ゆれが DB 検索前に正規化される


## 次に人間が確認すべき点

- prompt に持たせる表記ゆれ辞書をどこまで増やすか
- `search_games` にカード名や球場条件を追加するか
- chat response の result payload をどこまでそのまま返すか
- source URL を全件返すか、`playbyplay` など優先順位を付けるか
- dev/test fallback の利用をどう監視するか
- query normalization 辞書をどの粒度で増やすか
