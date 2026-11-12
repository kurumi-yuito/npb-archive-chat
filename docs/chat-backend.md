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
# 比較対象の検索範囲

Query Contractの `requested_output[].scope` は、対象ごとに異なる年度・球団などの意味条件を保持する。共通条件だけで表現できる従来の質問はscopeなしとし、LLMの構造化出力でnullだった場合も既存の意味契約へ正規化する。

scopeを持つ各出力は、entities・temporal_scope・competition_scope・predicates・aggregation・grouping・ordering・completeness・context_references・unresolved_constraintsの全条件を保持する。選手IDの解決も検索も各scopeで実行し、未解決条件を消さない。ルートの契約は回答へ残し、実行した各条件は `execution_metadata.scoped_query_contracts` で確認できる。同じAPI要求で独立scopeは最大8件、解析・意味照合の再試行上限は従来どおり。

候補契約を生成する前に、明示された名前、原因説明の要求有無、比較期間の種類を、質問と履歴だけから別の構造化要求で抽出する。候補をこの抽出へ渡さない。シーズン累計の前年同時期比較では、各年度の年初から対応する基準日までを保持し、単日や当月だけへ縮めない。独立抽出は1回、候補の生成と意味照合は最大2組で、API呼び出しは最大5回、全体で30秒を上限とする。各呼び出しはAPI境界の利用量カウンターへ含める。

比較の結論は、同じ指標について各対象のID・年度・球団・一軍/二軍区分に対応する数値が確認できた場合だけ作る。指定年度がなく別年度を補足した結果や、一部対象の未確認を隠して結論を出さない。

## 収録対象外の要求を含む契約

未来の日程・登板予定は `game_schedule`、監督・コーチの情報は `staff_information` として保持する。これらは収録対象外の案内を返し、過去の試合結果や選手辞書の検索で代替しない。単独のスタッフ質問は既存の同名policyでも扱う。受入仕様B03/B15/B23に基づく実装であり、日程・スタッフ情報を収録済みとする仕様変更ではない。

対応する過去成績と非対応の要求が混在する場合も、各出力の条件を保持して回答を組み合わせる。非対応部分だけを理由に過去成績を捨てず、逆に取得できた成績で非対応部分へ回答したことにもしない。未来の出力に過去成績の集計条件を流用しない。

前の選手・試合を参照する質問に利用可能な先行対象がない場合は、既知の条件を残した契約と未確定条件を持つclarifyを返す。未知の対象を作り出さない。この適切な確認要求や非対応分類そのものは解析障害ではなく、503へ変換しない。上流障害や意味検証の失敗は従来どおり区別する。

## 上流サービスの利用不能

意味解析・独立reviewの上流失敗は、HTTPステータスと許可した診断code/typeだけで分類する。残高・利用枠不足、レート制限、認証失敗、その他の上流失敗を、意味契約の不一致と区別する。残高不足を契約の再生成で再試行しない。公開HTTPは503のまま、`data.reason`、`data.retryable`、`data.upstream_status`を付ける。APIキー・プロジェクト情報・上流の自由文本文は返さない。質問処理中に消費した利用枠は既存の返却経路を使う。

UIは再試行不能な503を復旧待ちと表示し、入力の変更やユーザー自身のプラン購入を解決方法として提示しない。障害再現用サーバー・ダミーキーは隔離試験だけで使い、本番設定へ含めない。

## 回帰条件を保持する実行

「成績」だけでは投打が未指定の場合、内部契約の `player_statistics` を、選手ID解決後に公式プロフィールの登録位置または一意に確認できる年間成績の種別で具体化する。名前だけで投打を推定せず、確認できない場合は質問する。履歴のない指示語だけの要求は `unresolved_request` として確認へ進め、実行対象を作らない。

公式プロフィールの通算欄と年間行が照合済みの場合に限り、球団別・年別の通算対象を年間行から算出する。投球回はアウト数で加算し、防御率などの率は分母・分子から再計算する。先発条件、球場、対戦相手、試合単位の条件を、条件のない公式年間合計で代替しない。

選手同士の直接対決はイベントの打者・投手IDで確認する。役割が未指定なら両方向を検索し、同一試合への出場を直接対決の証明には使わない。選手一覧への集約も公式IDで行い、同名を合流しない。上位候補へ統計条件を適用する際は候補全体の完全性を先に確認し、取得上限に達した不完全な一覧から順位を断定しない。

得点圏打率が取得できず通常打率を補足する場合は、元の契約と代替契約を `answer.metric_fallback` に分けて記録し、通常打率の順位と明示する。得点圏打率の閾値で対象者を絞る要求にはこの代替を行わない。外国人登録区分の根拠がない場合は、名前や出生地による推定ランキングを返さない。
