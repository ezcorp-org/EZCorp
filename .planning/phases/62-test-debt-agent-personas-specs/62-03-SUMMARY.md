---
phase: 62-test-debt-agent-personas-specs
plan: 03
subsystem: testing
tags: [test-debt, e2e, playwright, mobile-chromium, swipe-drawer, agent-chat, cluster-c, repair]

# Dependency graph
requires:
  - phase: 61-test-debt-followup-feature-rework-specs
    provides: "61-03 Bucket A REPAIR pattern (mobile-navigation drawer-open helper inline-in-test-body); deferred-items.md retitle"
  - phase: 59-test-debt-repair
    provides: "59-02 api-mocks.ts handler set (untouched per Phase 59 boundary)"
provides:
  - "agent-chat.spec.ts:56 (Agent conversation subtitle) passes on chromium AND mobile-chromium"
  - "Inline viewport-aware drawer-open helper pattern (debug-doc co-located)"
  - "Visible-container locator-scope pattern to dodge strict-mode collision when both responsive copies live in DOM"
affects: [62-04 agent-detail product fix, future mobile-aware spec repairs, cluster-C closeout]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Inline viewport-aware drawer-open guard: `if ((page.viewportSize()?.width ?? 0) < 768) await page.getByRole('button', { name: 'Open conversations' }).click()`"
    - "Responsive locator-scope: `const sidebar = isMobile ? page.getByTestId('swipe-drawer') : page; sidebar.getByText(...)` — works on both viewports without `.first()`/`.last()`"

key-files:
  created:
    - ".planning/phases/62-test-debt-agent-personas-specs/62-03-SUMMARY.md"
  modified:
    - "web/e2e/agent-chat.spec.ts (only file touched; 13 +/2 -)"

key-decisions:
  - "Refined Edit 1 with locator-scope to the visible container — bare `getByText('Agent conversation')` after drawer-open triggered strict-mode collision (both desktop CSS-hidden + mobile drawer-mounted ConversationLists in DOM). Used `getByTestId('swipe-drawer')` scope rather than `.first()` (banned)."
  - "Reverted Edit 2 (the preventive :85 drawer-open guard) per plan's explicit revert-on-regression clause: tapping 'Open conversations' on a non-chat-route-style flow opens a SwipeDrawer whose backdrop intercepts the ChatHeader 'Conversation settings' button click. Documented per plan's instruction."

patterns-established:
  - "Mobile-only drawer-open + visible-container scope: when responsive design mounts BOTH responsive branches (desktop CSS-hidden via `hidden md:flex` + mobile inside SwipeDrawer's `{#if visible}`), drawer-open ALONE is insufficient. Scope the assertion to the visible parent (`page` on desktop, `page.getByTestId('swipe-drawer')` on mobile)."
  - "Preventive guards must verify regression-free on BOTH viewports BEFORE shipping; revert per-plan-clause if backdrop/overlay races appear."

requirements-completed: [TEST-02]

# Metrics
duration: ~30min
completed: 2026-05-13
---

# Phase 62 Plan 03: agent-chat.spec.ts:56 mobile drawer-open repair Summary

**Mobile-aware drawer-open helper + visible-container locator scope on agent-chat.spec.ts:56 — 12/12 cases green across chromium + mobile-chromium; preventive :85 guard reverted per plan's regression-revert clause.**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-05-13T14:55:00Z (approx — preview-server build + 2-project verification dominated)
- **Completed:** 2026-05-13T15:25:29Z
- **Tasks:** 2 (single atomic commit)
- **Files modified:** 1 (`web/e2e/agent-chat.spec.ts` — 13 insertions / 2 deletions)

## Accomplishments

