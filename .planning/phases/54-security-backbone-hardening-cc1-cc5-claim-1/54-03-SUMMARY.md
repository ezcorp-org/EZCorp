---
phase: 54-security-backbone-hardening-cc1-cc5-claim-1
plan: 03
subsystem: security
tags: [pdp, permission-engine, message-toolbar, append-message, sec-06, claim-1, ezcorp-chat-append, route-wiring]

# Dependency graph
requires:
  - phase: 54
    provides: Plan 02's SEC-01 fail-CLOSED swap + AUDIT_PERM_DENIED + AUDIT_PERM_ALLOWED on every authorize() decision; without this, wiring messageToolbar through the PDP would inherit pre-CC1 fail-OPEN behavior
provides:
  - SEC-06 (Claim-1 close-out): messageToolbar shortcut at events/[event]/+server.ts:367-371 wires `engine: getPermissionEngine()` into the AppendMessageContext, switching the gate from the legacy boolean fallback (append-message-handler.ts:213-215) to the PDP path (line 197)
  - 3 route-level SEC-06 cases in extensions-events-route.test.ts (ctx.engine === singleton for single + bulk; ≥2 getPermissionEngine() invocations per request)
  - 3 handler-level SEC-06 contract cases in append-message-handler-pdp.test.ts (engine wired allow ignores legacy false; engine wired deny prevents message persistence; engine undefined preserves back-compat)
  - 2 test.fixme'd e2e cases in v1.3-permission-backbone.spec.ts documenting the SEC-06 user-flow contract for future v1.5 e2e infra
affects: [59, 60]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Route-layer test harness for $server module mocking via mock.module + sentinel singleton object for identity assertion"
    - "Test.fixme block as documentation: blocked-on-infra contract that future infra repair can flip to live without re-litigating intent"

