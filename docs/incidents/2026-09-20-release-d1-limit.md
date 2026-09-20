# 2026-09-20 完全リリース検証 — 外部D1上限で停止

完全リリース未完了。指定順の①Acceptanceは47/47 Pass、②QAは2件実行・2件HTTP 500で停止。③ブラックボックスAcceptance、④Release Ready、⑤最終Git確認、⑥完了確認には進んでいない。

## 実行対象と証拠

- 開始HEAD/main/origin/mainおよびGitHub `ls-remote` のmain: `ab107f5d736d36172cfd3ee4c2f29377701c06fd`。開始時clean。
- `wrangler deployments list` の最新100%配信Version: `90621778-f8a6-43c1-9e56-6d02f8bdd5de`。同VersionをQAのWorker tailでも確認。commit注記がないため、HEADとの対応は未証明であり一致扱いしない。
- Acceptanceログ: `data/logs/qa-acceptance-all-1789874092331.json`。47/47 Pass、HTTP500=0、HTTP503=0、summary null=0。
- 本番QAログ: `data/logs/qa-prod-run/qa-prod-1789874630876/`。Q-01、Q-02を保存。両方HTTP500、summary null。HTTP503=0、未実行180件。Pass=0。
- 集計: `data/logs/release-ready-20260920/checkpoint.json`。
- Workerの証拠: `data/logs/release-ready-20260920/worker-errors.json`。リクエストのIP・ヘッダーは除外し、Version・時刻・例外・ログを保存。
- 2026-09-20 03:23:55 UTCのQ-01で `D1_ERROR: Your account has exceeded D1's free tier daily row read limit. Upgrade to a paid plan or wait until tomorrow (midnight UTC) to continue.` を取得。利用量永続化失敗は継続処理されているが、続く検索DBのmetadata SELECTが同じ拒否で失敗。stackは `getServerDatabase` → `getServerChatQueryService` → `resolveStructuredQueryPlayer`。公開HTTP500をtailと実API応答で確認。
- Q-02でもHTTP500を再現。部分結果の継ぎ足しやFailのPass化は行っていない。Planner Contract違反・Validation失敗の全件0は未確認。

## 影響・回避不能性・回避策

D1を必要とする本番検索が外部制限で拒否され、182件QAと後続フェーズの完了を阻害している。Acceptanceが先に通過したことは、後続QAの利用枠を保証しない。

既存の[障害記録](2026-09-13-release-ready-d1-limit.md)にある上限の証明と回避策を引き継いだ。上限、rows_read、OpenAI利用量、Repository等の再監査は実施していない。今回のCloudflare実応答自体が、有料枠への変更またはUTC日次リセットを解消条件としている。アプリのコードや再デプロイからCloudflare側のアカウント上限を解除することはできない。利用量更新を無視して続行する既存処理の後でも検索DBが拒否されており、その修正の繰り返しでは解消しない。HTTP500を503へ置換しても受入条件は満たせず、ローカルDB・架空回答・期待値変更による代替も本番QAの証明にならない。

回避策は、管理者によるD1の有効利用枠確保、またはUTC 00:00の日次リセット後に再開すること。次の候補は2026-09-21 00:00 UTC（09:00 JST）。時刻到達だけで全スイート分の枠確保を保証しない。課金変更・DB変更・同期は行っていない。今回の停止原因としてOpenAI quotaは確認していないため、過去のOpenAI障害を現在の原因として断定しない。

## 再開条件・コマンド

D1の拒否が解除され、本番データ検索が成功すること。下記をリポジトリrootで実行する。HEADとDeployの対応が未証明のため、再開時は現在HEADを明記して正規経路でdeployし、同一Versionに対して①→②→③を実行する。deployはD1上限の解除策ではない。

```bash
git status --short --branch
git rev-parse HEAD origin/main
wrangler deploy --config wrangler.toml --message "HEAD=$(git rev-parse HEAD)"
wrangler deployments list --config wrangler.toml
NPB_ACCEPTANCE_BASE_URL=https://npb-chat.dom9th-works.com node scripts/qa-acceptance.mjs --continue-on-failure
# ①47/47 Pass後に②182件を最初から実行
QA_ALL=1 QA_DISABLE_HTTP_RETRIES=1 node scripts/qa-prod-unanswered.mjs docs/qa-test-cases.md
# 全回答をQA正本と比較し②182/182 Passを確認後、③を新しいログとして実行
NPB_ACCEPTANCE_BASE_URL=https://npb-chat.dom9th-works.com node scripts/qa-acceptance.mjs --continue-on-failure
```

停止地点は②Q-02保存後、次の未実行はQ-03。ただし再開時には全件を最初から実行し、過去部分ログと合成しない。残作業は同一HEAD/Deployでの①47件、②182件と正本比較、③独立のブラックボックス47件、全APIエラー・summary null・Planner Contract違反・Validation失敗ゼロ、QA差分記録更新、Release Ready判定、main=origin/main・clean・未Pushなし、最終HEAD/Deploy対応の確認。実装変更は行っておらず、今回の変更は証拠記録のみ。
