# Acceptance 47件 rows_read改善（作業中）

基準は2026-09-20の本番実応答。B31は欠測のため順位未確定で、0として扱わない。修正後結果・SQL・実行計画・使用INDEXは後続節へ記録する。

| 順位 | ケース | 質問 | 基準rows_read |
| ---: | --- | --- | ---: |
| 1 | MT05-Turn3 | 二人だとどっちが打率高いですか？ | 3447540 |
| 2 | MT02-Turn2 | 去年と比べて多いですか？少ないですか？ | 3446871 |
| 3 | MT02-Turn3 | 同じヤクルトの選手で他にホームラン打ってる選手いますか？ | 1741725 |
| 4 | MT05-Turn2 | じゃあ阪神の大山は？ | 1723984 |
| 5 | MT05-Turn1 | 巨人の岡本の打率は？ | 1723563 |
| 6 | B09 | 村上宗隆は最近調子いいですか | 1723375 |
| 7 | B12 | ヤクルトの村上、今季何本塁打打った? | 1723375 |
| 8 | MT02-Turn1 | 村上宗隆の今シーズンのホームラン数を教えて | 1723375 |
| 9 | B05 | 山本由伸投手の防御率を教えて | 419910 |
| 10 | B17 | 藤浪晋太郎は今どこの球団にいますか | 203698 |
| 11 | B19 | 田中将大の通算勝利数を教えてください | 198944 |
| 12 | B32 | 西武の山川、今年何本塁打打ってますか? | 43610 |
| 13 | B25 | パ・リーグの今の順位表を教えて | 18653 |
| 14 | MT01-Turn2 | セ・リーグの中では何位ですか？ | 18633 |
| 15 | B04 | 大谷翔平の今シーズンの成績を教えて | 17909 |
| 16 | B11 | 佐々木朗希の直近の登板結果と、その試合の相手先発投手を教えて | 17426 |
| 17 | MT04-Turn1 | オリックスの山岡、最近好調ですか？ | 12378 |
| 18 | B26 | 森下翔太ってどんな選手ですか? | 11360 |
| 19 | MT01-Turn3 | 去年の同じ時期と比べてどうですか？ | 7051 |
| 20 | B18 | ロッテとオリックスってどっちが強いですか | 6219 |
| 21 | B28 | 巨人 今年 何勝? | 3114 |
| 22 | B13 | 阪神さん、最近勝ってますか? | 3110 |
| 23 | B27 | 阪神タイガーズの今年の成績おしえてください | 3110 |
| 24 | MT01-Turn1 | 阪神は今シーズン何勝してますか？ | 3110 |
| 25 | B23 | 巨人vs阪神の今シーズン対戦成績と、今後の日程を教えて | 2932 |
| 26 | B06 | 今シーズン一番ホームランを打っている選手は誰ですか | 2902 |
| 27 | B07 | セ・リーグの本塁打ランキングトップ5を教えて | 2878 |
| 28 | B08 | 巨人と阪神、今シーズンどっちが打率高いですか | 2261 |
| 29 | B01 | 昨日の巨人の試合結果を教えて | 13 |
| 30 | B02 | 今日のパ・リーグの試合結果を教えて | 5 |
| 31 | B03 | 来週セ・リーグの試合予定はありますか | 5 |
| 32 | B10 | なんで今年のオリックスは去年より順位が落ちたんですか | 5 |
| 33 | B14 | この前のカード、負け越しましたっけ? | 5 |
| 34 | B15 | 中日ドラゴンズの監督は誰ですか | 5 |
| 35 | B16 | 2025年の日本シリーズどっちが勝ちましたか | 5 |
| 36 | B20 | 巨人の岡本、今年もタイトル獲れそうですか | 5 |
| 37 | B21 | さっき言ってた選手、ホームラン何本でしたっけ | 5 |
| 38 | B22 | 5月にホームランを一番打ったのは誰ですか | 5 |
| 39 | B24 | 高校野球の結果もわかりますか? | 5 |
| 40 | B29 | オリックス対ロッテの8月の対戦成績は? | 5 |
| 41 | B30 | 巨人が優勝できる可能性はどれくらいですか? | 5 |
| 42 | B33 | 二軍の試合結果もわかりますか? | 5 |
| 43 | MT03-Turn1 | 2025年6月10日の巨人対阪神の試合結果を教えて | 5 |
| 44 | MT03-Turn2 | その試合の先発ピッチャーは誰でしたか？ | 5 |
| 45 | MT03-Turn3 | じゃあその投手の今シーズン成績も教えて | 5 |
| 46 | MT04-Turn2 | 次の登板はいつですか？ | 5 |
| 不明 | B31 | 田中選手の成績を教えて | 欠測（Meta5・その他2は確認） |

