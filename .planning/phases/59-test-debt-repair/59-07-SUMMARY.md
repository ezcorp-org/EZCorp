---
phase: 59-test-debt-repair
plan: 07
subsystem: testing
tags: [playwright, e2e, permission-backbone, fixme-flip, sse, cardType, stale-assertion-fix, TEST-03]

# Dependency graph
requires:
  - phase: 59-test-debt-repair
    plan: 02
    provides: "/api/tool-calls/[id]/permission POST mock handler (consumed by F-trio L422 click → POST capture)"
  - phase: 59-test-debt-repair
    plan: 05
    provides: "ToolCallCard.svelte useSpecializedCard derivation already correct (UN-BLOCKER condition #1 — verified at planning time, MET)"
provides:
  - "3 of 3 F-trio fixmes flipped to active passing tests at L248/L346/L422 in web/e2e/v1.3-permission-backbone.spec.ts (line numbers in original baseline; post-flip the tests live at L248/L354/L434 due to in-file insertions of cardType+comment)"
  - "+6 net passing test cases on the Playwright baseline (3 tests × 2 projects: chromium + mobile-chromium)"
  - "Documented stale-assertion fix: F-trio's tool:permission_request SSE payloads now include cardType: 'terminal' to match the SUT contract at stores.svelte.ts:1066"
affects: [60-audit-claim-docs-polish, 61-test-debt-followup]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SUT-contract documentation: when a SUT handler explicitly overwrites a field (cardType: permCardType — not a spread), every SSE event that lands in that handler must carry the field — sibling spec sub-agent-permission-routing.spec.ts:168/217/262 is the canonical reference pattern"
    - "Atomic per-flip commits: each fixme flip + its co-required SSE payload patch ship as one commit, so each commit independently makes one test go green and the per-test green/red bisect is single-commit-precise"
    - "Title-stripped baseline regression diff: line-based comm -23 produces false positives when in-file edits shift downstream test line numbers; awk -F'::' to extract file::title pairs neutralises the line shift"

key-files:
  created:
    - .planning/phases/59-test-debt-repair/59-07-SUMMARY.md
  modified:
    - web/e2e/v1.3-permission-backbone.spec.ts

key-decisions:
  - "Test-side stale-assertion fix (per user resume signal `approve-stale-fix-L248`) over either restoring the fixme or modifying SUT — the F-trio's tool:permission_request SSE payload omitted cardType, but the SUT handler at stores.svelte.ts:1066 explicitly OVERWRITES cardType (cardType: permCardType — not a spread), so undefined wiped the prior cardType: 'terminal' from tool:start. Working sibling pattern at sub-agent-permission-routing.spec.ts:168/217/262 already includes cardType: 'terminal' in every tool:permission_request payload"
  - "Three atomic per-flip commits over one bulk commit — each commit pairs (a) the cardType fix for THAT test's SSE payload + (b) the fixme flip for THAT test, so each commit makes exactly one test pass and a regression bisect is precise to a single test"
  - "L842 (SEC-06), L1051, L1174 (TTL picker) untouched per CONTEXT scope — out-of-scope deliverables for separate phases (Phase 60 audit-lane / Phase 56)"
  - "Baseline regression diff measured via title-stripped (line-shift-stable) comm — the line-based diff produced 81 false-positive entries from the 3-flip-commits' net +18 lines shifting every downstream test in the same file. Title-stripped diff yielded 7 entries, all of which are documented pre-existing flakes (5 already cited as flakes in 59-06-SUMMARY's baseline-diff section)"

patterns-established:
  - "Per-test atomic commit policy for fixme flips: when N fixmes share a co-required fix, ship N commits (one per flip + its slice of the co-required fix), not 1 bulk commit"
  - "SUT-contract reference: when documenting a stale-assertion fix that mirrors a working sibling spec, cite the sibling's exact line numbers in the SSE payload comment so future maintainers don't re-litigate"
  - "Title-stripped baseline diff (awk -F'::' '{print $1\"::\"$3}') as the line-shift-stable variant of comm -23 — use whenever a plan touches files in the baseline (any in-file edit shifts line-based identifiers)"

requirements-completed: [TEST-03]

# Metrics
duration: ~25 min
completed: 2026-05-13
phase-branch-head-at-completion: 25201c825ce59bf4efdb50d6b0bdfc8237dd6f65
---

# Phase 59 Plan 07: F-trio fixme flips (TEST-03) Summary

