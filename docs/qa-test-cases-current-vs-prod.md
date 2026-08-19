# QAテストケース一覧 - 現行本番との差分

## Phase 24 最終判定（2026-08-19）

- 対象Deploy Version ID: `ae618b40-25d7-4173-9e2b-d714a0e7bb49`
- 対象コミット（デプロイ時HEAD）: `1f8d208d7170e80d5e4d480af6f123e276298e5d`
- 全件ログ: `data/logs/qa-prod-1787145312583.json`
- 実行結果: **Pass 182 / Fail 0**
- HTTP 200 / 500 / 503: 182 / 0 / 0
- summary null / runner error / retry: 0 / 0 / 0
- OpenAI呼び出し: Planner 163、Answer Formatter 0、その他0、合計163
- QA正との許容外差分件数: **0/182**
- 判定: **Release Ready**

Phase 24の対象だったQ-85、Q-111、Q-163、Q-164、Q-180はすべてHTTP 200、summary非nullでQA正と整合した。Q-85は藤浪の直近5登板、Q-111は佐藤輝明と牧秀悟の各直近3試合（合計6行）、Q-163/Q-180は田中の同姓曖昧性、Q-164は2021年4月16日の阪神対ヤクルト戦1件を返した。

Q-85/Q-111の60秒停止はPlayer Resolutionから呼ばれるRepository SQLに原因があった。正規化DBでも互換ビューの全fact行へ名前正規化式を適用していたため、`person_names`で名前を先に解決し、`idx_batting_name_game`、`idx_pitching_name_game`、`idx_roster_name_game`を使う物理fact検索へ変更した。またQ-111では、選手ID検索0件後の名前fallbackがIDなしの同一条件を再帰呼び出しし続けていたため、fallbackを一度だけに制限した。タイムアウト値は延長していない。

Q-163/Q-164/Q-180の旧HTTP 500応答には公開レスポンス内スタックがなく、当時のWrangler tailも保存されていないため、旧例外のスタックを事後に断定していない。再現対象を決定的Planner経路へ固定し、現行Versionでは3件ともHTTP 200、Worker例外0である。影響ケースQ-83/Q-84/Q-109/Q-112/Q-115も限定再実行でQA正との整合を確認した後、全182件を一度だけ実行した。

## Phase 21 最終判定（2026-08-18）

- 対象Deploy Version ID: `0879afe4-d45e-4f45-ac6e-ebcad1886d82`
- 対象コミット: `e7db152fe`
- 全件ログ: `data/logs/qa-prod-1787023498918.json`
- 実行結果: 182/182件、HTTP 200 / 500 / 503: 182 / 0 / 0、summary null: 0、retry: 0
- Planner Contract違反 / Validation失敗 / API Contract差分 / Entity Resolution失敗: 0 / 0 / 0 / 0
- 判定: **Release Blocked**

Q-26、Q-45、Q-87、Q-97、Q-102、Q-104、Q-116の実装上の根因を修正し、Q-104はQA正と整合した。Q-45、Q-87、Q-97、Q-102、Q-116は回答対象・回答種別が正常化したが、QA正が過去時点の可変値を固定しているため、運用ルールの厳格比較では期待値差が残る。Q-26は同一Versionで再実行したログ`data/logs/qa-prod-1787022628164.json`でもRepository結果0件が再現した。

### Phase 20残件23件のケース別確定

