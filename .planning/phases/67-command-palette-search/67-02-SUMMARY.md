---
phase: 67-command-palette-search
plan: 02
subsystem: testing
tags: [playwright, e2e, command-palette, hybrid-search, deep-link, bottom-sheet, svelte]

# Dependency graph
requires:
  - phase: 66-sidebar-search
    provides: "/api/search/messages mock + makeSearchHit factory + ?m= deep-link (consume/strip + scroll + .message-pulse) journey, mirrored from sidebar-search-deeplink.spec.ts"
  - phase: 65-hybrid-search-sql-api
    provides: "MessageSearchHit contract consumed by the palette; this spec extends it (locally) with projectId/projectName for cross-project hits"
provides:
  - "RED Playwright e2e spec web/e2e/command-palette-search.spec.ts — the executable acceptance contract for the full Cmd+K / Cmd+Shift+P palette + cross-project deep-link + mobile BottomSheet journey"
  - "9 cases (5 desktop + 4 mobile BottomSheet) discoverable on both chromium and mobile-chromium"
  - "local makeCrossProjectHit helper extending makeSearchHit with projectId/projectName (the cross-project shape Plan 04 will add to MessageSearchHit)"
affects: [67-04, 67-06, 67-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "RED e2e scaffold: spec targets the FUTURE UI contract (search-focused Cmd+K, command-first Cmd+Shift+P, cross-project sections, BottomSheet at <lg) and is expected RED until the UI lands"
    - "Local cross-project hit factory (makeCrossProjectHit) spreads the shared makeSearchHit + structural cast — keeps the RED spec self-contained without touching the production MessageSearchHit type"
    - "Viewport-guarded mobile describe block via test.skip(({viewport}) => width >= lg) — single run including chromium does not fail mobile-only cases"

key-files:
  created:
    - "web/e2e/command-palette-search.spec.ts — RED e2e: desktop palette + cross-project deep-link + mobile BottomSheet (405 lines, 9 cases)"
  modified: []

key-decisions:
  - "Local makeCrossProjectHit (spread makeSearchHit + projectId/projectName via structural cast) instead of editing the shared fixture or production MessageSearchHit type — verification requires no production source modified; Plan 04 widens the real type later"
  - "Palette located via getByRole('dialog', {name: 'Command palette'}) so one locator follows the palette across the desktop centered-modal AND the <lg BottomSheet render paths"
  - "ControlOrMeta+k / ControlOrMeta+Shift+KeyP for cross-OS shortcut presses (Linux/Windows Ctrl, mac Cmd)"
  - "Mobile cases guarded by test.skip on >=lg viewport width (mirrors conversation-search.spec.ts viewport-aware pattern) rather than a separate file"

patterns-established:
  - "RED e2e scaffold pattern: write the full executable acceptance contract before the UI; a later plan turns it GREEN and closes the coverage gate"
  - "Cross-project hit fixture: makeCrossProjectHit spreads makeSearchHit and adds projectId/projectName via cast until the shared type is widened"

requirements-completed: [PAL-01, PAL-05, PAL-07, PAL-06, PAL-02]

# Metrics
duration: 2min
completed: 2026-05-30
---

# Phase 67 Plan 02: RED Command-Palette e2e Spec Summary

**RED Playwright e2e spec (9 cases) defining the full Cmd+K / Cmd+Shift+P palette, cross-project `?m=` deep-link, and mobile BottomSheet journey — discoverable on chromium + mobile-chromium, reusing the Phase 66 `/api/search/messages` mock with a locally-extended cross-project hit factory.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-05-30T20:42:23Z
- **Completed:** 2026-05-30T20:44:53Z
- **Tasks:** 2
- **Files modified:** 1 (created)

## Accomplishments
- Created `web/e2e/command-palette-search.spec.ts` (405 lines) — the executable acceptance contract for the palette UX, the required e2e layer of the 100% coverage bar.
- **Desktop block (5 cases):** Cmd+K opens the palette search-focused with the command list below (PAL-01); Cmd+Shift+P opens the SAME palette command-first with the search field not focused and no private-window leak (PAL-02); typing ≥2 chars renders Commands AND message-hit sections together with conversation-aware headers ("In this conversation" / "Other conversations"); clicking a cross-project result deep-links into the other project with `?m=`, scrolls + pulses the target, and strips `?m=` (refresh does not re-pulse) (PAL-05/06).
- **Mobile block (4 cases, mobile-chromium):** palette renders inside `data-testid="bottom-sheet"` not the centered modal; same non-flattened section structure inside the sheet; search input auto-focused on open; a single Escape closes the sheet (PAL-07).
- Reuses the Phase 66 `/api/search/messages` mock (`searchMessages` fixture option) + a local `makeCrossProjectHit` that extends `makeSearchHit` with `projectId`/`projectName`; no production source touched.

## Task Commits

Each task was committed atomically:

1. **Task 1: RED e2e desktop palette + cross-project deep-link** — `6e62cb90` (test)
2. **Task 2: RED e2e mobile BottomSheet fallback cases** — `5e45fee3` (test)

**Plan metadata:** see final docs commit below.

## Files Created/Modified
- `web/e2e/command-palette-search.spec.ts` (created) — RED e2e for Cmd+K / Cmd+Shift+P palette, cross-project deep-link, and mobile BottomSheet; reuses 66-01 mock + extended hit factory.

## Decisions Made
- **Local `makeCrossProjectHit` instead of editing the shared fixture / production type** — the plan's verification requires no production source modified; the shared `MessageSearchHit` lacks `projectId`/`projectName` until Plan 04 widens it. The helper spreads `makeSearchHit` and adds the two fields via a structural cast, keeping the RED spec self-contained and type-clean today.
- **Single palette locator across both render paths** — `getByRole('dialog', {name: 'Command palette'})` follows the palette whether it is the desktop centered modal or the `<lg` BottomSheet (which carries the same dialog aria-label), so the desktop helpers work on both viewports.
- **Cross-OS shortcut presses** — `ControlOrMeta+k` and `ControlOrMeta+Shift+KeyP` so the same press works on Linux/Windows (Ctrl) and mac (Cmd).
- **Viewport-guarded mobile block** — `test.skip(({viewport}) => width >= lg)` keeps the mobile-only cases from failing on a desktop-width run while still listing them; mirrors the `conversation-search.spec.ts` viewport-aware precedent.

## Deviations from Plan

None - plan executed exactly as written.

The spec is intentionally RED (it targets UI that Plans 04/06/07 build). `--list` discovery is the plan's verification gate and passes on both projects; the cases were not run-to-green because that is Plan 07's job.

## Issues Encountered
None. Both `--list` verifications passed first try; the spec typechecks clean under `web/tsconfig.json` (verified manually since `typecheck.sh` excludes test files).

## Sacred-12-stash invariant
Held at 12 → 12 → 12 throughout; explicit-path `git add web/e2e/command-palette-search.spec.ts` only — zero touches to parallel-session dirty files (`.planning/STATE.md`, `manifest.lock.json`).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 07 has a concrete RED target: turn these 9 cases GREEN once Plan 04 (unified palette + `scope=all` + `MessageSearchHit.projectId/projectName`) and Plan 06 (`<lg` BottomSheet wrap) land.
- The local `makeCrossProjectHit` cast becomes unnecessary once Plan 04 widens `MessageSearchHit` — Plan 07 can drop the cast or fold the fields into the shared `makeSearchHit`.
- Selectors the UI must provide: `getByRole('dialog', {name: 'Command palette'})`, `data-testid="palette-command"`, `data-testid="message-hit"`, section headers "In this conversation" / "Other conversations", project-name group headers, and the BottomSheet `data-testid="bottom-sheet"` wrap at `<lg`.

## Self-Check: PASSED

- FOUND: `web/e2e/command-palette-search.spec.ts`
- FOUND: `.planning/phases/67-command-palette-search/67-02-SUMMARY.md`
- FOUND commit `6e62cb90` (Task 1)
- FOUND commit `5e45fee3` (Task 2)

---
*Phase: 67-command-palette-search*
*Completed: 2026-05-30*
