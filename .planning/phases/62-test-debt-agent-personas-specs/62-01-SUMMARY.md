---
phase: 62-test-debt-agent-personas-specs
plan: 01
subsystem: web/e2e (selector-repair)
tags: [test-debt, e2e, selector-repair, agents-list, cluster-a, repair-test-layer]
requirements: [TEST-02]
dependency-graph:
  requires:
    - 61-00-SUMMARY (baseline-passing.txt at HEAD 6d852cf — 16 agents-list entries captured for Layer 2 regression diff)
    - 61-02-SUMMARY (precedent shape: REPAIR test-layer disposition + debug-doc citation + fallback gsd-tools commit path)
    - .planning/debug/agents-list-chips-and-empty-state.md (diagnosis at HEAD 74f28cf — chip-row + EmptyState shape divergence vs Phase 6)
  provides:
    - Cluster A spec #1 (of 3 known clusters across Phase 62) disposed via test-layer REPAIR
    - Pattern: `getByRole("button", { name: "All", exact: true })` for ownership-row disambiguation when both ownership + category chip rows render
    - Pattern: "category clear-button" semantic — `getByRole("button", { name: "All categories" })` for category-row reset clicks
  affects:
    - .planning/phases/62-test-debt-agent-personas-specs (1 of 9 plans landed; Cluster A 1/3 specs disposed)
tech-stack:
  added: []
  patterns:
    - "Spec-only REPAIR: 3 surgical selector edits, zero SUT touches, zero new testids — product UX (Phase 49.2) intentional"
    - "Plan-prescribed locator semantically wrong — caught by Layer 1 verification, auto-fixed via debug-doc alternative (Rule 1 deviation)"
key-files:
  created:
    - .planning/phases/62-test-debt-agent-personas-specs/62-01-SUMMARY.md
  modified:
    - web/e2e/agents-list.spec.ts (commit e30b79b — 3 lines: L17 empty-state copy, L30 no-chip target, L83 category clear-button target)
decisions:
  - "Plan Edit-3 prescription ({ name: 'All', exact: true } for ownership chip) was semantically wrong for line 107's `allBtn.click()` to-reset-filter usage. The ownership 'All' chip is no-op (ownership default already 'all'). Re-targeted `allBtn` to category clear-button per debug-doc §57 alternative ('If the test intends to exercise the category clear-button, target it explicitly'). Line 86 assertion still holds (categories.length > 0 in this case → category clear-button is visible). 11/11 pass."
  - "Disposition: REPAIR (test-layer). Product Phase 49.2 UX behavior (ownership-filter chip row UNCONDITIONAL at +page.svelte:264-280; category chips conditional on `categories.length > 0` at :282-299; `<EmptyState title='No agents configured' ...>` at :327-339) is intentional — Phase 6 tests were stale."
  - "Sacred-12-stash invariant honored throughout (pre: 12, post-commit: 12, post-plan: 12). Zero `git stash` operations performed."
  - "Per-file staging discipline (Phase 61-02 pattern): only `web/e2e/agents-list.spec.ts` staged. Off-limits parallel-session dirty files (`web/src/lib/hljs-theme.css`, `web/e2e/agent-chat.spec.ts`, `web/e2e/agent-detail.spec.ts`, `.planning/ROADMAP.md`, `.planning/STATE.md`) NOT staged."
metrics:
  duration: "~6 minutes (single-task spec-only edit + verify-twice + commit)"
  completed: 2026-05-13
  tasks_completed: 2
  files_created: 1
  files_modified: 1
  atomic_commits: 1
  spec_passing_before: 8 (per baseline-passing.txt unique-title count, 16 entries across 2 projects)
  spec_passing_after: 11 (full spec, --workers=1, both runs identical: 22 entries across 2 projects)
  spec_delta: +3 cases passing (×2 projects = +6 entries)
  flakes_documented: 0 (both verification runs produced identical 22/22 pass)
---

# Phase 62 Plan 01: Agents-List Selector Repair Summary

One-liner: 3 surgical selector edits in `web/e2e/agents-list.spec.ts` align Phase 6 tests with Phase 49.2 UX (always-on ownership-filter chip row + `<EmptyState>` empty-state copy) — 1 atomic commit, 8 → 11 cases passing per project, zero SUT changes, zero new testids.

## What Landed

