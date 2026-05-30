# Phase 66 — Deferred / Out-of-Scope Items

## 66-05: Pre-existing baseline coverage-gate failures (concurrent-tree contamination)

**Discovered during:** 66-05 Task 2 (running `bun run test:coverage`).

**Issue:** The per-file coverage gate (`bun run test:coverage`) is RED on the
current working tree with ~68 violations — but this is NOT caused by 66-05.
Running the **baseline** harness + baseline thresholds (HEAD~1, before any
66-05 change) produces ~70 violations on its own. The working tree is dirty
with 18 modified tracked `src/`/`web/` files + 6 untracked files, many of
which are pinned at 100% (e.g. `src/db/queries/*.ts`, `src/extensions/*.ts`,
`src/runtime/goal-host.ts`, `src/runtime/start-assignment.ts`,
`docs/extensions/examples/**`, `packages/@ezcorp/sdk/src/**`). These are
parallel-session changes outside the 66-05 plan's scope (test-harness/CI only).

**Proof 66-05 is regression-free (verified in isolation):**
- Diff of violator sets (baseline vs 66-05 branch) shows **zero NEW violations**
  introduced by 66-05.
- 66-05 **fixed** 2 pre-existing latent violations: `goal-row-logic.ts` and
  `GoalPill.svelte` (the two vitest-only exact pins, now backed by real lcov).
- All five 66-05 target files measure at exactly 100% in the merged lcov:
  deep-link-resolve.ts 14/14, snippet-sanitize.ts 3/3, search-mode.ts 31/31,
  goal-row-logic.ts 7/7, GoalPill.svelte 45/45.

**Why deferred:** The remaining ~68 violations are owned by whichever
parallel session left the tree dirty. Per project policy (concurrent-tree
contamination), the owned deliverable is verified in isolation and the
contamination is surfaced, NOT reverted/committed by this plan. 66-05's
must-have truth #1 ("`bun run test:coverage` runs GREEN locally") cannot be
satisfied while the contaminated tree is present; it WILL be green once those
parallel-session changes are committed/coherent (or the tree is clean), because
66-05 adds no new violations.

**Action required (out of 66-05 scope):** Commit or discard the parallel-session
working-tree changes so the 100%-pinned files they touch are measured against
their committed state, then re-run `bun run test:coverage`. 66-05's contribution
(the five search/component pins) will pass independently of that cleanup.
