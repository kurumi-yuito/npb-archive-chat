# 2026-11-02 リリース再設計 — 作業中

今回のユーザー指示の完了条件は未達。Release Ready・一般公開可能とは判定していない。既存182件を保持し、追加Q-183/Q-184をQA正本へ追加した。Acceptance47ターンも引き続き必須。

## 2026-11-03 更新

### 2026-11-04 継続作業（未完了・作業継続中）

#### 最新の引き継ぎ状態

- **公式統計の本番DB反映は実行済み**。6出典391行を世代`0c00e1d7-30f3-43de-b2c1-e67479c5fc8d`から`d133e7af-dd68-4e4e-a0e1-7b4e81bd1816`へ原子的に追加した。出典原文はR2にも保存済み。既存の試合・イベント・アカウント行はこの差分の対象外。`data/logs/redesign-20261102/official-publication-receipt.json`、`official-production-verified.json`が反映・読取証拠。準備manifestの`published:false`は準備時点の状態であり、実行後のreceiptを参照する。
- 本番DBの事前exportをSQLiteへ復元し、R2の`backups/sqlite/before-official-statistics-0c00e1d7.sqlite`へ保存して再ダウンロードした。SHA256は元と復元の双方`5eda79e45b6e518f16efb130d957d1e434ef4e45a7306dbdf54390d4449bca2a`。原本`/tmp/npb-official-production-baseline.sqlite`、R2復元`/tmp/npb-official-restored-baseline.sqlite`。
- 本番アプリ配信は未変更。最新プレビューは`75c02395-c5c8-4f18-b688-d827a2f35733`。データ反映前のQ-183は意味・選手解決・計画・検索制約・回答がPass、完全性・年度集計出典がFail（`semantic-preview3-before-data-eval.json`）。B31はPass（`data/logs/qa-acceptance-B31-1793764004163.json`）。
- 同プレビューのAcceptance全47ターンは**11 Pass / 36 Fail / 0 Unexecuted**（`data/logs/qa-acceptance-all-1793764350773.json`）。年度未指定で全年度を合算し現年として説明する重大な誤回答も確認した。compilerに現シーズン既定値を追加し、careerは`relative:"career"`として明示的に分離する修正を追加。過去在籍選手fallback・比較・期間・会話文脈・formatterの誤った説明は引き続き修正が必要。
- データ反映後のQ-183再評価は`usage_unavailable`の503/Blocked（`semantic-preview3-after-data-eval.json`、`semantic-preview3-usage-tail-replay.json`）。HTTP監査ヘッダーで、LLM呼出前のmetadata DBの`consumeChatUsageToken` INSERTがfailedであることを確認した。SQLそのものは、同一実装から生成した文を本番meta DBの診断専用キーで実行して成功し、tokens=9の診断行を削除した。既存ユーザーの枠は調整していない。SQL実行`/tmp/npb-usage-d1-repro-result.json`、削除`/tmp/npb-usage-d1-repro-cleanup.json`。
- `server-database.ts`で最初のリクエストのD1 bindingを全リクエストへ使うmodule cacheを発見し、H3 event context内の再利用へ修正。別bindingの2リクエストを混同しない回帰を追加し、関連9件Pass。直接の503原因がこれで解消したかは未検証。最新版ビルド`/tmp/npb-request-scope-build.log`、型検査`/tmp/npb-request-scope-typecheck.log`、全体回帰`/tmp/npb-request-scope-full-tests.log`を実行中。前回の全体回帰は552 Pass / 65 Skipped、前回lintは0 errors / 139 warnings。
- 公式統計の取得を2025年全12球団へ拡大するCLIを実行中。`/tmp/npb-official-2025-all-teams-ingestion.log`、DB`/tmp/npb-official-2025-verified.sqlite`。取得は本番反映と別工程。**次の差分準備で古い0c00世代のbaselineを再利用しない**。直前の反映後コピー`/tmp/npb-official-publication-final/rehearsal.sqlite`はd133世代を持つ。remote世代を確認し、相違時は再exportしてから準備する。
- 公開済み公式統計を定期更新候補へ引き継ぐ`official-statistic-preservation.ts`を追加。未収集を削除とみなさず、取得日時・確定IDを後退させない。同一hashでmetricsなどが変われば失敗する。原子的差分・統計・保持の12件Pass。

