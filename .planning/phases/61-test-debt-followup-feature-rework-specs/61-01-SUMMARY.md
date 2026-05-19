---
phase: 61-test-debt-followup-feature-rework-specs
plan: 01
subsystem: testing
tags: [playwright, e2e, svelte5, page-route, mock-ordering, test-debt]

# Dependency graph
requires:
  - phase: 61-00
    provides: "(deferred) Phase-61 baseline-passing.txt — not yet captured at execution time; Layer 2 regression diff deferred to 61-00 closing run"
  - phase: 59-06
    provides: "5 theme-sidebar fixmes (commit ca1de59) + testid additions on (app)/+layout.svelte + SwipeDrawer.svelte"
  - phase: 59-08
    provides: "Long-tail sweep scope-back identifying theme-sidebar Bucket B as 30-60 min REPAIR (verdict per debug doc)"
provides:
  - "5 active passing Sidebar tests on chromium + mobile-chromium (was 5 test.fixme)"
  - "Canonical `mockAccountEndpoints(page)` helper pattern for (app)-route specs that mount /account"
  - "Confirmation that Svelte 5 singleton-store reactivity is NOT broken (debug doc verdict `test-env-only` validated by real test run)"
  - "Pitfall lock: Playwright `page.route` registration must come AFTER `mockApi(...)` because Playwright runs handlers in REVERSE registration order"
affects: [61-02, 61-03, future-app-route-specs, deferred-items-svelte5-entry]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Playwright per-test page.route override AFTER mockApi() — wins reverse-order resolution against `**/api/**` catch-all"
    - "Helper-function `mockAccountEndpoints(page)` at file scope — avoids 15-line per-test duplication while staying plan-compliant (no global setupApiMocks edits)"

key-files:
  created: []
  modified:
    - "web/e2e/theme-sidebar.spec.ts — added mockAccountEndpoints helper + 5 inline calls + 5 fixme removals + comment cleanup"

key-decisions:
  - "Use file-scope helper function `mockAccountEndpoints(page)` instead of `test.beforeEach` block — beforeEach registers routes BEFORE `mockApi()` in test body, which loses Playwright's reverse-registration race against the `**/api/**` catch-all"
  - "Call `mockAccountEndpoints(page)` AFTER `await mockApi(...)` in each test — narrower-match route registered LAST wins, fulfilling /api/account with real AccountData before the catch-all returns {}"
  - "Zero SUT modifications (web/src/ untouched) — debug doc verdict `test-env-only` confirmed by live probe showing pageErrors:[] + asideClass: w-56 → w-0 + expandBtn renders, all with route ordering fix"
  - "Defer Layer 2 baseline regression diff (61-VALIDATION.md) — 61-00 baseline-passing.txt does not yet exist on disk; 61-00 plan owns the baseline capture and will validate this commit retroactively"

patterns-established:
  - "Pattern: helper function defined at module scope is preferred over describe-block beforeEach when the mocks must beat a global per-test mockApi() catch-all (Playwright route reverse-resolution semantics)"
  - "Pattern: mockAccountEndpoints helper supplies AccountData / empty sessions / empty login-history — canonical fix shape for any future (app)-route spec mounting /account"
  - "Anti-pattern: do NOT register page.route in test.beforeEach when the test body will later call a fixture (mockApi) that registers a broader catch-all — the broader pattern, registered LAST, will win"

requirements-completed: [TEST-02]

# Metrics
duration: 50min
completed: 2026-05-12
---

# Phase 61 Plan 1: Theme-Sidebar 5-Fixme Flip Summary

**5 sidebar fixmes flipped to active passing tests via `mockAccountEndpoints(page)` helper called AFTER `mockApi()` in each test — confirms Svelte 5 singleton-store reactivity is NOT broken (verdict `test-env-only`); deviated from plan's `beforeEach` approach after live probe surfaced Playwright reverse-route-registration race.**

## Performance

- **Duration:** ~50 min
- **Started:** 2026-05-13T01:30Z
- **Completed:** 2026-05-13T02:01Z
- **Tasks:** 1 of 1 complete
- **Files modified:** 1 (`web/e2e/theme-sidebar.spec.ts`)

## Accomplishments