**3 of 3 F-trio fixmes flipped to active passing tests via a test-only stale-assertion fix; +6 passing test cases on the Playwright baseline; zero SUT changes; sacred-12-stash invariant preserved; all 3 commits atomic per-flip.**

## Performance

- **Duration:** ~25 min (continuation execution; ~5 min planning + L248 isolation run from previous executor)
- **Started:** 2026-05-13 (continuation after user resume signal `approve-stale-fix-L248`)
- **Completed:** 2026-05-13
- **Tasks completed:** 2 of 2 (Task 1: pre-flip dry-run + Task 2 checkpoint completed by previous executor; Task 3 fold-in: stale-assertion fix + flip L346 + L422 + atomic commits + baseline regression + SUMMARY)
- **Files modified:** 2 (`web/e2e/v1.3-permission-backbone.spec.ts`, `.planning/phases/59-test-debt-repair/59-07-SUMMARY.md`)
- **Commits:** 3 atomic test commits + 1 docs commit
  - `eeb049c test(59-07): flip L248 4-scope chooser renders + add cardType in permission-request SSE`
  - `a909692 test(59-07): flip L346 'Approve forever' button reachable in 4-scope chooser`
  - `25201c8 test(59-07): flip L422 'Allow for this conversation' POSTs scope='conversation'`
  - (this SUMMARY commit lands separately as docs(59-07))

## Per-test outcomes

| Original line | Post-flip line | Test name | Outcome | Commit |
|---|---|---|---|---|
| L248 | L248 | "4-scope chooser renders with all five buttons + extension badge" | flipped + passing (chromium 591 ms / mobile-chromium 610 ms in isolation; 575 ms / 598 ms in F-trio batch) | `eeb049c` |
| L346 | L354 | "'Approve forever' button is reachable in the 4-scope chooser (server defense-in-depth covers non-admin POST)" | flipped + passing (chromium 700 ms / mobile-chromium 588 ms in isolation; 624 ms / 573 ms in F-trio batch) | `a909692` |
| L422 | L434 | "clicking 'Allow for this conversation' POSTs scope='conversation' for the same toolCallId" | flipped + passing (chromium 604 ms / mobile-chromium 648 ms in isolation; 661 ms / 680 ms in F-trio batch) | `25201c8` |

Net gain: **+6 passing test cases** (3 tests × 2 projects). Cumulative for Phase 59: ~+135 from prior plans + +6 here.

F-trio batch run (`-g "F: install" --workers=1`): **6/6 passed in 5.4 s** — no test-isolation bug; runs together identically to runs in isolation.

## Root cause + fix (stale-assertion)

The 3 F-trio tests asserted `getByTestId("permission-scope-chooser")` would become visible after firing a `tool:permission_request` SSE event. The card never resolved to a `PermissionGate` because the SSE payload was missing `cardType`:

**SUT contract** at `web/src/lib/stores.svelte.ts:1056-1073` (the `tool:permission_request` handler — `permCardType = data.cardType`):

```ts
if (idx >= 0) {
  const updated = [...calls];
  updated[idx] = {
    ...updated[idx]!,
    id: toolCallId,
    permissionPending: true,
    cardType: permCardType,        // ← line 1066: explicit overwrite, NOT a spread
    cardLayout: safePermLayout,
    category: permCategory,
    extensionId: permExtensionId,
    capabilityKind: permCapabilityKind,
    capabilityValue: permCapabilityValue,
  };
  store.streamingToolCalls = { ...store.streamingToolCalls, [runId]: updated };
}
```

When the test fires `tool:start` with `cardType: "terminal"` and then fires `tool:permission_request` without `cardType`, line 1066 wipes the prior `"terminal"` to `undefined`. `ToolCallCard.svelte`'s `useSpecializedCard = $derived(!!toolCall.cardType)` then flips back to `false`, so the card renders the inline default template — which has no `permission-scope-chooser` testid. Test times out at 5 s.

**Working sibling** `web/e2e/sub-agent-permission-routing.spec.ts:168`, `:217`, `:262` already includes `cardType: "terminal"` in every `tool:permission_request` payload — that spec is green at HEAD.

**Fix:** added `cardType: "terminal"` to all 3 F-trio `tool:permission_request` payloads with an inline comment block documenting the SUT-handler contract + sibling-spec reference, so future maintainers don't re-litigate.

## Diffs (per-commit)

### `eeb049c` — L248 (`tc-install-1` SSE block)

