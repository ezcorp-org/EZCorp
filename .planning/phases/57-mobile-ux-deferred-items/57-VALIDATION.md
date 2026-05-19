---
phase: 57
slug: mobile-ux-deferred-items
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-11
updated: 2026-05-11
---

# Phase 57 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Detailed sampling matrices (rows × columns) live in `57-RESEARCH.md` → `## Validation Architecture`. This document is the contract surface the planner has filled in.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (component/unit)** | Vitest 4.1.5 + jsdom 29.0.2 + @testing-library/svelte 5.3.1 |
| **Framework (e2e)** | Playwright 1.58.2 (`@playwright/test`) |
| **Framework (backend)** | `bun test` (Bun 1.x) |
| **Config (component)** | `web/vitest.config.ts` |
| **Config (e2e)** | `web/playwright.config.ts` |
| **Quick run command** | `cd web && bunx vitest run <path>` (component) or `bun test <path>` (backend) |
| **Full suite command** | `bun test && cd web && bash scripts/test.sh` |
| **Estimated runtime (quick)** | ~5–20 seconds per file |
| **Estimated runtime (full)** | ~6–10 minutes |

---

## Sampling Rate

- **After every task commit:** Run the file(s) named in the task's `<automated>` block.
- **After every plan wave:** Run all e2e + integration files added by that wave (per-wave merge commands listed in RESEARCH §Validation Architecture).
- **Before `/gsd:verify-work`:** Full suite must be green (`bun test && cd web && bash scripts/test.sh`).
- **Max feedback latency:** ≤ 30 seconds per task (component/unit); ≤ 90 seconds per e2e file.

---

## Per-Task Verification Map

Populated by the planner from the 6 PLAN files. Each `<task>` block's `<verify><automated>` command is the truth — the table below mirrors them for quick scan.

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 57-01-T1 | 01 | 0 | UX-01 | unit/component | `cd web && bunx vitest run src/lib/components/__tests__/BottomSheet.component.test.ts src/lib/__tests__/use-breakpoint.unit.test.ts` | ❌ W0 creates | ⬜ pending |
| 57-01-T2 | 01 | 0 | UX-02 + UX-03 + UX-04 | unit/integration/server | `bun test src/__tests__/db-migration-pg-trgm.test.ts src/__tests__/db-queries-marketplace-trgm.test.ts src/__tests__/marketplace-search-perf.test.ts src/__tests__/host-maintenance-gin-sweep.test.ts && cd web && bunx vitest run src/__tests__/agent-picker-prefs-route.server.test.ts src/lib/components/__tests__/ExtensionSearchPicker-reorder.component.test.ts` | ❌ W0 creates | ⬜ pending |
| 57-01-T3 | 01 | 0 | UX-01 + UX-02 + UX-03 + UX-04 | e2e | `cd web && bunx playwright test e2e/bottom-sheet-pickers.spec.ts e2e/marketplace-trgm-search.spec.ts e2e/agent-picker-prefs.spec.ts e2e/chip-reorder.spec.ts --list` | ❌ W0 creates | ⬜ pending |
| 57-02-T1 | 02 | 1 | UX-01 | unit (rune composable) | `cd web && grep -q "@abhivarde/svelte-drawer" package.json && bunx vitest run src/lib/__tests__/use-breakpoint.unit.test.ts` | ✅ (after W0) | ⬜ pending |
| 57-02-T2 | 02 | 1 | UX-01 | component | `cd web && bunx vitest run src/lib/components/__tests__/BottomSheet.component.test.ts` | ✅ (after W0) | ⬜ pending |
| 57-02-T3 | 02 | 1 | UX-01 | e2e (single picker smoke) | `cd web && bunx playwright test e2e/bottom-sheet-pickers.spec.ts --grep "assignment"` | ✅ (after W0) | ⬜ pending |
| 57-03-T1 | 03 | 2 | UX-01 | e2e (4 pickers) | `cd web && bunx playwright test e2e/bottom-sheet-pickers.spec.ts --grep "agent-search\|extension-attach\|extension-search\|model-search"` | ✅ (after W0) | ⬜ pending |
| 57-03-T2 | 03 | 2 | UX-01 | e2e (full 9-picker suite) | `cd web && bunx playwright test e2e/bottom-sheet-pickers.spec.ts` | ✅ (after W0) | ⬜ pending |
| 57-04-T1 | 04 | 2 | UX-02 | integration (migration) | `bun test src/__tests__/db-migration-pg-trgm.test.ts` | ✅ (after W0) | ⬜ pending |
| 57-04-T2 | 04 | 2 | UX-02 | integration + perf | `bun test src/__tests__/db-queries-marketplace-trgm.test.ts src/__tests__/marketplace-search-perf.test.ts` | ✅ (after W0) | ⬜ pending |
| 57-04-T3 | 04 | 2 | UX-02 | unit (daemon) | `bun test src/__tests__/host-maintenance-gin-sweep.test.ts` | ✅ (after W0) | ⬜ pending |
| 57-05-T1 | 05 | 2 | UX-04 | dependency presence | `cd web && grep -q "svelte-dnd-action" package.json && echo OK` | n/a | ⬜ pending |
| 57-05-T2 | 05 | 2 | UX-04 | component | `cd web && bunx vitest run src/lib/components/__tests__/ExtensionSearchPicker-reorder.component.test.ts` | ✅ (after W0) | ⬜ pending |
| 57-05-T3 | 05 | 2 | UX-04 | e2e (mouse + touch + keyboard + axe) | `cd web && bunx playwright test e2e/chip-reorder.spec.ts` | ✅ (after W0) | ⬜ pending |
| 57-06-T1 | 06 | 3 | UX-03 | server (Vitest) | `cd web && bunx vitest run src/__tests__/agent-picker-prefs-route.server.test.ts` | ✅ (after W0) | ⬜ pending |
| 57-06-T2 | 06 | 3 | UX-03 | e2e | `cd web && bunx playwright test e2e/agent-picker-prefs.spec.ts` | ✅ (after W0) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Sampling continuity check:** No 3 consecutive tasks without an `<automated>` block. Every task in every plan carries a `<verify><automated>` command (verified by `gsd-tools verify plan-structure` — all 6 plans pass with task counts 3/3/2/3/3/2).

