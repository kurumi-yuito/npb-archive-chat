# Capabilities

This document defines the Version 1.0 capability baseline for NPB Archive Chat.

## Supported Capabilities

### Games

- Game results for stored historical games.
- Game details including score, venue, scoring progression, main pitchers, main batters, and key scoring scenes.
- Game highlights generated from score, scoring progression, pitching lines, batting lines, and important events.
- Game search by date, team, opponent, venue, and season where data is available.
- Game explanations and follow-up answers based on prior game context.

### Players

- Season batting and pitching stats.
- Career or multi-year aggregates where the stored data supports the query.
- Recent batting and pitching form.
- Last recorded NPB appearance within the stored data.
- Player affiliation based on stored rosters, batting lines, pitching lines, and event evidence.
- Player event search such as home runs, first home run-style questions, and batter-vs-pitcher matchups.

### Comparisons

- Player comparisons using available batting or pitching lines.
- Recent-game comparisons for multiple players.
- Team comparisons and win/loss aggregates.
- Year or multi-year comparisons when stored aggregate data exists.
- Comparison follow-ups that preserve prior question context.

### Records

- First-record and ordinal-style questions where event data is available.
- Home run searches including first home run and numbered home run questions.
- Multi-year and career aggregate records.
- Batter-vs-pitcher confrontation records.
- Team-vs-team historical results.

### Analysis

- Batting analysis based on available batting stats and derived metrics.
- Pitching analysis based on available pitching stats.
- Recent-form analysis with date gap notes when the newest record is not current enough to imply live form.
- Data-grounded opinion answers after analysis.
- Strength, weakness, trend, and evaluation style answers when the claim can be derived from stored records.

### Conversation

- Follow-up questions can inherit prior player, team, season, or game context.
- Corrections such as changing player, team, year, or scope are handled at the planning layer.
- Capability routing separates historical, analytical, opinion, news, and realtime questions.
- Related follow-up suggestions are returned as `suggested_questions` and displayed as tappable UI options.

## Unsupported Capabilities

### News

The system does not answer news, article, injury, registration, de-registration, contract, transfer, trade, or comment questions from the DB. It guides the user to Sports Navi NPB instead:

https://baseball.yahoo.co.jp/npb/

### Realtime

The system does not answer live game status, today's lineups, current scores, in-game progress, live play-by-play, or realtime roster status. It guides the user to Sports Navi NPB instead:

https://baseball.yahoo.co.jp/npb/

### Speculation

The system does not generate:

- Future predictions without data.
- Injury or condition assumptions.
- Coaching staff intent.
- Contract or transfer speculation.
- Social media interpretations.
- Article-based claims not present in saved canonical data.

## Architecture Summary

Planner Contractと責務境界の決定は [ADR 0015](adr/0015-planner-contract-and-layer-boundaries.md) を参照してください。

```text
User
  ↓
Request Guard（機械的検証のみ）
  ↓
Planner
  ↓
Planner Validation
  ↓
Capability Routing
  ↓
Repository
  ↓
Answer Generator
  ↓
Highlight Generator
  ↓
Follow-up Generator
  ↓
UI
```

## Component Responsibilities

### Request Guard

- Validates request schema, size, and conversation-history shape.
- Does not classify topic, intent, entities, or omitted natural-language expressions.

### Planner

- Converts user language and conversation history into structured query intent and filters.
- Maintains follow-up context and correction metadata.
- Determines whether player identity resolution is required.
- Returns one nested capability contract; downstream layers do not reclassify the question.

### Planner Validation

- Validates schema and cross-field consistency only.
- Returns a status and issue list without changing the plan.
- Does not interpret the question or generate a response.

### Capability Routing

- Consumes the Planner's capability contract.
- Routes historical, analytical, opinion, news, and realtime capabilities.
- Does not classify the original natural-language message again.

### Repository

- Reads normalized D1 data.
- Returns stable domain shapes to the web layer.
- Does not perform request-time live fetch.
- Does not silently fall back to legacy schema in production runtime.

### Answer Generator

- Produces deterministic answer summaries from repository results.
- Keeps public answer contracts stable.
- Distinguishes missing data from empty-but-valid results.
- Keeps data-backed answers separate from unsupported speculation.

### Highlight Generator

- Runs inside the answer generation layer for game detail answers.
- Uses score, scoring progression, events, batting lines, and pitching lines.
- Generates concise game summaries before detailed sections.

### Follow-up Generator

- Generates `suggested_questions` from templates.
- Uses structured intent, capability route, entity, answer mode, and result shape.
- Limits suggestions to about three questions.
- Avoids news and realtime topics.
- Does not use free-form LLM generation.

## Quality Baseline

Version 1.0 production QA baseline:

- Production deploy Version ID: `a1fe05cc-6f8a-4fe7-b88c-9df3ba2b0169`
- Production QA log: `data/logs/qa-prod-1784476152704.json`
- QA cases: 138
- Result: Pass 138 / Fail 0 / Blocked 0
- HTTP 500/503: 0 / 0
- summary null: 0
- HTTP retry: 0
- unexpected player_id failures: 0
- D1 code 7500: 0
- `suggested_questions` over 3 items: 0
- `suggested_questions` with news/realtime terms: 0

Local verification at baseline:

- `pnpm test`: 353 passed / 65 skipped
- `pnpm typecheck`: passed
- `pnpm lint`: 0 errors; existing Vue style warnings only
- `git diff --check`: passed

## Design Principles

- Answer only from data when the question requires facts.
- Explain when stored data is missing instead of guessing.
- Keep unsupported capability failures explicit and useful.
- Use LLMs for language where appropriate, but not for unrestricted fact invention.
- Generate follow-up suggestions from known supported templates.
- Keep UX improvements in the answer, highlight, and presentation layers.
- Keep normalized D1 as the production runtime contract.
