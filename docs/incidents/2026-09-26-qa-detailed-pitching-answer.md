# 2026-09-26 QA詳細投手成績の情報欠落

## 状態

B31候補復旧の製品コードHEAD `7a7ce97862b92b4a6ef41b6a777f2d39f60b8cb3` / Deploy `2846efc9-1c56-464c-8caf-88c2aea87874` で、B31単独Pass、Acceptance47/47 Pass。その後のQAで、HTTP200かつPlanner validation=validでもQA正の必要情報を満たさない、別種の障害を確認した。「新しい種類の障害」の場合は停止してよいという今回の指示に基づき、B31以外の機能修正へ拡大せず停止する。Release Ready・完全リリースは未達。

## Q-02の証拠

質問: 藤浪は2026年のここまでの二軍での成績はどうですか？防御率や登板数など詳しく教えてください

QA正:

```text
2026年の藤浪晋太郎投手は、横浜DeNAの二軍で5試合に登板しています。シーズン成績行では投球回14、被安打11、与四球7、奪三振19、失点5、自責点3、防御率1.93です。個別試合では2026年5月22日の登板が直近で、5回8奪三振、失点1、自責点1でした。
```

本番回答全文:

```text
投手集計の上位結果です。
1位: 藤浪 晋太郎（横浜DeNAベイスターズ） 登板9、セーブ0、投球回36.00、奪三振36、自責点9、防御率2.25、WHIP0.00、球数0
該当数: 1件
防御率=自責点÷投球回×9、WHIP=(被安打+与四球)÷投球回で計算しています。
```

年度・選手・二軍は一致するが、個人への詳細説明ではなくランキング形式になり、QA正に含まれる被安打・与四球・失点と直近登板日・その投球内容が回答にない。これは単なる数値更新や句読点差ではない。Q-01では同じ選手の2026-07-01の二軍登板が回答されているため、直近登板情報の不存在を根拠にはしていない。

## 確認できた原因経路

`aggregate_pitching` / `level=farm` → `aggregatePitchingLines` → `results.aggregates` 1行、`results.pitching` 0行 → `formatAggregateSummary` の汎用投手ランキング。

- `apps/web/server/services/chat-answer-formatter.ts:675` 付近でaggregate intentを汎用集計表示へ渡す。
- 同ファイル `:1020` 付近で投手ランキング文を生成する。
- シーズンと直近の合成表示は `search_pitching` 分岐（`:531` 付近）にあり、今回のaggregate経路では通らない。
- 保存済み本番payloadをローカルの `formatChatAnswer` にそのまま渡し、summaryの文字列完全一致を再現。外部API・DB操作は伴わない。
- Planner contract validation自体は `valid / issues=[]`。回答の意味・必要情報の不一致とは区別する。
- B31の復旧ではPlanner・Formatterを変更していない。B31によって新規導入された不具合とは断定しない。

## 証拠ファイル

- 本番Q-02: `data/logs/qa-prod-run/qa-prod-1790390855791/Q-02.json`
- 同一選手の個別登板取得結果: 同ディレクトリ `Q-01.json`
- ローカル表示再現: `data/logs/b31-candidates-20260926/qa02-replay.json`
- B31本番一致: `data/logs/b31-candidates-20260926/b31-proof.json`
- Acceptance: `data/logs/b31-candidates-20260926/acceptance/qa-acceptance-all-1790390843945.json`
- Worker Version/SQL成功確認: `data/logs/b31-candidates-20260926/version-evidence.json`

## 停止地点と残作業

QAはQ-01〜Q-12の12件で応答保存済み、すべてHTTP200・summary非null。Q-02は意味・形式Fail、残る11件はPass未確定。Q-13実行中に停止し応答未保存、Q-14〜Q-182は未実行。QA未完了170件。独立ブラックボックス47件は未開始。

今後は単独投手の二軍詳細成績に必要な個別登板の取得・説明経路を修正し、対象確認後にAcceptance47件→QA182件（Q-01から）→独立ブラックボックス47件→Release Ready→完全リリースを行う。QA期待値・DBデータ・静的な選手マッピングは変更しない。

```bash
env QA_ALL=1 QA_DISABLE_HTTP_RETRIES=1 node scripts/qa-prod-unanswered.mjs docs/qa-test-cases.md --cases Q-02
env NPB_ACCEPTANCE_OUTPUT_DIR=data/logs/release-next/acceptance node scripts/qa-acceptance.mjs --continue-on-failure
env QA_ALL=1 QA_DISABLE_HTTP_RETRIES=1 node scripts/qa-prod-unanswered.mjs docs/qa-test-cases.md
env NPB_ACCEPTANCE_OUTPUT_DIR=data/logs/release-next/blackbox node scripts/qa-acceptance.mjs --continue-on-failure
```
