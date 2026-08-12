# AI Query Architecture

Planner Contractと各レイヤーの正式な責務境界は [ADR 0015](adr/0015-planner-contract-and-layer-boundaries.md) を正とする。

## 現状構成

このリポジトリのチャット入口は `apps/web/server/api/chat.post.ts` の `POST /api/chat` である。

今回の変更後の実処理フローは次の通り。

1. `chat.post.ts` と `parse-chat-request.ts` が request schema、空文字、最大長、履歴形式、認証、usageを機械的に検証する。このRequest Guardは自然文のtopicを判定しない。
2. `chat-service.ts` が、検証済みの全メッセージを例外なくPlannerへ渡す。
3. `chat-planner.ts` が LLM parser と normalizer を呼び、domain、intent、entities、filters、capabilityを含むPlanner出力を組み立てる。
4. `chat-planner-validator.ts` がPlanner出力フィールド間の自己矛盾だけを検査する。元の質問文を再解釈しない。
5. `chat-service.ts` 内の既存QA安定化 rewrite 群を通し、最終 structured query を再度 Planner出力として検証する。
6. `player-resolution.ts` が選手名を player_id に解決する。
7. `chat-executor.ts` が data_requirements、使用repository、player_id必須状態を実行メタデータとして組み立てる。
8. 実際の repository 呼び出しは、段階移管中のため `chat-service.ts` 内の既存分岐で行う。
9. `chat-answer-generator.ts` が Answer Generator の入口として `chat-answer-formatter.ts` を呼び、Executorが取得した results と sources だけから deterministic answer を作る。
10. 条件を満たす場合のみ `chat-final-answer-llm.ts` が DB結果、deterministic answer、sources、history を入力に最終文面を生成する。

## Phase 15 Topic判定境界

`isLikelyNpbTopic` によるPlanner前段のsemantic gateは廃止した。Request Guardが扱うのは、Zod schemaで決定できる空文字、4000文字上限、履歴件数・role・content形式などだけである。選手質問、チーム質問、省略、野球かどうかの判断は行わない。

Plannerは全入力について `npb` / `non_npb` / `undetermined` のdomain状態を持つ。`off_topic` はPlannerが十分に非NPBと判断した場合だけ利用者へ返す。

Planner Validationは次の矛盾だけを検出する。

- `off_topic` なのにentitiesがある
- `off_topic` なのにplayer/game target IDがある
- `off_topic` なのに会話参照または継承contextがある
- `off_topic` なのにdata requirementsがある
- `off_topic` なのにrepository routeが有効である

Validationは `valid` / `planner_output_invalid` / `planner_output_inconsistent` とissueだけを返し、Planner出力を変更しない。その後の停止・再計画・応答はService policyが決める。意味の未確定は`domain: undetermined`、Entity候補の曖昧性はResolverの`status: ambiguous`として分離する。

Phase 14の `RECENT_PLAYER_TOPIC_PATTERN` と `KNOWN_PLAYER_SHORT_STATUS_PATTERN`（および旧topic語彙）は `chat-topic-migration.ts` に移行用inventoryとして残すが、request routingからは参照しない。`chat-query-llm.ts` の楕円表現救済は移行期間中のPlanner内stabilizationとして残す。能力単位QAが安定した後、これらを順に撤去する。

## 現状の問題点

既存の自然文解釈は `chat-query-parser-stub.ts` と `chat-service.ts` にまたがっている。

特に `chat-service.ts` には以下が混在していた。

- LLM structured query の後処理
- QA安定化 rewrite
- 履歴補正
- player解決
- team補正
- repository選択
- 0件時 fallback
- 公式サイト fallback
- 回答生成制御

今回の変更では、既存QA安定化ロジックを一括削除せず、Planner / Executor / Answer Generator の境界を追加した。今後は各 rewrite の挙動をQA単位で確認しながら Planner prompt または Planner出力schemaへ移管する。

## 新構成

### Planner

実装ファイル:

- `apps/web/server/services/chat-planner.ts`
- `apps/web/server/services/chat-query-plan.ts`
- `apps/web/server/services/chat-query-parser.ts`
- `apps/web/server/services/chat-query-llm.ts`
- `apps/web/server/services/chat-query-normalizer.ts`

責務:

- ユーザー入力と会話履歴を LLM parser に渡す
- structured query を schema validate する
- DB検索直前の表記正規化を行う
- intent、entities、timeRange、dataRequirements、confidence、clarificationRequired を Planner出力として検証する

今回の段階では、既存QA安定化 rewrite はまだ `chat-service.ts` に残っている。rewrite 後の query は `buildPlannerOutput(..., legacyStabilizationApplied: true)` で再検証し、移管対象であることを明示している。

### Executor

実装ファイル:

- `apps/web/server/services/chat-executor.ts`
- `apps/web/server/services/player-resolution.ts`
- `packages/db/src/repository/*`
- `packages/db/src/multi-year-query-service.ts`

責務:

- Planner出力後の structured query のみを元に実行メタデータを作る
- data_requirements を確定する
- 使用repositoryを記録する
- player_idが必要な選手系クエリか判定する
- player_id解決済みか判定する

今回の段階では repository 呼び出し本体は `chat-service.ts` に残している。これは既存QA安定化挙動を一括削除しないためである。

### Answer Generator

実装ファイル:

- `apps/web/server/services/chat-answer-generator.ts`
- `apps/web/server/services/chat-answer-formatter.ts`
- `apps/web/server/services/chat-final-answer-llm.ts`

責務:

