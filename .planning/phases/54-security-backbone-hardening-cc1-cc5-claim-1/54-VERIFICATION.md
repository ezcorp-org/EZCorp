---
phase: 54-security-backbone-hardening-cc1-cc5-claim-1
verified: 2026-05-11T04:20:00Z
status: passed
score: 5/5 success criteria verified
gaps: []
human_verification:
  - test: "Boot with EZCORP_PGLITE_DELAY_MS=200, trigger first conversation event"
    expected: "lessons-distiller and memory-extractor boot-spawn flows fire without being denied; audit log shows cache HIT paths"
    why_human: "Requires intentionally lagged PGlite boot in a live environment; cannot be scripted in unit tests"
  - test: "Simulate a real post-cache DB outage; observe audit_log"
    expected: "audit_log gains metadata.reason='override-lookup-failed' deny rows; NO silent registry-grant fallback"
    why_human: "Requires a live DB failure condition (not PGlite warm-up race), integration environment only"
  - test: "Click a messageToolbar button in the chat UI; check audit drill-down"
    expected: "audit_log row with action='ext:perm:allowed', metadata.toolName='ezcorp/append-message', metadata.capabilityKind='ezcorp:chat:append'"
    why_human: "e2e spec is test.fixme'd (see 54-03-SUMMARY.md Deviation 3) — current mock-fixture harness has no live backend writing to audit_log; v1.5 e2e infra required"
---

# Phase 54: Security Backbone Hardening (CC1–CC5 + Claim-1) Verification Report

**Phase Goal**: Close all six v1.3 security-review findings (5 LOW CCs + Claim-1 MEDIUM caveat) without breaking bundled-extension boot-spawn under PGlite warm-up lag.
**Verified**: 2026-05-11T04:20:00Z
**Status**: PASSED
**Re-verification**: No — initial verification

---

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | PGlite warm-up lag absorbed — bundled boot-spawn flows fire on first eligible event | VERIFIED | `overrideCache` module-scope Map in `permission-engine.ts:79`; `primeConversationOverrideCache` called by `addConversationExtensions:99`; 3/3 cache tests pass including warm-up simulation |
| 2 | Post-cache override-lookup failure → `{decision: "deny", reason: "override-lookup-failed"}` + audit row; silent registry-grant widening gone | VERIFIED | `authorize()` try/catch at `permission-engine.ts:248-264`; `loadConversationOverride` no longer has try/catch (throws); `permission-engine-override-fail-closed.test.ts` 3/3 pass |
| 3 | Audit-write failure emits `logger.error("PermissionEngine: audit-write failure", {...})` | VERIFIED | `permission-engine.ts:646`; `logger.error` called with `{action, extensionId, capabilityKind, error}`; `permission-engine-audit-fail-observable.test.ts` 2/2 pass (stderr output confirmed) |
| 4 | 51st parallel ezcorp/invoke in same conversation rejected with "Per-conversation call-depth cap exceeded"; audit row emitted | VERIFIED | `tool-executor.ts:109-114,901-929`; `MAX_CALL_DEPTH_PER_CONVERSATION=50`; `conversationCallDepth Map`; `tool-executor-per-conversation-depth.test.ts` 4/4 pass |
| 5 | `audit_log.action=PERMISSION_REAPPROVED` on reapprove; `isInternalHost("localhost.evil.com")` returns false; messageToolbar emits PERMISSION_CHECK audit row | VERIFIED | `audit-actions.ts:24`; `INTERNAL_HOST_RE` anchored at `internal-host.ts:42`; `events/[event]/+server.ts:387` wires `engine: getPermissionEngine()`; all corresponding tests pass |

