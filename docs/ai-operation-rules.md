# AI Operation Rules

## 基本方針

- このプロジェクトでは [docs/qa-test-cases.md](qa-test-cases.md) を QA の正とする。
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
8. 回帰確認を行う。
9. commit する。

## 禁止事項

- QA 失敗を期待値化すること。
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