- Executorが取得した results、sources、playerResolution、executionMetadata だけを入力に回答を作る
- deterministic answer は `chat-answer-formatter.ts` が生成する
- final answer LLM は deterministic answer、results、sources、history のみを受け取り、NPBデータ外の補完を禁止する

## Entity解決ルール

選手系クエリでは `player-resolution.ts` を通して player_id 解決を行う。

今回の変更で、選手名を含むクエリに対して `PlayerResolution.status === "resolved"` でも `player_id` が空の場合は、曖昧な name fallback 検索へ進ませず `not_found` 扱いにするガードを `chat-service.ts` に追加した。

ただし repository 内の name fallback は即削除していない。理由は、2026年ローカルSQLite確認で以下の通り player_url / player_id 欠落が多いためである。

- `batting_lines`: 11493件中11493件で `player_url` 欠落
- `pitching_lines`: 3763件中3763件で `pitcher_url` 欠落
- `roster_entries`: 7629件中7629件で `player_url` 欠落
- `events_batter`: 11037件中11037件で `batter_url` 欠落
- `events_pitcher`: 12505件中12505件で `pitcher_url` 欠落
- `events_runner`: 244件中244件で `runner_url` 欠落
- `player_batting_stats`: 948件中948件で `player_id` 欠落
- `player_pitching_stats`: 465件中465件で `player_id` 欠落
- `current_team_roster`: 1101件中36件で `player_id` 欠落
- `player_profiles`: 1061件中0件で `player_id` 欠落

したがって現段階では、player_id解決を必須化し、解決後の補助条件として名前を使う箇所は残す。これは同姓同名の曖昧検索を許すためではなく、DB側のURL/ID欠落を補うためである。

## 複数選手比較の取り扱い

Q-109 / Q-110 で扱った複数選手比較は、単一選手質問の派生ではなく、別の実行経路として扱う。

### 方針

- 複数選手比較では、structured query を単一選手へ潰さない
- `pitcher_names` / `player_names` は配列として保持する
- `pitcher_player_ids` / `player_ids` も配列として保持する
- 投手だけで構成された曖昧な「成績」は batting ではなく pitching を優先する
- follow-up の dissatisfaction / correction_request は直前の質問を replan して再実行する

### 実装境界

- Parser prompt は複数選手比較時に配列を禁止しない
- Schema は複数名前を先頭 1 件へ coercion しない
- Executor は各選手を個別に player_id 解決し、比較用 evidence を選手ごとに保持する
- Answer layer は各選手ごとの recent evidence をまとめて比較する

### 未対応領域

打者・投手混在比較は現時点では未対応である。

例:

- `大谷翔平と東克樹` のような混在比較

この種別は、1 query 1 domain の前提では正しく扱えない。将来対応する場合は、batting / pitching の並列 evidence plan を別々に組み立て、選手ごとに domain を分けた上で比較結果を統合する必要がある。現状はその設計を採っていない。

### QA 反映

Q-109 / Q-110 を QA ケースに追加し、fixture QA では executor 以降の比較処理と follow-up 再計画の回路を確認する。fixture QA は LLM parser の品質確認ではなく、executor / repository / formatter / response schema の回帰確認として扱う。

### 追加 QA

Q-111 以降では、単一選手前提の rewrite に依存しない運用ケースを追加した。

- 複数打者の直近比較
- 3投手比較
- 年度修正 follow-up
- team replacement follow-up
- dissatisfaction / correction_request の再計画
- 一軍 / 二軍の scope clarification
- venue + matchup + result の明示

これらは Planner の structured metadata と Identity 解決、比較用 evidence の保持で扱い、Service 側の自然文 regex で意味を復元しない。

## 雑な入力・follow-up分類設計

今回の実装で、短文・雑文・訂正・疑義・再調査・比較・省略表現を Planner 側で分類するためのフィールドを追加した。対象は `chat-query-plan.ts` の Planner 出力であり、`chat-service.ts` の既存 follow-up rewrite はこの分類を参照して game_detail への寄せ先を決める。`Q-84` のような履歴参照付きの game_detail は、件数回答を出さずにそのまま試合内容説明へ寄せる。

実装ファイル:

- `apps/web/server/services/chat-query-plan.ts`
- `apps/web/server/services/chat-planner.ts`
- `apps/web/server/services/chat-service.ts`
- `apps/web/server/services/chat-answer-formatter.ts`
- `apps/web/server/services/chat-final-answer-llm.ts`
- `scripts/qa-prod-unanswered.mjs`

Planner が出す分類フィールド:

- `followUpType`
- `referencedContext`
- `targetEntity`
- `targetGameId`
- `targetPlayerId`
- `timeRange`
- `dataRequirements`
- `answerMode`

分類カテゴリは次の系統を扱う。

