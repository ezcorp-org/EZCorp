---
phase: 56-per-capability-ttl-ui
verified: 2026-05-11T19:05:00Z
status: passed
score: 6/6 must-haves verified
requirements_verified:
  - TTL-01
---

# Phase 56: Per-Capability TTL UI Verification Report

**Phase Goal:** Replace the 90-day hardcoded TTL with a per-capability user-chosen override surfaced at re-approve time, persisted additively on the existing `settings` JSONB row.

**Verified:** 2026-05-11T19:05:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Success Criteria from ROADMAP)

| #   | Truth                                                                                                                                                                                                          | Status     | Evidence                                                                                                                                                                                                            |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | In `ExpiredReapproveModal`, user can pick TTL from `1h / 6h / 1d / 7d / 30d / 90d / Never`; after re-approve, `ExpiredGrantsBanner` displays the picked TTL in human-readable units via `Intl.RelativeTimeFormat` | ✓ VERIFIED | `TTL_OPTIONS` (7 entries: 1h/6h/1d/7d/30d/90d/Never) exported from `expiry-copy.ts:46-54`; modal renders native `<select data-testid="expired-reapprove-ttl-picker">` (`ExpiredReapproveModal.svelte:135-145`); banner imports `formatTtl` and renders `expired {formatTtl(grant.ageMs, "past")}` + `Approved for {formatTtl(grant.ttlOverrideMs, "absolute")}` (`ExpiredGrantsBanner.svelte:112-119`); `formatTtl` uses `new Intl.RelativeTimeFormat("en", { numeric: "auto" })` (`relative-time.ts:81`)  |
| 2   | `AlwaysAllowRecord` carries `ttlOverrideMs`; sweep evaluator honors per-row override before TTL_CONFIG fallback                                                                                                | ✓ VERIFIED | `AlwaysAllowRecord` widened with `ttlOverrideMs?: number \| null; expiresAt?: number \| null` (`permissions.ts:278-293`); `readTtlOverrideMs` exported with three-branch parser (`permissions.ts:353-367`); sweep imports `readTtlOverrideMs` and short-circuits BEFORE TTL_CONFIG lookup (`perm-expiry-sweep.ts:532-536`)                                                                            |
| 3   | Both server endpoints (`/api/extensions/[id]/reapprove`, tool-permission) accept and persist the override                                                                                                       | ✓ VERIFIED | Settings endpoint: `parseTtlOverrideMs` validation (`reapprove/+server.ts:149`), `buildAlwaysAllowValue(true, now, { ttlOverrideMs, expiresAt })` persists row (`reapprove/+server.ts:278-281`); Chat endpoint: same validator (`tool-permission.ts:85-89`), threads via `resolvePermission({ ttlOverrideMs })` (`tool-permission.ts:172-176`) → `ApprovalResolution.ttlOverrideMs` (`permissions.ts:93`) → engine → `buildAlwaysAllowValue`        |
| 4   | Audit metadata captures `requestedTtl` + `appliedTtl`                                                                                                                                                          | ✓ VERIFIED | Settings-side audit: `requestedTtl: ttlOverrideMs ?? null` + `appliedTtl: ttlOverrideMs ?? null` recorded on `PERMISSION_REAPPROVED` event (`reapprove/+server.ts:364-365`); chat-side inherits via engine's `PERM_PROMPTED` audit row                                                                                                                                  |
| 5   | Sticky last-pick persists per-kind; defense-in-depth `scope=forever` admin gating UNTOUCHED                                                                                                                    | ✓ VERIFIED | Settings reapprove writes `user:<id>:reapprove:lastTtl:<kind>` when `ttlOverrideMs !== null && ttlOverrideMs !== undefined` (`reapprove/+server.ts:320-334`); chat-side parity in `tool-permission.ts:145-160`; GET expired-grants enriches with `stickyTtlMs` per row (`expired-grants/+server.ts:64-74`); settings page seeds modal `initialTtlMs={row.stickyTtlMs ?? DEFAULT_TTL_FIRST_USE_MS}` (`+page.svelte:480`); existing `requireRole(locals, "admin")` for `scope=forever` left intact (see 56-02 SUMMARY decisions)              |
| 6   | Never-suppression: picking Never does NOT update the sticky default                                                                                                                                            | ✓ VERIFIED | Conditional `if (ttlOverrideMs !== null && ttlOverrideMs !== undefined)` gates `upsertSetting` write on both endpoints (`reapprove/+server.ts:320`, `tool-permission.ts:145-146`); Pitfall 3 explicit                                                                                                                                                   |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact                                                                | Expected                                                                  | Status     | Details                                                                                                                                                                                                                |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `web/src/lib/components/permissions/expiry-copy.ts`                     | `TTL_OPTIONS` (7 entries) + `DEFAULT_TTL_FIRST_USE_MS` exported           | ✓ VERIFIED | 7 entries: `1h`, `6h`, `1d`, `7d`, `30d`, `90d`, `Never` (`null` value). `DEFAULT_TTL_FIRST_USE_MS = 30 * 24 * 60 * 60 * 1000`. Imports verified in modal + gate.                                                       |
| `web/src/lib/components/permissions/ExpiredReapproveModal.svelte`       | Native `<select data-testid="expired-reapprove-ttl-picker">` + `$derived` | ✓ VERIFIED | `initialTtlMs` prop (was `newTtlMs`); `selectedTtlMs = $state`; `$derived` recomputes `copy`; `onApproveDefault(selectedTtlMs)` widened signature.                                                                       |
| `web/src/lib/components/tool-cards/PermissionGate.svelte`               | Picker parity on expired branch                                           | ✓ VERIFIED | Same `data-testid` and `TTL_OPTIONS` import; forwards `selectedTtlMs` to `sendToolPermissionResponse(toolCall.id, true, scope, selectedTtlMs)` at line 148.                                                              |
| `web/src/lib/components/permissions/ExpiredGrantsBanner.svelte`         | Uses `formatTtl(ageMs, "past")` + per-row TTL display                     | ✓ VERIFIED | `import { formatTtl } from "$lib/utils/relative-time"`; "expired {formatTtl(grant.ageMs, 'past')}" + "Approved for {formatTtl(grant.ttlOverrideMs, 'absolute')}" / "Approved forever" branch.                            |
| `web/src/lib/utils/relative-time.ts`                                    | `formatTtl(ms, direction)` with `Intl.RelativeTimeFormat`                 | ✓ VERIFIED | Module-scope `RTF_EN = new Intl.RelativeTimeFormat("en", { numeric: "auto" })`; 3 direction modes (past/future/absolute → delegates to `humanizeDuration`); null → "Never"; sub-minute/NaN/Infinity → defense sentinels. |
| `src/extensions/permissions.ts`                                         | `AlwaysAllowRecord` widened + `readTtlOverrideMs` + `buildAlwaysAllowValue` options | ✓ VERIFIED | `ttlOverrideMs?: number \| null` + `expiresAt?: number \| null` on interface; `readTtlOverrideMs` three-branch helper; `buildAlwaysAllowValue(allowed, now, { ttlOverrideMs, expiresAt })`.                              |
| `src/extensions/perm-expiry-sweep.ts`                                   | Override precedence BEFORE TTL_CONFIG                                     | ✓ VERIFIED | Imports `readTtlOverrideMs`; `override === null → continue`; `override !== undefined → use override`; legacy fallback otherwise. `mapAlwaysAllowCapabilityToExpiryKind` exported for re-use.                            |
| `src/extensions/ttl-validate.ts`                                        | Shared `parseTtlOverrideMs` validator                                     | ✓ VERIFIED | Pure 3-branch parser exported; consumed by both endpoints (DRY).                                                                                                                                                       |
| `web/src/routes/api/extensions/[id]/reapprove/+server.ts`               | Accepts `ttlOverrideMs`, persists row + audit + sticky write              | ✓ VERIFIED | `parseTtlOverrideMs`; `buildAlwaysAllowValue` with options; audit `requestedTtl/appliedTtl`; `upsertSetting` Never-suppressed write.                                                                                    |
| `web/src/routes/api/extensions/[id]/expired-grants/+server.ts`          | Enriches each row with `stickyTtlMs`                                      | ✓ VERIFIED | `getSetting` (try/catch wrapped); maps capability → `capabilityKind`; `stickyTtlMs: number \| null` returned per row.                                                                                                  |
| `src/routes/tool-permission.ts`                                         | Chat-side parity                                                          | ✓ VERIFIED | `parseTtlOverrideMs`; `resolvePermission({ ttlOverrideMs })`; sticky write via `getPendingExtensionGate` + `mapAlwaysAllowCapabilityToExpiryKind`.                                                                      |
| `src/runtime/tools/permissions.ts`                                      | `ApprovalResolution.ttlOverrideMs` + `resolvePermission` options arg      | ✓ VERIFIED | Interface widened; 4th-arg options threaded into resolution.                                                                                                                                                           |
| `web/src/routes/(app)/extensions/[id]/+page.svelte`                     | Seeds `initialTtlMs={row.stickyTtlMs ?? DEFAULT_TTL_FIRST_USE_MS}`        | ✓ VERIFIED | `DEFAULT_NEW_TTL_MS` removed; `ReapproveTarget.stickyTtlMs` field added; modal instantiation at line 480 reads sticky.                                                                                                  |
| `web/e2e/v1.3-permission-backbone.spec.ts`                              | `ttl picker` describe block (test.fixme stubs)                            | ✓ VERIFIED | `test.describe("ttl picker", ...)` at line 1046 with 2 `test.fixme` cases (lines 1047, 1170); rationale comment block documents un-blocker condition for Phase 59 TEST-03.                                              |