```diff
@@ tool:permission_request payload (around L320-L330) @@
   conversationId: "conv-1",
   toolCallId: "tc-install-1",
   toolName: "test-extension__echo",
   input: { msg: "hello" },
   extensionId: "test-extension",
   capabilityKind: "shell",
+  // cardType MUST be carried on tool:permission_request — the SUT
+  // handler at web/src/lib/stores.svelte.ts:1066 explicitly
+  // overwrites cardType: permCardType (not a spread), so an
+  // undefined here would wipe the prior cardType: "terminal" from
+  // tool:start and the wrapper would render DefaultCard instead
+  // of routing to PermissionGate. Mirrors the working pattern in
+  // sub-agent-permission-routing.spec.ts:168/217/262.
+  cardType: "terminal",
```

### `a909692` — L346 (`tc-install-2` SSE block) + flip

```diff
- test.fixme("'Approve forever' button is reachable in the 4-scope chooser (server defense-in-depth covers non-admin POST)", async ({
+ test("'Approve forever' button is reachable in the 4-scope chooser (server defense-in-depth covers non-admin POST)", async ({

@@ tool:permission_request payload @@
   capabilityKind: "shell",
+  // cardType MUST be carried — see SUT note at L248-equivalent block.
+  // stores.svelte.ts:1066 explicitly overwrites cardType, so an
+  // undefined here wipes the prior cardType: "terminal" from tool:start.
+  cardType: "terminal",
```

### `25201c8` — L422 (`tc-grant-conv` SSE block) + flip

Identical-pattern to `a909692` — flip + cardType insertion in the `tc-grant-conv` SSE payload.

## Pre/post state of the F-describe block

**Before** (baseline-passing at HEAD `83781b5`):
- L248: `test.fixme(...)` — UN-BLOCKER condition #3 unverified
- L346: `test.fixme(...)` — UN-BLOCKER condition #3 unverified
- L422: `test.fixme(...)` — UN-BLOCKER condition #3 unverified
- F-trio contributed **0** passing test cases.

**After** (HEAD `25201c8`):
- L248: `test(...)` — passing (chromium + mobile-chromium)
- L354 (was L346): `test(...)` — passing (chromium + mobile-chromium)
- L434 (was L422): `test(...)` — passing (chromium + mobile-chromium)
- F-trio contributes **+6** passing test cases.
- L842 (SEC-06), L1051, L1174 (TTL picker) — UNTOUCHED (out of scope per CONTEXT).

## Baseline regression diff

**Method (line-based — original):** `comm -23 baseline-passing.txt /tmp/phase-59-07-passing.txt` → **81 entries lost**.

**False-positive analysis:** the line-based identifier embeds `<line>:<column>` per spec test, but my 3 commits added net +18 lines to `v1.3-permission-backbone.spec.ts` (eeb049c +9, a909692 +5, 25201c8 +5 — all to the F-trio in the upper portion of the file). Every test below L248 in that spec shifted to a new line and dropped out of the line-based diff. Of the 81 lost entries, 10 are from `v1.3-permission-backbone.spec.ts` itself (5 tests × 2 projects: L524 → L532, L576 → L584, L631 → L639, L713 → L721, L915 → L923 — same titles, shifted lines).

**Method (title-stripped — line-shift-stable, established by 59-06):**
```bash
awk -F'::' '{print $1"::"$3}' baseline-passing.txt | sort -u > /tmp/baseline-titles.txt
awk -F'::' '{print $1"::"$3}' /tmp/phase-59-07-passing.txt | sort -u > /tmp/after-titles.txt
comm -23 /tmp/baseline-titles.txt /tmp/after-titles.txt
```

**Result:** **7 entries lost**, all pre-existing flakes verified in isolation:

| Spec | Title | Project | Status |
|---|---|---|---|
| `agent-detail.spec.ts` | "Chat and Test buttons remain accessible in edit mode" | chromium | flake (passes in isolation; 59-06-SUMMARY documents same title for [mobile-chromium] as flake) |
| `agent-detail.spec.ts` | "Chat and Test buttons remain accessible in edit mode" | mobile-chromium | flake (already documented in 59-06-SUMMARY) |
| `agent-detail.spec.ts` | "file-based agent does NOT show edit form" | mobile-chromium | flake (passed isolation re-run after first fail) |
| `mobile-ux.spec.ts` | "agent editor sections are collapsible on mobile" | chromium | flake (passes in isolation re-run) |
| `mobile-ux.spec.ts` | "agent editor sections are collapsible on mobile" | mobile-chromium | flake (passes in isolation re-run) |
| `streaming-toolbar.spec.ts` | "Ctrl+N creates a new conversation" | chromium | flake (passes in isolation re-run) |
| `tools-popover.spec.ts` | "handles API failure gracefully - shows 0 tools" | mobile-chromium | flake (already documented in 59-06-SUMMARY) |

