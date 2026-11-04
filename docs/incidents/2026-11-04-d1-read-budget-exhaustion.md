# 2026-11-04 D1の日次読み取り無料枠超過

## 確認した事実

本番検索DBを共有するプレビューで、開発中のsemantic pipelineに対してAcceptance全47ターンを実行した。監査ヘッダーの合計は36,297,551行。事前に共有DBの残予算を確認せず全件評価を実行した判断が不適切だった。

記録は`data/logs/qa-acceptance-all-1793764350773.json`。上位はB26 10,014,036行、B19 7,771,469行、B04 7,590,901行、B05 7,473,619行、B17 2,403,159行。HTTP200や既存の受入パターン一致だけで、検索コストや意味の正しさが保証されないことも確認した。

その後のQ-183は`usage_unavailable`の503。HTTP監査ヘッダーでLLM呼出前のmetadata DB利用枠消費SQLがfailedであることを確認した。初期調査ではrequestを越えたD1 binding再利用を疑い、request contextへ再利用範囲を限定する修正を行ったが、**503の直接原因をこれと断定してはいけない**。

一時診断Workerから、D1の次の応答を確認した。

> Your account has exceeded D1's free tier daily row read limit.

直接SQLで同じ利用枠消費文は成功していた。診断専用のbucket行は削除済み。一時Worker`npb-archive-chat-d1-scope-probe`も削除済み。既存ユーザーの利用枠を調整して合格化していない。

Cloudflareの公式仕様ではWorkers FreeのD1読み取り枠はアカウントあたり500万行/日。検索結果の件数ではなく走査した行を数える。[料金・計測仕様](https://developers.cloudflare.com/d1/platform/pricing/)。有料契約への変更は本人操作が必要なため、無料枠維持かWorkers Paidへの変更かをユーザーへ確認中。勝手に契約変更していない。

## 実施した対応と継続作業

- 本番D1への追加SQL・本番DB共有プレビューでの広範な評価を停止した。
- 本番exportを復元したSQLiteから、隔離したローカルD1/Workerを構築した。API、実LLM、実データ検索をここで評価する。本番E2EのPassには含めない。
- 隔離環境でQ-183の独立8工程評価はPass。最初の実測は1,287,314行だった。
- 公式辞書・年度別所属・登録名aliasを索引で検索し、選手特定時の全出場記録走査を避ける共通処理を追加。Q-183のPassを維持し、81,749行へ削減した。stageの監査ログは`/tmp/npb-redesign-local-worker-dictionary.log`、独立評価は`data/logs/redesign-20261102/isolated-worker-dictionary-contract-eval.json`。
- B26は隔離環境でも7,706,433行を読んでいた。選手紹介を通算打撃・投手成績へ広げる意味解析と、古い成績検索の走査が原因。player_informationを独立した出力種類として実装中。受入パターンがPassでもこの状態でリリースしない。
- 本番評価には、同じ候補の隔離評価結果からの読み取り予算確認を必須にする。上限超過・計測不能時は未実行ケースを明示して停止する仕組みを実装する。

## データ反映との区別

公式6出典391行の追加は、原文・所属証拠・原子的反映リハーサルを経て実行済み。前後世代とR2バックアップ復元確認は`data/logs/redesign-20261102/official-publication-receipt.json`に記録した。本番アプリ配信は変更していない。このデータ反映の完了を、チャット再設計やリリースの完了と扱わない。
