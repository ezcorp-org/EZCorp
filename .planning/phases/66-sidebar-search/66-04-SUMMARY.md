---
phase: 66-sidebar-search
plan: 04
subsystem: ui
tags: [search, deep-link, e2e, playwright, sidebar, pulse, hybrid-search]

# Dependency graph
requires:
  - phase: 66-sidebar-search
    plan: 01
    provides: "GET /api/search/messages e2e mock + makeSearchHit factory; groupHitsByConversation"
  - phase: 66-sidebar-search
    plan: 02
    provides: "Sidebar mode toggle + two-section Messages results (message-hit rows emit messageId)"
  - phase: 66-sidebar-search
    plan: 03
    provides: "?m= deep-link plumbing (ChatThread consume/strip + resolveDeepLink + .message-pulse)"
provides:
  - "End-to-end coverage of the whole phase user surface across chromium + mobile-chromium"
  - "UI-01/02 e2e: mode toggle renders, defaults Hybrid, survives reload via global chatSearch.mode LS key"
  - "UI-04 e2e: two-section results (Conversations title + grouped Messages), <2-char guard, degraded notice, generic empty state"
  - "UI-03 e2e: click→?m=→scroll+pulse for recent / paginated-out / off-branch targets; strip-on-reload; unknown-id silent no-op; group-header non-deep-link"
  - "ChatThread deep-link now fires on the sidebar CLICK journey (client nav), not only cold load"
affects: [67-command-palette]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Viewport-aware e2e helper (isMobile/sidebar/openSearch): opens the mobile SwipeDrawer + scopes to the visible ConversationList so one assertion runs on both projects"
    - "Pulse asserted via class APPLY → REMOVE with expect.poll (never wall-clock animation)"
    - "Reactive ?m= consume effect (not onMount-only) so a persistent, non-remounting component still deep-links on client navigation"
    - "Don't permanently no-op a deep-link on found:false while the target conv's allMessages is still loading — gate the give-up on initialLoadDone"

key-files:
  created:
    - web/e2e/sidebar-search-deeplink.spec.ts
  modified:
    - web/e2e/conversation-search.spec.ts
    - web/src/lib/components/ChatThread.svelte

key-decisions:
  - "Made each case run green on chromium + mobile-chromium by adding viewport-aware openSearch()/sidebar() helpers that open the mobile drawer and scope to the visible ConversationList — this also repaired 9 PRE-EXISTING desktop-only baseline mobile failures rather than regressing them"
  - "Drive the deep-link via a real sidebar-row click into a SEPARATE target conversation (hits point at the target, host conv is the landing page) so the full search→click→?m=→scroll+pulse journey is exercised exactly as a user drives it"
  - "Scope off-branch message-content assertions to [data-testid=chat-messages-container] — the sidebar hit row carries the same snippet text and would strict-mode-collide"
  - "Rule-1 SUT fix in ChatThread.svelte: the ?m= deep-link only fired on cold mount; the click-journey (client goto on a persistent component) never pulsed/stripped. Moved consume to a reactive effect + made found:false non-terminal until initialLoadDone"

requirements-completed: [UI-01, UI-02, UI-03, UI-04]

# Metrics
duration: ~35min
completed: 2026-05-29
---

# Phase 66 Plan 04: Sidebar Search E2E Summary

**Full-phase end-to-end coverage (UI-01/02/03/04) across chromium + mobile-chromium: extended `conversation-search.spec.ts` with the mode toggle + two-section + degraded/empty assertions, created `sidebar-search-deeplink.spec.ts` for the click→`?m=`→scroll+pulse journey (recent / paginated-out / off-branch / unknown / group-header), and fixed a real 66-03 deep-link bug where the sidebar click-journey never pulsed because `?m=` was consumed only on cold mount.**

## Performance
- **Duration:** ~35 min
- **Tasks:** 2
- **Files:** 3 (1 new e2e spec + 1 extended e2e spec + 1 SUT bug-fix)
- **Tests:** 42 e2e passing (21 cases × 2 projects); 84 adjacent ChatThread/deep-link vitest green