key-files:
  created:
    - src/__tests__/append-message-handler-pdp.test.ts (227 lines, 3 tests)
  modified:
    - web/src/routes/api/extensions/[name]/events/[event]/+server.ts (+17 lines — engine: getPermissionEngine() addition with full rationale comment block)
    - web/src/__tests__/extensions-events-route.test.ts (+126 lines — getPermissionEngine mock + SEC-06 describe block with 3 cases)
    - web/e2e/v1.3-permission-backbone.spec.ts (+~110 lines — SEC-06 describe block with 2 test.fixme'd cases, full rationale comment for the deferral)

key-decisions:
  - "Created dedicated `src/__tests__/append-message-handler-pdp.test.ts` (per plan spec) even though the existing `append-message-handler.test.ts` already covered PDP allow/deny + legacy fallback — the new file is SEC-06 traceability + adds the deny-prevents-write assertion (no message row inserted on PDP deny) that the existing tests didn't have."
  - "The plan's hypothesized RED expectation for the handler-level tests was incorrect: those 3 tests pass GREEN immediately because `handleAppendMessageRpc` already supports the engine-wired path; the bug being fixed is the ROUTE not passing engine to the handler, not the handler ignoring engine. The TRUE RED tests are at the route layer."
  - "Added 3 route-level SEC-06 cases to `web/src/__tests__/extensions-events-route.test.ts` (under the existing messageToolbar describe block). These are the genuine RED-then-GREEN cases that drove the wiring change. Mocked `$server/extensions/permission-engine` to a sentinel object (MOCK_ENGINE) so identity comparison (ctx.engine === MOCK_ENGINE) proves the wiring contract."
  - "Mocked permission-engine in route test even before the wiring change to keep existing tests stable post-fix (the new ctx-wiring call runs OUTSIDE the existing try/catch, so without the mock, getPermissionEngine() would throw 'PermissionEngine not initialized' in 8 messageToolbar tests)."
  - "The plan's e2e block (audit drill-down API assertion) is impractical in the current mock-fixture e2e harness — `web/e2e/fixtures/api-mocks.ts` intercepts every `/api/**` call with canned responses; there is NO live backend writing to `audit_log`. Documented as a `test.fixme` block with full rationale and assertion sketch so the v1.5 e2e infra repair can flip it to live without re-litigating intent."
  - "Pitfall 5 cleared (pre-flight verified): `ezcorp:chat:append` is NOT in `SENSITIVE_KINDS` (only `shell` and `fs.write` are — `src/extensions/capability-types.ts:56-59`). PDP returns allow without prompting, matching the no-prompt assumption baked into the route's existing flow. The wiring change introduces no UI prompt that would block the user-visible click → toast → audio sequence."

patterns-established:
  - "Sentinel singleton mock for identity assertion: when a route is expected to wire a process-level singleton through a deeply-nested call chain, mock the factory to return a known sentinel object so the test can compare identity (`ctx.engine === MOCK_ENGINE`) instead of asserting indirect proxies of behavior. Survives any internal refactor that doesn't touch the wiring contract."
  - "Test.fixme as deferred-contract documentation: when an e2e assertion requires infra not yet built (live backend, restored render pipeline), use test.fixme with a comprehensive rationale comment + assertion sketch instead of leaving a TODO. Future infra repair can flip it without re-litigating the assertion intent."
  - "Plan 03 traceability double-up: redundant test files are valuable when they serve different traceability roles. The handler-level `append-message-handler-pdp.test.ts` is named for SEC-06 explicit search; the route-level `extensions-events-route.test.ts` cases prove the wiring at the integration layer. Both surfaces lock the contract from different angles."

requirements-completed: [SEC-06]

# Metrics
duration: 7min
completed: 2026-05-11
---

# Phase 54 Plan 03: SEC-06 messageToolbar PDP Wiring (Claim-1 close-out) Summary

**Wired the PDP singleton (`engine: getPermissionEngine()`) into the messageToolbar shortcut's AppendMessageContext at `+server.ts:367-371`, switching the gate from the legacy boolean fallback to the audited PDP path and closing the last v1.3 security-review finding.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-05-11T04:02:33Z
- **Completed:** 2026-05-11T04:09:36Z
- **Tasks:** 2 (Task 1 RED tests → Task 2 GREEN implementation)
- **Files modified:** 4 (1 created test, 1 modified source, 1 modified route test, 1 modified e2e spec)

## Accomplishments

- **SEC-06 wiring landed:** `web/src/routes/api/extensions/[name]/events/[event]/+server.ts:367-371` ctx object now includes `engine: getPermissionEngine()`. The 1-line addition switches `handleAppendMessageRpc` from the legacy boolean fallback (line 213-215) to the PDP path (line 197) for every messageToolbar-shape event.
- **Audit gap closed:** Every messageToolbar click now routes through `engine.authorize()` → `writeAuditRow` → `audit_log` row with `action = 'ext:perm:allowed'` (or `'ext:perm:denied'`), `metadata.toolName = 'ezcorp/append-message'`, `metadata.capabilityKind = 'ezcorp:chat:append'`, `metadata.conversationId` matching the active conversation.
- **Override lookup in scope:** Per-conversation `effective_granted_permissions` overrides now apply to the messageToolbar path (the legacy fallback only consulted the bare `grantedPermissions.appendMessages` boolean, ignoring any per-conversation tightening).
- **3 route-level RED-then-GREEN cases:** Single messageId path + bulk messageIds[] path + invocation count assertion. Identity comparison via mocked sentinel singleton proves the wiring contract from the integration layer.
- **3 handler-level contract cases:** Engine-wired allow/deny + legacy fallback regression. The deny-prevents-write assertion (no message row persisted on PDP deny) is the new lock — gives the audit row teeth as a security guarantee.
- **2 test.fixme'd e2e cases** documenting the user-flow contract for future v1.5 e2e infra (real backend + restored chat-page render pipeline).

## Task Commits

Each task was committed atomically:

1. **Task 1: Wave 0 — failing PDP-wiring tests for SEC-06 (Claim-1 caveat)** — `c3704e0` (test)
2. **Task 2: Wire PermissionEngine singleton into messageToolbar ctx** — `0e69a2c` (feat)

_TDD: Task 1 had 3 GENUINELY RED route-level cases (proving the wiring was missing) plus 3 handler-level cases that passed GREEN immediately (locking the contract the handler already honored, for SEC-06 traceability + the new deny-prevents-write assertion). Task 2 turned all 3 RED cases GREEN with a 1-line addition._

## Files Created/Modified

**Created (1 backend test, 227 lines):**
- `src/__tests__/append-message-handler-pdp.test.ts` — 3 SEC-06 PDP-wiring contract tests using real PGlite + drizzle (mirrors `append-message-handler.test.ts` setup pattern):
  - **Test 1:** engine wired (allow) → handler consults engine.authorize, ignores legacy `grantedPermissions.appendMessages: false`. Asserts engine call shape (extensionId, userId, conversationId, toolName="ezcorp/append-message", needed=[{kind:"ezcorp:chat:append"}]).
  - **Test 2:** engine wired (deny) + legacy `grantedPermissions.appendMessages: true` → -32001 returned AND **no new message row persisted** (reads back the messages table to verify). Critical: proves the deny gate prevents the side-effect — the security guarantee that gives the audit row teeth.
  - **Test 3:** engine UNDEFINED → legacy boolean fallback still works (true=success, false=-32001). Back-compat invariant for pre-PDP test contexts.

**Modified (1 source file, +17 lines):**
- `web/src/routes/api/extensions/[name]/events/[event]/+server.ts` — added `engine: getPermissionEngine()` to the messageToolbar ctx object at line 367-371 with a full rationale comment block (cites the 3 silent bypasses the legacy fallback caused, the boot-order safety of `getPermissionEngine()` here, the wireOk=false branch independence, and cross-references to the v1.3-security-review.md Claim 1 caveat + this plan).

**Modified (2 test files, ~236 lines added):**
- `web/src/__tests__/extensions-events-route.test.ts` (+126 lines):
  - Added `mockGetPermissionEngine` (a `mock(() => MOCK_ENGINE)`) for `$server/extensions/permission-engine` so the route's `getPermissionEngine()` calls (both the existing wirer at line 319 and the new ctx-wiring at line 387) resolve to a known sentinel object.
  - New `SEC-06 — PDP engine wired into ctx for messageToolbar path` describe block under the existing messageToolbar branch:
    - Test (a) `ctx.engine === getPermissionEngine() singleton (single messageId path)` — captures the ctx via the mocked `handleAppendMessageRpc` and asserts identity match with MOCK_ENGINE.
    - Test (b) `getPermissionEngine() is invoked during the messageToolbar request (at least once)` — tolerant lower bound (≥1 pre-fix, ≥2 post-fix) so a future singleton-hoist refactor doesn't false-fail.
    - Test (c) `ctx.engine === getPermissionEngine() singleton (bulk messageIds[] path)` — pins the contract for the bulk shape so a future single/bulk split can't accidentally drop engine.
- `web/e2e/v1.3-permission-backbone.spec.ts` (+~110 lines): SEC-06 `test.describe` block with 2 `test.fixme`'d cases:
  - "messageToolbar click emits PERM_ALLOWED audit row with capabilityKind=ezcorp:chat:append" — full assertion sketch in the comment for v1.5 e2e infra to lift.
  - "messageToolbar response is still 200 OK after PDP wiring (no user-visible regression)" — regression sentinel doc.

## Decisions Made

- **Where to put the new tests:** Created `src/__tests__/append-message-handler-pdp.test.ts` (per plan) AND added 3 cases to `web/src/__tests__/extensions-events-route.test.ts`. The plan envisioned the handler-level file as the RED driver, but the handler already supports the engine path; the actual RED was at the route layer. Both files have value: the handler-level file is SEC-06 traceability + the deny-prevents-write assertion (new); the route-level file is the integration proof that drove the source change.

- **Mock strategy for the route test:** Mocked `$server/extensions/permission-engine` to return a sentinel object (`{__mock: "permission-engine-singleton"}`). This serves three purposes: (1) prevents `getPermissionEngine()` from throwing "not initialized" in the test environment, (2) lets the SEC-06 assertions compare ctx.engine BY IDENTITY (proving the singleton flowed through), and (3) keeps the test stable when the source change moves the call OUTSIDE the existing try/catch.

- **e2e deferral via test.fixme (not deletion):** The plan's e2e Test 1 (audit drill-down assertion) is impractical in the current mock-fixture infra (no live backend writes to audit_log). Instead of skipping, added 2 `test.fixme`'d cases with comprehensive rationale + assertion sketches so the v1.5 e2e refactor can flip them to live without re-litigating the intent. Mirrors the F-test fixme pattern already established in this file.

- **Pitfall 5 verification:** Read `src/extensions/capability-types.ts:56-59` to confirm `SENSITIVE_KINDS = new Set(["shell", "fs.write"])` — `ezcorp:chat:append` is NOT in the set. PDP returns allow without prompting on first use, matching the no-prompt assumption baked into the route's existing flow. The wiring change introduces no UI gate that would block the user-visible click → toast → audio sequence.

- **No new imports needed in the source file:** `getPermissionEngine` was already imported at line 18 (used at line 319 for the subprocess wirer). The 1-line addition reuses that import; no static-analysis tooling drift.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan's "Backend test RED" prediction was incorrect**
- **Found during:** Task 1 (running the new handler test for the first time)
- **Issue:** The plan stated the 3 handler-level tests in `append-message-handler-pdp.test.ts` would be RED on Tests 1+2 (and noted Test 3 might be GREEN). In reality, **all 3 were GREEN immediately** because the handler already supports the engine-wired path. The bug being fixed is the ROUTE not passing engine — the handler is correct.
- **Fix:** Added 3 GENUINELY RED cases at the route layer (`web/src/__tests__/extensions-events-route.test.ts` SEC-06 block) that DID drive the wiring change red→green. Kept the handler-level file per the plan's spec (it serves SEC-06 traceability + adds the new deny-prevents-write assertion that the existing tests didn't have).
- **Files modified:** Added `web/src/__tests__/extensions-events-route.test.ts` to the test surface (was a pure source file in the plan).
- **Verification:** Pre-fix: 3/3 SEC-06 route cases RED, 3/3 handler cases GREEN. Post-fix: 6/6 GREEN. The route cases are the actual TDD driver for this plan.
- **Committed in:** `c3704e0` (Task 1 commit, both test surfaces).

