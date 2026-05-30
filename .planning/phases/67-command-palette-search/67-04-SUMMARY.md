---
phase: 67-command-palette-search
plan: 04
subsystem: ui
tags: [shortcuts, command-palette, svelte, keybindings, localStorage]

# Dependency graph
requires:
  - phase: 67-01
    provides: "RED source-read suite app-layout-palette-shortcut.test.ts pinning palette/palette-commands routing (NOT YET EXECUTED — see Deviations)"
provides:
  - "palette-commands shortcut action bound to Cmd+Shift+P in DEFAULT_SHORTCUTS"
  - "merge-by-action override safety proven for both palette and palette-commands"
  - "layout switch arms routing palette -> initialView=search, palette-commands -> initialView=commands"
  - "initialView prop passed to the CommandPalette mount (consumed in Plan 06)"
  - "optional initialView prop declared on CommandPalette (inert placeholder until Plan 06)"
affects: [67-06, 67-05, command-palette]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shortcut binding extension via DEFAULT_SHORTCUTS + merge-by-action localStorage overlay"
    - "Forward-declared optional prop (initialView) to keep layout type-clean ahead of its consumer plan"

key-files:
  created: []
  modified:
    - web/src/lib/shortcuts.ts
    - web/src/lib/__tests__/shortcuts.test.ts
    - web/src/routes/(app)/+layout.svelte
    - web/src/lib/components/CommandPalette.svelte

key-decisions:
  - "palette (Cmd+K) and palette-commands (Cmd+Shift+P) both TOGGLE commandPaletteOpen but set paletteInitialView first, so re-pressing either still closes an open palette while a fresh open lands in the right view"
  - "Declared an optional initialView prop on CommandPalette.svelte (out of this plan's files_modified) as a minimal forward-compatible placeholder so the layout passes it type-cleanly; Plan 06 wires actual consumption"
  - "Substituted a source-grep verification for Task 2 because Plan 01's app-layout-palette-shortcut.test.ts does not exist yet (Plan 01 not executed)"

patterns-established:
  - "Shift-modifier disambiguation: Cmd+Shift+P resolves to palette-commands and never collides with Cmd+P or Cmd+K (matchShortcut already enforces exact shift equality)"
  - "Dual-action override-survival test: prove BOTH palette and palette-commands custom overrides survive merge-by-action in one case"

requirements-completed: [PAL-02, PAL-01]

# Metrics
duration: 3min
completed: 2026-05-30
---

# Phase 67 Plan 04: Command-Palette Entry-Point Rebind Summary

**Cmd+Shift+P now opens the command palette command-first via a new `palette-commands` action while Cmd+K keeps opening it search-first; the layout routes each shortcut to the correct `initialView` (consumed in Plan 06), and merge-by-action keeps custom overrides for both actions intact.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-05-30T20:42:10Z
- **Completed:** 2026-05-30T20:45:07Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Added `{ key: "p", meta: true, shift: true, action: "palette-commands" }` to `DEFAULT_SHORTCUTS` (after `palette`), leaving `palette` (Cmd+K) untouched.
- Proved via tests that Cmd+Shift+P resolves uniquely to `palette-commands` (never Cmd+P / Cmd+K) and that custom overrides for BOTH `palette` and `palette-commands` survive `loadCustomShortcuts` merge-by-action.
- Wired the layout global-keydown switch: `case "palette"` sets `paletteInitialView="search"`, `case "palette-commands"` sets `paletteInitialView="commands"`; both toggle the palette after the existing `e.preventDefault()`.
- Passed `initialView={paletteInitialView}` to the `CommandPalette` mount and declared the matching optional prop on the component so svelte-check stays clean on both owned source files.

## Task Commits

Each task was committed atomically (TDD: RED extended into existing suite, then GREEN source change in one commit per task since the test file was pre-existing):

1. **Task 1: palette-commands binding + override safety** - `141904b1` (feat)
2. **Task 2: layout switch arms + initialView pass-through** - `098545c1` (feat)

**Plan metadata:** _(see final docs commit)_

## Files Created/Modified
- `web/src/lib/shortcuts.ts` - Added the `palette-commands` Cmd+Shift+P binding to `DEFAULT_SHORTCUTS`.
- `web/src/lib/__tests__/shortcuts.test.ts` - +3 tests: new default present, Cmd+Shift+P unique-match, dual-action override survival (39 pass).
- `web/src/routes/(app)/+layout.svelte` - `paletteInitialView` state, two switch arms, `initialView` prop on the palette mount.
- `web/src/lib/components/CommandPalette.svelte` - Optional `initialView?: "search" | "commands"` prop (inert placeholder; Plan 06 consumes it).