| followUpType | 例 | Planner の意図 |
| --- | --- | --- |
| `detail_request` | それ詳しく / もっと詳しく / その試合教えて | 直前の対象を詳述する |
| `reason_request` | なんで？ / なんで負けた？ / なんで勝てた？ | 勝敗・好不調・失点理由を説明する |
| `summary_request` | つまり？ / で結局どうなの？ | 要点を短くまとめる |
| `correction_request` | 違う、今年の話 / 通算じゃなくて最近 | 対象期間や条件を修正する |
| `doubt_request` | ちがうはずなんだけど / おかしくない？ | 前提や解釈の違和感を検知する |
| `recheck_request` | 調べなおして / もう一回見て | 同じ対象を再取得する |
| `comparison_request` | どっちが良かった？ / 去年と比べてどう？ | 比較対象を並べて差分を見る |
| `target_omission` | 藤浪どう？ / 村上今年どう？ | 主語が省略された短文を補う |
| `context_reference` | さっきの二つ目 / それ / あの試合 | 会話履歴の指示対象を拾う |
| `explanation_request` | それってどういう意味？ / もうちょい噛み砕いて / その数字どう見ればいい？ | 対象の意味や解釈を説明する |
| `scope_clarification` | 一軍の話？ / 二軍も含む？ | どの範囲の話かを確認する |
| `team_context_correction` | いや藤浪じゃなくて村上 / 当時の所属で見て | 対象選手や所属の文脈を修正する |
| `timeframe_correction` | 今年じゃなくて去年 / 通算じゃなくて直近 / 最近って何試合？ | 対象期間・集計窓を修正する |
| `evaluation_request` | これ強い？ / やばい？ / 微妙？ / で、結論は？ | 数字の良し悪しを評価する |
| `casual_followup` | これやばくない？ / 結局きついん？ | 感想混じりの追い質問を受ける |

`referencedContext` は履歴参照の実体を表す。`targetEntity` は `player` / `game` / `team` / `comparison` / `mixed` / `unknown` を使い、`targetGameId` と `targetPlayerId` は分かる範囲で埋める。`answerMode` は `detail_explanation` / `reason_explanation` / `summary_explanation` / `comparison_explanation` / `correction_explanation` / `recheck_explanation` / `contextual_answer` / `clarification_request` / `evaluation_explanation` / `direct_answer` を使う。`detail_request`・`context_reference`・`explanation_request` は game_detail なら `detail_explanation` に寄せ、`scope_clarification` は `clarification_request`、`evaluation_request` は `evaluation_explanation` に寄せる。

`chat-answer-formatter.ts` は `execution_metadata.follow_up_type` を見て、履歴ベースの game_detail では `該当する試合は1件です。` の件数前置きを省き、試合の流れ・投打・得点経過を先に出す。これが Q-84 の修正ポイントだった。

`chat-answer-formatter.ts` は `answerMode` を `execution_metadata` に載せ、`chat-final-answer-llm.ts` はその値を見て、単なる数値列挙ではなく、詳細・理由・比較・要約の出し分けを行う。`scripts/qa-prod-unanswered.mjs` は `execution_metadata` の `follow_up_type` / `referenced_context` / `target_entity` / `target_game_id` / `target_player_id` / `answer_mode` を本番QAログへ残す。

## 正規化層の扱い

`chat-query-normalizer.ts` は以下に限定する。

- NFKC
- 空白除去
- チーム名 alias 正規化
- 選手名表記の基本正規化
- 守備位置 alias 正規化
- ホームラン表記の検索語正規化

「最近」「調子」「どう」「今シーズン」「通算」などの意味解釈は、productionでは LLM Planner 側で行う。

LLMが明示入力を欠落・短縮した場合に限り、Planner内のdeterministic normalizationで元質問との機械的整合を回復する。対象は、質問本文に存在する完全な選手名、明示された年度範囲、成績種別、年別group、スタメン・守備位置などである。新しい意味や選手固有知識を付与せず、固有名やplayer_idをコードへ列挙しない。補正後のqueryは通常のPlanner schemaとValidationを通す。

LLMが自然文から付与したplayer_idは、選手名が短縮形か完全名かを問わず破棄する。player_idの確定はEntity Resolutionの専有責務である。teamも質問本文に球団名またはaliasが明示されていなければ破棄し、Entity Resolutionが入力名から再解決する。年別集計でも候補配列の先頭を採用せず、入力名と完全一致するcanonical profileだけをfast pathへ使う。

Serviceはstandalone質問のEntity Resolution直前に、最初にValidationを通過したPlannerの`targetEntity.players`と実行対象filterの人物名が一致することを境界不変条件として検査する。途中で再構築されたexecution planはこの照合の正には使わない。既存の安定化rewriteが短縮名やIDを再導入して人物名が不一致になった場合だけPlanner projectionへ戻し、IDと明示されていないteamを除去してから通常のResolverへ渡す。履歴から確定済みIDを継承するfollow-upには適用しない。この処理は人物の再分類やID推測を行わない。

Entity Resolutionは3文字以上の完全名入力を2文字以下の姓だけの候補で充足しない。年・球団filterによって姓だけの候補が1件に絞られても、同姓の別人である可能性を排除できないため`not_found`とする。完全名の解決には正規化後の完全一致profile / alias、または3文字以上で一意な最長登録名prefixを必要とする。

Repositoryがprofile / alias一致をfact rowへ関連付ける場合、候補名はfact rowの省略名ではなく一致したprofileのcanonical full nameへ投影する。Resolverは`match_kind=profile`だけを信用せず、そのcanonical nameが入力完全名と一致するか、3文字以上の登録名prefixであることも検証する。

本番profileに完全名が存在せずfact rowが姓だけを保持する既知の歴史選手は、コードレビューされたidentity alias（完全名・登録名・既知球団）でのみ補完する。Resolver入口で登録名と既知球団へ正規化して通常の候補検索・年shiftを再利用し、明示球団が既知球団と矛盾する場合はaliasを適用しない。姓の一致だけで完全名を解決する経路は設けない。

過去試合のスタメン検索では`roster_entries`を第一取得元とし、同期済みrosterがない場合は同じ試合条件のbox-score打撃行（打順・守備位置）をRepository fallbackとして使う。これはPlanner intentを変更せず、同一のhistorical roster evidenceを別の正規化済み表現から取得する処理である。

