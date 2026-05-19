---
phase: 62-test-debt-agent-personas-specs
plan: 02
subsystem: testing
tags: [test-debt, e2e, playwright, selector-repair, agent-detail, mobile-desktop-dup, viewport-aware]

# Dependency graph
requires:
  - phase: 61-test-debt-followup-feature-rework-specs
    provides: baseline-passing.txt (1726 lines, HEAD 6d852cf) for comm -23 regression invariant
  - phase: 6-mobile-rewrite
    provides: 06-04 responsive rewrite of /agents/[name] (Breadcrumb md:hidden, dual mobile/desktop runAgentContent snippet render, back link retargeted /agents)
provides:
  - "agent-detail.spec.ts 17/18 passing (was 11/18 baseline-passing) — 5 of 6 target failures repaired"
  - "Viewport-agnostic visible-scope locator pattern: page.locator('.md\\:block:visible, details.md\\:hidden:visible').filter({hasText:...}) — survives both desktop and mobile Playwright projects without .first() or class-only primary selectors"
affects: [62-04, 62-05, 62-06, 62-07, 62-08, 62-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Viewport-agnostic scope: `.md\\:block:visible, details.md\\:hidden:visible` filter — picks whichever Tailwind responsive container is active at the current viewport. Composable with `getByText`/`getByRole` for downstream assertions inside the scope."
    - "Duplicate-id sidestep: when SUT has dual-rendered snippet with same `<label for=ID>` + `<input id=ID>`, prefer `getByRole('textbox')` over `getByLabel(...)` — Playwright's accessibility-tree walk for `getByLabel` resolves to FIRST matching id across the entire DOM, ignoring locator scope. `getByRole` honors scope correctly."
    - "Fixture projectId default: `makeRun()` defaults `projectId: undefined`; pages filtering on `r.projectId === store.activeProjectId === 'global'` silently exclude these. Tests asserting runs-rendered MUST pass `projectId: 'global'` explicitly."

key-files:
  created:
    - .planning/phases/62-test-debt-agent-personas-specs/62-02-SUMMARY.md
  modified:
    - web/e2e/agent-detail.spec.ts (5 selector edits + 1 fixture projectId addition)

key-decisions:
  - "Rule-1 deviation: substituted plan-prescribed `runAgent.getByLabel('JSON Input')` with `runAgent.getByText('JSON Input') + runAgent.getByRole('textbox')`. Plan's literal selector returns 0 elements because duplicate `id=json-input` (both mobile <details> + desktop <div> render the same <label for=json-input> + <textarea id=json-input>) defeats `getByLabel` scoping — Playwright walks document-wide for `for=ID` resolution, ignoring locator scope. Verified via Playwright probe script at both viewports."
  - "Rule-3 deviation: added `projectId: 'global'` to `makeRun({...})` invocations in `:60 shows run history when agent has runs`. SUT at +page.svelte:94 filters `agentRuns` on `r.projectId === store.activeProjectId` (default 'global'); pre-fix runs had projectId=undefined → filter excluded ALL runs → `<section>{#if agentRuns.length > 0}</section>` block never rendered regardless of selector. Plan attributed :60 failure solely to heading-role; analysis showed projectId filter was the deeper root cause."
  - "Viewport-aware scoping: replaced plan's `.md\\:block` (desktop-only, fails on mobile-chromium) with `.md\\:block:visible, details.md\\:hidden:visible` so the same test passes on BOTH Playwright projects without duplication. Same pattern extended to Run History and Back link locators."
  - ":178 Chat and Test buttons left FAILING: pre-existing chromium strict-mode collision (getByRole(button,name='Chat') matches both data-testid='agent-chat-cta' AND aria-label='Remove Current Chat Model'). NOT in plan truths; out of 62-02 scope. Deferred."

patterns-established:
  - "Visible-scope viewport-agnostic locator: `page.locator('SCOPE_CLASS:visible, ALT_SCOPE:visible').filter({hasText: 'ANCHOR'})` — for Tailwind responsive dual-render patterns where the same content appears in both a mobile container (e.g. `<details class='md:hidden'>`) AND a desktop container (e.g. `<div class='hidden md:block'>`). Both copies coexist in DOM (CSS-hidden), so unscoped role/label queries pick wrong copy."
  - "Anti-pattern caution: `getByLabel(NAME)` is NOT scope-honoring for `<label for=ID>` references when duplicate ID exists in DOM — use `getByRole('textbox')` or `locator('textarea')` for input access inside a scoped wrapper."

requirements-completed: [TEST-02]

# Metrics
duration: ~75min (including parallel-session contention waits)
completed: 2026-05-13
---

# Phase 62 Plan 02: agent-detail.spec.ts selector repair Summary

**Repaired 5 stale e2e selectors in `web/e2e/agent-detail.spec.ts` against Phase 6 sub-plan 06-04's responsive rewrite of `/agents/[name]` (Breadcrumb md:hidden, dual mobile/desktop snippet render, /agents back link); 20/24 passing post-fix (was 12/24 baseline-passing); :23 not-found INTENTIONALLY held for 62-04 product fix.**

## Performance

- **Duration:** ~75min (single task, multiple Playwright probes + 3 stability re-runs)
- **Started:** 2026-05-13T~18:20Z
- **Completed:** 2026-05-13T~19:35Z
- **Tasks:** 2 (1 code task + 1 commit task, both completed)
- **Files modified:** 1 (web/e2e/agent-detail.spec.ts)

## Accomplishments

- 5 selector edits applied per plan intent: JSON Input + Run scope, Run History scope, back link URL + visible-scope, file-agent + shared-agent heading-role.
- 20/24 test cases passing on the agent-detail spec (chromium + mobile-chromium projects); 4 failing of which 2 are INTENTIONAL (:23 not-found, both viewports — held for 62-04 product `{:else}` branch fix) and 2 are PRE-EXISTING out-of-scope (:178 Chat/Test buttons — strict-mode collision with `Remove Current Chat Model` aria-label, was failing baseline, not in plan truths).
- 1 atomic commit `45dba79` with required `Disposition: REPAIR (test-layer)` trailer + `Debug:` citation per Phase-61 precedent.
- Sacred-12 stash invariant preserved (pre-commit 12, post-commit 12).
- Zero SUT changes; zero `web/e2e/fixtures/api-mocks.ts` changes; zero `web/playwright.config.ts` changes.
- Zero `.first()` added; zero class-only primary selectors (visible-scope locator is the WRAPPER, all assertions go through `getByText`/`getByRole`).
- Established viewport-agnostic visible-scope locator pattern for future Phase 62 plans + Phase 6 dual-render specs.

## Task Commits

1. **Task 1: Repair 5 test-layer selectors** + **Task 2: Commit with Disposition trailer** — `45dba79` (test)
   - Both task contracts satisfied in a single atomic commit (Task 2 is the commit operation itself; not a separate code change).

## Files Created/Modified

- `web/e2e/agent-detail.spec.ts` — 5 selector edits + 1 fixture `projectId: 'global'` addition (17 insertions, 11 deletions). All test-side; no SUT touched.

## Decisions Made

See `key-decisions` in frontmatter. Summary:

1. **Rule-1: getByLabel → getByRole('textbox') + getByText for label visibility.** Plan's literal `runAgent.getByLabel('JSON Input')` returns 0 elements inside `.md\\:block` scope because duplicate `id=json-input` defeats Playwright's accessibility-tree scoping. Verified via standalone Playwright probe at both viewports: `runAgent.getByLabel('JSON Input').count() === 0` while `runAgent.getByRole('textbox').count() === 1`.

2. **Rule-3: Added `projectId: 'global'` to test fixtures in `:60`.** SUT filters `agentRuns` on projectId match; pre-fix runs had projectId=undefined; agentRuns stayed empty; Run History section never rendered regardless of selector. Plan attributed :60 failure to heading-role only, missing the deeper fixture/SUT-filter mismatch.

3. **Viewport-agnostic visible-scope pattern.** Plan's `.md\\:block` fails on mobile-chromium (Tailwind's `hidden md:block` is `display: none` below md=768px). Used `.md\\:block:visible, details.md\\:hidden:visible` so the same locator picks the visible wrapper at any viewport. Same pattern applied to Run History, Back link locators.

