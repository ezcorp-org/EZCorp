---
phase: 67-command-palette-search
plan: 01
subsystem: testing
tags: [command-palette, search, tdd, vitest, bun-test, svelte, frontend]

# Dependency graph
requires:
  - phase: 66-sidebar-search
    provides: groupHitsByConversation + sanitizeSnippet + matchTypeGlyph parity (search-mode.ts / snippet-sanitize.ts / ConversationList.svelte)
  - phase: 65-hybrid-search-sql-api
    provides: MessageSearchHit + searchMessages contract ($lib/api.js)
provides:
  - RED unit suite pinning the buildPaletteResults cross-project grouping contract (Plan 05 import target)
  - RED component suite pinning the extended CommandPalette message-search behavior (Plan 06 contract)
  - GREEN regression-guard suite pinning palette vs palette-commands initial-view routing (Plan 04 contract, already shipped)
affects: [67-03 hit-shape extension, 67-04 routing, 67-05 palette-results helper, 67-06 component extension]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Test-first RED scaffold landed before SUT: import-contract failure is the intended RED signal (Plan 05 helper)"
    - "vi.hoisted() for vi.mock factories that close over spies (avoids 'Cannot access before initialization')"
    - "Source-read bun:test as routing regression guard (readFileSync + import.meta.url + regex toMatch), mirroring app-layout-agents-nav.test.ts"
    - "Partial-RED component contract: extension behaviors fail RED while guard assertions (ARIA/focus/ez-prefix) stay GREEN through the implementing plan"

key-files:
  created:
    - web/src/lib/search/__tests__/palette-results.test.ts
    - web/src/__tests__/CommandPalette.component.test.ts
    - web/src/__tests__/app-layout-palette-shortcut.test.ts
  modified: []

key-decisions:
  - "Hit fixtures cast `as MessageSearchHit` so the RED suites compile against today's api.ts while pinning the Plan-03 extended (projectId/projectName) shape"
  - "Used vi.hoisted() for the goto + searchMessages spies because vi.mock factories are hoisted above imports (the ask-ez precedent sidesteps this by mocking inside command-registry, not applicable here)"
  - "Kept Task 3 as an honest GREEN regression guard rather than forcing artificial RED — Plan 04 routing already shipped (commit 098545c1); a fake-RED assertion on an unchosen var name would be fragile and dishonest"

patterns-established:
  - "RED-scaffold-first: write the failing suite against the Plan-N import/render contract so the implementer has a concrete sampling target for the 100% per-file bar"
  - "vi.hoisted spy pattern for Svelte component tests that need to assert on goto/api spies inside vi.mock factories"

requirements-completed: []

# Metrics
duration: 5min
completed: 2026-05-30
---

# Phase 67 Plan 01: Command-Palette Search RED Test Scaffolds Summary