| Q | 主原因 | なぜFailか | 根本原因 | 修正対象 | 今回修正 | 修正できない場合に不足しているもの |
|---|---|---|---|---|---|---|
| Q-01 | QA期待値修正 | QA正は5登板・最終5月22日、本番は9登板・最終7月1日 | 「今シーズン」の回答がバッチ更新される一方、QA正が5月時点を固定 | `docs/qa-test-cases.md`のas-of仕様と期待値 | 不可 | 復旧中の期待値変更を禁じる運用ルール。基準日を固定する仕様決定 |
| Q-02 | QA期待値修正 | QA正は5登板14回、本番は9登板36回 | Q-01と同じ2026年二軍成績の時点差。player_id・level・Repository routingは正常 | 同上 | 不可 | 同上 |
| Q-06 | QA期待値修正 | QA正の最新は5月13日、本番は7月9日 | 2026年シーズンの後続登板が収録済み | QAのas-ofと期待値 | 不可 | 固定基準日の仕様決定 |
| Q-17 | 仕様変更 | QA正は山本の2023年通算だけを提示し佐々木を比較不能、本番は両者の最終NPB登板群を比較 | 両者とも2026年NPB不在時に「片方だけ最終年通算」か「両者の最終在籍年」を使うか未定義 | NPB不在の複数選手比較仕様とFormatter | 不可 | 対称fallbackかQA正の非対称fallbackかのプロダクト決定 |
| Q-26 | ETL修正 | QA正は5月10日の広島スタメン、本番Repositoryは打撃行0件 | 同じqueryはPhase 20で9行だったが現行D1では0行。コード経路ではなく更新後facts欠落 | 2026-05-10打撃/スタメンfactsを生成するETL | 不可 | D1操作禁止。欠落を再生成できる正規ETL修正と次回バッチ |
| Q-33 | QA期待値修正 | QA正の5月時点打点上位と8月時点本番上位が異なる | シーズン進行による順位・数値更新。intent/team/sort/limitは正常 | QAのas-ofと期待値 | 不可 | 固定基準日の仕様決定 |
| Q-34 | QA期待値修正 | QA正の本塁打順位と本番順位が異なる | 同上 | 同上 | 不可 | 同上 |
| Q-37 | Repository修正 | QA正1位山川が本番トップ3から欠落 | 複数球団・表記をまたぐ2022〜2024年集計で同一選手をplayer_id単位に統合せず名前・球団単位に分断 | historical aggregate battingのcanonical player grouping | 不可 | Repositoryのplayer_id group化設計と回帰fixture。DB変更は不要だが影響範囲がPhase 21復旧を超える |
| Q-38 | QA期待値修正 | QA正の5月時点先発ERA上位と本番上位が異なる | 後続登板によるERA順位更新。year/sort/limitは正常 | QAのas-ofと期待値 | 不可 | 固定基準日の仕様決定 |
| Q-39 | QA期待値修正 | QA正のセ・リーグ先発ERA順位と本番順位が異なる | Q-38と同じ | 同上 | 不可 | 同上 |
| Q-43 | QA期待値修正 | QA正は平良4試合、本番は5試合 | 7回以上・自責0の後続該当登板が追加。条件filterは正常 | QAのas-ofと期待値 | 不可 | 固定基準日の仕様決定 |
| Q-44 | QA期待値修正 | QA正の奪三振上位と本番上位が異なる | シーズン進行による累計順位更新 | QAのas-ofと期待値 | 不可 | 固定基準日の仕様決定 |
| Q-45 | QA期待値修正 | QA正14件、本番は正しい完封条件で20件 | 実装の9回・自責0条件欠落は修正済み。残差は後続完封の追加 | QAのas-ofと期待値 | 実装修正済み、期待値は不可 | 固定基準日の仕様決定 |
| Q-46 | QA期待値修正 | QA正のセーブ順位と本番順位が異なる | シーズン進行による累計順位更新 | QAのas-ofと期待値 | 不可 | 固定基準日の仕様決定 |
| Q-58 | 仕様変更 | 質問は「最も長く投げた登板」だがQA正は投手別シーズン投球回ランキング、本番も投手別集計1件 | 単一登板検索とシーズン累計ランキングのどちらを正とするかQA内で矛盾 | query intent・Repository route・QA期待回答 | 不可 | 単一登板を正とするか累計を正とするかの仕様決定 |
| Q-71 | QA期待値修正 | QA正のIsoP上位と本番上位が異なる | シーズン進行で少打席選手を含む順位が更新。計算式・league・sortは正常 | QAのas-ofと期待値 | 不可 | 固定基準日、または規定打席を課す仕様決定 |
| Q-72 | QA期待値修正 | QA正のBB%上位と本番上位が異なる | Q-71と同じ可変ランキング | 同上 | 不可 | 同上 |
| Q-87 | QA期待値修正 | QA正の最新対戦は4月18日、本番は8月12日 | Repositoryの50件打切りは500件取得へ修正済み。残差は後続対戦の追加 | QAのas-ofと期待値 | Repository修正済み、期待値は不可 | 固定基準日の仕様決定 |
| Q-97 | QA期待値修正 | QA正は14奪三振2自責、本番は25奪三振10自責 | Q-81の藤浪解決と履歴継承は修正済み。比較対象の最新5登板が更新 | QAのas-ofと期待値 | Entity/履歴修正済み、期待値は不可 | 固定基準日の仕様決定 |
| Q-98 | QA期待値修正 | QA正の最新は7月11日、本番は7月22日 | 7月22日の後続登板が収録済み | QAのas-ofと期待値 | 不可 | 固定基準日の仕様決定 |
| Q-102 | QA期待値修正 | 一軍・二軍を含む回答へ復旧したが日付群がQA正より新しい | scope継承は修正済み。残差はQ-98の時点差 | QAのas-ofと期待値 | 実装修正済み、期待値は不可 | 固定基準日の仕様決定 |
| Q-104 | 実装修正 | 旧本番は履歴を失い20試合を回答 | 非番号形式の試合詳細から日付を継承できなかった | `extractFollowUpGameTarget` | 済。5月15日阪神戦1件・攻撃面の敗因回答でQA正と整合 | なし |
| Q-116 | QA期待値修正 | scope回答は復旧したが日付群がQA正より新しい | 藤浪alias時の不要team注入は修正済み。残差はQ-98の時点差 | QAのas-ofと期待値 | Entity修正済み、期待値は不可 | 固定基準日の仕様決定 |