## Accomplishments
- **UI-01/02 (toggle + persistence)** — 3-segment Hybrid/Keyword/Semantic toggle renders, defaults Hybrid, and the selection survives a full page reload via the global `chatSearch.mode` LS key (proven by switching to Keyword, reloading, re-opening).
- **UI-04 (two-section + guards)** — Conversations (title) + grouped Messages both render; `<mark>` highlight present; a Beta-titled conversation surfaces as a Messages group even though its title doesn't match the query (Messages owns content matches); a 1-char query fires NO `/api/search/messages` call and NO message rows; a degraded response renders the inline notice without mutating the stored mode (survives reload); empty hits + non-matching title shows exactly one generic "No matching messages." state.
- **UI-03 (deep-link journey)** — Clicking a real sidebar `message-hit` row navigates to `?m=<id>`, scrolls the target into view, and pulses it (`.message-pulse` applied then removed) for: a recent target, a paginated-out target (>15 msgs → window grows to reveal it), and an off-branch target (branch switches so the target joins the rendered path). `?m=` is stripped on mount and does NOT re-pulse on reload. An unknown id is a silent no-op (no throw, param stripped, no pulse). The Messages-group header is NOT a deep-link.
- **Viewport parity** — A small `isMobile()/sidebar()/openSearch()` helper set opens the mobile SwipeDrawer and scopes every locator to the visible ConversationList, so all 21 cases pass identically on chromium and mobile-chromium.

## Task Commits
1. **Task 1: Extend conversation-search.spec.ts — toggle + two sections (UI-01/02/04)** — `f09acb43` (test)
2. **Task 2: Create sidebar-search-deeplink.spec.ts (UI-03) + fix click-journey deep-link** — `87cf99e1` (test, includes the Rule-1 ChatThread.svelte fix)

## Files Created/Modified
- `web/e2e/sidebar-search-deeplink.spec.ts` — NEW (356 lines). 6 cases × 2 projects: recent / strip-on-reload / paginated-out / off-branch / unknown / group-header-not-deep-link. Drives real sidebar-row clicks into a separate target conversation through the 66-01 mock; asserts pulse via class apply→remove.
- `web/e2e/conversation-search.spec.ts` — extended (44 → 397 lines). Added viewport-aware helpers + 6 new cases (toggle/default, reload-persist, two-section, `<2` guard, degraded-no-mutate, generic empty) and rewired the baseline cases through the same helpers so they pass on mobile.
- `web/src/lib/components/ChatThread.svelte` — Rule-1 fix: `?m=` consume moved from `onMount`-only to a reactive `$effect` (fires on cold load AND client nav); `found:false` no longer terminal until `initialLoadDone`.

