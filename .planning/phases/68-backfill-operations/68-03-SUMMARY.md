---
phase: 68-backfill-operations
plan: 03
subsystem: infra
tags: [pglite, postgres, analyze, planner-stats, embed-worker, outbox, hnsw, drizzle]

# Dependency graph
requires:
  - phase: 64-embed-on-write-worker
    provides: EmbedWorker daemon + tickOnce() drain loop + message_embed_outbox claimBatch contract
  - phase: 68-backfill-operations (Plan 01)
    provides: Wave-0 RED scaffolds + getEmbedProgress/backfill outbox helpers context
provides:
  - "ANALYZE message_chunks planner-stats maintenance gated inside EmbedWorker.tickOnce() after a backlog-clearing non-empty drain"
  - "db.execute spy harness for embed-worker.test.ts (serialize drizzle queryChunks to detect issued SQL)"
affects: [backfill-operations, hybrid-search, embed-worker, operations]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Self-limiting planner-stats refresh: probe remaining claimable-pending backlog after a non-empty drain; ANALYZE once only when it cleared to zero"
    - "Inner try/catch around maintenance side-effects so a stats-refresh failure never crashes a tick or fails the drain"
    - "Test-side db.execute spy that flattens drizzle SQL queryChunks into a string to assert which statements a real-DB drain issued (no new mocking layer)"

key-files:
  created: []
  modified:
    - src/extensions/embed-worker.ts
    - src/__tests__/embed-worker.test.ts

key-decisions:
  - "Chose the backlog==0-after-non-empty-drain trigger over an every-N-tick counter (RESEARCH Open Question 2): simple, self-limiting, won't fire every tick on a quiet system, cleanly testable"
  - "Re-used claimBatch's exact claimability predicate (status='pending' AND (next_attempt_after IS NULL OR next_attempt_after <= NOW())) for the post-drain backlog probe so partial-drain ticks that leave retry-eligible rows correctly defer ANALYZE"
  - "Hook lives strictly inside tickOnce() — start()/stop()/constructor/interval/PID-lockfile helpers untouched — so the background-timers.test.ts EmbedWorker stub (start/stop only) stays valid and no stray .pid lockfile is leaked"
  - "ANALYZE wrapped in its own try/catch (warn on failure) mirroring the tick-level catch discipline, so a failed stats refresh is a no-op for the drain"

patterns-established:
  - "Maintenance-after-drain gate: probe remaining work with the claimer's own predicate, act only when this pass cleared it"
  - "queryChunks-flattening db.execute spy for asserting issued SQL against a live PGlite drain"

requirements-completed: [OPS-03]

# Metrics
duration: 3min
completed: 2026-05-31
---

# Phase 68 Plan 03: Post-Backfill Planner-Stats ANALYZE Summary

**`EmbedWorker.tickOnce()` now runs `ANALYZE message_chunks` exactly once after a non-empty drain that clears the claimable-pending backlog to zero — keeping PGlite's HNSW/FTS planner honest post-backfill, never firing on empty/partial/degraded ticks.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-05-31T00:46:24Z
- **Completed:** 2026-05-31T00:48:48Z
- **Tasks:** 2 (TDD)
- **Files modified:** 2

## Accomplishments
- OPS-03 planner-stats maintenance: a post-drain backlog probe using claimBatch's exact claimability predicate, gating a single `ANALYZE message_chunks` when the non-empty drain cleared the backlog.
- Five new behavior cases covering the full gate matrix: fires once on backlog-clear; NOT on empty tick; NOT on partial drain (then fires on the later clearing tick); NOT on degraded tick; ANALYZE failure swallowed with drain still succeeding.
- `background-timers.test.ts` regression-green UNCHANGED (16/16) — the EmbedWorker start/stop stub surface was never touched.
- `embed-worker.ts` stays at 99.61% line coverage (≥95% gate; explicit 95 pin in coverage-thresholds.json).

## Task Commits

Each task was committed atomically (TDD RED → GREEN):

1. **Task 1+2 (RED): failing ANALYZE-gate tests** - `512cdfe1` (test)
2. **Task 1 (GREEN): ANALYZE-after-backlog-clear in tickOnce()** - `c3c24f4c` (feat)

_No refactor commit needed — implementation was clean on first green. Task 2's test extensions landed in the RED commit (the four+1 behavior cases drive Task 1's implementation), satisfying both plan tasks._

## Files Created/Modified
- `src/extensions/embed-worker.ts` - Added the OPS-03 backlog-probe + gated `ANALYZE message_chunks` block inside `tickOnce()`, just before the end-of-drain return. Entirely local to the `tickOnce()` try block.
- `src/__tests__/embed-worker.test.ts` - Added the OPS-03 describe block (5 cases) + a `spyOnDbExecute()`/`sqlChunkText()` helper that flattens drizzle `queryChunks` to detect the `ANALYZE message_chunks` statement against the live PGlite drain.

## Decisions Made
- **Trigger = backlog==0 after a non-empty drain** (not an every-N counter): RESEARCH Open Question 2's recommended path — simple, self-limiting, quiet on idle systems, and cleanly assertable. The empty-tick path early-returns at :337 and degraded ticks bail before the loop, so reaching the probe already implies `rows.length > 0`.
- **Probe re-uses claimBatch's predicate** (`status='pending' AND (next_attempt_after IS NULL OR next_attempt_after <= NOW())`) so a partial drain that leaves retry-eligible rows correctly defers ANALYZE to the later tick that finally clears them.
- **ANALYZE in its own try/catch** (warn on failure) — mirrors the tick-level catch discipline so a stats-refresh failure can never crash a tick or fail the drain.
- **Zero touches to start/stop/constructor/interval/lockfile** — protecting the `background-timers.test.ts` stub validity and avoiding a stray `.pid` leak (RESEARCH Pitfall 1).

## Deviations from Plan

None - plan executed exactly as written. Both Task 1's implementation and Task 2's tests landed without any Rule 1-4 deviations; RED cases failed for exactly the intended (not-yet-implemented) reason and turned GREEN on first implementation.

## Issues Encountered
None. (A pre-existing, gitignored `.ezcorp/embed-worker.pid` from a prior session — dated May 17 — was confirmed NOT created by this run and left untouched.)

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- OPS-03 complete. The remaining Phase 68 plans (68-04 backfill CLI, 68-05) are unaffected — this change is fully contained in the embed-worker drain path.
- The post-drain ANALYZE will fire naturally during the backfill CLI's worker-driven drain once a backlog clears, keeping the HNSW/FTS planner fresh after a large backfill.

## Self-Check: PASSED

- FOUND: src/extensions/embed-worker.ts (ANALYZE message_chunks block present in tickOnce())
- FOUND: src/__tests__/embed-worker.test.ts (OPS-03 describe block + spy helper)
- FOUND commit: 512cdfe1 (test RED)
- FOUND commit: c3c24f4c (feat GREEN)
- VERIFIED: `bun test embed-worker.test.ts background-timers.test.ts` → 56 pass / 0 fail
- VERIFIED: background-timers.test.ts diff EMPTY; embed-worker.ts diff scoped to tickOnce() only
- VERIFIED: embed-worker.ts line coverage 99.61% (≥95% gate)

---
*Phase: 68-backfill-operations*
*Completed: 2026-05-31*