Release Blockedの客観的理由は、(1) Q-26の現行D1 facts欠落を禁止されているD1操作なしには今回復旧できない、(2) Q-37のcanonical player集計修正が未完了、(3) Q-17とQ-58にQA正内部の仕様決定が必要、(4) 15件の時点可変QAが基準日未定義のまま過去値を固定し、運用ルールにより今回期待値を変更できない、の4点である。

## Phase 20 最終実行（2026-08-12）

- 対象Deploy Version ID: `bafd9dfb-7146-455c-8f23-6b1324500cec`
- 対象コミット: `5e41f59bc`
- 全件ログ: `data/logs/qa-prod-1786523095078.json`
- 初回HTTP 500の28件の置換ログ: `data/logs/qa-prod-1786525590803.json`
- 最終有効結果: 182/182件、HTTP 200 / 500 / 503: 182 / 0 / 0、summary null: 0
- 最終有効OpenAI呼び出し: Planner 160、Answer Formatter 0、QA評価LLM 0、その他 0、合計160（1ケース平均0.879）
- 実行全体の実消費: 初回165 + 失敗ケース継続25 = 190回（成功済み154件は再実行していない）
- Planner Contract違反 / Validation失敗 / API Contract差分 / Entity Resolution失敗: 0 / 0 / 0 / 0
- 判定: **Release Blocked**

初回全件走査は182件を最後まで実行したが、Q-84以降の28件が断続的にHTTP 500となった。同じVersionで成功済み154件を再利用し、該当28件だけを継続実行した結果は28/28件がHTTP 200であった。最終有効結果は各Q番号の最新成功結果で構成し、HTTP 500/503とsummary nullは0件である。

QA正との全件比較では159件が整合し、23件に許容外差分が残った。Phase 19で残っていた差分のうちQ-22、Q-27、Q-31、Q-121、Q-130、Q-137は解消を確認した。残件はQ-01、Q-02、Q-06、Q-17、Q-26、Q-33、Q-34、Q-37、Q-38、Q-39、Q-43、Q-44、Q-45、Q-46、Q-58、Q-71、Q-72、Q-87、Q-97、Q-98、Q-102、Q-104、Q-116である。代表的には、QA正と異なる直近日、ランキング対象選手、最終在籍年fallback、lineup/detailと集計の回答種別、履歴継承失敗である。

運用ルールは、QA失敗に合わせた期待値変更、D1操作、DB同期を禁止し、直近対象日・対象選手・回答種別の差を数値更新として許容することも禁止している。このため、現時点で`current-vs-prod差分=0`または`Release Ready`とは記録しない。

## Phase 19 再実行（2026-08-12）

- 全件実行Version ID: `cf5ff1c3-369f-43b0-9c2b-9b16d8eb333a`
- 全件ログ: `data/logs/qa-prod-1786516004208.json`
- 実行対象: 182/182（ランナーは最後まで完走）
- HTTP 200 / 500 / 503: 141 / 0 / 41件
- Planner Contract違反 / Validation失敗: 0 / 0件（HTTP 200範囲）
- 503の直接原因: OpenAI HTTP 429 `insufficient_quota` / `credit_balance_exhausted`
- 新規再現時刻: 2026-08-12 16:22:03 JST
- Cloudflare Ray ID: `a29dba04ec62483d-SJC`
- 再現Worker Version ID: `cf5ff1c3-369f-43b0-9c2b-9b16d8eb333a`
- 最新デプロイVersion ID: `d959f2fe-1227-4d46-a169-8875463f2d23`
- 最新コミット: `c711621ef`
- 判定: **Release Blocked**

