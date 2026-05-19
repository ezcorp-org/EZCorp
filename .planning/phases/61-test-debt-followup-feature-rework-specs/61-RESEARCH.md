# Phase 61: Test Debt Follow-up — Feature-Rework Specs — Research

**Researched:** 2026-05-13
**Domain:** Playwright spec repair against current SUT; per-test mock overrides; minimal non-behavioral testid additions
**Confidence:** HIGH (all dispositions cross-verified against actual spec + actual SUT + actual `api-mocks.ts`)

## Summary

Phase 61 closes the residual 8 deferred specs from Phase 59-06 plus the 5 `theme-sidebar.spec.ts` Sidebar-describe fixmes. The Svelte 5 verdict is **`test-env-only`** — there is no SUT reactivity bug; the fix shape is a 3-line per-test `page.route("**/api/account", ...)` mock. The 8 deferred specs split cleanly into REPAIR (5 specs, testid-add + selector-swap), REWRITE (1 spec — `mobile-navigation.spec.ts` against SwipeDrawer, since `(app)/+layout.svelte:407-444` exposes the same Dashboard/Chat/Settings nav links inside the drawer), and case-by-case (1 needs route-pivot, 1 needs mock-shape investigation).

The phase introduces **zero production-code logic changes** — only `data-testid` attributes on existing SUT components (ToolCardRouter children, TaskListCard task wrappers, settings team-expand button, ModelSelector/ThinkingLevelSelector/ModeSelector wrappers). Baseline regression invariant (1678 lines from `baseline-passing.txt`, captured at `head_sha=83781b5d`) is preserved via title-based diff per `deferred-items.md` §150-169.

**Primary recommendation:** Adopt CONTEXT.md's 3-plan structure (61-01 Bucket B fixme flip; 61-02 simple Bucket A — selector-keyboard-nav + command-palette-v2 + tool-card-rendering + task-card-actions-full; 61-03 complex Bucket A — teams + swipe-drawer + menu-keyboard-nav + mobile-navigation). Fold `command-palette-v2.spec.ts` into 61-01 if scope permits (same `/api/account` mock pattern + `(app)`-route pivot); otherwise keep it in 61-02. **Recapture baseline on Phase 61 branch creation** (26 commits since `83781b5d`, including 59-02 api-mocks expansion which raised the line count to 1679–1681 per 59-02 outcome).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Verdict integration — Svelte 5 reclassification (locked 2026-05-13):**
- Roadmap success criterion #3 ("If verdict is `production-bug`: SUT fix + flip 5 fixmes") is **resolved as N/A** because the debug doc verdict is `test-env-only`. Phase 61 still flips the 5 fixmes — but via test-side `/api/account` mocks, NOT a SUT fix.
- **TEST-06 is NOT added** to REQUIREMENTS.md. The roadmap text says "TEST-06 covers the Svelte 5 fix **if the verdict is production-bug**" — that conditional is false. The Bucket B work falls under residual TEST-02.
- **Deferred-items.md must be updated** as part of Phase 61's closing commit to re-categorize the entry from "Svelte 5 singleton-store reactivity bug" to "test-env: missing /api/account mock — 3-line per-test fix shipped in Phase 61, fixmes flipped". This keeps the deferred-items audit trail accurate.

**Per-spec disposition strategy (Bucket A):**
Each of the 8 specs gets ONE of three dispositions, decided **before** the planner writes the per-spec plan task:
- **REPAIR** — Spec maps to current SUT shape with testid additions OR mock-side fixes (≤2 SUT files touched, only testid attributes added, no behavior change) → Update spec to match SUT; add data-testid to SUT where needed; commit atomically.
- **REWRITE** — Feature shape changed (e.g., tab bar → SwipeDrawer); spec needs new test cases against the actual current SUT → Replace spec test bodies; keep file name; reference original intent in commit body.
- **FIXME** — Real product bug surfaced OR requires phase-out-of-scope work → Re-mark `test.fixme` with UN-BLOCKER condition citing `deferred-items.md` entry; file follow-up todo or requirement.

Per-spec verdict is RECORDED in the per-spec plan's `must_haves` field. Order of investigation = cheap-first.
**No timeout widening.** **No global `setupApiMocks()` edits.** Per-test `page.route(...)` overrides only.

**`mobile-navigation.spec.ts` — product question (default Path A REWRITE):**
- Path A — REWRITE: rewrite spec to exercise SwipeDrawer behavior (hamburger → drawer → links inside drawer). Matches the actual shipped product. **Default disposition.**
- Path B — RESTORE + REPAIR: restore the MobileTabBar component. Out of scope for Phase 61 (product/UX decision).
- Planner picks Path A (REWRITE) unless user explicitly redirects during plan review.

**Baseline regression discipline (TEST-02 carry-over):**
- Baseline source: `.planning/phases/59-test-debt-repair/baseline-passing.txt` (1678 lines, captured at `head_sha: 83781b5d` on 2026-05-12). Re-capture on Phase 61 branch creation if `head_sha` has drifted >7 days.
- Diff invariant: zero entries from baseline-passing.txt missing from the new run after each commit. Title-based comparison (see deferred-items §150-169 awk transform).
- Wave-by-wave atomic commits. Per-spec testid SUT additions land in the same commit as the spec they unblock.

**Plan structure (recommended; planner may override):**
- **61-01 — Bucket B: theme-sidebar 5-fixme flip.** Smallest, highest-confidence. Single atomic commit. ~30-60 min.
- **61-02 — Bucket A simple repairs** (selector-keyboard-nav, command-palette-v2, tool-card-rendering, task-card-actions-full). One commit per spec.
- **61-03 — Bucket A complex repairs** (teams, swipe-drawer, menu-keyboard-nav, mobile-navigation). Each lands as its own commit.

**`test.fixme` UN-BLOCKER format (when FIXME disposition is chosen):**
```typescript
// UN-BLOCKER CONDITION: <one-line condition that flips this active>.
// Reference: .planning/phases/59-test-debt-repair/deferred-items.md § <section>
// Filed-on: 2026-05-13 (Phase 61)
test.fixme("...", async ({ page }) => { ... });
```
A FIXME without an UN-BLOCKER comment is treated as a verification failure.

**Commit / branch hygiene (inherited from Phase 59):**
- Branch: `feat/phase-61-test-debt-followup` (or executor convention).
- **No `git stash` operations of any kind** (memory `feedback_agent_briefs_no_git_stash.md`).
- Atomic per-spec commits, independently revertable.
- No `--no-verify`.
- No touching `playwright.config.ts`, `package.json` scripts, or CI yaml.
- Mock-Playwright: `bunx --bun vite preview` on port 4173. `bunx vitest run` from `web/` only (memory `project_vitest_must_run_from_web_subdir.md`); Playwright from `web/` too.

### Claude's Discretion

- Per-spec testid name choices (`data-testid="task-card-{id}"` vs `data-testid="task-card-action-start"` etc.) — picked during execution. Use `getByTestId` exclusively for new selectors; legacy class/role queries only when one-line SUT testid add would be cleanest fix.
- Exact decomposition of per-spec plans (3 recommended; planner may split 61-03 further if 4 complex specs exceed plan-size sanity).
- Whether to apply `/api/account` mock per-test or in `beforeEach` — pick smallest diff.
- Whether `command-palette-v2.spec.ts` shares a commit with Bucket B (same `/api/account` mock + `(app)`-route pivot) — if so, fold into 61-01.
- Order of investigation within 61-03 — cheap-first is heuristic, not contract.
- Whether `test.fixme.describe(...)` block-level skip for `mobile-navigation` Path B vs per-test fixme.

### Deferred Ideas (OUT OF SCOPE)

