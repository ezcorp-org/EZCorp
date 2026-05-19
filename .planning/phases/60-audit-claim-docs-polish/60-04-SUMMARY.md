---
phase: 60-audit-claim-docs-polish
plan: 04
subsystem: docs
tags: [permissions, ui-copy, four-scope-modal, label-rename, atomic-commit]

# Dependency graph
requires:
  - phase: 60-audit-claim-docs-polish
    provides: "Plan 60-03 fixed L29 semantic content of four-scope-modal.md (session-scope row meaning); left L29 label string + L33/L35 label-consistency for this plan to ship atomically with the in-product PermissionGate.svelte:301 rename."
provides:
  - "Permission-modal session-scope button labeled `Allow until restart` (matches engine reality — session = persistent-until-restart per perm-expiry-sweep.ts:489 / permissions.ts:206 / permission-engine.ts:587-590)"
  - "5-site atomic rename: production button + component test title + 3 doc surfaces, all in commit `462fb58`"
  - "tasks/v1.4-retro-claim-gaps.md zero-gap stub (gitignored working state; placeholder for any future audit re-run that surfaces gaps)"
  - "Phase 60 fully complete — both CLAIM-01 (audit doc + PROJECT.md cross-link wiring) and DOCS-01 (semantic + label corrections) closed"
affects:
  - Future permission-modal UI work (label-string contract: `Allow until restart` matches engine state)
  - SEC-06 / SEC-07 v1.5 follow-ups that touch PermissionGate.svelte (testid stays stable; label has been corrected)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Atomic blast-radius commit per renamed string: production code + test title + all doc-surface occurrences in ONE commit, independently revertable as a unit"
    - "Testid-anchored e2e regression guard: label-text changes never touch `getByTestId(...)` — Playwright specs remain stable across copy changes"
    - "Plan-text correction precedent: `bun test ./web/src/__tests__/*.component.test.ts` must use `bunx vitest run` from web/ per project memory `project_vitest_must_run_from_web_subdir.md` (Vitest-only globals like `vi.stubGlobal`)"

key-files:
  created:
    - "tasks/v1.4-retro-claim-gaps.md (gitignored zero-gap stub; placeholder for future gap entries)"
    - ".planning/phases/60-audit-claim-docs-polish/60-04-SUMMARY.md (this file)"
  modified:
    - "web/src/lib/components/tool-cards/PermissionGate.svelte (L301 label string; testid unchanged)"
    - "web/src/__tests__/extension-permission-modal.component.test.ts (L132 test title only; body unchanged — uses testid)"
    - "docs/permissions/four-scope-modal.md (L29 table cell + L33 Deny row + L35 default-focus paragraph)"

key-decisions:
  - "Followed plan literal 5-site rename; no scope creep. All ButtonGroup-overflow micro-adjustments deemed unnecessary after layout analysis (label is 19 chars, shorter than 2 of 4 siblings — `Allow for this conversation` is 27 chars)."
  - "Component test title updated alongside production label (CONTEXT.md Pitfall 3: 'Update test titles in the same commit as the button rename'). Test body unaffected — locates button via `getByTestId('permission-allow-session')`, not text."
  - "Vitest-from-web/ invocation used for the component test (Bun's built-in test runner lacks `vi.stubGlobal`). Plan-text correction per project memory."

patterns-established:
  - "Atomic 5-site rename pattern: locate every surface via blast-radius grep → apply Edit tool with precise context strings → verify zero old hits AND N expected new hits → run testid-based regression guard → ONE commit"
  - "Phase 60 zero-gap-outcome closure pattern: audit doc summary line ('Audited N commits: N invariants-met, 0 gaps') + stub at tasks/ gitignored file is acceptable terminal state; no remediation plans required"

requirements-completed: [DOCS-01, CLAIM-01]

# Metrics
duration: 2m 28s
completed: 2026-05-13
---

# Phase 60 Plan 04: Permission-Modal Label Rename Summary

**Atomic 5-site rename of permission-modal session-scope button text `Allow this time` → `Allow until restart` (production code + component test title + 3 doc surfaces) plus zero-gap stub at tasks/v1.4-retro-claim-gaps.md; Phase 60 fully closed.**

## Performance

- **Duration:** 2m 28s
- **Started:** 2026-05-13T00:44:10Z
- **Completed:** 2026-05-13T00:46:38Z
- **Tasks:** 4 (Task 1 read-only pre-flight grep, Task 2 atomic rename commit, Task 3 gap-stub file creation, Task 4 read-only phase-gate verification)
- **Files modified:** 3 (tracked, in atomic commit) + 1 (gitignored stub)
- **Commits:** 1 atomic rename + 1 plan-metadata final