### Key Link Verification

| From                                  | To                                                  | Via                                                              | Status   | Details                                                                                              |
| ------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `ExpiredReapproveModal.svelte`        | `expiry-copy.ts` (`TTL_OPTIONS`)                    | `import { TTL_OPTIONS, DEFAULT_TTL_FIRST_USE_MS, ... }`          | ✓ WIRED  | Import at line 42-50; iterated in `{#each TTL_OPTIONS as opt}` at line 141.                          |
| `PermissionGate.svelte`               | `expiry-copy.ts` (`TTL_OPTIONS`)                    | `import { TTL_OPTIONS, DEFAULT_TTL_FIRST_USE_MS, ... }`          | ✓ WIRED  | Import at line 7; iterated in template at line 256.                                                  |
| `ExpiredGrantsBanner.svelte`          | `relative-time.ts` (`formatTtl`)                    | `import { formatTtl } from "$lib/utils/relative-time"`           | ✓ WIRED  | Import at line 22; used at lines 112, 119.                                                           |
| `perm-expiry-sweep.ts`                | `permissions.ts` (`readTtlOverrideMs`)              | `import { readTtlOverrideMs } from "./permissions"`              | ✓ WIRED  | Import at line 64; used at line 532 in `runSweep` per-row branch.                                    |
| `reapprove/+server.ts`                | `permissions.ts` (`buildAlwaysAllowValue`)          | `buildAlwaysAllowValue(true, now, { ttlOverrideMs, expiresAt })` | ✓ WIRED  | Import at line 15; called at line 278.                                                               |
| `tool-permission.ts`                  | `runtime/tools/permissions.ts` (`resolvePermission`)| `resolvePermission(..., { ttlOverrideMs })`                      | ✓ WIRED  | Import at line 10; called at line 172-176.                                                           |
| `reapprove/+server.ts`                | `settings.ts` (`upsertSetting`)                     | `upsertSetting("user:<id>:reapprove:lastTtl:<kind>", value)`     | ✓ WIRED  | Conditional write at line 320-334.                                                                   |
| `tool-permission.ts`                  | `settings.ts` (`upsertSetting`)                     | Same sticky-KV key shape via gate-derived kind                   | ✓ WIRED  | Lines 145-160 with `getPendingExtensionGate` + `mapAlwaysAllowCapabilityToExpiryKind`.               |
| `expired-grants/+server.ts`           | `settings.ts` (`getSetting`)                        | Per-row `getSetting` → `stickyTtlMs`                              | ✓ WIRED  | Lines 64-74; try/catch defensive.                                                                    |
| `+page.svelte`                        | `expiry-copy.ts` (`DEFAULT_TTL_FIRST_USE_MS`)       | `initialTtlMs={row.stickyTtlMs ?? DEFAULT_TTL_FIRST_USE_MS}`      | ✓ WIRED  | Import at line 11; modal seed at line 480.                                                            |

