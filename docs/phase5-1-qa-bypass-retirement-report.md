# Phase 5.1 QA bypass retirement report

## Summary

- Production Worker: `npb-archive-chat-web`
- Production Deploy Version ID: `d23e1fa2-b853-4db5-bbe2-73e258ab423e`
- Staging validation Worker: `npb-archive-chat-web-normalized`
- Staging Deploy Version ID: `18779a34-4bb8-4f6c-b87a-d1539591584a`
- Normalized D1: `npb-archive-chat-normalized` / `eb614de3-eb0c-4816-a7b2-8440e94093a8`
- Schema version: `phase5-normalized-v1`
- Runtime contract: `normalized-only`
- DB size after verification query: `275,697,664` bytes

The HTML audit report named `npb-archive-chat-結合テスト監査報告書.html` was not present in the repository checkout, so Phase 5.1 revalidated the findings from the operator prompt against the live source and tests.

## Finding classification

- F-01 Q-65 fixed success response: B, statically confirmed in `apps/web/server/api/chat.post.ts`; removed.
- F-02 latest5/latest10 formatter mismatch: B, statically confirmed in recent pitching/batting evaluation gap notes; fixed by using the displayed latest5 window for gap calculation.
- F-03 QA-specific hardcoded branches: B for runtime references to known QA recovery and dead special rewrite definitions; removed from runtime and deleted unused definitions.
- F-04 explicit `player_id` trusted without verification: B, statically confirmed; explicit IDs are now checked against candidate search before being treated as resolved.
- F-05 multi-player comparison name fallback: B, statically confirmed; unresolved/ambiguous members now stop comparison instead of continuing with name-only search.
- F-06 staging/production D1 shared binding: B, confirmed in `wrangler.toml`; env.normalized is now documented and guarded as `read_only_validation_shared_production_db`, with cron dispatch disabled by config guard.
- F-07 repository exception asymmetry: B, confirmed for award metadata and schema detection silent catches; those catches were removed so D1/schema failures are not returned as empty data.

## Removed bypass paths

- Removed the `田中将大` / `今シーズン` / `成績` fixed response from the outer route catch.
- Removed known QA recovery resolution that synthesized resolved players without `player_id`.
- Removed unused QA stabilization and special rewrite definitions containing hardcoded player/team/year branches.
- Removed silent `catch(() => [])` and `catch(() => false)` from normalized award/runtime metadata and schema detection paths.

## Generalized logic

- Explicit planner-supplied `player_id` is validated against player candidates for name/year/team context before use.
- Rejected explicit IDs remove the ID filter and return a not-found identity result instead of running aggregate queries.
- Multi-player recent comparisons require all players to resolve with `player_id`; unresolved members are reported as data insufficiency.
- Recent pitching/batting evaluation notes use one window contract for heading, listed dates, aggregate values, and continuity gap notes.

## QA and tests

- Local focused tests: chat-service, formatter, cron guard passed.
- `pnpm test`: 335 passed / 0 failed / 65 skipped.
- `pnpm typecheck`: passed before final deploy; later repeated session produced no diagnostics but the tool session required interrupt recovery.
- `pnpm lint`: attempted full and changed-file lint; eslint sessions did not return diagnostics and required interrupt recovery.
- `git diff --check`: passed.

## Staging validation

- Staging Deploy Version ID: `18779a34-4bb8-4f6c-b87a-d1539591584a`
- Staging fixture QA: `data/logs/qa-prod-1784357692322.json`, HTTP 200 `117/117`, HTTP 500/503 `0/0`, summary null `0`, forbidden recovery/hardcoded metadata `0`
- Staging normal LLM QA: `data/logs/qa-prod-1784359926126.json`, HTTP 200 `117/117`, HTTP 500/503 `0/0`, summary null `0`, forbidden recovery/hardcoded metadata `0`

## Production validation

- Production Deploy Version ID: `d23e1fa2-b853-4db5-bbe2-73e258ab423e`
- Production normal LLM QA: `data/logs/qa-prod-1784361033364.json`, HTTP 200 `117/117`, HTTP 500/503 `0/0`, summary null `0`, forbidden recovery/hardcoded metadata `0`
- Q-01 latest window check: latest5 body and gap note now refer to the same displayed five-game window.
- Q-65 fixed response check: route catch no longer has a question-specific success response; production answer used `aggregatePitchingLines`.
- Q-105 canonical latest5: `2026-07-11`, `2026-07-01`, `2026-06-21`, `2026-06-13`, `2026-06-05`.
- Q-112 multi-player unresolved check: unresolved `山崎伊織` is reported as not found; no name-only comparison is produced.

## Staging/prod D1 policy

`env.normalized` intentionally shares production normalized D1 for read-only validation. It has no routes and no crons. `NPB_SEARCH_DB_MODE=read_only_validation_shared_production_db` is set on the env, and Cloudflare Cron dispatch refuses to run when that mode is present. Production is marked `NPB_SEARCH_DB_MODE=production`.

## Rollback and retained paths

Legacy D1 `npb-archive-chat-import` / `14c099c3-03ac-4307-9704-7a770b31d108` remains retained for rollback only. Conversion/backfill tooling remains outside normal runtime. Do not delete the legacy DB.
