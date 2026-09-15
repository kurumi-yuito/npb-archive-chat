# 2026-09-13 Release Ready実行 — D1日次read上限で中断

Release Readyではない。Acceptanceは47/47 Pass。QAは58件実行、HTTP 200:48、HTTP 500:10、HTTP 503:0、summary null:10、未実行124。HTTP 200は意味一致のPassを保証しない。Planner Contract/Validationの全件0は未確認。

## 再現・証拠・影響範囲

- 実行HEAD: `3099f0a37a19870e4e567fb81d38ae756c4e30c1`。開始時main=origin/main、clean。GitHub ls-remoteで一致確認。
- 本番Version: `ec1593d3-86ee-4a41-bbff-d84c47832287`（deployments listとWorker tailで確認）。commitタグがなくHEADとの同一性は未証明。
- Acceptanceログ: `data/logs/qa-acceptance-all-1789264838499.json`。
- QAログ: `data/logs/qa-prod-run/qa-prod-1789264926251/`。
- 保存済み全結果と件数: `data/logs/release-ready-20260913/checkpoint.json`。
- Worker例外: `data/logs/release-ready-20260913/worker-errors.json`。
- Q-48までHTTP 200。Q-49で2026-09-13 02:10:05 UTCにHTTP 500、summary null。Q-49〜Q-58で同じ外部上限が反復。最終保存はQ-58、次の未実行はQ-59。認識後にランナーを終了した。
- Workerは `Your account has exceeded D1's free tier daily row read limit` を返した。Q-49はRepositoryの勝敗集計SELECTで失敗。後続では利用者情報読み取りに加え、検索DB読み取りも失敗している。利用量更新だけの障害ではない。
- D1に依存する成績・試合回答と全件QAの確認が影響を受ける。D1不要の回答まで停止しているとは断定しない。
- OAuthは当初refresh 400だったが、正規loginで復旧済み。今回の停止原因ではない。

## コードによる回避不能の根拠・修正可能性・回避策

既存の [D1上限証明](../acceptance-d1-read-audit-20260910.md) を再利用し、上限監査やrows_read監査は再実施していない。今回の実応答も上限解除にはプラン変更またはUTC日次リセットが必要と明示している。すでに上限で拒否される検索DBの読み取りは、アプリコード変更・再デプロイ・再試行では解除できない。HTTP 500を503へ置き換えても、summary非nullとQA Pass条件を満たせない。記録のない回答の生成、ローカルDBへの置換、期待値変更は本番QAの証明にならない。

即時回避策はアカウント管理者によるD1が利用可能なプランへの変更。もう一つは日次リセット後の再開。課金変更は未実施。DB操作・同期も未実施。将来のread削減は今回禁止された再監査対象のため再調査しておらず、現時点の外部拒否を解除する方法としても成立しない。

## 再開条件・再開コマンド

D1の読み取り拒否が解除され、本番のデータ依存リクエストが正常に返ること。日次リセットの次の候補時刻は2026-09-14 00:00 UTC（09:00 JST）。その時刻になっただけで復旧や全スイート分の利用枠を保証しない。

リポジトリルートで以下を実行する。最初の単発は復旧確認であり、QA部分ログの継ぎ足しには使わない。

```bash
wrangler deployments list --config wrangler.toml
QA_DISABLE_HTTP_RETRIES=1 node scripts/qa-prod-unanswered.mjs docs/qa-test-cases.md --cases Q-49
```

続いて下記の未解決原因を修正・ローカル回帰・必要なチェック後にcommit/pushし、HEADをメッセージに明記してデプロイする。候補差分は自動適用せず再開時に検証する。

```bash
git apply --check data/logs/release-ready-20260913/candidate-fixes.patch
# 候補を検証・必要な修正とテストを完了してcommit/push後:
wrangler deploy --config wrangler.toml --message 'HEAD=<実際のコミットSHA>'
NPB_ACCEPTANCE_BASE_URL=https://npb-chat.dom9th-works.com node scripts/qa-acceptance.mjs --continue-on-failure
# Acceptance 47/47 Passを確認後、一度だけ全182件を開始:
QA_ALL=1 QA_DISABLE_HTTP_RETRIES=1 node scripts/qa-prod-unanswered.mjs docs/qa-test-cases.md
```

## 停止地点・残作業

- 182件の最初の一巡はQ-58まで保存。Q-59〜Q-182未実行。修正後は全182件を最初から一度実行し、過去ログの合成をPass根拠にしない。
- 外部エラー前にも意味・形式差分あり。少なくともQ-06（選手不明）、Q-08（過去所属条件喪失）、Q-11（最近の打撃内容がイベント件数）、Q-13（姓候補の過剰曖昧化）、Q-15/16（打率の欠落）、Q-17（シーズン比較が直近3登板へ変化）、Q-36/37（成績ではない行の集計混入）は未解決。原因ごとに修正が必要。
- 候補差分は `data/logs/release-ready-20260913/candidate-fixes.patch` に保存。姓候補の境界判定、過去所属条件保持、成績行の選択条件の3点。姓候補に関するローカルテスト33/33 Pass。残る候補は十分な回帰・本番確認前であり、修正済みとは扱わない。
- 外部制限中に未検証候補を本番へ反映せず、アプリソースは開始HEADへ戻した。差分と追加テストは上記patchに保持している。今回の記録ファイルは未コミット。
- 残作業: 原因単位の修正、ローカル回帰・必要なテスト、commit/push/deploy、対象再確認、同一HEAD/VersionでAcceptance47件とQA182件、全回答の正本比較、HTTP500/503・summary null・Planner Contract/Validation 0、main=origin/main・clean・HEAD/Deploy対応の最終確認。