### Requirements Coverage

| Requirement | Source Plan(s)         | Description                                                                                                                                                                          | Status      | Evidence                                                                                                          |
| ----------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------- |
| TTL-01      | 56-00, 56-01, 56-02, 56-03 | Per-capability TTL override at re-approve time, persisted additively on settings JSONB (`ttlOverrideMs?: number`); sweep honors override before TTL_CONFIG; banner uses `Intl.RelativeTimeFormat` | ✓ SATISFIED | All 6 truths verified above. 4 success criteria from ROADMAP green. `requirements-completed: [TTL-01]` declared in 56-01, 56-02, 56-03 SUMMARYs. |

**No orphaned requirements.** REQUIREMENTS.md and ROADMAP.md both map Phase 56 to exactly `TTL-01`; all four plan SUMMARYs declare TTL-01 in their `requirements` frontmatter.

### Anti-Patterns Found

| File                                              | Line | Pattern                                                          | Severity | Impact                                                                                                                                                                                                                |
| ------------------------------------------------- | ---- | ---------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `web/e2e/v1.3-permission-backbone.spec.ts`        | 1047, 1170 | `test.fixme` ttl-picker cases                                  | ℹ️ Info  | Documented deferred (Phase 59 TEST-03). Component + endpoint + route coverage is comprehensive in vitest+bun-test layers; user-flow stub documented with precise un-blocker condition. Not a blocker for TTL-01.       |
| `src/__tests__/extension-audit-actions.test.ts`   | n/a  | Pre-existing exhaustive-set drift (`MCP_SECCOMP_VIOLATION`)      | ℹ️ Info  | Pre-Phase-56 (Phase 55-03 origin per `git log`). Documented in `deferred-items.md`; owned by Phase 59 TEST-04. Out of scope per SCOPE BOUNDARY rule.                                                                  |
| `src/__tests__/tool-permission-handler.test.ts` / `tool-permission-forever-admin-gate.test.ts` | n/a | bun-test `mock.module` pollution between two test files when run in same invocation | ℹ️ Info | Both pass independently; documented in `deferred-items.md`; owned by Phase 59 TEST-04.                                                                                                                                |
| Bun 1.3.11                                        | n/a  | `mcp-e2e.test.ts` SIGSEGV (BUN-01)                               | ℹ️ Info  | Pre-existing platform bug; deferred to v1.5 per project memory.                                                                                                                                                       |

