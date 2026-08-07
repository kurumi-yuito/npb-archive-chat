# Phase 15 Topic判定アーキテクチャ

## 責務境界

- Request Guard: request schema、空文字、4000文字上限、履歴形式、auth、rate limit、LLMへ渡せる形式だけを検査する。
- Planner: domain、intent、entities、filters、会話参照、capabilityを解釈する唯一の自然言語レイヤーとする。
- Planner Validation: Plannerの構造化出力同士の矛盾だけを検査し、質問文をregex等で読み直さない。Phase 15.1以降はPlanner出力を変更せず、statusとissuesだけを返す。
- Capability Routing: historical / analytical / opinion / realtime / news の既存責務を維持する。

## 移行処理

`RECENT_PLAYER_TOPIC_PATTERN`、`KNOWN_PLAYER_SHORT_STATUS_PATTERN`、旧NPB topic語彙は `chat-topic-migration.ts` に隔離した。実行時のPlanner前gateには使わない。`chat-query-llm.ts` の楕円表現stabilizationは、能力単位QAが本番で安定するまで維持する。

## 撤去条件

カテゴリ30の複数表現についてfalse negative / false positive / Entity ambiguity / conversation contextの本番QAが安定し、Plannerログで意図・entity・filtersが継続して整合することを撤去条件とする。

Phase 15.1で確定したPlanner Contractとレイヤー責務は [ADR 0015](adr/0015-planner-contract-and-layer-boundaries.md) を参照する。