履歴内の試合を指すdetail / reason / summary系follow-upは、Plannerが確定した`referencedContext.anchor`の日付・球団から`game_detail`を構成する。ServiceやFormatterは元発話を再解釈しない。参照先を特定できない場合は`responsePolicy: clarify`で停止する。

## production stub 方針

`chat-query-parser-stub.ts` は dev/test fixture として残す。

`chat-query-parser.ts` は `allowFallback: false` の場合、LLM未設定・LLM失敗・rate limit・timeout のいずれでも stub parser を呼ばず `ChatQueryParserUnavailableError` を投げる。`wrangler.toml` の production vars は `CHAT_ALLOW_HEURISTIC_FALLBACK = "false"` であるため、production経路では自然文意味解釈を stub に戻さない。

## LLMエラー対応

今回の変更で `chat-query-llm.ts` と `chat-final-answer-llm.ts` は HTTP 429 時に `Retry-After` を尊重し、1秒、3秒、7秒、15秒を基本に再試行する。再試行後も失敗した場合は、OpenAI互換APIのエラー本文を500文字まで保持して `ChatQueryLlmHttpError` / `ChatFinalAnswerLlmHttpError` に含める。

`scripts/qa-prod-unanswered.mjs` は本番QA時に一時的な HTTP 429 / 503 / `chat_llm_unavailable` を最大3回再試行し、ケース間隔の既定値を7秒にする。ただし `insufficient_quota` / `credit_balance_exhausted` は待機で回復しないため再試行せず、そのケースをエラーとして保存する。レスポンスヘッダーと各HTTP再試行のヘッダーも保存し、Cloudflare Ray IDなど外部障害の相関情報を後から監査できるようにする。

利用回数を確認するCapability QAは、通常の自然文質問ではなく、Planner・Entity Resolution・Repositoryを実行しない文脈不足Clarificationを `/api/chat` に送る。これにより実際の利用トークン消費・返却・上限処理を通しつつ、利用回数の検証に不要なOpenAI呼び出しを発生させない。Plannerおよび最終回答LLM自身も、残高枯渇を示す429は再試行しない。一時的rate limitだけを再試行対象とする。

2026-06-19のリファクタ後本番QAでは、OpenAI APIが `insufficient_quota` を返したためQ-01単発でもPlannerが完了しなかった。これはproductionでstub fallbackを無効化した状態の外部LLM quotaエラーだった。2026-08-08にはCloudflare secret更新なしで本番WorkerのHTTP 200復帰を確認しており、現在はOpenAI起因でQAを実行不能な状態ではない。経緯と未確認事項は[障害記録](incidents/2026-08-08-openai-insufficient-quota.md)を参照する。

## 禁止事項

- PlannerはDBアクセスしない
- Executorは自然文の意味解釈をしない
- Answer GeneratorはDB結果外の情報を補完しない
- 選手系クエリは player_id 解決不能のまま曖昧な name fallback 検索へ進まない
- 本番QA失敗を期待値変更で隠さない

## 代表クエリとPlanner出力

入力:

藤浪は今シーズン二軍で何回登板してる？直近の試合ではどんな投球だった？

Planner出力の要点:

- intent: search_pitching
- entities: pitcher = 藤浪
- timeRange: year = 2026, recent = true
- dataRequirements: pitching_lines, source_snapshots
- clarificationRequired: false

入力:

牧秀悟の最近の打撃成績

Planner出力の要点:

- intent: search_batting
- entities: player = 牧秀悟
- timeRange: recent = true
- dataRequirements: batting_lines, source_snapshots
- clarificationRequired: false

## データ取得フロー

Planner structured query
→ player-resolution
→ player_id必須確認
→ repository呼び出し
→ source_snapshots取得
→ Answer Generator

現在の repository 呼び出し分岐は `chat-service.ts` に残っている。次の移管単位は intent ごとに `chat-executor.ts` へ移す。

## QA方針

QA正は `docs/qa-test-cases.md` とする。

本番との差分は `docs/qa-test-cases-current-vs-prod.md` に記録する。

Phase 18の本番QAで、同姓identityを年度で暗黙選択する経路、verified full-nameのhistorical no-id行、career matchupへの現所属注入、season成績の行一覧化、recent-form件数の縮退を再点検した。Planner adapterは明示されたseason・ranking・recent表現をstructured queryへ保持し、Entity Resolutionは年度をfact条件としてのみ扱う。検証済み登録名fallbackはexact候補が`player_id`を持たない場合にも適用するが、career matchupへ現在所属teamを追加しない。これらはPlanner/Entity/Repositoryの責務境界を変えず、各層の既存Contractを満たすための正規化である。

QA判定要件は以下を原文どおり維持する。

## Phase 3 implementation target

Phase 3 では canonical player identity persistence の設計と実装方針を定義済みである。

- migration `0009_canonical_player_identity.sql` は canonical schema を追加する前提で設計した
- `player_profiles` は canonical master として `canonical_name` / `current_team` / `active` / `metadata` を保持する設計である
- `player-identity-maintenance.ts` は future ingest と historical backfill を同じ identity artifact 生成経路で扱う設計である
- Repository は player_id-first を原則とし、name fallback は既存欠損の例外経路へ縮小する設計である
- Identity Layer は DB-backed になり、alias / source URL / team / season / affiliation context を統合して resolve する設計である
- ambiguous / unresolved は無理に埋めず、QA と運用で明示的に扱う設計である
- daily import / long-running import 中は migration / backfill / QA を実行しない運用前提である
- rollback / rerun は migration 再適用と maintenance 再実行で行い、既存データは削除しない運用前提である

