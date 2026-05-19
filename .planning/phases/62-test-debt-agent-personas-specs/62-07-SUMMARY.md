---
phase: 62-test-debt-agent-personas-specs
plan: 07
subsystem: web-test
tags: [test-debt, coverage, bun-test, source-read, layout, agents-nav-link, phase-6-deliverable, test-add]

# Dependency graph
requires:
  - phase: 62-test-debt-agent-personas-specs
    provides: "62-04 product-fix landed first (Phase 62's only product change); 62-07 is independent test-side coverage with no overlap (different file scope: web/src/__tests__/*.test.ts vs web/src/routes/(app)/agents/[name]/+page.svelte). Wave-3 plan with depends_on: []."
provides:
  - "Source-read coverage on (app)/+layout.svelte Agents nav link policy — pins both ternary branches at lines 190 (group=\"Build\") and 202 (group=\"Platform\")"
  - "Defensive occurrence-count guard: exactly 2 matches of href=\"/agents\" + label=\"Agents\" — catches accidental triple-include regressions"
  - "Phase 6 sub-plan 06-01 deliverable coverage — 1 of 5 Phase 6 coverage gaps closed by Phase 62"
  - "Disposition: TEST-ADD (coverage) trailer — distinct from REPAIR (test-layer) and FIX (product) trailers used elsewhere in Phase 62; reserved for net-new coverage additions"
