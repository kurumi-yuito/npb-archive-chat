# 2026-11-02 リリース再設計 — 作業中

今回のユーザー指示の完了条件は未達。Release Ready・一般公開可能とは判定していない。既存182件を保持し、追加Q-183/Q-184をQA正本へ追加した。Acceptance47ターンも引き続き必須。

## 2026-11-03 更新

- 最新コードの全体回帰は536 Pass / 65 Skipped（`data/logs/redesign-20261102/npb-redesign-tests-checkpoint.log`）。その後に追加したAPIの失敗時返却テスト2件もPass。実SQLiteのトークンが10回へ戻ること、計画矛盾で検索が走らないこと、account DB障害で処理を継続しないことを確認した。HTTP層はテスト内で置換しており、本番E2Eの証拠にはしない。
- 最後のAPI修正は、Planner検証失敗を成功応答として課金せず503として返却処理へ進めるもの。修正後のtypecheck・Cloudflare buildは成功（`npb-redesign-typecheck-refund.log`、`npb-redesign-build-refund.log`）。本番配信は行っていない。
- 候補3は`e01e6d63-3e24-45dc-86ea-1af33961b48e`。Q-183の結果は候補2と同様で、独立評価はFailのまま。B31もFailで、追加原因は指定されていないlevelを`both`として補完する意味解析と、検索計画検証をidentity解決前に適用する段階設計。統計サマリーの出力分類だけでは解消していない。ログは`preview3-contract-eval.json`、`qa-acceptance-B31-1793663502226.json`。候補3にも最後のAPI返却修正は含まれない。

再開時の最優先は、意味契約と旧filtersの二重生成で物理述語や未指定scopeが混ざる問題を共通の解析・計画境界で解消し、identityの曖昧性と実行計画の未確定を分けること。B31・Q-183の期待値を緩めて合格化しない。次にBISの過年度統計を、公式リンク・ページ対象年度・選手IDを検証して正規データフローへ収録し、公式件数照合を完成する。

- 最終寄りの全体回帰は533 Pass / 65 Skipped、`/tmp/npb-redesign-tests-latest.log`。typecheckは`/tmp/npb-redesign-typecheck-latest.log`で成功。canonical契約の追加回帰5件も成功。この後に統計サマリーのルーティングとBISのID制約を修正したため、次の全体確認が必要。
- プレビューのみアップロード。本番配信は変更していない。候補1は`24ee6d5a-3c3f-4490-876e-a265bd0fe66a`、候補2は`af43dd8f-1b98-49c3-8bba-cdc2ba2d4b54`。両者はread-only validation設定で、公開リリース候補としては未合格。
- 候補2のQ-183は山田哲人を一意に解決し、12イベント・対戦相手・公式出典を返した。選手解決・検索計画・検索制約・回答はPass。ただし意味契約に暗黙の物理`event_type`述語が残り、独立意味評価はFail。BIS年度集計が取得できず、完全性・年度集計出典もFail。期待値は変更していない。ログは`data/logs/redesign-20261102/preview2-contract-eval.json`。
- 原因確認のため、本番D1の`player_batting_stats`を`player_id=91895133`のindex条件で読み取り、0件・rows_read 0・rows_written 0を確認した。記録は`/tmp/npb-redesign-bis-evidence.json`。ローカル2025年にも該当BIS行はない。公式の各本塁打イベントを件数合わせで変更していない。
- 候補2のB31は統計要求を個別成績行要求として扱う契約検証でFail。共通の出力種類を`batting_statistics`/`pitching_statistics`と`batting_records`/`pitching_records`へ分離して修正した。候補2にはこの後続修正は含まれない。
- BIS打撃検索に、ロスター行がないと明示player_idを落として別選手も返し得る共通不具合を発見し、fallbackでもIDを維持するよう修正した。ロスターなし・存在しないIDのDB回帰を追加。統計契約・DB統合の26件Pass / 4件Skippedは`/tmp/npb-redesign-stats-contract-test.log`。
- 1280px/390pxのブラウザー操作で、候補選択、対象名・年度の保持、20→35件の追加表示、対戦相手、横はみ出しなし、入力欄の可視性を確認。これはAPIをブラウザー内で置換したUI試験で、自然文検索や本番E2EのPassには含めない。`/tmp/npb-redesign-ui-report.json`、`/tmp/npb-redesign-ui-390.png`、`/tmp/npb-redesign-ui-1280.png`。

## 実装した共通処理

- `packages/schemas/src/query-contract.ts`: 質問の意味を保持する11要素とversionをZodで検証する。解析段階のentitiesは名前表現のみを許可し、確定IDを入れない。
- LLMの構造化出力に`query_contract`を要求し、正規化・旧adapterの書き換えを通して元の意味を保持する。公開本番APIはNPB質問で契約が欠けた場合、簡易パーサーへ逃がさず停止する。
- `chat-query-contract.ts`: requested_outputからデータ要件を計画し、旧executorの検索種別・年度・対象・述語などが契約を保存するか確認する。**実際の全検索経路を置き換える複合Query Plannerは未完成**。
- 年度・球団を明示したイベント検索は、両条件が一致する公式の所属・出場行を先に絞り、プロフィールから過去の同姓選手を戻さない。現在所属と過去年度を組み合わせて候補を確定しない。山田専用分岐は追加していない。他カテゴリへの全面移行は未完。
- イベント検索のカーソルを追加し、全件取得を画面の表示件数から分離する。上限500件×20ページで、完全性を確認できなければ完全な一覧を返さない。複数年度のsequenceを数値順に扱う。
- イベントのID・年度・球団・分類・重複・公式出典と日付を検査する。通年・単一球団・単一打者の本塁打一覧は、独立したBIS年度集計とも照合する。不一致時にレコードの追加・削除で合わせない。未取得のBIS集計は未照合と明示する。
- 対戦相手と公式選手URLをイベント射影へ追加。UIは対戦相手、候補選択ボタン、20件ずつの追加表示に対応。
- 特定名・質問文を見てLLMを呼ばないparser分岐を撤去。productionの上流障害時に簡易パーサーへ迂回するAPI分岐も修正。
- アカウント・利用枠DBの障害時に質問を無制限で続ける経路を停止。消費済みトークンは返却する。