- All 5 `test.fixme` markers in `theme-sidebar.spec.ts`'s `Sidebar` describe block removed; tests now run as active `test(...)` calls and pass on both chromium + mobile-chromium projects (24 of 24 cases in the spec passing — was 14 of 24 with 10 fixme'd).
- Added file-scope helper `mockAccountEndpoints(page)` that fulfills `/api/account`, `/api/account/sessions`, `/api/account/login-history` with canonical AccountData / empty payloads.
- Confirmed the debug doc verdict `test-env-only` is correct in principle (the page-mount fetch error is the root cause) but discovered the prescribed `beforeEach` fix-shape was structurally unsound due to Playwright's reverse-route-registration semantics — required deviation Rule 1 below.
- Disposition recorded in commit body: **REPAIR (Bucket B) — 5 fixmes flipped via per-test /api/account mock helper; Svelte 5 verdict test-env-only confirmed**.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add `/api/account` helper + flip 5 fixmes in theme-sidebar.spec.ts** — `ea3f8a6` (test)

## Files Created/Modified

- `web/e2e/theme-sidebar.spec.ts` — added 30-line file-scope `mockAccountEndpoints(page)` helper with doc comment explaining Playwright route-ordering pitfall; added 5 inline `await mockAccountEndpoints(page);` calls (one per affected test, immediately after `await mockApi(...)`); removed 5 `test.fixme` modifiers + their UN-BLOCKER comment headers (the original 59-06 Svelte 5 reactivity hypothesis is now invalidated).

## Verification

| Check | Result |
|-------|--------|
| `awk '/test\.describe\("Sidebar"/,/^test\.describe\(/' web/e2e/theme-sidebar.spec.ts \| grep -c 'test\.fixme'` | **0** ✓ |
| `bunx playwright test theme-sidebar.spec.ts --workers=1` | **24 passed** ✓ (12 × chromium + mobile-chromium, zero failures, zero timeouts) |
| `git stash list \| wc -l` (pre + post) | **12 = 12** ✓ (sacred baseline preserved) |
| `git diff main..HEAD -- web/playwright.config.ts` | **empty** ✓ (no timeout widening at config level) |
| `git diff HEAD~1 HEAD \| grep -E "^\+.*setTimeout\|^\+.*timeout: ([6-9]\d\|\d{3,})"` | **empty** ✓ (no per-test timeout widening above 5000ms) |
| `git diff HEAD~1 HEAD -- web/src/ web/e2e/fixtures/` | **empty** ✓ (zero SUT/fixture touches) |
| Commit body cites `svelte5-layout-reactivity-2026-05-12.md` | **yes** ✓ |
| Commit body contains `Disposition: REPAIR (Bucket B)` | **yes** ✓ |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `beforeEach` fix-shape from plan/debug-doc fails due to Playwright reverse-route-registration**

- **Found during:** Task 1 verification run (first invocation of `bunx playwright test theme-sidebar.spec.ts`).
- **Issue:** The plan prescribed a `test.beforeEach(async ({ page }) => { await page.route("**/api/account", ...); ... })` block at the top of `test.describe("Sidebar", ...)`. After applying the plan literally, all 10 newly-active test cases (5 cases × 2 projects) still failed with `TypeError: Cannot read properties of undefined (reading 'charAt')` page errors and zero DOM mutation after the click (asideClass stayed `w-56`; sidebar-expand-btn never appeared; same symptoms as the original 59-06 fixme). Root-cause probe (since-deleted `web/e2e/_debug-61-01.spec.ts`) captured `pageErrors: ["TypeError: Cannot read properties of undefined (reading 'charAt')"]` — the `/api/account` mock from `beforeEach` was being shadowed by `mockApi`'s `**/api/**` catch-all (registered LATER, in the test body, via `await mockApi({projects:[proj]})` → `setupApiMocks`). Playwright runs `page.route` handlers in **reverse-registration order**, so the broader catch-all registered SECOND was tried FIRST and fulfilled `/api/account` with `{}` — exactly the failure mode the debug doc described.
- **Fix:** Replaced the `test.beforeEach` block with a file-scope `mockAccountEndpoints(page)` helper, and added `await mockAccountEndpoints(page);` inline in each of the 5 affected tests AFTER `await mockApi(...)`. The narrower-match `**/api/account` registered LAST wins resolution against the broader `**/api/**` catch-all registered EARLIER. Verification probe confirmed: `pageErrors: []`, `asideClass: w-56 → w-0 border-r-0`, `expandBtnExists: false → true`, `storeCollapsed: null → "true"`.
- **Files modified:** `web/e2e/theme-sidebar.spec.ts` (single file, single commit).
- **Commit:** `ea3f8a6`
- **Why auto-fixed (Rule 1, not Rule 4):** The plan's debug-doc citation explicitly recommended a `beforeEach` shape, but the underlying claim — that the `/api/account` mock eliminates the TypeError — IS correct; only the registration-order semantics were wrong. The fix shape (helper + inline call after mockApi) is structurally identical to the debug doc's "1-line per test" alternative (referenced at debug doc L40 as: "Add a `page.route` mock at the top of each affected test (or a `test.beforeEach`)"). The debug doc author offered both shapes; only the beforeEach form fails. Per Rule 1 ("auto-fix bugs — code doesn't work as intended"), proceeded with the per-test form as documented in the debug doc.