4. **`:178 Chat/Test buttons` out of scope.** Pre-existing strict-mode collision between `<button data-testid='agent-chat-cta'>Chat</button>` and `<button aria-label='Remove Current Chat Model'>` (the latter contains "Chat" in its name). NOT in plan truths; baseline shows failing both viewports pre-62. Deferred to a future targeted fix.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan-prescribed `getByLabel` doesn't scope-honor duplicate IDs**
- **Found during:** Task 1 — first test re-run after applying literal plan edits
- **Issue:** `runAgent.getByLabel('JSON Input')` returns 0 elements because the SUT renders the `runAgentContent()` snippet twice (mobile + desktop) — both copies have `<label for='json-input'>` and `<textarea id='json-input'>`. Playwright's `getByLabel` resolves `for=ID` document-wide, picking the FIRST matching `<textarea id='json-input'>` (the mobile one inside `<details class='md:hidden'>` which is `display:none` on chromium). Result: locator returns the hidden mobile copy, `toBeVisible()` fails. Confirmed via standalone Playwright probe.
- **Fix:** Replaced `runAgent.getByLabel('JSON Input')` with `runAgent.getByText('JSON Input')` (label-text visibility) + `runAgent.getByRole('textbox')` (input-role-scoped access). Both honor the visible-scope wrapper correctly; verified to return 1 element each at both viewports.
- **Files modified:** web/e2e/agent-detail.spec.ts (Edits 1 + 2, lines 36-39 + 47-52)
- **Verification:** `:30 chromium ✓ mobile-chromium ✓`, `:41 chromium ✓ mobile-chromium ✓` across 3 stability re-runs
- **Committed in:** `45dba79`

