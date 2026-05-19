---
phase: 61-test-debt-followup-feature-rework-specs
verified: 2026-05-13T05:00:00Z
status: passed
score: 7/7 must-haves verified
re_verification: false
human_verification:
  - test: "Read the rewritten mobile-navigation.spec.ts and confirm test cases collectively assert (a) hamburger opens drawer on mobile viewport, (b) Dashboard/Chat/Settings nav links are reachable inside drawer, (c) backdrop click closes drawer."
    expected: "The REWRITE covers all three original-intent behaviors as documented in 61-VALIDATION.md Manual-Only Verifications."
    why_human: "Behavior parity is judgment-based — automated diff can confirm spec passes but not that it captures the original intent of the tab-bar tests."
  - test: "Confirm .planning/phases/59-test-debt-repair/deferred-items.md § Svelte 5 entry was retitled from 'Svelte 5 singleton-store reactivity bug' to 'test-env: missing /api/account mock — 3-line per-test fix shipped in Phase 61, fixmes flipped' with debug-doc citation intact and original entry body preserved."
    expected: "The deferred-items.md retitling is correct, preserves audit trail, and accurately describes the test-env-only verdict."
    why_human: "The audit-trail update is a doc rewrite; correctness of phrasing is judgment-based."
---

# Phase 61: Test Debt Follow-up — Feature-Rework Specs Verification Report

**Phase Goal:** Repair the 7 (now 8) spec files scoped back from Phase 59-06 + the long-tail specs. Each spec gets either a rewrite to match current SUT shape OR a targeted SUT testid expansion + spec update. Un-fixme the 5 theme-sidebar tests using a 3-line `page.route` mock per the Svelte 5 debug doc.
**Verified:** 2026-05-13T05:00:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | All 8 Bucket A spec files are disposed — each is either passing or `test.fixme`'d with UN-BLOCKER comment citing `deferred-items.md` entry | VERIFIED | Layer 3 audit: 8/8 commits with `Disposition:` trailer (`3ae5a2f`, `1b55881`, `c770969`, `dcbd3a2`, `7d5668d`, `2b05dc4`, `345d6c7`, `0ccddaf`). Layer 4 audit: zero `test.fixme` without UN-BLOCKER within 10 lines across all 9 affected specs. |
| 2 | All 5 Bucket B `theme-sidebar.spec.ts` Sidebar describe fixmes are flipped to active passing tests | VERIFIED | `awk '/test\.describe("Sidebar"/,/^test\.describe\(/' ... grep -c test.fixme` returns 0. Helper `mockAccountEndpoints(page)` exists at L135 and is called inline in each of the 5 formerly-fixme'd tests after `mockApi()`. Commit `ea3f8a6`. |
| 3 | The 868+1681 baseline regression invariant remains satisfied — `comm -23` (title-based) from the 1726-line Phase 61 baseline shows only 1 documented pre-existing flake missing | VERIFIED | baseline-passing.txt: 1726 lines at HEAD `6d852cf`. The sole missing entry is `swipe-drawer.spec.ts::Escape closes any open drawer [chromium]` — pre-existing flake confirmed via 5 re-runs against pre-Phase-61 spec content (same symptom). Phase 61 introduced zero SUT or spec changes to SwipeDrawer.svelte. |
| 4 | Svelte 5 reactivity bug verdict is `test-env-only` — no SUT fix required; `mockAccountEndpoints` helper is the fix; deferred-items.md entry retitled | VERIFIED | `deferred-items.md` heading retitled to "test-env: missing /api/account mock — 3-line per-test fix shipped in Phase 61, fixmes flipped". Verdict reclassification paragraph cites `.planning/debug/svelte5-layout-reactivity-2026-05-12.md`. Original entry body preserved under audit-trail header. Commit `784b7ff`. |
| 5 | All SUT changes are non-behavioral `data-testid` attribute additions only — no logic, styling, or import changes | VERIFIED | `git diff 23fefc4..HEAD -- web/src/` filtered for non-testid additions returns empty. 11 SUT files modified: 3 selector wrappers + 7 tool-card variants + 1 settings page expand button — all pure `data-testid` attribute insertions on existing root elements. |
| 6 | No timeout widening; `playwright.config.ts` untouched; `api-mocks.ts` untouched | VERIFIED | `git diff 23fefc4..HEAD -- web/playwright.config.ts` returns 0 lines. Per-spec timeout widening awk scan returns OK for all 9 affected specs. `git diff 23fefc4..HEAD -- web/e2e/fixtures/api-mocks.ts` returns 0 lines. |
| 7 | Sacred-12-stash invariant preserved throughout Phase 61 | VERIFIED | `git stash list | wc -l` = 12 at verification time. All 4 SUMMARYs confirm 12 pre- and post-execution at each plan wave. Zero `git stash` operations performed. |