## 共通原因と修正

上位8ケース（MT05-Turn3、MT02-Turn2、MT02-Turn3、MT05-Turn2、MT05-Turn1、B09、B12、MT02-Turn1）は、`aggregate-repository.ts` の `aggregateNormalizedBattingLines` を使用する。選手比較は同じ集計を2回行う。修正前の実行計画は `SCAN event_facts USING INDEX idx_events_batter_player`。player_id指定のない質問で同INDEXを強制していたため、年度・対象選手・球団の絞り込みより前に全イベントを走査していた。

質問条件を適用した打撃行を `selected_batting` に一度だけ確定し、その試合IDだけを長打集計へ渡す。event_factsの既存PRIMARY KEY `(game_id,event_index)` による `SEARCH ... (game_id=?)` へ変更した。名前条件は小さい名前辞書からIDを取得し、既存 `idx_batting_name_game` で打撃行を検索する。DB変更・INDEX追加・期待値変更・ケース別静的マッピングはなし。

## ローカル検証

本番公開候補の保存済み `data/logs/d1-sync-normalized/published.sqlite` を読み取り専用で開き、読み取り用スナップショットを `/tmp` に作成して計測した。DBへのデータ修正・同期は行っていない。本番D1そのものの実行計画とは区別する。

5種類の集計（岡本2025、大山2025、村上2025、村上2024、ヤクルト2025本塁打順）は修正前後の返却値が全項目一致。正規化変換・集計の回帰テストもPass。実行計画のテストで、イベント全走査がなく、試合ID検索と打撃名INDEX検索を使うことを検証した。速度は約1.1〜1.3秒から約26〜33msへ短縮。ただし経過時間をD1 rows_readの代用にはしない。

- SQL・parameters・EXPLAIN QUERY PLAN全文: `data/logs/acceptance-read-20260923/before.json` と `after.json`
- 読みやすいSQL・計画一覧: `data/logs/acceptance-read-20260923/sql-and-plans.md`
- 47件の基準ログ: `data/logs/qa-acceptance-all-1789874092331.json`

## 本番再実行（第1修正）

HEAD `48ff8f985`、Deploy Version `d5cc67a1-2963-47a6-84f0-e06131a45400` でAcceptance **47/47 Pass**。Cloudflare公式日次集計の実行前は記録なし、実行後は検索DB 2,400,664 + Meta DB 235 = **2,400,899 rows_read**で、500万行以内で完走した。リクエストヘッダーの既知分合計1,540,033はB31の欠測を含まないため全体値としては使用しない。

- 本番応答: `data/logs/acceptance-read-20260923/qa-acceptance-all-1790135005735.json`
- 公式集計: 同ディレクトリ `daily-before.json`、`daily-after-acceptance.json`
- 各ケースSQL・ローカルEXPLAIN: 同ディレクトリ `case-sql-plans.json`。tailにはパラメータ値がないため、この一覧のEXPLAINはNULL仮引数による構造確認。実パラメータでの確認は `before.json` / `after.json` / `other-queries-json-bind.json` と区別する。

## B31の残存SQL失敗と第2修正

