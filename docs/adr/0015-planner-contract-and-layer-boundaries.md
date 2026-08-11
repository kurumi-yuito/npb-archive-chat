# ADR 0015: Planner Contractとレイヤー境界

- Status: Accepted
- Date: 2026-08-07（2026-08-10 clarification方針追記）

## Context

Phase 15でPlanner前段のtopic regex gateを撤去したが、Planner出力をValidationが変更し、Serviceがcapabilityを再分類する責務重複が残った。自然言語解釈、整合性検証、routing、回答方針を独立させる必要がある。

## Decision

### Request Guard / Topic判定

Planner前段はschema、空文字、最大長、履歴形式、auth、rate limitなど機械的条件だけを検査する。topicや省略表現の意味は判断しない。

### Planner

Plannerは自然言語と会話履歴を解釈する唯一のレイヤーであり、次のContractを返す。

| Field | 意味 | Authority |
| --- | --- | --- |
| `domain` | 質問がNPB領域か、非NPBか、意味を確定できないか。`npb` / `non_npb` / `undetermined` | Planner |
| `structuredQuery.intent` | 実行したいNPB操作。検索・集計・試合詳細など | Planner |
| `structuredQuery.filters` | Repository実行に渡す制約値 | Planner |
| `entities` | 解釈された人物・球団・試合の参照情報。現状はfiltersから作るread-only projectionであり、別の判断源にしない | Planner |
| `capability` | 回答に必要な能力とrouteをまとめた値。`kind`, `route`, `requiresAnalysis`, `usesRepository`, `externalSourceUrl` | Planner |
| `answerMode` | 実行結果を直接回答・詳細説明・比較説明など、どの提示形式で回答するか | Planner |
| `responsePolicy` | Repository実行へ進めず確認応答へ停止すべき場合の方針。通常は`null`、確認時は`{ action: clarify, reason }` | Planner |
| conversation context | `followUpType`, `referencedContext`, `targetEntity`, `followUpContext`, correction metadata。どの履歴をどう参照したか | Planner |

重複していたトップレベル`intent`は廃止し、`structuredQuery.intent`だけを正とする。平坦な`questionIntent` / `capabilityRoute`等はPlanner Contractから廃止し、`capability`へ集約する。Executorが公開execution metadataへ変換する場合だけ既存の平坦なAPI名を維持する。

`domain`は対象領域、`structuredQuery.intent`はデータ操作、`capability`は処理能力とroute、`answerMode`は回答の提示形式であり、相互に代替しない。`analytical` capabilityと`comparison_explanation`等のanswerModeには近接した概念があるが、前者は分析処理の要否、後者は回答表現を決めるため意図的に分離する。`off_topic`だけは既存公開query contract上の境界値として残るためdomainと情報が重複するが、`domain: non_npb`との一致をValidationで不変条件として検査する。

### Clarification response policy

確認応答はquery intentでもcapabilityでもなく、Plannerが決めるresponse policyとする（比較案C）。文脈不足・履歴不足・参照先消失により実行対象を安全に特定できない場合、`responsePolicy.action: clarify`とreasonを返し、`structuredQuery`と`capability`は生成しない。ServiceはValidation後、Entity Resolution・Capability Routing・Repositoryより前で停止し、Formatterへpolicyを渡す。

理由は次の通り。

- 案A（intent）は、データ操作を表す`structuredQuery.intent`へ応答制御を混在させ、架空のRepository queryを作るため採用しない。
- 案B（capability）は、処理対象が確定した後の能力routingへ、処理対象未確定という前条件を混在させる。Repositoryを使わない特殊routeも増えるため採用しない。
- 案Cは、元の質問意図を解決できる場合は通常intentを維持し、解決不能時だけquery生成前に停止できる。Repository、Entity Resolution、Formatter、Follow-upの境界が一方向になる。

比較すると、案CはPlanner Contract、Repository、Capability Routing、Entity Resolution、Follow-upとの整合と将来拡張性が最も高い。Formatterはreasonから確認文を作るだけで再判定しない。独立fieldと停止分岐の実装は案A/Bよりわずかに増えるが、責務重複と不正routeを防ぐ長期コストを優先する。

`off_topic`はNPB領域外と確定した質問であり、確認してNPB queryへ回復させる状態ではない。clarificationはNPB会話として扱えるが実行対象が不足しており、追加情報で回復可能な状態である。