| Task | Action | Commit | Before | After |
|------|--------|--------|--------|-------|
| 1 | Apply 3 surgical selector edits | `e30b79b` | 8 cases pass | 11 cases pass |
| 2 | Commit with Disposition trailer + debug citation | `e30b79b` | — | — |
| **Combined** | | | **8 / 11 (3 failed)** | **11 / 11 (0 failed)** |

## Before/After Table

| Test | Line | Before | After | Why |
|------|------|--------|-------|-----|
| `shows empty state when no agents` | L17 | `getByText("No agents available.")` | `getByText("No agents configured")` | Phase 49.2 replaced literal `<p>No agents available.</p>` with `<EmptyState title="No agents configured" ...>` at `+page.svelte:328` |
| `no category chips when agents lack categories` | L30 | `getByRole("button", { name: "All" }).not.toBeVisible()` | `getByRole("button", { name: "All categories" }).not.toBeVisible()` | Ownership-filter "All" chip is ALWAYS rendered (no `{#if}` guard at `+page.svelte:264-280`). Test intent is to assert CATEGORY row absent — re-targeted to category clear-button "All categories" at `+page.svelte:288` |
| `category chips appear and filter agents` | L83 | `getByRole("button", { name: "All" })` (ambiguous — strict-mode collision) | `getByRole("button", { name: "All categories" })` (category clear-button) | Plan prescribed `{ exact: true }` to ownership chip, but L107's `allBtn.click()` to-reset-filter usage needs category-state reset (ownership "all" is default no-op). Re-targeted to category clear-button per debug-doc §57 alternative |

## Spec → SUT Impact Table

| Spec | SUT Files Touched | Testid Added | Other Changes |
|------|-------------------|--------------|---------------|
| `agents-list` | (none — pure spec changes; product Phase 49.2 UX intentional) | — | 3 line edits to align selectors with current SUT shape |

## Atomic Commit Audit (1 commit)

```
e30b79b test(62-01): repair agents-list.spec.ts 3 stale selectors vs Phase 49.2 UX
        Disposition: REPAIR (test-layer)
        Debug: .planning/debug/agents-list-chips-and-empty-state.md
```

Commit body cites `.planning/debug/agents-list-chips-and-empty-state.md` for audit-trail traceability.

## Deviations from Plan

### Rule 1 (Bug) — Plan Edit-3 prescription semantically wrong for test L107 usage

The plan claimed Edit 3 should set `const allBtn = page.getByRole("button", { name: "All", exact: true })` with this rationale:

> "The test's downstream uses (line 107's `allBtn.click()` to 'reset filter') are semantically OK with the ownership chip — clicking it doesn't change category state but completes the assertion that an 'All' button is reachable."

**Reality verified by Layer 1 first verification run (10/11 pass, 1 fail on L67 case):**
- L91 clicks `financeBtn` → selects Finance category → only `finance-bot` visible
- L98 clicks `financeBtn` again → deselects Finance → all 3 agents visible
- L104 clicks `engBtn` → selects Engineering category → only `eng-bot` visible
- L107 clicks `allBtn` → MUST reset category filter so L108's `finance-bot` assertion holds
- L108-109 assert `finance-bot` + `eng-bot` BOTH visible (filter cleared)

The ownership "All" chip is no-op here because `ownershipFilter` default is already `"all"` (at `+page.svelte:271`). Clicking it does NOT touch `selectedCategory` state. Result: `eng-bot` stayed filtered, `finance-bot` invisible, L108 timeout fail.

