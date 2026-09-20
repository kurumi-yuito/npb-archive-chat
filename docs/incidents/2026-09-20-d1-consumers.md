# 2026-09-20 UTC D1 rows_read消費主体の特定

## 結論

**今日500万rowsを超えて消費した主体は、このCodexセッションから私が実行した本番Acceptance（`scripts/qa-acceptance.mjs`）である。** 過去の上限エラーから推定した結論ではない。47件の実APIログに記録された既知rows_readだけで **18,253,121 rows**、Cloudflareの同じ03:13–03:14 UTCのDB集計は **19,113,987 rows**。同時間帯の本番Worker実行数も17+30=47件。GitHub ActionsやCronが500万rowsを消費した証拠は得られなかった。

調査期間は2026-09-20 00:00 UTCから取得時点まで。GraphQLはUTC日付を明示し、Dashboard既定の直近24時間とは区別した。今回の調査で本番チャット再実行、SQL実行、DB変更、同期は行っていない。

## 利用主体別

| 利用主体 | rows_read | UTC実行時刻 | 実行元／Worker | Workflow／Cron | Repository |
| --- | ---: | --- | --- | --- | --- |
| このセッションの本番Acceptance 47件 | **18,253,121以上を直接確認**。同時間帯Cloudflare集計19,113,987 | 03:13–03:14 | この作業環境のNode → 本番 `/api/chat` → `npb-archive-chat-web` | なし | `kurumi-yuito/npb-archive-chat`、`scripts/qa-acceptance.mjs` |
| 本番QA Q-01/Q-02 | 集計3（Q-01=3、Q-02=0）。拒否された処理の消費を0と補完しない | 03:23–03:24 | 同環境 → `npb-archive-chat-web` | なし | `scripts/qa-prod-unanswered.mjs` |
| このセッションの再開確認1件 | 集計3 | 03:27 | 同環境のcurl → `npb-archive-chat-web` | なし | 再開確認の一時コマンド |
| このセッションの証拠取得2件 | 集計6（各3） | 03:31–03:32 | 同環境のcurl → `npb-archive-chat-web` | なし | `data/logs/d1-proof-20260920/` |
| GitHub Actions | 今日への帰属は0件実行。D1行数の実行ログなし | 今日・前日作成のrun=0 | 確認可能な11リポジトリ | `Daily NPB Scores Update`を含む | 下記API原本 |
| 本番Cron／Scheduled Worker | 該当時間帯のD1利用量レコードなし。Cronイベントの実行ログは未取得 | 設定01:05/07:05/13:05。01時台のWorkerリクエストはあるが種別不明 | `npb-archive-chat-web` | `5 1,7,13 * * *`。コードはGitHub dispatchのみ | `cloudflare-cron-update-dispatch.ts` |
| 検証用Worker | 今日のWorker実行レコードなし | 記録なし | `npb-archive-chat-web-normalized`、本番と同じD1 binding | Cron設定は空 | 同リポジトリ |
| 他Worker | 直接D1 bindingなし。本日のD1集計に対応する消費は観測なし | 24リクエストを記録 | `pennant-calculator` | Cron設定は空 | `kurumi-yuito/pennant-calculator` |
| Pages 6サービス | D1 bindingなし。直接D1利用は観測なし | 対象設定取得時点 | dom9th-works、npb-central-schedule、share、npb-diary、extract-illegal-resale、mc-favsong | 該当なし | 同名リポジトリ |
| Dashboard／管理ツール・外部APIクライアント | 個別行数は取得不能。今回500万rows超を説明するためにこれらの利用を仮定する必要はない | 管理監査APIは403 | 監査証跡の権限不足 | 不明 | 不明 |

「記録なし」は無条件の0保証ではない。D1集計には呼出主体・IP・User-Agentのdimensionがなく、Worker集計にもHTTPとscheduledの判別項目がない。管理ツールや外部クライアントが存在しないという証明には使わない。一方、このセッションの既知実測だけで500万超が成立するため、主消費主体の特定はこれらの未取得ログに依存しない。

## Cloudflare Dashboardと同じ集計データ

