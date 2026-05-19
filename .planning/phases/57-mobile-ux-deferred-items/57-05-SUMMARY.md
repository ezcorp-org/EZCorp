---
phase: 57-mobile-ux-deferred-items
plan: 05
subsystem: ui
tags: [svelte5, svelte-dnd-action, drag-reorder, wcag, aria, accessibility, ux-04, playwright, vitest]

# Dependency graph
requires:
  - phase: 57-mobile-ux-deferred-items
    provides: "Wave 0 RED scaffolds (ExtensionSearchPicker-reorder.component.test.ts + chip-reorder.spec.ts)"
provides:
  - "svelte-dnd-action ^0.9.69 runtime dependency"
  - "ExtensionSearchPicker chip row wrapped with use:dndzone (UX-04 contract)"
  - "SelectedPill `chipId` prop forwarding `data-chip-id` for e2e item-level queries"
  - "WAI-ARIA sortable widget contract: role='list' + aria-roledescription='sortable' + descriptive aria-label authored explicitly"
  - "WCAG 2.1.1 (keyboard equivalence) + 2.5.1 (single-pointer equivalent) via svelte-dnd-action's built-in keyboard mode (NO separate ↑↓ buttons)"
  - "mobile-chromium playwright project (Pixel 5 devices preset) for future touch-fixture un-fixme"
affects: [57-06]

# Tech tracking
tech-stack:
  added: ["svelte-dnd-action ^0.9.69"]
  patterns:
    - "Chip row drag-reorder: use:dndzone on the native <div>, NOT the picker component (Pitfall 1 — Svelte actions don't attach to components)"
    - "WAI-ARIA sortable widget contract authored explicitly (role='list' + aria-roledescription='sortable' + aria-label with keyboard hint) — svelte-dnd-action does NOT auto-stamp aria-roledescription"
    - "onfinalize/onconsider both route through the existing onchange callback — in-flight onconsider keeps parent's $state mirrored so the drag doesn't snap back"
    - "Forwarded data-chip-id prop on shared SelectedPill (legacy callers byte-identical when prop absent) — DRY across reorder hosts"

key-files:
  created:
    - ".planning/phases/57-mobile-ux-deferred-items/57-05-SUMMARY.md"
  modified:
    - "web/package.json (svelte-dnd-action ^0.9.69)"
    - "web/bun.lock"
    - "web/src/lib/components/ExtensionSearchPicker.svelte (use:dndzone wiring + helpers + role/aria attrs)"
    - "web/src/lib/components/SelectedPill.svelte (optional chipId prop → data-chip-id)"
    - "web/e2e/chip-reorder.spec.ts (refined fixme rationales; kept fixme pending e2e infra)"
    - "web/playwright.config.ts (added mobile-chromium project)"

key-decisions:
  - "WAI-ARIA sortable widget contract authored explicitly — svelte-dnd-action does NOT auto-stamp aria-roledescription='sortable'. The W0 RED test asserted it as 'the public contract surface' assuming the library set it; reality is the library only adds role='list'+role='listitem' on keyboard activation. Authored role='list' + aria-roledescription='sortable' on the dndzone container so the assertion passes pre-keyboard-mode (the moment the row renders, not the moment the user grabs)."
  - "WCAG 2.5.1 single-pointer equivalent satisfied by svelte-dnd-action's keyboard mode (Space-to-grab, arrows-to-move, Enter to drop, Escape to cancel) — NO separate ↑↓ buttons (RESEARCH Open Question 4). Keyboard mode IS the equivalent; adding redundant ↑↓ buttons would clutter the chip row and create two interaction patterns for the same outcome."
  - "SelectedPill gains optional `chipId` prop (forwarded as `data-chip-id`) instead of wrapping each pill in an extra <div>. Svelte-dnd-action requires items as direct children of the dndzone; wrapping would break that. Forwarded-prop pattern keeps the diff to a single attribute add on the pill body span."
  - "onconsider AND onfinalize both emit through onchange — svelte-dnd-action requires the items reference to mutate during drag, otherwise the reorder snaps back visually. Both handlers compute the same payload (e.detail.items.map(it => it.id)) but onfinalize is the persistence event; onconsider is the live-preview event. Parent's $state mirrors the in-flight order via onconsider."
  - "E2e cases stay fixme — same precedent as Plan 57-02 (assignment-picker e2e left fixme). The `/agents/[name]` route is under SvelteKit's `(app)` protected route group requiring authenticated session + agent-config DB seed; non-docker playwright config has no auth setup; no `test-agent` fixture exists. Component-layer GREEN (4/4 cases) is the binding regression contract for the dndzone wiring."
  - "mobile-chromium project added to playwright.config.ts (Pixel 5 devices preset) — currently unused (all chip-reorder cases fixme), wired now so future un-fixme is a one-line operation on the test side."

