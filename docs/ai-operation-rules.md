# AI Operation Rules

## 基本方針

- このプロジェクトでは [docs/qa-test-cases.md](qa-test-cases.md) を QA の正とする。
- QA の A には本番環境で実行した結果のみを記載する。
- ローカルテスト結果、想定回答、未デプロイ実装の期待値を QA の A に記載してはいけない。
- 新しい確認観点をテストとして追加する場合は、対応する質問を [docs/qa-test-cases.md](qa-test-cases.md) に追加する。QA に載せないテストは正式な QA として扱わない。
- QA 失敗ログを根拠に期待値を書き換えてはいけない。
- D1 データ不足を理由に DB を変更してはいけない。
- [packages/db](../packages/db) を安易に変更してはいけない。
- DB 同期は禁止する。
- D1 操作は禁止する。
- カラム追加、型変更、バッチ仕様変更以外で DB を触らない。
- QA 失敗時にまず疑うべき箇所は、intent、filters、player resolution、year fallback、formatter、routing とする。

## QA 失敗時の手順

1. [docs/qa-test-cases.md](qa-test-cases.md) を確認する。
2. 本番実行ログを確認する。
3. intent / entities / data_requirements を確認する。
4. player_id 解決結果を確認する。
5. repository routing を確認する。
6. 最小修正を行う。
7. deploy する。
8. 本番 QA を行う。
9. 本番 QA の実行結果は [docs/qa-test-cases-current-vs-prod.md](qa-test-cases-current-vs-prod.md) に記録する。
10. 回帰確認を行う。
11. commit する。

### 障害調査時の確認項目

- 修正前に、本番実行ログ、intent、entities、player_id 解決結果、repository routing、data_requirements を必ず確認する。
- player_id 解決失敗がある場合は、name fallback で曖昧に進めず、解決不能として扱う。
- 500 エラー、timeout、null 参照、validation error を見つけた場合は、その場で原因を特定し、放置せずに修正する。

### 修正後の確認項目

- 修正後は、本番 QA 実行結果、pass / fail 件数、player_id 解決失敗件数、500 エラー件数、実行ログ保存先、Deploy Version ID を確認する。
- QA 実行後は、[docs/qa-test-cases-current-vs-prod.md](qa-test-cases-current-vs-prod.md) を更新し、現行本番の実行結果と差分を記録する。

## Cloudflare deploy 認証エラー時の手順

- `wrangler deploy` が `CLOUDFLARE_API_TOKEN environment variable needed` または `Not logged in` で失敗しても、API token の追加要求で止めない。
- これまでの正規 deploy 経路は Wrangler OAuth ログインである。まず `wrangler whoami` でログイン状態と `workers:write` 権限を確認する。
- `wrangler whoami` が失敗した場合は `wrangler login` を実行し、OAuth callback 完了まで待つ。
- login 復旧後に再度 `wrangler whoami` を実行し、対象 account と権限を確認してから `wrangler deploy` を再実行する。
- deploy が成功したら、本番 QA を実行し、QA の A には本番実行結果だけを反映する。

## 禁止事項

- QA 失敗を期待値化すること。
- 本番実行していない回答を QA の A に記載すること。
- timeout を期待値化すること。
- HTTP 500 を期待値化すること。
- HTTP 503 を期待値化すること。
- D1 データ不足を理由に DB を触ること。
- [packages/db](../packages/db) の性能改善を無関係に混ぜること。
- 復旧作業中に新規精度改善を始めること。

## 復旧作業時のルール

- 目的は「壊れる前に [docs/qa-test-cases.md](qa-test-cases.md) が期待していた状態へ戻すこと」とする。
- 新規仕様追加は禁止する。
- 新規挙動追加は禁止する。
- 期待値変更は禁止する。

## QA 復旧完了判定の絶対ルール

以下は QA 復旧作業を行う AI エージェント自身への恒久プロンプトとして扱う。作業開始時に必ず読み、完了報告前に必ず再確認する。

### 完了条件

- 完了条件は「[docs/qa-test-cases-current-vs-prod.md](qa-test-cases-current-vs-prod.md) の `# QAテストケース一覧 - 現行本番との差分` が、[docs/qa-test-cases.md](qa-test-cases.md) の QA 正と現行本番回答の文意・フォーマットが整合している状態へ書き換わっていること」とする。
- `docs/qa-test-cases-current-vs-prod.md` に `許容外差分件数: 0/..` と書いてよいのは、現行本番ログの全 QA 回答を QA 正と突き合わせ、許容外差分が実際に 0 件であることを確認した場合だけとする。
- 本番 QA が timeout、HTTP 500、HTTP 503、status error、summary null を含む場合は完了禁止とする。
- 本番 QA を実行していない回答、ローカル実行結果、未デプロイ実装の期待値を根拠に完了扱いしてはいけない。

### 許容差分

許容してよい差分は次だけとする。

- バッチ更新により同一文脈内で変化した指標数値。例: 登板数、投球回、防御率、WHIP、打率、本塁打、打点、安打数、勝敗数、対象試合数など。
- 句読点、空白、改行、表記ゆれなど、回答の文意・対象・根拠が変わらないフォーマット差分。

### 許容してはいけない差分

以下は数値差分として扱ってはいけない。1 件でもあれば QA 失敗として修正する。

- 回答 intent が変わっている。例: 成績回答がイベント一覧、候補 0 件、所属回答、off_topic、試合詳細なしになっている。
- 対象選手、球団、リーグ、一軍/二軍、年度、期間、試合日、球場、対戦カードが QA 正と違う。
- 「直近」「最後」「最近」の対象日・対象試合群が QA 正と違い、単なる指標数値更新では説明できない。
- QA 正が個別の説明文を期待しているのに、集計リストや検索結果件数だけを返している。
- QA 正が曖昧性確認を期待しているのに、勝手に特定選手へ解決している。またはその逆。
- QA 正が NPB 不在籍選手の最終在籍年 fallback を期待しているのに、候補 0 件や現年データなしだけを返している。
- 本番回答の文意が QA 正と異なるのに、要約や主観判断で「同じ」と扱う。

### 差分ファイル作成ルール

- `docs/qa-test-cases-current-vs-prod.md` は現行本番ログから作る。手作業で都合よく要約してはいけない。
- 許容外差分がある場合は、該当 Q 番号ごとに QA 正と現行本番回答を記載し、何が違うかを残す。
- 許容外差分が 0 件になるまで、`許容外差分件数: 0/..` と書いてはいけない。
- 「数値差分として許容」と判断する場合も、同じ選手・同じチーム・同じ年度/期間・同じ回答種別・同じ根拠構造であることを確認する。

### 完了報告前チェック

完了報告前に必ず以下を満たす。

1. 最新デプロイ済み本番 URL に対して [docs/qa-test-cases.md](qa-test-cases.md) の全 QA を実行している。
2. 最新本番 QA ログの全件が HTTP 200 かつ summary 非 null である。
3. QA 正と最新本番回答を全件比較し、許容外差分が 0 件である。
4. [docs/qa-test-cases-current-vs-prod.md](qa-test-cases-current-vs-prod.md) がその最新本番 QA ログを参照している。
5. 上記 1〜4 を満たさない場合、完了報告をしてはいけない。
