# AI Query Architecture

## 現状構成

このリポジトリのチャット入口は `apps/web/server/api/chat.post.ts` の `POST /api/chat` である。

今回の変更後の実処理フローは次の通り。

1. `chat.post.ts` が request body、認証、usage、D1/SQLite、LLM設定を解決する。
2. `chat-service.ts` がユースケースのオーケストレーターとして動く。
3. `chat-planner.ts` が LLM parser と normalizer を呼び、Planner出力を `chat-query-plan.ts` の schema で検証する。
4. `chat-service.ts` 内の既存QA安定化 rewrite 群を通し、最終 structured query を再度 Planner出力として検証する。
5. `player-resolution.ts` が選手名を player_id に解決する。
6. `chat-executor.ts` が data_requirements、使用repository、player_id必須状態を実行メタデータとして組み立てる。
7. 実際の repository 呼び出しは、段階移管中のため `chat-service.ts` 内の既存分岐で行う。
8. `chat-answer-generator.ts` が Answer Generator の入口として `chat-answer-formatter.ts` を呼び、Executorが取得した results と sources だけから deterministic answer を作る。
9. 条件を満たす場合のみ `chat-final-answer-llm.ts` が DB結果、deterministic answer、sources、history を入力に最終文面を生成する。

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

## 正規化層の扱い

`chat-query-normalizer.ts` は以下に限定する。

- NFKC
- 空白除去
- チーム名 alias 正規化
- 選手名表記の基本正規化
- 守備位置 alias 正規化
- ホームラン表記の検索語正規化

「最近」「調子」「どう」「今シーズン」「通算」などの意味解釈は、productionでは LLM Planner 側で行う。

## production stub 方針

`chat-query-parser-stub.ts` は dev/test fixture として残す。

`chat-query-parser.ts` は `allowFallback: false` の場合、LLM未設定・LLM失敗・rate limit・timeout のいずれでも stub parser を呼ばず `ChatQueryParserUnavailableError` を投げる。`wrangler.toml` の production vars は `CHAT_ALLOW_HEURISTIC_FALLBACK = "false"` であるため、production経路では自然文意味解釈を stub に戻さない。

## LLMエラー対応

今回の変更で `chat-query-llm.ts` と `chat-final-answer-llm.ts` は HTTP 429 時に `Retry-After` を尊重し、1秒、3秒、7秒、15秒を基本に再試行する。再試行後も失敗した場合は、OpenAI互換APIのエラー本文を500文字まで保持して `ChatQueryLlmHttpError` / `ChatFinalAnswerLlmHttpError` に含める。

`scripts/qa-prod-unanswered.mjs` は本番QA時に HTTP 429 / 503 / `chat_llm_unavailable` を再試行し、ケース間隔の既定値を7秒にした。これにより一時的なrate limitはQA上で即Failにしない。

2026-06-19のリファクタ後本番QAでは、OpenAI APIが `insufficient_quota` を返したためQ-01単発でもPlannerが完了しなかった。これはproductionでstub fallbackを無効化した状態の外部LLM quotaエラーであり、quota復旧または有効なAPIキー更新が必要である。

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

QA判定要件は以下を原文どおり維持する。

テストは本番環境で実行し「QAテストケース一覧 - 現行本番との差分」のQA正を模範解答として、日付差による情報更新（日付や打率など）と改行や句読点などの差のみを許容し、現行本番の回答の文意はQA正と揃うことを正常とすること。

QA runner `scripts/qa-prod-unanswered.mjs` は今回、以下をログに追加した。

- intent
- entities
- player_id
- target_period
- data_requirements
- repositories

これにより、選手系QAで解決された player_id と repository選択を記録できる。