### 実測確認が必要な項目

- 本番 D1 への migration 適用
- 本番 D1 上の `player_aliases` / `player_sources` 実在確認
- historical backfill 実行結果
- future ingest の本番反映確認
- DB-backed Identity Layer の本番経路確認
- production QA の最新結果反映

## Player identity architecture roadmap

### 現状アーキテクチャ

- `player_profiles` は canonical master として機能している
- current stats / historical rows / events / repository は `player_id` と `URL` と `name` の扱いを揃えた
- structured ingest / historical backfill は `player_id` / `URL` / `source_key` / alias を保持する前提で統一した
- Planner / Executor は `player_id` 必須化へ寄せ、DB 実体も canonical identity 前提で動作している

### 理想アーキテクチャ

- `player_id` を唯一の正とする
- `URL` は provenance として保持する
- `player_name` は表示・入力補助、`alias` は解決補助、`team` は文脈、`season` は時間軸として扱う
- ETL は識別子を落とさず、Repository は player_id-first、Planner は意図解釈、Executor は実行と解決を担う

### 責務分離

- ETL: parser から得た `player_id` / `URL` / `name` を保持し、future ingest で欠損を増やさない
- Repository: 保存済みデータを `player_id` 中心に引く。曖昧な name fallback は増築しない
- Planner: intent / entities / time_range / data_requirements を決める
- Executor: Planner 出力から `player_id` を解決し、Repository routing を確定する
- Historical backfill: 過去欠損を埋める別責務。`player-identity-maintenance.ts` で実装済み
- Future ingest: 今後の投入データで URL / player_id を失わせない

### migration が必要になるタイミング

- canonical identity 表を新設するとき
- alias / source provenance を正式テーブル化するとき
- facts tables を player_id 前提へ再設計するとき
- historical backfill の結果を永続化するために列追加が必要なとき

### 2030年まで保守する前提の推奨構成

- `player_profiles` を canonical master とする
- `player_aliases` と `player_sources` を必要に応じて追加する
- facts tables は `player_id` を主キー相当として保持し、URL / name は補助列にする
- Planner / Executor / QA は player_id ベースで整合させる

### ロードマップ

#### Phase 1（短期）

- 目的: future ingest で player_id / URL を落とさない
- 作業内容: parser / loader の保持経路を維持、QA で URL 保持を確認
- 完了条件: 新規 ingest で URL 欠損が増えない
- QA項目: structured/raw 比較、player_id 解決、回帰確認
- リスク: historical 欠損は残る

#### Phase 2（中期）

- 目的: canonical identity 層を強化する
- 作業内容: alias / source provenance の整理、repository の fallback 縮小
- 完了条件: player_id-first で大半の検索が回る
- QA項目: 同姓同名、所属変更、登録名変更
- リスク: 旧データとの整合コスト

#### Phase 3（長期）

- 目的: 2030年まで耐える identity 中心モデルにする
- 作業内容: historical backfill、legacy fallback の大幅縮小、identity 再集計
- 完了条件: historical / future の両方で player_id が主軸になる
- QA項目: 1選手多所属、同姓同名、cross-season lookup
- リスク: 大規模 backfill と QA 期待値の再定義

### 補足

- Historical backfill は maintenance / backfill 層で実装済み
- future ingest と historical backfill は同じ canonical identity contract に従って運用する

## Identity Layer design

### 現在 `player-resolution.ts` が担っている責務

- `batter_name` / `pitcher_name` / `runner_name` / `player_name` を structured query から探す
- 入力文字列の正規化と alias 候補生成
- team qualifier による候補絞り込み
- `player-repository.ts` / `queryService.searchPlayerCandidates()` の結果統合
- 同一人物っぽい fallback 候補の折りたたみ
- year フィルタがある場合の年シフト
- resolved した `player_id` / `*_player_id` の structured query への埋め戻し
- team 補正
- ambiguous / not_found の返却

### Identity Layer が本来担うべき責務

- `player_id` を canonical identity として扱う
- `player_name` / alias / URL / team 履歴 / season を統合して人物を識別する
- source URL を provenance として保持する
- 同姓同名、移籍、登録名変更を含めた一意性判定を行う
- Planner / Executor が使える粒度で resolve 結果を返す
- ambiguous / not_found / resolved を明示的に区別する

### `player-resolution.ts` から切り出すべき処理

- alias 展開ロジック
- team alias 正規化
- 候補収集の統合
- event / roster / stats 横断検索の方針
- year shift 判定
- team injection 判定
- fallback 候補の collapse
- structured query への書き戻し
- ambiguous / not_found の分類

### `player-repository.ts` に残すべき処理

- `player_profiles` の canonical lookup
- `player_aliases` の検索
- `player_sources` の URL / source_key lookup
- `player_id` を軸にした候補検索
- roles / teams / years の事実抽出
- 永続化済みデータの read-only retrieval

Repository に残さないもの:

- 意味解釈
- 会話文脈の解釈
- year shift の判断
- follow-up の解釈

### alias 解決フロー

```text
入力 alias
  ↓
正規化
  ↓
alias テーブル検索
  ↓
候補 player_id 集約
  ↓
曖昧なら候補提示
  ↓
単一なら player_id 確定
```

- alias は canonical identity にぶら下がる補助情報
- alias 単独を正にしない
- team history で候補を絞り込む

### source URL 解決フロー

```text
source URL
  ↓
source_type / source_key 正規化
  ↓
player_sources / facts tables 参照
  ↓
player_id 確定
```