affects: [62-08, 62-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Source-read test (Phase 49.1 precedent): readFileSync of a .svelte source + literal/regex assertions on raw source — bypasses jsdom + reactive-derive limitations for layout-policy invariants"
    - "Web-directory bun:test convention: web/src/__tests__/*.test.ts files MAY use bun:test (run via `cd web && bun test path`) when the assertion is source-string-based; component/server tests use vitest"

key-files:
  created:
    - web/src/__tests__/app-layout-agents-nav.test.ts
    - .planning/phases/62-test-debt-agent-personas-specs/62-07-SUMMARY.md
  modified: []

key-decisions:
  - "Used bun:test (not vitest) — mirrors the Phase 49.1 precedent file layout-mobile-breakpoint.test.ts that lives in the same web/src/__tests__/ directory; bun:test is appropriate for pure source-string assertions where no Svelte compiler/jsdom is needed"
  - "Used regex .toMatch() (not .toContain()) to allow whitespace flexibility between fields while pinning all three keys (href + label + group) per branch — robust to future indentation changes inside (app)/+layout.svelte without weakening the policy"
  - "Added defensive occurrence-count case (exactly 2) — catches a regression class the per-branch matchers can't: an accidental triple-include where someone copies the Agents link into the trailing spread or admin branch"
  - "Zero SUT touches — pure coverage add; Layer 5 invariant trivially holds"

patterns-established:
  - "TEST-ADD disposition trailer convention: Phase 62 establishes a third trailer disposition alongside REPAIR (test-layer) and FIX (product) — TEST-ADD signals net-new coverage with no behavior change, distinguishing coverage-additions from spec-fixes"

requirements-completed: [TEST-02]

# Metrics
duration: 1min
completed: 2026-05-13
---

# Phase 62 Plan 7: App-Layout Agents Nav Source-Read Test Summary

**Adds 53-line bun:test source-read coverage on (app)/+layout.svelte navLinks pinning the Agents link in both isGlobalProject branches — Phase 6 sub-plan 06-01 deliverable coverage; first net-new TEST-ADD plan of Phase 62**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-05-13T16:03:54Z
- **Completed:** 2026-05-13T16:04:51Z
- **Tasks:** 2 (Task 1 write test + Task 2 commit with Disposition trailer)
- **Files created:** 1 (`web/src/__tests__/app-layout-agents-nav.test.ts`; 53 lines)
- **Files modified:** 0

## Accomplishments
- 53-line `bun:test` source-read test created at `web/src/__tests__/app-layout-agents-nav.test.ts` mirroring the Phase 49.1 precedent (`layout-mobile-breakpoint.test.ts`) exactly: `readFileSync` of `../routes/(app)/+layout.svelte` via `import.meta.url` + literal/regex `.toMatch()` assertions
- 3 test cases pin the Agents nav link policy:
  1. **global-project branch:** regex matches `{ href: "/agents", label: "Agents", group: "Build" }` (line 190 in `+layout.svelte`)
  2. **per-project branch:** regex matches `{ href: "/agents", label: "Agents", group: "Platform" }` (line 202)
  3. **defensive occurrence count:** exactly 2 matches of `href: "/agents", label: "Agents"` — catches accidental triple-include regressions
- 1 atomic commit `5048b32` (Disposition: TEST-ADD (coverage)) — first net-new TEST-ADD trailer in Phase 62, distinct from REPAIR (test-layer) and FIX (product)
- Layer 1 verification: `cd web && bun test src/__tests__/app-layout-agents-nav.test.ts` → `3 pass, 0 fail, 3 expect() calls, 15ms`
- Layer 2 verification: Phase 49.1 precedent file `layout-mobile-breakpoint.test.ts` → `9 pass, 0 fail, 13 expect() calls, 14ms` (no regression in adjacent source-read test)
- Layer 5 verification: `git diff main -- 'web/src/routes/(app)/+layout.svelte'` → empty (zero SUT touches confirmed)
- Sacred-12-stash invariant preserved (12 → 12 → 12); zero `git stash` operations
- Explicit-path `git add web/src/__tests__/app-layout-agents-nav.test.ts` discipline — zero touches to parallel-session dirty file `web/src/lib/hljs-theme.css`

## Task Commits

Each task was committed atomically per plan:

1. **Task 1+2: Write source-read test + commit with Disposition trailer** — `5048b32` (test)

**Plan metadata commit:** (to follow as docs commit after SUMMARY write — `.planning/` is gitignored; uses `git add -f`)

## Files Created/Modified
- **Created:** `web/src/__tests__/app-layout-agents-nav.test.ts` — 53 lines: 21-line block-comment header (Phase-6-deliverable rationale + source-read pattern justification + regression intent) + 3 `describe`/`test` cases asserting on the layout-source string

## Decisions Made
- Used `bun:test` (not vitest) — mirrors Phase 49.1 precedent in the same `web/src/__tests__/` directory; appropriate for source-string-only assertions where no Svelte compiler / jsdom / reactive runtime is needed
- Used regex `.toMatch()` (not literal `.toContain()`) — allows whitespace flexibility between object-literal fields, robust to future indentation changes inside `(app)/+layout.svelte` without weakening the three-key policy (`href` + `label` + `group`)
- Added defensive occurrence-count case (third test) — catches regression class the per-branch matchers can't catch (accidental triple-include or duplicate)
- Zero `data-testid` adds; zero SUT modifications — pure coverage add; Layer 5 invariant trivially holds

## Deviations from Plan

None — plan executed exactly as written. All 3 tests passed first try; pre-flight stash check (12) held throughout; commit trailer landed on first attempt.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration, no environment variables, no manual verification steps.

## Next Phase Readiness
- Plan 62-08 ready to start — Phase 62 has 2 plans remaining (62-08 + 62-09) after this commit.
- Pattern reinforced: `web/src/__tests__/*.test.ts` can use either `bun:test` (source-read / pure-logic) or `vitest` (component / server / jsdom-required) — choice driven by what the test actually exercises.
- TEST-ADD disposition trailer convention established for Phase 62 net-new coverage plans (62-07, plus the remaining TEST-ADD plans in 62-08/62-09 if applicable).

## Verification Summary

| Layer | Check | Result |
|-------|-------|--------|
| L1 | `cd web && bun test src/__tests__/app-layout-agents-nav.test.ts` | 3 pass, 0 fail, 3 expect() calls, 15ms |
| L2 | `cd web && bun test src/__tests__/layout-mobile-breakpoint.test.ts` (precedent sanity check) | 9 pass, 0 fail, 13 expect() calls, 14ms |
| L3 Disposition trailer | `git log -1 --pretty=%B \| grep --line-buffered "Disposition: TEST-ADD"` | `Disposition: TEST-ADD (coverage)` present |
| L5 SUT untouched | `git diff main -- 'web/src/routes/(app)/+layout.svelte'` | empty |
| Must-have artifact line count | `wc -l web/src/__tests__/app-layout-agents-nav.test.ts` | 53 lines (meets plan's min_lines: 40) |
| Must-have artifact `contains` | Test file contains string "Agents" | confirmed (both in assertions and block-comment header) |
| Sacred-12-stash | `git stash list \| wc -l` pre + post | 12 → 12 |
| Off-limits parallel file | `web/src/lib/hljs-theme.css` in `git status` | still ` M` (untouched, NOT staged via explicit-path `git add`) |

## Self-Check: PASSED

- Created file `web/src/__tests__/app-layout-agents-nav.test.ts` — FOUND (53 lines, verified via wc -l)
- Created file `.planning/phases/62-test-debt-agent-personas-specs/62-07-SUMMARY.md` — FOUND (this document)
- Commit `5048b32` (`test(62-07): add app-layout-agents-nav.test.ts source-read assertions on Agents nav link`) — FOUND in `git log --oneline -1`
- `Disposition: TEST-ADD (coverage)` trailer — VERIFIED in commit body via `git log -1 --pretty=%B`
- 3 cases pass on bun:test runner — VERIFIED via Layer 1 (`3 pass, 0 fail`)
- Phase 49.1 precedent file unchanged + still passing — VERIFIED via Layer 2 (`9 pass, 0 fail`)
- Zero SUT changes — VERIFIED via Layer 5 (`git diff main -- '+layout.svelte'` empty)

---
*Phase: 62-test-debt-agent-personas-specs*
*Completed: 2026-05-13*