直近の優先順は、503の実環境再検証→Q-183全工程Pass→47ターンの共通原因修正→独立評価拡充・182件+追加QA→製品/運用/本番E2E。ここで作業を完了・Release Ready扱いにしない。

- 公開routeの意味解析を、旧intent/filtersとの二重生成からsemantic-only出力へ変更。公式エンティティ解決→契約コンパイル→直接実行へ接続し、旧serviceの質問文rewriteを検索ルーティングから外した。追加ファイルは`chat-semantic-llm.ts`、`chat-contract-compiler.ts`、`chat-contract-service.ts`。
- プレビュー`e461d1f9-1a5e-4544-a668-5f46063172e3`をアップロード。本番配信は未変更。B31はHTTP200で候補確認となりPass（`data/logs/qa-acceptance-B31-1793756041530.json`）。Q-183独立評価は`home_runs > 0`という個別playに不適合な述語により503/Blocked。ログ`semantic-preview-contract-eval.json`。BlockedをPassに含めない。情報種類と述語の整合性を検査し、意味解析を最大2回でやり直す修正を追加したが、この修正後のプレビュー評価はまだ。
- BIS公式リンクのteam index→現在統計→backnumber→対象年度→各統計への追跡と、対象年度・球団・種類の検証を実装。新CLI`pnpm --filter @npb/db update:official-statistics --year 2025 --team s --sqlite-path /tmp/npb-official-2025.sqlite`で公式6ページ391行を実取得した。一軍/二軍/守備位置/原文バージョンを分離する追加スキーマをlegacyとnormalized両方へ用意。既存イベントは変更していない。
- 公式辞書コピー後の検証用DBで、山田哲人ID91895133・2025一軍・ヤクルト・本塁打12の公式行を確認した。ただしその後、統計からのID補完にフルネームの一意一致だけでなく、年度・球団の公式所属証拠も必須にする修正を追加している。最終版の実取得検証を改めて行うこと。未解決IDを名前だけで補完しない。
- `official-statistics-repository.ts`で同一出典の最新版と明示scopeを選択。打撃の既存adapterでは年度・球団・選手IDを指定した照合だけに接続し、部分収集したリーグを完全な検索結果に置き換えない。
- 原子的差分公開に、追加テーブル・index・データを同一トランザクションで反映する機能を追加。失敗時にschemaごとrollbackする回帰を含む9件がPass。正式な本番DB反映は未実行。
- 公式profile parserが同一年の所属を最後の球団へ上書きする問題を修正。移籍年は配列として保持し、候補解決の既存consumerも対応。プロフィール・所属scopeの7件Pass。意味解析・公式統計・原子的差分の中間統合16件Pass。全体回帰、最終typecheck/lint、最新Cloudflare buildは実行中。

上記は開発・プレビュー・隔離DBの結果であり、本番QAのAには転記しない。残っている公式統計の本番反映、広範な契約実行、全QA/Acceptance、認証課金・更新運用・E2Eを続行する。

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

上記の実装・検証作業が残っている。

## 2026-11-04 ローカル修正と本番障害の現状

