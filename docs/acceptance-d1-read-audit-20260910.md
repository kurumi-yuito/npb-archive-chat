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

## 145件Pass時点の全ケース集計

全145ケースのケース別内訳は [qa-prod-145-d1-read-audit-20260911.json](../data/logs/qa-prod-145-d1-read-audit-20260911.json) に保存した。通常チャット137件は完全計測、Q-13/Q-61/Q-62/Q-120はD1結果メタデータの `rows_read` 欠落、Q-144/Q-145/Q-146/Q-168はUIまたはcapability確認でD1を呼ばない。

- Meta DB: 累計685行、145件換算平均4.7241行、完全計測ケース平均5、最大5、最小5。
- Repository: 累計33,177,130行、145件換算平均228,807.7931行、完全計測137件平均242,168.8321、最大5,949,367、最小0。
- その他D1: 累計260行、145件換算平均1.7931行、完全計測ケース平均1.8978、最大2、最小0。
- 合計: 累計33,178,075行、145件換算平均228,814.3103行、完全計測137件平均242,175.7299、最大5,949,374、最小5。
- Cloudflare Workers FreeのD1 rows read上限は5,000,000行/日。145件時点の計測累計は上限の663.5615%。[Cloudflare D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)

Q-83/Q-96/Q-08/Q-53/Q-139/Q-123/Q-124が最大readを占め、単一ケースで最大5,949,374行。これは削減余地が残る証拠であり、rows_read最小の証明には未達。

145件のAPI呼び出しは通常ケースでは1ケース1回。Q-144/Q-145/Q-146/Q-168はUI/capability確認でD1呼出しなし。Meta 5行はアカウント作成・利用枠2キーの設計上の読み書き結果で、getChatAccountの競合後SELECTは新規ゲスト経路では発生していない。Repository初期化の `sqlite_master` 走査は遅延初期化修正後の本番コードには残っていない。D1キャッシュ・初期化Promise共有により同一リクエスト群の初期化read重複も抑止している。

一方、Q-83等の5百万行級は `event_facts` の名前・結果条件を含む検索であり、現在の正規化DBに対応する検索索引がなくフルスキャンとなる。これは削減可能なreadであり、現時点で「設計上最小」とは証明できない。DB同期・D1操作禁止の運用ルールにより、今回の復旧で勝手に索引やDBを変更していない。

## 37件の到達位置

最初のD1上限応答はQ-142（Q-141はHTTP 200、12:04:21 UTC、Q-142はHTTP 503、12:04:24 UTC）。したがって開始時点ではなく、Q-01〜Q-141の実行途中で到達した。Q-142/Q-143はD1上限、Q-144/Q-145/Q-146/Q-168はD1を使わないcapability確認のため成功し、Q-147〜Q-164、Q-165〜Q-167、Q-169〜Q-182は上限到達後に失敗した。

Cloudflare公式仕様はFree rows read 5百万行/日で、上限到達後はD1 APIがエラーを返し、リセットはUTC 0時である。[Cloudflare changelog](https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/)
