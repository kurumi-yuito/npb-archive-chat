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
3. intent / filters を確認する。
4. routing を確認する。
5. 最小修正を行う。
6. deploy する。
7. 本番 QA を行う。
8. 本番 QA の実行結果を [docs/qa-test-cases.md](qa-test-cases.md) の A に反映する。
9. 回帰確認を行う。
10. commit する。

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