- URL は provenance
- URL は canonical identity ではない
- source URL は player_id への逆引き補助として扱う

### team 履歴の扱い

- team は identity そのものではなく文脈
- current team と historical team intervals を分けて持つ
- 同姓同名の disambiguation に使う
- 移籍選手の候補順位付けに使う

### season をまたぐ解決方法

- 先に `player_id` を解決する
- season は属性として解釈する
- その年のデータがなければ、別人へ自動で落とさない
- 必要なら Executor / policy 側で最終在籍年や current season への寄せ方を決める

### Executor / Repository との責務分担

- Identity Layer: 誰かを決める
- Executor: どの repository をどう呼ぶか決める
- Repository: 永続化済みデータを引く

この3層を分けることで、name fallback の増築を防ぐ。

### Identity Layer の公開API案

#### `resolvePlayer()`

- 入力: `input`, `team?`, `season?`, `context?`
- 出力: `status`, `player_id`, `canonical_name`, `aliases`, `primary_team`, `team_history`, `sources`, `confidence`, `candidates`
- エラー: `IdentityLayerUnavailableError`, `IdentityResolutionTimeoutError`, `IdentitySchemaError`
- 利用箇所: Planner 後の Executor, QA ログ

#### `resolvePlayers()`

- 入力: `inputs[]`, `team?`, `season?`, `context?`
- 出力: `resolved[]`, `ambiguous[]`, `not_found[]`
- エラー: `IdentityLayerUnavailableError`, `IdentityResolutionTimeoutError`
- 利用箇所: 対戦系、比較系、複数人物同時解決

#### `resolveAlias()`

- 入力: `alias`, `season?`, `team?`
- 出力: `player_id`, `canonical_name`, `alias_type`, `confidence`, `candidate_count`
- エラー: `AliasNotFoundError`, `AliasAmbiguousError`
- 利用箇所: UI 補助、管理画面、Planner 前後補正

#### `resolveSourceUrl()`

- 入力: `source_url`, `source_type?`, `season?`
- 出力: `player_id`, `source_key`, `canonical_name`, `confidence`
- エラー: `SourceUrlNotFoundError`, `SourceUrlAmbiguousError`
- 利用箇所: ETL、provenance 検証、backfill 設計

#### `resolveHistoricalPlayer()`

- 入力: `input`, `year`, `team?`, `context?`
- 出力: `player_id`, `canonical_name`, `year_team`, `team_history`, `status`
- エラー: `HistoricalIdentityAmbiguousError`, `HistoricalIdentityNotFoundError`
- 利用箇所: historical rows / events、将来の backfill

#### `resolveCurrentPlayer()`

- 入力: `input`, `current_year`, `team?`, `context?`
- 出力: `player_id`, `canonical_name`, `current_team`, `confidence`, `sources`
- エラー: `CurrentIdentityAmbiguousError`, `CurrentIdentityNotFoundError`
- 利用箇所: current stats、現役選手検索、QA

### 最終構成図

```text
ユーザー入力
  ↓
Planner
  ↓
Identity Layer
  ├─ resolvePlayer
  ├─ resolvePlayers
  ├─ resolveAlias
  ├─ resolveSourceUrl
  ├─ resolveHistoricalPlayer
  └─ resolveCurrentPlayer
  ↓
Executor
  ↓
Repository
  ↓
D1 schema
  ↓
Answer Generator
  ↓
回答
```

補助データの位置づけ:

```text
player_id        = canonical identity
URL              = provenance
player_name      = display / input
alias            = resolution aid
team             = context / disambiguation
season           = temporal scope
```

### 補足

- Historical backfill は maintenance 実装済みだが、本番適用・完了確認は別途実測が必要である
- Identity Layer / future ingest / historical backfill は同じ player_id-first contract で揃える方針である

## Future ingest 検証メモ

- 対象コミット: `d8baadb5c`
- サンプル試合: `r20250815b-l-17`
- structured ingest と raw ingest を一時 SQLite に流し、URL 列の non-null 件数を比較した
- `batting_lines.player_url` / `pitching_lines.pitcher_url` / `roster_entries.player_url` / `events.batter_url` / `events.pitcher_url` / `events.runner_url` は structured と raw で同件数だった
- future ingest では URL / source_key / player_id 保持が確認できた
- historical backfill も maintenance により実施済み

テストは本番環境で実行し「QAテストケース一覧 - 現行本番との差分」のQA正を模範解答として、日付差による情報更新（日付や打率など）と改行や句読点などの差のみを許容し、現行本番の回答の文意はQA正と揃うことを正常とすること。

QA runner `scripts/qa-prod-unanswered.mjs` は今回、以下をログに追加した。

- intent
- entities
- player_id
- target_period
- data_requirements
- repositories

これにより、選手系QAで解決された player_id と repository選択を記録できる。

## 直近の本番QA記録

- 本番QA実行日時: 2026-07-17T11:39:41Z - 2026-07-17T12:00:03Z
- 対象デプロイVersion ID: `cafb1078-f735-4d1d-b406-51ce6f8938e9`
- 実行ログ: `data/logs/qa-prod-1784288378437.json`
- 結果: Pass 117 / Fail 0 / Blocked 0
- HTTP 500/503: 0 / 0
- summary null: 0
- D1 code 7500: 0
- 追加メモ: Phase 5 normalized production hardening 完了。詳細は [phase5-normalized-hardening-report.md](phase5-normalized-hardening-report.md) を参照。

## Phase 5 normalized production hardening