## Decisions Made
- **Toggle semantics preserved:** both `palette` and `palette-commands` retain the existing toggle (`commandPaletteOpen = !commandPaletteOpen`) rather than a hard open, so a second press of the same shortcut still closes the palette — the view is set before the toggle so a fresh open always lands correctly.
- **Forward-declared `initialView` prop on CommandPalette:** the plan flagged that passing an unknown prop is "harmless until Plan 06," but the plan's own verification requires `svelte-check` clean on the layout. Declaring an optional, currently-unused prop is the minimal forward-compatible fix and is exactly the prop Plan 06 will consume — no behavior added.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Plan 01's `app-layout-palette-shortcut.test.ts` does not exist — substituted source-grep verification for Task 2**
- **Found during:** Task 2 (layout switch arms)
- **Issue:** Task 2's `<verify>` runs `bun test src/__tests__/app-layout-palette-shortcut.test.ts`, a RED source-read suite owned/created by Plan 01. Plan 01 has not been executed (init shows all 7 plans incomplete, zero summaries; the file is absent on disk). The plan explicitly forbids recreating it.
- **Fix:** Verified the SUT wiring against the exact contract that Plan-01 suite pins (per its `<behavior>`): grepped `(app)/+layout.svelte` for `case "palette":` + `paletteInitialView = "search"`, `case "palette-commands":` + `paletteInitialView = "commands"`, `initialView={paletteInitialView}`, and `e.preventDefault()` preceding the switch — all present. When Plan 01 lands its RED test, this source will turn it GREEN.
- **Files modified:** none beyond the planned layout edit
- **Verification:** source-grep all 4 patterns present; svelte-check clean on the layout
- **Committed in:** `098545c1` (Task 2 commit)

**2. [Rule 3 - Blocking] Declared optional `initialView` prop on CommandPalette.svelte to satisfy svelte-check**
- **Found during:** Task 2 (layout `initialView` pass-through)
- **Issue:** Passing `initialView={paletteInitialView}` to `<CommandPalette>` produced a hard svelte-check error ("Object literal may only specify known properties, '"initialView"' does not exist in type '$$ComponentProps'"). The plan's verification requires svelte-check clean on the layout.
- **Fix:** Added an optional `initialView?: "search" | "commands"` (default `"search"`) to CommandPalette's `$props()` destructure with a comment noting Plan 06 consumes it. Inert / non-functional now.
- **Files modified:** `web/src/lib/components/CommandPalette.svelte` (one file beyond this plan's `files_modified`)
- **Verification:** svelte-check shows zero errors in both `(app)/+layout.svelte` and `CommandPalette.svelte`
- **Committed in:** `098545c1` (Task 2 commit)

**3. [Rule 3 - Blocking] Ran the shortcuts suite with `bun test` instead of `bunx vitest run`**
- **Found during:** Task 1 (RED/GREEN verification)
- **Issue:** Task 1's `<verify>` is `bunx vitest run src/lib/__tests__/shortcuts.test.ts`, but that file imports from `"bun:test"` and the web vitest config's `include` does not match it ("No test files found"). It is a bun:test suite.
- **Fix:** Ran `bun test ./src/lib/__tests__/shortcuts.test.ts` — the correct runner for a bun:test file. 39 pass / 0 fail.
- **Files modified:** none
- **Verification:** RED confirmed (3 fail) before the source change, GREEN (39 pass) after
- **Committed in:** `141904b1` (Task 1 commit)

---

**Total deviations:** 3 auto-fixed (all Rule 3 - blocking / cross-plan ordering)
**Impact on plan:** No scope creep. Deviations 1 and 3 are tooling/ordering accommodations because sibling Plan 01 has not run; deviation 2 is a one-line forward-compatible prop declaration the consumer plan (06) needs anyway. The SUT wiring matches the plan's `<behavior>` exactly.

## Issues Encountered
- **Cross-plan ordering:** Plan 04 was executed before Plan 01 in this run. Plan 04 supplies the SUT that turns Plan 01's RED routing test GREEN; Plan 01's component/routing RED tests (`CommandPalette.component.test.ts`, `palette-results.test.ts`) currently surface as expected svelte-check/import failures in unrelated files and are out of scope here. No action taken on them.

## Sacred-12 / Invariants
- Stash count held at 12 throughout (12 -> 12 -> 12); zero `git stash` operations.
- Explicit-path `git add` only — zero touches to parallel-session dirty files (`src/db/queries/message-search.ts`, `src/__tests__/message-search*.test.ts`, `.planning/STATE.md`, `manifest.lock.json`) or the untracked Plan-01 `CommandPalette.component.test.ts`.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 06 can now consume `initialView` on `CommandPalette` to land the palette in the correct view (search vs commands) — the prop is declared and wired from the layout.
- When Plan 01 executes, its `app-layout-palette-shortcut.test.ts` RED suite will turn GREEN against this source with no further changes.

## Self-Check: PASSED

- All 4 modified files present on disk + SUMMARY.md created.
- Both task commits present: `141904b1` (Task 1), `098545c1` (Task 2).

---
*Phase: 67-command-palette-search*
*Completed: 2026-05-30*
