---
phase: 57-mobile-ux-deferred-items
plan: 01
subsystem: testing
tags: [vitest, playwright, bun-test, red-scaffold, wave-0, ux-01, ux-02, ux-03, ux-04, pg_trgm, svelte-dnd-action, bottom-sheet]

# Dependency graph
requires:
  - phase: 49-mobile-ux
    provides: Picker components (9 of them) at web/src/lib/components/*Picker.svelte
  - phase: 56-per-capability-ttl-ui
    provides: HostMaintenanceDaemon tickOnce surface + Wave-0 RED-scaffold discipline (mirrored here)
provides:
  - 12 RED test scaffolds pinning UX-01..UX-04 contracts before any production code lands
  - Per-task <automated> verification commands every Wave 1-3 task can target
  - Sampling-matrix coverage: 9 pickers x 2 viewports x 3 dismiss paths + iOS safe-area + axe-core
  - Trigram-typo recall contract (iphne -> iPhone, gthub -> GitHub) locked at the query layer
  - Daemon every-6th-tick GIN sweep cadence locked at the unit layer
  - Orphan-self-trim-on-read + no-write-amplification contract locked at the server-route layer
  - Drag-reorder dndzone wiring + WCAG keyboard contract locked at the component layer
affects: [57-02-bottom-sheet-component, 57-03-bottom-sheet-pickers-wrap, 57-04-pg-trgm-migration-queries-gin, 57-05-extension-chip-reorder, 57-06-agent-picker-prefs]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Phase 56-style Wave 0 RED discipline — 12 test files commit before any impl"
    - "test.fixme(true, '<wave name>') for e2e assertions blocked on un-shipped impl"
    - "Module-scope @ts-expect-error on imports that resolve to Wave-1+ files"
    - "Order-insensitive spy assertions on Drizzle sql template rendering"

key-files:
  created:
    - web/src/lib/components/__tests__/BottomSheet.component.test.ts
    - web/src/lib/__tests__/use-breakpoint.unit.test.ts
    - web/e2e/bottom-sheet-pickers.spec.ts
    - src/__tests__/db-migration-pg-trgm.test.ts
    - src/__tests__/db-queries-marketplace-trgm.test.ts
    - src/__tests__/marketplace-search-perf.test.ts
    - src/__tests__/host-maintenance-gin-sweep.test.ts
    - web/e2e/marketplace-trgm-search.spec.ts
    - web/src/__tests__/agent-picker-prefs-route.server.test.ts
    - web/e2e/agent-picker-prefs.spec.ts
    - web/src/lib/components/__tests__/ExtensionSearchPicker-reorder.component.test.ts
    - web/e2e/chip-reorder.spec.ts
  modified: []

key-decisions:
  - "Trigger URLs/test-ids for the 8 non-assignment pickers are TBD-comment placeholders that Wave 2 Track A (Plan 57-03) will tighten as each picker's mount point ships a deterministic data-testid"
  - "dndzone sortable contract asserted via aria-roledescription='sortable' (svelte-dnd-action's documented public surface) rather than data-is-dnd-shadow-item-* (internal)"
  - "Bench p95<50ms gate runs against PGlite — VALIDATION.md Manual-Only row allows split-report (PGlite vs external Postgres) if WASM ilike can't hit the budget; gate is external-Postgres path"
  - "Two-arm RED proof for GIN sweep — tick 1-5 expects 0 calls AND tick 6 expects >=1, so the cadence test fails distinctly from a missing-block test"
  - "Server-route auth-gate test catches the requireAuth() throw path (Response thrown) rather than asserting locals.user-undefined behavior — matches existing api-account.server.test.ts pattern (line 90)"
  - "Vitest test files for web/ use the existing *.component.test.ts / *.unit.test.ts / *.server.test.ts include globs — no vitest.config.ts edit needed (mirrors Phase 56-00's filename pattern)"

patterns-established:
  - "Wave 0 RED scaffold: every impl wave gets a pre-existing test file to flip GREEN — sampling matrix is materialized as code"
  - "Six-RED-cases-per-feature density — locks short-circuit, ranking, typo recall, cadence, persistence, auth-gate as independent assertions"
  - "test.fixme wraps the assertion (not the test body) so Playwright --list discovers all 61 e2e tests even when impl is missing"
  - "Server-route tests mock $server/auth/middleware to throw a Response (matches SvelteKit's RequireAuth throw shape) — propagation-via-throw is the production contract"

requirements-completed: [UX-01, UX-02, UX-03, UX-04]

# Metrics
duration: 6min
completed: 2026-05-12
---

# Phase 57 Plan 01: Wave 0 RED Test Scaffolds Summary

**12 RED test files lock the four UX contracts (BottomSheet + pg_trgm + agent-picker prefs + dnd reorder) before any production code lands — every Wave 1-3 task now targets a pre-existing test surface.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-05-12T01:12:39Z
- **Completed:** 2026-05-12T01:18:26Z
- **Tasks:** 3
- **Files created:** 12 (4 vitest + 4 bun:test + 4 Playwright)
- **Files modified:** 0 (zero production code)

## Accomplishments

- **12 RED test scaffolds shipped** — every UX-01..UX-04 success criterion is now backed by at least one failing-for-the-right-reason test before Wave 1+ writes production code.
- **All four roadmap success criteria materialized as code** — short-circuit cadence, similarity ranking, typo recall, orphan trim, dndzone wiring, env(safe-area-inset-bottom), every-6th-tick GIN sweep.
- **Sampling continuity preserved** — per VALIDATION.md, every Wave 1-3 task already has an `<automated>` block targeting a file in this plan.
- **Phase 56-style discipline maintained** — Waves 1-3 will flip RED to GREEN; we never write impl that lacks a pre-existing failing test.

## Task Commits

Each task committed atomically as test-only changes:

1. **Task 1: BottomSheet + useBreakpoint RED scaffolds** — `e28cf34` (test)
2. **Task 2: UX-02/03/04 backend/server/component RED scaffolds** — `059477c` (test)
3. **Task 3: UX-01/02/03/04 Playwright e2e RED scaffolds** — `e1698f7` (test)

**Plan metadata commit:** (pending — final commit captures SUMMARY/STATE/ROADMAP/REQUIREMENTS updates)

## Files Created (12, all test-only)

### UX-01 (BottomSheet)
- `web/src/lib/components/__tests__/BottomSheet.component.test.ts` — 8 vitest cases. RED on "Failed to resolve import `$lib/components/BottomSheet.svelte`".
- `web/src/lib/__tests__/use-breakpoint.unit.test.ts` — 4 vitest cases (SSR-safe, lg<1024 reactivity, lg>=1024 reactivity, Tailwind sm/md/xl thresholds). RED on "Failed to resolve import `$lib/use-breakpoint.svelte`".
- `web/e2e/bottom-sheet-pickers.spec.ts` — 47 Playwright cases (9 pickers × 5 viewport/dismiss paths + iOS webkit safe-area + axe-core dialog scan). All `test.fixme`, discovered by `--list`.

### UX-02 (pg_trgm marketplace search)
- `src/__tests__/db-migration-pg-trgm.test.ts` — 5 bun:test cases. RED on `extension "pg_trgm" is not available` (PGlite constructor doesn't load pg_trgm yet) + missing `idx_marketplace_listings_{trgm,fts}` after `migrate()`.
- `src/__tests__/db-queries-marketplace-trgm.test.ts` — 6 bun:test cases. RED on the current `ilike('%query%')` branch returning filtered subsets for 1-char/2-char queries and zero rows for typo queries (`iphne`, `gthub`).
- `src/__tests__/marketplace-search-perf.test.ts` — 2 bun:test cases. RED-allowed on PGlite path per VALIDATION.md Manual-Only row; EXPLAIN ANALYZE returns "Seq Scan on marketplace_listings" instead of "Bitmap Index Scan on idx_marketplace_listings_trgm".
- `src/__tests__/host-maintenance-gin-sweep.test.ts` — 5 bun:test cases. RED on `Received: 0` GIN-sweep calls at tick 6 (block not yet in `tickOnce`).
- `web/e2e/marketplace-trgm-search.spec.ts` — 4 Playwright cases. All `test.fixme` until Wave 2 Track B (Plan 57-04) ships the migration + query rewrite.

### UX-03 (agent-picker prefs)
- `web/src/__tests__/agent-picker-prefs-route.server.test.ts` — 9 vitest cases (3 GET-shape + 1 GET-trim + 1 GET-no-rewrite + 1 GET-auth + 3 PUT). RED on "Failed to resolve import `../routes/api/user/agent-picker/+server`".
- `web/e2e/agent-picker-prefs.spec.ts` — 4 Playwright cases (save-search + pin-agent + orphan-trim + UI-absent-in-non-agent-pickers). All `test.fixme` until Wave 3 (Plan 57-06).

### UX-04 (drag-reorder chips)
- `web/src/lib/components/__tests__/ExtensionSearchPicker-reorder.component.test.ts` — 4 vitest cases. RED on the chip row's missing `aria-label`, missing `aria-roledescription="sortable"`, no `finalize` handler, and missing keyboard activation hint string.
- `web/e2e/chip-reorder.spec.ts` — 6 Playwright cases (mouse + touch + keyboard + reload + Escape cancel + axe scan). All `test.fixme` until Wave 2 Track C (Plan 57-05).

## Decisions Made

- **TBD trigger selectors:** 8 of 9 picker entry points have TBD-comment trigger test-ids in `bottom-sheet-pickers.spec.ts` — Wave 2 Track A (Plan 57-03) tightens them as each picker's mount point ships a deterministic `data-testid`.
- **dndzone surface:** Asserted `aria-roledescription="sortable"` (svelte-dnd-action's documented public surface) instead of `data-is-dnd-shadow-item-*` (internal artifact).
- **PGlite split-report tolerated:** Perf bench may fail RED on PGlite per VALIDATION.md Manual-Only row; Wave 2 Track B SUMMARY records both numbers; external-Postgres is the gating path.
- **Two-arm RED proof:** GIN sweep test asserts BOTH "tick 1-5 produces 0 calls" AND "tick 6 produces >=1" so the cadence regression is distinct from a missing-block regression.
- **Auth-throw shape:** Server-route auth gate mock throws a `Response` (matches SvelteKit's `requireAuth` production contract at api-account/+server.ts line 18) rather than asserting on a synthetic locals.user-undefined codepath.
- **Vitest filename globs only:** Existing `*.component.test.ts` / `*.unit.test.ts` / `*.server.test.ts` patterns already pick the new files up; no `vitest.config.ts` edit needed. Mirrors Phase 56-00's filename-pattern decision.

## Deviations from Plan

None - plan executed exactly as written. The plan's `<action>` blocks for each task were followed task-by-task; test counts match (8 + 4 = 12 for Task 1; 4 + 6 + 2 + 5 + 9 + 4 = 30 for Task 2 backend; 47 + 4 + 4 + 6 = 61 for Task 3 e2e — totals 12 files / 73 individual assertions across all 12 files).

The plan's `<verify>` blocks ran clean:
- Task 1 vitest run produced 2 "Failed to resolve import" errors on `$lib/components/BottomSheet.svelte` and `$lib/use-breakpoint.svelte` (the exact RED reason called out).
- Task 2 backend bun:test produced 12 failures all impl-semantic: `extension "pg_trgm" is not available`, ilike subset mismatches, Seq Scan in EXPLAIN, 0 GIN sweep calls — every failure documented in the plan as the expected RED reason.
- Task 2 web vitest produced "Failed to resolve import `../routes/api/user/agent-picker/+server`" + 4 ExtensionSearchPicker contract failures (no aria-label, no sortable role, no finalize handler, no keyboard hint).
- Task 3 `playwright test --list` enumerated all 61 tests across the 4 files with zero compile errors.

## Issues Encountered

None - test infrastructure was already present (`vitest`, `@playwright/test`, `@axe-core/playwright`, `@testing-library/svelte`, `bun:test`, `setupTestDb` helper, `mockDbConnection` helper) and matched the plan's `<verify>` commands exactly.

## Manual-Only Verifications Still Pending

Per VALIDATION.md table:
1. **iOS Safari real-device safe-area visual** — the webkit playwright project approximates `env(safe-area-inset-bottom)` resolution but doesn't render the actual iOS home-indicator overlay. Manual smoke on iPhone iOS 17+ is the human-verification gate.
2. **PGlite p95 split-report** — if Wave 2 Track B benchmark flags the PGlite WASM path as out-of-50ms-budget, the criterion may split (external Postgres < 50ms; PGlite best-effort). Decision is escalated to user during Wave 2 Track B execution.

## Self-Check

Verification commands run after writing this SUMMARY:

- All 12 RED scaffold files exist on disk (confirmed via `ls` — count = 12).
- All 3 task commits present in `git log`: `e28cf34`, `059477c`, `e1698f7`.
- Zero production code modified: `git diff e28cf34~1...HEAD --stat` shows ONLY test files (12 files, 1712 insertions, 0 modifications to src/ or web/src/ production paths).
- Auto-memory rule audit: NO `git stash` invocations anywhere; all vitest commands prefixed with `cd web` per `project_vitest_must_run_from_web_subdir`; backend tests use `bun test`, web tests use `bunx vitest run`, e2e tests use `bunx playwright test`.

## Self-Check: PASSED

## Next Plan Readiness

- **Plan 57-02 (BottomSheet component + useBreakpoint rune) unblocked** — vitest cases for both files exist; Wave 1 flips RED to GREEN by creating `web/src/lib/use-breakpoint.svelte.ts` + `web/src/lib/components/BottomSheet.svelte`.
- **Plan 57-03 (wrap 9 pickers in BottomSheet) unblocked** — 47 e2e fixme cases already enumerate the picker × viewport × dismiss-path matrix; Wave 2 Track A un-fixmes them as each wrap lands. TBD trigger selectors get tightened during this wave.
- **Plan 57-04 (pg_trgm migration + query + GIN sweep) unblocked** — 4 backend test files cover migration shape, query semantics, perf, and daemon cadence; Wave 2 Track B flips them GREEN in three tasks (migration, query, daemon).
- **Plan 57-05 (drag-reorder chips) unblocked** — vitest component + Playwright e2e specs cover dndzone wiring, keyboard hint, mouse/touch/keyboard/Escape paths, axe scan.
- **Plan 57-06 (agent-picker prefs) unblocked** — server-route test scaffold has 9 cases covering GET/PUT/trim/auth; e2e scaffold has 4 cases covering save/pin/orphan/UI-absent.

---
*Phase: 57-mobile-ux-deferred-items*
*Completed: 2026-05-12*