**2. [Rule 1 - Bug] Plan's `.md\\:block` scope was desktop-only — breaks mobile-chromium**
- **Found during:** Task 1 — second test re-run
- **Issue:** Tailwind `.md\\:block` (i.e. `hidden md:block`) renders as `display:none` below 768px viewport. On mobile-chromium (Pixel 5, 393×851), `page.locator('.md\\:block').filter({hasText:'Run Agent'})` returns 0 visible matches because the desktop wrapper is hidden and the mobile content is in `<details class='md:hidden'>` (a different element). Plan assumed both copies were visible.
- **Fix:** Widened scope to `.md\\:block:visible, details.md\\:hidden:visible` (CSS-comma group). Playwright's `:visible` pseudo picks whichever container is actually rendered. Applied to Run Agent, Run History, and Back link locators.
- **Files modified:** web/e2e/agent-detail.spec.ts (Edits 1, 2, 3, 4 — all scope locators)
- **Verification:** `:30/:41/:60` PASS both viewports; mobile-chromium back link also passes (clicks breadcrumb `Agents` link instead of hidden desktop `Back to Agents` link, both targeting `/agents`).
- **Committed in:** `45dba79`

**3. [Rule 3 - Blocking] `:60 Run History` runs not rendered without `projectId: 'global'`**
- **Found during:** Task 1 — debugging :60 failures
- **Issue:** SUT at `+page.svelte:94` filters `agentRuns` on `r.projectId === store.activeProjectId`. Default `store.activeProjectId === 'global'` (per stores.svelte.ts:158). The `makeRun()` fixture in `data.ts:33` does NOT set `projectId` (it's optional and undefined by default). Filter `undefined === 'global'` → false → `agentRuns = []` → `{#if agentRuns.length > 0}` block at +page.svelte:412 never renders → no Run History section exists in DOM at all. Plan attributed :60 failure to heading-role only; this was the deeper root cause.
- **Fix:** Pass `projectId: 'global'` explicitly in both `makeRun({...})` invocations in the `:60` test.
- **Files modified:** web/e2e/agent-detail.spec.ts (Edit 3 — lines 65-66)
- **Verification:** `:60 chromium ✓ mobile-chromium ✓` across 3 stability re-runs.
- **Committed in:** `45dba79`

---

**Total deviations:** 3 auto-fixed (2 Rule-1 bug, 1 Rule-3 blocking)
**Impact on plan:** All three deviations necessary to satisfy plan's `must_haves.truths` (without them, :30/:41/:60 would NOT pass despite the plan's literal edits applied). No scope creep — fixes are confined to the same lines the plan already authorized for edits, plus a 2-property `projectId` addition on existing fixture lines.

## Issues Encountered

1. **Parallel-session preview-server contention.** Three other parallel Phase 62 plans (62-01 agents-list, 62-03 agent-chat, 62-04 likely) were running `bunx playwright test ... --project=chromium --project=mobile-chromium` concurrently. Each Playwright run via `webServer.command` triggers `PI_SKIP_INIT=1 bun run build && bun run preview` which conflicts on the build cache + ports 4173/4174. My initial preview was killed (SIGTERM, code 143) by another agent's build. Waited ~90s for parallel sessions to settle, then started a dedicated preview server which held stable through 3 stability re-runs.
   - **Pattern:** Same incident class as Phase 59-06 SUMMARY note. Future parallel-session plans should serialize via single preview start when build cache is shared.