## Decisions Made
See frontmatter `key-decisions`. Highlights: viewport-aware helpers repair the pre-existing desktop-only baseline rather than regressing it; the click-journey drives a separate target conv so the full path is exercised; off-branch assertions scoped to the chat container to dodge the snippet-text collision; the deep-link reactive-consume + loading-aware found-gate fix completes UI-03's stated click behavior.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Sidebar click-journey deep-link never pulsed or stripped `?m=`**
- **Found during:** Task 2 (the recent-target case's pulse-apply assertion failed; a probe showed `?m=` was appended on click but the pulse never fired and the param was never stripped)
- **Issue:** 66-03 consumed `?m=` only inside `onMount`. The chat route is a SINGLE persistent `<ChatThread>` that does NOT remount on a same-route conversation switch (`conversationId`/`searchParams` are reactive getters). So a sidebar-result click — `goto(/project/.../chat/<target>?m=<id>)` — never re-ran the mount-time consume: no `pendingDeepLink`, no scroll, no pulse, and `?m=` stayed in the URL. The click-journey is the PRIMARY entry point (66-02 emits the messageId precisely for it), so UI-03's must-have truth ("clicking a message result deep-links and pulses") was unmet.
- **Secondary bug:** Even after arming on nav, the gated apply effect resolved `found:false` against the PREVIOUS conv's `allMessages` (the guards briefly pass while the old tree is still rendered), set `deepLinkApplied=true`, and permanently no-op'd before the target tree loaded.
- **Fix:** (a) Moved `?m=` consume out of `onMount` into a reactive `$effect` keyed on the URL param (guarded by `lastConsumedDeepLink` against the strip-nav loop) so it fires on cold load AND client nav; `onMount` still owns `?initial`. (b) In the apply effect, `found:false` is non-terminal until `initialLoadDone` settles, so the deep-link retries when the new conv's tree arrives. A genuinely unknown id still no-ops once.
- **Files modified:** web/src/lib/components/ChatThread.svelte
- **Verification:** probe confirmed click→pulse + strip; full spec 42/42 green on both projects; 23/23 ChatThread.component + 84 adjacent ChatThread/deep-link vitest tests still green; svelte-check clean on the file.
- **Committed in:** `87cf99e1`

**2. [Rule 1 - Bug] Baseline conversation-search cases were desktop-only (9 pre-existing mobile-chromium failures)**
- **Found during:** Task 1 (first run showed ALL mobile-chromium cases failing — the search button is inside the closed mobile SwipeDrawer)
- **Issue:** The committed baseline tests clicked `[title="Search conversations"]` directly, which on mobile is hidden until the "Open conversations" hamburger opens the drawer. Verified pre-existing by running the HEAD version on mobile-chromium (9 failed). The plan requires my deliverable green on BOTH projects.
- **Fix:** Added `isMobile()/sidebar()/openSearch()` viewport-aware helpers (open the mobile drawer; scope to the visible ConversationList to dodge the desktop/mobile strict-mode collision) and routed both the baseline and new cases through them — improving the baseline rather than regressing it.
- **Files modified:** web/e2e/conversation-search.spec.ts
- **Verification:** 30/30 (15 × 2) green.
- **Committed in:** `f09acb43`

---

**Total deviations:** 2 auto-fixed (1 real SUT deep-link bug completing UI-03's click journey; 1 baseline viewport repair). No architectural changes.

## Issues Encountered
- `scripts/coverage-thresholds.json` remains parallel-session-dirty and unpinned for the search surface (carried forward from 66-01/02/03). Not staged or modified here — e2e specs aren't subject to the per-file unit-coverage gate, and the SUT (ChatThread/ConversationList/search helpers) pinning is the standing owner task noted in prior summaries.
- `svelte-check` reports 19 errors across UNRELATED parallel-session-dirty files (ToolCardRouter, EzPanel, EntityFormModal, MemoryItem, extension-author-page test, etc.); zero are in my 3 files. Out of scope.

## User Setup Required
None.

## Next Phase Readiness
- Phase 66 user surface is now fully e2e-covered on both viewports; 67 (Cmd+K palette) can reuse the `/api/search/messages` mock + `makeSearchHit` and the viewport-aware sidebar helpers.
- The deep-link reactive-consume fix means any future surface that navigates with `?m=` (e.g. the palette) inherits the working click-journey deep-link.

---
*Phase: 66-sidebar-search*
*Completed: 2026-05-29*

## Self-Check: PASSED

- All 3 deliverable files + SUMMARY.md exist on disk.
- Both task commits (f09acb43, 87cf99e1) present in git log.
- e2e: 42/42 green (21 cases × chromium + mobile-chromium) on the phase-gate command `sidebar-search-deeplink.spec.ts conversation-search.spec.ts`.
- vitest regression: 23/23 ChatThread.component + 84 adjacent ChatThread/deep-link tests green; svelte-check clean on all 3 owned files.
- Sacred-12-stash invariant held throughout (12 → 12); zero `git stash` operations; explicit-path `git add` only.