Phase 5 では production runtime の通常経路を normalized D1 に固定した。production `NPB_DB` binding は `npb-archive-chat-normalized` / `eb614de3-eb0c-4816-a7b2-8440e94093a8` のまま維持し、旧D1 `npb-archive-chat-import` / `14c099c3-03ac-4307-9704-7a770b31d108` は rollback / forensic conversion 専用として保持する。旧D1は削除しない。

runtime startup は `normalized_runtime_metadata` の `schema_version=phase5-normalized-v1` と `runtime_contract=normalized-only` を検証する。通常の repository / formatter / chat service は normalized facts を唯一のruntime contractとして扱い、legacy schema検出や旧DB fallbackを通常経路へ追加しない。

request-time live fetch は通常チャット経路から撤去した。Q-78の新人王は request-time official fetch ではなく `award_facts` から返す。Q-105のofficial pitching evidenceは daily normalized sync 後に `scripts/phase4-backfill-official-pitching-evidence.mjs` が保存済みcanonical evidence rowsとsource provenanceを再適用する。

daily update は normalized D1 ID guard、schema version guard、row count / duplicate / orphan / missing source URL guard、Q-105 latest5 guard、500MB上限に対する70%/85%/95% capacity guardを実行する。2026-07-17 の successful run `29547128720` で `Sync updated SQLite data to D1`、`Backfill official pitching evidence`、`Verify normalized D1 integrity after sync` がすべてgreenになった。

query performance確認では、`game_facts.game_date` は `idx_games_date`、`event_facts` は primary key、`pitching_line_facts.pitcher_id` は `idx_pitching_player_game` を使用することを `EXPLAIN QUERY PLAN` で確認した。normalized DB size は `275,582,976` bytes、capacity usage は約52.6%でwarning threshold未満。

## Phase 4 normalized cutover

Phase 4 では production `NPB_DB` binding を normalized D1 `npb-archive-chat-normalized` / `eb614de3-eb0c-4816-a7b2-8440e94093a8` へ切り替えた。旧D1 `npb-archive-chat-import` / `14c099c3-03ac-4307-9704-7a770b31d108` は rollback 用に保持する。

normalized repository adapter は legacy repository contract を維持し、formatter で shape を補正しない。Q-51 は multi-year aggregate batting を normalized facts から返す。Q-105 は current canonical pitching facts の最新5試合を使い、official evidence backfill と canonical player profile を normalized daily sync 後に再適用する。

Phase 5.1 で QA 専用 bypass を撤去した。route catch は特定質問文・特定選手名で成功レスポンスを返さず、OpenAI unavailable、parser invalid response、D1/schema failure、validation error、unknown internal errorを原因別に一貫して扱う。known QA recovery / hardcoded answer path / unresolved playerのresolved合成 / forbidden name fallback / request-time live fetch / legacy schema fallback は通常QAで使用禁止で、最新 production QA `data/logs/qa-prod-1784361033364.json` では使用件数0を確認した。

`env.normalized` は production normalized D1 を共有する read-only validation environment としてのみ使う。`NPB_SEARCH_DB_MODE=read_only_validation_shared_production_db` を設定し、scheduled daily update dispatch はこの mode では失敗する。通常の production は `NPB_SEARCH_DB_MODE=production` で、daily update は production normalized D1 にのみ書く。

## Phase 6 conversation capability architecture

Phase 6 では、structured query intent とは別に会話上の capability intent を導入した。`apps/web/server/services/chat-capability.ts` が Planner段階の structured query と元質問から `historical_record` / `analytical` / `opinion` / `news` / `realtime` を分類し、`repository_history` / `repository_analysis` / `analysis_then_opinion` / `external_source_guidance` へroutingする。

- `historical_record`: 過去試合、過去成績、選手比較、チーム比較、シーズン集計。従来通り Planner -> Executor -> Repository -> Formatter を通る。
- `analytical`: 傾向、最近の状態、好不調、改善点、強み弱み。現行D1 evidenceを使い、集計・比較・傾向を含む回答として扱う。
- `opinion`: 評価、期待、どう思うか。必ず repository analysis の後段で `chat-opinion-generator.ts` が deterministic answer と results を根拠に補足コメントを付ける。分析なしの opinion は生成しない。
- `news`: 公示、登録抹消、ケガ、契約、トレード、監督・選手コメント、記事。DBから推測せず、外部情報案内へroutingする。
- `realtime`: 今日の試合、現在、ライブ、スタメン、途中経過、速報。DBから生成せず、外部情報案内へroutingする。

news / realtime の Capability Failure はテンプレート化し、案内先は `SPORTS_NAVI_NPB_URL` に集約した。現時点の案内先は `https://baseball.yahoo.co.jp/npb/` で、将来ニュースソースを変更する場合はこの定数と文書を更新する。

`chat-answer-formatter.ts` と schema は `execution_metadata.question_intent`、`capability_route`、`capability_requires_analysis`、`capability_uses_repository`、`external_source_url` を返す。QAログではこれにより、各ケースが通常repository経路、analysis後opinion、または外部情報案内のどれを通ったかを確認できる。

`chat-final-answer-llm.ts` のsystem promptは、AIがプロ野球実況・解説者として自然に説明しつつ、データから導けることと導けないことを分けるよう更新した。ニュース、速報、公示、ケガ、契約、移籍、コメント、今日の試合状況は推測生成しない。意見・評価・展望は deterministic answer と results にある分析結果を根拠にする。

