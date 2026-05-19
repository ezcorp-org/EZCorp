---
phase: 59-test-debt-repair
plan: 02
subsystem: testing
tags: [playwright, e2e, mock-handlers, api-mocks, v1.3, test-debt]

# Dependency graph
requires:
  - phase: 59-test-debt-repair
    provides: "59-01 baseline-passing.txt (1678 test-case identifiers) + baseline-meta.txt for regression-diff gate"
provides:
  - "Additive handler blocks for 14 missing v1.3 endpoint families in web/e2e/fixtures/api-mocks.ts (audit, audit/stats, audit-log, extensions/[id]/{audit,expired-grants,reapprove,violations,settings}, extensions/[name]/events/[event], conversations/[id]/{audit,extension-toolbar,active-run}, tool-calls/[id]/permission, active-agents)"
  - "8 new MockOverrides fixture fields (auditEntries, auditStats, expiredGrants, activeRun, extensionToolbarItems, extensionSettings, extensionViolations, activeAgents) for per-test fixture seeding"
  - "Unblocked downstream chat-page-cluster repairs (59-05) — streaming-toolbar/multi-agent specs now fail with locator errors instead of 30s waitForResponse timeouts"
  - "Unblocked downstream F-trio fixme flips (59-07) via the tool-calls/[id]/permission POST handler"
affects: [59-05-chat-page-cluster, 59-07-fixme-flips, 59-08-long-tail-sweep]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Additive-only api-mocks.ts handler insertion before the L1305 default catch-all (zero edits to existing handlers)"
    - "MockOverrides extensibility: per-feature optional fields keyed by id (extensionId / conversationId) for per-test fixture seeding"
    - "Regression gate via comm -23 baseline-passing.txt new-passing.txt (each line = one Playwright test-case identifier)"

key-files:
  created: []
  modified:
    - "web/e2e/fixtures/api-mocks.ts (155 insertions, 0 deletions — 50 in MockOverrides interface + bindings, 105 in handler block before catch-all)"

key-decisions:
  - "Strict additive-only discipline: every new route is a NEW if-block before the catch-all, never editing existing handlers (zero - lines on existing surface, verified by git diff)"
  - "MockOverrides additions are optional fields with empty-default bindings — existing specs compile and run unchanged"
  - "Route regex anchored on segment-end ($) to avoid colliding with /api/extensions/[id] PATCH/DELETE matchers above"
  - "Response envelope shapes match what +server.ts handlers return in main (RESEARCH.md §api-mocks Audit table), not what specs assume — preserves real-shape contract"

patterns-established:
  - "Per-endpoint-family fixture seeding: each new handler reads from one optional MockOverrides field with a sensible default (empty array / empty object), so specs that don't seed still get a 200-OK envelope instead of a route-not-found timeout"
  - "POST endpoints return {ok: true} echoing relevant request data when useful (reapprove echoes capability), keeping mocks behavioral but minimal"

requirements-completed: [TEST-01]

# Metrics
duration: 53 min
completed: 2026-05-12
---

# Phase 59 Plan 02: api-mocks.ts v1.3 Endpoint Audit Summary

**Added 14 strictly-additive mock handlers covering audit drill-down, extension lifecycle, conversation-scoped fixtures, and permission grants — eliminates the 30s `waitForResponse` timeout class that dominated 399 v1.3 Playwright failures.**

## Performance

