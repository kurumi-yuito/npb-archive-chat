# 2026-09-13 Release Ready実行 — D1日次read上限で中断

## 2026-09-16 継続実行の停止記録

この節が現行の停止地点であり、上記9/13時点の数・Versionは履歴として保持する。

### 再現・証拠・影響

- HEAD `890e256255d39c99e65ca2aca33e86b01f815d10` = `origin/main`。直近Worker Version `78695420-ff58-4ed4-8c72-162583afb30d`。
- Acceptance全47ターンを現行Versionで実行。ログ: `data/logs/qa-acceptance-all-1789563338839.json`。17/47 Pass、30 Fail、0未実行。HTTP 500:30、HTTP 503:0、summary null:30。Acceptance 47/47条件未達のため、182件QAは未開始。
- 最新Versionへ単発の質問を送信し、HTTP 500を再現。Wrangler tailはVersion `78695420-ff58-4ed4-8c72-162583afb30d`、Worker outcome `ok`、Worker exceptions 0を記録。エラー本文は `D1_ERROR: Your account has exceeded D1's free tier daily row read limit. Upgrade to a paid plan or wait until tomorrow (midnight UTC) to continue.`。stackでは `consumeChatUsageToken` のD1 readの後、`getServerDatabase` / `resolveStructuredQueryPlayer` へ進んだD1 readが同じ上限で拒否され、外部500となった。D1 audit headerもfailedなmeta operationとrepository metadata SELECTを記録。
- 同じWorker tailでPlanner OpenAI呼び出しがHTTP 429、`type=insufficient_quota`、`code=credit_balance_exhausted`、`You have no credits remaining` と記録された。HTTP 500の直接原因として確認できたのはD1拒否。OpenAIの利用可能枠も別途復旧が必要。
- 失敗30件はD1拒否で成績等の回答前に失敗。その他のAcceptanceターンも今回のPassだけでRelease Readyとは判定しない。Planner Contract違反、Validation失敗の全47/182件値は取得不能で未確認。DB操作・同期なし。

### コードによる回避不能性と修正可能性

- Cloudflareが明示した解消条件はアカウントの有料枠への変更、または翌日UTC 00:00のfree-tier日次read reset。Cloudflare内側で集計されたアカウントread制限の拒否であり、Workersコード、再デプロイ、retryでは上限状態を解除できない。D1が拒否している間は、ローカルDBやキャッシュを使って本番正本に対する182ケースを証明することはできず、回答を捏造・期待値変更・DB変更する回避も禁止されている。
- `apps/web/server/services/chat-query-parser-stub.ts` の所属質問分類漏れをB17で特定し、`890e25625` で「今どこの球団」語形を認識する修正を実施。parserテスト33/33、typecheck Pass、最新Versionへdeploy済み。D1 read停止とOpenAI credit枯渇はアカウント側状態なので、このコード修正は外部制限を解除しない。
- 以前のrows_read監査と証明は再実施していない。確認済みのプラン/日次リセット以外に、コードからD1アカウント上限を解除できる方法はない。回避策は Cloudflare D1の有効枠確保（有料枠または日次reset）とOpenAI API credit追加の両方。

### 再開条件、再開コマンド、停止地点、残作業

- 再開条件: ①D1がfree-tier日次read reset後に本番検索を受け付ける（次のreset候補: 2026-09-17 00:00 UTC）、またはCloudflareアカウントの有効枠が管理者により確保されること。②OpenAI APIのcreditを追加し、PlannerがHTTP 429なしで応答すること。単発の正常応答だけで182件分の枠があるとは見なさず、Acceptance後に本番QAを1回開始する。
- 再開コマンド（D1とOpenAIの利用可能性確認後、リポジトリrootから）:

```bash
wrangler deployments list --config wrangler.toml
NPB_ACCEPTANCE_BASE_URL=https://npb-chat.dom9th-works.com node scripts/qa-acceptance.mjs --continue-on-failure
# Acceptance 47/47 Passを確認してから、指示どおり182件を最初から1回だけ実行
QA_ALL=1 QA_DISABLE_HTTP_RETRIES=1 node scripts/qa-prod-unanswered.mjs docs/qa-test-cases.md
```

- 停止地点: 現行VersionのAcceptance全47件完走ログ保存後、HTTP 500が続くことを現行Version tailで再現・確認した。Acceptanceは17/47 Passで終了。182件QAはAcceptanceが未通過のため開始していない。
- 残作業: 外部D1枠とOpenAI credit復旧後、Acceptanceを現行HEAD/Deploy Versionで47/47にする。Failは原因単位で修正し、その場合Acceptance全件を再実施。Pass後に182件を一度実行し、Failは根本修正後182件全件を再実行。現行本番とQA正を182件照合し、HTTP500/503=0、summary null=0、Planner Contract違反=0、Validation失敗=0、main=origin/main、worktree clean、current HEAD=Deploy Versionを最後に検証する。

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
