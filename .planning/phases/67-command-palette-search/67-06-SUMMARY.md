---
phase: 67-command-palette-search
plan: 06
subsystem: ui
tags: [svelte5, command-palette, hybrid-search, cross-project, deep-link, bottomsheet, a11y, dompurify]

# Dependency graph
requires:
  - phase: 67-01
    provides: RED component contract (CommandPalette.component.test.ts) + registry routing guard
  - phase: 67-03
    provides: cross-project searchMessages(scope:"all") + projectId/projectName on every MessageSearchHit
  - phase: 67-04
    provides: layout shortcut routing that passes initialView (Cmd+K search / Cmd+Shift+P commands)
  - phase: 67-05
    provides: buildPaletteResults(matchingCommands, hits, activeConversationId) pure grouper
  - phase: 66
    provides: sanitizeSnippet, groupHitsByConversation, matchTypeGlyph/relativeTime reference, degraded-no-mutate invariant
  - phase: 57
    provides: BottomSheet.svelte + useBreakpoint("lg").below mobile primitives
provides:
  - Unified heterogeneous CommandPalette — matching commands AND cross-project message hits in ONE scrolling keyboard-navigable list
  - Cross-project message-hit deep-link via /project/<pid>/chat/<cid>?m=<encoded msgId>
  - initialView-aware open + activeConversationId-driven "In this conversation" grouping
  - BottomSheet mobile fallback at <lg with single (non-double) focus-trap/Escape
  - Removal of the legacy search-conversations command + its conversation-grained sub-view
affects: [67-07, command-palette, hybrid-chat-search]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Heterogeneous flatItems (Command | MessageSearchHit) with an `isHit` (`'messageId' in item`) discriminant driving row-type-aware Enter"
    - "Identity-aligned keyboard nav — buildPaletteResults emits the SAME object refs the template renders, so flatItems.indexOf(row) maps a rendered row to its nav index; headers (data-row-kind=header) never enter flatItems"
    - "One {#snippet body()} rendered in both the desktop modal and the mobile BottomSheet so section nesting is never flattened on mobile"
    - "Mobile-vs-desktop focus-trap ownership: gate own createFocusTrap + capture-Escape on !isMobile; BottomSheet owns them at <lg"

key-files:
  created: []
  modified:
    - web/src/lib/command-registry.ts
    - web/src/lib/__tests__/command-registry.test.ts
    - web/src/lib/components/CommandPalette.svelte

key-decisions:
  - "Query length (≥2 chars, non-ez:) drives the unified search view directly — the old `searchMode` boolean sub-view (entered via a command) is gone entirely"
  - "Always render a 'Commands' header during search when hits exist but no command matches (test contract / 'commands + hits together' must-have); suppress only in the truly-empty (no commands AND no hits) state so a single 'No matching messages.' shows"
  - "Dropped aria-selected from the row <button> (implicit-role a11y warning) — keyboard highlight is signalled via data-active='true' which the test's `[data-active='true'], [aria-selected='true']` selector matches"
  - "Token-guarded debounce (searchToken) drops stale out-of-order responses so the latest keystroke wins"
  - "searchConversations API fn left untouched (server routes + other tests still use it); only the palette's import was dropped"

patterns-established:
  - "Heterogeneous-list discriminant nav: `'messageId' in item` splits Command vs MessageSearchHit for both Enter dispatch and per-row rendering"
  - "Snippet-in-both-branches: extract the dialog body to a Svelte {#snippet} and {@render} it inside both the modal and the BottomSheet to guarantee identical nesting"

requirements-completed: [PAL-01, PAL-03, PAL-04, PAL-05, PAL-06, PAL-07]

# Metrics
duration: 8min
completed: 2026-05-30
---

# Phase 67 Plan 06: Unified Command Palette Search Summary