patterns-established:
  - "Pattern 1 (dndzone wiring): `<div use:dndzone={{ items: shapedItems(), flipDurationMs: 200, type: 'unique-key' }} onconsider={fn} onfinalize={fn} role='list' aria-roledescription='sortable' aria-label='...'>{#each shapedItems() as item (item.id)}<Child />{/each}</div>` — both onconsider and onfinalize route through the same persistence callback; aria-label includes keyboard hint string verbatim."
  - "Pattern 2 (data-attr forwarding on shared components): Optional prop (`chipId?: string`) renders as `data-chip-id={chipId}` on outermost element. Legacy callers omit the prop → attribute absent (byte-identical). New callers pass the prop → e2e tests can query individual items by id."
  - "Pattern 3 (explicit ARIA over implicit): When a library docs claim aria-X is auto-stamped but the assertion fires on initial render (not on user interaction), author the attribute explicitly. svelte-dnd-action's role='list' + role='listitem' fires on keyboard-mode init (Space-to-grab); the W0 contract needs the attribute pre-grab, so authoring it on the dndzone container is the bridge."

requirements-completed: [UX-04]

# Metrics
duration: 5min
completed: 2026-05-12
---

# Phase 57 Plan 05: Extension Chip Drag-Reorder Summary

**Drag-reorderable extension chip row in `ExtensionSearchPicker.svelte` — mouse + touch + keyboard equivalence via `svelte-dnd-action`'s built-in keyboard mode, WAI-ARIA sortable widget contract authored, persistence via existing PATCH `/api/agents/:name` (zero API change).**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-12T01:33:18Z
- **Completed:** 2026-05-12T01:38:30Z
- **Tasks:** 3
- **Files modified:** 6 (1 created — SUMMARY; 5 modified — 2 deps + 2 components + 1 spec + 1 playwright config)

## Accomplishments

- **svelte-dnd-action ^0.9.69 installed** as a runtime dependency. Lock file updated; install ran clean (1 package, ~750ms).
- **ExtensionSearchPicker chip row wraps with `use:dndzone`** — onfinalize routes through the existing `onchange` callback, which already writes to `agentConfigs.extensions` JSONB via the pre-existing PATCH `/api/agents/:name` route. **Zero API changes required.** Persistence semantics: the array order IS the chip order.
- **WAI-ARIA sortable widget contract authored** — `role="list"`, `aria-roledescription="sortable"`, and a descriptive `aria-label` with the keyboard hint string ("Space to grab, arrows to move, Enter to drop, Escape to cancel"). Screen readers announce the reorderable list AND the keyboard activation pattern.
- **Wave 0 RED → GREEN: 4/4 cases** in `ExtensionSearchPicker-reorder.component.test.ts` flip GREEN. Full-suite vitest (480/480 component tests) passes — zero regressions.
- **WCAG 2.1.1 (keyboard equivalence) + WCAG 2.5.1 (single-pointer equivalent)** satisfied via svelte-dnd-action's keyboard mode — NO separate ↑↓ buttons (RESEARCH Open Question 4 decision). Keyboard mode IS the single-pointer-equivalent.
- **SelectedPill ergonomics:** optional `chipId` prop added (forwarded as `data-chip-id` on the pill body); legacy callers byte-identical when prop absent. Future reorder hosts (other pickers) can reuse the pattern.
- **mobile-chromium playwright project added** (Pixel 5 devices preset) — wired now so the future e2e touch-fixture un-fixme is a one-line operation.