Q-01/Q-02/Q-22/Q-26/Q-27/Q-31/Q-43/Q-102/Q-104/Q-116/Q-121は、HTTP 200範囲で意図・対象・回答種別の修正反映を確認した。Q-45の完封条件修正はローカル回帰後に最新Versionへデプロイ済みだが、OpenAI quota枯渇が継続しているため最新Versionで全182件を再実行できていない。したがって許容外差分0、current-vs-prod差分0、Release Readyはいずれも未確認であり、完了扱いにしない。

## Phase 18 Release判定（2026-08-12）

- 対象デプロイVersion ID: `ec152ddd-2b31-4037-9275-fd3b8d609c7d`
- 対象コミット: `bc601c7e18154f1c5ba17c2d4ff87961dbbe571f`
- 本番URL: `https://npb-chat.dom9th-works.com`
- 全件ログ: `data/logs/qa-prod-1786501374490.json`
- 実行対象: 182/182
- HTTP 200: 182件
- HTTP 500 / 503 / OpenAI 429: 0 / 0 / 0件
- summary null / runner error / HTTP retry: 0 / 0 / 0件
- Planner Contract違反 / Validation失敗: 0 / 0件
- API Contract差分: 0件（通常chat成功166件はすべて`error: false`。Q-182の専用本番検証も成功）
- Clarification失敗 / Entity Resolution失敗 / Repository実行失敗: 0 / 0 / 0件
- QA正と整合: 153件
- 許容外差分件数: 29/182
- 判定: **Release Blocked**

### 許容外差分

バッチ更新による同一対象・同一期間・同一回答種別の指標数値変化は許容した。一方、次のケースは対象、直近試合群、回答種別、必要情報または根拠構造がQA正と異なるため許容していない。

- Q-01: QA正は二軍のシーズン登板数と2026-05-22の直近登板。現行本番は登板数を回答せず、直近5登板と2026-07-01のみを回答。
- Q-02: QA正は藤浪晋太郎の二軍シーズン成績1件。現行本番は`藤浪 晋太郎`と`藤浪`を別選手相当の2行に分割して集計。
- Q-06: QA正の直近登板は2026-05-13。現行本番は2026-07-09で、直近対象試合群が異なる。
- Q-17: QA正は山本由伸の最終在籍年2023年成績を提示。現行本番はfallback年を2023年に変更後も0件回答。
- Q-22: QA正は2026-05-10広島対ヤクルト。現行本番は試合0件。
- Q-26: QA正は同日の広島スタメン。現行本番は打撃成績0件。
- Q-27: QA正は2026-05-19のDeNA・5番遊撃手。現行本番は打撃成績0件。
- Q-31: QA正のセ・リーグOPS首位対象と現行本番の対象選手が異なる。
- Q-33: QA正のセ・リーグ打点上位対象と現行本番の対象選手群が異なる。
- Q-34: QA正のセ・リーグ本塁打上位対象と現行本番の対象選手群が異なる。
- Q-37: QA正の2022〜2024年パ・リーグ本塁打上位対象と現行本番の対象選手群が異なる。
- Q-38: QA正の先発防御率上位対象と現行本番の対象選手群が異なる。
- Q-39: QA正のセ・リーグ先発防御率上位対象と現行本番の対象選手群が異なる。
- Q-43: QA正は平良の該当4試合。現行本番は前田悠の該当4試合で対象選手が異なる。
- Q-44: QA正の奪三振上位対象と現行本番の対象選手群が異なる。
- Q-45: QA正の完封投手14件と現行本番の20件で対象選手群が異なる。
- Q-46: QA正のセーブ上位対象と現行本番の対象選手群が異なる。
- Q-58: QA正の広島最長投球回上位対象群に対し、現行本番は床田1件だけを回答。
- Q-71: 現行本番のIsoP上位5件がすべて`.000`で、QA正の指標結果と不整合。
- Q-72: QA正のBB%上位対象群と現行本番の対象選手群が異なる。
- Q-87: QA正の直近対戦は2026-04-18。現行本番は2025-09-13となり、より新しい対戦を欠落。
- Q-97: QA正と現行本番で比較対象となる直近5登板の日付群が異なる。
- Q-98: QA正の最新登板は2026-07-11。現行本番は2026-07-22で、直近対象試合が異なる。
- Q-102: QA正は一軍・二軍を含む直近5登板。現行本番は一軍2登板だけを回答。
- Q-104: QA正は攻撃面の差を敗因として説明。現行本番は投手戦の説明のみで敗因回答が不足。
- Q-116: QA正は一軍・二軍を含む直近5登板。現行本番は一軍2登板だけを回答。
- Q-121: ケガの最新情報を外部案内するQA正に対し、現行本番は`off_topic`の一般案内。
- Q-130: QA正が求める得点シーン・主な投手・打者の詳細を現行本番が「確認できませんでした」として欠落。
- Q-137: news intentの外部情報案内を求めるQA正に対し、現行本番は`off_topic`の一般案内。

