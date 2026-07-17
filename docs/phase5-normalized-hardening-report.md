# Phase 5 normalized hardening report

## Summary

- Production Worker: `npb-archive-chat-web`
- Production Deploy Version ID: `cafb1078-f735-4d1d-b406-51ce6f8938e9`
- Normalized D1: `npb-archive-chat-normalized` / `eb614de3-eb0c-4816-a7b2-8440e94093a8`
- Schema version: `phase5-normalized-v1`
- Runtime contract: `normalized-only`
- Legacy D1 retained for rollback only: `npb-archive-chat-import` / `14c099c3-03ac-4307-9704-7a770b31d108`
- Legacy rollback Deploy Version ID: `f36ff5ad-a057-4adc-9aa7-a318fd535413`

## Retired runtime paths

- Removed request-time official award fetch from normal chat execution.
- Q-78 now reads `award_facts` in normalized D1.
- Runtime startup validates `normalized_runtime_metadata` before serving normal chat answers.
- No production binding points at the legacy import DB.
- Legacy DB access remains limited to rollback and forensic conversion/backfill tooling.

## Q-105 canonical evidence

The latest five canonical pitching facts after daily update are:

- 2026-07-11: `r20260711db-g-12`, 3 IP, 4 K, 3 ER, `https://npb.jp/scores/2026/0711/db-g-12/box.html`
- 2026-07-01: `f20260701db-d-09`, 6 IP, 6 K, 0 ER, `https://npb.jp/bis/eng/2026/games/fs2026070100674.html`
- 2026-06-21: `f20260621db-l-12`, 5 IP, 6 K, 1 ER, `https://npb.jp/bis/eng/2026/games/fs2026062100624.html`
- 2026-06-13: `f20260613e-db-03`, 4 IP, 4 K, 5 ER, `https://npb.jp/bis/eng/2026/games/fs2026061300575.html`
- 2026-06-05: `f20260605db-v-08`, 6 IP, 2 K, 1 ER, `https://npb.jp/bis/eng/2026/games/fs2026060500536.html`

`scripts/phase4-backfill-official-pitching-evidence.mjs` now has canonical official evidence rows, so GitHub Actions can reapply Q-105 facts after normalized sync without relying on local QA logs.

## Daily update guards

Workflow run `29547128720` completed successfully.

Guards:

- target DB fixed to `npb-archive-chat-normalized` / `eb614de3-eb0c-4816-a7b2-8440e94093a8`
- concurrency group `normalized-daily-update`
- schema version check
- row count report
- duplicate business key checks
- orphan game/source snapshot checks
- missing source URL check
- Q-105 latest5 and source provenance check
- capacity thresholds at 70%, 85%, and 95% of 500MB

After daily update:

- DB size: `275,582,976` bytes
- Capacity usage: `52.56%`
- Table counts: `game_facts=18067`, `source_snapshot_facts=72268`, `event_facts=772525`, `batting_line_facts=252167`, `pitching_line_facts=74690`, `roster_entry_facts=456943`, `award_facts=2`
- Duplicate counts: 0
- Orphan counts: 0
- Missing source URL count: 0

## QA

- Staging Deploy Version ID: `1148e0f3-2526-48a4-a096-0d2288507301`
- Staging fixture QA: `data/logs/qa-prod-1784202727696.json`, Pass 117 / Fail 0 / Blocked 0
- Staging normal LLM QA: `data/logs/qa-prod-1784202929870.json`, Pass 117 / Fail 0 / Blocked 0
- Production normal LLM QA: `data/logs/qa-prod-1784288378437.json`, Pass 117 / Fail 0 / Blocked 0
- Post-daily smoke QA: `data/logs/qa-prod-1784253469147.json`, Pass 7 / Fail 0 / Blocked 0
- HTTP 500/503: 0 / 0
- Summary null: 0
- D1 code 7500: 0

## Query performance

`EXPLAIN QUERY PLAN` was checked against normalized production D1:

- Event search by date joins `game_facts` through `idx_games_date` and `event_facts` primary key.
- Recent pitching by `pitcher_id` uses `idx_pitching_player_game`, then joins `game_facts` by primary key.
- `game_facts` has `idx_games_date` and `idx_games_year_date`.
- `pitching_line_facts` has `idx_pitching_player_game` and `idx_pitching_name_game`.

No index removal was made in Phase 5.

## Rollback

Rollback is validation-only by script:

```bash
node scripts/phase5-rollback-production-binding.mjs --confirm ROLLBACK_PRODUCTION_TO_LEGACY_D1
```

Rollback procedure:

1. Stop daily update.
2. Change production `NPB_DB` binding back to `npb-archive-chat-import` / `14c099c3-03ac-4307-9704-7a770b31d108`.
3. Deploy production.
4. Run smoke QA against production.
5. Keep normalized D1 intact.
6. Recutover by restoring the normalized binding and redeploying after parity checks.

Do not delete the legacy DB.