Phase 6 production QAでは `Q-118` から `Q-122` を追加し、5カテゴリすべてのroutingを確認した。最新production deploy `cd418821-cb45-4f02-82a4-ff23785abfb5` の通常LLM full QA `data/logs/qa-prod-1784439423359.json` は Pass 122 / Fail 0 / Blocked 0、HTTP 500/503 0 / 0、summary null 0、HTTP retry 0。

## Phase 7 answer presentation

Phase 7 では、data retrieval / planner / repository の挙動は変えず、Answer Generator と UI の表示構成だけを改善した。

序数・初記録系の本塁打質問は、検索結果件数ではなく「いつ・どの相手に・何を達成したか」をSummary先頭で返す。例: `エンカーナシオンの1号ホームランはいつ？` では `2026年7月11日の巨人戦` を先頭に出し、1回裏、竹丸投手からのレフト3ランを補足する。

generic fallback summary は `条件に一致する...がN件あります` を先頭に置かず、先頭結果または上位結果説明から始める。件数は `対象: N件` として補足へ移動する。

試合詳細はスマートフォンで読めるよう、`試合結果`、`得点経過`、`主な投手`、`主な打者`、`主な得点シーン` の見出しと箇条書きで構成する。UI側の試合詳細カードタイトルも `1件` ではなく、日付とスコア/対戦カードを表示する。

Phase 7 production QAでは `Q-123` から `Q-126` を追加し、初記録/通算1号/試合詳細レイアウト/Summary先頭の表示を確認した。最新production deploy `aec15b3c-2189-414c-875f-78dc7f9b507a` の通常LLM full QA `data/logs/qa-prod-1784459567807.json` は Pass 126 / Fail 0 / Blocked 0、HTTP 500/503 0 / 0、summary null 0、HTTP retry 0。

## Phase 8 game summary highlight generation

Phase 8 では、data retrieval / Planner / Repository / D1 schema を変更せず、試合詳細回答の先頭に試合ハイライトを追加した。

ハイライトは `chat-answer-formatter.ts` の試合詳細formatter内で生成する。入力は既存の試合詳細結果に含まれるスコア、得点推移、得点イベント、打撃成績、投手成績であり、追加のDB取得やrequest-time live fetchは行わない。

ハイライト生成では、点差、総得点、リード変動、サヨナラ、決勝打候補、長打イベント、無失点投球などを見て、2〜4文で試合の流れを要約する。本文はハイライトの後に従来の `試合結果`、`得点経過`、`主な投手`、`主な打者`、`主な得点シーン` を表示する。

Phase 8 production QAでは `Q-127` から `Q-131` を追加し、投手戦、接戦、シーソーゲーム、ワンサイドゲーム、該当なしのサヨナラ検索を確認した。最新production deploy `109121a6-0109-40ac-a8f5-7dd1f1f83902` の通常LLM full QA `data/logs/qa-prod-1784468730551.json` は Pass 131 / Fail 0 / Blocked 0、HTTP 500/503 0 / 0、summary null 0、HTTP retry 0。

## Phase 9 context-aware follow-up suggestions

Phase 9 では、回答本文の後に表示する関連質問を `answer.suggested_questions` として追加した。UIはこの配列を回答末尾の `関連する質問` セクションに表示し、各ボタンを押すとその質問をそのまま送信する。

提案はLLMの自由生成ではなく、`chat-answer-formatter.ts` のテンプレート生成で作る。入力は structured intent、capability route、resolved player、filters、実results、answer modeであり、Planner / Repository / D1 schema / data retrieval は変更していない。

提案対象は、試合詳細、試合検索、選手成績、選手比較、チーム集計、記録系である。news / realtime / off_topic / 0件回答では提案を返さない。提案文は3件までに制限し、今日、現在、ライブ、速報、スタメン、ケガ、契約、移籍、ニュースなどのリアルタイム・ニュース語を含めない。

Final Answer LLMは `suggested_questions` を生成・編集しない。最終回答summary本文には「関連する質問」や提案リストを混ぜず、UIが別枠で表示する。

Phase 9 production QAでは `Q-132` から `Q-138` を追加し、試合詳細、選手成績、比較、チーム、entity継承、news/realtime非表示、提案数3件を確認した。最新production deploy `a1fe05cc-6f8a-4fe7-b88c-9df3ba2b0169` の通常LLM full QA `data/logs/qa-prod-1784476152704.json` は Pass 138 / Fail 0 / Blocked 0、HTTP 500/503 0 / 0、summary null 0、HTTP retry 0。

## Phase 2 completion

Phase 2 は、Identity Layer 本体を DB 化する前に、既存 chat-service / planner / executor から安定して参照できる identity 境界を整える段階として完了した。

実装済み:

- Identity facade
- Alias resolution facade
- Source URL provenance API
- Current/Historical identity scope
- Scope-aware resolver selection
- Scope-aware current team correction
- Follow-up context metadata
- Controlled player stats follow-up inheritance
- Planner metadataに基づく訂正・再確認・scope follow-upのquery具体化

意図的に実施していない内容:

- Repository fallback 削除
- Historical backfill
- Migration
- `player_aliases` テーブル
- `player_sources` テーブル
- Identity Layer 本体のDB化

本番実績:

- 最新 deploy Version ID: `fe47706a-4f1c-441d-b90f-001488724ee8`
- QA結果: Pass 108 / Fail 0 / Blocked 0
- player_id resolution failures: 0
- HTTP 500: 0
- 実行ログ: `data/logs/qa-prod-1782621039223.json`

Phase 3 の前提条件:

- Identity Layer API が安定していること
- future ingest が `player_id` / URL を保持すること
- follow-up metadata が導入済みであること
- current/historical scope が導入済みであること