- 本番D1無料枠の読み取り上限到達を、実際のD1エラーで確認した。原因と影響、実行した診断の後片付けは[障害記録](incidents/2026-11-04-d1-read-budget-exhaustion.md)を参照する。共有本番DBに対する広範囲のプレビュー評価は停止し、以降は隔離したMiniflare D1コピーで検証している。bindingキャッシュ修正をこの障害の解消根拠にはしない。
- リモート評価runnerは、利用可能な読み取り予算と成功したローカル計測ログを必須にし、予算不足・未知の計測・見積超過では停止する。BlockedはPassに含めない。
- Q-183の隔離Worker評価は8工程を満たすPass。公式辞書を先に使用する共通解決へ変更し、読み取りを1,287,314行から81,749行へ削減した。本番の正式QA結果には転記していない。
- B26は通算の全出場成績を取得せず、公式プロフィール・選手一覧を取得する`player_information`へ分離した。隔離Workerの実応答は「阪神・外野手」、読み取り32行。ただし基本成績を含まない段階の受入結果はFailのまま。年度と公式出典を保持した基本成績の追加を実装しており、後続build・実応答確認は未完。
- 選手一覧parserの見出し判定が、HTML前処理でthタグを除去した後に行われていた問題を修正した。繰り返し見出し、監督の除外、投打の正確な列選択、自由契約備考の保持、過年度としての誤取得拒否を含む12テストがPass。
- `update:official-roster --year=2026 --storage=local`で公式12球団・12ページ・1,083件を取得し、`/tmp/npb-official-roster-2026.sqlite`へ保存した。リンク探索とページ年度・球団の検証を行い、rawと構造化データに取得日時・基準時点・ハッシュ・備考を残す。掲載だけで現在契約中とは判定しない。隔離D1の2026年度選手一覧もこの完全ページ取得から更新した。本番への反映はしていない。
- 新規の選手一覧取得CLI、基本成績紹介の後続変更を含むtypecheck・build・回帰試験を継続中。本番アプリの配信Versionは変更しておらず、リリース判定は未合格。
- 2026年度成績は公式リンク探索から12球団・一軍/ファーム・打撃/投手/守備の72ページ・4,845行をローカルに取得した。球団名の空白・全角表記を共通処理で正規化し、846行のIDを公式プロフィールの同年度所属から追加照合した。残る1,405行はID未解決のまま保持している。全行の値と保存raw HTML、ページ年度・球団・種別、ハッシュ、解決済みIDの所属証拠を再検証した。
- 次回公式統計差分のローカルリハーサルはPass。基準generation `d133e7af-dd68-4e4e-a0e1-7b4e81bd1816`、準備generation `793f15c8-3f7c-4ae2-9f28-0a1b1eb6cafc`。プロフィール行の変更0、統計source追加72、統計行追加4,845、辞書検索index追加。**未公開**であり、実適用前に本番generation・バックアップ・読み取り予算を再確認する。
- 再開用の取得DB、ハッシュ付きreceipt、未適用SQLとmanifestは`data/staging/redesign-20261104/`に保存する。raw HTMLと備考を含む選手一覧sidecarは`data/raw/`・`data/structured/`にある。このステージングデータは本番取得・更新稼働や正式QA合格の証拠ではない。
- 基本成績紹介、表記正規化、別ID排除、過年度指定、出典保持を含む後続の関連19テストがPass。`/tmp/npb-information-fixed-typecheck.log`の型チェックも終了コード0。全体回帰・凍結buildの結果は引き続き確認中。
- この時点の全体回帰は572 Pass / 65 Skipped（73ファイル中71 Pass / 2 Skipped）。ログは`data/logs/redesign-20261102/20261104-full-tests.log`。SkippedをPass扱いしない。型チェックのログは同ディレクトリの`20261104-typecheck.log`。本番QAとAcceptanceの全件合格は未達。

## 2026-11-04 続行中の期間・集計・プロフィール統合

