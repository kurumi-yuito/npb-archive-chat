# Phase 6 conversation capability report

## Summary

- Production Worker: `npb-archive-chat-web`
- Production Deploy Version ID: `cd418821-cb45-4f02-82a4-ff23785abfb5`
- Staging validation Worker: `npb-archive-chat-web-normalized`
- Staging Deploy Version ID: `d573d1db-c0f6-427a-8218-dc706dbffecb`
- Normalized D1: `npb-archive-chat-normalized` / `eb614de3-eb0c-4816-a7b2-8440e94093a8`
- Schema version: `phase5-normalized-v1`
- Runtime contract: `normalized-only`

Phase 6 adds a conversation capability layer above the existing structured query intent. The goal is not to make new data claims, but to choose the correct behavior for historical records, analysis, opinion, news, and realtime questions.

## Capability routing

- `historical_record`: normal Planner -> Executor -> Repository -> Formatter path.
- `analytical`: repository-backed path with analysis-oriented metadata.
- `opinion`: repository-backed analysis first, then `chat-opinion-generator.ts` appends a commentator-style opinion only when evidence exists.
- `news`: no repository answer is generated; the response points users to Sports Navi Pro Baseball.
- `realtime`: no repository answer is generated; the response points users to Sports Navi Pro Baseball.

The external guidance URL is centralized as `SPORTS_NAVI_NPB_URL`:

`https://baseball.yahoo.co.jp/npb/`

## Runtime metadata

The response execution metadata now records:

- `question_intent`
- `capability_route`
- `capability_requires_analysis`
- `capability_uses_repository`
- `external_source_url`

This makes QA logs able to verify that news and realtime questions do not use the DB path, and that opinion answers are produced only after analysis evidence is available.

## Prompt policy

The final answer LLM system prompt now frames the AI as a professional baseball commentator while preserving data boundaries:

- separate data-supported statements from unsupported statements
- do not infer news, injury, contract, trade, public notice, comment, or live game state from historical DB rows
- give opinions and outlooks only from deterministic answer and repository results
- preserve external-source guidance for news and realtime routing

## QA

- Local `pnpm test`: 345 passed / 65 skipped
- `pnpm typecheck`: passed
- `pnpm lint`: 0 errors, existing Vue style warnings only
- `git diff --check`: passed before production deploy
- Staging fixture QA: `data/logs/qa-prod-1784432936957.json`, Pass 117 / Fail 0 / Blocked 0, HTTP 500/503 0 / 0, summary null 0
- Staging normal LLM QA: `data/logs/qa-prod-1784433093232.json`, Pass 117 / Fail 0 / Blocked 0, HTTP 500/503 0 / 0, summary null 0
- Production representative smoke: `data/logs/qa-prod-1784434756216.json`, Pass 9 / Fail 0 / Blocked 0
- Phase 6 intent seed production log: `data/logs/qa-prod-1784436503025.json`
- Q-120 retry production log after transient 500: `data/logs/qa-prod-1784437616390.json`, HTTP 200
- Q-119 corrected production log: `data/logs/qa-prod-1784437659205.json`, HTTP 200
- Production normal LLM full QA: `data/logs/qa-prod-1784439423359.json`, Pass 122 / Fail 0 / Blocked 0, HTTP 500/503 0 / 0, summary null 0, HTTP retry 0

## Added QA cases

- Q-118: historical_record route
- Q-119: analytical route
- Q-120: opinion route after analysis
- Q-121: news external-source guidance
- Q-122: realtime external-source guidance

The final production full QA recorded these capability routes:

- `repository_analysis`: 74
- `repository_history`: 31
- `analysis_then_opinion`: 4
- `external_source_guidance`: 2
- `missing`: 11

The `missing` cases are existing off-topic or insufficient-context cases that return before the baseball capability router. No news or realtime case entered the repository path.