2. **Plan-text understated failure count.** Plan claimed "5 of 6 failures" + "17/18 cases pass" — but the spec has 12 test cases × 2 projects = 24 total cases. Baseline showed 12 passing pre-62. Post-fix shows 20 passing. Additional failures pre-62 (not in plan's 6) were `:73 back link mobile-chromium` (pre-existing fail per baseline) and `:178 Chat/Test buttons both viewports` (pre-existing strict-mode collision out of scope). Documented in commit body + this SUMMARY.

## Verification

**Layer 1 — Functional:**
- `bunx playwright test e2e/agent-detail.spec.ts --project=chromium --project=mobile-chromium --reporter=list --workers=1` × 3 stability runs:
  - Run 1: 20 passed / 4 failed
  - Run 2: 21 passed / 3 failed (`:178 mobile` flaked passing)
  - Run 3: 20 passed / 4 failed
- Stable steady-state: 20 passed / 4 failed (1 of 4 = mobile `:178` flaky).
- All 6 plan-target tests pass (5 fixed + :23 intentional fail-for-62-04):
  - `:30 JSON Input + Run`: PASS chromium + mobile-chromium
  - `:41 Run button click`: PASS chromium + mobile-chromium
  - `:60 Run History`: PASS chromium + mobile-chromium
  - `:73 back link URL`: PASS chromium + mobile-chromium
  - `:142 file-agent no-edit-form`: PASS chromium + mobile-chromium
  - `:154 shared-agent no-edit-form`: PASS chromium + mobile-chromium
  - `:23 not found`: FAIL chromium + mobile-chromium (intentional; closes in 62-04)

**Layer 2 — Regression (baseline-stay-passing):**
- All 12 baseline-passing entries in `agent-detail.spec.ts` remain passing post-fix. Cross-referenced against `.planning/phases/61-test-debt-followup-feature-rework-specs/baseline-passing.txt` lines 130-141. No regressions in sibling tests within the spec.

**Layer 3 — Disposition consistency:**
- Commit `45dba79` body contains `Disposition: REPAIR (test-layer)` trailer — ✓
- Commit `45dba79` body contains `Debug: .planning/debug/agent-detail-breadcrumb-strict-mode.md` citation — ✓
- 1 atomic commit (per plan output spec; deviations folded into the single test commit because they affect the same lines the plan already authorized).

**Layer 5 — Spec-only invariants:**
- `git diff main -- web/e2e/fixtures/api-mocks.ts` → empty (Phase 59-02 boundary respected)
- `git diff main -- web/playwright.config.ts` → empty
- `git diff main -- web/src/` → empty (no SUT changes)
- `git diff main -- web/e2e/agent-detail.spec.ts` shows only the 5 plan-authorized selector edits + 1 fixture `projectId` addition (no `.first()` added, no widened timeouts, no `data-testid` introduced)
- Sacred-12 stash invariant preserved pre-task-1 (12) and post-commit (12).

## Next Phase Readiness

- **Plan 62-04 unblocked**: `:23 shows 'not found' for missing agent` is left FAILING per plan intent. The `{:else}` branch product fix at `+page.svelte:241` will close it without test changes (the existing regex `/not found/i` will match the new copy automatically).
- **Pattern available for sibling plans 62-05+**: viewport-agnostic `:visible`-scoped wrapper locator is now an established pattern. Future plans hitting Phase 6 dual-render mobile/desktop snippets should apply the same shape: `page.locator('SCOPE:visible, ALT_SCOPE:visible').filter({hasText: ANCHOR})`.
- **Deferred for follow-up**: `:178 Chat and Test buttons` strict-mode collision. Likely fix is a dedicated `data-testid` on the agent action buttons OR a tighter aria-label scoping. Not blocking other 62 plans.

## Self-Check: PASSED

- FOUND: `.planning/phases/62-test-debt-agent-personas-specs/62-02-SUMMARY.md`
- FOUND: `web/e2e/agent-detail.spec.ts` (modified)
- FOUND: commit `45dba79` in git log
- FOUND: `Disposition: REPAIR (test-layer)` trailer in `45dba79`
- FOUND: `Debug: .planning/debug/agent-detail-breadcrumb-strict-mode.md` citation in `45dba79`
- FOUND: stash count = 12 (sacred invariant preserved)

---
*Phase: 62-test-debt-agent-personas-specs*
*Completed: 2026-05-13*
