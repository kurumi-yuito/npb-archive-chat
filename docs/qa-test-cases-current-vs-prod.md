# QAテストケース一覧 - 現行本番との差分

- 現行ケース数: 164
- 対象デプロイVersion ID: `8481baaa-2075-4d57-b15b-9a38b77f8676`
- QA実行モード: 通常本番API（LLM parser 実行）
- 判定: Blocked（OpenAI API credit balance exhausted）
- 許容外差分件数: 未確定（最新デプロイの全件QA未完走）

## 最新デプロイの本番確認

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

OpenAI APIのクレジット復旧後、Version `8481baaa-2075-4d57-b15b-9a38b77f8676` に対して全164件の通常本番QAを再実行する。HTTP 200かつsummary非nullが164/164、HTTP 500/503が0、禁止表現が0であることを確認してから、許容外差分件数を確定する。