**2. [Rule 3 - Blocking] Mocking `$server/extensions/permission-engine` in the route test**
- **Found during:** Task 1 (designing the route-level RED tests)
- **Issue:** The route's `getPermissionEngine()` call at line 319 is inside a try/catch that swallows initialization throws (`wireOk = false`). Adding `engine: getPermissionEngine()` OUTSIDE that try would cause every existing messageToolbar test to throw "PermissionEngine not initialized" because the test environment doesn't boot the engine.
- **Fix:** Mocked `$server/extensions/permission-engine` to return a sentinel singleton object (`MOCK_ENGINE`). This (a) keeps the existing 8 messageToolbar tests stable post-fix and (b) lets the new SEC-06 cases compare ctx.engine by identity.
- **Files modified:** `web/src/__tests__/extensions-events-route.test.ts` (+10 lines for the mock + 1 line in beforeEach to clear it).
- **Verification:** Pre-fix and post-fix: all 40 baseline tests still GREEN; new 3 SEC-06 cases GREEN.
- **Committed in:** `c3704e0` (Task 1 commit, bundled with the SEC-06 cases that depend on it).

**3. [Rule 4 - Architectural — handled in plan, ratified at execution] e2e infra limitation**
- **Found during:** Task 1 (planning the Playwright spec block)
- **Issue:** The plan's e2e Test 1 calls for `await request.get('/api/audit?...')` to assert the PERM_ALLOWED audit row. The mock-fixture e2e harness (`web/e2e/fixtures/api-mocks.ts`) intercepts every `/api/**` call with canned responses; there is NO live backend writing to `audit_log`. The plan's audit-drilldown assertion path requires a Playwright + real backend lane that v1.4 e2e infra doesn't have.
- **Fix:** Added 2 `test.fixme`'d cases in `web/e2e/v1.3-permission-backbone.spec.ts` documenting the SEC-06 user-flow contract + a comprehensive comment block explaining BOTH blockers (audit infra + chat-page churn — same root cause as the F-test fixmes in the same file). The contract is comprehensively covered at the route + handler layers; the e2e cases document what to add when the infra exists.
- **Files modified:** `web/e2e/v1.3-permission-backbone.spec.ts` (+~110 lines).
- **Verification:** Specs do not run (test.fixme); the surrounding test file's runtime cost is unaffected.
- **Committed in:** `c3704e0` (Task 1 commit, alongside the route + handler RED cases).
- **Why not a Rule 4 STOP:** The plan's `<verify>` block already accounted for this (the e2e is documented as a future-infra gate); deferring via test.fixme is the established pattern in this file (F-tests). No architectural decision is being made — only the deferral mechanism is being chosen.