**Extended CommandPalette into a unified heterogeneous palette — matching commands AND cross-project message hits render together in one keyboard-navigable list, with `?m=` cross-project deep-link, Phase-66-parity snippet/glyph/role rows, initialView-aware open, and a BottomSheet mobile fallback at `<lg` — replacing the legacy conversation-grained search-conversations flow.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-05-30T20:59:00Z
- **Completed:** 2026-05-30T21:07:43Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- Turned the Plan-01 RED `CommandPalette.component.test.ts` GREEN (12/12) — the phase's acceptance contract.
- Unified flatItems model: `buildPaletteResults` feeds matching commands + cross-project hits into one `sections` tree; keyboard nav walks the actionable-rows-only `flatItems`, skipping render-only project/conversation headers.
- Row-type-aware Enter: command runs `cmd.action()`, hit deep-links `/project/<hit.projectId>/chat/<hit.conversationId>?m=<encoded messageId>` (cross-project, mirrors the ChatThread `?m=` consume shape exactly).
- Each message row: `{@html sanitizeSnippet(hit.snippet)}` (XSS-safe), user/assistant role badge, match-type glyph (≈/⊕/"), relative time — Phase 66 parity.
- `ez:` prefix still wins (never triggers a search); empty → single "No matching messages."; degraded → inline non-blocking notice that NEVER persists mode.
- Mobile (`<lg`): identical body renders inside `BottomSheet` (nesting preserved, input auto-focused, single focus-trap/Escape owned by the sheet); desktop keeps the centered modal + focus-restore-on-close.
- Removed the legacy `search-conversations` command + its palette sub-view/handlers with zero dangling references.

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove search-conversations command + sub-view** - `bc59dbcb` (refactor)
2. **Task 2: Unified flatItems model + cross-project deep-link + initialView** - `9a2ee05b` (feat)
3. **Task 3: BottomSheet mobile fallback at <lg (no double focus-trap)** - `c15a47b7` (feat)

**Plan metadata:** _(see final docs commit)_

## Files Created/Modified
- `web/src/lib/command-registry.ts` - Dropped the `search-conversations` command def (and its `searchCommands` block).
- `web/src/lib/__tests__/command-registry.test.ts` - Removed `search-conversations` from the replicated `buildCommands` (34/34 still green).
- `web/src/lib/components/CommandPalette.svelte` - Unified palette: cross-project `searchMessages(scope:"all")`, `buildPaletteResults` sections render, heterogeneous flatItems + `isHit` discriminant, row-type-aware Enter deep-link, sanitized snippet + glyph + role badge + relative time, initialView/activeConversationId props, BottomSheet `<lg` fallback with gated focus-trap/Escape.

## Decisions Made
- **Query-length-driven search (not a command-entered sub-view):** typing ≥2 non-`ez:` chars directly unifies commands + hits; the old `searchMode` boolean and its back-button/`doConversationSearch`/`selectSearchResult` were removed.
- **Commands header always present during search (when hits exist):** satisfies the "commands + hits together" must-have / test contract even when the query matches no command; suppressed only in the fully-empty state.
- **`data-active` over `aria-selected`:** dropped `aria-selected` from row `<button>`s (Svelte implicit-role a11y warning) — highlight is carried by `data-active='true'`, which the test's combined selector matches.
- **Token-guarded debounce:** a `searchToken` counter invalidates in-flight responses so the latest keystroke wins (last-write-wins).
- **`searchConversations` API fn untouched:** only the palette's import dropped; server routes + other component tests still consume it (per plan).

## Deviations from Plan

None - plan executed exactly as written.

The three tasks landed on their specified verifications without any Rule 1-4 auto-fixes. Two in-task implementation choices (always-on Commands header during search; `data-active` instead of `aria-selected`) were the natural way to satisfy the Plan-01 component contract and Svelte a11y, not deviations from the plan's prescribed approach.

## Issues Encountered
- **One initial component-test failure** on "≥2 chars renders Commands AND message-hit sections together": the query "wor" matches no command, so `buildPaletteResults` (which omits an empty Commands section by construction) produced no "Commands" header. Resolved by always rendering a "Commands" header during search when hits are present (suppressed only in the truly-empty state), keeping the helper's contract intact while satisfying the test. After the fix: 12/12 green.
- **Two Svelte a11y warnings** (`aria-selected not supported by implicit button role`) — cleared by dropping `aria-selected` and relying on `data-active`.

## Verification
- `cd web && bunx vitest run src/__tests__/CommandPalette.component.test.ts` → 12/12 green (Plan-01 RED suite turned GREEN).
- `cd web && bun test ./src/lib/__tests__/command-registry.test.ts` → 34/34 green (note: bun:test file, not a vitest include — run with `bun test ./<path>`).
- `cd web && bunx svelte-check --threshold error` → CommandPalette.svelte + CommandPalette.component.test.ts have ZERO own errors (error count dropped 21→19 as the 2 RED contract prop errors cleared; the remaining 19 are pre-existing baseline / parallel-session artifacts documented in STATE.md: extension-author-page, EntityTable, MemoryItem, audit page, ToolCardRouter, EzPanel).
- Regression: `command-palette-ask-ez.component.test.ts` 5/5, `app-layout-palette-shortcut.test.ts` 3/3, `palette-results.test.ts` 14/14 all green.
- Deep-link shape confirmed identical to the ChatThread consume at `web/src/routes/(app)/project/[id]/chat/[convId]/+page.svelte:155` (`?m=${encodeURIComponent(messageId)}`).

## Stash / Hygiene
- Sacred-12-stash invariant held throughout (12 → 12 → 12).
- Explicit-path `git add` only (the three owned files); the pre-existing dirty `manifest.lock.json` was never touched.

## Next Phase Readiness
- 67-07 (the final phase plan) remains. The unified palette is the largest extension in the phase; 67-07 likely covers coverage machine-pins / e2e per the phase pattern.
- The palette is fully wired to the Plan-05 helper, Plan-03 cross-project backend, and Plan-04 layout shortcut routing.

---
*Phase: 67-command-palette-search*
*Completed: 2026-05-30*

## Self-Check: PASSED

- FOUND: web/src/lib/command-registry.ts
- FOUND: web/src/lib/__tests__/command-registry.test.ts
- FOUND: web/src/lib/components/CommandPalette.svelte
- FOUND: .planning/phases/67-command-palette-search/67-06-SUMMARY.md
- FOUND commit: bc59dbcb (Task 1)
- FOUND commit: 9a2ee05b (Task 2)
- FOUND commit: c15a47b7 (Task 3)
