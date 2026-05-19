---
phase: 62-test-debt-agent-personas-specs
plan: 04
subsystem: ui
tags: [agent-detail, not-found, svelte, sveltekit, ux-gap, product-fix, pre-existing-product-gap]

# Dependency graph
requires:
  - phase: 62-test-debt-agent-personas-specs
    provides: "62-02 5-selector repair landed first (files-modified-overlap protection, Layer 5 sacred). 62-04 verifies the existing :23 test passes against new product code WITHOUT modifying agent-detail.spec.ts."
provides:
  - "{:else} not-found branch on /agents/[name]/+page.svelte at line 436 — renders rounded panel with 'Agent \"{agentName}\" not found.' message when route param doesn't match any agent in store.agents"
  - "Cluster B :23 closure — agent-detail.spec.ts now 22/24 passing on chromium + mobile-chromium (was 20/24 after 62-02; :23 was 2 of the 4 failures)"
  - "Phase 62's ONLY product-code change — all other plans (62-01/02/03/05–09) are test-side"
  - "Disposition: FIX (product) precedent — distinct trailer for the lone product change among 8 test-layer REPAIR commits in Phase 62"
affects: [62-05, 62-06, 62-07, 62-08, 62-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Svelte 5 {:else} branch on {#if data} for missing-resource UX — applies to any /resource/[id] route where the resource may not exist in the in-memory store"
    - "Preview-server rebuild + restart for SUT changes (Phase 61-02 § Rule 3 precedent extended to .svelte files) — Vite preview serves a baked production bundle, not live source"

key-files:
  created:
    - .planning/phases/62-test-debt-agent-personas-specs/62-04-SUMMARY.md
  modified:
    - web/src/routes/(app)/agents/[name]/+page.svelte

key-decisions:
  - "Use agentName (route param, already $derived) instead of agent.name — agent is undefined in the {:else} branch, so agent.name would crash; route param is always defined and matches user expectation ('the URL you typed')"
  - "Wrap the <p> in a rounded panel matching existing Test Conversations / Run Agent card style — consistent layout, doesn't look like an empty page"
  - "text-[var(--color-text-secondary)] color token — matches existing agent.description color (line 324) for visual consistency"
  - "NO data-testid added — existing test regex /not found/i matches the copy directly; data-testid would be over-engineering"
  - "NO touch to Breadcrumb or back-link — breadcrumb still renders ('Agents > nonexistent') outside the conditional, matching UX expectation"

patterns-established:
  - "Preview-server-restart-on-SUT-edit: Phase 62-04 confirms Phase 61-02 § Rule 3 ('Preview server rebuild + restart for SUT testid changes') applies to .svelte template-body edits too, not just testid additions. Stale preview server caused initial test failure; rebuild+restart fixed it."
  - "Disposition: FIX (product) vs REPAIR (test-layer): Phase 62 establishes the dual-trailer convention — product changes use FIX, spec-side repairs use REPAIR. Both cite debug docs."

requirements-completed: [TEST-02]

# Metrics
duration: 8min
completed: 2026-05-13
---

# Phase 62 Plan 4: Agent-Detail Not-Found UI Summary

**Adds {:else} not-found branch to /agents/[name]/+page.svelte closing the 6th of 6 agent-detail regressions — Cluster B :23, the only product-code change in Phase 62**

## Performance

- **Duration:** 8 min
- **Started:** 2026-05-13T19:35:00Z
- **Completed:** 2026-05-13T19:43:00Z
- **Tasks:** 2 (Task 1 add {:else} branch + Task 2 commit)
- **Files modified:** 1 (web/src/routes/(app)/agents/[name]/+page.svelte; +4 lines)

## Accomplishments
- 4-line `{:else}` branch added to `{#if agent}` on `/agents/[name]/+page.svelte` (was line 436, the previously-unconditional `{/if}` close)
- Renders rounded panel with `Agent "{agentName}" not found.` message when route param doesn't resolve to a store agent — matches existing card layout for visual consistency
- Existing test `agent-detail.spec.ts:23` (`shows 'not found' for missing agent`) now PASSES on chromium + mobile-chromium WITHOUT any spec edit — confirms plan's success-criterion match
- Adjacent specs unaffected: `agents-list.spec.ts` (17 cases × 2 projects) + `agent-chat.spec.ts` (12 cases × 2 projects) all green
- Stability run on :23 isolated: 2/2 PASS in 2.1s, zero flake on stability re-run
- Sacred-12-stash invariant preserved (12 → 12 throughout)
- Disposition: FIX (product) trailer — distinguishes this ONE product change from the 8 test-layer REPAIR commits in Phase 62

## Task Commits

Each task was committed atomically per plan:

1. **Task 1+2: Add {:else} not-found UI + commit with Disposition trailer** — `798daa8` (fix)

**Plan metadata:** (to follow as docs commit after SUMMARY write)

## Files Created/Modified
- `web/src/routes/(app)/agents/[name]/+page.svelte` — 4 lines inserted at line 436 between the two trailing `{/if}` markers: `{:else}` keyword + rounded-panel `<div>` wrapper + `<p>` with route-param interpolation + close `</div>`

## Decisions Made
- Used `agentName` (route param `$derived(page.params.name)`) instead of `agent.name` — `agent` is `undefined` in the `{:else}` branch by definition; route param is always defined
- Card panel wrapper using `rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-secondary)] p-6` — matches existing Run Agent / Test Conversations card style
- Color token `text-[var(--color-text-secondary)]` — matches existing agent.description color at line 324
- No `data-testid` — test regex `/not found/i` matches the copy directly
- No Breadcrumb touch — breadcrumb still renders `Agents > nonexistent` outside the conditional

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Preview server rebuild + restart required to surface SUT change**
- **Found during:** Task 1 verification (first `bunx playwright test e2e/agent-detail.spec.ts` run after the edit)
- **Issue:** Initial test run showed :23 still failing on both projects despite a clean 4-line diff to `+page.svelte`. Root cause: a long-running `bun run preview` server (PID 1563110, started 11:23) was serving a baked production bundle from BEFORE the edit. SvelteKit Vite preview does NOT hot-reload; it serves the `build/` output, and `webServer.reuseExistingServer: !process.env.CI` in `playwright.config.ts:36` reused the stale server.
- **Fix:** Killed PIDs 1563110/1563113/1563114 (`bun run preview` process tree), ran `PI_SKIP_INIT=1 bun run build` to regenerate `build/`, started a fresh preview via `PI_SKIP_INIT=1 nohup bun run preview > /tmp/62-04-preview.log 2>&1 &` (PID 2487584).
- **Files modified:** None (operational, not code)
- **Verification:** `curl http://localhost:4173/agents/nonexistent` → HTTP 200; re-ran agent-detail.spec.ts on both projects → :23 now PASSES on chromium (214ms) + mobile-chromium (265ms); stability re-run (`-g "not found"`) on both projects → 2/2 PASS in 2.1s zero flake
- **Committed in:** Operational fix; no commit (no code change). The plan ACTUALLY anticipated this in Task 2 § "Pre-flight: 'restart it after the edit — Phase 61-02 § Rule 3 precedent applies to ANY SUT change'". This deviation is the plan's own escape-hatch firing; logged here for traceability.

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Zero scope creep. The plan correctly anticipated the preview-server staleness in its pre-flight notes; the deviation is its escape-hatch firing on the first verification attempt. Pattern reinforced: Phase 61-02 § Rule 3 ("Preview server rebuild + restart for SUT testid changes") applies to ALL Svelte template-body edits, not just testid additions, because Vite preview serves a baked production bundle.

## Issues Encountered
- Pre-existing out-of-scope failures (NOT touched, NOT regressions): `agent-detail.spec.ts:178` (`Chat and Test buttons remain accessible in edit mode`) fails on both chromium + mobile-chromium with strict-mode collision: `getByRole("button", {name: "Chat"})` resolves to BOTH `<button data-testid="agent-chat-cta">Chat</button>` AND `<button aria-label="Remove Current Chat Model">` (the X button on chat-model chips). This was documented in 62-02 SUMMARY as Cluster B residual; explicitly OUT of scope for 62-04 per plan's success criteria. Deferred to a future test-layer plan (likely a follow-up scope-refinement to `agent-edit-flow.test.fixme` style).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 62-05 (agent-personas-renderer.test) ready to start — orthogonal file scope (`web/src/lib/AgentPersonasRenderer.test.svelte.ts` vs this plan's `+page.svelte`); no overlap.
- agent-detail.spec.ts is now in its final Phase-62 state: 22/24 passing (the 2 remaining failures at :178 are pre-existing out-of-scope Cluster B residuals, NOT 62-04 regressions).
- Pattern documented: future `/resource/[id]` routes with in-memory store lookups should default to including a `{:else}` not-found branch — this gap predated Phase 6 and only surfaced via Phase 60's spec-coverage push.

## Verification Summary

| Layer | Check | Result |
|-------|-------|--------|
| L1 | `bunx playwright test e2e/agent-detail.spec.ts --project=chromium --project=mobile-chromium --reporter=list --workers=1` | 22 passed, 2 failed (:178 pre-existing out-of-scope; :23 NOW PASSES on both viewports) |
| L1 stability | Same as above re-run with `-g "not found"` | 2/2 pass, 2.1s, zero flake |
| L2 baseline preservation | All 11 baseline-passing entries from `web/e2e/agent-detail.spec.ts` still pass | PASS (verified against 62-02 SUMMARY baseline + new :23 pass = net +2 cases) |
| Cross-spec safety | `bunx playwright test e2e/agents-list.spec.ts e2e/agent-chat.spec.ts --project=chromium --project=mobile-chromium` | 34/34 PASS |
| L3 Disposition trailer | `git log -1 --pretty=%B \| grep "Disposition: FIX"` | `Disposition: FIX (product)` present |
| L3 debug citation | `git log -1 --pretty=%B \| grep "Debug: \.planning/debug/agent-detail"` | `Debug: .planning/debug/agent-detail-breadcrumb-strict-mode.md` present |
| L5 playwright.config.ts | `git diff main -- web/playwright.config.ts` | empty |
| L5 api-mocks.ts | `git diff main -- web/e2e/fixtures/api-mocks.ts` | empty |
| L5 agent-detail.spec.ts (this plan must NOT touch) | `git diff HEAD~1 -- web/e2e/agent-detail.spec.ts` | empty |
| L5 +page.svelte (ONLY allowed edit) | `git diff main -- 'web/src/routes/(app)/agents/[name]/+page.svelte'` | 4 lines added ({:else} block); zero other changes |
| Sacred-12-stash | `git stash list \| wc -l` pre + post | 12 → 12 |
| Off-limits parallel file | `web/src/lib/hljs-theme.css` in `git status` | still ` M` (untouched, NOT staged via explicit-path `git add`) |

## Self-Check: PASSED

- Created file `.planning/phases/62-test-debt-agent-personas-specs/62-04-SUMMARY.md` — FOUND (this document)
- Commit `798daa8` (`fix(62-04): add {:else} not-found UI to /agents/[name]/+page.svelte`) — FOUND in `git log --oneline -3`
- 4-line edit in `web/src/routes/(app)/agents/[name]/+page.svelte` at L433-437 — VERIFIED via `git diff main` showing only the addition
- `Disposition: FIX (product)` + `Debug: .planning/debug/agent-detail-breadcrumb-strict-mode.md` trailers — VERIFIED in commit body via `git log -1 --pretty=%B`

---
*Phase: 62-test-debt-agent-personas-specs*
*Completed: 2026-05-13*