**Score:** 7/7 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `.planning/phases/61-test-debt-followup-feature-rework-specs/baseline-passing.txt` | ≥1670 lines, `<file>::<line>:<col>::<title> [<project>]` format | VERIFIED | 1726 lines, correct format confirmed on head/mid/tail rows |
| `.planning/phases/61-test-debt-followup-feature-rework-specs/baseline-meta.txt` | `head_sha`, `captured_at`, `git_stash_count_at_capture: 12` | VERIFIED | All required fields present; `git_stash_count_at_capture: 12` confirmed |
| `web/e2e/theme-sidebar.spec.ts` | 0 fixmes in Sidebar describe block; `mockAccountEndpoints` helper at file scope | VERIFIED | awk audit returns 0; helper at L135, called inline in 5 tests after `mockApi()` |
| `web/e2e/selector-keyboard-nav.spec.ts` | Class-based locators replaced with `getByTestId`; REPAIR disposition | VERIFIED | `getByTestId("model-selector").getByRole(...)` etc. present; 9-case FIXME with UN-BLOCKER for chat-page streaming race |
| `web/e2e/command-palette-v2.spec.ts` | Tests navigate to `/extensions` not `/`; REPAIR disposition | VERIFIED | 8 of 10 `goto` calls use `/extensions`; 20/20 passing |
| `web/e2e/tool-card-rendering.spec.ts` | `getByTestId("tool-card-terminal")` etc.; REPAIR disposition | VERIFIED | `tool-card-terminal` locator present; 11-case FIXME with UN-BLOCKER |
| `web/e2e/task-card-actions-full.spec.ts` | `getByTestId("task-card-t-1").getByTitle(...)` scoping; REPAIR disposition | VERIFIED | Scoped lookups via `task-card-{id}` present; 10-case FIXME with UN-BLOCKER |
| `web/e2e/teams.spec.ts` | `getByTestId("team-expand-team-1")` calls; REPAIR + FIXME disposition | VERIFIED | 5 `getByTestId("team-expand-team-1").click()` calls; 11-case FIXME with UN-BLOCKER (two root causes) |
| `web/e2e/swipe-drawer.spec.ts` | Hamburger tests navigate to `/agents`; REPAIR disposition | VERIFIED | 5 `goto("/agents")` calls replacing former `/project/${id}` chat redirects |
| `web/e2e/menu-keyboard-nav.spec.ts` | Sigil `!` used for agent/ext tests; REPAIR disposition | VERIFIED | `typeIntoTextarea(page, textarea, "!")` calls; `![agent\|ext\|team:]` regex patterns |
| `web/e2e/mobile-navigation.spec.ts` | REWRITE Path A — SwipeDrawer behavior; REWRITE disposition | VERIFIED | Top-of-file context block + REWRITE commit body; tests assert hamburger, drawer, panel nav links, backdrop |
| `web/src/lib/components/ModelSelector.svelte` | `data-testid="model-selector"` on root wrapper | VERIFIED | `<div data-testid="model-selector" class="model-selector relative">` |
| `web/src/lib/components/ThinkingLevelSelector.svelte` | `data-testid="thinking-selector"` on root wrapper | VERIFIED | `<div data-testid="thinking-selector" class="thinking-selector relative">` |
| `web/src/lib/components/ModeSelector.svelte` | `data-testid="mode-selector"` on root wrapper | VERIFIED | `<div data-testid="mode-selector" class="mode-selector relative">` |
| `web/src/lib/components/tool-cards/TerminalCard.svelte` | `data-testid="tool-card-terminal"` | VERIFIED | Present on root container |
| `web/src/lib/components/tool-cards/DiffCard.svelte` | `data-testid="tool-card-diff"` | VERIFIED | Present on root container |
| `web/src/lib/components/tool-cards/SearchResultsCard.svelte` | `data-testid="tool-card-search-results"` | VERIFIED | Present on root container |
| `web/src/lib/components/tool-cards/TaskListCard.svelte` | `data-testid="tool-card-task-list"` + `data-testid="task-card-{task.id}"` on rows | VERIFIED | Both testids present — root container + `{#each items as task}` row wrapper |
| `web/src/lib/components/tool-cards/TaskDetailCard.svelte` | `data-testid="tool-card-task-detail"` | VERIFIED | Present on root container |
| `web/src/lib/components/tool-cards/PermissionGate.svelte` | `data-testid="tool-card-permission"` | VERIFIED | Present (renamed from legacy `permission-gate` — zero consumers of old name confirmed) |
| `web/src/lib/components/tool-cards/DefaultCard.svelte` | `data-testid="tool-card-default"` | VERIFIED | Present on root container |
| `web/src/routes/(app)/settings/+page.svelte` | `data-testid="team-expand-{team.id}"` on expand button | VERIFIED | `<button data-testid="team-expand-{team.id}" onclick=...>` at L710 |
| `.planning/phases/59-test-debt-repair/deferred-items.md` | Svelte 5 entry retitled to `test-env:...`; verdict reclassification paragraph; original entry preserved | VERIFIED | Header retitled, "Verdict reclassification (2026-05-13)" paragraph present, debug-doc citation present, original entry preserved under audit-trail header |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `theme-sidebar.spec.ts` Sidebar describe | `page.route("**/api/account", ...)` | `mockAccountEndpoints(page)` called after `mockApi()` | VERIFIED | Helper at L135; 5 inline `await mockAccountEndpoints(page)` calls; Playwright reverse-route-registration ordering respected |
| `selector-keyboard-nav.spec.ts` | `data-testid="model-selector"` on ModelSelector.svelte | `getByTestId("model-selector").getByRole(...)` | VERIFIED | Testid present in SUT; selector used in spec |
| `tool-card-rendering.spec.ts` | `data-testid="tool-card-terminal"` on TerminalCard.svelte | `getByTestId("tool-card-terminal")` | VERIFIED | Testid present in SUT; selector used in spec |
| `task-card-actions-full.spec.ts` | `data-testid="task-card-{task.id}"` on TaskListCard.svelte row | `getByTestId("task-card-t-1").getByTitle("Start task")` | VERIFIED | Testid present in SUT `{#each}` row; scoped selector used in spec |
| `command-palette-v2.spec.ts` | `/extensions` route (pre-mocked by `setupApiMocks`) | `page.goto("/extensions")` | VERIFIED | Route pivot confirmed; 8 goto calls use `/extensions` |
| `teams.spec.ts` | `data-testid="team-expand-{team.id}"` on settings/+page.svelte | `getByTestId("team-expand-team-1").click()` | VERIFIED | Testid present in SUT; 5 click calls use testid |
| `swipe-drawer.spec.ts` hamburger tests | `/agents` non-chat route | `page.goto("/agents")` | VERIFIED | 5 route pivots confirmed; mobile header renders on non-chat routes |
| `menu-keyboard-nav.spec.ts` | `!` sigil → `type=agent|ext|team` in `api/mentions/search` | `typeIntoTextarea(page, textarea, "!")` | VERIFIED | `!` sigil calls present; regex patterns updated for `![agent|ext|team:]` tokens |
| `mobile-navigation.spec.ts` | SwipeDrawer surface at `(app)/+layout.svelte:407-444` | `getByTestId("swipe-drawer")`, `getByTestId("swipe-drawer-panel")`, `getByTestId("mobile-menu-toggle")` | VERIFIED | Top-of-file context block confirms surface pivot; testids are pre-existing (from Phase 59-06) |
| `deferred-items.md` Svelte 5 entry | `.planning/debug/svelte5-layout-reactivity-2026-05-12.md` | "Verdict reclassification (2026-05-13)" paragraph | VERIFIED | Debug-doc path cited; `svelte5-layout-reactivity-2026-05-12` found 3 times in deferred-items.md |

