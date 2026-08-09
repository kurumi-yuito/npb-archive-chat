# QAテストケース一覧 - 現行本番との差分

## Phase 17 Planner Contract修正後の本番QA（中断）

- 対象デプロイVersion ID: `60b49f3d-7c89-411f-9d83-1afe88084700`
- 修正コミット: `bcab62e77 fix: enforce planner intent contract`
- 実行ログ: [data/logs/qa-prod-run/qa-prod-1786288155295](../data/logs/qa-prod-run/qa-prod-1786288155295)
- Q-01〜Q-22: HTTP 200、summary非null
- Q-23: OpenAI上流がHTTP 429 `insufficient_quota` / `credit_balance_exhausted`を4回連続で返し、Worker公開応答はHTTP 503、summary null
- Q-24以降: 同じ上流quota障害の継続を確認したため未実行
- 判定: **Release Blocked**。全176件完走、HTTP 500/503 0件、summary null 0件の条件を満たしていない。

### Phase 17 Planner Contract違反の本番証拠

- 観測Version ID: `ca5610e2-53cb-477b-b303-e7c71a09a0ac`
- Q-96 `調べなおして`: Planner生JSONは `{"intent":"correction_request","filters":{}}`
- Q-108 `違う、その前のやつ`: Planner生JSONは `{"intent":"correction_request","filters":{}}`
- Schema validation: `invalid_union_discriminator`、対象pathは `intent`
- 原因: Promptがfollow-up分類名をplanning layerで出力するよう誘導する一方、structured query Schemaとrepository routingはquery intentだけを許可していた。
- 修正: follow-up分類をapplication metadataへ分離し、Prompt・Schema intent定義・OpenAI JSON Schema enumを整合させた。Planner生JSON、OpenAI request ID、validation issuesをWorkerログへ残すようにした。

### Phase 17旧VersionのHTTP 500分類

Version `71d40637-de01-4cc7-92e9-f0d2051da554` の全176件run
[data/logs/qa-prod-1786245739484.json](../data/logs/qa-prod-1786245739484.json) でHTTP 500となった27件は、
観測Versionで全件を再実行し、27/27がHTTP 200かつsummary非null、Worker例外ログ0だった。
旧runではresponse headerとWorker tailを保存していなかったため例外種別は断定せず、分類は
`その他（旧runの詳細ログ欠落）`、再現性は`断続再現`とする。

`Q-01`, `Q-02`, `Q-04`, `Q-05`, `Q-06`, `Q-08`, `Q-09`, `Q-11`,
`Q-12`, `Q-13`, `Q-15`, `Q-16`, `Q-17`, `Q-19`, `Q-20`, `Q-47`,
`Q-52`, `Q-53`, `Q-60`, `Q-63`, `Q-66`, `Q-69`, `Q-76`, `Q-81`,
`Q-82`, `Q-83`, `Q-114`

Q-96とQ-108は`Validation例外`かつ`恒常再現`（旧Version・観測Versionで各4回連続再現）とする。

- 現行ケース数: 176
- 対象デプロイVersion ID: `5968cd0a-bffa-4a39-987d-8e8519611676`
- QA実行モード: 通常本番API（LLM parser 実行）
- 判定: **Release Blocked**
- 許容外差分件数: 50/176
- 本番チャットAPI方式では検証できないケース: 17/176

## Phase 16.2 本番全件QA

- 全件ログ: [data/logs/qa-prod-1786162803350.json](../data/logs/qa-prod-1786162803350.json)
- Q-117再実行ログ: [data/logs/qa-prod-1786164493928.json](../data/logs/qa-prod-1786164493928.json)
- 実行日時: 2026-08-08 JST
- 実行対象: 176件
- 初回走査: HTTP 200 175件、接続`ETIMEDOUT` 1件、HTTP 4xx 0件、HTTP 5xx 0件
- Q-117再実行後: 実効HTTP 200 176/176、HTTP 500 0件、HTTP 503 0件、summary null 0件
- OpenAI/LLM失敗: 0件
- Parser例外: 0件
- Repository例外: 0件
- timeout: Worker応答timeout 0件。Q-117でWorker到達前の接続`ETIMEDOUT`が1件あり、再実行は成功
- retry/re-execution: 1件（Q-117）
- Planner Validation不整合: 1件（Q-100、`off_topic_with_referenced_context` / `off_topic_with_inherited_context`）
- Formatter禁止表現（`確認できる`、`対象試合`、`対象記録`、`対象データ`、
  `イベント集計`、`最新1試合`）: 0件