- 再開用コミットは`71daaf13a`。その後も実装を継続しており、以下の後続変更はこのコミットには含まれない。
- 同一の隔離WorkerでB26/B31が2 Pass、独立Q-183評価がPass。ログは`data/logs/qa-acceptance-B26_B31-1793778737232.json`、`data/logs/redesign-20261102/isolated-information-official-contract-eval.json`。B26は公式2026年度の143試合・打率.292・本塁打35・打点84を出典とともに返し、読み取り135行。本番QAへの転記はしていない。
- 同ビルドのローカル受入47件は10 Pass / 37 Fail / 0未実行。`data/logs/qa-acceptance-all-1793779153729.json`。計7,974,887行の読み取りのうちB19が7,701,037行。空でない回答だけでは合格せず、期待値は変更していない。
- 後続では意味契約の指標名とrepositoryの指標名を共通辞書で対応付け、統計出力を旧質問文フォーマッターから分離した。指定されていない防御率比較などを生成せず、取得値の型・有限性を確認する。
- 日付の上下限を検索スキーマ、Compiler、正規化、各repositoryのパラメータ付きSQL、イベント証拠検証まで保持した。期間指定で通年BIS集計を採用しない。従来/正規化DBの両方で実fixture2試合を使った境界・除外・集計試験がPass。期間から候補解決の年度範囲も導出する。
- SQL側の公式所属名にも空白除去を適用した。JS側だけを正規化してもSQLで「阪 神」等を落としていたため。年度と球団の組を保持する回帰試験で確認した。
- この段階の全体回帰は583 Pass / 65 Skipped、`/tmp/npb-period-statistic-full-tests.log`。この後に追加したプロフィール・通算処理を含む全体確認は未完。後続buildログ`/tmp/npb-period-statistic-build.log`は成功したが、さらに後のプロフィール実装を含む最終buildの証拠にはしない。
- `update:official-profiles`を追加。明示的なローカルDBパスを必須にし、公式IDの実ページ、宣言URL、取得日時・基準時点・ハッシュ、年度別行、通算欄を保存する。年度行の合計と通算欄を照合し、不一致は保存しない。UPSERTで既存aliasを削除せず、プロフィール掲載から契約中を推定しない。再開時は取得済みrawのハッシュ・証拠を確認し、キャッシュに新しい取得時刻を付けない。
- 1930年代の`1937春`/`1937秋`を別期として保持する修正を、失敗した実ページで検証した。投球回の`+`表記についても、原文を保存したまま通算アウト数と照合する処理を追加し、同じ失敗ページの再取得が成功した。期待件数や成績値は変更していない。
- 公式プロフィールから検証済み通算記録を取得するrepository経路と、契約が要求する指標だけを回答する経路を接続中。出場factsを走査せず、公式footerと出典を回答する合成データの統合試験がPass。実APIの通算ケースと読み取り量の検証、全件回帰、プロフィール差分の検証・公開は未完。
- 取得対象は公式辞書と検証済みロスター由来の4,428 ID。`/tmp/npb-official-2026-complete.sqlite`へ取得中。最初の300件は284成功/16失敗で停止・原因修正を行い、再開した。実行ログは`/tmp/npb-official-profiles-resumed-ingestion.log`。失敗はログの`failure`としてIDと理由を残し、成功に算入しない。実行中のプロセスは起動時のコードを保持するため、起動後に修正した投球回表記などの失敗IDは終了後に再取得する必要がある。
- `data/staging/redesign-20261104/`の既存DB/receiptはプロフィール大量取得前のスナップショットであり、更新中の`/tmp`DBと同一ハッシュだと扱わない。最新の取得完了後に別のスナップショット・receiptを作る。既存の統計公開scriptはプロフィール行の変更を禁止しており、プロフィール更新の本番公開には専用のraw検証・差分リハーサルが必要。

本番アプリは今回の変更を未配信。D1予算障害、正式QA182件・受入47件、未使用評価、課金/認証/運用E2Eを含む未達項目が残っている。ここで完了扱いせず、取得・失敗修正・実応答検証を継続する。

## 2026-11-04 後続の取得完了・公開前リハーサル