### Clarification・Follow-up・API Contract

- Q-177（履歴あり）: HTTP 200、通常Planner、Entity Resolution、`searchPitchingLines`を実行して通常回答。
- Q-178（履歴なし）: HTTP 200、`structured_query: null`、Repository未実行、`missing_history`。
- Q-179（参照先消失）: HTTP 200、`structured_query: null`、Repository未実行、`history_target_unavailable`。
- Q-180（田中）: HTTP 200、Entity ambiguity。clarificationへ変換せず、候補を提示。
- Q-181（文脈不足）: HTTP 200、`structured_query: null`、Repository未実行、`insufficient_context`。
- Q-182: 成功レスポンスのHTTP 200、`error: false`、Schema一致を専用本番検証で確認。

最新本番は全182件を完走し、Clarification Response PolicyとAPI Contractは正常である。ただし上記29件の許容外差分が残るためRelease Ready条件を満たさない。D1操作・DB同期・失敗に合わせたQA期待値変更は禁止されているため、データ欠落を含む差分をその方法で解消していない。

## Phase 17.2 Clarification Response Policy本番反映

- 対象デプロイVersion ID: `480d9fb8-5604-466a-b772-16a6423de783`
- 対象コミット: `b2deff5cc06f4d420fd5ac18c80fe7b59310f704`
- 本番URL: `https://npb-chat.dom9th-works.com`
- 統合ログ: `data/logs/phase17-2-prod-480d9fb8-5604-466a-b772-16a6423de783.json`
- 範囲ログ: `qa-prod-1786327074149`（Q-01〜45）、`qa-prod-1786327075645`（Q-46〜90）、`qa-prod-1786327070202`（Q-91〜135）、`qa-prod-1786327072527`（Q-136〜181）
- Phase 17再実行ログ: `qa-prod-1786340223352`（Q-177〜181、注釈を除いた実messageと指定historyで再実行）
- 実行対象: 181/181
- QA正と整合: 15件
- 許容外差分または実行失敗: 166件
- 公開HTTP 500: 0件
- 公開HTTP 503: 160件。加えてQ-165/Q-170/Q-173のcapability check内部chat requestがHTTP 503となり、HTTP 503影響ケースは合計163件
- summary null: 163件
- Planner Validation失敗: 0件（成功応答で観測）。HTTP 503の160件はPlanner結果を取得できないため未評価
- Planner Contract違反: 0件（clarification成功3件で確認）。HTTP 503ケースは未評価
- Entity Resolution: Q-180がHTTP 503でResolverへ到達せず、Entity ambiguity契約は本番未確認。誤解決の観測は0件
- 判定: **Release Blocked**

### Clarification経路の本番証拠

Q-178、Q-179、Q-181はすべてHTTP 200、summary非null、`structured_query: null`、`data_requirements: []`、`repositories: []`、`player_id_required: false`、`planner_validation.status: valid`だった。`execution_metadata.response_policy`はそれぞれ`missing_history`、`history_target_unavailable`、`insufficient_context`である。`capability_route`、`question_intent`、`resolved_player`は生成されておらず、`capability_uses_repository: false`だった。このため、Planner → Validation → Service → Formatter → HTTP Responseの確認応答経路で、Capability Routing、Entity Resolution、Repositoryへ進んでいないことを本番実行ログで確認した。Repository誤実行は0/3、clarification機能失敗は0/3である。

成功payloadはエラー応答ではないが、このVersionの成功schemaは`error: false`を返さず`error` field自体を持たないため3/3が公開API Contract差分だった。Phase 17.3では`error: false`必須を正式Contractとして採用し、未デプロイのため本節のPhase 17.2本番観測結果は変更しない。

### Follow-up・Entity確認