「田中選手の成績を教えて」の候補検索で、250件の名前IDにroleとLIMITを加えた**252パラメータ**のSQLが本番tailでfailedとなっていた。100パラメータ上限を設定したローカルSQLiteでも同じSQLの `too many SQL variables` を再現。D1の上限は[公式limits](https://developers.cloudflare.com/d1/platform/limits/)に記載されている。本番の例外本文はcatchで記録されていないため、ローカル再現の例外を本番ログの引用とは扱わない。

名前ID集合をJSON配列1パラメータにまとめ、`IN (SELECT value FROM json_each(?))` とする。候補の省略やLIMIT変更はしない。250件の名前ID・2500件の返却行を使う実データスナップショットで、変更前後の行・順序が完全一致。パラメータ数は252から3へ減り、`SEARCH batting_line_facts USING INDEX idx_batting_name_game (player_name_id=?)` を維持した。失敗後に互換ビューの全走査へフォールバックする経路を回避する。

150件を超える同姓候補の回帰テストで、100個上限の下でも検索結果と索引利用を確認した。第2修正の本番確認と182件QAは継続中。「設計上これ以上削減不能」とは判定していない。

47件の修正後rows_read降順・SQL全文・実行計画・索引一覧は[ケース別SQL資料](acceptance-read-sql-plans-20260923.md)を参照。

## 第2修正の本番再実行とQAで見つかった追加削減

第2修正を含むHEAD `3da7b040c4df1ba7110345f711dc76f790f2d8c3` / Version `b7c2bd35-b456-401a-911d-3bf1aa17c6d0` で47件を再実行した結果は**17 Pass / 30 Fail**。HTTP500・summary nullは各30件。`json-bind/qa-acceptance-all-1790173638736.json` と `json-bind-d1-failures.json` に応答・例外本文・SQL・stack・Ray IDを保存。検索前のmetadata照会を含め、Cloudflareが日次上限で拒否しているため、B31の修正後rows_readは未計測。第1修正の47/47をこのVersionのPassとは扱わない。

第1修正後のQA 37件では、Q-08「西武時代の山川穂高の年別本塁打数」が2,145,318 rows_read。全履歴の打撃行に選手照合のOR・相関条件を適用していた。既存ID・名前ID索引で候補を先に絞り、元の年度・球団・別名有効期間・曖昧性の照合条件をそのまま適用する修正を追加した。候補条件は元条件の必要条件だけであり、候補条件だけで選手同一性を決定しない。DB変更なし。

- 通算検索に限り、名前辞書・対象プロフィール・別名を一度だけ正規化して候補化。年度・日付条件のある検索には追加の辞書読み取りを課さない。
- 実データスナップショットの12選手×通算/2025年、24条件で返却値が全項目一致。`candidate-aggregate-comparison.json`。
- Q-08は修正前後の返却値一致。`idx_batting_player_game` と `idx_batting_name_game` によるMULTI-INDEX OR検索。約654ms→126msはローカル時間であり、本番rows_read削減量ではない。
- Q-36のresult INDEX利用もローカルで試したが、残余改善の実測は未完了であり、この実験は本番コードへ反映していない。

**「設計上これ以上削減不能」という証明は得ていない。** AcceptanceのFree Tier内完走は第1修正で実測済みだが、追加修正後の47件、182件QA、独立ブラックボックス47件、Release Readyは未完了。

## 本番検証の再開条件とコマンド

必要条件はCloudflareが検索DB・Meta DBの要求を受け付けること。実際の例外が示す解除時刻は次のUTC日付境界（2026-09-24 00:00 UTC / 09:00 JST）。有料化はFree Tier目標に反し、別DBへの複製・データ変更は許可されていない。固定回答・期待値緩和・欠測を0とする処理は正しい回避策にならない。すでに消費した日次量をアプリのSQL変更で取り消すAPIはなく、metadataを省いても検索SQLが同じアカウントのD1拒否を受ける。再開時には最新HEADとDeploy Versionを確認し、Acceptanceから実行する。

```bash
wrangler whoami
wrangler deployments list --config wrangler.toml
env NPB_ACCEPTANCE_BASE_URL=https://npb-chat.dom9th-works.com NPB_ACCEPTANCE_OUTPUT_DIR=data/logs/acceptance-read-resume node scripts/qa-acceptance.mjs --continue-on-failure
# Acceptanceの47/47と全体rows_read確認後に実行
env QA_ALL=1 QA_DISABLE_HTTP_RETRIES=1 node scripts/qa-prod-unanswered.mjs docs/qa-test-cases.md
# 182件QAを正本と全件照合した後、独立した47件を実行
env NPB_ACCEPTANCE_OUTPUT_DIR=data/logs/blackbox-release-resume node scripts/qa-acceptance.mjs --continue-on-failure
```

停止地点は追加修正後の本番Acceptance検証。残作業はB31/通算集計の本番rows_read検証、最新Versionの47件全件Pass、182件QAの全件実行・意味形式比較・必要修正、独立ブラックボックス47件、Release ReadyとGit/Deploy一致の最終確認。外部上限のみを削減作業完了の根拠にはしない。
