# 2Version限定の差分比較（2026-09-24）

## 比較対象

- ① HEAD `48ff8f985` / Deploy `d5cc67a1-2963-47a6-84f0-e06131a45400`: Acceptance47/47、公式集計2,400,899 rows_read。
- ② HEAD `b61d0e569` / Deploy `ab2524da-8ef7-463a-a85d-2631c92562ae`: 保存済みAcceptance17/47。
- 調査中にCloudflare照会、D1制限再調査、利用量再監査、本番Acceptance全件実行は行っていない。

## 結論

この差分によるrows_read増加は再現していない。変更された2系統とも同一スナップショットで全走査ステップ・VM命令数が減少した。17/47という合否件数は読み取り量の増加を示す測定値ではないため、増加原因が見つかったとは扱わない。根拠のないロールバックやSQL変更は行っていない。

## 保存済み結果の時系列

QA37件の保存時刻は2026-09-23 12:49:57〜12:56:01 UTC。最初のB31変更コミット `dccc739a5` は12:58:21 UTC、通算集計変更 `b61d0e569` は14:33:14 UTC。QAで大きな読み取りが観測されたのは追加変更コミット・デプロイより前である。既存ログとGit時刻の照合だけを行い、利用量の再監査は行っていない。したがって、先行するQA消費を後続Versionの変更による再増加として扱うことはできない。

## B31以外の差分を含む全変更

| ファイル | 変更 |
| --- | --- |
| `player-repository.ts` | B31を含む正規化候補検索3ソース（打撃・投球・roster）のID集合を可変個のbindからJSON1個へ変更。 |
| `aggregate-repository.ts` | 選手IDを持ち、年度・年度範囲・日付指定のない通算打撃集計だけに事前候補条件を追加。元の照合条件は維持。 |
| `player-identity-link.ts` | 上記候補条件のSQL生成関数を追加。既存の選手照合関数は変更なし。 |
| `normalized-conversion.test.ts` | 100パラメータ制限の候補検索、通算集計の同値性・INDEX検索の回帰確認を追加。 |
| `docs/acceptance-read-optimization-20260923.md` | 検証・再開手順を追記。 |
| `docs/acceptance-read-sql-plans-20260923.md` | ケース別SQL・計画資料を新規追加。 |
| `docs/qa-test-cases-current-vs-prod.md` | 実行結果を追記。 |

上記7ファイル以外に差分なし。Planner、プロンプト、routing、Formatter、Worker設定、スキーマ、INDEX定義、依存パッケージに差分なし。

## Planner出力・Repository経路

保存済み47件をIDで対応付けた。両版HTTP200の17件はintent・filters・Repository経路が一致。最新版HTTP500の30件ではintent/filters/executionMetadataが欠測しているため、「出力が変化した」「同一だった」のいずれも断定できない。ソース上のPlanner・呼び出しルーティング変更は0件。

B31のローカル再現では、旧版は252bindで失敗した後に `queryRawPlayerMentions` の互換ビュー走査へ進み、新版は3bindで `queryNormalizedPlayerMentions` の索引検索を完了する。これが実際に変更されたRepository内部経路。

通算集計の追加条件に該当する `selected_batting` + 選手ID照合のSQLは、成功版Acceptance47件の保存済みtailに0件。したがって、この追加条件を今回のAcceptance増加原因とする根拠はない。年度指定のB32は旧新版でSQL・計画・処理量が一致する。

## 同一データでのローカル比較

保存済み公開DBの `/tmp/acceptance-read-snapshot.sqlite` を両版ともreadOnlyで使用。旧版ソースはGit `48ff8f985` から抽出。B31では100bind制約を両版に同じように適用した。

| 対象 | 旧版全走査ステップ | 新版全走査ステップ | 旧版VM命令 | 新版VM命令 | 返却値 |
| --- | ---: | ---: | ---: | ---: | --- |
| B31 | 204,019 | 26,018 | 12,078,355 | 1,301,978 | 差分あり（43→39候補） |
| narrow-candidate | 11,267 | 11,267 | 454,461 | 454,461 | 一致 |
| Q08-career | 278,163 | 71,452 | 7,181,901 | 2,194,573 | 一致 |
| B32-season | 0 | 0 | 762,719 | 762,719 | 一致 |

`sqlite3_stmt_status` のFULLSCAN_STEPとVM_STEP実測であり、Cloudflareのrows_readと同一ではない。INDEX seekで読んだ行・中間表の扱いが異なるため、上記をそのままD1 rows_readとして報告しない。

読み取り量の概算モデルとして、Q-08保存済み応答の2,145,318 rows_readに全走査ステップ比とVM命令数比をそれぞれ適用すると約55万〜66万行となる。ただし同じ比率でD1計上が変化するという仮定に依存する参考値であり、保証範囲・本番実測ではない。B31は旧版の個別D1値が欠測のため同様の数値配賦は行わない。

## 変更されたINDEX利用

- B31: 旧版のエラー後 `SCAN batting_line_facts` → 新版 `SEARCH batting_line_facts USING INDEX idx_batting_name_game (player_name_id=?)`。
- 通算打撃: 旧版のfact全走査 → 新版MULTI-INDEX ORによる `idx_batting_player_game (player_id=?)` と `idx_batting_name_game (player_name_id=?)`。
- 新版通算打撃では小さな辞書をMATERIALIZEDにする読み取りが加わるが、上表の総全走査・命令数では減少。
- B32の年度指定経路は追加条件対象外で計画同一。INDEX追加・削除・定義変更は0件。

## B31の候補集合差分

旧版で実際に使われたエラー後フォールバックと新版の正常な正規化検索では、LIMIT以前の走査順・候補収集が異なり、最終候補が43→39件となる。単純なIN句の置換だけを比較した前回の2500行一致とは比較対象が異なる。候補集合が完全同一とは報告しない。B31の差分には、旧版フォールバックにだけ含まれたBIS成績9行と、LIMIT前のfact取得順が含まれる。ローカル実験ではBIS行と旧版と同じ取得順を与えると43件の候補全項目が一致した（`candidate-order-experiment.json`）。これは製品修正ではなく、差分原因を分離する実験。2026-09-26に候補集合と取得順の復旧を実施。詳細は[復旧記録](b31-candidate-restoration-20260926.md)。

## SQL・実行計画の証拠

- `data/logs/version-diff-20260924/comparison.json`: 旧新版の実SQL・引数・EXPLAIN・返却値・再現エラー。
- `data/logs/version-diff-20260924/comparison-cost.json`: 上記にSQLiteステートメント統計を付記。
- `data/logs/acceptance-read-20260923/case-sql-plans.json`: ①の保存済み本番SQL。
- 調査時点の製品ソース変更なし。Release Ready・完全リリースは未達。