## aria-label string (verbatim, for Wave 3 / e2e pattern-match)

```
"Reorderable extension list — Space to grab, arrows to move, Enter to drop, Escape to cancel"
```

## Task Commits

Each task committed atomically:

1. **Task 1: Install svelte-dnd-action** — `3b889dd` (chore)
2. **Task 2: Wire dndzone into ExtensionSearchPicker chip row** — `7239c59` (feat)
3. **Task 3: Refine e2e fixme rationales + add mobile-chromium project** — `cd0129a` (test)

**Plan metadata commit:** (pending — final commit captures SUMMARY/STATE/ROADMAP/REQUIREMENTS updates)

## Files Created/Modified

- `web/package.json` — `svelte-dnd-action ^0.9.69` added to dependencies.
- `web/bun.lock` — lock file updated for new dep.
- `web/src/lib/components/ExtensionSearchPicker.svelte` — chip row wrapped with `use:dndzone`; helpers `chipItems()`, `handleFinalize()`, `handleConsider()` added; role="list" + aria-roledescription="sortable" + descriptive aria-label authored.
- `web/src/lib/components/SelectedPill.svelte` — optional `chipId` prop added; rendered as `data-chip-id` on the outermost span (legacy callers byte-identical).
- `web/e2e/chip-reorder.spec.ts` — 6 fixme rationales transitioned from "Wave 2 Track C impl" (pre-Task-2) to "e2e infra: auth + test-agent seed pending"; file header documents the e2e infra gap.
- `web/playwright.config.ts` — `mobile-chromium` project added (Pixel 5 devices preset); `devices` import added from `@playwright/test`.
- `.planning/phases/57-mobile-ux-deferred-items/57-05-SUMMARY.md` — this file.

## Decisions Made

See `key-decisions` in frontmatter. Highlights:
- WAI-ARIA sortable widget contract authored explicitly (svelte-dnd-action does NOT auto-stamp aria-roledescription).
- No separate ↑↓ buttons; svelte-dnd-action's keyboard mode IS the WCAG 2.5.1 single-pointer equivalent.
- SelectedPill gains a forwarded `chipId → data-chip-id` prop instead of wrapping each pill in an extra div.
- onconsider AND onfinalize both emit through onchange to keep parent's $state mirrored during drag (otherwise the reorder snaps back).
- E2e cases stay fixme (Plan 57-02 precedent); rationale refined to e2e infrastructure gap.
- mobile-chromium project added now to make future un-fixme cheap.

## mobile-chromium project status

**CONFIGURED.** Added to `web/playwright.config.ts` (Pixel 5 devices preset). All 12 chip-reorder tests (6 cases × 2 projects = chromium + mobile-chromium) are discovered by `bunx playwright test --list`. Currently all 12 run as `skipped` because of test.fixme on every case.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] svelte-dnd-action does NOT auto-stamp `aria-roledescription="sortable"`**
- **Found during:** Task 2 (post-wire vitest verify)
- **Issue:** The Wave 0 RED test comment claimed svelte-dnd-action stamps `aria-roledescription="sortable"` as its "public contract surface". Reality (verified by grepping `node_modules/svelte-dnd-action/dist/index.mjs`): the library only sets `role="list"` on the dndzone and `role="listitem"` on children, and only during keyboard-mode initialization (Space-to-grab). It does NOT set aria-roledescription anywhere. The W0 test "selected chip row uses dndzone action" failed on initial render with `aria-roledescription === null`.
- **Fix:** Authored `role="list"` + `aria-roledescription="sortable"` directly on the dndzone container in `ExtensionSearchPicker.svelte`. This matches the WAI-ARIA Authoring Practices recommendation for sortable widgets (`<https://www.w3.org/WAI/ARIA/apg/patterns/listbox/#wai-aria-roles-states-and-properties-22>`) and gives screen readers the sortable announcement immediately, not just after the user grabs.
- **Files modified:** `web/src/lib/components/ExtensionSearchPicker.svelte`
- **Verification:** 4/4 vitest cases GREEN; 480/480 component tests pass (no regressions).
- **Committed in:** `7239c59` (Task 2 commit)

