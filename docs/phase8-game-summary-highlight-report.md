# Phase 8 Game Summary Highlight Report

- Date: 2026-07-19
- Production deploy Version ID: `109121a6-0109-40ac-a8f5-7dd1f1f83902`
- Staging deploy Version ID: `e30a0e57-da63-4bfe-a5e9-c5a2ab36a88a`
- Production QA log: `data/logs/qa-prod-1784468730551.json`
- Staging QA log: `data/logs/qa-prod-1784467230016.json`
- Normalized schema version: `phase5-normalized-v1`

## Changes

- Game detail summaries now begin with a 2-4 sentence highlight before `試合結果`.
- The highlight generator uses existing game detail data: score, scoring progression, events, batting rows, pitching rows, and home run / RBI text.
- The generator classifies common game shapes such as pitching battle, close game, see-saw game, one-sided game, comeback, and walk-off when the source data supports it.
- Important events are prioritized over a full event listing: decisive scoring, tying or go-ahead scoring, home runs, grand slams, walk-off text, and standout scoreless pitching.
- Planner, Repository, D1 schema, and data fetching behavior were not changed.

## QA

- Added QA cases: Q-127 through Q-131.
- Staging full QA: Pass 126 / Fail 0 / Blocked 0.
- Production full QA: Pass 131 / Fail 0 / Blocked 0.
- HTTP 500/503: 0 / 0.
- summary null: 0.
- HTTP retries: 0.
- unexpected player_id failures: 0.

## Representative Results

- Q-127: 2021-04-16 阪神対ヤクルト starts with a pitching battle highlight and then shows `試合結果`.
- Q-128: 2026-07-11 DeNA対巨人 starts with a see-saw game highlight and identifies the 7th inning Giants scoring swing.
- Q-129: 2024-11-03 DeNA対ソフトバンク starts with a one-sided DeNA highlight and identifies the 5th inning seven-run frame.
- Q-130: 2026-05-21 ヤクルト対巨人 starts with a close game highlight and then shows the scoring progression.
- Q-131: Current-season walk-off detail search does not invent a game when the production DB has no matching walk-off win.

## Notes

- Walk-off highlight generation is covered by formatter regression tests with a bottom-inning `x` linescore and walk-off RBI event.
- Phase 8 did not change DB contents, daily update configuration, production binding, or normalized runtime contract.