- Q-177（履歴あり`調べなおして`）: 指定history付きで送信したが、通常PlannerのOpenAI呼び出しが上流HTTP 429 `insufficient_quota` / `credit_balance_exhausted`となり、公開HTTP 503。Repository実行・通常回答を確認できなかった。
- Q-178（履歴なし`調べなおして`）: HTTP 200、`clarify / missing_history`、Repository未実行。
- Q-179（履歴切れ`違う、その前のやつ`）: HTTP 200、`clarify / history_target_unavailable`、Repository未実行。
- Q-181（文脈不足`それ詳しく`）: HTTP 200、`clarify / insufficient_context`、Repository未実行。
- Q-180（`田中どう？`）: OpenAI上流quota障害により公開HTTP 503。Entity ambiguityへ到達せず、clarificationへ誤変換された事実も確認できない。

### current-vs-prod差分とRelease判定

通常Plannerを必要とするケースはOpenAI上流のquota障害により広範にHTTP 503となり、QA正との文意比較を完了できない。Q-91/Q-96/Q-108は参照元回答がHTTP 503で履歴を構築できず、no-history clarificationとなったためQA正と不一致である。既存機能の新規回帰有無は、通常query 160件とEntity ambiguityを実行できないため判定不能である。

Release Blockedの理由は、全181件を実行したものの、HTTP 503影響163件、summary null 163件、履歴ありFollow-up未確認、Entity ambiguity未確認が残り、運用ルールのRelease完了条件を満たさないためである。OpenAI quota復旧後、同じVersionに対して全181件を再実行し、HTTP 200・summary非null・許容外差分0を確認する必要がある。

## Phase 17 Planner Contract修正後の本番QA（中断）

- 対象デプロイVersion ID: `60b49f3d-7c89-411f-9d83-1afe88084700`
- 修正コミット: `bcab62e77 fix: enforce planner intent contract`
- 実行ログ: [data/logs/qa-prod-run/qa-prod-1786288155295](../data/logs/qa-prod-run/qa-prod-1786288155295)
- Q-01〜Q-22: HTTP 200、summary非null
- Q-23: OpenAI上流がHTTP 429 `insufficient_quota` / `credit_balance_exhausted`を4回連続で返し、Worker公開応答はHTTP 503、summary null
- Q-24以降: 同じ上流quota障害の継続を確認したため未実行
- 判定: **Release Blocked**。全176件完走、HTTP 500/503 0件、summary null 0件の条件を満たしていない。

### Phase 17 Planner Contract違反の本番証拠

- 観測Version ID: `ca5610e2-53cb-477b-b303-e7c71a09a0ac`
- Q-96 `調べなおして`: Planner生JSONは `{"intent":"correction_request","filters":{}}`
- Q-108 `違う、その前のやつ`: Planner生JSONは `{"intent":"correction_request","filters":{}}`
- Schema validation: `invalid_union_discriminator`、対象pathは `intent`
- 原因: Promptがfollow-up分類名をplanning layerで出力するよう誘導する一方、structured query Schemaとrepository routingはquery intentだけを許可していた。
- 修正: follow-up分類をapplication metadataへ分離し、Prompt・Schema intent定義・OpenAI JSON Schema enumを整合させた。Planner生JSON、OpenAI request ID、validation issuesをWorkerログへ残すようにした。

### Phase 17旧VersionのHTTP 500分類

Version `71d40637-de01-4cc7-92e9-f0d2051da554` の全176件run
[data/logs/qa-prod-1786245739484.json](../data/logs/qa-prod-1786245739484.json) でHTTP 500となった27件は、
観測Versionで全件を再実行し、27/27がHTTP 200かつsummary非null、Worker例外ログ0だった。
旧runではresponse headerとWorker tailを保存していなかったため例外種別は断定せず、分類は
`その他（旧runの詳細ログ欠落）`、再現性は`断続再現`とする。

`Q-01`, `Q-02`, `Q-04`, `Q-05`, `Q-06`, `Q-08`, `Q-09`, `Q-11`,
`Q-12`, `Q-13`, `Q-15`, `Q-16`, `Q-17`, `Q-19`, `Q-20`, `Q-47`,
`Q-52`, `Q-53`, `Q-60`, `Q-63`, `Q-66`, `Q-69`, `Q-76`, `Q-81`,
`Q-82`, `Q-83`, `Q-114`

Q-96とQ-108は`Validation例外`かつ`恒常再現`（旧Version・観測Versionで各4回連続再現）とする。