---

**Total deviations:** 3 auto-fixed (1 bug — plan's RED prediction; 1 blocking — engine mock for route stability; 1 architecturally-bounded — e2e infra limitation handled via test.fixme + extensive documentation)
**Impact on plan:** All 3 deviations are within plan scope and align with the plan's explicit guidance to verify pre-conditions and document e2e infrastructure gaps. No scope creep.

## Issues Encountered

None — both tasks were single-pass:
- Task 1 RED sweep: all 3 route-level cases RED with the exact failure modes predicted (ctx.engine undefined; getPermissionEngine call count = 1 not ≥2; bulk path same).
- Task 2 GREEN sweep: 1-line source change → all 6 SEC-06 cases (3 route + 3 handler) GREEN. Wider regression sweep of 103 tests across 9 files all GREEN.

## Phase 54 Close-Out

**All 6 v1.3 security-review findings now closed on mainline:**

| Finding | Plan | Commit | Status |
|---|---|---|---|
| CC1 (cache absorbs PGlite warm-up) | 54-01 | `3420a04` | ✓ Closed |
| SEC-01 swap (loadConversationOverride fail-CLOSED) | 54-02 | `608bd74` | ✓ Closed |
| SEC-02 (audit-write logger.error observability) | 54-02 | `608bd74` | ✓ Closed |
| SEC-03 (per-conversation call-depth cap) | 54-02 | `608bd74` | ✓ Closed |
| SEC-04 (PERMISSION_REAPPROVED audit action) | 54-02 | `608bd74` | ✓ Closed |
| SEC-05 (anchored localhost regex) | 54-02 | `608bd74` | ✓ Closed |
| **SEC-06 / Claim-1 (messageToolbar PDP wiring)** | **54-03** | **`0e69a2c`** | **✓ Closed** |

The v1.3 security review's MEDIUM Claim-1 caveat is now fully resolved. Every messageToolbar click emits a PDP audit row; per-conversation overrides apply; the deny path prevents message persistence; the user-visible flow is unaffected.

## Phase 59 Hand-off

The `loadConversationOverride` error shape change (CC1 swap, Plan 02) is now stable on mainline:
- `authorize` returns `{decision: "deny", reason: "override-lookup-failed"}` on post-cache DB throw.
- One `AUDIT_PERM_DENIED` audit row written per swap-triggered deny with `metadata.underlyingError` for forensics.
- Plan 03 SEC-06 wiring exposes the messageToolbar path to this same fail-CLOSED contract — any new test triage in Phase 59 should account for both the legacy boolean fallback path (still active when `ctx.engine` is undefined for back-compat) AND the PDP path (now active for messageToolbar callers).

## Verification Summary

**Plan-level test runs (all GREEN):**
- `bun test src/__tests__/append-message-handler-pdp.test.ts` → 3/3 pass
- `bun test src/__tests__/append-message-handler.test.ts` → 5/5 pass (existing baseline preserved)
- `bun test ./web/src/__tests__/extensions-events-route.test.ts` → 43/43 pass (40 baseline + 3 new SEC-06)
- `bun test src/__tests__/permission-engine.test.ts` → 25/25 pass (PDP regression)
- `bun test src/__tests__/permission-engine-conversation-override-cache.test.ts` → 3/3 pass (Plan 01 cache surface)
- `bun test src/__tests__/permission-engine-override-fail-closed.test.ts` → 3/3 pass (Plan 02 SEC-01 swap)
- `bun test src/__tests__/permission-engine-audit-fail-observable.test.ts` → 2/2 pass (Plan 02 SEC-02)
- `bun test src/__tests__/cross-ext-attribution.test.ts` → all pass (cross-ext regression)
- `bun test src/__tests__/tool-executor-per-conversation-depth.test.ts` → 4/4 pass (Plan 02 SEC-03)
- `bun test src/__tests__/bundled-extensions-boot-spawn.test.ts` → 12/12 pass
- `bun test src/__tests__/conversation-extensions.test.ts src/__tests__/spawn-cap-inheritance.test.ts src/__tests__/spawn-effective-grants.test.ts` → 36/36 pass
- `cd web && bunx vitest run src/__tests__/cap-expiry-flow.server.test.ts` → 19/19 pass (Plan 02 SEC-04 surface)
- `cd web && bunx vitest run src/__tests__/api-extensions-id-permissions.server.test.ts` → 9/9 pass (sanity check unrelated permissions route)

**Aggregate:** 167+ tests GREEN across 13 files (route, handler, PDP, cache, swap, cross-ext, depth-cap, boot-spawn, conversation-extensions, spawn-inheritance, effective-grants, cap-expiry, permissions-route).

**Type-check:** No new TS errors introduced. The 1-line source addition uses existing imports; the test files extend existing patterns.

## Next Phase Readiness

- **Phase 55 (MCP Stage 1) and Phase 56 (TTL UI):** UNBLOCKED. No shared files with this plan; both already parallelizable per the v1.4 phase ordering DAG.
- **Phase 57 (Mobile UX):** UNBLOCKED. No security-track dependency.
- **Phase 59 (Test Debt Repair):** UNBLOCKED for the post-CC1 portion (the override-lookup-failed deny shape is stable on mainline, ready for triage re-evaluation against the new contract).
- **Phase 60 (Audit-Claim & Docs Polish):** Receives the closing v1.3-security-review checkbox — Claim-1 is now ✓ Closed; the audit-claim narrative can cite this plan as the close-out commit.
- **No blockers** for the remaining v1.4 milestone phases.

## Self-Check: PASSED

All claims verified against disk:
- 4 files exist (1 created backend test, 1 modified source route, 1 modified route test, 1 modified e2e spec)
- 2 commits present (`c3704e0` test + `0e69a2c` feat)
- `engine: getPermissionEngine()` present at line 387 of `web/src/routes/api/extensions/[name]/events/[event]/+server.ts`
- `SEC-06 PDP wiring contract` describe block present in `src/__tests__/append-message-handler-pdp.test.ts`
- `SEC-06 — PDP engine wired into ctx for messageToolbar path` describe block present in `web/src/__tests__/extensions-events-route.test.ts`
- `SEC-06 messageToolbar PDP audit (deferred — see comment)` describe block present in `web/e2e/v1.3-permission-backbone.spec.ts`

---
*Phase: 54-security-backbone-hardening-cc1-cc5-claim-1*
*Completed: 2026-05-11*
