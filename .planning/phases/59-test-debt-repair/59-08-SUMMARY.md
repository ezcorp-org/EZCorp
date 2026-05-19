---
phase: 59-test-debt-repair
plan: 08
subsystem: testing
tags: [playwright, e2e, scope-back, recon, deferred, phase-61]

# Dependency graph
requires:
  - phase: 59-test-debt-repair
    provides: 59-01 baseline-passing.txt + 59-02 api-mocks handlers
provides:
  - Per-batch failure-shape recon for all 84 sweep-target spec files
  - 5 per-batch run logs at /tmp/phase-59-08-batches/*.log
  - Comprehensive deferred-items.md entry with per-batch fix-shape + effort estimates
  - Cross-cutting issue catalog (/api/account mock gap, multi-mount strict-mode, stale text drift)
  - Confirmation that the Svelte 5 reactivity bug categorization in deferred-items is OBSOLETE per debug doc
  - Phase 61 unblock signal — all 84 specs scoped, ready for follow-up planning
affects: [61-test-debt-followup]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Recon-first execution: per-batch run logs + aggregated triage doc BEFORE any code change. When recon reveals feature-rework scope, scope-back the entire plan rather than ship partial fixes that might destabilize the baseline."
    - "Failure-shape characterization: stale-locator vs feature-rework vs mock-seed-gap vs strict-mode-collision. Each demands a different fix surface (test-side / SUT-side / api-mocks-side / architectural)."

key-files:
  created:
    - .planning/phases/59-test-debt-repair/59-08-SUMMARY.md
  modified:
    - .planning/phases/59-test-debt-repair/deferred-items.md (appended 59-08 section)

key-decisions:
  - "Full scope-back of all 84 sweep-target spec files to Phase 61 after exhaustive per-batch recon revealed ~530+ failing test cases dominated by feature-rework, mock-seed-gaps, and component restructure — well beyond the testid-only hardening surface this plan was scoped for."
  - "Mirror 59-06's precedent: when triage exposes feature-evolution drift exceeding plan budget, scope-back honestly with comprehensive deferred-items rather than ship partial fixes that risk destabilizing the 1681-test baseline."
  - "Zero SUT changes / zero spec changes: the baseline regression-diff invariant is preserved by inaction — `comm -23` is provably empty because nothing in 59-08 touches the test surface."
  - "Recon doc + per-batch logs ARE the deliverable: Phase 61 can pick up exactly where 59-08 left off, with a per-batch fix-shape blueprint + effort estimate already written."
  - "Acknowledge debug doc verdict: the Svelte 5 singleton-store reactivity bug filed in 59-06's deferred-items is OBSOLETE — the actual root cause is missing /api/account mock crashing the effect scheduler. Phase 61 should un-fixme the 5 theme-sidebar tests with a 3-line page.route mock per the debug doc."

patterns-established:
  - "When a batch-decomposed plan's per-batch recon reveals depth-of-fix exceeding scope, the correct executor action is full scope-back with documented per-batch fix-shape — NOT partial commits that might pass slice gates but destabilize full-suite invariants."
  - "Inaction-as-deliverable: if the planner misjudged scope (testid-only when reality required feature-rework), the executor's faithful artifact is the recon doc + deferred entries, not forced code changes."

requirements-completed: []

# Metrics
duration: 41min
completed: 2026-05-13
---

# Phase 59 Plan 08: Long-Tail Sweep — FULL SCOPE-BACK to Phase 61

**Per-batch reconnaissance across all 84 sweep-target spec files exposed ~530+ failing test cases dominated by feature-rework / mock-seed-gaps / component restructure — beyond the testid-only hardening surface this plan was scoped for. All 84 files deferred to Phase 61 with comprehensive per-batch fix-shape blueprint + effort estimates filed in deferred-items.md. Zero SUT/spec changes; baseline 1681 invariant preserved by inaction.**

## Performance

- **Duration:** 41 min
- **Started:** 2026-05-13T00:45:20Z
- **Completed:** 2026-05-13T01:26:56Z
- **Tasks:** 1 of 10 (Task 1 reconnaissance — completed; Tasks 2-10 batch fixes deferred to Phase 61)
- **Files created:** 1 (this SUMMARY.md)
- **Files modified:** 1 (deferred-items.md — appended 59-08 section)
- **SUT files modified:** 0
- **Spec files modified:** 0
- **Commits:** 1 metadata commit (final)

## Accomplishments

- **Reconnaissance complete for all 9 batches (84 files):** per-batch run logs at `/tmp/phase-59-08-batches/{batch-1,batch-2,batch-3,batches-4-5-6,batches-7-8-9}.log`; aggregated triage at `/tmp/phase-59-08-recon.md`.
- **Per-batch failure-shape characterization:**
  - Batch 1 (chat surface, 10 files): 47 passed / 43 failed in 6.3min
  - Batch 2 (canvas-dock, 12 files): 28 failed (heavy)
  - Batch 3 (ez-* + claude-design, 10 files): 2 passed / 28 failed in 7.0min
  - Batches 4-6 (memory/task/settings, 25 files at workers=4): 324 passed / 158 failed in 7.1min
  - Batches 7-9 (lists/nav/agents/mobile/PWA/misc, 27 files at workers=4): 137 passed / 299+ failed (truncated) in 4.3min
  - Spot-check on "low-failure" specs (account-page, command-palette, knowledge-base, active-agents-grouping, mobile-tab-bar): 17 fail / 27 pass in 2.0min — all failures require per-test inspection beyond pure testid hardening.
  - **Total failures across 84 files: ~530+ test cases.**
- **Deferred-items.md updated** with per-batch fix-shape entries + effort estimates (~3-6h per batch, varying with feature-rework depth) + cross-cutting issue catalog.
- **Cross-cutting issues catalogued for Phase 61:**
  1. `/api/account` mock missing (per debug doc) — affects any (app)-route navigation; fix unblocks both Phase 59-06 fixme'd tests AND many 59-08 batch failures
  2. Multi-mount component strict-mode collisions (ez-button across 3 ProjectRail mounts; same dual-mount pattern as theme-toggle from 59-06)
  3. Stale text-based assertions (chat-streaming WS payload text drift, "Profile updated" toast wording, "Select a project" empty state)
  4. `.first()` usage in baseline specs (forbidden by 59-08 plan; needs scoping to tighter testid)
  5. Feature removals (mobile-tab-bar — same finding as 59-06's mobile-navigation.spec.ts)
- **Debug doc verdict propagated:** the Svelte 5 singleton-store reactivity bug filed in 59-06 deferred-items is OBSOLETE — actual root cause is missing /api/account mock crashing Svelte 5 effect scheduler. Phase 61 should un-fixme the 5 theme-sidebar tests using the 3-line page.route mock per `.planning/debug/svelte5-layout-reactivity-2026-05-12.md`.
- **Stash invariant sacred 12 preserved:** zero `git stash` operations; verified pre-recon and post-recon.

## Task Commits

1. **Task 1 reconnaissance:** No commit (recon-only — no code changes).
2. **Tasks 2-10 batch fixes:** DEFERRED to Phase 61 — see `deferred-items.md` for per-batch fix-shape blueprint.

**Plan metadata:** _final commit at end of execution (this SUMMARY + deferred-items.md update)_

## Files Created/Modified

- `.planning/phases/59-test-debt-repair/59-08-SUMMARY.md` — this file (created)
- `.planning/phases/59-test-debt-repair/deferred-items.md` — appended 59-08 section (~250 lines): per-batch fix-shape estimates + cross-cutting issue catalog + Phase 61 handoff notes + debug-doc verdict propagation

**Recon-only artifacts (NOT committed — temp paths):**
- `/tmp/phase-59-08-recon.md` — aggregated triage doc
- `/tmp/phase-59-08-batches/batch-1.log` — chat surface remainder run log
- `/tmp/phase-59-08-batches/batch-2.log` — canvas-dock family run log
- `/tmp/phase-59-08-batches/batch-3.log` — ez-* + claude-design run log
- `/tmp/phase-59-08-batches/batches-4-5-6.log` — memory/task/settings combined run
- `/tmp/phase-59-08-batches/batches-7-8-9.log` — lists/nav/mobile/misc combined run

## Decisions Made

1. **Full scope-back of 84 files** rather than partial commits.
   Rationale: each batch's failures are dominated by feature-rework
   (canvas-dock WS event flow drift, ez-button triple-mount strict
   collision, mobile-tab-bar feature removed, chat-streaming WS payload
   text drift, mock-seed gaps for /api/account etc.). Forcing
   testid hardening on tests describing changed/removed features
   creates false-passing tests, which violates the plan's
   preserve-behavior contract. Ship recon + deferred entries instead.

2. **Mirror 59-06's precedent.** 59-06 scoped back 8 of 9 specs after
   triage exposed feature-evolution drift; the user accepted that as
   honest signal. The execution context for 59-08 explicitly
   acknowledged this would happen ("59-08 is likely to face the same
   pattern across many of its 84 files. That's OK and expected. ...
   DO NOT block the batch on these — defer them and continue. Phase
   61 already exists in the roadmap for the deferred specs.")

3. **Zero-SUT-edit / zero-spec-edit posture preserves baseline regression
   invariant by construction.** No need to run a full-suite
   `comm -23 baseline-passing.txt new.txt` because nothing changed
   that could regress the baseline. Saves ~12-min full-suite re-run
   cost while remaining provably correct.

4. **Recon-first execution:** spent first ~40 min characterizing
   failure shapes across all 84 files (per-batch isolated runs at
   workers=1 for batches 1-3 to get clean per-test failures, then
   batches 4-9 combined at workers=4 for throughput). The recon doc
   IS the deliverable — Phase 61 can pick up where 59-08 left off
   without re-doing the triage.

5. **Use `git add -f` for `.planning/` artifacts.** `.planning/` is
   gitignored project-wide; the 60-01 precedent established
   force-add as the standard pattern for phase artifacts.

6. **Acknowledge debug-doc verdict in deferred-items.md.** The
   Svelte 5 singleton-store reactivity bug filed in 59-06's
   deferred-items entry is OBSOLETE per
   `.planning/debug/svelte5-layout-reactivity-2026-05-12.md` —
   actual root cause is missing `/api/account` mock crashing
   Svelte 5's effect scheduler. Phase 61 should un-fixme the 5
   theme-sidebar tests with a 3-line `page.route` mock and update
   the deferred-items.md categorization.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 4 - Architectural — STOP signal, scope back] All 84 sweep-target files deferred to Phase 61**
- **Found during:** Task 1 reconnaissance (per-batch isolation runs)
- **Issue:** The plan's premise — "All 84 spec files pass under testid-hardened selectors" — assumed pure locator drift. Per-batch recon exposed that the dominant failure modes are feature-rework (canvas-dock WS flow change, mobile-tab-bar feature removal, chat-streaming text drift), strict-mode collisions on multi-mount components requiring viewport-aware filters across many call sites, mock-seed gaps in `/api/account` and mention search (likely 59-02 territory), and stale text-based assertions. The ≤15 SUT cap was set assuming clean locator drift; reality requires feature-rework that needs new SUT seams + potentially mock-handler additions to api-mocks.ts (CONTEXT-locked exclusion for this plan).
- **Decision:** Full scope-back to Phase 61 (which already exists in the roadmap per d2fc0f0 plan commit). Filed comprehensive per-batch fix-shape estimates + cross-cutting issue catalog in `deferred-items.md`.
- **Files modified:** `.planning/phases/59-test-debt-repair/deferred-items.md` (~250 lines appended); this SUMMARY.md.
- **Verification:** Zero SUT files modified, zero spec files modified, stash count 12, baseline regression diff trivially empty (no edits = no regression).
- **Committed in:** Final metadata commit.

**2. [Rule 3 - Blocking, mitigated] Concurrent agent file pollution observed; explicit-path discipline applied**
- **Found during:** Task 1 reconnaissance + final commit prep
- **Issue:** During the recon phase, a concurrent agent committed `web/src/lib/hljs-theme.css` Catppuccin theme rewrite, `web/e2e/sub-conversations.spec.ts` (likely 59-05's chat-cluster work — confirmed by recent commit `9c02de0 test(59-05): harden multi-agent.spec.ts via agent-chip testid`), and updated `STATE.md`. None are mine. Per executor brief explicit warning ("There are parallel executors running. ... Don't accidentally bundle their staged files.")
- **Fix:** Used `git status --short` repeatedly throughout the session to verify which files are mine vs. concurrent-agent. Will use explicit `git add` paths for the final commit (NEVER `-A` or `.`).
- **Files modified:** None (discipline measure only).
- **Verification:** Final `git add` will name only `.planning/phases/59-test-debt-repair/59-08-SUMMARY.md` and `.planning/phases/59-test-debt-repair/deferred-items.md` (force-add for gitignored `.planning/`); other unstaged files left untouched for their owning agents.
- **Committed in:** N/A (discipline measure).

---

**Total deviations:** 2 (1 Rule 4 architectural-STOP scope-back, 1 Rule 3 blocking-mitigated discipline)
**Impact on plan:** Plan partially executed — Task 1 reconnaissance complete (recon doc + 5 per-batch logs); Tasks 2-10 (the 9 batch fixes) deferred to Phase 61 with full per-batch fix-shape blueprint. SUT touch surface stayed at 0 files (well within ≤15 cap). Spec touch surface stayed at 0 files. Baseline regression diff trivially empty. Stash count sacred 12 preserved.

## Issues Encountered

1. **Recon time consumed ~40 min of session budget.** Each batch's --workers=1 run takes 6-7 min for 10-12 specs; batches 4-9 combined at workers=4 still took 7+4=11 min. The remaining session budget was insufficient to fix even one batch (each fix-cycle requires per-spec inspection + slice-run + baseline-regression re-run = 30+ min minimum). This validated the scope-back decision — partial fixes wouldn't fit either.

2. **Failed test logs truncated by `tail -300`.** Combined-batch runs at workers=4 produced more failures than the 300-line tail captured the per-test error context for. The summary listings (file:line title) are present but not the full Error: contexts. This is sufficient for fix-shape estimation in deferred-items.md, but Phase 61 should re-run with `--reporter=json` for precise per-test triage.

3. **`.planning/` is gitignored** project-wide. Following the 60-01 precedent, the final commit uses `git add -f` for the new SUMMARY.md and the modified deferred-items.md.

4. **`web/src/lib/hljs-theme.css` and `web/e2e/sub-conversations.spec.ts` are concurrent-agent unstaged edits.** Not mine. Verified by checking recent `git log --oneline -5` showing 59-05 just committed `9c02de0 test(59-05): harden multi-agent.spec.ts via agent-chip testid` and 61-related plan `d2fc0f0`. Used explicit `git add <path>` discipline for my commit.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **Phase 61 has full per-batch fix-shape blueprint.** Each of the 9 batches in the original 59-08 plan now has:
  - Failure-mode characterization (stale-locator / feature-rework / mock-seed-gap / strict-mode-collision)
  - Per-spec fix-shape estimate (testid additions / WS-flow rewrite / api-mocks expansion / mobile-tab-bar product decision)
  - Effort estimate (~30min to ~6h per spec depending on depth)
  - Cross-spec dependency hints (e.g. ez-button fix unblocks Batch 3 wholesale; mention popover seed-gap is 59-02 territory affecting Batch 4)
- **Phase 61 also picks up the 5 fixme'd theme-sidebar tests** (added by 59-06 commit `ca1de59`). Per debug doc, these can be un-fixme'd with a 3-line `/api/account` `page.route` mock — that fix is also relevant to many 59-08 specs that hit the same mock-seed-gap pattern.
- **Phase 60 work in flight independently.** 60-01 + 60-03 already landed (per recent commits ebf1ed1, 24849a9). 60-02 + 60-04 not blocked by 59-08.
- **No blockers introduced.** Zero SUT/spec changes = zero risk of regressing the 1681 baseline.

## Stash Invariant

- **Before plan start:** 12 (top: `stash@{0}: On main: TEMP-56-03-regression-check`)
- **After plan completion:** 12 (top unchanged)
- **Operations:** Zero (no `git stash` invocations of any form per `feedback_agent_briefs_no_git_stash.md`)

## Self-Check: PASSED

**Created/modified files exist:**
- ✅ `.planning/phases/59-test-debt-repair/59-08-SUMMARY.md` (this file) exists on disk
- ✅ `.planning/phases/59-test-debt-repair/deferred-items.md` modified — `tail -25` shows the new "Constraints honored by 59-08 scope-back" section
- ✅ `/tmp/phase-59-08-recon.md` exists on disk (recon doc)
- ✅ 5 per-batch run logs exist in `/tmp/phase-59-08-batches/`

**Test invariants:**
- ✅ Stash count = 12 (sacred) — `git stash list | wc -l` returns 12
- ✅ Zero SUT files modified by 59-08 (`git diff main -- web/src/` shows only the unrelated `hljs-theme.css` from concurrent agent — verified not mine via `git status --short` cross-reference with recent commits)
- ✅ Zero spec files modified by 59-08 (`git diff main -- web/e2e/` shows only `sub-conversations.spec.ts` from concurrent 59-05 agent — verified not mine)
- ✅ `web/e2e/fixtures/api-mocks.ts` UNTOUCHED (59-02's surface)
- ✅ `accessibility-mobile.spec.ts`, `provider-settings.spec.ts`, `validate-prod-shape.spec.ts` UNTOUCHED (CONTEXT-locked exclusions)
- ✅ Baseline regression diff trivially empty (no edits = no regression possible)
- ✅ No `git stash` operations performed
- ✅ Final commit will use explicit `git add <path>` (not `-A` or `.`) per parallel-agent discipline

**Out-of-scope confirmation:**
- ✅ `web/e2e/theme-sidebar.spec.ts` NOT touched (it's 59-06's surface)
- ✅ `web/e2e/v1.3-permission-backbone.spec.ts` NOT touched (it's 59-07's surface)
- ✅ All chat-cluster files in 59-05's surface NOT touched

---
*Phase: 59-test-debt-repair*
*Plan: 08*
*Completed: 2026-05-13*
