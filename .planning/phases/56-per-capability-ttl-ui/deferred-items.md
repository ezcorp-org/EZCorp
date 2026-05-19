# Phase 56 Deferred Items

## Out-of-scope test failure — extension-audit-actions exhaustive-set test (pre-Phase-56)

- **File:** `src/__tests__/extension-audit-actions.test.ts`
- **Test:** `extension audit action constants > constant set is exhaustive — covers every audit-emit site through Phase 7 + SDK Phase 50/51`
- **Failure:** Two order-sensitive `Set` comparisons drift after Phase 55-03 landed:
  - `MCP_SECCOMP_VIOLATION` is in the runtime constants but missing from the test's expected list.
  - `EMIT_EVENT_REJECTED` / `EVENT_SUBSCRIPTION_DENIED` are positioned differently between the source and the test.
  - `PERM_GRANT_EXPIRED` is positioned differently between the source and the test.
- **Root cause:** Phase 55-03 (`19f2369`) added `MCP_SECCOMP_VIOLATION` to `src/extensions/audit-actions.ts` but did not update `src/__tests__/extension-audit-actions.test.ts`'s declared expected set. The test pre-existed Phase 56-02 and is unrelated to the per-capability TTL UI work.
- **Verification this is pre-existing:** `git log --oneline src/__tests__/extension-audit-actions.test.ts src/extensions/audit-actions.ts` last touched at commit `19f2369` (Phase 55-03). Phase 56-01 + 56-02 do not modify either file.
- **Scope boundary:** Plan 56-02 is in the per-capability TTL UI subsystem (extensions/permissions); this test is in the audit-action-constants subsystem. Auto-fixing the expected-set ordering is out-of-scope per the SCOPE BOUNDARY rule.
- **Suggested follow-up:** Phase 59 (Test Debt Repair, TEST-04) is the natural owner for this drift. The fix is mechanical: align the test's expected `Set([...])` member order with the current `EXT_AUDIT_ACTIONS` export order in `src/extensions/audit-actions.ts`.

## Phase 56 Wave 0 RED tests not in scope for Plan 56-02

The following Wave 0 RED scaffolds remain RED after Plan 56-02; they are explicitly owned by Plan 56-03:

- `web/src/__tests__/relative-time.test.ts` — `formatTtl()` Intl.RelativeTimeFormat coverage (6 cases). Plan 56-03 owns the formatter implementation.
- `web/src/__tests__/sticky-last-ttl-pick.test.ts` — sticky last-pick read/write contract (4 cases). Plan 56-03 owns the KV-namespace wiring on both surfaces.

These are NOT regressions — they were RED before Plan 56-02 started and stay RED until Plan 56-03 lands the production code that satisfies them.

## Pre-existing bun-test mock.module pollution between permission-handler tests

- **Files involved:**
  - `src/__tests__/tool-permission-handler.test.ts` (Wave 0 RED scaffold — mocks `../runtime/tools/permissions` with only `resolvePermission` + `getPendingApprovalConversation`)
  - `src/__tests__/tool-permission-forever-admin-gate.test.ts` (uses the real module via `createPermissionGate` + awaits gate Promise resolution)
- **Symptom:** When the two files run in the SAME `bun test` invocation in this order (handler first), the forever-admin-gate's "non-admin scope=session/project accepted" + "admin scope=forever accepted" tests time out at 5s — `await gate` never resolves because the handler-test's `mock.module` for `../runtime/tools/permissions` leaks into the second test file's module-load cache; the handler then calls the mocked `resolvePermission` (which records to an array) instead of the real one (which fulfills the gate Promise).
- **Verification this is pre-existing (NOT a Phase 56-03 regression):**
  - Both files pass independently: `bun test src/__tests__/tool-permission-forever-admin-gate.test.ts` → 5/5 GREEN; `bun test src/__tests__/tool-permission-handler.test.ts` → 5/5 GREEN.
  - Plan 56-02 SUMMARY claimed "REGRESSION GREEN" by running these files in SEPARATE `bun test` invocations, sidestepping the pollution (`bun test src/__tests__/tool-permission-handler.test.ts` then `bun test src/__tests__/tool-permission-api.test.ts src/__tests__/tool-permission-forever-admin-gate.test.ts src/__tests__/security/h2-tool-call-ownership.test.ts`).
  - Root cause is the `restoreModuleMocks` helper not unwinding `mock.module` for `../runtime/tools/permissions` (the wave-0 RED scaffold mock survives into the next file's loader cache).
- **Scope boundary:** Test-infrastructure pollution between Wave 0 scaffold + a Phase 4 test is unrelated to the per-capability TTL UI subsystem; Phase 59 TEST-04 (test debt repair) is the natural owner.
- **Suggested follow-up for Phase 59 TEST-04:** Either (a) extend `restoreModuleMocks` to actively unwind specific module mocks, or (b) restructure `tool-permission-handler.test.ts` to use Bun's `spyOn` against a real-module-imported `resolvePermission` reference (no `mock.module` of the runtime module), or (c) run handler vs gate tests in separate `bun test` invocations in the CI workflow.