**Three frontend test files landed test-first — a true-RED unit contract for the `buildPaletteResults` cross-project grouping helper, a partial-RED component contract for the extended message-search palette, and a GREEN regression guard for the palette/palette-commands initial-view routing.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-05-30T20:42:14Z
- **Completed:** 2026-05-30T20:46:15Z
- **Tasks:** 3
- **Files modified:** 3 (all new test files; zero production source touched by this plan's commits)

## Accomplishments
- `palette-results.test.ts` (283 lines): true-RED unit suite importing `buildPaletteResults` from the not-yet-existent `../palette-results` (Plan 05 target). Pins section order `[commands, in-this-conversation, other]` with an active conversation, the `null`-active-conversation single `messages` section branch, project→conversation grouping with names/titles, `flatItems` = actionable rows only (commands+hits, never headers) in render order, flat-index ArrowDown mapping, empty-section omission policy, and first-seen-order grouping parity with `groupHitsByConversation`.
- `CommandPalette.component.test.ts` (329 lines): partial-RED component suite driving the palette via mocked `searchMessages` + `goto` with the extended hit shape across ≥2 projects + the active conversation. 7 message-search assertions fail RED until Plan 06 (sections-with-commands, snippet sanitize, role badge + glyph `≈`/`⊕`/`“`, arrow-skip-headers, row-type Enter deep-link `/project/<p>/chat/<c>?m=<id>`, empty `No matching messages.`, degraded notice + no-mode-mutation); 5 guard assertions already GREEN (dialog ARIA, focus-restore, ez-prefix-no-search, <2-char-no-search, command-Enter-no-deeplink).
- `app-layout-palette-shortcut.test.ts` (52 lines): source-read suite mirroring `app-layout-agents-nav.test.ts`, pinning both `case "palette"` (search-first) and `case "palette-commands"` (command-first) switch arms plus the `initialView={…}` prop pass-through.

## Task Commits

Each task was committed atomically:

1. **Task 1: RED unit suite for the cross-project grouping helper** - `61cb2ca3` (test)
2. **Task 2: RED component suite for the extended CommandPalette** - `6a47df3c` (test)
3. **Task 3: source-read suite for palette vs palette-commands routing** - `059f1d63` (test)

**Plan metadata:** (final docs commit — this SUMMARY + STATE + ROADMAP)

## Files Created/Modified
- `web/src/lib/search/__tests__/palette-results.test.ts` - RED unit contract for `buildPaletteResults` (sections, project→conversation grouping, flatItems ordering, flat-index mapping, empty-section policy)
- `web/src/__tests__/CommandPalette.component.test.ts` - RED component contract for the message-search palette extension (sections/glyph/role/sanitize/arrow-skip/row-type-Enter/ARIA/focus/empty/degraded) + ez-prefix guard
- `web/src/__tests__/app-layout-palette-shortcut.test.ts` - routing regression guard for the palette/palette-commands initial-view contract

## Decisions Made
- **Plan-03 extended hit shape via cast:** hit fixtures construct `projectId`/`projectName` and cast `as MessageSearchHit` so both RED suites compile against today's `api.ts` (those fields land in Plan 03); the cast becomes a no-op once the type widens.
- **`vi.hoisted()` for spies:** the `goto` + `searchMessages` spies are created via `vi.hoisted()` because `vi.mock` factories are hoisted above imports; referencing a plain `const` spy from a factory throws `Cannot access 'gotoMock' before initialization` (caught and fixed during Task 2 — see deviations).
- **Honest GREEN over fake RED for Task 3:** Plan 04's routing already shipped, so the source-read test passes; kept it as an accurate regression guard rather than asserting on an unchosen variable name to force an artificial RED.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] vi.mock factory referenced a non-hoisted spy (Task 2)**
- **Found during:** Task 2 (RED component suite)
- **Issue:** The initial `CommandPalette.component.test.ts` defined `const gotoMock = vi.fn()` / `const searchMessagesMock = vi.fn()` at top level and referenced them inside `vi.mock(...)` factories. Vitest hoists `vi.mock` calls above imports, so the suite crashed at load with `ReferenceError: Cannot access 'gotoMock' before initialization` (0 tests collected) — a false-RED for the wrong reason (a test-authoring bug, not the intended "component not extended" RED).
- **Fix:** Moved both spies into a `vi.hoisted(() => ({ gotoMock, searchMessagesMock }))` block so they are initialized before the hoisted mock factories run.
- **Files modified:** web/src/__tests__/CommandPalette.component.test.ts
- **Verification:** Suite now collects 12 tests; 7 fail RED for the correct reason (message-search behaviors unimplemented), 5 guard assertions pass.
- **Committed in:** 6a47df3c (Task 2 commit)

**2. [Rule 3 - Stale-premise / blocking] Task 3 routing already shipped — landed GREEN, not RED**
- **Found during:** Task 3 (source-read routing suite)
- **Issue:** The plan's `<done>` states the suite should be "RED until Plan 04 lands." But `git log` shows `098545c1 feat(67-04): layout palette/palette-commands switch arms + initialView pass-through` already committed — Plan 04 (and the `initialView` prop on `CommandPalette.svelte`, part of Plan 06) shipped in a prior session. The source-read test therefore passes (3/3).
- **Fix:** Kept the test as an honest regression guard pinning the already-satisfied contract (both switch arms + `initialView={…}` pass-through) rather than fabricating an artificial RED against an unchosen variable name. Documented the GREEN state in the commit body.
- **Files modified:** web/src/__tests__/app-layout-palette-shortcut.test.ts
- **Verification:** `bun test ./src/__tests__/app-layout-palette-shortcut.test.ts` → 3 pass / 0 fail; matched arms confirmed at `(app)/+layout.svelte` L96-103 + L471.
- **Committed in:** 059f1d63 (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (1 test-authoring bug, 1 stale-premise routing-already-shipped).
**Impact on plan:** No scope creep. Deviation 1 was required for Task 2 to be RED for the right reason; Deviation 2 is a state-of-the-world reconciliation (parallel-session work outran the plan's assumptions) and the test still fulfills its contract-pinning purpose as a regression guard.

## Issues Encountered
- **Bun test filter needs a path prefix:** `bun test src/lib/search/__tests__/palette-results.test.ts` reported "did not match any test files"; running it as a path (`bun test ./src/lib/search/__tests__/palette-results.test.ts`) resolved it. Test-runner invocation only — no test changes needed.
- **Pre-existing dirty working tree:** parallel-session uncommitted changes (`src/__tests__/message-search*.test.ts`, `src/db/queries/message-search.ts`, `manifest.lock.json`, `.planning/STATE.md`) were present and left untouched. Used explicit-path `git add` on each test file so zero parallel-session files were swept into my commits. Sacred-12-stash invariant held (12 → 12 throughout).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- **Plan 05** has a concrete RED sampling target (`palette-results.test.ts`) and the locked `buildPaletteResults` import contract to code against.
- **Plan 06** has the partial-RED component contract (`CommandPalette.component.test.ts`); its 7 RED assertions define done. Note Plan 06 partially shipped already (the `initialView` prop exists on `CommandPalette.svelte`) — the implementer should diff current component state against the suite before starting.
- **Plan 03** must add `projectId`/`projectName` to `MessageSearchHit`; until then the fixture casts in both RED suites bridge the gap.
- **Plan 04** routing is already landed (commit 098545c1) and now regression-guarded.

---
*Phase: 67-command-palette-search*
*Completed: 2026-05-30*

## Self-Check: PASSED

- FOUND: web/src/lib/search/__tests__/palette-results.test.ts
- FOUND: web/src/__tests__/CommandPalette.component.test.ts
- FOUND: web/src/__tests__/app-layout-palette-shortcut.test.ts
- FOUND commit: 61cb2ca3 (Task 1)
- FOUND commit: 6a47df3c (Task 2)
- FOUND commit: 059f1d63 (Task 3)
- Production source touched by this plan's commits: NONE (each commit = 1 test file)