- **Global `setupApiMocks()` `/api/account` default expansion** — debug doc flags "better long-term fix" but explicitly out of scope. File as 59-02 follow-up.
- **Defensive `account.name ?? "?"` guard in `/account/+page.svelte:308`** — debug doc nice-to-have, unrelated to production behavior. Defer as housekeeping.
- **Svelte 5 `$state.raw()` / `Object.assign` pattern migration** — bug it would fix doesn't exist; permanently deferred.
- **MobileTabBar component restoration** — Path B for Bucket A #1. UX/product decision; out of scope for test-debt repair.
- **7-spec / 8-spec count drift in roadmap text** — Phase 61 plans against 8-file canonical list; closing commit body may include one-line roadmap-text correction.
- **The 868 vs 1678 baseline-figure plan-text correction** (deferred-items.md §138-146) — small doc cleanup; fold into closing commit body if small, otherwise v1.5.
- **Production-code refactors** beyond non-behavioral `data-testid` additions to specific SUT components for Bucket A repairs.
- **`accessibility-mobile.spec.ts` / Section A1** — Phase 49.5 follow-up.
- **`provider-settings.spec.ts` / Section B-PE** — predates v1.3.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **TEST-02** (residual) | 87 chat-page + 13 layout + 3 standalone failing specs repaired via `data-testid` hardening; no per-test timeout widening; all v1.3-passing specs remain green. Residual after Phase 59-06 = 8 deferred specs + 5 `theme-sidebar.spec.ts` Sidebar fixmes. | Each of the 13 dispositions below has a verified fix-shape; baseline-passing.txt (1678 lines) preserved via title-based `comm -23` invariant; SUT changes limited to `data-testid` attribute additions on existing components (zero logic changes). |
| **TEST-06** | NOT added — conditional precondition (`verdict == production-bug`) is FALSE. The Svelte 5 verdict is `test-env-only` per `.planning/debug/svelte5-layout-reactivity-2026-05-12.md`. Roadmap success-criterion #3 (SUT-level fix) is automatically satisfied via N/A path. | Debug doc Resolution section (L118-123): `root_cause: /account/+page.svelte:308 reads account.name.charAt(0)`; `fix: 3-line page.route mock`; `files_changed: [] # diagnosis-only — no SUT change`. |
</phase_requirements>

## Standard Stack

### Core (Bucket B + Bucket A all share)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Playwright | `@playwright/test` (project-current) | E2E test runner, route fulfillment, viewport switching | Already the sole e2e runner; `web/playwright.config.ts` pins chromium + mobile-chromium projects. |
| Bun | 1.3.x | Runtime (`bunx playwright test`) | Per project `CLAUDE.md`; `bun run preview` serves the SUT on `http://localhost:4173`. |
| Svelte 5 | runtime-shipped | Reactive SUT (NOT modified by Phase 61) | Verdict already cleared the engine — only testid attributes touched. |

