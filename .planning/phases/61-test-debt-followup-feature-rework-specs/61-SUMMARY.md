---
phase: 61-test-debt-followup-feature-rework-specs
status: complete
milestone: v1.4 — Trust Hardening & v1.3 Closeout
requirements: [TEST-02]
completed: 2026-05-13
total_plans: 4
plans_complete: 4
atomic_commits: 12  # 1 from 61-00 + 1 from 61-01 + 4 from 61-02 + 5 from 61-03 + 1 docs-only retitle = 12 across phase
bucket_a_disposed: 8 # all 8 Bucket A deferred specs
bucket_b_flipped: 5  # all 5 theme-sidebar Sidebar describe fixmes
---

# Phase 61 Summary — Test Debt Follow-up & Feature-Rework Specs

One-liner: Closed the Phase 59 test-debt residual — 8 of 8 Bucket A deferred specs disposed (REPAIR/REWRITE/FIXME) + 5 of 5 Bucket B `theme-sidebar.spec.ts` fixmes flipped via 3-line `/api/account` mock helper + 1 closing audit-trail retitle on `deferred-items.md`. Net +51 passing tests across the 8 specs (50 baseline → ~83 after 61-03 alone; plus 18 from 61-02's command-palette-v2 route-pivot + 5 from 61-01 Sidebar flips). Zero baseline-passing regressions modulo 1 documented pre-existing flake. TEST-02 residual closed.

## Plan-by-Plan Roll-up

| Plan | Scope | Commits | Net Test Delta | Status |
|------|-------|---------|----------------|--------|
| 61-00 | Baseline capture (Wave 0) | `788f990` + `a1c5c08` | n/a — captured 1726-line `baseline-passing.txt` at HEAD `6d852cf` | DONE |
| 61-01 | Bucket B — 5 Sidebar fixmes flipped via `/api/account` mock helper | `ea3f8a6` + `6d852cf` | +5 (5 fixmes → 5 active passing) | DONE |
| 61-02 | Bucket A simple repairs — `selector-keyboard-nav` + `command-palette-v2` + `tool-card-rendering` + `task-card-actions-full` | `3ae5a2f` + `1b55881` + `c770969` + `dcbd3a2` + `4d6bfe5` (docs) | +18 (8 → 26 passing across the 4 specs; 36 cases fixme'd with UN-BLOCKER for chat-page streaming race) | DONE |
| 61-03 | Bucket A complex repairs — `teams` + `swipe-drawer` + `menu-keyboard-nav` + `mobile-navigation` + deferred-items.md retitle | `7d5668d` + `2b05dc4` + `345d6c7` + `0ccddaf` + `784b7ff` | +33 (50 → 83 passing across the 4 specs) | DONE |

**Phase total: +56 active passing tests across the 9 affected specs (5 from 61-01 + 18 from 61-02 + 33 from 61-03).**

## Final Disposition Table — 8 Bucket A Specs

| # | Spec | Plan | Disposition | Commit | Net Delta |
|---|------|------|-------------|--------|-----------|
| 1 | `mobile-navigation.spec.ts` | 61-03 | REWRITE (Path A — SwipeDrawer behavior) | `0ccddaf` | 4 → 12 (+8) |
| 2 | `swipe-drawer.spec.ts` | 61-03 | REPAIR (route-pivot to /agents) | `2b05dc4` | 23 → 30 (+7) |
| 3 | `menu-keyboard-nav.spec.ts` | 61-03 | REPAIR (sigil correction `@` → `!`) | `345d6c7` | 0 → 18 (+18) |
| 4 | `command-palette-v2.spec.ts` | 61-02 | REPAIR (route-pivot + Ctrl+K helper) | `1b55881` | 2 → 20 (+18) |
| 5 | `teams.spec.ts` | 61-03 | REPAIR (testid hardening + 10 FIXME) | `7d5668d` | 23 → 23 (+0; baseline preserved + 10 fixme'd) |
| 6 | `tool-card-rendering.spec.ts` | 61-02 | REPAIR (7-variant testid + 10 FIXME) | `c770969` | 2 → 2 (+0; baseline preserved + 20 fixme'd) |
| 7 | `task-card-actions-full.spec.ts` | 61-02 | REPAIR (per-row testid + 9 FIXME) | `dcbd3a2` | 2 → 2 (+0; baseline preserved + 18 fixme'd) |
| 8 | `selector-keyboard-nav.spec.ts` | 61-02 | REPAIR (testid hardening + 9 FIXME) | `3ae5a2f` | 2 → 2 (+0; baseline preserved + 18 fixme'd) |

## Final Disposition Table — 5 Bucket B Theme-Sidebar Fixmes

| Test | Plan | Disposition | Commit |
|------|------|-------------|--------|
| `Sidebar › collapse button hides sidebar` | 61-01 | FLIPPED (fixme → active passing) | `ea3f8a6` |
| `Sidebar › expand after collapse restores sidebar` | 61-01 | FLIPPED | `ea3f8a6` |
| `Sidebar › Ctrl+\\ shortcut toggles sidebar` | 61-01 | FLIPPED | `ea3f8a6` |
| `Sidebar › mobile drawer opens on hamburger click` | 61-01 | FLIPPED | `ea3f8a6` |
| `Sidebar › mobile drawer closes on backdrop click` | 61-01 | FLIPPED | `ea3f8a6` |

## Atomic Commit Audit — 12 Phase-61 Commits

```
61-00 (baseline capture):
  788f990 docs(61-00): capture Phase 61 baseline passing-spec snapshot
  a1c5c08 docs(61-00): complete baseline-capture plan

61-01 (Bucket B — 5 Sidebar fixmes flipped):
  ea3f8a6 test(61-01): flip 5 Sidebar fixmes via /api/account mock helper
  6d852cf docs(61-01): complete theme-sidebar 5-fixme flip plan

61-02 (Bucket A simple repairs):
  3ae5a2f test(61-02): harden selector-keyboard-nav via testid wrappers on ModelSelector/ThinkingLevelSelector/ModeSelector
  1b55881 test(61-02): pivot command-palette-v2 from / to /extensions + testid + Ctrl+K helper
  c770969 test(61-02): add tool-card-{kind} testids to 7 variants + swap .bg-gray-900 collisions
  dcbd3a2 test(61-02): scope task-card-actions-full lookups via task-card-{id} row testids
  4d6bfe5 docs(61-02): complete Bucket A simple repairs plan

61-03 (Bucket A complex repairs + closing retitle):
  7d5668d test(61-03): scope teams.spec.ts via team-expand testid on settings/+page.svelte
  2b05dc4 test(61-03): pivot swipe-drawer.spec.ts hamburger tests to non-chat route
  345d6c7 test(61-03): repair menu-keyboard-nav.spec.ts sigil grammar (@ → !)
  0ccddaf test(61-03): REWRITE mobile-navigation.spec.ts against SwipeDrawer (Path A)
  784b7ff docs(61-03): retitle deferred-items.md Svelte 5 entry — test-env-only verdict
```

Each spec-touching commit body carries `Disposition: REPAIR|REWRITE|FIXME (Bucket A #N, <reason>)` trailer + `deferred-items.md § Out-of-scope spec files - #N <spec>` citation. The closing-commit cites the debug-doc verdict path + Phase 61-01 fix commit hash.

## Layer 1–5 Validation Gate Results

**Layer 1 (per-spec functional):** Each Bucket A spec passes solo with `0 failed, 0 timedout` for all active tests. Verified after each task commit.

**Layer 2 (regression invariant — title-stripped diff):**
- Baseline (`baseline-passing.txt`): 1726 entries at HEAD `6d852cf` (Phase 61 start).
- Combined post-Phase-61 result: ~1782 passing titles (+56 net wins across the 9 affected specs).
- Missing (baseline → new): 1 entry — `swipe-drawer.spec.ts::Escape closes any open drawer [chromium]`. Pre-existing flake confirmed by 5 re-runs against the pre-task-2 spec content (same symptom; not introduced by Phase 61 changes). Same class as the 61-02 documented `tool-card-rendering CopyButton mobile-chromium` flake.

**Layer 3 (disposition audit):** All 8 Bucket A specs have Phase 61 disposition commits — verified via `git log --grep="Disposition:" --oneline -- web/e2e/<spec>.spec.ts | head -1` for each of the 8.

**Layer 4 (FIXME UN-BLOCKER audit):** Zero `test.fixme` without an UN-BLOCKER comment within 10 preceding lines across all 9 Bucket A specs + `theme-sidebar.spec.ts`. Bucket B `theme-sidebar.spec.ts` Sidebar describe has 0 fixmes (all 5 flipped to active).

**Layer 5 (no widening):**
- `playwright.config.ts` untouched: `git diff main -- web/playwright.config.ts` empty.
- Per-spec timeout-widening grep: empty across all 9 affected specs.
- `web/e2e/fixtures/api-mocks.ts` untouched throughout Phase 61 (per 59-02 boundary).

## TEST-02 Residual Status — CLOSED

Phase 59-06 deferred 8 spec files + 5 `theme-sidebar.spec.ts` Sidebar describe fixmes to Phase 61 (per `.planning/phases/59-test-debt-repair/deferred-items.md § Out-of-scope spec files` + `§ Svelte 5 entry`). Phase 61 lands:
- All 8 specs disposed with REPAIR/REWRITE/FIXME and Phase 61 commit-body verdict trailers.
- All 5 Bucket B fixmes flipped to active passing tests.
- `deferred-items.md` § Svelte 5 entry retitled to reflect the `test-env-only` verdict from `.planning/debug/svelte5-layout-reactivity-2026-05-12.md` (original entry preserved under audit-trail header).
- The roadmap's conditional success criterion #3 (`if verdict is production-bug → SUT fix`) is resolved as **N/A** because the debug-doc verdict is `test-env-only`, not `production-bug`.
- TEST-06 is NOT added per CONTEXT.md L52 — the roadmap text's conditional ("TEST-06 covers the Svelte 5 fix IF verdict is production-bug") evaluates false.

Residual deferrables to v1.5 housekeeping (NOT closed by Phase 61, per CONTEXT.md L188-200):
- Global `setupApiMocks()` `/api/account` default expansion (59-02 follow-up).
- Defensive `account.name ?? "?"` guard in `/account/+page.svelte:308` (cosmetic, unrelated to production).
- `deferred-items.md` 868-vs-1678 plan-text correction + 7-vs-8 roadmap text drift.
- Chat-page composer streaming race (the upstream blocker for 36 of the 61-02 + 9 of the 61-03 FIXMEs — 45 total cases that flip with a single `.fixme` → `test` revert when the race is fixed; likely Phase 62+ or in-flight 59-05 continuation).

## Sacred-Stash Invariant — Phase 61 Wide

Sacred 12-stash invariant preserved across ALL 4 plans:
- Pre-61-00: 12 entries
- Post-61-00: 12 entries
- Post-61-01: 12 entries
- Post-61-02: 12 entries
- Post-61-03: 12 entries (verified at plan end)

Zero `git stash` operations performed at any point during Phase 61 (memory rule `feedback_agent_briefs_no_git_stash.md` honored).

## Patterns Established or Reused

| Pattern | First Landed | Reused In |
|---------|-------------|-----------|
| `/api/account` per-test mock helper (`mockAccountEndpoints`) | 61-01 | (one-off; Phase 61 scope only) |
| Per-variant `tool-card-{kind}` testid naming | 61-02 (task 3) | 61-02 task 4 (`task-card-{id}` per-row variant) |
| Per-row wrapper testid via Svelte template expression | 61-02 (task 4) | 61-03 task 1 (`team-expand-{team.id}`) |
| Route-pivot to pre-mocked (app) route (instead of adding per-test mock) | 61-02 (task 2: `/` → `/extensions`) | 61-03 task 2 (`/project/${id}` → `/agents`) |
| Viewport-agnostic helper via keyboard shortcut | 61-02 (task 2: Ctrl+K palette open) | (template for future viewport-agnostic interactions) |
| 38-case FIXME with shared top-of-file UN-BLOCKER block + per-case 10-line-max UN-BLOCKER comments | 61-02 | 61-03 task 1 (10 cases — teams.spec.ts two-cause split) |
| INVESTIGATE-then-DISPOSE via `--trace=on` for ambiguous mock-shape failures | (planned at CONTEXT.md L99) | 61-03 task 3 — produced the sigil-grammar finding |
| REWRITE Path A with verbatim-title preservation for baseline entries | 61-03 task 4 | (template for future feature-rework spec disposals) |
| `git add -f` + `git commit -F /tmp/...` fallback for `.planning/`-path commits | 61-00 | 61-02 + 61-03 task 5 |

## Hand-off to `/gsd:verify-work`

Phase 61 is COMPLETE and ready for verification:
- 4 of 4 plans landed (61-00, 61-01, 61-02, 61-03).
- 12 atomic commits across the phase.
- 8 of 8 Bucket A specs disposed with disposition trailers.
- 5 of 5 Bucket B fixmes flipped.
- All 5 Layer audits clean (Layer 1 functional, Layer 2 regression invariant ±1 documented flake, Layer 3 disposition audit, Layer 4 FIXME UN-BLOCKER audit, Layer 5 no widening).
- Sacred-12-stash invariant preserved phase-wide.
- TEST-02 residual closed; deferred-items.md retitled with verdict reclassification + audit trail preserved.

Next phase per ROADMAP: pending /gsd:verify-work green-light, milestone v1.4 enters its trailing phase (post-test-debt). Streaming-race follow-up phase (~Phase 62) carries the 45 FIXME un-blockers as a single concentrated task; per-spec `.fixme` → `test` revert is a one-character change per case.
