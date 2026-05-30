---
phase: 66-sidebar-search
plan: 01
subsystem: ui
tags: [search, deep-link, dompurify, localStorage, playwright, svelte, hybrid-search]

# Dependency graph
requires:
  - phase: 65-hybrid-search
    provides: "SearchMode / MatchType / MessageSearchHit / SearchMessagesResponse contract + searchMessages() client (web/src/lib/api.ts)"
provides:
  - "resolveDeepLink() — pure window/branch deep-link decision helper (web/src/lib/search/deep-link-resolve.ts)"
  - "sanitizeSnippet() — DOMPurify <mark>-only allowlist for {@html} snippet render (web/src/lib/search/snippet-sanitize.ts)"
  - "search-mode helpers — global-LS load/persist/validate + groupHitsByConversation (web/src/lib/search/search-mode.ts)"
  - "GET /api/search/messages e2e mock (configurable SearchMessagesResponse) + makeSearchHit factory in the Playwright fixtures"
affects: [66-02-sidebar, 66-03-deep-link, 66-04-e2e, 67-command-palette]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure decision helper returning a 'what must change' descriptor (no DOM/state writes) for risky window/branch math"
    - "DOMPurify <mark>-only allowlist reused (never hand-roll a regex stripper) for {@html} snippets"
    - "Global (no-projectId) localStorage preference with validate-on-load + silent try/catch"
    - "Configurable per-test fixture option threaded into the shared page.route dispatcher"

key-files:
  created:
    - web/src/lib/search/deep-link-resolve.ts
    - web/src/lib/search/snippet-sanitize.ts
    - web/src/lib/search/search-mode.ts
    - web/src/__tests__/deep-link-resolve.unit.test.ts
    - web/src/__tests__/snippet-sanitize.test.ts
    - web/src/__tests__/search-mode.test.ts
  modified:
    - web/e2e/fixtures/api-mocks.ts
    - web/e2e/fixtures/data.ts

key-decisions:
  - "Deep-link test runs under vitest (.unit.test.ts), not bun test — resolveDeepLink transitively imports the Svelte-rune inline-tool-store via load-messages.ts, which bun cannot compile"
  - "Window-grow policy: grow DIRECTLY to distanceFromTail (the minimal window that includes the target) for deterministic assertions, rather than stepping via nextWindowSize"
  - "distanceFromTail = path.length - idx (pathToRoot is root->leaf order; the tail/most-recent message has distanceFromTail === 1) — verified against the source, not assumed"
  - "groupHitsByConversation returns Array<{conversationId, title, hits}> (plan Task-2 action signature) — first hit defines the group title, first-seen order preserved"
  - "makeSearchHit defaults to a lexical <mark> hit so sidebar/snippet specs exercise the highlight path by default"

patterns-established:
  - "Pure 'resolution descriptor' helper for component decisions: resolveDeepLink returns {found, needsBranchSwitch, newLeafId, needsWindowGrow, newVisibleCount} so the component only applies, never computes"
  - ".unit.test.ts (vitest) vs .test.ts (bun) runner choice driven by transitive Svelte-rune imports, not just direct DOM usage"
  - "Per-test fixture config option (searchMessages) defaulting to an empty/echo response so existing specs compile unchanged"

requirements-completed: [UI-01, UI-02, UI-03, UI-04]

# Metrics
duration: 6min
completed: 2026-05-29
---

# Phase 66 Plan 01: Sidebar Search Wave-0 Infrastructure Summary

**Three pure, fully-unit-tested helper modules (deep-link window/branch resolver, `<mark>`-only DOMPurify sanitizer, global-LS search-mode + hit-grouping) plus a configurable `/api/search/messages` Playwright mock — de-risking the hardest 66-02/66-03 surfaces and unblocking all downstream search e2e.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-05-29T21:29:30Z
- **Completed:** 2026-05-29T21:34:59Z
- **Tasks:** 3
- **Files modified:** 8 (3 helpers + 3 unit tests + 2 fixtures)

