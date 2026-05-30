---
phase: 66-sidebar-search
plan: 05
subsystem: testing
tags: [coverage, lcov, vitest, bun-test, ci, coverage-v8, test-harness]

# Dependency graph
requires:
  - phase: 66-sidebar-search (66-01..04)
    provides: the three pure search helpers (deep-link-resolve.ts, snippet-sanitize.ts, search-mode.ts) and their unit tests, which this plan machine-gates at 100%
provides:
  - Extended scripts/test-coverage.sh that measures web/src/lib coverage (bun search-helper shards + a node-run vitest --coverage leg with SF re-rooting)
  - Exact 100% per-file pins for the three Phase 66 search helper modules, satisfied by real measured lcov data
  - Reconciliation of two pre-existing latent vitest-only exact pins (goal-row-logic.ts, GoalPill.svelte) — now backed by real lcov data
  - Per-file coverage gate now runs on every PR via a node-provisioned `coverage` job in ci.yml (add-to-ci decision)
affects: [67-command-palette, 68-backfill, any future web/src/lib coverage work, ci-policy]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "node-run vitest --coverage leg (coverage-v8 cannot run under Bun's node:inspector) feeding the merged lcov, with SF:src/ -> SF:web/src/ re-rooting"
    - "Scoped --coverage.include to confine a coverage leg to exactly the target files, avoiding collateral threshold violations"

key-files:
  created:
    - .planning/phases/66-sidebar-search/deferred-items.md
  modified:
    - scripts/test-coverage.sh
    - scripts/coverage-thresholds.json
    - .github/workflows/ci.yml

key-decisions:
  - "Gate-location checkpoint resolved add-to-ci: run the per-file coverage gate on every PR (ci.yml) in addition to release-sdk.yml"
  - "Scoped the web bun shard addition to JUST the two target search-helper test files (not the whole web/src/__tests__ dir) to avoid pulling dozens of unrelated lib/SDK/example modules into the gate as new violations"
  - "vitest coverage leg runs under node (npx vitest), not bunx --bun vitest — coverage-v8 fails under Bun"

patterns-established:
  - "Verify-in-isolation for harness-widening changes: diff the violator set before vs after to prove zero new violations even when the full-tree gate is red from unrelated contamination"
  - "Re-root vitest SF paths (SF:src/ -> SF:web/src/) before merge-lcov so repo-root-relative threshold keys match"

requirements-completed: [UI-01, UI-02, UI-03, UI-04]

# Metrics
duration: ~40min
completed: 2026-05-30
---

# Phase 66 Plan 05: Coverage-Gate Closure for Search Helpers Summary

**Extended scripts/test-coverage.sh to measure web/src/lib via bun search-helper shards + a node-run vitest --coverage leg (coverage-v8 needs node), pinned the three Phase 66 search helpers at 100% per-file (all satisfied by real lcov), reconciled the two latent vitest-only pins, and wired the gate into ci.yml on every PR.**

## Performance

- **Duration:** ~40 min (across the checkpoint pause)
- **Tasks:** 3 (2 autonomous + 1 decision checkpoint resolved add-to-ci)
- **Files modified:** 3 (scripts/test-coverage.sh, scripts/coverage-thresholds.json, .github/workflows/ci.yml) + 1 created (deferred-items.md)

