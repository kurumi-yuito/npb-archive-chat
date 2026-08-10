# ADR 0016: 成功APIレスポンスのerror discriminant

- Status: Accepted
- Date: 2026-08-10

## Context

`POST /api/chat`の非2xxエラーはH3/Nitroの公開形式として`error: true`を返す一方、成功レスポンスは`error` fieldを省略していた。Phase 17.2では利用者向け期待に`error: false`が現れ、実装、Schema、型、QAのContractが一致していないことが判明した。

## Decision

HTTP 2xxの成功レスポンスは必須fieldとして`error: false`を返す。省略を許可しない。

- 公開成功Schema `chatResponseSchema`は`z.literal(false)`を必須とする。
- 公開成功型`ChatResponse`は`error: false`を持つ。
- 公開エラーSchemaは`error: true`を持ち、`ChatApiResponse`を成功・失敗のdiscriminated unionとする。
- Service、Planner、Formatterが扱う`ChatResponseCore`にはHTTP成否を含めない。
- Route境界だけが成功payloadへ`error: false`を付与する。

これにより、クライアントはHTTP statusに加えて`response.error`でexhaustiveに分岐でき、JSON Schema、将来のOpenAPI、TypeScript、QAが同じ必須fieldを共有する。

## Alternatives

### 案A: 成功時にerror: falseを返す

採用。失敗時の`error: true`と対称で、literal discriminantによる型安全性が得られる。既存成功payloadへのfield追加なので、未知fieldを許容する通常のJSONクライアントに対して後方互換である。QAもfieldの存在と値を一つのassertionで検証できる。

### 案B: 成功時はerror fieldを省略する

不採用。payloadは小さいが、`undefined`が成功なのか旧Version・不完全payloadなのか区別できず、型はoptional fieldまたはHTTP statusへの暗黙依存になる。失敗形式との非対称性が残り、OpenAPI/JSON SchemaとQAで「field不在」を個別に表現する必要がある。

## Consequences

- 厳格に追加fieldを拒否する非標準クライアントには影響し得るが、一般的なJSON利用者には後方互換な追加変更である。
- 旧Versionの成功レスポンスにはfieldがないため、デプロイ前後を混在して扱うクライアントは移行期間中HTTP statusも併用する。
- Q-182を本番確認するまでQAのA欄には実行結果を書かない。