## Accomplishments
- `resolveDeepLink()` — pure decision helper encapsulating the Pattern-3 window/branch math (off-branch fork switch + paginated-out window grow), reusing `pathToRoot`/`findLeafByMessageId` from `load-messages.ts` (no tree-walk reimplementation). 7 vitest cases, all green.
- `sanitizeSnippet()` — DOMPurify `<mark>`-only (attribute-free) allowlist reusing the in-tree `isomorphic-dompurify`; strips script/img/onerror, drops attrs on `<mark>`, passes plain semantic text through. 100% covered.
- `search-mode` helpers — global LS key `chatSearch.mode` (no projectId), `DEFAULT_SEARCH_MODE = "hybrid"`, validate-on-load + try/catch SSR/quota guards, plus the pure `groupHitsByConversation`. 100% covered.
- `GET /api/search/messages` mock + `makeSearchHit` factory — fixtures-only, per-test-configurable `SearchMessagesResponse`, defaults echo the `?mode` param. Unblocks 66-04 e2e.

## Task Commits

Each task was committed atomically (TDD: RED+GREEN folded per task where the module passed clean):

1. **Task 1: Pure deep-link resolution helper + unit tests** - `6c03feb5` (feat)
2. **Task 2: Snippet sanitizer + search-mode helpers + unit tests** - `77b98a5e` (feat)
   - Coverage-completion follow-up (search-mode try/catch branches → 100%): `915d48b4` (test)
3. **Task 3: /api/search/messages e2e mock + makeSearchHit factory** - `d5963f18` (chore)

_Note: deep-link RED+GREEN landed in one commit because the helper passed all 7 cases on first implementation; search-mode got a small follow-up test commit to reach 100% line coverage._

## Files Created/Modified
- `web/src/lib/search/deep-link-resolve.ts` - Pure `resolveDeepLink(targetId, allMessages, activeLeafId, visibleMessageCount): DeepLinkResolution`; no DOM/state writes
- `web/src/lib/search/snippet-sanitize.ts` - `sanitizeSnippet(html)`: DOMPurify `<mark>`-only allowlist
- `web/src/lib/search/search-mode.ts` - `SEARCH_MODE_LS_KEY`, `DEFAULT_SEARCH_MODE`, `loadSearchMode`, `persistSearchMode`, `groupHitsByConversation`, `MessageHitGroup`
- `web/src/__tests__/deep-link-resolve.unit.test.ts` - 7 vitest cases (absent, on-path-in-window, on-path-grow, off-branch fork switch + paginated-out, tail, null-leaf)
- `web/src/__tests__/snippet-sanitize.test.ts` - 5 bun:test cases (mark survives, script/img/onerror stripped, mark-attr dropped, plain text)
- `web/src/__tests__/search-mode.test.ts` - 11 bun:test cases (default/SSR, valid stored, garbage fallback, getItem throw, global key, round-trip, setItem throw, grouping order + empty)
- `web/e2e/fixtures/api-mocks.ts` - `searchMessages` MockOverrides option + `GET /api/search/messages` route arm
- `web/e2e/fixtures/data.ts` - `makeSearchHit(overrides)` factory + `MessageSearchHit` type import

## Decisions Made
- **Runner split:** deep-link test is `.unit.test.ts` (vitest) because `resolveDeepLink` imports tree-walk helpers from `load-messages.ts`, which transitively imports the Svelte-rune `inline-tool-store.svelte.ts` (`$state`) — bun cannot compile runes. The sanitizer + search-mode helpers are pure with no Svelte imports, so they stay on `bun test` as the plan specified.
- **Window-grow = direct to `distanceFromTail`** (the minimal covering window) for deterministic test assertions; documented in the source.
- **`distanceFromTail = path.length - idx`** confirmed against `pathToRoot` source (root→leaf order via `unshift`; tail is last element) — the plan explicitly warned not to assume the order.
- **`groupHitsByConversation` shape** `Array<{conversationId, title, hits}>` follows the plan's Task-2 action signature (richer than the RESEARCH `{title, hits}` sketch), capturing per-group `conversationId` for downstream row keys.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Deep-link unit test cannot run under `bun test`; switched to vitest `.unit.test.ts`**
- **Found during:** Task 1 (deep-link resolver TDD)
- **Issue:** The plan's `<automated>` block runs `bun test src/__tests__/deep-link-resolve.test.ts`, and declares the file as `deep-link-resolve.test.ts`. But `resolveDeepLink` imports `pathToRoot`/`findLeafByMessageId` from `load-messages.ts`, which imports `inlineToolStore` from `inline-tool-store.svelte.ts` — a Svelte-rune module using `$state`. Under `bun test` this throws `ReferenceError: $state is not defined` at import time. The plan required reusing those exports (do NOT reimplement tree-walk) and forbade touching the SUT `load-messages.ts`, so extracting the helpers was out of scope.
- **Fix:** Renamed the test to `web/src/__tests__/deep-link-resolve.unit.test.ts` and switched its imports from `bun:test` to `vitest`. The `.unit.test.ts` suffix is the project's documented runner glob for pure-utility tests under `src/lib` (vitest config includes `src/**/*.unit.test.ts`), and vitest's `vite-plugin-svelte` compiles the rune module. Verify command becomes `cd web && bunx vitest run src/__tests__/deep-link-resolve.unit.test.ts`.
- **Files modified:** web/src/__tests__/deep-link-resolve.unit.test.ts (created with this name instead of the planned `.test.ts`)
- **Verification:** 7/7 vitest cases pass; the source module has zero direct `svelte`/`$state` imports (purity criterion held).
- **Committed in:** `6c03feb5` (Task 1 commit)