## Accomplishments
- **Closed Phase 66 verification gap (must-have truth #5):** the three pure search helpers are now machine-gated at 100% per-file, not just unit-tested. A future regression that drops a line of deep-link-resolve.ts / snippet-sanitize.ts / search-mode.ts now fails the gate.
- **Harness extension (Task 1):** widened the per-file coverage loop to include the two search-helper bun:test suites (snippet-sanitize + search-mode), and added a NEW node-run vitest --coverage leg for the vitest-only files (deep-link-resolve + the two latent component pins), with SF:src/ → SF:web/src/ re-rooting and VITEST_EXIT propagated into the final gate condition.
- **Pins (Task 2):** added exact 100% pins for the three search modules; reconciled the two pre-existing latent vitest-only pins (goal-row-logic.ts, GoalPill.svelte) so they are now backed by real measured data.
- **Gate location (Task 3, add-to-ci):** added a `coverage` job to ci.yml that provisions node 22 (actions/setup-node@v4) before `bun run test:coverage`, so the now-honest gate runs on every PR.
- **Verified in isolation:** all five target files measure at exactly 100% in the merged lcov — deep-link-resolve.ts 14/14, snippet-sanitize.ts 3/3, search-mode.ts 31/31, goal-row-logic.ts 7/7, GoalPill.svelte 45/45.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend test-coverage.sh to measure web/src/lib** — `4950dbf1` (feat)
2. **Task 2: Add exact 100% pins + reconcile two latent pins** — `49c3bbc1` (feat)
3. **Task 3: Run per-file coverage gate on every PR (add-to-ci)** — `3cbbe285` (ci)

**Checkpoint-pause metadata:** `6dc0b47a` (docs: log baseline-contamination deferral + STATE pause)

## Files Created/Modified
- `scripts/test-coverage.sh` - Widened the per-file loop to the two search-helper bun:test suites; added a node-run vitest --coverage leg (scoped via three --coverage.include flags to the five target lib paths) with SF re-rooting and exit-code propagation.
- `scripts/coverage-thresholds.json` - Added three exact 100% pins for web/src/lib/search/{deep-link-resolve,snippet-sanitize,search-mode}.ts; the two pre-existing latent pins (goal-row-logic.ts, GoalPill.svelte) are now satisfied by real data.
- `.github/workflows/ci.yml` - Added a node-provisioned `coverage` job running `bun run test:coverage` on every PR.
- `.planning/phases/66-sidebar-search/deferred-items.md` - Logged the out-of-scope baseline contamination (see Issues Encountered).

## Decisions Made
- **Gate location = add-to-ci** (Task 3 checkpoint resolution): run the gate on every PR via ci.yml, accepting the slower CI run for earliest-possible feedback on per-file coverage regressions. Mirrors release-sdk.yml's node provisioning.
- **Scope the web bun shards to the two target files**, not the whole `web/src/__tests__` dir — see Deviations.
- **vitest under node, not bun**: load-bearing constraint. `@vitest/coverage-v8` needs node:inspector's Coverage domain, which Bun does not implement (`bunx --bun vitest --coverage` errors "Coverage APIs are not supported"). release-sdk.yml already provisioned node 22; ci.yml's new job does the same.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Narrowed the web bun shard glob to the two target test files**
- **Found during:** Task 2 (first gate run)
- **Issue:** The plan's addition A widened the bun shard glob to the entire `web/src/__tests__/*.test.ts` dir. Running it surfaced ~50 NEW violations: the web logic suites transitively import dozens of unrelated `web/src/lib`, `packages/@ezcorp/sdk`, and `docs/extensions/examples` modules, whose sourcemap-attributed zero-hit DA records inflate denominators on files already pinned at 100% (web/src/lib/**:90, packages/@ezcorp/sdk/src/**:100, docs/extensions/examples/*/index.ts:100).
- **Fix:** Narrowed the addition to `printf` of exactly the two target bun:test files (snippet-sanitize.test.ts + search-mode.test.ts). The plan explicitly anticipated and authorized this: "narrow the web bun shard set ... so the gate change is confined to the five intended files, rather than lowering any threshold." No threshold was weakened.
- **Files modified:** scripts/test-coverage.sh (folded into Task 1 commit via amend)
- **Verification:** Violator-set diff (baseline vs this branch) is empty for new violations; the five targets all measure 100%.
- **Committed in:** `4950dbf1` (Task 1 commit, amended)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The narrowing is exactly the contingency the plan authorized. Gate change confined to the five intended files. No scope creep, no threshold weakened.

## Issues Encountered

**Pre-existing baseline coverage-gate contamination (deferred, out of scope).** `bun run test:coverage` is RED on the working tree with ~68 violations — but this is NOT caused by 66-05. Running the HEAD~1 baseline harness + baseline thresholds (before any 66-05 change) fails with ~70 violations on its own. The working tree is dirty with 18 modified tracked + 6 untracked `src/`/`web/` files from a parallel session, many pinned at 100%.

Proof 66-05 is regression-free, verified the same way Tasks 1-2 were verified in isolation:
- Diff of violator sets (baseline vs 66-05 branch) shows **zero new violations**.
- 66-05 **fixed** 2 pre-existing latent violations (goal-row-logic.ts, GoalPill.svelte).
- All five target files measure 100% in the merged lcov.

Per concurrent-tree-contamination policy, the parallel-session changes were NOT reverted/committed by this plan. The contamination is logged in `deferred-items.md`. **The full-tree gate goes GREEN once that parallel work is committed/cleaned** — because 66-05 adds no new violations. 66-05's own contribution (the five search/component pins) passes independently of that cleanup.

## User Setup Required
None - no external service configuration required. The new ci.yml `coverage` job provisions node 22 automatically via actions/setup-node@v4.

## Next Phase Readiness
- Phase 66 fully complete (66-01..05); the search-helper coverage gap is closed and machine-enforced on every PR.
- Phases 67 (Cmd+K palette) and 68 (backfill) are unblocked (depend on 65, not 66).
- **Carry-forward constraint:** any future plan that adds a vitest-coverage leg must run it under node, not bun (coverage-v8 incompatibility); node 22 is provisioned in both ci.yml (`coverage` job) and release-sdk.yml.
- **Carry-forward note:** the baseline coverage gate will stay red until the parallel-session dirty tree is committed/cleaned (tracked in deferred-items.md) — this is unrelated to 66-05.

---
*Phase: 66-sidebar-search*
*Completed: 2026-05-30*

## Self-Check: PASSED

- Files verified present: scripts/test-coverage.sh, scripts/coverage-thresholds.json, .github/workflows/ci.yml, 66-05-SUMMARY.md, deferred-items.md
- Commits verified present: 4950dbf1 (Task 1), 49c3bbc1 (Task 2), 3cbbe285 (Task 3), 6dc0b47a (checkpoint pause)
- Five target files measured at 100% in merged lcov; zero new gate violations vs baseline
