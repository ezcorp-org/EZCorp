---
phase: 57-mobile-ux-deferred-items
plan: 07
subsystem: testing
tags: [vitest, svelte5, component-test, jsdom, regression, gap-closure]

# Dependency graph
requires:
  - phase: 57-mobile-ux-deferred-items
    provides: "Plan 57-02 (AssignmentPicker BottomSheet wrap), Plan 57-03 (8 remaining pickers BottomSheet wrap + matchMedia stub), Plan 57-05 (SelectedPill chipId prop), Plan 57-06 (/api/user/agent-picker GET+PUT route + AgentSearchPicker save/pin UI)"
provides:
  - GAP-57-A regression: 18-case source-text assertion locking BottomSheet + bp.below across all 9 pickers
  - GAP-57-B regression: 5-case component test exercising AgentSearchPicker ↔ /api/user/agent-picker fetch wiring (GET on mount + PUT on save/pin/unsave/unpin)
  - GAP-57-C regression: 2-case unit test for SelectedPill chipId → data-chip-id pass-through (present + absent branches)
affects: [phase-57-verification, phase-59-test-debt-repair]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Source-text invariant testing via node:fs read + toContain — preferred over render-mount for static-text contracts spanning many components (cheaper than 9 prop/mock setups; locks the public textual contract)"
    - "Fetch-stub component test with `fetchCalls` recording array — mirrors ModeFormModal.component.test.ts; per-test re-stub via vi.stubGlobal to vary GET-response shape across cases"
    - "hasAttribute() === false over getAttribute() === null for asserting attribute ABSENCE — distinguishes 'attribute omitted' from 'attribute renders as literal undefined string', clearer failure message"

key-files:
  created:
    - web/src/lib/components/__tests__/all-pickers-bottom-sheet-wrap.unit.test.ts
    - web/src/lib/components/__tests__/AgentSearchPicker-prefs-wiring.component.test.ts
    - web/src/lib/components/__tests__/SelectedPill-chip-id.component.test.ts
  modified: []

key-decisions:
  - "GAP-57-A landed as .unit.test.ts (not .test.ts) — vitest.config.ts include glob is `src/**/*.unit.test.ts` for pure-utility tests without DOM; bare `.test.ts` would not be picked up. Plan body explicitly anticipated and recorded this. File content unchanged from VERIFICATION.md intent."
  - "Source-text assertion (node:fs + toContain) over full mount-render for GAP-57-A — 9 pickers have distinct prop/fetch dependencies (~200 lines of mock setup with no extra regression bite). Two separate toContain calls (BottomSheet + bp.below) are robust to formatting/ordering vs a single regex with cross-line `.*`."
  - "Two assertions per picker (BottomSheet + bp.below) — splits the failure signal: losing the wrap removes BOTH (lose import + lose element); replacing bp.below with bp.above only fails the second. Single combined regex would muddy the diagnostic."
  - "fireEvent.mouseDown over fireEvent.click in GAP-57-B — AgentSearchPicker's save/pin/unsave/unpin buttons all use onmousedown (verified at AgentSearchPicker.svelte:222/240/261/324) so the affordance fires BEFORE the click-outside handler closes the dropdown. onclick would not fire the handler."
  - "vi.unstubAllGlobals() in afterEach prevents fetch stub leakage across test files in the same vitest run — important since vitest pools tests by default."
  - "GAP-57-C uses hasAttribute() over getAttribute() === null — production code emits `data-chip-id={chipId}`, which Svelte 5 omits when bound value is undefined. hasAttribute is the precise contract; a regression to emitting literal 'undefined' string would fail with a clearer message."