**2. [Rule 3 - Blocking → Documented] E2e cases left fixme (Plan 57-02 precedent)**
- **Found during:** Task 3 (un-fixme attempt)
- **Issue:** The plan instructed: "Un-fixme the 6 cases in `web/e2e/chip-reorder.spec.ts`." Reality:
  1. `/agents/[name]` route lives in `(app)` protected route group requiring authenticated session.
  2. Non-docker playwright config (the default) has NO auth setup; the docker config (`DOCKER_TEST=1`) has auth but does NOT seed a `test-agent` with extensions attached.
  3. `[data-chip-id]` chip queries assume the agent has >=3 extensions pre-attached AND the form is in edit mode — neither is set up by any current Playwright fixture.
  4. The picker's trigger button has no `data-testid="open-extension-search-picker"` yet — Plan 57-03 (UX-01 dropdown wrap) will add that, gating a future un-fixme.
  Un-fixme'ing would convert 6 fixme entries into 6 RED failures on every CI run, which would be confused for a wrap regression.
- **Fix:** Same as Plan 57-02 (assignment-picker e2e left fixme). Kept `test.fixme(true, ...)` on all 6 cases but UPDATED the rationale from "Wave 2 Track C impl" (pre-Task-2) to "e2e infra: auth + test-agent seed pending" (post-Task-2). File header documents the e2e infra gap, points at component-layer GREEN as the binding regression contract, and names Phase 59 TEST debt as the un-fixme owner. mobile-chromium project added pre-emptively to make the future un-fixme cheap.
- **Files modified:** `web/e2e/chip-reorder.spec.ts`, `web/playwright.config.ts`
- **Verification:** `bunx playwright test e2e/chip-reorder.spec.ts --list` enumerates 12 tests (6 cases × 2 projects); `--project=chromium` runs all 6 as `skipped` (fixme semantics correct); `bunx playwright test --list` parses all 197 e2e files cleanly.
- **Committed in:** `cd0129a` (Task 3 commit)

**3. [Rule 2 - Missing Critical] SelectedPill gained optional `chipId` prop (forwarded `data-chip-id`)**
- **Found during:** Task 2 (chip row impl)
- **Issue:** The W0 e2e tests reference `[data-chip-id]` queries on individual chips (e.g., `chips.evaluateAll((els) => els.map(el => el.dataset.chipId))`). SelectedPill rendered no chip-id attribute, so even when un-fixme'd, the queries would return null on every chip. Required for e2e item-level identification.
- **Fix:** Added an optional `chipId?: string` prop to SelectedPill; rendered as `data-chip-id={chipId}` on the outermost `<span>`. Legacy callers (ToolSearchPicker, ModelSearchPicker, ModeSearchPicker — all 4 SelectedPill consumers) stay byte-identical because the prop is optional and the attribute is absent when undefined. ExtensionSearchPicker passes `chipId={item.id}` from its dndzone iteration.
- **Files modified:** `web/src/lib/components/SelectedPill.svelte`, `web/src/lib/components/ExtensionSearchPicker.svelte`
- **Verification:** 480/480 component tests pass (zero regressions on the 4 other SelectedPill consumers).
- **Committed in:** `7239c59` (Task 2 commit)

---

**Total deviations:** 3 (1 bug — wrong assumption in W0 RED scaffold; 1 blocker — e2e infra deferred per Plan 57-02 precedent; 1 missing critical — data-chip-id for e2e item queries)
**Impact on plan:** All deviations within scope. The aria-roledescription fix was a W0 scaffold authoring error (the library reality doesn't match the test's comment); component-layer GREEN proves the actual contract is in place. The e2e fixme decision mirrors Plan 57-02 — same `(app)` protected-route blocker, same component-layer-is-the-binding-contract decision. The SelectedPill `chipId` prop is a forward-looking enabler for the e2e un-fixme without bloating legacy call sites.

## Issues Encountered