**Resolution:** Per debug-doc §57 alternative ("If the test intends to exercise the category clear-button, target it explicitly as `getByRole('button', { name: 'All categories' })`"), re-targeted `allBtn` to the category clear-button. Both downstream uses now align with test intent:
- L86 `expect(allBtn).toBeVisible()` — category clear-button IS visible (categories.length > 0 in this test's mock data: 2 categories + 1 null-category agent)
- L107 `allBtn.click()` — sets `selectedCategory = null` per `+page.svelte:285` onclick → clears category filter → all 3 agents visible per L108-109

**Layer 1 second run** after fix: 22/22 pass, both runs identical, zero flake.

No other deviations encountered. Rules 2/3/4 not invoked.

## Layer Audits

**Layer 1 (per-spec):** `bunx playwright test e2e/agents-list.spec.ts --project=chromium --project=mobile-chromium --workers=1` → `22 passed (0 failed, 0 timed out)` both runs. Plan's target `11 passed` (per project) met.

**Layer 2 (regression invariant — baseline-passing.txt diff):**
- 16 baseline entries (8 unique cases × 2 projects) from `.planning/phases/61-test-debt-followup-feature-rework-specs/baseline-passing.txt`.
- All 16 entries still passing in post-plan run.
- Net: +6 new passing entries (3 newly-fixed cases × 2 projects: `:13 shows empty state`, `:20 no category chips`, `:67 category chips appear and filter agents`).
- Zero regression.

**Layer 3 (disposition audit):** Commit body contains `Disposition: REPAIR (test-layer)` trailer + `Debug: .planning/debug/agents-list-chips-and-empty-state.md` citation. Verified via `git log -1 --pretty=%B | grep -E "Disposition: REPAIR|Debug:"`.

**Layer 4 (no FIXME added):** This is a pure REPAIR — zero `test.fixme` added. No UN-BLOCKER audit applicable.

**Layer 5 (no widening):**
- `git diff main -- web/playwright.config.ts` → empty
- `git diff main -- web/e2e/fixtures/api-mocks.ts` → empty
- `git diff main -- web/e2e/agents-list.spec.ts` → 3 line edits only (3 insertions, 3 deletions per `git diff --stat`); no `.first()` adds, no timeout widening, no class-based locators, no new testids

**Sacred-12-stash invariant:** Preserved pre-execution (12), post-commit (12), post-plan (12). Zero `git stash` operations performed.

**Off-limits parallel-session dirty files (never staged):**
- `web/src/lib/hljs-theme.css`
- `web/e2e/agent-chat.spec.ts`
- `web/e2e/agent-detail.spec.ts`
- `.planning/ROADMAP.md`
- `.planning/STATE.md`

All confirmed via `git status --short` post-commit showing the same 5 files dirty (column-1 space-M, never column-1 capital-M).

## Hand-off Note for Phase 62 next plans

This plan disposes 1 of 3 Cluster A specs in Phase 62 (`agents-list.spec.ts`). Remaining 8 plans (62-02 through 62-09) handle the rest of the agent-personas spec cluster. Two parallel-session specs (`agent-chat.spec.ts`, `agent-detail.spec.ts`) are dirty in the worktree — those belong to sibling 62-XX plans, not this one.

**Reusable pattern for sibling plans:**
- When a Phase 6-era spec asserts on a string-literal UI that Phase 49.2 (or later) replaced with a component (e.g. `<EmptyState>`), the fix is a single `getByText` swap to the component's `title` prop value — NOT a route pivot, NOT a testid addition.
- When `getByRole` substring-matches collide (e.g. "All" matches both "All" and "All categories"), prefer the more specific name first ("All categories") if the test's downstream semantics require the more specific element. Only fall back to `{ exact: true }` if the test genuinely wants the shorter-named element.
- Verify-twice is non-negotiable: my first run was 10/11 (passed under plan's prescription), but the failing case (`:67`) revealed the plan's semantic misread. Always run the full target spec set twice before commit — flakes can mask real fails, and real fails can be misclassified as flakes.

**Pattern verified safe to copy:** spec-only edits to `web/e2e/<spec>.spec.ts` + commit-by-explicit-file (`git add <single-file>`) avoids touching parallel-session dirty files.

## Self-Check: PASSED

- 1 atomic commit exists: `e30b79b` — verified via `git log -1 --pretty=%H | cut -c1-7`
- 1 modified file: `web/e2e/agents-list.spec.ts` (3 insertions, 3 deletions per `git diff --stat`)
- 8 baseline-passing entries preserved (16 across projects); 6 new passing entries (3 cases × 2 projects)
- 11/11 cases pass per project, both verification runs identical
- 0 `test.fixme` adds, 0 SUT touches, 0 new testids
- 0 timeout widening, 0 `.first()` adds, 0 class-based locator adds
- 0 changes to `web/playwright.config.ts` or `web/e2e/fixtures/api-mocks.ts`
- Sacred-12-stash invariant preserved (12 → 12 → 12)
- Zero touches to `web/src/lib/hljs-theme.css`, `web/e2e/agent-chat.spec.ts`, `web/e2e/agent-detail.spec.ts`, `.planning/ROADMAP.md`, `.planning/STATE.md` during commit (only verification-time state updates land in this plan's final-metadata commit)
- Commit body verified to contain `Disposition: REPAIR (test-layer)` + `Debug: .planning/debug/agents-list-chips-and-empty-state.md`