- 公式プロフィール4,428件の取得・raw照合が完了した。年度・期別38,060行と通算欄6,222行を検証した。1930年代の春秋と投球回の`+`を一般処理で修正し、失敗44件を再取得して成功した。`/tmp/npb-official-profiles-verification.json`。
- 2026年度の公式成績72ページ・4,845行と12球団の年度付き選手一覧を取得済み。公式IDによるプロフィール・一覧の対応から成績の未解決ID1,405件を照合し、残り0件。数値・行数・元の取得日時は変更していない。異なる公式表記の同一IDも扱い、名前専用分岐は追加していない。再開用DBは`data/staging/redesign-20261104/official-source-2026-complete.sqlite`、SHA256は`1ce579ec79a797fd40f148f979a22155c1b1a83b366a4a5c7023d16464d22b9a`。
- 全公式ソース公開のオフライン差分リハーサルが成功。`/tmp/npb-official-source-reviewed-publication/manifest.json`、基点d133e7afから候補cab5f87b。raw/structured/discovery計8,964オブジェクトを含む。公開前のR2保存・検証、本番世代・予算確認、D1反映は未実施。候補を本番反映済みと扱わない。
- B19の隔離API実応答は検証済みNPB通算126勝、読み取り155行でPass。通算欄と年度合計を照合し、海外リーグを対象外と明示した。`data/logs/qa-acceptance-B19_B06_B07_B26_B31-1793786869313.json`は3 Pass / 2 Fail。この2 Failに対する選手名出力の射影と一軍/二軍条件の修正は後続ソースにあり、同APIでの再確認は未実施。
- 旧2016/2017ページのスコア枠がclass属性で、旧parserがid属性のみを読むため合計点を取り込めていなかった。枠の双方に対応し、未知の得点を0対0・引き分けと断定しないようformatterを修正。公開回答のスキーマにもスコア原文JSONを保持する。関連57テストPass。
- `scripts/prepare-archived-score-repair.mts`で保存済み公式boxページを再解析した。日付・球団・出典URL・イニング合計を検証し、既知の得点と矛盾すれば停止する。欠落1,765件を更新、追加0・削除0・未解決0、差分適用リハーサルと外部キー確認が成功。`/tmp/npb-archived-score-repair/manifest.json`。元の取得日時を維持し、rawハッシュと前後のJSONハッシュを記録した。これも本番未反映。
- 2026年9月7日〜11月4日の試合取得を別の作業ディレクトリ・DBで実行し、242試合の取得・投入が成功、失敗0件。`/tmp/npb-new-games-2026-update.log`、DBは`/tmp/npb-new-games-2026/npb-2026.sqlite`。本番への正規化差分の統合・出典検証はこれから行う。
- 最新ソースの全テスト・型チェック・lint・Cloudflareビルドを実行中。結果が確定するまでは前段の合格件数を最新ソースの検証結果として扱わない。本番の正式QA・受入・認証課金E2Eは引き続き未達。

## 2026-11-05 継続状況と再開用成果物