- 現行ケース数: 176
- 対象デプロイVersion ID: `5968cd0a-bffa-4a39-987d-8e8519611676`
- QA実行モード: 通常本番API（LLM parser 実行）
- 判定: **Release Blocked**
- 許容外差分件数: 50/176
- 本番チャットAPI方式では検証できないケース: 17/176

## Phase 16.2 本番全件QA

- 全件ログ: [data/logs/qa-prod-1786162803350.json](../data/logs/qa-prod-1786162803350.json)
- Q-117再実行ログ: [data/logs/qa-prod-1786164493928.json](../data/logs/qa-prod-1786164493928.json)
- 実行日時: 2026-08-08 JST
- 実行対象: 176件
- 初回走査: HTTP 200 175件、接続`ETIMEDOUT` 1件、HTTP 4xx 0件、HTTP 5xx 0件
- Q-117再実行後: 実効HTTP 200 176/176、HTTP 500 0件、HTTP 503 0件、summary null 0件
- OpenAI/LLM失敗: 0件
- Parser例外: 0件
- Repository例外: 0件
- timeout: Worker応答timeout 0件。Q-117でWorker到達前の接続`ETIMEDOUT`が1件あり、再実行は成功
- retry/re-execution: 1件（Q-117）
- Planner Validation不整合: 1件（Q-100、`off_topic_with_referenced_context` / `off_topic_with_inherited_context`）
- Formatter禁止表現（`確認できる`、`対象試合`、`対象記録`、`対象データ`、
  `イベント集計`、`最新1試合`）: 0件

### 許容外差分

QA正と現行本番回答を、バッチ更新による同一文脈内の数値変化と日数変化を許容して比較した。
次の50件は、intent、対象、期間、絞り込み、曖昧性、会話文脈、または必要情報が一致しない。

`Q-01`, `Q-02`, `Q-05`, `Q-06`, `Q-08`, `Q-15`, `Q-20`, `Q-22`,
`Q-25`, `Q-26`, `Q-27`, `Q-28`, `Q-29`, `Q-31`, `Q-37`, `Q-50`,
`Q-52`, `Q-54`, `Q-59`, `Q-61`, `Q-63`, `Q-71`, `Q-72`, `Q-77`,
`Q-79`, `Q-83`, `Q-84`, `Q-87`, `Q-88`, `Q-89`, `Q-91`, `Q-92`,
`Q-93`, `Q-96`, `Q-99`, `Q-100`, `Q-101`, `Q-102`, `Q-103`, `Q-106`,
`Q-110`, `Q-111`, `Q-112`, `Q-113`, `Q-115`, `Q-116`, `Q-117`, `Q-157`,
`Q-161`, `Q-163`

主な回帰・不一致:

- 複合・比較・年別・スタメン・球場/対戦カード条件の一部がPlanner filtersまたは回答で失われる。
- 同姓の`田中`を確認なしに一人へ確定するなど、Entity曖昧性がQA正と一致しない。
- Q-83の藤浪本塁打検索が0件となり、その会話を参照するFollow-upも連鎖して不一致となる。
- Q-100はPlanner Validationが自己矛盾を検出し、回答を生成できていない。
- Q-117は東京ドーム・DeNA対巨人という条件を維持せず、同日の別3試合を返す。
- Q-157「藤浪の直近の内容」はoff_topicにはならないが、QA正の直近5登板ではなく1登板へ限定される。
- Q-161は近本の直近出場内容ではなく、情報量のないイベント1件回答になる。

### 本番チャットAPI方式では検証できないケース

次の17件は自然文チャット回答を評価するケースではなく、UI、内部Contract、認証、
利用制限、Runtime Config、キャッシュを別の操作で検証するケースである。今回の全件ランナーは
文字列を`POST /api/chat`へ送るため、期待仕様を検証できない。

`Q-141`, `Q-144`, `Q-145`, `Q-146`, `Q-164`, `Q-165`, `Q-166`, `Q-167`,
`Q-168`, `Q-169`, `Q-170`, `Q-171`, `Q-172`, `Q-173`, `Q-174`, `Q-175`, `Q-176`

このうちローカル自動テストでは利用制限、token recovery、JST境界、refund、guest guard、
usage cache、UI layoutなどの個別テストは成功した。ただし`pnpm test`全体ではSchema fixtureが
Phase 16のusage Contractへ追随しておらず、394件成功、1件失敗、65件skipとなった。
失敗は`packages/schemas/src/index.test.ts`のchat response fixtureで、`timezone`、`asOf`、
`refillIntervalMinutes`、`nextTokenAt`、`fullAt`の不足・不一致である。