- `agent-chat.spec.ts:56` mobile-chromium regression closed — was 1 failure (Pixel 5 viewport hits CSS-hidden desktop sidebar), now 12/12 cases pass on chromium + mobile-chromium two consecutive runs (no flake).
- Inline viewport-aware drawer-open helper added per debug doc § "Suggested fix § Option A (preferred — one test covers both viewports)".
- Visible-container locator-scope pattern established for responsive specs (closes a gap the debug doc didn't anticipate: when BOTH desktop + drawer copies are in DOM, drawer-open alone causes strict-mode collision).
- Sacred-12-stash invariant preserved pre + post execution; zero `git stash` operations.
- Zero SUT changes (verified by Layer 5 invariants: `playwright.config.ts`, `api-mocks.ts`, `SwipeDrawer.svelte`, `ConversationList.svelte` all clean against main).
- Parallel-session dirty files (`web/e2e/agent-detail.spec.ts` from 62-02, `web/src/lib/hljs-theme.css`) NOT staged — explicit-path `git add` discipline.

## Task Commits

1. **Task 1 + Task 2 (atomic):** `6aa729f` — `test(62-03): repair agent-chat.spec.ts:56 mobile-aware drawer open + scoped sidebar locator` (test) — single commit per plan's "1 atomic commit" contract.

## Files Created/Modified

- `web/e2e/agent-chat.spec.ts` — 11-line viewport-aware helper block before the :56 assertion; bare `page.getByText(...)` → `sidebar.getByText(...)` (2 assertion-line changes — necessary Rule-1 deviation; see Deviations).
- `.planning/phases/62-test-debt-agent-personas-specs/62-03-SUMMARY.md` — this file.

## Decisions Made

- **Drop Edit 2 (preventive :85 guard) per plan clause.** The plan explicitly stated: "IF the preventive guard at :85 causes the test to regress on either project (e.g., because clicking `Open conversations` then the settings affordance creates a race), REVERT just Edit 2 and keep Edit 1." Empirically the guard regressed both mobile-chromium :56 and :85 cases — the SwipeDrawer's `data-testid="swipe-drawer-backdrop"` overlay intercepts pointer events on the ChatHeader's `Conversation settings` button. Reverted Edit 2.
- **Scope Edit 1 assertion to the visible container.** After drawer-open, BOTH the desktop ConversationList (CSS-hidden via `hidden md:flex` wrapper) AND the mobile ConversationList (now-mounted inside `<SwipeDrawer>` `{#if visible}` block) are in DOM. `page.getByText("Agent conversation")` matched 2 elements → strict-mode violation. Resolved via locator chain: `const sidebar = isMobile ? page.getByTestId("swipe-drawer") : page; sidebar.getByText("Agent conversation")`. This avoids the banned `.first()` while preserving exact-match semantics. Pattern doubles for other responsive specs in cluster-C.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Refined Edit 1 to scope assertions to visible container (avoid strict-mode collision)**
- **Found during:** Task 1 (first verification run)
- **Issue:** Plan's prescribed Edit 1 (just drawer-open + unchanged bare `getByText("Agent conversation")`) produced strict-mode violation on mobile-chromium: "resolved to 2 elements" — both desktop CSS-hidden and mobile drawer-mounted ConversationLists in DOM. Debug doc did not anticipate the strict-mode collision; it asserted that opening the drawer would resolve visibility, but Playwright's strict-mode check runs BEFORE visibility filtering.
- **Fix:** Added `const isMobile = (page.viewportSize()?.width ?? 0) < 768;` once; on mobile, scope assertions to `page.getByTestId("swipe-drawer")`. The two `expect(page.getByText(...))` lines became `expect(sidebar.getByText(...))`. No `.first()`/`.last()` used.
- **Files modified:** `web/e2e/agent-chat.spec.ts` (the 2 assertion lines + helper block)
- **Verification:** 12/12 pass on `bunx playwright test agent-chat.spec.ts --project=chromium --project=mobile-chromium --workers=1` — two consecutive runs, 8.6s + 8.4s — no flake.
- **Committed in:** `6aa729f` (single atomic commit per plan)

**2. [Rule 1 - Bug] Reverted Edit 2 (:85 preventive guard) per plan's explicit revert-on-regression clause**
- **Found during:** Task 1 (first verification run)
- **Issue:** Plan's optional Edit 2 (preventive drawer-open guard at :85) regressed both mobile-chromium :56 and :85 cases. After opening the SwipeDrawer on a chat route, the drawer's `data-testid="swipe-drawer-backdrop"` (z-index 40) intercepts pointer events on the ChatHeader's `Conversation settings` button — Playwright reports 55+ retries with `<div ... data-testid="swipe-drawer-backdrop">... subtree intercepts pointer events`. Test timed out at 30s.
- **Fix:** Reverted just the Edit 2 block (5 lines removed). Edit 1 retained — :85 is viewport-agnostic via ChatHeader, so no mobile-specific work needed.
- **Files modified:** `web/e2e/agent-chat.spec.ts` (revert of :85 helper block before final commit)
- **Verification:** :85 passes 872ms on mobile-chromium without the guard — confirmed plan's hypothesis that the ChatHeader settings affordance is viewport-agnostic.
- **Committed in:** `6aa729f` (single atomic commit — the revert never made it to a separate commit; commit reflects final state)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — bug class). Edit 1 scoped to dodge collision; Edit 2 reverted per plan clause.
**Impact on plan:** Both auto-fixes follow plan-text explicit guidance (Edit 2 revert) or close a gap in the prescribed fix shape (Edit 1 scope refinement). No SUT changes. No selector-strategy violations (`.first()` not used). Plan's "ONLY additions, no edits to existing assertions" done-criterion was modestly relaxed: 2 assertion lines now reference the scoped `sidebar` locator. Same semantics, scoped to the visible list — necessary for strict-mode correctness.