**No blocker or warning anti-patterns found.** All issues are pre-existing or explicitly deferred per documented scope boundaries.

### Human Verification Required

None. All success criteria are automated-test-verifiable at the component (vitest), endpoint (vitest server), and unit (bun-test) layers. The two end-user flow cases that would normally require human verification (pick 7d → approve → banner; refresh → modal defaults to 7d sticky) are documented as `test.fixme` with a precise un-blocker condition for Phase 59 TEST-03 — this is an intentional, documented deferral, not a verification gap.

### Verification Method Summary

**Static code verification (all GREEN):**
- `TTL_OPTIONS` literal grep confirmed 7 entries with correct codes and values, including `null` for Never.
- Modal + PermissionGate both grep-confirm to share the same `data-testid="expired-reapprove-ttl-picker"` selector and `TTL_OPTIONS` source.
- Banner grep-confirms `formatTtl(grant.ageMs, "past")` for "expired N ago" and `formatTtl(grant.ttlOverrideMs, "absolute")` / `"Approved forever"` per-row TTL.
- Sweep evaluator grep-confirms `readTtlOverrideMs` precedence BEFORE TTL_CONFIG fallback.
- Both endpoints grep-confirm `parseTtlOverrideMs` validation + `buildAlwaysAllowValue` with options + `upsertSetting` Never-suppressed sticky write.
- Audit grep-confirms `requestedTtl` + `appliedTtl` recorded on `PERMISSION_REAPPROVED`.
- `Intl.RelativeTimeFormat("en", { numeric: "auto" })` confirmed at module scope (Pitfall 5 locale pin).

