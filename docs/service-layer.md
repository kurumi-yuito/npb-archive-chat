# Service 層と Repository 層

Nuxt の **route handler**（`server/api/**`）から **SQL を直接書かない**ため、`apps/web` に **service**、共有 DB ロジックは `packages/db` に **repository** を置く。

## 責務の分担

### Repository（`packages/db/src/repository/*`）

- **検索用 DB（`QueryDatabase`）への読み取りクエリ**と、結果行の **最小列のマッピング**だけを担当する（ローカルは SQLite、Workers は D1 を同じインターフェースで利用）。
- `searchEvents` / `listEventsByGameId`、`searchGames`、`searchBattingLines`、`searchPitchingLines`、`searchRosterEntries`、`searchGameDetails`、aggregate 系、player candidate search のように、テーブル単位の関数としてまとめる。
- 入力は `@npb/schemas` の Zod で定義したフィルタ型（例: `SearchEventsFilters`）を `parse` 済みのオブジェクトとし、**完全一致**などの条件は [db.md](./db.md) の仕様に従う。
- **HTTP・JSON の形・クエリ文字列の解釈**は知らない。

### Service（`apps/web/server/services/*`）

- **ユースケース単位の入口**として、repository 関数を組み合わせて呼び出す薄いラッパ（例: `createSearchService(database)`）。
- **1 つの `QueryDatabase` インスタンス**または `ChatQueryService` を受け取り、検索メソッドを束ねる（非同期）。multi-year search は `packages/db/src/multi-year-query-service.ts` に集約する。
- 依然として **SQL は書かない**（`@npb/db` の repository に委譲）。

### Route handler（`apps/web/server/api/**`）

- **HTTP の入出力**だけを担当する。
- `getQuery` でクエリを取り、`server/utils/parse-search-query.ts` で Zod に通して **フィルタオブジェクト**に変換する。
- `useRuntimeConfig` と `await getServerDatabase(event, ...)` で DB を取得し、`createSearchService` 経由で検索を実行する。
- バリデーション失敗は 400、DB パス未設定は 503 を返す。

## ディレクトリ対応

| パス | 役割 |
|------|------|
| `packages/db/src/repository/events-repository.ts` | `events` + `games` 結合のイベント検索 |
| `packages/db/src/repository/games-repository.ts` | `games` の一覧検索（最小列） |
| `packages/db/src/repository/batting-repository.ts` | `batting_lines` + `games` 結合の検索 |
| `packages/db/src/repository/pitching-repository.ts` | `pitching_lines` + `games` 結合の検索 |
| `packages/db/src/repository/roster-repository.ts` | `roster_entries` + `games` 結合の検索 |
| `packages/db/src/repository/game-detail-repository.ts` | game detail 検索 |
| `packages/db/src/repository/aggregate-repository.ts` | DB 集計 |
| `packages/db/src/repository/player-repository.ts` | player candidate search |
| `packages/db/src/multi-year-query-service.ts` | 年別 SQLite を横断する chat query service |
| `apps/web/server/services/search-service.ts` | 上記 repository のファサード |
| `apps/web/server/services/chat-service.ts` | chat 用 use case。normalization / player resolution / formatter を束ねる |
| `apps/web/server/utils/server-database.ts` | D1（`NPB_DB`）または SQLite パスに基づく `QueryDatabase`（ローカルでは migrate） |
| `apps/web/server/utils/parse-search-query.ts` | GET クエリ → スキーマ準拠フィルタ |
| `apps/web/server/api/search/*.get.ts` | 検索 API（events / games / pitching） |

## 環境変数

- **ローカル / node-server**: **`NPB_SQLITE_PATH`**（`runtimeConfig.npbSqlitePath`）を設定する。未設定かつ D1 も無いときは検索 API は 503 になる。
- **multi-year chat**: `NPB_SQLITE_DIR` を設定すると `data/npb-{year}.sqlite` 形式の年別 DB を横断する。未設定時は `NPB_SQLITE_PATH` の親ディレクトリを使う。
- **Cloudflare Workers**: `event.context.cloudflare.env.NPB_DB`（D1）があれば **`NPB_SQLITE_PATH` は不要**。詳細は [deploy.md](./deploy.md)。

## 実装状況

Done:

- route handler から repository への分離
- D1 / SQLite 共通の `QueryDatabase`
- multi-year chat query service

Not implemented:

- public API と internal service の本格的な境界整理
- 外部公開 API の認証・レート制限・契約化

## 関連ドキュメント

- [db.md](./db.md) — `searchEvents` の検索条件仕様
- [AGENTS.md](../AGENTS.md) — route に直接 SQL を書かない方針
