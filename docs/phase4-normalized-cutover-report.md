# Phase 4 normalized cutover report

- Date: 2026-07-15
- Normalized D1: `npb-archive-chat-normalized` / `eb614de3-eb0c-4816-a7b2-8440e94093a8`
- Old D1 retained: `npb-archive-chat-import` / `14c099c3-03ac-4307-9704-7a770b31d108`
- Production Worker: `npb-archive-chat-web`
- Staging Worker: `npb-archive-chat-web-normalized`

## Cutover

- Production `NPB_DB` binding was cut over from old D1 to normalized D1.
- Production LLM vars/secrets were preserved.
- Old production Deploy Version ID for rollback: `f36ff5ad-a057-4adc-9aa7-a318fd535413`
- Current production Deploy Version ID: `a5b81262-0178-47af-b6db-a6fe051157a8`
- Current staging Deploy Version ID: `478d205d-dbeb-4cef-8768-4e93c7ac6a93`
- Normalized DB final checked size: `275,243,008` bytes.

## QA

- Staging fixture full QA: `data/logs/qa-prod-1784080746960.json`
  - Pass 117 / Fail 0 / Blocked 0
  - HTTP 500/503: 0 / 0
  - summary null: 0
- Staging normal LLM full QA: `data/logs/qa-prod-1784088281329.json`
  - Pass 117 / Fail 0 / Blocked 0
  - HTTP 500/503: 0 / 0
  - summary null: 0
- Production normal LLM full QA: `data/logs/qa-prod-1784115474552.json`
  - Pass 117 / Fail 0 / Blocked 0
  - HTTP 500/503: 0 / 0
  - summary null: 0
  - D1 code 7500: 0
  - unexpected player_id failures: 0

## Q-51

Root cause was normalized repository adapter parity gaps around multi-year aggregate batting contracts. The adapter fixes preserve the legacy repository contract and return normalized facts in the formatter-expected row shape.

Production full QA confirms Q-51 returns HTTP 200 with the 2023-2025 aggregate batting answer for Maki Shugo.

## Q-105

Current canonical latest five pitching rows for Fujinami Shintaro are:

- 2026-07-11: 3 IP, 4 K, 3 ER, source `https://npb.jp/scores/2026/0711/db-g-12/box.html`
- 2026-07-01: 6 IP, 6 K, 0 ER, source `https://npb.jp/bis/eng/2026/games/fs2026070100674.html`
- 2026-06-21: 5 IP, 6 K, 1 ER, source `https://npb.jp/bis/eng/2026/games/fs2026062100624.html`
- 2026-06-13: 4 IP, 4 K, 5 ER, source `https://npb.jp/bis/eng/2026/games/fs2026061300575.html`
- 2026-06-05: 6 IP, 2 K, 1 ER, source `https://npb.jp/bis/eng/2026/games/fs2026060500536.html`

Backfilled official evidence is reapplied after normalized daily sync by `scripts/phase4-backfill-official-pitching-evidence.mjs`. The script also upserts the canonical player profile for `41045137` so player_id-first resolution works after a fresh normalized sync.

## Daily Update

- Workflow: `.github/workflows/daily-update.yml`
- Normalized sync command: `pnpm --filter @npb/db run sync:normalized-d1 -- --sqlite-dir ./data --d1-database "$NPB_D1_DATABASE" --keep-files --verify`
- Post-sync backfill: `node scripts/phase4-backfill-official-pitching-evidence.mjs --output data/logs/phase4-backfill-official-pitching-evidence.json`
- Latest verification run: `29410218908` (completed success; all workflow steps green, including `Sync updated SQLite data to D1`, `Verify D1 sync summary`, `Backfill official pitching evidence`, R2 backup save, and artifact upload)
- Post-daily smoke QA: `data/logs/qa-prod-1784115425332.json`
  - Q-98 / Q-105: HTTP 200, latest5 canonical facts preserved after reapplying current backfill script
- Post-daily full QA: `data/logs/qa-prod-1784115474552.json`
  - Pass 117 / Fail 0 / Blocked 0
  - HTTP 500/503: 0 / 0
  - summary null: 0

## Rollback

1. Confirm no daily update/import/backfill is running.
2. Change production `wrangler.toml` top-level `NPB_DB` binding back to `npb-archive-chat-import` / `14c099c3-03ac-4307-9704-7a770b31d108`.
3. Deploy production Worker.
4. Run smoke QA: Q-01, Q-17, Q-51, Q-61, Q-97, Q-98, Q-105, Q-109, Q-110.
5. Keep normalized D1 intact for investigation; do not delete old or normalized DB.