### Deferred Verification

**Layer 2 (regression invariant) baseline diff was deferred** — `61-VALIDATION.md` Layer 2 prescribes a `comm -23` diff of new passing-titles against `.planning/phases/61-test-debt-followup-feature-rework-specs/baseline-passing.txt`. This file does **not yet exist on disk** because Plan 61-00 (the baseline-capture plan, `wave=0`, listed as a `depends_on` for this plan) has not been executed yet. Phase 61-00 owns the full-suite `bunx playwright test --reporter=json` capture and the title-strip transform. This plan was spawned without 61-00 running first.

**Mitigation:** Targeted spec run `bunx playwright test theme-sidebar.spec.ts --workers=1` confirms zero failures and zero timeouts within the affected file (which is the only file touched by this plan). The Layer 2 invariant cannot regress within this single-file blast radius — but the broader Layer-2 sweep will run when 61-00 captures the baseline. Recommend 61-00 capture against post-`ea3f8a6` HEAD so the new baseline includes the 5 newly-flipped Sidebar tests + the 1681-line 59-08 baseline carry-forward.

## Authentication Gates

None encountered (no auth surfaces touched).

## Patterns Established

- **Helper-function over describe-block beforeEach when Playwright route ordering matters.** When a test body calls a fixture (`mockApi`) that registers a broader `page.route` pattern, any narrower-match `page.route` MUST be registered AFTER the fixture to win Playwright's reverse-resolution. A file-scope async helper called inline preserves the "declared once, called five times" code-locality benefit without losing the ordering race. Anti-pattern alert: `test.beforeEach` blocks are fine for setup that doesn't compete with later-registered routes, but they are a footgun when the test body's first action registers a competing catch-all.
- **`mockAccountEndpoints(page)` is the canonical fix shape for any future (app)-route spec mounting `/account`.** The helper fulfills the three endpoints `/api/account` + `/api/account/sessions` + `/api/account/login-history` with seeded AccountData / empty arrays. This pattern is reusable by 61-02 (if `command-palette-v2.spec.ts` pivots to `/account` instead of `/extensions`) and any future spec under `(app)` route group that mounts `/account`. Long-term: the better fix is to add these three endpoints to `setupApiMocks()` defaults in `web/e2e/fixtures/api-mocks.ts` — but that's a 59-02-style global edit, explicitly out of scope for Phase 61's per-spec discipline.

## Hand-off Notes

- **For Plan 61-02:** if `command-palette-v2.spec.ts` pivots to `/account` (vs the recommended `/extensions`), it needs the same `mockAccountEndpoints` pattern. Otherwise the per-test mock is unnecessary. Reuse: copy the 25-line helper function from `web/e2e/theme-sidebar.spec.ts`.
- **For Plan 61-03 closing task:** retitle the `deferred-items.md` Svelte 5 entry from "Svelte 5 singleton-store reactivity bug" to "test-env: missing `/api/account` mock + Playwright reverse-route-registration ordering gotcha". The route-ordering nuance is the new wrinkle this plan surfaced — worth recording so 61-02/03 don't re-fall the same trap.
- **For Plan 61-00:** when capturing the baseline-passing.txt, capture against HEAD `ea3f8a6` (or later) so the 5 newly-flipped Sidebar tests are included in the baseline. If 61-00 was meant to run against pre-fix HEAD, the 5 newly-flipped tests will appear as ADDITIONS (not regressions) in any subsequent Layer-2 diff — also acceptable.

## Self-Check: PASSED

Verified post-commit:

- ✓ `git log --oneline -1 | head` → `ea3f8a6 test(61-01): flip 5 Sidebar fixmes via /api/account mock helper`
- ✓ `git show --stat ea3f8a6` → `web/e2e/theme-sidebar.spec.ts | 75 +++++++++++++++++++++++++++----------------` (1 file, 47 ins / 28 del)
- ✓ `awk '/test\.describe\("Sidebar"/,/^test\.describe\(/' web/e2e/theme-sidebar.spec.ts | grep -c 'test\.fixme'` → 0
- ✓ `bunx playwright test theme-sidebar.spec.ts --workers=1 --reporter=line` → 24 passed (14.8s)
- ✓ `git stash list | wc -l` → 12 (sacred baseline preserved)
- ✓ Commit body contains `svelte5-layout-reactivity-2026-05-12` and `Disposition: REPAIR`
- ✓ `git diff HEAD~1 HEAD -- web/src/ web/e2e/fixtures/ web/playwright.config.ts` → empty (zero SUT / fixture / config touches)