**Live test verification (all GREEN):**
- `bun test src/__tests__/always-allow-value-shape.test.ts src/__tests__/perm-expiry-sweep.test.ts`: 105/105 pass.
- `bun test src/__tests__/tool-permission-handler.test.ts`: 5/5 pass.
- `cd web && bunx vitest run` for `relative-time.test.ts`, `expired-grants-banner.component.test.ts`, `sticky-last-ttl-pick.test.ts`, `expired-reapprove-modal.component.test.ts`, `extensions-reapprove-route.test.ts`, `extension-permission-modal-expired-branch.component.test.ts`: 51/51 pass across 6 files.
- `bunx playwright test ... -g "ttl picker" --list`: lists 2 cases (both `test.fixme`, as designed).

**Commit verification (all 11 commits found in git log):**
- `232ce73`, `85fbd90`, `a16ec9f` (Plan 56-00 Wave 0 tests)
- `2637aa3`, `60a39a7` (Plan 56-01 backend additive shape + sweep)
- `15ec056`, `39fafc3`, `c5f23c6` (Plan 56-02 picker + endpoints)
- `46f8657`, `39703fa`, `6575c45` (Plan 56-03 formatTtl + sticky + e2e fixme rationale)

### Gaps Summary

No gaps. All 6 observable truths verified at all three levels (exists, substantive, wired). Requirement TTL-01 fully satisfied across all four plans. The four ROADMAP success criteria are individually mapped to passing tests + production wiring:

1. **Picker + banner display** (criteria #1): `TTL_OPTIONS` 7-option picker on both surfaces + `formatTtl` banner rendering — Plans 56-02 + 56-03.
2. **Sweep precedence** (criteria #2): `readTtlOverrideMs` short-circuit BEFORE `TTL_CONFIG[kind]`/`foreverTtlMs` — Plan 56-01.
3. **Never = null + null** (criteria #3): JSONB row carries `ttlOverrideMs: null` + `expiresAt: null` on Never; sweep skips — Plans 56-01 + 56-02 + 56-03 (also Never-suppressed sticky write).
4. **Audit metadata** (criteria #4): `requestedTtl` + `appliedTtl` recorded on `PERMISSION_REAPPROVED` (settings) and `PERM_PROMPTED` (chat-side) — Plan 56-02.

Defense-in-depth on `scope=forever` admin gating verified UNTOUCHED: existing `requireRole(locals, "admin")` call remains; picker `Never` on non-forever scope is explicitly NOT scope escalation (tested cases #6 and #7 in `extensions-reapprove-route.test.ts`).

Deferred items (documented in `deferred-items.md`, NOT counted as gaps):
- E2E `ttl picker` describe block stays `test.fixme` until Phase 59 TEST-03 lands fixture seam (Outcome B per Plan 56-03 Task 3).
- Pre-existing `extension-audit-actions` exhaustive-set drift (Phase 55-03 origin) — Phase 59 TEST-04.
- Pre-existing bun-test `mock.module` pollution between handler + forever-admin-gate tests — Phase 59 TEST-04.
- Bun 1.3.11 `mcp-e2e` SIGSEGV (BUN-01) — deferred to v1.5.

---

_Verified: 2026-05-11T19:05:00Z_
_Verifier: Claude (gsd-verifier)_