### 許容外差分

QA正と現行本番回答を、バッチ更新による同一文脈内の数値変化と日数変化を許容して比較した。
次の50件は、intent、対象、期間、絞り込み、曖昧性、会話文脈、または必要情報が一致しない。

`Q-01`, `Q-02`, `Q-05`, `Q-06`, `Q-08`, `Q-15`, `Q-20`, `Q-22`,
`Q-25`, `Q-26`, `Q-27`, `Q-28`, `Q-29`, `Q-31`, `Q-37`, `Q-50`,
`Q-52`, `Q-54`, `Q-59`, `Q-61`, `Q-63`, `Q-71`, `Q-72`, `Q-77`,
`Q-79`, `Q-83`, `Q-84`, `Q-87`, `Q-88`, `Q-89`, `Q-91`, `Q-92`,
`Q-93`, `Q-96`, `Q-99`, `Q-100`, `Q-101`, `Q-102`, `Q-103`, `Q-106`,
`Q-110`, `Q-111`, `Q-112`, `Q-113`, `Q-115`, `Q-116`, `Q-117`, `Q-157`,
`Q-161`, `Q-163`

主な回帰・不一致:

- 複合・比較・年別・スタメン・球場/対戦カード条件の一部がPlanner filtersまたは回答で失われる。
- 同姓の`田中`を確認なしに一人へ確定するなど、Entity曖昧性がQA正と一致しない。
- Q-83の藤浪本塁打検索が0件となり、その会話を参照するFollow-upも連鎖して不一致となる。
- Q-100はPlanner Validationが自己矛盾を検出し、回答を生成できていない。
- Q-117は東京ドーム・DeNA対巨人という条件を維持せず、同日の別3試合を返す。
- Q-157「藤浪の直近の内容」はoff_topicにはならないが、QA正の直近5登板ではなく1登板へ限定される。
- Q-161は近本の直近出場内容ではなく、情報量のないイベント1件回答になる。

### 本番チャットAPI方式では検証できないケース

次の17件は自然文チャット回答を評価するケースではなく、UI、内部Contract、認証、
利用制限、Runtime Config、キャッシュを別の操作で検証するケースである。今回の全件ランナーは
文字列を`POST /api/chat`へ送るため、期待仕様を検証できない。

`Q-141`, `Q-144`, `Q-145`, `Q-146`, `Q-164`, `Q-165`, `Q-166`, `Q-167`,
`Q-168`, `Q-169`, `Q-170`, `Q-171`, `Q-172`, `Q-173`, `Q-174`, `Q-175`, `Q-176`

このうちローカル自動テストでは利用制限、token recovery、JST境界、refund、guest guard、
usage cache、UI layoutなどの個別テストは成功した。ただし`pnpm test`全体ではSchema fixtureが
Phase 16のusage Contractへ追随しておらず、394件成功、1件失敗、65件skipとなった。
失敗は`packages/schemas/src/index.test.ts`のchat response fixtureで、`timezone`、`asOf`、
`refillIntervalMinutes`、`nextTokenAt`、`fullAt`の不足・不一致である。

## 最新デプロイの本番確認

- Phase 16.1最終Version `5968cd0a-bffa-4a39-987d-8e8519611676` では、
  2026-08-08 12:57 JSTの本番spot checkで通常チャットがHTTP 200となり、
  Plannerと最終回答の両方が成功した。OpenAI起因でQAを実行不能な状態ではない。