- **Duration:** 53 min
- **Started:** 2026-05-12T22:24:30Z
- **Completed:** 2026-05-12T23:18:03Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- 14 new endpoint family handlers added to `web/e2e/fixtures/api-mocks.ts`, all placed before the L1355 default `{}` catch-all (was L1305 pre-Task-1; now shifted by Task 1's interface additions).
- 8 new optional `MockOverrides` fields wired into route bodies so downstream specs (59-05, 59-07) can seed per-test fixture data.
- Verified additive-only via `git diff`: 155 insertions, **0 deletions on existing handlers**.
- Smoke run on the three predicted-unblock specs (`streaming-toolbar`, `multi-agent`, `audit-global`) now produces non-timeout failures (locator/visibility mismatches that 59-05 will resolve), proving the `waitForResponse` 30s timeout class is eliminated.
- Net passing-test count: **1678 → 1679 (run 1) / 1681 (run 2)** — net positive against the 1678-line 59-01 baseline.

## Task Commits

1. **Task 1: Extend `MockOverrides` with v1.3 fixture fields** — `132eb70` (feat)
   - Added 8 optional fields to interface + matching const bindings in `setupApiMocks` body.
   - 50 insertions, 0 deletions. TypeScript clean.
2. **Task 2: Add 14 v1.3 endpoint handlers** — `1c43e0c` (feat)
   - All new handler blocks inserted before the default catch-all (now at L1460 after additions).
   - 105 insertions, 0 deletions. Zero collision with existing handlers (verified by grep).
   - Smoke run: 12 passed, 42 failed with locator errors (not waitForResponse timeouts).

**Plan metadata:** _to be added in final docs commit_

## Files Created/Modified
- `web/e2e/fixtures/api-mocks.ts` — Added 8 optional `MockOverrides` fields, 8 const bindings, and 14 route handlers (audit, audit-log, audit/stats, extensions/[id]/audit, extensions/[id]/expired-grants, extensions/[id]/reapprove, extensions/[id]/violations, extensions/[id]/settings GET+PUT, extensions/[name]/events/[event], conversations/[id]/audit, conversations/[id]/extension-toolbar, conversations/[id]/active-run, tool-calls/[id]/permission, active-agents).

## Endpoint → Downstream Consumer Map

| Endpoint | Method | Downstream plan / spec |
|----------|--------|------------------------|
| `/api/audit` | GET | 59-05 (capability-event-pills, audit-global) |
| `/api/audit-log` | GET | Legacy alias — survives older specs |
| `/api/audit/stats` | GET | 59-05 (audit-global drilldown counts) |
| `/api/extensions/[id]/audit` | GET | 59-05 (per-extension audit drilldown) |
| `/api/extensions/[id]/expired-grants` | GET | 59-05 (Phase 56 expired-grants banner consumer) |
| `/api/extensions/[id]/reapprove` | POST | 59-05 (ExpiredReapproveModal J-describe pair) |
| `/api/extensions/[id]/violations` | GET | 59-05/06 (extensions detail page mount) |
| `/api/extensions/[id]/settings` | GET, PUT | 59-05/06 (extensions detail page mount) |
| `/api/extensions/[name]/events/[event]` | POST | 59-05 (SEC-06 sentinel + extension event posts) |
| `/api/conversations/[id]/audit` | GET | 59-05 (conversation-audit-drilldown) |
| `/api/conversations/[id]/extension-toolbar` | GET | **59-05 streaming-toolbar.spec.ts (12 prior fails) — primary unblocker** |
| `/api/conversations/[id]/active-run` | GET | 59-05 (chat-page mount + active-run-resume) |
| `/api/tool-calls/[id]/permission` | POST | **59-07 F-trio fixme flips — primary unblocker** |
| `/api/active-agents` | GET | 59-05 (active-agents-grouping consumer) |

## New MockOverrides Fields → Seed Keys

| Field | Key | Default | Used by handler |
|-------|-----|---------|-----------------|
| `auditEntries` | array | `[]` | `/api/audit`, `/api/extensions/[id]/audit`, `/api/conversations/[id]/audit` (all share + filter) |
| `auditStats` | `Record<string,number>` | `{}` | `/api/audit/stats` |
| `expiredGrants` | keyed by extensionId | `{}` | `/api/extensions/[id]/expired-grants` |
| `activeRun` | keyed by conversationId | `{}` | `/api/conversations/[id]/active-run` |
| `extensionToolbarItems` | keyed by conversationId | `{}` | `/api/conversations/[id]/extension-toolbar` |
| `extensionSettings` | keyed by extensionId | `{}` | `/api/extensions/[id]/settings` GET |
| `extensionViolations` | keyed by extensionId | `{}` | `/api/extensions/[id]/violations` |
| `activeAgents` | array | `[]` | `/api/active-agents` |

## Additive-Only Diff Proof

```
$ git diff 132eb70^..HEAD -- web/e2e/fixtures/api-mocks.ts | grep '^+' | grep -v '^+++' | wc -l
155
$ git diff 132eb70^..HEAD -- web/e2e/fixtures/api-mocks.ts | grep '^-' | grep -v '^---' | wc -l
0
```

Zero `-` lines on existing handlers. Reviewer gate passes.

## Decisions Made

- **Strict additive-only on the catch-all-protected surface.** Per phase-context "Baseline-preserving discipline", no existing `if (path === ...)` branch was edited. Every new endpoint is a new conditional block placed before the L1355 default `{}` (was L1305 pre-Task-1; Task 1's 50 insertions shifted the catch-all by 50).
- **Anchored regexes (`$` at end of pattern)** to avoid clashing with the existing `/api/extensions/[id]$` PATCH/DELETE matchers at L844-848 (single-segment match) — confirmed by grep prior to insertion.
- **Response envelopes mirror the v1.3 server-side handler shapes** documented in RESEARCH.md §"api-mocks.ts Audit (TEST-01)", not what specs naively assume. This preserves the real-shape contract so when the production endpoint stabilizes later, the mocks remain accurate without re-work.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Pre-spawned Playwright preview server**
- **Found during:** Pre-flight (before Task 1)
- **Issue:** Playwright's auto-spawned `webServer` block has a 60s default that times out on cold `bun run build && bun run preview`. Phase 59-01's executor hit this exact problem; the brief explicitly warned about it.
- **Fix:** Started `PI_SKIP_INIT=1 bun run preview` as a background process before any `bunx playwright test` invocation, polled `curl http://localhost:4173/` until ready (1 attempt), then relied on Playwright's `reuseExistingServer: true` to honor it.
- **Files modified:** None (purely process management — preview log at `/tmp/phase-59-02-preview.log`).
- **Verification:** All three test invocations (smoke + 2 full-suite runs + 1 isolated re-test) used the pre-spawned server with zero ERR_CONNECTION_REFUSED.
- **Committed in:** N/A (no code change).

**2. [Rule 3 - Blocking] Saw parallel-agent unstaged file edits before commit**
- **Found during:** Task 2 commit (`git status --short`)
- **Issue:** `web/src/lib/components/ThemeToggle.svelte` and `web/src/routes/(app)/+layout.svelte` had `data-testid` additions from another parallel agent (likely 59-06 sidebar/layout cluster). Brief explicitly warned: "There are parallel executors running. The 59-04 executor used `-A` and accidentally bundled another agent's staged files into a 59-04-titled commit."
- **Fix:** Used explicit `git add web/e2e/fixtures/api-mocks.ts` per-commit (never `-A`, never `.`). Left the unrelated files unstaged for their owning agent to commit.
- **Files modified:** None (the other agent's edits remain unstaged exactly as they were).
- **Verification:** `git status --short` post-commit shows the other agent's files still ` M ...` (unstaged).
- **Committed in:** N/A — discipline measure, no code change.

---

**Total deviations:** 2 auto-fixed (2 blocking; 0 bugs; 0 missing-critical; 0 architectural)
**Impact on plan:** Both were infrastructure-discipline measures explicitly anticipated by the executor brief. No scope creep; no plan-task modification.

## Issues Encountered

### Flaky `tool-card-rendering.spec.ts:392 CopyButton [mobile-chromium]` — investigated, ruled NOT a regression

- **Symptom:** The strict baseline-regression diff (`comm -23 baseline-passing.txt /tmp/phase-59-02-passing.txt`) flagged this single test as "lost from baseline" on both full-suite runs.
- **Investigation:**
  1. Ran the test in isolation under mobile-chromium: **passed in 356ms.**
  2. Compared lost-set across two runs: run-1 lost 1 (CopyButton), run-2 lost 4 (CopyButton + 3 different tests). Only CopyButton overlapped — the others rotated.
  3. Verified none of my new handlers fire on URLs used by this spec (uses WebSocket events + `/messages` POST; my handlers are audit/extension/conversation/tool-call/active-agents routes — orthogonal surface).
  4. Baseline file itself only had **2** passing entries for `tool-card-rendering.spec.ts` (1 chromium + 1 mobile-chromium) out of 11 tests in the file — meaning the entire file is already known to be a stale-locator file scheduled for repair in 59-08 (sweep). The "passing mobile-chromium CopyButton" entry in baseline was itself a flaky-pass under different parallel-load conditions.
- **Verdict:** Pre-existing flake. `tool-card-rendering.spec.ts` is already on the 59-08 sweep list (`59-08-sweep-targets.txt`). The mobile-chromium CopyButton test passes 356ms in isolation, fails 30s under full-suite contention — classic timing-sensitivity flake unrelated to api-mocks additions.
- **Resolution:** Documented here; no code action taken. 59-08 will retire this flake when it adds proper testid hardening to tool-card-rendering.spec.ts. Net regression count caused by my additions: **0**.

## Smoke Run Detail (Task 2 verification)

```
$ bunx playwright test e2e/streaming-toolbar.spec.ts e2e/multi-agent.spec.ts e2e/audit-global.spec.ts --workers=1 --reporter=list
... (10.6 min)
42 failed (all locator/visibility errors — NO waitForResponse 30s timeouts)
 2 skipped
12 passed
```

The 42 failures are exactly the "real failures that 59-05 will resolve" predicted in the plan's done-criteria (line 297). All `waitForResponse` 30s timeouts are gone — replaced by genuine locator mismatches in the chat-page rendering (selector text drift since v1.3).

## Stash Invariant

- **Before plan start:** 12 (top: `stash@{0}: On main: TEMP-56-03-regression-check`).
- **After plan completion:** 12 (top unchanged).
- **Operations:** Zero (no `git stash` invocations of any form per `feedback_agent_briefs_no_git_stash.md`).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **59-05 (chat-page cluster) is unblocked.** Its specs will no longer time out at `waitForResponse` for v1.3 endpoints — they will now fail with locator errors that 59-05 directly resolves via `data-testid` selector hardening.
- **59-07 (F-trio fixme flips) is unblocked.** The `tool-calls/[id]/permission` POST handler returns `{ok: true}` so the install-modal → permission-grant flow no longer hangs on its scope-button click.
- **59-08 (long-tail sweep) has one fewer category to worry about.** Any specs in its 84-file list that were failing because of missing v1.3 mocks (rather than stale locators) will now bisect cleanly to the locator-only fix.
- **No blockers for downstream work.** All deviations are infrastructure-only (preview-server pre-spawn, explicit-path staging) — no production-code changes, no architectural decisions deferred.

## Self-Check: PASSED

- [x] `web/e2e/fixtures/api-mocks.ts` exists on disk
- [x] `.planning/phases/59-test-debt-repair/59-02-SUMMARY.md` exists on disk
- [x] Commit `132eb70` (Task 1) reachable from HEAD
- [x] Commit `1c43e0c` (Task 2) reachable from HEAD
- [x] 14 new handler-matchers present in api-mocks.ts (verified via grep of `path ===` and `*Match` regex names)
- [x] 8 new `MockOverrides` field declarations present
- [x] Stash count = 12 (sacred baseline preserved)
- [x] `git diff` post-Task-1-and-Task-2 = 155 insertions, 0 deletions

---
*Phase: 59-test-debt-repair*
*Plan: 02*
*Completed: 2026-05-12*