Entity ambiguityはquery intentと名前entityが確定した後、Resolverが候補を一意にできない状態である。Resolverが候補を返し、clarification response policyへ変換しない。Follow-upは会話参照の分類・継承処理そのものであり、履歴から対象を確定できれば通常queryを実行する。clarificationはFollow-up解決が成立しなかった場合の停止方針だけを表す。

Plannerがフルネームを返しても、収録済みの試合factが登録姓だけを保持する場合がある。この表記差はEntity Resolutionが、検証済みの「フルネーム・登録姓・在籍球団」対応だけを使って吸収する。単に先頭の姓が一致しただけではフルネームを解決せず、既知球団と矛盾する明示teamがある場合も対応を適用しない。これにより、通常のフルネーム検索を維持しながら、同姓選手を誤って確定することを防ぐ。

Phase 18ではこの境界を次のように補強した。

- 年度・recent条件はfact検索の条件であり、短い登録名のidentity候補を一意化する条件には使わない。同姓候補が複数ならEntity Resolutionで停止する。
- フルネームのexact候補がhistorical row由来で`player_id`を持たない場合に限り、検証済み登録名で再解決する。複数選手比較でも同じ規則を使う。
- 打者対投手のcareer matchupでは、現在所属をRepository filterへ自動注入しない。現在所属で絞ると移籍前の直接対決を失うためである。
- season成績、年別、ランキング件数、単一登板とrecent formの区別はPlanner adapterで明示的意味を保存する。Serviceがstandalone質問を別intentへ再分類しない。
- follow-upの明示的な訂正・再確認・scope確認については、Plannerの`followUpType`、correction、context metadataと保持履歴が一致する場合に限り、Service Policyが継承queryを具体化できる。これは新しいintent分類ではなく、Plannerが表現した会話操作をRepository queryへ射影する処理である。対象を特定できなければclarificationで停止する。
- scope follow-upのFormatterは、取得済み結果とPlanner metadataから「一軍」「二軍」「両方」の内訳を説明し、scopeを再判定しない。

確認時にRepositoryを実行しないのは、対象や条件が未確定な検索が誤選手・誤試合の回答を生むためである。確認応答はシステム障害ではなく正常な対話継続なのでHTTP 200を返す。公開応答では`structured_query: null`と`execution_metadata.response_policy`を返し、実行queryが存在しないことを明示する。

### Planner Validation

ValidationはPlanner出力を入力として、次の結果だけを返す純粋関数とする。

- `valid`
- `planner_output_invalid`: schemaまたは必須項目不足
- `planner_output_inconsistent`: field間の矛盾

ValidationはPlanner出力を変更せず、domain・intent・capability・confidenceを補正しない。自然文を入力に取らず、再計画、確認質問、回答文も作らない。

### Orchestration policy

Validation失敗後の振る舞いはServiceが決める。現在は安全にRepository実行を止め、contract failure応答を返す。将来、再計画を採用する場合もValidationではなくService policyとして実装する。

### Capability Routing

Plannerが確定した`capability`だけを消費して、repository analysis、opinion追記、external source guidanceへroutingする。Serviceで元質問を再分類しない。

### Answer Formatter

Executorが取得したresults、sources、resolution metadataから質問へ直接答える。domain、intent、capabilityを再判定せず、Planner矛盾時の対応も決めない。

## Ambiguity decision

単一の`ambiguous`状態は採用しない。

- 意味・domainを確定できない状態: Planner Contractの`domain: undetermined`
- 選手候補を一意に解決できない状態: Entity Resolutionの`PlayerResolution.status: ambiguous`

両者は発生段階も利用者への確認内容も異なるため分離する。今回、Entity ResolutionのContractは変更しない。`undetermined`をLLM parserから直接生成する拡張は将来課題とし、Validationが代入することは禁止する。

## Rejected alternatives

- Validationが`domain: ambiguous`や`clarificationRequired`へ書き換える: 検証とpolicyが混在するため却下。
- Serviceが元質問からcapabilityを再分類する: Plannerと二重判定になるため却下。
- Entity ambiguityとsemantic ambiguityを一つの値へ統合する: 解決主体と回復方法が異なるため却下。
- topic regex gateを復活させる: false negativeとPlanner責務重複を再導入するため却下。

## Consequences and extension policy

- Planner Contract変更はschemaとcontract testを同時に更新する。
- 新しい自然言語分類はPlannerへ追加し、Validationへregexを追加しない。
- Validation issueはfield間の不変条件としてのみ追加する。
- 再計画回数、確認応答、障害応答はService policyとして独立させる。
- Phase 14のmigration regexは能力単位QA安定後に撤去する。