---

## Wave 0 Requirements

Wave 0 ships RED test scaffolds (mirrors Phase 56's W0 discipline). The 12 files below do not exist yet and Plan 01 lands them FIRST so all subsequent waves can run their tests immediately:

- [ ] `web/src/lib/components/__tests__/BottomSheet.component.test.ts` — UX-01 (open/close/Escape/× button/backdrop/aria-modal/focus-trap/safe-area/44×44 touch) — Plan 01 Task 1
- [ ] `web/src/lib/__tests__/use-breakpoint.unit.test.ts` — UX-01 (matchMedia → reactive boolean; SSR-safe init) — Plan 01 Task 1
- [ ] `web/e2e/bottom-sheet-pickers.spec.ts` — UX-01 e2e (9 pickers × 2 breakpoints × 3 dismiss paths; iOS safe-area via webkit project; axe-core) — Plan 01 Task 3
- [ ] `src/__tests__/db-migration-pg-trgm.test.ts` — UX-02 (CREATE EXTENSION idempotent; CREATE INDEX idempotent; PGlite registers pg_trgm at construction; similarity() callable) — Plan 01 Task 2
- [ ] `src/__tests__/db-queries-marketplace-trgm.test.ts` — UX-02 (≤2-char short-circuit; ≥3-char similarity ranking; FTS-OR-trigram WHERE clause; typo recall) — Plan 01 Task 2
- [ ] `src/__tests__/marketplace-search-perf.test.ts` — UX-02 (1k-listing seed; p95 < 50 ms benchmark; explain-plan asserts GIN index used) — Plan 01 Task 2
- [ ] `src/__tests__/host-maintenance-gin-sweep.test.ts` — UX-02 (every-6th-tick sub-sweep; PGlite error tolerated in try/catch) — Plan 01 Task 2
- [ ] `web/e2e/marketplace-trgm-search.spec.ts` — UX-02 e2e (typo "iphne→iphone"; short-query alphabetical fallback) — Plan 01 Task 3
- [ ] `web/src/__tests__/agent-picker-prefs-route.server.test.ts` — UX-03 (GET shape; PUT round-trip; orphan-trim on read; no write-amplification when clean) — Plan 01 Task 2
- [ ] `web/e2e/agent-picker-prefs.spec.ts` — UX-03 e2e (save-search, pin-agent, reload, still-there; UI present in AgentSearchPicker but absent in other pickers) — Plan 01 Task 3
- [ ] `web/src/lib/components/__tests__/ExtensionSearchPicker-reorder.component.test.ts` — UX-04 (dndzone wiring; aria-label present; onfinalize emits correct order; keyboard hint string) — Plan 01 Task 2
- [ ] `web/e2e/chip-reorder.spec.ts` — UX-04 e2e (mouse + touch + keyboard reorder; persistence round-trip; Escape cancel; axe-core scan) — Plan 01 Task 3

**Framework install:** none needed — Vitest, Playwright, `bun test` all present per `web/package.json` and repo root.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| iOS Safari real-device safe-area honored (visual confirmation that BottomSheet sits above the home-indicator gesture bar) | UX-01 | Playwright webkit project approximates but doesn't render the actual iOS home indicator overlay | Manual smoke on iPhone (any iOS 17+) Safari: open each of the 9 pickers, confirm BottomSheet body is fully visible with no overlap on the home-indicator strip |
| PGlite p95 < 50 ms on 1k-listing seed (if benchmark in `marketplace-search-perf.test.ts` flags PGlite path as out-of-bounds) | UX-02 | Benchmark is automated, but if PGlite WASM can't hit the bar, the criterion may need to be split (external Postgres < 50 ms; PGlite best-effort) — that decision is human | If benchmark fails on PGlite path, escalate to user with split-report numbers; criterion gate is external Postgres path. Plan 04 SUMMARY must record both numbers. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify block referencing a file in Wave 0 (or an existing file)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all 12 MISSING test files above
- [x] No watch-mode flags (`--watch`, `vitest` without `run`)
- [x] Feedback latency < 30s per task commit
- [x] `nyquist_compliant: true` set in frontmatter once planner finished and Per-Task Verification Map is populated

**Approval:** plans complete — ready for `/gsd:check-plans` then `/gsd:execute-phase 57`.