patterns-established:
  - "Pattern A: 'codify-the-grep' regression — when a verifier discovers a static-text invariant by grep, add a unit test that runs the same grep at CI time. Cheap, fast, and prevents silent regression of contracts that span many files."
  - "Pattern B: per-test fetch re-stub — call `vi.stubGlobal('fetch', makeFetchStub({...}))` inside the test BEFORE render so each case can vary the GET response shape; reset `fetchCalls = []` at the same point so the assertion sees only this case's calls."
  - "Pattern C: attribute-absence assertion via hasAttribute(false) — universal idiom for Svelte 5 optional-prop pass-through tests; clearer than getAttribute(null) comparisons."

requirements-completed: [UX-01, UX-03, UX-04]

# Metrics
duration: 2 min
completed: 2026-05-12
---

# Phase 57 Plan 07: Gap Closure (Test-Only) Summary

**Three regression tests landed (25 cases total GREEN) closing GAP-57-A/B/C from 57-VERIFICATION.md — codifying the BottomSheet wrap source-grep, the AgentSearchPicker prefs fetch contract, and the SelectedPill chipId pass-through; zero production code modified.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-05-12T13:57:50Z
- **Completed:** 2026-05-12T14:00:21Z
- **Tasks:** 3 (all `type="auto"`)
- **Files created:** 3 (all under `web/src/lib/components/__tests__/`)
- **Files modified:** 0 (zero production code changes)

## Accomplishments
- GAP-57-A closed: 18-case source-text assertion (2 × 9 pickers) — every picker must contain both `BottomSheet` and `bp.below`. A future refactor stripping the wrap from any one picker fails this test at CI time.
- GAP-57-B closed: 5-case component test mounting AgentSearchPicker with a stubbed fetch — locks GET on mount + PUT on saveCurrentSearch / pinAgent / unsaveSearch / unpinAgent with the exact payload shape the server route expects.
- GAP-57-C closed: 2-case unit test for SelectedPill chipId prop — present branch asserts `data-chip-id="ext-a"`, absent branch asserts `hasAttribute === false`. Locks the e2e selector contract the chip-reorder spec depends on.
- All 25 new cases GREEN on first run (no production code changes needed — Plans 57-02/03/05/06 already shipped contract-satisfying source).
- Pre-existing Phase 57 regression suite still GREEN (BottomSheet 8 + ExtensionSearchPicker-reorder 4 + agent-picker-prefs-route 9 = 21/21).

## Task Commits

Each task was committed atomically:

1. **Task 1: Ship GAP-57-A — 9-picker BottomSheet-wrap regression test** — `d62a12d` (test)
2. **Task 2: Ship GAP-57-B — AgentSearchPicker prefs-wiring component test** — `4e67f23` (test)
3. **Task 3: Ship GAP-57-C — SelectedPill chipId pass-through unit test** — `60cea33` (test)

**Plan metadata commit:** pending (docs: complete plan)

## Files Created/Modified

### Created
- `web/src/lib/components/__tests__/all-pickers-bottom-sheet-wrap.unit.test.ts` (59 lines) — GAP-57-A regression: source-text grep via `node:fs` asserting `BottomSheet` + `bp.below` in each of 9 picker .svelte files. 18 cases (2 × 9).
- `web/src/lib/components/__tests__/AgentSearchPicker-prefs-wiring.component.test.ts` (247 lines) — GAP-57-B regression: mounts AgentSearchPicker with a fetch-recording stub; 5 cases (GET on mount + 4 PUT mutations).
- `web/src/lib/components/__tests__/SelectedPill-chip-id.component.test.ts` (50 lines) — GAP-57-C regression: 2 cases (chipId="ext-a" present / chipId omitted absent) using @testing-library/svelte render + screen.getByTestId.

### Modified
None. Zero production code changes — gap-closure plan is test-only by contract.

## Decisions Made