- 隔離Workerの受入全47ターンは15 Pass / 32 Fail / 0未実行。`data/logs/qa-acceptance-all-1793842380258.json`。同じ実装の独立意味仕様QC-R001は8工程Pass、`data/logs/redesign-20261102/isolated-annual-contract-eval.json`。これらは本番QAに転記しない。
- 検証済み公式プロフィールの年度行をrepositoryから取得し、今季の記録がない場合は最終NPB年度を補足として回答する処理を追加した。質問のQuery Contractを保存し、`scope_fallback`に指定年度・証拠年度・別年度の契約を保持する。球団条件を黙って捨てず、公式年度行の球団に照合する。複数の打撃・投手出力も保持する。合成ソースからの統合4テストPass。特定選手名での分岐はない。
- 実APIの後続8ケースは5 Pass / 3 Fail。`data/logs/qa-acceptance-B04_B05_B06_B07_B12_B19_B26_B31-1793845090147.json`。山本由伸の2023年防御率1.21は補足を明示してPass。大谷の複数出力、リーグがcompetitionに入る場合、村上の単位付き表現でFailした。これらの一般処理を後続で修正し、関連21テストPass。修正後の実API再確認は未実施。
- リーグ制約を成績repositoryの所属球団集合・一軍条件へ対応付け、独立した計画検証でも同じ制約が保持されたか確認する。矛盾する球団・二軍指定を拒否する試験を含む19テストPass。本塁打には本の単位を付け、投球回は小数丸めではなく整数回と1/3・2/3で表示する。
- 追加242試合の詳細取得は136成功、106試合では速報ページが見つからず未完。424件はページ単位の失敗記録であり、424試合の失敗とは扱わない。全242試合のスコア、11,678イベント、打撃3,874行、投球1,209行、出場7,044行を隔離DBで正規化し、元DBとの件数照合が成功した。106試合の不完全性は公開manifestに残す。
- `scripts/prepare-new-game-publication.mts`で既存データを更新・削除せずに新規試合を追加する差分を準備した。辞書・出典IDを既存IDに対応付け、出典日付・公式URL・raw/structuredハッシュを検証し、差分適用と外部キー確認が成功。原本1,194オブジェクトの保存一覧付き。本番未反映。
- 原本とDBは`data/staging/redesign-20261104/recent-games/`へ保存済み。取得DB SHA256は`7c1ac4572986b5d7feac8f39365594ccab9bead82c26b430c73e41cb52e6a504`、正規化DBは`f2753f3e9de623d3d3acd92fbd78e07b961b4f0544d8bf1dec9b6744dde37c`。
- 公開前の3段階差分・manifest・最終リハーサルDBは`data/staging/redesign-20261104/publication-chain/`へ保存済み。d133e7af基点からcab5f87b→ebca2f2e→e4bb7c6dの順序を厳守する。最終DB 322,560,000 bytes、SHA256 `cef46e355715560480a6ab7c1b5f39f76a6130a3df531e705545d8716b9e29c8`。`published:false`であり、原本R2保存・本番世代確認前にSQLを実行しない。
- 年度補足処理段階の全体回帰は598 Pass / 65 Skipped、`/tmp/npb-annual-fallback-full-tests.log`。その後のリーグ・単位・複数出力の変更は関連試験のみ確認済み。全体回帰を更新する必要がある。直前段階の型チェックとCloudflareビルドは成功、lintは0 errors / 146 warnings。最新段階の型チェック・ビルドは再実行中。
- `wrangler whoami`が認証更新400で失敗したため、運用ルールどおり`wrangler login`を実行したが、ブラウザ承認を待ってタイムアウトした。本人のOAuth承認を依頼済み。その間もローカル修正を継続する。本番アプリの配信・正式QA・認証課金/運用E2Eは未完、リリース判定は未達。

## 2026-11-06 意味検証・球団比較の継続