## Accomplishments

- Permission modal session-scope button now reads `Allow until restart` everywhere (production, test title, all 3 doc surfaces).
- Old label `Allow this time` (which claimed one-call semantics) eliminated from `web/` and `docs/` entirely — engine reality (session = persistent-until-restart) now reflected end-to-end.
- Zero-gap stub at `tasks/v1.4-retro-claim-gaps.md` formalizes the Phase 60 audit terminal state per CONTEXT.md.
- Phase 60 phase-gate verification PASSED: 6/6 audit-doc h3 verdicts present, 6/6 PROJECT.md cross-links resolve to matching `<a id="<sha>"></a>` anchors, zero off-by-one SHA typos (`763d738` / `763d778`) in source-of-truth docs.
- Component test (11 cases) GREEN via `bunx vitest run`; Playwright permission backbone spec 10 passed / 12 skipped (skipped are pre-existing F-trio test.fixme'd per Phase 59-07, unrelated).
- Testid `permission-allow-session` unchanged — all 5 references in `web/e2e/v1.3-permission-backbone.spec.ts` (L336/337/338/339/417) remain stable across the rename, satisfying the testid-stability contract.

## Task Commits

1. **Task 1: Pre-flight collision recheck** — read-only, no commit. Exactly 5 grep hits found, matching RESEARCH.md surface inventory.
2. **Task 2: Atomic rename across 5 sites** — `462fb58` (docs)
3. **Task 3: Gap-list stub** — no commit (file is gitignored under `tasks/`)
4. **Task 4: Phase-gate verification** — read-only, no commit. All automated gate checks GREEN.

**Final commit:** SUMMARY.md + STATE.md + ROADMAP.md + REQUIREMENTS.md plan-metadata commit (next step).

## Files Created/Modified

- `web/src/lib/components/tool-cards/PermissionGate.svelte` (L301) — production button label `Allow this time` → `Allow until restart`; `data-testid="permission-allow-session"` unchanged
- `web/src/__tests__/extension-permission-modal.component.test.ts` (L132) — test title `"Allow this time → POSTs scope='session'"` → `"Allow until restart → POSTs scope='session'"`; body uses `getByTestId('permission-allow-session')` and required no other changes
- `docs/permissions/four-scope-modal.md` (L29, L33, L35) — table row 1 button-label cell + Deny row narrative + default-focus paragraph all rewritten to reference `Allow until restart`
- `tasks/v1.4-retro-claim-gaps.md` (new, gitignored) — zero-gap stub per CONTEXT.md L68 zero-gap-outcome rule

## Decisions Made

- **5-site rename shipped in ONE commit per CONTEXT.md atomic-blast-radius policy.** Surgical 5-line diff (3 files / 5 insertions / 5 deletions), independently revertable as a unit.
- **Test title updated alongside production label.** Per CONTEXT.md Pitfall 3, test titles describing button behavior should track the label. Test body unaffected because it locates the button via stable testid, not text.
- **No ButtonGroup CSS micro-adjustment shipped.** Layout review: `Allow until restart` is 19 chars; sibling `Allow for this conversation` is 27 chars; container is `flex flex-wrap gap-2`. The label fits naturally inside the existing flex-wrap and is shorter than 2 of its 4 siblings. CONTEXT.md "Exact button width / styling tweaks" stayed unused.
- **Vitest-from-web/ invocation used for the component test** (instead of plan's literal `bun test ./web/...` which hits `TypeError: vi.stubGlobal is not a function`). This is the same project-memory pitfall plans 60-01 and 59-03 hit and corrected. Documented as Rule 1 plan-text correction below; test content is GREEN under the correct runner.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Plan-text correction] Vitest runner from web/ subdir, not `bun test` from repo root**
- **Found during:** Task 2 (verification step before commit)
- **Issue:** Plan's literal `bun test ./web/src/__tests__/extension-permission-modal.component.test.ts` invocation throws `TypeError: vi.stubGlobal is not a function` — Bun's built-in test runner does not implement Vitest's `vi.stubGlobal` / `vi.unstubAllGlobals` globals which this component test relies on (L26 + L30). Same pitfall surfaced in plans 60-01 (f6c3790 audit-row verify command) and 59-03 (vitest fallback note); locked in project memory `project_vitest_must_run_from_web_subdir.md`.
- **Fix:** Ran `cd web && bunx vitest run src/__tests__/extension-permission-modal.component.test.ts` instead. Result: 11 pass / 0 fail / 11 expect() calls / 1.04s. Plan task body untouched (only the runner command corrected at execution time).
- **Files modified:** none (verification-command-only correction)
- **Verification:** Both the post-rename pre-commit run AND the post-commit gate-check 2 ran via vitest from web/ — both GREEN.
- **Committed in:** N/A (verification-command correction; not a code change)

**2. [Rule 1 - Plan-text correction] Playwright `-g 'permission-allow-session'` matches zero titles; ran full spec instead**
- **Found during:** Task 2 verification + Task 4 gate check 3
- **Issue:** Plan's literal `bunx playwright test v1.3-permission-backbone.spec.ts -g 'permission-allow-session'` returns "No tests found." because `-g` filters test titles (not testids or test bodies). The 5 testid references on L336/337/338/339/417 are all inside `test.fixme`-gated F-describe tests (lines 248, 346, 422) — the title pattern `permission-allow-session` does not literally appear in any test title.
- **Fix:** Ran full spec instead: `cd web && bunx playwright test v1.3-permission-backbone.spec.ts`. Result: 10 passed / 12 skipped (skipped = pre-existing F-trio fixmes per Phase 59-07, unrelated to this rename). All active testid-based assertions GREEN.
- **Files modified:** none
- **Verification:** Pre-existing skip count matches Phase 59-07 deferred state. No new failures introduced.
- **Committed in:** N/A

---

**Total deviations:** 2 auto-fixed (both Rule 1 plan-text corrections; both verification-command-only — zero functional code changes vs plan body)
**Impact on plan:** Zero scope creep. Both corrections align verification commands with project reality (vitest pitfall + fixme'd tests). The atomic 5-site rename itself executed exactly as written; only the validation invocations were tightened.

## Issues Encountered

- Initial `grep -rn "Allow this time" web/ docs/` returned a 187 KB output dump because `web/build/` contains stale bundled artifacts with the old label. Re-ran with `--exclude-dir=build --exclude-dir=node_modules --exclude-dir=.svelte-kit` to get clean 5-hit surface inventory matching RESEARCH.md. Built artifacts contain pre-rename code by design — a `bun run build` rebuild from `web/` is required for visual verification but is NOT a regression (build artifacts are gitignored and rebuilt per-release).
- Plan 60-02 (parallel executor) committed `6791870` + `6057eb1` to PROJECT.md between this plan's start and its commit. No file overlap — both completed cleanly. Stash count 12 (sacred) preserved across both executors.

## Phase-Gate Verification Outcomes

1. **Doc/grep regression:** zero hits for `Allow this time` in `web/` + `docs/` (excluding build artifacts), zero hits for `763d738` / `763d778` off-by-one typos in source-of-truth docs.
2. **Audit-doc integrity:** `.planning/v1.4-retro-claim-audit.md` exists; 6 per-commit h3 verdicts present; 6 `<a id="<sha>"></a>` HTML anchors match 6 PROJECT.md cross-links by SHA (`cae5c06`, `14b16ca`, `f6c3790`, `7cc5efc`, `b652f2b`, `763d718`).
3. **Component test:** 11 pass / 0 fail (`bunx vitest run` from web/).
4. **Playwright permission backbone spec:** 10 passed / 12 skipped (skipped = pre-existing F-trio fixmes per Phase 59-07).
5. **Manual button-layout check:** PASSED via Claude's Discretion layout review. Label is 19 chars, container is `flex flex-wrap gap-2`, sibling buttons range 12-27 chars — no overflow risk. No micro-adjustment committed.
6. **PROJECT.md cross-link anchor verification:** all 6 SHAs round-trip from PROJECT.md table → audit doc HTML anchor → matching h3 (renderer-independent).

## User Setup Required

None - no external service configuration required. Manual UI verification (open dev server, trigger a permission prompt, visually confirm `Allow until restart` text renders) is the only optional follow-up — automated tests already cover the testid-based regression guard.

## Next Phase Readiness

- Both Phase 60 requirements (CLAIM-01 audit doc + cross-links, DOCS-01 four-scope-modal semantic + label correction) fully closed.
- Phase 60 ready for `/gsd:verify-work` handoff.
- No new blockers introduced. Phase 59 long-tail repair (59-05/07/08) remains the only outstanding v1.4 milestone work; this plan does not interact with that scope.

## Self-Check: PASSED

All claimed files exist on disk; commit `462fb58` exists in git log. Verified by:
- 5/5 file-existence probes (3 modified production files + 1 gitignored stub + this SUMMARY)
- 1/1 commit-hash probe via `git log --oneline --all | grep 462fb58`

---
*Phase: 60-audit-claim-docs-polish*
*Completed: 2026-05-13*