## Issues Encountered

- **Strict-mode collision after drawer-open (not anticipated by debug doc).** Resolved via locator-scope (see Auto-fix #1).
- **Preview-server reuse confusion.** A parallel session had a preview already on :4173; my redundant background spawn landed on :4174 then :4175. Killed the redundants; Playwright's `reuseExistingServer: true` honored :4173. Playwright still spawned its own webServer for the test run (saw `[WebServer]` output in test logs) — but `reuseExistingServer` only suppresses the spawn if the URL is already up; the parallel preview must have been on a slightly different port or in a transient down state when `webServer.url` was probed. Net impact: ~30s extra cold-build per first run, ~0s on subsequent runs (server stayed up).

## User Setup Required

None — pure test-side change.

## Self-Check

- [x] `web/e2e/agent-chat.spec.ts` modified at HEAD `6aa729f` — verified via `git log --oneline -- web/e2e/agent-chat.spec.ts`
- [x] Disposition trailer present — verified via `git log -1 --pretty=%B | grep -E "Disposition: REPAIR|Debug: \.planning/debug/agent-chat-mobile-subtitle"` — both lines emit
- [x] Sacred-12 stash invariant — `git stash list | wc -l == 12` pre + post execution
- [x] Layer 5 invariants clean — `git diff main -- web/playwright.config.ts web/e2e/fixtures/api-mocks.ts web/src/lib/components/SwipeDrawer.svelte web/src/lib/components/ConversationList.svelte` all empty
- [x] 12/12 Playwright pass on 2 consecutive runs (chromium + mobile-chromium, workers=1)

## Self-Check: PASSED

## Next Phase Readiness

- **62-03 closes the third + final stale-spec selector cluster (Cluster C) per CONTEXT.md wave-1 plan.**
- 62-01 + 62-02 still independent wave-1 plans (no dependency from 62-03).
- 62-04 (agent-detail product fix) depends on 62-02, not on 62-03 — no blockage introduced here.
- Pattern established (viewport-aware drawer-open + visible-container scope) is reusable for any future cluster-C-style responsive selector repairs.

---
*Phase: 62-test-debt-agent-personas-specs*
*Completed: 2026-05-13*