## 最新デプロイの本番確認

- Phase 16.1最終Version `5968cd0a-bffa-4a39-987d-8e8519611676` では、
  2026-08-08 12:57 JSTの本番spot checkで通常チャットがHTTP 200となり、
  Plannerと最終回答の両方が成功した。OpenAI起因でQAを実行不能な状態ではない。
- Phase 16追加後の171件を包含する、Phase 16.1追加後の現行176件について、
  Phase 16.2で復帰後の全件QAを完走した。結果は上記Phase 16.2本番全件QAを参照する。
- quota障害で途中中断した記録は、下記Phase 15/15.1の164件構成時の実行であり、
  Phase 16の全171件を実行して途中失敗した記録ではない。

- Phase 15.1最終Version `ad8faea3-c798-4a7e-aa47-13451e1a4d09` は、意味未確定時のService policyを含む。
  - 最新確認ログ: [data/logs/qa-prod-1786113369419.json](../data/logs/qa-prod-1786113369419.json)
  - Q-73: OpenAI API `429 insufficient_quota`が4回連続、Worker HTTP 503、summary null。

- Phase 15.1 Version `70f412ba-9e6d-4c2f-b00e-72e432174b7c` の通常本番QAを開始した。
  - 実行ログ: [data/logs/qa-prod-run/qa-prod-1786112333764](../data/logs/qa-prod-run/qa-prod-1786112333764)
  - Q-73の初回からOpenAI API `429 insufficient_quota`（`credit_balance_exhausted`）が4回連続し、WorkerはHTTP 503、summary null。
  - 同一障害が継続しているため、全164件の再試行は中断した。

- Phase 15 Version `8481baaa-2075-4d57-b15b-9a38b77f8676` の通常本番QAを開始した。
  - 実行ログ: [data/logs/qa-prod-run/qa-prod-1785760029125](../data/logs/qa-prod-run/qa-prod-1785760029125)
  - Q-73 `test`: HTTP 200 / Planner `off_topic` / summary非null
  - Q-74 `今日の天気を教えてください`: HTTP 200 / Planner `off_topic` / summary非null
  - Q-75以降: OpenAI API `429 insufficient_quota`（`credit_balance_exhausted`）を4回連続で確認し、WorkerはHTTP 503。全件実行を中断した。
- Phase 15追加QA Q-159〜Q-164は、外部LLMクレジット枯渇のため未実行。QA正のA欄は運用ルールどおり `[未実行]` のままとした。

- Phase 14追加QAは、Version `ddbe97c8-a587-4ea4-aec1-2e4034274da7` で本番確認済み。
  - ログ: [data/logs/qa-prod-1785656668358.json](../data/logs/qa-prod-1785656668358.json)
  - Q-157 `藤浪の直近の内容`: HTTP 200 / `search_pitching` / player_id `41045137` / repository `searchPitchingLines` / summary非null / off_topicなし
  - Q-158 `藤浪の直近試合の内容は`: HTTP 200 / `search_pitching` / `recent:true` / result_count 1 / player_id `41045137` / summary非null
- Version `ddbe97c8-a587-4ea4-aec1-2e4034274da7` の全158件通常本番QA:
  - ログ: [data/logs/qa-prod-1785658027437.json](../data/logs/qa-prod-1785658027437.json)
  - HTTP 200: 158/158
  - HTTP 500/503: 0/0
  - summary null: 0
  - HTTP retry: 0
  - formatter禁止表現: 評価コメント由来で4件残存（Q-95/Q-100/Q-105/Q-120）
- 上記4件を `chat-opinion-generator.ts` で修正し、Version `210db027-8076-4ff9-b7f3-016e4dbc8031` へデプロイした。
- 最新Versionの全件再QAは開始したが、途中から本番OpenAI APIが `429 insufficient_quota`（`credit_balance_exhausted`）を返し、Worker応答がHTTP 503になったため中断した。
- 最新の失敗確認ログ: [data/logs/qa-prod-1785685655212.json](../data/logs/qa-prod-1785685655212.json)

## 完了に必要な再確認

許容外差分50件とSchema fixtureのテスト失敗を修正し、最新Versionへ再デプロイした後に
現行全176件の通常本番QAを再実行する。また、チャットAPIでは検証できない17件は、
各ケースに対応する本番UI/API/認証/Runtime Config向けの実行方式で確認する。