**Score**: 5/5 success criteria verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/extensions/permission-engine.ts` | TTL cache, prime export, _reset export, cache-read in loadConversationOverride, override-lookup-failed deny, logger.error in writeAuditRow catch | VERIFIED | All patterns present at lines 57-107, 248-264, 467-479, 646 |
| `src/db/queries/conversation-extensions.ts` | `primeConversationOverrideCache` called for entries with `effectiveGrantedPermissions` | VERIFIED | Import at line 5; call at line 99 |
| `src/__tests__/permission-engine-conversation-override-cache.test.ts` | 3 tests: prime+hit, TTL expiry, re-anchored fail-CLOSED test 3 | VERIFIED | 259 lines; 3/3 pass; Test 3 re-anchored for post-SEC-01-swap semantic |
| `src/extensions/tool-executor.ts` | `MAX_CALL_DEPTH_PER_CONVERSATION`, `conversationCallDepth Map`, `_resetConversationCallDepthForTests` export | VERIFIED | Lines 109-114; `setCurrentConversationId` test setter at line 334 |
| `src/extensions/audit-actions.ts` | `PERMISSION_REAPPROVED: "ext:permission-reapproved"` | VERIFIED | Line 24 |
| `src/extensions/runtime/internal-host.ts` | `INTERNAL_HOST_RE` anchored with `localhost(?:$|:)` | VERIFIED | Line 42; anchored alternative confirmed |
| `web/src/routes/api/extensions/[id]/reapprove/+server.ts` | Writes `EXT_AUDIT_ACTIONS.PERMISSION_REAPPROVED` | VERIFIED | Line 215 |
| `web/src/routes/api/extensions/[name]/events/[event]/+server.ts` | `engine: getPermissionEngine()` in ctx at line 387 | VERIFIED | Line 387 confirmed |
| `src/__tests__/permission-engine-override-fail-closed.test.ts` | SEC-01 swap test: cache miss + DB throw → deny + audit row | VERIFIED | 189 lines; 3/3 pass |
| `src/__tests__/permission-engine-audit-fail-observable.test.ts` | SEC-02 test: insertAuditEntry throws → logger.error invoked | VERIFIED | 173 lines; 2/2 pass |
| `src/__tests__/tool-executor-per-conversation-depth.test.ts` | SEC-03 test: 50 in-flight + 51st rejected; per-conv isolation; counter decrements | VERIFIED | 292 lines; 4/4 pass |
| `src/__tests__/network-handler.test.ts` | SEC-05 describe block with 4 localhost anchor cases | VERIFIED | Lines 448-465; 24/24 total pass (14 baseline + 10 new) |
| `web/src/__tests__/cap-expiry-flow.server.test.ts` | SEC-04 describe block: reapprove → PERMISSION_REAPPROVED; no PERMISSION_GRANTED | VERIFIED | Lines 569-602; 19/19 pass |
| `src/__tests__/append-message-handler-pdp.test.ts` | SEC-06 unit tests: engine wired allow/deny, legacy fallback | VERIFIED | 289 lines; 3/3 pass |
| `web/src/__tests__/extensions-events-route.test.ts` | SEC-06 route tests: ctx.engine === singleton identity assertion | VERIFIED | 3 new cases under SEC-06 describe; 43/43 pass |
| `web/e2e/v1.3-permission-backbone.spec.ts` | SEC-06 e2e describe block | VERIFIED (partial) | 2 `test.fixme`'d cases with full assertion sketches; e2e deferred to v1.5 infra |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `conversation-extensions.ts:addConversationExtensions` | `permission-engine.ts:primeConversationOverrideCache` | direct call when `effectiveGrantedPermissions` defined | WIRED | Import line 5; call line 99 |
| `permission-engine.ts:loadConversationOverride` | `overrideCache.get(cacheKey)` | cache read BEFORE DB query | WIRED | Lines 467-472; no `try/catch` around the cache read |
| `permission-engine.ts:loadConversationOverride catch` → `authorize()` | `{decision: "deny", reason: "override-lookup-failed"}` | DB throw bubbles up; authorize catches at lines 248-264 | WIRED | `override-lookup-failed` string at lines 259, 438, 475 |
| `permission-engine.ts:writeAuditRow catch` | `logger.error("PermissionEngine: audit-write failure", {...})` | logger.error at line 646 | WIRED | Confirmed by test 2/2 pass with stderr output |
| `tool-executor.ts:handlePiInvoke` | `conversationCallDepth Map` increment + cap check + finally decrement | module-scope Map at line 110; cap check 901-929; finally 1134-1136 | WIRED | `AUDIT_PERM_DENIED` imported from `./audit-actions` (not `./permission-engine`) — correct canonical path |
| `web/...reapprove/+server.ts:215` | `EXT_AUDIT_ACTIONS.PERMISSION_REAPPROVED` | direct constant reference | WIRED | Line 215; confirmed by SEC-04 test |
| `web/...events/[event]/+server.ts:367-387 ctx` | `append-message-handler.ts:197 ctx.engine PDP path` | `engine: getPermissionEngine()` at line 387 | WIRED | Route-level identity assertion via MOCK_ENGINE in 43-test suite |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SEC-01 | 54-01 (cache), 54-02 (swap) | PDP returns deny (not silent registry-grant widening) when override lookup fails; TTL cache prevents PGlite warm-up flakes | SATISFIED | Cache: `permission-engine.ts:79-107`; swap: `permission-engine.ts:248-264,467-480`; tests: 3+3 pass; REQUIREMENTS.md marked `[x]` |
| SEC-02 | 54-02 | Audit-write failures emit structured logger.error | SATISFIED | `permission-engine.ts:646`; `permission-engine-audit-fail-observable.test.ts` 2/2 pass; REQUIREMENTS.md marked `[x]` |
| SEC-03 | 54-02 | Per-conversation MAX_CALL_DEPTH via module-scope Map | SATISFIED | `tool-executor.ts:109-114,901-929`; `tool-executor-per-conversation-depth.test.ts` 4/4 pass; REQUIREMENTS.md marked `[x]` |
| SEC-04 | 54-02 | PERMISSION_REAPPROVED audit action for re-approvals | SATISFIED | `audit-actions.ts:24`; reapprove handler line 215; `cap-expiry-flow.server.test.ts` 19/19 pass; REQUIREMENTS.md marked `[x]` |
| SEC-05 | 54-02 | internal-host.ts regex anchors localhost | SATISFIED | `internal-host.ts:42` anchored; `network-handler.test.ts` 24/24 pass; REQUIREMENTS.md marked `[x]` |
| SEC-06 | 54-03 | messageToolbar wires engine: getPermissionEngine() | SATISFIED | `events/[event]/+server.ts:387`; route+handler tests 43+3 pass; e2e fixme'd per infra limitation; REQUIREMENTS.md marked `[x]` |

No orphaned requirements. All 6 SEC-XX IDs from `files_modified` frontmatter and REQUIREMENTS.md are accounted for and resolved.

**ROADMAP metadata note**: `54-03-PLAN.md` shows `[ ]` (unchecked) in ROADMAP.md at line 136, but commit `0e69a2c` exists on mainline with the completed implementation and all tests pass. This is a documentation artifact (the checkbox was not updated after plan execution) and does not affect goal achievement. The plan's `requirements-completed: [SEC-06]` in 54-03-SUMMARY.md, the REQUIREMENTS.md `[x]` entries, and all passing tests confirm closure.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `web/e2e/v1.3-permission-backbone.spec.ts` | ~796 | `test.fixme` SEC-06 e2e cases | Info | Intentional; full rationale documented in 54-03-SUMMARY.md; route+handler layer coverage is complete; e2e requires v1.5 infra |

No stubs, placeholder implementations, empty handlers, or blocking anti-patterns found.

---

### Human Verification Required

#### 1. PGlite Warm-up Lag Absorption (Live Boot Probe)

**Test**: Start the application with `EZCORP_PGLITE_DELAY_MS=200` and trigger the first eligible conversation event.
**Expected**: `lessons-distiller` and `memory-extractor` boot-spawn flows fire successfully; audit log shows cache HIT paths; no deny rows with `reason: "override-lookup-failed"`.
**Why human**: Requires a live PGlite-delayed boot environment. The unit test simulates the cache-absorption path but cannot replicate the full boot-spawn orchestration timing.

#### 2. Post-Cache DB Outage Audit Trail

**Test**: In a live environment, force a real DB failure after cache warm-up (not PGlite lag); observe `audit_log`.
**Expected**: Deny rows with `action=ext:perm:denied`, `metadata.reason="override-lookup-failed"`, `metadata.underlyingError` populated.
**Why human**: Requires a controlled live DB failure; not replicable in unit tests without mocking the exact post-cache error path (which is covered, but the live audit_log read-back is human-only).

#### 3. messageToolbar Audit Row (Live UI Flow)

**Test**: Open chat UI, click a messageToolbar button (e.g. kokoro-tts speak), then query `/api/audit?extensionId=kokoro-tts&action=ext:perm:allowed`.
**Expected**: At least one row with `metadata.toolName="ezcorp/append-message"`, `metadata.capabilityKind="ezcorp:chat:append"`, `metadata.conversationId` matching the active conversation.
**Why human**: The e2e spec (`web/e2e/v1.3-permission-backbone.spec.ts`) has `test.fixme`'d SEC-06 cases because the mock-fixture harness intercepts all `/api/**` calls with canned responses — no live backend writes to `audit_log`. This is the v1.5 e2e infra gap documented in 54-03-SUMMARY.md Deviation 3.

---

### Gaps Summary

No gaps blocking goal achievement. All six v1.3 security-review findings are closed on mainline:

- **CC1 (SEC-01)**: Two-step close: cache (Plan 01, commit `3420a04`) + swap (Plan 02, commit `608bd74`). The cache absorbs PGlite warm-up lag; the swap makes post-cache failures strictly fail-closed.
- **CC2 (SEC-02)**: `writeAuditRow` catch wired to `logger.error` (Plan 02, commit `608bd74`). Dropped audit rows now appear in stderr + `error_logs`.
- **CC3 (SEC-03)**: Per-conversation `MAX_CALL_DEPTH_PER_CONVERSATION=50` via module-scope Map + try/finally decrement (Plan 02, commit `608bd74`).
- **CC4 (SEC-04)**: `PERMISSION_REAPPROVED` constant + reapprove handler switch (Plan 02, commit `608bd74`).
- **CC5 (SEC-05)**: `INTERNAL_HOST_RE` anchored with `localhost(?:$|:)` (Plan 02, commit `608bd74`).
- **Claim-1 (SEC-06)**: `engine: getPermissionEngine()` wired into messageToolbar ctx (Plan 03, commit `0e69a2c`). Route+handler unit tests confirm wiring; e2e deferred to v1.5 infra per established `test.fixme` pattern.

The only outstanding item is the ROADMAP.md checkbox for `54-03-PLAN.md` remaining `[ ]` — this is a metadata artifact, not a goal-achievement gap.

---

_Verified: 2026-05-11T04:20:00Z_
_Verifier: Claude (gsd-verifier)_