**Causal-empty proof:** `git diff --name-only HEAD~3..HEAD` returns exactly `web/e2e/v1.3-permission-backbone.spec.ts` — zero SUT changes, zero touches to any of the 7 lost-entry files. The lost entries cannot causally derive from this plan's changes. The full-suite run still produced **+103 passing tests over baseline** (1781 vs 1678) — the cumulative win from 59-02/04/05/06 + this plan's +6.

## Stash invariant

| Checkpoint | `git stash list \| wc -l` | Operation count |
|---|---|---|
| Pre-task-1 | 12 | 0 |
| Post-eeb049c | 12 | 0 |
| Post-a909692 | 12 | 0 |
| Post-25201c8 | 12 | 0 |
| Post-baseline-run | 12 | 0 |

`stash@{0}: On main: TEMP-56-03-regression-check` preserved verbatim. **Sacred-12 invariant held throughout** — zero `git stash` operations performed, mirroring the project memory `feedback_agent_briefs_no_git_stash.md`.

## `git add` discipline

Every commit used **explicit file paths** (no `-A`, no `.`):

```
git add web/e2e/v1.3-permission-backbone.spec.ts
```

This isolated each commit from the parallel-session dirty file `web/src/lib/hljs-theme.css` (untouched in working tree across all 4 commits).

## Deviations from Plan

**None — plan executed exactly as continuation prescribed.** The user's `approve-stale-fix-L248` resume signal authorized the test-side fix; I applied it to all 3 F-trio SSE payloads (consistent across the trio per the same SUT contract), flipped each fixme + ran in isolation + committed atomically per-test, then ran the full suite + computed the title-stripped baseline diff (line-stripped diff was a known false-positive class per 59-06's documented pattern; no new tooling needed).

No Rule 1-4 deviations triggered. No SUT changes. No out-of-scope fixme touches.

## Authentication gates

None — Playwright runs against the local preview server (no auth), and the test fixtures are mock-driven (no live backend).

## Verification (reproducible)

```bash
# All 3 F-trio tests in isolation (run together):
cd web && bunx playwright test e2e/v1.3-permission-backbone.spec.ts -g "F: install" --workers=1 --reporter=list
# Expected: 6 passed (5.4s)

# Per-test isolation:
cd web && bunx playwright test e2e/v1.3-permission-backbone.spec.ts -g "4-scope chooser renders" --workers=1     # 2/2
cd web && bunx playwright test e2e/v1.3-permission-backbone.spec.ts -g "Approve forever" --workers=1             # 2/2
cd web && bunx playwright test e2e/v1.3-permission-backbone.spec.ts -g "Allow for this conversation" --workers=1 # 2/2

# Final F-trio state (3 active, no fixmes in F-describe; L842/L1051/L1174 fixmes UNTOUCHED):
grep -nE '^	(test\.fixme|test\()' web/e2e/v1.3-permission-backbone.spec.ts
# Expected first 3 entries: 3 active F-trio tests (no fixmes); L842/L1051/L1174 still fixme
```

## Self-Check: PASSED

- [x] `web/e2e/v1.3-permission-backbone.spec.ts` modified — verified by `git diff --name-only HEAD~3..HEAD` returning exactly that file.
- [x] Commit `eeb049c` exists — verified by `git log --oneline | grep eeb049c`.
- [x] Commit `a909692` exists — verified by `git log --oneline | grep a909692`.
- [x] Commit `25201c8` exists — verified by `git log --oneline | grep 25201c8`.
- [x] L248/L346/L422 originals are now active `test(...)` — verified by `grep -nE '^	(test\.fixme|test\()' web/e2e/v1.3-permission-backbone.spec.ts | head -3` returning 3 `test(` lines (not `test.fixme`).
- [x] L842 / L1051 / L1174 still `test.fixme(...)` — verified untouched.
- [x] Stash count = 12 (sacred) — verified pre + post each commit.
- [x] Zero SUT changes — verified by `git diff --name-only HEAD~3..HEAD -- web/src/` returning empty.
- [x] Title-stripped baseline diff = 7 entries, all pre-existing documented flakes — verified.

## TEST-03 status

**TEST-03 closed with 3/3 fixmes flipped.** Phase 59 plan 07 of 8 complete. Phase 59 cumulative: 7 of 8 plans landed (59-08 was scoped-back to Phase 61 per ROADMAP.md L223). Phase 59 closes pending requirement marking + ROADMAP progress update.