## 独立評価と根拠

`docs/eval-query-contracts.json`の1件は、ユーザーが明示した意味仕様とNPB公式から確認した年度集計を分離した正解データ。`scripts/eval-query-contracts.mjs`が8工程を個別記録する。HTTP 200・空でない回答だけのPass、BlockedのPass算入、空splitの成功を禁止する。合成イベントfixtureは公式の各試合の正解データと区別する。

開発・回帰・未使用評価の全カテゴリ網羅は未達。独立評価の1件だけで汎化性能を主張しない。

## 本番の確認事実

- `wrangler deployments list`の最新配信は`c19d9daf-3d4b-4228-ae95-c7e9b6f80c3a`（今回のコードではない）。
- `/api/health`は200。`/api/account`のGoogle/Stripe設定フラグはtrue。実ログイン・決済・権限同期のE2Eは未検証。
- 再設計前のQ-183は200だが、山田大樹を含む不要な候補確認となりFail。独立評価もPass 0 / Fail 1 / Blocked 0。
- ログ: `data/logs/redesign-20261102/baseline-Q183.json`、`baseline-contract-eval.json`、`baseline-account-flags.json`、`baseline-plans.json`。
- GitHubの日次更新workflowは`disabled_manually`。取得した直近成功は2026-09-07、run `34088804709`。設定ファイルのCronの存在だけで自動更新稼働とは判定しない。再開前に最新フロー・秘密情報・候補検証・原子的公開の実動作を確認する必要がある。

## 検証ログと再開手順

- 変更前寄りの全体テスト: 518 Pass / 65 Skipped。合格を最終変更へ流用しない。
- 中間全体テスト: ローカルHTTPサーバーがsandboxの`listen EPERM`で拒否され、529 Pass / 1 Fail / 65 Skipped。期待値は変更せず、制限外で再実行した。
- 制限外の再実行: 532 Pass / 65 Skipped、`/tmp/npb-redesign-tests-unrestricted.log`。この後に追加した契約付きDB統合テストは別途確認する。
- 契約付きDB統合テストで、legacy event射影が直接の選手URLを保持していない問題を発見。`batterUrl`等をlegacy/normalized双方に追加して修正し、再実行中。
- 最新の統合テストログ: `/tmp/npb-redesign-contract-integration-fixed.log`。
- 最終typecheck: `/tmp/npb-redesign-typecheck-final.log`。途中のUI関数名誤記は修正済み。
- Cloudflare build: `/tmp/npb-redesign-build.log`は成功。後続変更を含むbuildは`/tmp/npb-redesign-build-final.log`。
- lint: `/tmp/npb-redesign-lint-final.log`。現時点の結果は0 errors / 139 warnings。

コード編集と検証を同時に進めた中間ログを、同一コードの最終検証として扱わない。再開時は最新コードで契約付きDB統合テスト→typecheck→buildを確定し、候補Versionへアップロードして自然文の独立評価を行う。失敗を修正してから既存Acceptance47件・既存QA182件・追加QAを実行する。正式本番への反映後にも全件検証が必要。

## 必須の残作業

1. 旧serviceの質問文・選手名による検索前shortcutとrewrite群を、正式な意味契約と共通実行処理へ移行する。
2. 複数ソース、守備成績、期間、試合種別、所属履歴、複数選手・複数年比較の契約・検索・検証を完成する。候補検索の内部上限についても完全性を証明する。
3. 回答の主張単位の検証と、原因別の追加検索・再計画・再生成の上限付き制御を完成する。現行公開routeでは最終回答LLMが接続されておらず、既存必須仕様との差が残る。未検証の自由文生成を有効化して埋め合わせない。
4. 独立正解データの全カテゴリと未使用評価を完成し、意味・解決・検索・完全性・集計・回答・出典を実データで評価する。
5. BISの備考・対象年度・基準日時・取得日時・ソース識別を点検し、過年度リンク構造を確認して必要データを整備する。
6. 更新workflowの安全な再有効化、実更新後の本番反映、監視・通知・バックアップからの復旧を検証する。
7. 認証・Free/Pro利用制限・Stripe live権限同期・PC/スマートフォンのE2E、セキュリティ・性能評価を完了する。
8. 同一の最終HEAD/本番Versionで正式QA・Acceptanceをすべて合格させ、差分正本を更新してからリリース判定する。

ユーザーの追加承認や秘密情報要求を理由に停止している状態ではない。上記の実装・検証作業が残っている。
