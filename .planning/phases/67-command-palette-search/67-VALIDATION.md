---
phase: 67
slug: command-palette-search
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-30
---

# Phase 67 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (backend/pure)** | `bun test` (`bun:test`) — runs from repo root |
| **Framework (web component/server)** | `vitest` via `bunx vitest run` — **MUST run from `web/`** (wrong config from root fails 1100+ files) |
| **Framework (e2e)** | Playwright — `bunx playwright test` from `web/`, projects `chromium` + `mobile-chromium`; preview rebuild+restart required for SUT Svelte edits |
| **Config file** | `scripts/coverage-thresholds.json` (per-file 100% on new paths); `web/vitest.config.ts`; `web/playwright.config.ts` |
| **Quick run command** | `bun test src/__tests__/message-search.test.ts` (backend) · `cd web && bunx vitest run src/__tests__/<file>` (web) |
| **Full suite command** | `bun run test:coverage` |
| **Estimated runtime** | ~backend <10s targeted; web vitest shard ~30–60s; e2e ~60–120s |

---

## Sampling Rate

- **After every task commit:** Run the single targeted file command for the layer touched (e.g. `bun test src/__tests__/message-search.test.ts`, or `cd web && bunx vitest run src/__tests__/CommandPalette.component.test.ts`).
- **After every plan wave:** Run the web vitest shard + bun search suites + the new e2e spec on both `chromium` and `mobile-chromium`.
- **Before `/gsd:verify-work`:** Per-file 100% coverage green on all new paths (`scripts/test-coverage.sh`); full suite green.
- **Max feedback latency:** ~120 seconds (e2e on both projects).

---

## Per-Task Verification Map

| Req ID | Behavior | Test Type | Automated Command | File Exists |
|--------|----------|-----------|-------------------|-------------|
| PAL-01 | `scope=all` query returns hits across the user's projects | unit (DB) | `bun test src/__tests__/message-search.test.ts` | ✅ extend |
| PAL-01 | cross-project query does NOT leak other users' projects | unit (DB) | `bun test src/__tests__/message-search.test.ts` | ✅ extend |
| PAL-01 | cross-project ANN keeps HNSW index, tenant filter inside scan, no Seq Scan | unit (DB EXPLAIN) | `bun test src/__tests__/message-search-explain.test.ts` | ✅ extend |
| PAL-01 | hit carries `projectId` + `projectName` | unit (DB) | `bun test src/__tests__/message-search.test.ts` | ✅ extend |
| PAL-01 | endpoint: `scope=all` doesn't require projectId; `scope=project` keeps 400 | integration (server) | `cd web && bunx vitest run src/__tests__/api-search-messages.server.test.ts` | ❌ W0 |
| PAL-01 | `searchMessages` (client) passes `scope`, forwards `projectId`+`projectName` | unit (client) | `cd web && bunx vitest run src/__tests__/api-search-messages.client.test.ts` | ❌ W0 |
| PAL-02 | `palette-commands` action exists; merge-by-action preserves overrides for `palette` AND `palette-commands` | unit | `cd web && bunx vitest run src/lib/__tests__/shortcuts.test.ts` | ✅ extend |
| PAL-02 | `(app)/+layout.svelte` routes `palette` / `palette-commands` to correct initial view | unit | `cd web && bunx vitest run src/__tests__/app-layout-palette-shortcut.test.ts` | ❌ W0 |
| PAL-03 | grouping: commands / in-this-conv / other(project→conv); headers NOT in flatItems | unit (pure) | `cd web && bunx vitest run src/lib/search/__tests__/palette-results.test.ts` | ❌ W0 |
| PAL-03 | no-active-conversation → single "Messages" section | unit (pure) | `cd web && bunx vitest run src/lib/search/__tests__/palette-results.test.ts` | ❌ W0 |
| PAL-03/04 | component renders sections + match-type glyph + role badge + snippet | component | `cd web && bunx vitest run src/__tests__/CommandPalette.component.test.ts` | ❌ W0 |
| PAL-04 | snippet sanitized through `sanitizeSnippet` (no raw HTML) | component / pure | `cd web && bunx vitest run src/__tests__/CommandPalette.component.test.ts` | ❌ W0 / ✅ existing helper |
| PAL-05 | message-row select builds `/project/<hit.projectId>/chat/<convId>?m=<msgId>` | component | `cd web && bunx vitest run src/__tests__/CommandPalette.component.test.ts` | ❌ W0 |
| PAL-05 | full deep-link journey: click cross-project result → scroll + pulse + `?m=` stripped | e2e | `cd web && bunx playwright test e2e/command-palette-search.spec.ts` | ❌ W0 |
| PAL-06 | arrow nav skips headers, lands on commands+hits; Enter row-type-aware; `ez:` wins | component | `cd web && bunx vitest run src/__tests__/CommandPalette.component.test.ts` | ❌ W0 |
| PAL-06 | ARIA dialog + focus trap + focus restore on close | component / e2e | CommandPalette.component + e2e | ❌ W0 |
| PAL-07 | `<lg` renders palette inside BottomSheet; same section structure; single Escape closes; input auto-focused | e2e (mobile-chromium) | `cd web && bunx playwright test e2e/command-palette-search.spec.ts --project=mobile-chromium` | ❌ W0 |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `web/src/lib/search/palette-results.ts` + `…/__tests__/palette-results.test.ts` — pure cross-project section/group builder (PAL-03), 100%-pinned.
- [ ] `web/src/__tests__/CommandPalette.component.test.ts` — component test (sections, glyph, role badge, snippet sanitize, arrow-skip-headers, row-type Enter, deep-link URL, ARIA/focus). Largest new test file.
- [ ] `web/src/__tests__/api-search-messages.server.test.ts` — verify/create; `scope=all` (no projectId) + `scope=project` (400) + projectId/projectName passthrough.
- [ ] `web/src/__tests__/api-search-messages.client.test.ts` — verify/create; `scope` forwarding + new fields.
- [ ] `web/src/__tests__/app-layout-palette-shortcut.test.ts` — `palette` vs `palette-commands` routing (mirror `app-layout-agents-nav.test.ts` precedent).
- [ ] `web/e2e/command-palette-search.spec.ts` — Cmd+K / Cmd+Shift+P, cross-project deep-link journey, BottomSheet at mobile-chromium; reuse Phase 66 `/api/search/messages` mock + `makeSearchHit` (now with `projectId`/`projectName`).
- [ ] Extend `src/__tests__/message-search.test.ts` (cross-project + cross-user-leak + projectId/projectName) and `src/__tests__/message-search-explain.test.ts` (multi-project EXPLAIN).
- [ ] Extend `web/src/lib/__tests__/shortcuts.test.ts` (palette-commands present + override-survives); update `command-registry.test.ts` / `commands.test.ts` for `search-conversations` removal.
- Framework install: none (all frameworks present).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `Cmd+Shift+P` not intercepted by browser private-window shortcut | PAL-02 | Browser-level binding; `e.preventDefault()` mitigation is verified by e2e in chromium but real-browser behavior across OSes is environmental | Open app in Chrome/Firefox, press Cmd+Shift+P (Ctrl+Shift+P), confirm palette opens command-first and no private window appears |
| Cross-project RRF ranking "honesty" | PAL-01 | No labeled relevance corpus exists; RANK-01 normalization deferred | Spot-check that cross-project results are plausibly ordered; correctness (no leak, returns hits) is automated |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