See `key-decisions` in frontmatter. Highlights:
- **Filename for GAP-57-A is `.unit.test.ts` (not `.test.ts`)** to match vitest.config.ts include glob (`src/**/*.unit.test.ts`). Pre-anticipated in the plan body and corrected in commit `b713304` (frontmatter) before Plan 07 ran.
- **Source-text assertion via node:fs** beats full mount-render for the 9-picker BottomSheet contract — distinct prop/fetch setups across 9 components would add ~200 lines of mocks with no extra regression bite over the textual contract that Plans 57-02/03 explicitly shipped (`import BottomSheet` + `{#if open && bp.below}<BottomSheet ...>`).
- **`fireEvent.mouseDown` for save/pin/unsave/unpin clicks** — production buttons use `onmousedown` so the affordance fires before the click-outside dropdown-close handler; `fireEvent.click` would silently no-op.
- **`hasAttribute('data-chip-id') === false`** asserts ABSENCE more precisely than `getAttribute('data-chip-id') === null` — a regression rendering the literal string "undefined" would fail with a clearer error message.

## Deviations from Plan

None — plan executed exactly as written.

The plan body already anticipated and resolved the only filename ambiguity (`.test.ts` vs `.unit.test.ts`) in-place: the planner ran a vitest include-glob check, landed on `.unit.test.ts` as the correct suffix, and recorded the decision in the plan itself (lines 271-282 of 57-07-PLAN.md). The frontmatter `files_modified` was updated pre-execution in commit `b713304`. Plan 07 execution therefore wrote files at the resolved paths with zero further adjustment.

**Total deviations:** 0 auto-fixed.
**Impact on plan:** None. All 3 tasks landed verbatim with their planned file contents; all 25 cases GREEN on first run.

## RED→GREEN Discipline

Per the plan's verbatim contract, these are RED-on-write → GREEN-on-save tests:
- Each new file is RED until written (file doesn't exist; vitest collects 0 cases for it).
- Each becomes GREEN immediately on save because Plans 57-02/03/05/06 already shipped production code satisfying every asserted contract.
- **Zero production code changes required**, confirming the verifier's claim that all four UX-must-haves were already verified — only the regression assertions were missing.

## Issues Encountered

None. All three test files compiled clean, mounted clean, and asserted clean on the first vitest run.

## User Setup Required

None — no external service configuration required. Test-only plan.

## Next Phase Readiness

### Phase 57 status flip
- 57-VERIFICATION.md `gaps[*].status` for GAP-57-A / GAP-57-B / GAP-57-C can flip from `open` → `closed`.
- Phase 57 overall status can flip from `gaps_found` → `verified`.
- Re-running the verifier should now show all four UX must-haves (UX-01..04) with binding component-layer regression assertions.

### Phase 57 e2e debt deferred to Phase 59
The fixme'd e2e specs (bottom-sheet-pickers.spec.ts, agent-picker-prefs.spec.ts, chip-reorder.spec.ts) remain fixme'd until Phase 59 TEST-03 lands the auth-fixture infrastructure for the SvelteKit `(app)` protected route group. Plan 57-07's component-layer assertions are the binding contract until then.

### Milestone v1.4 progress
Phase 57 (Mobile UX) is now functionally complete (7/7 plans). v1.4 milestone closeout: Phases 54 (✓), 55 (✓), 56 (in progress — 56-01 complete), 57 (✓ this plan), 58/59/60 still ahead per DAG.

---
*Phase: 57-mobile-ux-deferred-items*
*Completed: 2026-05-12*

## Self-Check: PASSED

- FOUND: web/src/lib/components/__tests__/all-pickers-bottom-sheet-wrap.unit.test.ts
- FOUND: web/src/lib/components/__tests__/AgentSearchPicker-prefs-wiring.component.test.ts
- FOUND: web/src/lib/components/__tests__/SelectedPill-chip-id.component.test.ts
- FOUND commit: d62a12d (Task 1 — GAP-57-A)
- FOUND commit: 4e67f23 (Task 2 — GAP-57-B)
- FOUND commit: 60cea33 (Task 3 — GAP-57-C)
- All 25 new vitest cases GREEN (18 + 5 + 2)
- Pre-existing Phase 57 regression suite GREEN (21/21)
- Zero production code modifications (working-tree diff scoped to test files + .planning/)