---

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| TEST-02 (residual from Phase 59-06) | 61-00, 61-01, 61-02, 61-03 | 8 deferred specs disposed; 5 Bucket B fixmes flipped; baseline regression invariant maintained | SATISFIED | All 8 specs disposed with Phase 61 commits + Disposition trailers. Theme-sidebar 0 fixmes in Sidebar describe. 1726-line baseline captured; 1 documented pre-existing flake (swipe-drawer Escape chromium). REQUIREMENTS.md TEST-02 row marked Complete 2026-05-13. |
| TEST-06 | N/A | Not added — roadmap's conditional ("TEST-06 covers the Svelte 5 fix IF verdict is `production-bug`") evaluates false; verdict is `test-env-only` | N/A (conditional false) | CONTEXT.md L52 documents this decision. REQUIREMENTS.md has no TEST-06 entry. Correct per design. |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `web/e2e/task-card-actions-full.spec.ts` | 60 | Pre-existing `import "..." from "...shared-utils.js"` Vite-style `.js` import | Info | Pre-existing since initial commit `1e30079`; out of scope for Phase 61; separate `tasks/v1.4-test-file-ts-fixes.md` workstream |
| `web/e2e/menu-keyboard-nav.spec.ts` | 178, 241, 298, 343 | Pre-existing extensions mock missing `ExtensionData` properties | Info | Pre-existing since initial commit `1e30079`; out of scope for Phase 61 per verifier notes |

