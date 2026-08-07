# ADR 0015: Planner Contractとレイヤー境界

- Status: Accepted
- Date: 2026-08-07

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
| conversation context | `followUpType`, `referencedContext`, `targetEntity`, `followUpContext`, correction metadata。どの履歴をどう参照したか | Planner |

重複していたトップレベル`intent`は廃止し、`structuredQuery.intent`だけを正とする。平坦な`questionIntent` / `capabilityRoute`等はPlanner Contractから廃止し、`capability`へ集約する。Executorが公開execution metadataへ変換する場合だけ既存の平坦なAPI名を維持する。

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
