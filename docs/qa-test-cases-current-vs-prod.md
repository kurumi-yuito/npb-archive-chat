# QAテストケース一覧 - 現行本番との差分

- 現行ケース数: 176
- 対象デプロイVersion ID: `5968cd0a-bffa-4a39-987d-8e8519611676`
- QA実行モード: 通常本番API（LLM parser 実行）
- 判定: Pending（OpenAI APIは復帰済み。最新デプロイの全176件QAは未実施）
- 許容外差分件数: 未確定（最新デプロイの全件QA未実施）

## 最新デプロイの本番確認

- Phase 16.1最終Version `5968cd0a-bffa-4a39-987d-8e8519611676` では、
  2026-08-08 12:57 JSTの本番spot checkで通常チャットがHTTP 200となり、
  Plannerと最終回答の両方が成功した。OpenAI起因でQAを実行不能な状態ではない。
- Phase 16追加後の171件、およびPhase 16.1追加後の現行176件について、復帰後の全件QAは
  まだ開始していない。したがって未完走理由は現在の障害ではなく、全件再実行が未実施であるため。
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

OpenAI APIは復帰済み。Version `5968cd0a-bffa-4a39-987d-8e8519611676` に対して
現行全176件の通常本番QAを実行する。HTTP 200かつsummary非nullが176/176、
HTTP 500/503が0、禁止表現が0であることを確認してから、許容外差分件数を確定する。
実行時に新たな429/503が発生した場合は、その実行ログを根拠に状態を再判定する。