- **`web/src/lib/components/ExtensionSearchPicker.svelte` had uncommitted BottomSheet + useBreakpoint imports** in the working tree at plan start (from in-progress Plan 57-03 work that hadn't been committed yet). Those imports were preserved through my Task 2 edit (no markup change to the dropdown body — UX-04's scope is the chip row above the dropdown). After my Task 2 commit, the same imports re-appeared in the working tree (likely a linter / svelte-kit sync). I left them alone — they're out of scope for Plan 57-05 and Plan 57-03's owner will use them.
- **`AgentSearchPicker.svelte`, `ExtensionAttachPicker.svelte`, `AgentConfigForm.svelte`, `ModelSearchPicker.svelte`, `src/db/queries/marketplace.ts`, etc.** had uncommitted working-tree changes at plan start — none touched by this plan. Per CLAUDE.md auto-memory `feedback_agent_briefs_no_git_stash`, no `git stash` invoked. Files left untouched; only Plan 57-05's own files staged + committed.

## Manual-Only Verifications Still Pending

Per VALIDATION.md table:
1. **Real-device touch on iPhone Safari** — Playwright webkit + mobile-chromium projects are the automated approximation; svelte-dnd-action's touch handler is upstream-tested. Real-device confirmation still required before phase sign-off (same Manual-Only row as iOS safe-area visual for UX-01).
2. **Real-device keyboard reorder on iOS / Android external keyboard** — svelte-dnd-action's keyboard mode is documented + upstream-tested but real-device VoiceOver / TalkBack announce verification is a Manual-Only contract.

## Self-Check

Verification commands run after writing this SUMMARY:

```bash
# 1. Dep present
cd web && grep -q "svelte-dnd-action" package.json && echo OK
# → OK

# 2. Component test GREEN
cd web && bunx vitest run src/lib/components/__tests__/ExtensionSearchPicker-reorder.component.test.ts
# → Test Files 1 passed (1) / Tests 4 passed (4)

# 3. E2e spec parses + mobile-chromium discovered
cd web && bunx playwright test e2e/chip-reorder.spec.ts --list
# → 12 tests in 1 file (6 chromium + 6 mobile-chromium)

# 4. No regressions across component suite
cd web && bunx vitest run src/lib/components/
# → Test Files 51 passed (51) / Tests 480 passed (480)

# 5. Commits present in git log
git log --oneline -5
# → cd0129a, 7239c59, 3b889dd verified
```

## Self-Check: PASSED

- web/src/lib/components/ExtensionSearchPicker.svelte (modified) — FOUND (contains `use:dndzone`, `aria-roledescription="sortable"`, `chipId={item.id}`)
- web/src/lib/components/SelectedPill.svelte (modified) — FOUND (contains `chipId` prop + `data-chip-id={chipId}`)
- web/package.json (modified) — FOUND (`"svelte-dnd-action": "^0.9.69"`)
- web/bun.lock (modified) — FOUND
- web/e2e/chip-reorder.spec.ts (modified) — FOUND (6 fixme rationales updated)
- web/playwright.config.ts (modified) — FOUND (mobile-chromium project)
- Commit 3b889dd — FOUND (Task 1)
- Commit 7239c59 — FOUND (Task 2)
- Commit cd0129a — FOUND (Task 3)
- Wave 0 RED→GREEN: 4/4 — VERIFIED

## Next Phase Readiness

- **Plan 57-06 (UX-03 agent-picker prefs) unblocked** — independent of UX-04; can run in parallel with the in-progress Plan 57-03 (UX-01 dropdown wrap).
- **Plan 57-03 (UX-01 dropdown wrap)** has in-progress working-tree changes touching `ExtensionSearchPicker.svelte`; the chip-row diff from this plan sits at the top level of the component, byte-disjoint from the dropdown-body wrap region. No merge conflict expected when Plan 57-03 commits.
- **Phase 59 TEST debt (or a future Wave 2 Track A continuation)** owns the chip-reorder e2e un-fixme — auth fixture + `test-agent` DB seed + `data-testid="open-extension-search-picker"` (the last comes from Plan 57-03) are the three gates.

---
*Phase: 57-mobile-ux-deferred-items*
*Plan: 05*
*Completed: 2026-05-12*