**2. [Rule 2 - Missing Critical] Added try/catch-branch tests to bring search-mode to 100% coverage**
- **Found during:** Task 2 (coverage check against the per-file gate)
- **Issue:** Initial search-mode tests left lines 38-39 (the `loadSearchMode` catch) and the `persistSearchMode` catch uncovered; the project's per-file gate requires 100% on new pure modules.
- **Fix:** Added two tests stubbing a throwing `localStorage` (getItem throws → fallback to hybrid; setItem throws → silent no-op).
- **Files modified:** web/src/__tests__/search-mode.test.ts
- **Verification:** `bun test --coverage` → search-mode.ts and snippet-sanitize.ts both 100% Funcs/Lines.
- **Committed in:** `915d48b4` (Task 2 coverage follow-up)

---

**Total deviations:** 2 auto-fixed (1 blocking runner switch, 1 missing-coverage closure)
**Impact on plan:** No scope creep. The runner switch is the only contract change (test basename + verify command for Task 1); all three modules, their exports, and the fixture mock match the plan exactly. Phase 65 types imported from `$lib/api.js`, never redefined.

## Issues Encountered
- The deep-link coverage report (vitest v8) shows a low aggregate because it includes the transitively-imported `load-messages.ts`; the `deep-link-resolve.ts` module's own branches are all exercised by the 7 cases. No action needed — the gate concerns the new module's logic, which is fully covered.
- `coverage-thresholds.json` is dirty from a parallel session and does not yet pin the three new `web/src/lib/search/*.ts` modules. Per the scope-boundary / explicit-path-add discipline (working tree has parallel-session dirty files), this file was NOT staged or modified. The pinning of these modules in the coverage gate is left for whoever owns that file (likely 66-02/66-03 when the modules get wired into SUT).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- 66-02 (sidebar) can import `loadSearchMode`/`persistSearchMode`/`DEFAULT_SEARCH_MODE`/`groupHitsByConversation` + `sanitizeSnippet` directly.
- 66-03 (deep-link) can consume `resolveDeepLink` to drive branch-switch + window-grow + scroll without re-deriving the math.
- 66-04 (e2e) can seed `setupApiMocks(page, { searchMessages: { hits: [makeSearchHit(...)] } })` to drive the Messages section and `?m=` deep-link journeys.
- No blockers. Note for downstream: pin the three `web/src/lib/search/*.ts` modules in `scripts/coverage-thresholds.json` once they are imported by SUT (deferred here due to parallel-session ownership of that file).

---
*Phase: 66-sidebar-search*
*Completed: 2026-05-29*

## Self-Check: PASSED

- All 6 deliverable files + SUMMARY.md exist on disk.
- All 4 commits (6c03feb5, 77b98a5e, 915d48b4, d5963f18) present in git log.
- 21/21 tests green (7 vitest deep-link + 14 bun:test sanitizer/search-mode, +2 coverage follow-ups = 16 bun cases).
- Sacred-12-stash invariant held throughout (12 → 12).