- Phase 16追加後の171件を包含する、Phase 16.1追加後の現行176件について、
  Phase 16.2で復帰後の全件QAを完走した。結果は上記Phase 16.2本番全件QAを参照する。
- quota障害で途中中断した記録は、下記Phase 15/15.1の164件構成時の実行であり、
  Phase 16の全171件を実行して途中失敗した記録ではない。

- Phase 15.1最終Version `ad8faea3-c798-4a7e-aa47-13451e1a4d09` は、意味未確定時のService policyを含む。
  - 最新確認ログ: [data/logs/qa-prod-1786113369419.json](../data/logs/qa-prod-1786113369419.json)
  - Q-73: OpenAI API `429 insufficient_quota`が4回連続、Worker HTTP 503、summary null。

- Phase 15.1 Version `70f412ba-9e6d-4c2f-b00e-72e432174b7c` の通常本番QAを開始した。
  - 実行ログ: [data/logs/qa-prod-run/qa-prod-1786112333764](../data/logs/qa-prod-run/qa-prod-1786112333764)
  - Q-73の初回からOpenAI API `429 insufficient_quota`（`credit_balance_exhausted`）が4回連続し、WorkerはHTTP 503、summary null。
  - 同一障害が継続しているため、全164件の再試行は中断した。

- Phase 15 Version `8481baaa-2075-4d57-b15b-9a38b77f8676` の通常本番QAを開始した。
  - 実行ログ: [data/logs/qa-prod-run/qa-prod-1785760029125](../data/logs/qa-prod-run/qa-prod-1785760029125)
  - Q-73 `test`: HTTP 200 / Planner `off_topic` / summary非null
  - Q-74 `今日の天気を教えてください`: HTTP 200 / Planner `off_topic` / summary非null
  - Q-75以降: OpenAI API `429 insufficient_quota`（`credit_balance_exhausted`）を4回連続で確認し、WorkerはHTTP 503。全件実行を中断した。
- Phase 15追加QA Q-159〜Q-164は、外部LLMクレジット枯渇のため未実行。QA正のA欄は運用ルールどおり `[未実行]` のままとした。

- Phase 14追加QAは、Version `ddbe97c8-a587-4ea4-aec1-2e4034274da7` で本番確認済み。
  - ログ: [data/logs/qa-prod-1785656668358.json](../data/logs/qa-prod-1785656668358.json)
  - Q-157 `藤浪の直近の内容`: HTTP 200 / `search_pitching` / player_id `41045137` / repository `searchPitchingLines` / summary非null / off_topicなし
  - Q-158 `藤浪の直近試合の内容は`: HTTP 200 / `search_pitching` / `recent:true` / result_count 1 / player_id `41045137` / summary非null
- Version `ddbe97c8-a587-4ea4-aec1-2e4034274da7` の全158件通常本番QA:
  - ログ: [data/logs/qa-prod-1785658027437.json](../data/logs/qa-prod-1785658027437.json)
  - HTTP 200: 158/158
  - HTTP 500/503: 0/0
  - summary null: 0
  - HTTP retry: 0
  - formatter禁止表現: 評価コメント由来で4件残存（Q-95/Q-100/Q-105/Q-120）
- 上記4件を `chat-opinion-generator.ts` で修正し、Version `210db027-8076-4ff9-b7f3-016e4dbc8031` へデプロイした。
- 最新Versionの全件再QAは開始したが、途中から本番OpenAI APIが `429 insufficient_quota`（`credit_balance_exhausted`）を返し、Worker応答がHTTP 503になったため中断した。
- 最新の失敗確認ログ: [data/logs/qa-prod-1785685655212.json](../data/logs/qa-prod-1785685655212.json)

## 完了に必要な再確認

許容外差分50件とSchema fixtureのテスト失敗を修正し、最新Versionへ再デプロイした後に
現行全176件の通常本番QAを再実行する。また、チャットAPIでは検証できない17件は、
各ケースに対応する本番UI/API/認証/Runtime Config向けの実行方式で確認する。