### Supporting (test-side helpers)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `./fixtures/test-base.js` | local | Provides `mockApi` + `emitWs` fixtures | Every spec — already imported by all 8 deferred specs + theme-sidebar.spec.ts. |
| `./fixtures/data.js` | local | `makeProject`, `makeConversation`, `makeMessage`, `makeAgent`, `makeMode`, `makeExtension`, `makeMember` | When seeding override payloads. |
| `./fixtures/api-mocks.ts` | local | `setupApiMocks` registry + `MockOverrides` shape (188 lines of interface) | Read-only for Phase 61 — global handler additions are out of scope (Phase 59-02 territory). |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Per-test `page.route("**/api/account", ...)` mock (Bucket B) | Extend `setupApiMocks()` default catch-all to include `/api/account` | Out of scope per CONTEXT.md; debug doc flags as 59-02 follow-up. Per-test is surgical and self-contained. |
| Pivot APP_ROUTE from `/account` to a route without page-mount fetch (Bucket B) | 3-line `page.route` mock | Debug doc L54: "Less surgical than the 1-line mock"; would require auditing every `(app)` route for unguarded fetches. Reject. |
| Restore MobileTabBar (Bucket A #1 Path B) | REWRITE spec to SwipeDrawer | Path B is a UX/product decision, not a test-debt repair. Reject for Phase 61. |

**Installation:** None — all dependencies are already in `web/package.json`. No new packages.

## Architecture Patterns

### Recommended Project Structure

```
web/e2e/
├── theme-sidebar.spec.ts          # Bucket B target (5 fixmes in Sidebar describe)
├── mobile-navigation.spec.ts      # Bucket A #1 — REWRITE to SwipeDrawer
├── swipe-drawer.spec.ts           # Bucket A #2 — REPAIR (chat-route flow pivot)
├── menu-keyboard-nav.spec.ts      # Bucket A #3 — INVESTIGATE (mock shape OR fixme)
├── command-palette-v2.spec.ts     # Bucket A #4 — REPAIR (route pivot + /api/account)
├── teams.spec.ts                  # Bucket A #5 — REPAIR (testid on expand button)
├── tool-card-rendering.spec.ts    # Bucket A #6 — REPAIR (per-card-kind testids)
├── task-card-actions-full.spec.ts # Bucket A #7 — REPAIR (task-card wrapper testid)
├── selector-keyboard-nav.spec.ts  # Bucket A #8 — REPAIR (preventative; already green)
└── fixtures/
    ├── api-mocks.ts               # READ-ONLY (Phase 61 boundary)
    ├── data.ts                    # READ-ONLY (factory shapes stable)
    └── test-base.ts               # READ-ONLY (fixture provider)

web/src/lib/components/
├── tool-cards/
│   ├── TerminalCard.svelte        # SUT for tool-card-rendering #6 — testid add
│   ├── DiffCard.svelte            # SUT for tool-card-rendering #6 — testid add
│   ├── SearchResultsCard.svelte   # SUT for tool-card-rendering #6 — testid add
│   ├── TaskListCard.svelte        # SUT for task-card-actions-full #7 — testid add
│   ├── TaskDetailCard.svelte      # SUT for task-card-actions-full #7 — testid add
│   ├── PermissionGate.svelte      # SUT for tool-card-rendering #6 — testid add
│   └── DefaultCard.svelte         # SUT for tool-card-rendering #6 — testid add
├── ModelSelector.svelte           # SUT for selector-keyboard-nav #8 — testid add
├── ThinkingLevelSelector.svelte   # SUT for selector-keyboard-nav #8 — testid add
└── ModeSelector.svelte            # SUT for selector-keyboard-nav #8 — testid add

web/src/routes/(app)/
├── +layout.svelte                 # Untouched by Phase 61 (testids added Phase 59-06)
├── account/+page.svelte:308       # Untouched (root-cause for Bucket B but fix is test-side)
└── settings/+page.svelte:710      # SUT for teams #5 — testid on team-expand button
```

### Pattern 1: Bucket B fix (3-line `/api/account` mock at top of test or beforeEach)

**What:** Add a per-test or per-describe `page.route` mock for `/api/account`, `/api/account/sessions`, `/api/account/login-history` BEFORE the `page.goto(APP_ROUTE)` call.
**When to use:** Every Bucket B fixme'd test. Also applies to `command-palette-v2.spec.ts` if it pivots to `(app)/account` as its APP_ROUTE.
**Example:**
```typescript
// Source: .planning/debug/svelte5-layout-reactivity-2026-05-12.md L42-49
test.describe("Sidebar", () => {
    test.beforeEach(async ({ page }) => {
        // Pre-mount /api/account mock prevents the TypeError in
        // /account/+page.svelte:308 that aborts Svelte 5's effect scheduler
        // (was misdiagnosed as a singleton-store reactivity bug; see
        // .planning/debug/svelte5-layout-reactivity-2026-05-12.md).
        await page.route("**/api/account", (route) =>
            route.fulfill({ json: { id: "u1", email: "test@example.com", name: "Test User", role: "member", createdAt: new Date().toISOString() } })
        );
        await page.route("**/api/account/sessions", (route) => route.fulfill({ json: { sessions: [] } }));
        await page.route("**/api/account/login-history", (route) => route.fulfill({ json: { entries: [] } }));
    });

    test("collapse button hides sidebar", async ({ page, mockApi }) => { // NOTE: test.fixme removed
        await mockApi({ projects: [proj] });
        await page.setViewportSize(DESKTOP_VIEWPORT);
        await page.goto(APP_ROUTE);
        const sidebar = page.getByTestId("desktop-sidebar");
        await expect(sidebar).toBeVisible();
        await page.getByTestId("sidebar-collapse-btn").click();
        await expect(page.getByTestId("sidebar-expand-btn")).toBeVisible();
    });
    // ... 4 more (expand-after-collapse, Ctrl+\, mobile-drawer-opens, mobile-drawer-closes)
});
```

**Discretion (per CONTEXT.md):** `beforeEach` block in `describe("Sidebar")` is recommended (smaller diff than per-test repetition; all 5 affected tests live in same describe at L119).

### Pattern 2: Bucket A `REPAIR` — per-card-kind testid additions (tool-card-rendering #6)

**What:** Add `data-testid="tool-card-{kind}"` to the root container of each card variant in `web/src/lib/components/tool-cards/*.Svelte`. Spec swaps `.bg-gray-900` strict-mode collision queries for `page.getByTestId("tool-card-terminal")` etc.
**When to use:** Whenever the current spec uses class-based selectors that collide post-v1.3-PermissionGate-expansion.
**Example (TerminalCard.svelte):**
```svelte
<!-- Source: web/src/lib/components/tool-cards/TerminalCard.svelte L38 (pre-edit)  -->
<!-- ADD: data-testid="tool-card-terminal" to root <div>  -->
<div data-testid="tool-card-terminal" class="rounded-md border ...">
```
Spec-side swap:
```typescript
// Before: const terminalCard = page.locator(".bg-gray-900");  // strict-mode collision
// After:
const terminalCard = page.getByTestId("tool-card-terminal");
await expect(terminalCard).toBeVisible();
```

**Card-kind testids needed (research-verified):**
| Card | Testid | File |
|------|--------|------|
| TerminalCard | `tool-card-terminal` | `web/src/lib/components/tool-cards/TerminalCard.svelte:38` |
| DiffCard | `tool-card-diff` | `web/src/lib/components/tool-cards/DiffCard.svelte` (root container) |
| SearchResultsCard | `tool-card-search-results` | `web/src/lib/components/tool-cards/SearchResultsCard.svelte` (root) |
| TaskListCard | `tool-card-task-list` | `web/src/lib/components/tool-cards/TaskListCard.svelte:80` |
| TaskDetailCard | `tool-card-task-detail` | `web/src/lib/components/tool-cards/TaskDetailCard.svelte` (root) |
| PermissionGate | `tool-card-permission` | `web/src/lib/components/tool-cards/PermissionGate.svelte` (root) |
| DefaultCard | `tool-card-default` | `web/src/lib/components/tool-cards/DefaultCard.svelte` (root) |

### Pattern 3: Bucket A `REPAIR` — per-task wrapper testid (task-card-actions-full #7)

**What:** Add `data-testid="task-card-{task.id}"` to the `{#each items as task}` row wrapper in `TaskListCard.svelte:118` (and similarly for `TaskDetailCard.svelte`). Spec swaps `page.getByTitle("Start task")` global query for `page.getByTestId("task-card-t-1").getByRole("button", { name: "Start task" })` or `getByTitle("Start task")`.
**When to use:** When multiple task cards render and `getByTitle` collides.
**Example:**
```svelte
<!-- Source: web/src/lib/components/tool-cards/TaskListCard.svelte L118 (pre-edit) -->
{#each items as task}
    <div data-testid="task-card-{task.id}" class="flex items-center gap-2 px-3 py-1.5 text-xs border-b ...">
```
Spec-side scope:
```typescript
// Before: await page.getByTitle("Start task").click();   // strict-mode collision
// After:
await page.getByTestId("task-card-t-1").getByTitle("Start task").click();
```

### Pattern 4: Bucket A `REPAIR` — settings expand-button testid (teams #5)

**What:** Add `data-testid="team-expand-btn-{team.id}"` (or `data-testid="team-name-{team.id}"`) to the team-name button in `web/src/routes/(app)/settings/+page.svelte:710`. Spec swaps `page.getByText("Engineering")` for `page.getByTestId("team-expand-btn-team-1")`.
**When to use:** When the spec's expand assertion fails because clicking `getByText("Engineering")` no longer toggles (or hits a different element after the +115-line settings expansion).
**Example:**
```svelte
<!-- Source: web/src/routes/(app)/settings/+page.svelte:710 (pre-edit) -->
<button onclick={() => toggleTeamExpand(team.id)} class="flex-1 text-left ...">{team.name}</button>
<!-- POST-EDIT: add data-testid="team-expand-btn-{team.id}" -->
```

### Pattern 5: Bucket A `REPAIR` — selector-wrapper testid (selector-keyboard-nav #8 preventative)

**What:** Add `data-testid="model-selector"`, `data-testid="thinking-selector"`, `data-testid="mode-selector"` to the root `<div class="model-selector relative">` (and equivalents) in `ModelSelector.svelte:187`, `ThinkingLevelSelector.svelte`, `ModeSelector.svelte`. Spec swaps `.model-selector button` for `page.getByTestId("model-selector").getByRole("button")`.
**When to use:** Preventative — class-based locators work today but are fragile. Tests are green; risk is regression-only.
**Files (research-verified):**
- `web/src/lib/components/ModelSelector.svelte:187` — `<div class="model-selector relative">` → add `data-testid="model-selector"`
- `web/src/lib/components/ThinkingLevelSelector.svelte` — equivalent wrapper
- `web/src/lib/components/ModeSelector.svelte` — equivalent wrapper

### Pattern 6: Bucket A `REWRITE` — mobile-navigation.spec.ts to SwipeDrawer

**What:** Rewrite all 7 tests in `mobile-navigation.spec.ts` to exercise SwipeDrawer behavior instead of the removed tab-bar. The current `(app)/+layout.svelte:407-444` exposes a `<SwipeDrawer ariaLabel="Mobile navigation">` containing `<ProjectRail />` + the same `navLinks` array (Dashboard / Chat / Settings / etc.).
**When to use:** Mobile-navigation tab-bar feature was removed in v1.3; tests must exercise current UI.
**Example rewrite (test "mobile tab bar is visible on project page" → "mobile drawer opens via hamburger and shows nav links"):**
```typescript
test("mobile drawer opens via hamburger and shows nav links", async ({ page, mockApi }) => {
    const proj = makeProject();
    await mockApi({ projects: [proj] });
    await page.goto(`/project/${proj.id}`);

    const hamburger = page.getByTestId("mobile-menu-toggle");
    await expect(hamburger).toBeVisible();
    await hamburger.click();

    const drawer = page.getByTestId("swipe-drawer");
    await expect(drawer).toBeVisible();

    const panel = page.getByTestId("swipe-drawer-panel");
    // navLinks at (app)/+layout.svelte:184-208 include Dashboard, Chat, Settings
    await expect(panel.getByRole("link", { name: "Home" })).toBeVisible();
    await expect(panel.getByRole("link", { name: "Chat" })).toBeVisible();
    await expect(panel.getByRole("link", { name: "Settings" })).toBeVisible();
});
```
**Path A feasibility (research-verified):** `(app)/+layout.svelte:407-444` exposes:
- `<SwipeDrawer ariaLabel="Mobile navigation">` (matches the spec's existing `nav[aria-label="Mobile navigation"]` query if re-anchored to the SwipeDrawer dialog).
- `<ProjectRail />` + `navLinks` array containing Home / Chat / Settings / Marketplace / etc. — the same set the original spec asserted.
- Testid surface: `swipe-drawer`, `swipe-drawer-panel`, `swipe-drawer-backdrop` (per `SwipeDrawer.svelte:207,219,231`).

**REWRITE is FEASIBLE.** Path B (RESTORE MobileTabBar) is unnecessary.

### Pattern 7: Bucket A `REPAIR` (route pivot) — command-palette-v2.spec.ts

**What:** Pivot tests that visit `/` (no `aside`) to an `(app)` route (e.g. `/account`). Apply the Bucket B `/api/account` mock if pivoted to `/account`. Use testid selectors for the palette button (sidebar `title="Command palette (Ctrl+K)"` button at `(app)/+layout.svelte:247`).
**When to use:** Tests asserting `page.locator("aside h1")` on a route without `aside` — same root cause as theme-sidebar.spec.ts pre-Phase 59-06 fix.
**Affected tests in command-palette-v2.spec.ts:** L16-23 (root), L35-46 (root), L48-62 (root), L64-73 (root), L75-89 (root), L91-109 (root), L126-139 (`/extensions` — different route, may not need pivot).
**Discretion (per CONTEXT.md L131):** If 61-01 grows the `/api/account` `beforeEach` describe, fold this spec into 61-01 since 6 of its 10 tests already share the same fix shape.

### Pattern 8: Bucket A `REPAIR` (route pivot) — swipe-drawer.spec.ts

**What:** Tests like "mobile: hamburger opens left drawer with SwipeDrawer" navigate to `/project/${proj.id}` which redirects to `/project/${proj.id}/chat`. On chat routes (`isChatRoute = true` per `(app)/+layout.svelte:142`), the mobile header (`Open menu` hamburger) is HIDDEN (the `{#if !isChatRoute}` block at L360). Only the chat-page-internal "Back to project menu" button can open the project rail drawer.
**Fix-shape:** Navigate hamburger-flow tests to a NON-chat route (e.g., `/project/${proj.id}/settings` or `/agents`) so the mobile header renders. OR rewrite to use chat-route equivalent button.
**When to use:** Tests #1-4 in `swipe-drawer.spec.ts` (mobile hamburger). Tests #5-7 (`Open conversations` hamburger) ALREADY use chat route, which is correct.
**Affected tests:** L46-61 (`mobile: hamburger opens`), L63-76 (backdrop close), L78-92 (nav link close), L94-109 (Escape close).
**Verified:** `(app)/+layout.svelte:142` `let isChatRoute = $derived(page.url.pathname.includes('/chat'));` and L360 `{#if !isChatRoute}` gates the mobile header.

### Pattern 9: Bucket A `INVESTIGATE` — menu-keyboard-nav.spec.ts

**What:** Tests seed `extensions: [{name, description, enabled}]` (non-`ExtensionData` shape; ad-hoc). The mention-search mock at `api-mocks.ts:1280` consumes `extensions.map((e: any) => ({ name: e.name, description: e.description ?? "", kind: "extension" }))` — so the ad-hoc shape SHOULD work.
**Hypothesis:** The "No matches found" failure may be from the `agents` array NOT being seeded (test passes `agents` correctly but the popover-list shows mention items via `#mention-item-0`). Confirm root cause by running ONE test (`Tab selects the first highlighted mention item`) in isolation against current `main` HEAD before classifying. Likely outcomes:
- **REPAIR (most likely):** A test-side seed shape or timing issue (e.g. `extensions` array filtered out for `type=ext` queries due to `type !== "agent" && type !== "team"` gate at L1280 — works correctly, but `type` query param is set based on user typing `@ext:anal` etc.).
- **FIXME:** If the mention-search mock genuinely returns empty for valid seeded data due to a missed branch.

**Recommended approach:** Add menu-keyboard-nav to 61-03 with an `INVESTIGATE` first task; classify in-flight. Most likely outcome: REPAIR via per-test mock override or spec timing fix.

### Anti-Patterns to Avoid

- **`{ timeout: 60_000 }` widening to dodge a real bug:** Carry over from Phase 59 discipline. CONTEXT.md L70: "A `waitForResponse` timeout that surfaces during repair is fixed by finding the missing/misnamed handler, not by raising the 30s default."
- **Global `setupApiMocks()` edits:** Out of scope. Per-test `page.route(...)` overrides only (CONTEXT.md L71).
- **`getByTitle` on shared icons:** Strict-mode collision when multiple cards render. Use scoped testid lookup (`getByTestId("task-card-t-1").getByTitle("Start task")`).
- **Class-based locators (`.bg-gray-900`, `.model-selector button`):** Fragile to CSS refactors. Use `getByTestId` exclusively for new selectors.
- **`page.locator('text=...').first()`:** Hides strict-mode collisions. Add testid and re-anchor instead.
- **`test.fixme` without UN-BLOCKER comment:** Verification failure per CONTEXT.md L115. Every FIXME must cite a deferred-items entry + filed-on date.
- **`git stash` of any kind:** Memory `feedback_agent_briefs_no_git_stash.md`. Two incidents (2026-05-03, 2026-05-06). Use `git worktree add` for parallel work instead.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-test `/api/account` mock seed | Custom global default in `setupApiMocks()` | Per-test `page.route("**/api/account", ...)` fulfillment | CONTEXT.md L71 — Phase 59-02 owns the global registry; if missing handler surfaces, file follow-up todo. |
| Mobile tab-bar test surface | Resurrect MobileTabBar component | REWRITE spec against existing SwipeDrawer | SwipeDrawer at `(app)/+layout.svelte:407-444` already exposes the same Dashboard/Chat/Settings nav links. Restoring MobileTabBar is a product/UX decision, not test-debt repair. |
| Baseline drift diff | Raw `comm -23 baseline-passing.txt new-passing.txt` (line-based) | Title-stripped `comm -23 baseline-titles.txt new-titles.txt` | When a spec file is edited (lines shift), naive line diff flags every shifted entry as "regressed" (false positive). Canonical awk transform in deferred-items.md §150-169. |
| Bucket B route pivot | Switch APP_ROUTE from `/account` to `/extensions/author` | 3-line `page.route` mock at top of describe | Debug doc L54: "Less surgical than the 1-line mock" + every alternative `(app)` route must be audited for unguarded page-mount fetches. |
| Test infrastructure changes | Edit `playwright.config.ts` (timeout, retries, workers) | Per-test surgical fixes (mock or selector) | CONTEXT.md L124. Phase 59 discipline carries over. |

**Key insight:** Phase 61 is a **test-only repair phase with minimal non-behavioral SUT testid additions**. Every fix-shape exists in Phase 59-06's playbook (testid hardening, route pivot, per-test mock override). There are zero new mechanisms to invent.

## Common Pitfalls

### Pitfall 1: Pre-mount fetch errors abort Svelte 5 effect scheduler
**What goes wrong:** A test navigates to an `(app)` route that does an unguarded `fetch()` in `onMount`. The api-mocks default catch-all returns `{}`, so the SUT reads `data.name.charAt(0)` and throws. Svelte 5's effect scheduler enters error state — click handlers run, but DOM updates don't render.
**Why it happens:** Misdiagnosed in Phase 59-06 as "Svelte 5 reactivity bug"; root cause is the SUT-side unguarded property access.
**How to avoid:** Before navigating to any `(app)` route in a test, audit `+page.svelte`'s `onMount` block. If it fetches a route NOT mocked in `api-mocks.ts`, add a per-test `page.route` mock.
**Warning signs:** Click flips `localStorage` but DOM doesn't update; `page.on("pageerror")` captures `TypeError: Cannot read properties of undefined (reading 'charAt')`.

### Pitfall 2: `(app)` route audit needs to extend beyond `/account`
**What goes wrong:** Future specs hit the same Pitfall 1 against other `(app)` routes (per debug doc L23-33 list: `/admin/moderation`, `/admin/dashboard`, `/audit`, `/observability`, `/agents`, `/extensions`, `/marketplace`, `/docs`, `/runs/[id]`, `/settings`, `/project/[id]/settings`, `/project/[id]/chat`, `/pipelines/[name]`, `/memories`).
**Why it happens:** Each `(app)` route has its own `onMount` fetches. The 3-line `/api/account` mock fixes one route; other routes need their own mock when used as test entry points.
**How to avoid:** Use `(app)` routes that ALREADY have endpoints mocked by `setupApiMocks` (e.g. `/extensions`, `/marketplace` — verified passing in `account-page.spec.ts`/`account-sessions.spec.ts`) as test entry points where possible. When pivoting `command-palette-v2.spec.ts`, prefer `/extensions` (already mocked) over `/account` (needs the 3-line addition).
**Warning signs:** Page mounts but assertion times out at 5s with "No matches" / empty UI.

### Pitfall 3: `isChatRoute` derived guard hides mobile header on `/chat/*`
**What goes wrong:** Tests like `swipe-drawer.spec.ts` "mobile: hamburger opens" navigate to `/project/${id}` which **redirects** to `/project/${id}/chat`. On chat routes, `(app)/+layout.svelte:360 {#if !isChatRoute}` hides the mobile header. The hamburger button never renders. Test times out trying to click `Open menu`.
**Why it happens:** `(app)/+layout.svelte:142 let isChatRoute = $derived(page.url.pathname.includes('/chat'));`. Chat routes use the in-page "Back to project menu" button instead of the global hamburger.
**How to avoid:** Either (a) navigate hamburger tests to a non-chat route (e.g. `/agents`, `/settings`, `/extensions`); OR (b) rewrite to use the chat-route equivalent (chat-page-internal back button — fragile, prefer (a)).
**Warning signs:** Test fails with "Locator 'role=button[name=Open menu]' is hidden" or timeout waiting for visible.

### Pitfall 4: `getByText(team.name)` on settings page is the actual expand button — but only if the click HANDLER fires
**What goes wrong:** `teams.spec.ts` expects `page.getByText("Engineering").click()` to expand the team and show members. In v1.3+, the team-name IS the expand button (`+page.svelte:710` — `<button onclick={() => toggleTeamExpand(team.id)}>{team.name}</button>`). However, `getByText` might match a non-button ancestor (parent `<div class="flex items-center gap-3">`) and the click doesn't fire the handler.
**Why it happens:** Playwright's `getByText` resolves to whatever element wraps the text. If the parent layout container also matches, strict mode may pick the wrong node.
**How to avoid:** Add `data-testid="team-expand-btn-{team.id}"` to the button. Spec uses `page.getByTestId("team-expand-btn-team-1").click()`.
**Warning signs:** Expand assertion ("Members" heading visible) times out; the click landed on the container, not the button.

### Pitfall 5: Baseline regression diff is line-fragile
**What goes wrong:** `baseline-passing.txt` format is `<file>::<line>:<col>::<title> [<projectName>]`. When a spec file is edited (lines shift), naive `comm -23 baseline-passing.txt new.txt` flags every shifted entry as "regressed" (false positive — the test still passes, just at a new line).
**Why it happens:** Line numbers are unstable identifiers; titles are stable.
**How to avoid:** Use the title-based awk transform per deferred-items.md §150-169:
```bash
awk -F'::' '{n=split($3, parts, " \\["); print $1 "::" parts[1] " [" parts[2]}' \
    baseline-passing.txt > baseline-titles.txt
# Same transform for new run, then comm -23 baseline-titles.txt new-titles.txt
```
**Warning signs:** Diff returns dozens of "missing" entries that all map to specs you edited.

### Pitfall 6: Baseline source freshness — 26 commits since capture
**What goes wrong:** `baseline-passing.txt` was captured at `head_sha=83781b5d` on 2026-05-12. Today is 2026-05-13 (1 day drift), but **26 commits have landed** between then and now, including `1c43e0c` (api-mocks +14 v1.3 handlers from 59-02) and `ca1de59` (Phase 59-06 testid additions). Per 59-02 outcome (STATE.md L146), the post-59-02 line count is 1679–1681 (up from 1678).
**Why it happens:** Phase 61 starts after Phase 59 partial completion (5/8 plans done). Baseline reflects pre-59-02 state.
**How to avoid:** **Recapture baseline on Phase 61 branch creation** using the canonical jq selector from `baseline-meta.txt` notes:
```bash
bunx playwright test --reporter=json | jq -r '.. | objects | select(has("specs")) | .specs[]? | . as $spec | $spec.tests[]? | select(.results[]?.status == "passed") | "\($spec.file)::\($spec.line):\($spec.column)::\($spec.title) [\(.projectName)]"' | sort -u > .planning/phases/61-test-debt-followup-feature-rework-specs/baseline-passing.txt
```
Capture metadata to `61-baseline-meta.txt` (head_sha, captured_at, line count, run duration). Use the new baseline for all Phase 61 diff invariants. Inheriting `83781b5d` baseline risks false regressions from the 26-commit gap.
**Warning signs:** First wave-merge diff reports 50+ "missing" entries that map to specs unrelated to Phase 61's edits.

### Pitfall 7: `extensions: [...]` shape mismatch silently degrades mention search
**What goes wrong:** `menu-keyboard-nav.spec.ts` seeds `extensions: [{name, description, enabled: true}]` — ad-hoc shape. The api-mocks search mapper at L1280 uses `(e: any) => ({ name: e.name, description: e.description ?? "" })` — works structurally, but the `/api/extensions` GET at L888 expects full `ExtensionData` shape. If a test asserts on `/api/extensions` results, the ad-hoc shape may not match.
**Why it happens:** TypeScript widens `extensions?: ExtensionData[]` to structural any via the `as any` cast at L1280.
**How to avoid:** When testing mention-search, the ad-hoc shape works. When testing `/api/extensions` list-route consumers, use `makeExtension()` factory. Verify mention-search returns expected items via direct `page.evaluate(() => fetch('/api/mentions/search?type=ext&q=').then(r => r.json()))` probe during INVESTIGATE phase.
**Warning signs:** Mention popover renders "No matches found" with seeded data; the search-mock receives the request but returns empty.

## Code Examples

Verified patterns from existing Phase 59-06 deliverables + reference test fixtures:

### UN-BLOCKER comment shape (canonical reference)
```typescript
// Source: web/e2e/v1.3-permission-backbone.spec.ts:1038-1051
// UN-BLOCKER CONDITION — flip `test.fixme` → `test` when:
//   1. Playwright fixture seeds an audit_log row visible to
//      `listExpiredGrantsForExtension` (currently the mockApi
//      fixture only seeds the SvelteKit handler-level fixture, not
//      the DB the handler reads through), OR
//   2. The `/api/extensions/[id]/expired-grants` route gains a
//      test-only request header (e.g. `x-ezcorp-test-fixture`) that
//      bypasses the DB read and returns the route fixture payload.
test.fixme(
    "open modal → pick 7d → Approve → banner shows new TTL",
    async ({ page, mockApi }) => { ... }
);
```

### Title-based baseline diff (canonical workaround)
```bash
# Source: .planning/phases/59-test-debt-repair/deferred-items.md §160-164
awk -F'::' '{n=split($3, parts, " \\["); print $1 "::" parts[1] " [" parts[2]}' \
  baseline-passing.txt > baseline-titles.txt
awk -F'::' '{n=split($3, parts, " \\["); print $1 "::" parts[1] " [" parts[2]}' \
  new-passing.txt > new-titles.txt
comm -23 <(sort -u baseline-titles.txt) <(sort -u new-titles.txt)
# Expected output: empty (zero regressions)
```

### Per-test page.route mock (Bucket B canonical fix)
```typescript
// Source: .planning/debug/svelte5-layout-reactivity-2026-05-12.md L42-49
await page.route("**/api/account", (route) =>
    route.fulfill({
        json: {
            id: "u1",
            email: "test@example.com",
            name: "Test User",
            role: "member",
            createdAt: new Date().toISOString(),
        },
    }),
);
await page.route("**/api/account/sessions", (route) =>
    route.fulfill({ json: { sessions: [] } }),
);
await page.route("**/api/account/login-history", (route) =>
    route.fulfill({ json: { entries: [] } }),
);
```

### Splash overlay wait helper (Phase 59-06 carry-over for any (app)-route test)
```typescript
// Source: web/e2e/theme-sidebar.spec.ts L109-117
// The (app) layout shows a full-viewport `#splash` overlay (z-index 9999)
// until onMount removes it. Wait for splash detach so clicks reliably land.
async function waitForSplashGone(page: import("@playwright/test").Page) {
    await page.waitForFunction(() => !document.getElementById("splash"), undefined, { timeout: 5000 });
}
```

### Viewport-aware testid disambiguation (when SUT renders TWICE)
```typescript
// Source: web/e2e/theme-sidebar.spec.ts L19-24
// ThemeToggle is rendered TWICE (desktop-sidebar AND mobile-header).
// Resolve to visible instance based on viewport — avoids `.first()` while
// resolving strict-mode collision.
function themeToggle(page: import("@playwright/test").Page) {
    return page.locator(
        "[data-testid='desktop-sidebar']:visible button[aria-label='Toggle theme']," +
        " [data-testid='mobile-header']:visible button[aria-label='Toggle theme']"
    );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Class-based locators (`.bg-gray-900`, `.model-selector button`) | `getByTestId(...)` | Phase 59-06 (theme-sidebar.spec.ts repair) | Strict-mode collisions resolved; refactor-resilient. |
| Line-based baseline diff (`comm -23 baseline.txt new.txt`) | Title-based diff (awk-stripped) | Phase 59-06 (deferred-items.md §150-169) | False-positive shifted-line "regressions" eliminated. |
| Global `setupApiMocks()` extension for new endpoints | Per-test `page.route(...)` override | Phase 59 discipline (CONTEXT.md L71) | Surgical, no spec contagion; new endpoint defaults go through Phase 59-02 audit gate. |
| `MobileTabBar` (separate `nav[aria-label="Mobile navigation"]`) | `<SwipeDrawer ariaLabel="Mobile navigation">` (overlay) | v1.3 (Phase 49.1 mobile-responsive sidebar) | Drawer is the SUT; tab-bar tests are stale-feature, not stale-locator. |
| Mobile header always visible | `{#if !isChatRoute}` gates mobile header | v1.3 (chat routes use in-page back button) | Hamburger tests must navigate to non-chat routes. |

**Deprecated/outdated:**
- `nav[aria-label="Mobile navigation"]` as a direct tab-bar query — the aria-label moved to SwipeDrawer; tab-bar component is gone.
- `page.locator("aside h1")` on `/` (landing page) — `/` is `+page.svelte` outside `(app)`, has no `aside`. Pivot to `(app)` route.

## Open Questions

1. **Should `command-palette-v2.spec.ts` fold into 61-01 (Bucket B) or stay in 61-02?**
   - What we know: 6 of 10 tests visit `/` and assert `aside h1`. If pivoted to `/account`, they need the same `/api/account` mock as Bucket B. If pivoted to `/extensions` (already mocked by `api-mocks.ts`), they don't need extra mocks.
   - What's unclear: Whether pivoting all 10 tests to a single `(app)` route (`/extensions`?) yields a smaller diff than folding into Bucket B's `/api/account` mock.
   - Recommendation: Pivot to `/extensions` (cleaner — no per-test mock needed since `/api/extensions` is already mocked by `setupApiMocks` at `api-mocks.ts:888`). Keep in 61-02. **CONTEXT.md leaves this as Claude's discretion (L131); recommended split favors 61-02 standalone over 61-01 fold.**

2. **menu-keyboard-nav.spec.ts root cause — mock-shape or real SUT bug?**
   - What we know: api-mocks.ts L1280 accepts the ad-hoc `{name, description, enabled}` extension shape structurally.
   - What's unclear: Whether the "No matches found" surface is from a timing issue, a `type` query-param mismatch, or a real mention-search bug.
   - Recommendation: Add an INVESTIGATE first task to the 61-03 plan that runs ONE test in isolation against current `main` HEAD with `--trace=on` and captures the `/api/mentions/search` request/response. Classify after evidence.

3. **Should baseline recapture be its own commit / wave?**
   - What we know: `baseline-passing.txt` (1678 lines, head_sha 83781b5d) is 26 commits stale, including Phase 59-02 expansions (1679–1681 per 59-02 outcome).
   - What's unclear: Whether Phase 61 inherits `83781b5d` baseline (risking false regressions) or recaptures on branch creation.
   - Recommendation: Recapture. Land as 61-00 (Wave 0) with the canonical jq selector, capture new `61-baseline-meta.txt`, then start spec repair from a fresh diff floor. Same shape as 59-01.

4. **Does the Phase 60-04 button rename ("Allow this time" → "Allow until restart") affect any of the 8 specs?**
   - What we know: Phase 60-04 renamed the button in `PermissionGate.svelte:301`; component test title updated; testid `permission-allow-session` unchanged.
   - What's unclear: Whether `tool-card-rendering.spec.ts` "PermissionGate renders for permission request" (L287-309) asserts the literal "Allow" string (line 305: `getByRole("button", { name: "Allow" })`).
   - Recommendation: The literal "Allow" still matches (the button label is the full "Allow until restart" — `name` is a substring match by default). Confirm during 61-02 execution; flag if needed. **LOW risk.**

## Validation Architecture

> Phase 61 is test-only + minimal non-behavioral testid additions. All validation runs through Playwright + git introspection.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Playwright (`@playwright/test`), project-current version |
| Config file | `web/playwright.config.ts` (READ-ONLY — no edits per CONTEXT.md) |
| Quick run command | `cd web && bunx playwright test <spec-file> --workers=1` |
| Full suite command | `cd web && bunx playwright test --reporter=json > /tmp/phase-61-passing.json` |
| Preview server | `PI_SKIP_INIT=1 bun run build && PI_SKIP_INIT=1 bun run preview` on `:4173` (Playwright auto-spawn; pre-spawn if cold-build times out, per 59-02 deviation pattern) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TEST-02 (Bucket B) | 5 Sidebar fixmes flip to active passing tests | e2e | `cd web && bunx playwright test theme-sidebar.spec.ts --workers=1` | ✅ |
| TEST-02 (Bucket A #1) | mobile-navigation rewritten to SwipeDrawer behavior — pass OR FIXME w/ UN-BLOCKER | e2e | `cd web && bunx playwright test mobile-navigation.spec.ts --workers=1` | ✅ |
| TEST-02 (Bucket A #2) | swipe-drawer chat-route flow corrected — pass | e2e | `cd web && bunx playwright test swipe-drawer.spec.ts --workers=1` | ✅ |
| TEST-02 (Bucket A #3) | menu-keyboard-nav repaired OR fixme w/ UN-BLOCKER | e2e | `cd web && bunx playwright test menu-keyboard-nav.spec.ts --workers=1` | ✅ |
| TEST-02 (Bucket A #4) | command-palette-v2 route pivot — pass | e2e | `cd web && bunx playwright test command-palette-v2.spec.ts --workers=1` | ✅ |
| TEST-02 (Bucket A #5) | teams settings expand interaction repaired — pass | e2e | `cd web && bunx playwright test teams.spec.ts --workers=1` | ✅ |
| TEST-02 (Bucket A #6) | tool-card-rendering strict-mode collisions resolved — pass | e2e | `cd web && bunx playwright test tool-card-rendering.spec.ts --workers=1` | ✅ |
| TEST-02 (Bucket A #7) | task-card-actions-full strict-mode collisions resolved — pass | e2e | `cd web && bunx playwright test task-card-actions-full.spec.ts --workers=1` | ✅ |
| TEST-02 (Bucket A #8) | selector-keyboard-nav preventatively hardened — pass (already green) | e2e | `cd web && bunx playwright test selector-keyboard-nav.spec.ts --workers=1` | ✅ |
| TEST-02 (regression) | Baseline invariant — zero entries from baseline-titles.txt missing from new-titles.txt | regression | Title-based `comm -23` per Pitfall 5 awk transform | Generated each commit |

### Sampling Rate

- **Per task commit:** Run the affected spec file in isolation via quick-run command. Verify zero failures + zero new fixmes-without-UN-BLOCKER.
- **Per wave merge:** Full suite via full-suite command. Run title-based baseline diff. Zero missing entries allowed.
- **Phase gate:** Full suite green before `/gsd:verify-work`. All 8 Bucket A specs disposed (REPAIR pass / REWRITE pass / FIXME with UN-BLOCKER). All 5 Bucket B fixmes flipped to passing (zero `test.fixme` in `Sidebar` describe block).

### 5 Validation Layers (Nyquist)

Each validation layer enumerated below has a concrete, runnable command the orchestrator's Step 5.5 (VALIDATION.md creation) can copy verbatim.

#### Layer 1: Functional (passing tests) — Each disposed spec passes or has valid `test.fixme` with UN-BLOCKER

**Layer purpose:** Confirm each of the 13 dispositions (8 Bucket A + 5 Bucket B) lands in one of the three terminal states (REPAIR pass / REWRITE pass / FIXME with UN-BLOCKER), zero ambiguous failures.

**Per-spec command (run after each per-spec commit):**
```bash
cd web && bunx playwright test <spec-file>.spec.ts --workers=1 --reporter=json > /tmp/spec-result.json
# Verify: zero failed tests; zero test.fixme without an UN-BLOCKER comment in source.
jq '.suites[].specs[].tests[].results[].status' /tmp/spec-result.json | grep -E "^.failed.$|^.timedout.$" | wc -l
# Expected: 0
```

**FIXME audit verifier (also Layer 4):**
```bash
# For each retained test.fixme in the 8 deferred specs, verify a preceding UN-BLOCKER comment exists.
for spec in mobile-navigation swipe-drawer menu-keyboard-nav command-palette-v2 teams tool-card-rendering task-card-actions-full selector-keyboard-nav theme-sidebar; do
    awk '/UN-BLOCKER CONDITION/{ub=1} /test\.fixme/{if(!ub) print FILENAME":"NR" — fixme without UN-BLOCKER"; ub=0}' "web/e2e/$spec.spec.ts"
done
# Expected: empty output (zero violations)
```

#### Layer 2: Regression invariant — Baseline title-diff holds

**Layer purpose:** Confirm zero entries from `baseline-titles.txt` (derived from `baseline-passing.txt` via awk transform) are missing from the new run after each wave merge.

**Command (run after each wave merge AND at phase gate):**
```bash
# 1. Generate new run passing list
cd web && bunx playwright test --reporter=json | jq -r '.. | objects | select(has("specs")) | .specs[]? | . as $spec | $spec.tests[]? | select(.results[]?.status == "passed") | "\($spec.file)::\($spec.line):\($spec.column)::\($spec.title) [\(.projectName)]"' | sort -u > /tmp/phase-61-new-passing.txt

# 2. Strip line numbers from BOTH (baseline + new) — title-based
cd /home/dev/work/EZCorp/ez-corp-ai
awk -F'::' '{n=split($3, parts, " \\["); print $1 "::" parts[1] " [" parts[2]}' \
    .planning/phases/61-test-debt-followup-feature-rework-specs/baseline-passing.txt > /tmp/baseline-titles.txt
awk -F'::' '{n=split($3, parts, " \\["); print $1 "::" parts[1] " [" parts[2]}' \
    /tmp/phase-61-new-passing.txt > /tmp/new-titles.txt

# 3. Diff — zero missing entries
comm -23 <(sort -u /tmp/baseline-titles.txt) <(sort -u /tmp/new-titles.txt) > /tmp/missing.txt
wc -l /tmp/missing.txt
# Expected: 0 /tmp/missing.txt
```

**NOTE:** Use Phase 61's recaptured baseline (`61-baseline-passing.txt`) per Open Question 3. If inheriting `83781b5d`'s baseline, expect spurious diffs from the 26-commit drift.

#### Layer 3: Disposition audit — All 8 specs disposed with verdict recorded

**Layer purpose:** Confirm all 8 Bucket A specs land in one of REPAIR/REWRITE/FIXME and the verdict is recorded in commit messages.

**Command (run at phase gate):**
```bash
# Each Bucket A spec MUST have at least one commit citing "Phase 61" + a disposition verdict
# in the body or trailer. Example commit body line:
#   "Disposition: REPAIR — added data-testid=tool-card-{kind} to 7 card variants"
for spec in mobile-navigation swipe-drawer menu-keyboard-nav command-palette-v2 teams tool-card-rendering task-card-actions-full selector-keyboard-nav; do
    git log --grep="Phase 61\|Disposition:" --oneline -- "web/e2e/$spec.spec.ts" | head -1
done
# Expected: 8 lines, one per spec, each with a "Phase 61" or "Disposition:" reference.

# Additionally: enumerate the 8 specs disposed and confirm 8 commits touch them.
git log --oneline --name-only main..HEAD | awk '/^web\/e2e\/(mobile-navigation|swipe-drawer|menu-keyboard-nav|command-palette-v2|teams|tool-card-rendering|task-card-actions-full|selector-keyboard-nav)\.spec\.ts$/' | sort -u | wc -l
# Expected: 8
```

#### Layer 4: FIXME audit — All retained `test.fixme` markers have UN-BLOCKER comments

**Layer purpose:** Confirm every NEW or RETAINED `test.fixme` in the 9 affected specs (8 Bucket A + theme-sidebar.spec.ts) carries an UN-BLOCKER comment block above it. Phase 61's gsd-plan-checker treats missing UN-BLOCKER as verification failure (CONTEXT.md L115).

**Command (run after each commit AND at phase gate):**
```bash
# Strict format: a comment containing "UN-BLOCKER CONDITION" must appear within
# the 10 lines immediately preceding any test.fixme(...) call.
for spec in mobile-navigation swipe-drawer menu-keyboard-nav command-palette-v2 teams tool-card-rendering task-card-actions-full selector-keyboard-nav theme-sidebar; do
    awk '
        /UN-BLOCKER CONDITION/ { ub_seen_at = NR }
        /test\.fixme/ {
            if (ub_seen_at < NR - 10 || ub_seen_at == 0) {
                print FILENAME":"NR": test.fixme without UN-BLOCKER within 10 preceding lines"
            }
        }
    ' "web/e2e/$spec.spec.ts"
done
# Expected: empty output
```

**Additional audit — Bucket B specifically:**
```bash
# theme-sidebar.spec.ts Sidebar describe block MUST have zero test.fixme after Phase 61.
awk '/test\.describe\("Sidebar"/,/^test\.describe\(/' web/e2e/theme-sidebar.spec.ts | grep -c "test\.fixme"
# Expected: 0
```

#### Layer 5: No timeout widening — Per-test and config timeouts unchanged

**Layer purpose:** Confirm Phase 61 did NOT widen any timeout to dodge a real bug (CONTEXT.md L70 + Phase 59 discipline carry-over).

**Command (run at phase gate):**
```bash
# 1. playwright.config.ts — verify untouched
git diff main -- web/playwright.config.ts
# Expected: empty output

# 2. Per-test test.setTimeout() — verify no increases in any deferred spec
for spec in mobile-navigation swipe-drawer menu-keyboard-nav command-palette-v2 teams tool-card-rendering task-card-actions-full selector-keyboard-nav theme-sidebar; do
    git diff main -- "web/e2e/$spec.spec.ts" | grep -E "^\+.*setTimeout|^\+.*timeout: ([6-9]\d|\d{3,})" || echo "OK: $spec"
done
# Expected: each spec prints "OK: <spec>" (no lines added that bump a timeout above existing values)

# 3. Per-assertion { timeout: ... } — verify no widening above 5000ms baseline (the Phase 59-06 ceiling)
for spec in mobile-navigation swipe-drawer menu-keyboard-nav command-palette-v2 teams tool-card-rendering task-card-actions-full selector-keyboard-nav theme-sidebar; do
    git diff main -- "web/e2e/$spec.spec.ts" | grep -E "^\+.*\{\s*timeout:\s*(6\d{3}|[7-9]\d{3}|\d{5,})" && echo "FAIL: $spec widened timeout > 5000ms"
done
# Expected: empty output (no FAILs)
```

### Wave 0 Gaps

- [ ] **`.planning/phases/61-test-debt-followup-feature-rework-specs/baseline-passing.txt`** — recapture against current `main` HEAD per Open Question 3 + Pitfall 6. ~26 commits since 59-01's `83781b5d` capture; line count expected to be 1679–1681 (or higher post-60-04). Land as 61-00 Wave 0 plan, mirror 59-01 shape (`baseline-meta.txt` with head_sha, captured_at, jq selector, drift notes).
- [ ] **`.planning/phases/61-test-debt-followup-feature-rework-specs/baseline-meta.txt`** — paired metadata file (head_sha, captured_at, line counts, jq selector). Mirrors `59-test-debt-repair/baseline-meta.txt`.
- [ ] **`.planning/phases/61-test-debt-followup-feature-rework-specs/61-VALIDATION.md`** — Nyquist VALIDATION.md created by orchestrator Step 5.5 from this RESEARCH.md's Validation Architecture section.

*Test infrastructure (Playwright + Bun) is fully in place — no framework install or config edits required.*

## Sources

### Primary (HIGH confidence)

- **CONTEXT.md** (`.planning/phases/61-test-debt-followup-feature-rework-specs/61-CONTEXT.md`) — User decisions, locked scope, dispositions. Verbatim source for User Constraints section.
- **Phase 59 deferred-items.md** (`.planning/phases/59-test-debt-repair/deferred-items.md`) — Canonical 8-spec scope source, per-spec fix-shapes.
- **Svelte 5 debug verdict** (`.planning/debug/svelte5-layout-reactivity-2026-05-12.md`) — Verdict `test-env-only`, root cause at `/account/+page.svelte:308`, 3-line mock fix shape (L42-49), `(app)` route audit list (L23-33).
- **Baseline metadata** (`.planning/phases/59-test-debt-repair/baseline-meta.txt`) — `head_sha=83781b5dd7be`, captured `2026-05-12T22:07:45Z`, 1678 passing test cases, canonical jq selector.
- **STATE.md** — Phase 59-02 outcome (line 141-148: post-59-02 line count 1679–1681); Phase 59-06 outcome (line 176-188: theme-sidebar repair, 8-spec scope-back, deferred-items filed).
- **REQUIREMENTS.md** — TEST-02 residual status (line 130).
- **Existing spec files** (all 8 deferred specs + theme-sidebar.spec.ts) — read end-to-end.
- **SUT files** (verified):
  - `web/src/routes/(app)/+layout.svelte:142,184-208,237-271,360-379,407-444` — `isChatRoute`, navLinks, desktop-sidebar, mobile-header, SwipeDrawer
  - `web/src/routes/(app)/settings/+page.svelte:710` — team-expand button
  - `web/src/routes/(app)/account/+page.svelte` — Bucket B root-cause site (NOT modified)
  - `web/src/lib/components/SwipeDrawer.svelte:40,207,219,231` — `ariaLabel` prop, testids
  - `web/src/lib/components/ModelSelector.svelte:181,187` — `.model-selector` wrapper
  - `web/src/lib/components/tool-cards/{TerminalCard,TaskListCard,ToolCardRouter}.svelte` — root containers for testid addition
- **api-mocks.ts** — `MockOverrides` shape (L14-186), mention-search handler (L1112-1286), `/api/account/sessions`/`/login-history` handlers (L1308-1318), default catch-all (L1460), absence of `/api/account` GET handler verified.
- **UN-BLOCKER format reference** — `web/e2e/v1.3-permission-backbone.spec.ts:842,1051,1174` (canonical comment blocks above `test.fixme` calls).
- **playwright.config.ts** — chromium + mobile-chromium projects, `timeout: 30_000`, webServer block, `reuseExistingServer: true`.

### Secondary (MEDIUM confidence)

- **Phase 59-06-PLAN/SUMMARY.md** — established patterns (viewport-aware testid disambiguation, splash-overlay wait helper, title-based diff). Used as anchor for Pattern 1/2/5/9.

### Tertiary (LOW confidence)

- *None.* All findings cross-verified against actual source files. Recommendations are evidence-driven.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Playwright + Bun + Svelte 5 are fixed by project, no alternatives explored.
- Architecture patterns: HIGH — 7 of 9 patterns verified via direct SUT read + 59-06 precedent; Pattern 6 (mobile-nav REWRITE) verified feasible via `(app)/+layout.svelte:407-444` exposing equivalent SwipeDrawer surface; Pattern 9 (menu-keyboard-nav INVESTIGATE) is the one MEDIUM-confidence area.
- Pitfalls: HIGH — Pitfalls 1, 3, 5, 6 verified against actual SUT/files. Pitfalls 2, 4, 7 are well-reasoned but should be confirmed in-flight.
- Validation Architecture: HIGH — All 5 layers have concrete commands; baseline recapture (Open Question 3) is the only operational lift.

**Open question impact on planning:**
- Q1 (command-palette-v2 fold): Discretion area, doesn't block plan structure.
- Q2 (menu-keyboard-nav root cause): Resolves in-flight; allow ~30 min investigation buffer in 61-03.
- Q3 (baseline recapture): RECOMMENDED — add a 61-00 Wave 0 plan (~15 min) mirroring 59-01 shape.
- Q4 (Allow-button rename impact): LOW risk, confirm in 61-02 execution.

**Research date:** 2026-05-13
**Valid until:** 2026-05-20 (7 days — Phase 61 should land within this window; STATE will drift if Phase 59-05/07/08 also lands in parallel).
