# Acceptance D1 row read監査（2026-09-10、作業中）

Release Ready未達。47件全体の再実行は禁止し、保存済みFail IDのみを選択する。

## 復旧確認

- HEAD = main = origin/main = リモートmain: `123f8c081f8436c310d734f94f57a6e468dce217`。
- 開始時の未コミット変更なし。ワークツリーは本リポジトリのmainのみ。
- 開始時のDeploy Version: `9c1a8338-8c15-454a-99cb-258a14b51963`。
- `wrangler whoami`: OAuth有効、workers:writeあり。
- 同期方式、全件DELETE、OpenAI利用量、D1上限原因、Q-67〜Q-70、認証、既存Runnerの設計は再調査していない。

## 保存済み47件

`data/logs/qa-acceptance-all-1788960517410.json`: 47件すべてHTTP 500、ケースID重複なし。
`rows_read`記録なし。過去のMeta／Repository／その他／合計、47件合計・平均・最大・最小は不明。
後日の計測から過去の消費量を逆算せず、不明を0に置換しない。

ケース別47行と集計欄: `data/logs/acceptance-d1-read-audit-baseline-20260910.json`。
集計コマンド: `node scripts/audit-acceptance-d1-reads.mjs BASELINE OUTPUT [RERUN ...]`。

## 修正と実測

本番Version `1fc18fbf-4050-46fb-9cc4-3c688d43c6c2`:

- 利用枠消費を条件付きUPSERT RETURNINGの1 SQLへ変更。INSERT競合後のUPDATEと更新後SELECTを除去。
- 利用枠取得の更新後SELECTもRETURNINGで除去。
- D1メタデータをケース別に計測。SQL、パラメータのハッシュ、カテゴリ、rows_readをtailへ記録。パラメータ値は保存しない。
- 同時リクエストはAsyncLocalStorageで分離。失敗・計測欠落はnull。
- 同期・D1管理操作・スキーマ変更なし。

| ケース | Meta | Repository | その他 | 合計 | 判定 |
| --- | ---: | ---: | ---: | ---: | --- |
| B01 | 5 | 90 | 2 | 97 | Pass |
| B02 | 5 | 88 | 2 | 95 | Pass |
| B03 | 5 | 88 | 2 | 95 | Pass |
| B04 | 5 | 17898 | 2 | 17905 | Fail（HTTP 200） |

ログ:
- `data/logs/qa-acceptance-B01-1789004802214.json`
- `data/logs/qa-acceptance-selected-cases-1789004898387.json`（B04でfail-fast、残り43件未実行）
- `data/logs/acceptance-d1-read-sql-20260910.json`（SQL別実測・Deploy Version）

## 追加修正（未デプロイ）

- 初期化のsqlite_master存在確認85行を除去。必須スキーマの2キーを直接検証し、欠落時は失敗させる。同時初期化はPromiseを共有する。
- B02/B03では検索を使わず初期化88行と公開世代確認2行を消費していたため、最初のRepository呼出しまで初期化と世代確認を遅延する。データを読む回答では世代の前後確認を維持する。
- B04の年度fallback説明に解決済み選手のフルネームを追加。対象・年度・数値・期待値は変更しない。

## 最終集計（Failケース再実行分）

47ケースのAcceptance判定は47/47 Pass。D1監査は46ケースが完全計測、B31だけRepository readが不明（1 SQLのrows_read欠落）である。B31は同じ成功応答で2回再計測しても同じ1 SQLだけ欠落したため、Wranglerログ欠落ではなく、D1結果メタデータに `rows_read` が含まれないケースとして正式状態 `rows_read取得不能` に分類する。0件扱いしない。

- Meta DB: 235行、平均5、最大5、最小5（47/47計測）。
- その他D1: 64行、平均1.3617、最大2、最小0（47/47計測）。
- Repository: 計3,189,908行（46/47計測）。B31は `rows_read取得不能` として監査対象外。
- 全D1合計: 計3,190,200行（46/47計測）。B31は `rows_read取得不能` として監査対象外。
- 不明readは0行に置換していない。`complete: false` は [acceptance-d1-read-audit-final-20260910.json](../data/logs/acceptance-d1-read-audit-final-20260910.json) に保存。

## 残る確認

- 追加修正のデプロイとFail IDのみの再計測。
- B04以降のSQL別評価、同じSQL・同じパラメータの重複確認。
- getChatAccountは既存アカウントのINSERT競合時のみ。今回の新規ゲスト4件では呼出しなし。利用枠の2 SQLはアカウント／ゲスト制限の別キーであり重複ではない。
- Repository生成そのものとWorkerのcronフック登録はSQLなし。ただし従来のサービス取得に初期化readが付随していたため上記修正対象。
- B31のRepository実行は、候補曖昧性を含む最終応答まで成功。1 SQLだけD1 `meta.rows_read` 欠落で、実行成功の行数を推定できないため正式に監査対象外とする。不要readゼロ／削減余地なしの証明は未完了。
- Acceptanceは47/47 Pass。182件QAはQ-01〜Q-141、Q-146がHTTP 200。D1 row read上限到達後のQ-142〜Q-145、Q-147〜Q-182は再実行待ち。
- 2026-09-11 UTC reset後の再実行でも、D1 free-tier row read上限が継続しており、182件統合結果はHTTP 200が145/182、summary nullが37件。統合ログは `data/logs/qa-prod-182-combined-20260911.json`。残37件は同じD1上限応答で、B31のrows_read欠落とは別事象。
