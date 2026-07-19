# Phase 9 Follow-up Suggestions Report

- Date: 2026-07-19
- Production deploy Version ID: `a1fe05cc-6f8a-4fe7-b88c-9df3ba2b0169`
- Staging deploy Version ID: `4f44405e-fdab-42de-9946-cd9770f0f983`
- Production QA log: `data/logs/qa-prod-1784476152704.json`
- Staging QA log: `data/logs/qa-prod-1784474448742.json`
- Normalized schema version: `phase5-normalized-v1`

## Changes

- Added `answer.suggested_questions: string[]` to the chat response schema.
- Added deterministic template-based follow-up generation in `chat-answer-formatter.ts`.
- Added UI rendering for `関連する質問` at the end of assistant answers.
- Suggestion buttons submit the selected question through the existing chat composer path.
- Added QA runner logging for `suggested_questions`.
- Added a final-answer LLM guard so related-question suggestions are not folded into the summary text.

## Generation Rules

- No LLM free generation is used for suggestions.
- Templates use structured intent, capability route, resolved entity, filters, answer mode, and returned result rows.
- Suggestions are limited to 3 items.
- news / realtime / off_topic / 0-result answers do not return suggestions.
- Suggestion text is filtered to exclude realtime/news terms such as 今日, 現在, ライブ, 速報, スタメン, ケガ, 契約, 移籍, ニュース.

## QA

- Added QA cases: Q-132 through Q-138.
- Staging full QA: Pass 131 / Fail 0 / Blocked 0.
- Production full QA: Pass 138 / Fail 0 / Blocked 0.
- HTTP 500/503: 0 / 0.
- summary null: 0.
- HTTP retries: 0.
- suggested_questions with more than 3 items: 0.
- suggested_questions containing news/realtime terms: 0.

## Representative Results

- Q-132: player suggestions inherit 藤浪 晋太郎.
- Q-133: team suggestions inherit DeNA.
- Q-134: comparison suggestions inherit 石田裕太郎 and 東克樹.
- Q-135/Q-136: game detail suggestions inherit game context and returned players.
- Q-137/Q-138: news/realtime capability failures return no suggestions.

## Notes

- Phase 9 did not change DB contents, daily update configuration, production binding, Planner, Repository, or normalized D1 schema.