No blockers. Pre-existing TS diagnostics are out-of-scope per Phase 61 verifier notes.

---

### Human Verification Required

#### 1. mobile-navigation.spec.ts REWRITE intent verification

**Test:** Read `web/e2e/mobile-navigation.spec.ts` top-of-file context block and the rewritten test bodies.
**Expected:** Test cases collectively assert (a) hamburger opens drawer on mobile viewport, (b) Home/Chat/Settings nav links are reachable inside drawer, (c) backdrop click closes drawer. Note: "Dashboard" becomes "Home" per v1.3 navLinks renaming — this is correct per SUMMARY.
**Why human:** Behavior parity between the original tab-bar spec intent and the rewritten SwipeDrawer spec is judgment-based; automated checks can confirm the spec passes (zero failures/timeouts) but cannot confirm coverage equivalence.

#### 2. deferred-items.md retitling correctness

**Test:** Open `.planning/phases/59-test-debt-repair/deferred-items.md` and read the retitled entry under `## 59-06 — Sidebar/Layout + Standalone Cluster (TEST-02)`.
**Expected:** Header reads "test-env: missing /api/account mock — 3-line per-test fix shipped in Phase 61, fixmes flipped". Verdict-reclassification paragraph is present with debug-doc citation. Original entry body ("Discovered: Svelte 5 singleton-store reactivity bug...") is preserved under "Original entry preserved for audit trail:" sub-header.
**Why human:** The audit-trail update is a doc rewrite; correctness and completeness of the phrasing is judgment-based.

---

### Gaps Summary

No gaps. All automated checks passed:
- 8/8 Bucket A specs disposed with Phase 61 commits and `Disposition:` trailers
- 5/5 Bucket B fixmes flipped (Sidebar describe has 0 `test.fixme` markers)
- All `test.fixme` in all 9 affected specs carry UN-BLOCKER comments within 10 preceding lines (Layer 4 clean)
- `playwright.config.ts`, `api-mocks.ts` untouched (Layer 5 clean)
- SUT diffs are purely `data-testid` attribute additions — no logic, styling, or import changes
- Sacred-12-stash invariant preserved throughout Phase 61
- REQUIREMENTS.md TEST-02 marked Complete; TEST-06 correctly not added (conditional false)
- `deferred-items.md` Svelte 5 entry retitled with debug-doc citation and original entry preserved

The two human-verification items are judgment calls about documentation quality and spec coverage equivalence — they cannot block goal achievement but should be confirmed before proceeding to the next phase.

Note on teams.spec.ts "Add member button is disabled" test: this test is active (not fixme'd) and was in `baseline-passing.txt` for `mobile-chromium`. The 61-03-SUMMARY documents it has a chromium-only failure that was preserved because the mobile-chromium variant is in baseline. This is intentional baseline-aware FIXME discipline, not a deficiency.

Note on the 1 pre-existing flake (`swipe-drawer::Escape closes any open drawer [chromium]`): verified pre-existing by 61-03-SUMMARY via 5 re-runs against pre-task-2 spec content. Phase 61 introduced zero changes to SwipeDrawer.svelte. This is acceptable drift per the Layer 2 regression invariant (documented flakes do not count as regressions).

---

_Verified: 2026-05-13T05:00:00Z_
_Verifier: Claude (gsd-verifier)_
