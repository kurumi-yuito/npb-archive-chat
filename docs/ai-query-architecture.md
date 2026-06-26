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

## Player identity architecture roadmap

### 現状アーキテクチャ

- `player_profiles` は canonical master に近いが、current stats / historical rows / events / repository で `player_id` と `URL` と `name` の扱いが揃っていない
- structured ingest は future ingest で URL を保持できるようになったが、historical 側は未補完が残る
- Planner / Executor は `player_id` 必須化へ寄せているが、DB 実体はまだ完全に一枚岩ではない

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
- Historical backfill: 過去欠損を埋める別責務。今回は未実装
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

- Historical backfill は今回まだ実装しない
- 先に future ingest を安定させ、その後に historical backfill を別フェーズで扱う

## Future ingest 検証メモ

- 対象コミット: `d8baadb5c`
- サンプル試合: `r20250815b-l-17`
- structured ingest と raw ingest を一時 SQLite に流し、URL 列の non-null 件数を比較した
- `batting_lines.player_url` / `pitching_lines.pitcher_url` / `roster_entries.player_url` / `events.batter_url` / `events.pitcher_url` / `events.runner_url` は structured と raw で同件数だった
- future ingest では URL 保持が確認できた
- historical backfill は未対応のまま

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

- 本番QA実行日時: 2026-06-26T06:13:37.218Z
- 対象デプロイVersion ID: `cbb2a58c-740d-455a-9046-a59d5a3b569f`
- 実行ログ: `data/logs/qa-prod-1782453010913.json`
- 結果: Pass 108 / Fail 0 / Blocked 0
- 追加メモ: Q-58 の `inningsPitched` 不整合は `chat-query-llm.ts` / `chat-query-parser.ts` / `packages/schemas/src/index.ts` で修正済み