- 再開用コミットは`4a53fa9ce`。以降の球団別集計・意味照合などは後続差分にある。本番アプリへの配信は未実施。
- 公式成績の球団別集計を追加し、安打合計÷打数合計で打率を算出する。選手打率の平均にせず、球団試合数は延べ選手出場数から捏造しない。2球団の契約を分割実行し、元の両球団を回答契約に保持する。全件で12球団を取得する試験を含む16テストPass、同段階の全体602 Pass / 65 Skipped、型チェック・Cloudflareビルド成功、lint 0 errors / 146 warnings。`/tmp/npb-team-comparison-*`。
- 同段階の隔離API9ケースは7 Pass / 2 Fail。`data/logs/qa-acceptance-B04_B05_B06_B07_B08_B12_B19_B26_B31-1793893745115.json`。大谷は打撃・投手の双方を2017年の補足として返し、山本2023年、リーグ上位、通算、紹介、曖昧名確認がPass。B08/B12は数値を得たものの要求された比較結論・名称表示や年度補足の表示形を満たさずFail。後続で比較の結論・元の球団名、年度補足の表示を修正した。期待値は緩和していない。
- Q185/Q186の隔離APIでは63565150/31935159を公式IDで解決し、2026年度ファームのみの成績を取得した。張は12登板・5勝・1敗・防御率2.50、佐倉は1本塁打で公式成績rawと一致。ログ`data/logs/redesign-20261102/isolated-Q185.json`、`isolated-Q186.json`。本番QAのAは未実行のまま。
- Q187を追加。12球団の全件と率の分母を検証する。公式集計器の暗黙の10件切り捨てを外し、契約の全件要求にlegacy正規化が表示用limitを挿入しないよう分離した。
- `openai-docs`スキルで公式構造化出力ガイドと設定済みgpt-4.1の対応を確認。解析をstrict構造化出力とし、別の構造化リクエストで元の質問・会話との意味一致を確認する。意味が一致しない場合の再解析は1回、最大4呼び出し、全体15秒、出力トークンにも上限を設ける。照合失敗・照合不能の解釈をそのまま検索へ渡さない。工程別の照合ログを追加した。これは独立した人間の意味正解データの代わりにはならない。
- 設定済み実モデルへの直接解析3ケースは成功、各2呼び出しで約2〜4秒。`data/logs/redesign-20261102/semantic-alignment-live-smoke.json`。意味照合の修正・上限・上流429・矛盾する照合結果の拒否を含む19テストPass。意味照合段階の全体608 Pass / 65 Skipped、型チェック・ビルド成功、lint 0 errors / 146 warnings。
- ただしWorker実行時に、照合moduleが依存コンテナのmethodとしてnative fetchを呼び、Illegal invocationになる問題を発見した。`data/logs/qa-acceptance-B04_B05_B06_B07_B08_B12_B19_B26_B31-1793929295658.json`は0 Pass / 9 Failであり、直前の成功数をこの版の評価として使わない。standalone関数として呼ぶ修正と、呼び出し元を検証する回帰を追加し19テストPass。修正版のビルド・型チェックを実行中、Workerでの再検証は未完。公開エラーには内部実装の文言を出さず、詳細はサーバーログへ残す。
- 実ブラウザ検証は未合格。初回は旧Workerと更新後アセットの不一致による500、版を揃えた再実行は上記の質問解析503で失敗した。`data/logs/redesign-20261102/ui-local/`は途中結果で、PC/スマートフォンのE2E完了証拠にはしない。
- 本番の`GET /api/health`はHTTP 200・`ok:true`を確認した。これはD1・認証・課金・自然言語回答の動作確認ではない。OAuth認証の本人復旧を依頼中で、接続可能な既存CDPブラウザも確認できなかった。本番への反映・正式QA/受入全件・独立評価コーパスの網羅・定期更新の安全化・認証課金/運用E2Eは引き続き未達。
- 通信修正後、同じ互換設定のnative Workerで照合成功を確認し、アプリの隔離API9ケースも9 Pass / 0 Failに回復した。`data/logs/qa-acceptance-B04_B05_B06_B07_B08_B12_B19_B26_B31-1793931494001.json`。修正版の型チェック・Cloudflareビルド成功。PC/スマートフォンの送信・出典・候補選択も実APIで通過。日本語フォントを持つ検証環境でも再確認し、`ui-local/report.json`と画像へ保存した。本番のE2Eとは区別する。
- 同版の受入全47ターンは18 Pass / 29 Fail / 0未実行。`data/logs/qa-acceptance-all-1793933788550.json`。B07等には解析表現の揺れによる回帰があり、対象9ケースの成功を全体合格と扱わない。
- Q187は「12球団」を固有球団名として抽出し、0件に誤ルーティングしたためFail。Q184はDB上241件を取得したが、うち2件が日本シリーズ、公式戦は239件。独立した公式プロフィール年度行の合計240本に対し、2023年度のみ13/14件。公式indexの本塁打欄でも1〜8号と10〜14号の13件しか収録されておらず、イベント分類だけの問題とは確認できない。2件を削って数字を合わせず、試合種別の照合と取得漏れをそれぞれ調査・修正する必要がある。