[公式ドキュメント](https://developers.cloudflare.com/d1/observability/metrics-analytics/)でDashboardと同じデータセットと説明されているGraphQL Analyticsを取得した。Dashboard画面を目視したとは扱わない。

| DB | 本日rows_read | rows_written |
| --- | ---: | ---: |
| npb-sync-atomic-verification | レコードなし | レコードなし |
| npb-archive-chat-normalized | 19113756 | 0 |
| npb-archive-chat-meta | 243 | 294 |
| npb-archive-chat-import | レコードなし | レコードなし |

合計 **19,113,999 rows_read**。03:13以前のD1利用量レコードはなく、03:13に3,913,187 rows、03:14に15,200,800 rows、後続4分に合計12 rows。時刻・DBごとの全行は `db-minute-rows.csv`。

## Acceptanceとの突合と限界

- API応答ログの既知値: Repository 18,252,826 + Meta 235 + その他60 = **18,253,121**。
- B31ではRepository行数がnullであり、0として扱っていない。全47件の明細を `acceptance-case-rows.csv` に保存した。
- CloudflareのAcceptance時間帯19,113,987と既知値との差は860,866 rows。この差を「B31の行数」と割り当てる直接証拠はないため、未照合差分として残す。
- SQL Insightsの43行合計は12,314,539 rowsで、DB集計19,113,999と一致していない。Insightsだけで全件完全再構成や消費ゼロの証明をしない。
- 03:13の本番Worker17件と03:14の30件はAcceptance47件と一致。他のD1 bindingを持つWorkerの実行レコードはない。時刻・件数の一致は補強証拠であり、全リクエストのRay ID照合ではない。
- このセッションで実行したことはツール実行履歴と保存済みAPIログが直接の根拠。送信元IPを過去の全47件について取得できたわけではない。

## 消費したRepository／SQL

SQL Insightsで特に大きい2つは `packages/db/src/repository/aggregate-repository.ts` の正規化打撃集計SQLと構造が一致する。`event_facts`から長打を集計し`batting_line_facts`へJOINするクエリである。

| SQLの区別 | UTC | Insights実行回数 | rows_read |
| --- | --- | ---: | ---: |
| 選手名・球団条件、安打順 | 2026-09-20T03:14:00Z | 4 | 6,895,058 |
| 球団条件、本塁打順 | 2026-09-20T03:14:00Z | 3 | 5,225,148 |

これらのSQL全文は `top-sql.json` に保存した。Acceptanceログの最大ケースはMT05-Turn3=3,447,540、MT02-Turn2=3,446,871、MT02-Turn3=1,741,725 rows。ケースごとの質問・応答・filtersは元のAcceptance JSONにある。Insightsにはバインドパラメータがないため、SQL実行群と各ケースを完全な1対1として対応付けてはいない。

## 不要な利用の確認・対応

- 今日のWorkflow重複実行は見つからず、停止・無効化する実行はなかった。GitHub scheduleとWorker Cronの二つの起動設定は存在するが、今日重複消費したという証拠はない。設定の存在だけで必要な更新を無効化していない。
- `d1-read-audit.ts`は既存クエリの応答metaを記録し、追加SELECTを発行しない。デバッグ計測コード自体による追加D1消費は確認しなかった。
- ローカルの管理用スクリプトにremote D1実行経路は存在するが、存在だけで今日の実行主体と断定しない。今回の調査では起動していない。
- Acceptanceは依頼された47件を一巡したものであり、不要な二重起動を示すログはない。負荷が大きいことと不要な実行であることを分ける。今回の47件消費を隠す目的でテストを削除したり期待値を変えたりしていない。
- 原因確認のためのチャット再送は今回行わず、保存ログと観測APIのみ使用した。修正対象となる不要なバックグラウンド実行は確認できなかったため、アプリ・DB・Cronの変更は行っていない。高負荷SQLの改善完了を主張するものではない。

## 取得できなかった観測と証拠原本

OAuthを正規loginで復旧した後、DB利用量・binding・Cronは取得成功。管理監査APIの新旧両方とWorkers Observability telemetryは403（code 10000）。この権限不足をD1上限とは混同していない。Workers settingsのobservabilityはnull、過去ログ保存が利用可能とは確認できなかった。

- `data/logs/d1-consumers-20260920/d1-daily.json`: 今日UTCのDB別集計
- `data/logs/d1-consumers-20260920/analytics-combined.json`: 分別DB、SQL、Worker集計
- `data/logs/d1-consumers-20260920/attribution.json`: 帰属結果・未照合差分
- `data/logs/d1-consumers-20260920/acceptance-case-rows.csv`: 47件明細
- `data/logs/d1-consumers-20260920/db-minute-rows.csv`: 時間帯とDB別行数
- `data/logs/d1-consumers-20260920/top-sql.json`: SQL別全文・行数
- `data/logs/d1-consumers-20260920/binding-inventory-safe.json`: WorkerのD1参照先
- `data/logs/d1-consumers-20260920/github-all-repos-runs.json`: 11リポジトリの今日・前日run検索
- `data/logs/d1-consumers-20260920/audit-logs-v2.json`, `audit-legacy.json`, `telemetry.json`: 権限不足の実応答
- `data/logs/qa-acceptance-all-1789874092331.json`: このセッションが実行したAcceptance実応答原本

今回の消費主体調査は上記の範囲で完了。完全リリースは未完了であり、Acceptance再実行・QA182件・独立ブラックボックス47件・同一HEAD/Deploy・API異常ゼロの条件は別途残っている。
