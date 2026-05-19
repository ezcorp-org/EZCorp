---
phase: 56-per-capability-ttl-ui
plan: 02
subsystem: extensions
tags: [permissions, ttl, capability-expiry, ui, picker, audit, defense-in-depth]

# Dependency graph
requires:
  - phase: 56-per-capability-ttl-ui (Plan 56-00)
    provides: "Wave 0 RED scaffolds (relative-time, tool-permission-handler, extensions-reapprove-route, sticky-last-ttl-pick)"
  - phase: 56-per-capability-ttl-ui (Plan 56-01)
    provides: "AlwaysAllowRecord {ttlOverrideMs, expiresAt} additive widening + readTtlOverrideMs + buildAlwaysAllowValue(options) + sweep precedence (Pitfall 6)"
provides:
  - "TTL_OPTIONS + DEFAULT_TTL_FIRST_USE_MS exported from web/src/lib/components/permissions/expiry-copy.ts as single source of truth (Pattern 2 — verbatim-copy contract)"
  - "Native <select> TTL picker on BOTH UI surfaces: ExpiredReapproveModal (settings) AND PermissionGate.svelte expired branch (chat-side). data-testid='expired-reapprove-ttl-picker' identical on both"
  - "expiryCopy() widened to accept newTtlMs: number | null; null branch yields 'Approve forever' (distinct from admin-only 'Approve forever (admin only)')"
  - "POST /api/extensions/[id]/reapprove accepts optional ttlOverrideMs (positive number | null | omitted); persists ttlOverrideMs + expiresAt onto always-allow row via buildAlwaysAllowValue; widens scope vocabulary from `'forever' | undefined` to AlwaysAllowScope; audit metadata records requestedTtl + appliedTtl"
  - "POST /api/tool-calls/[id]/permission (handleToolPermission) accepts optional ttlOverrideMs; threads through resolvePermission → ApprovalResolution → engine.resolvePrompt → buildAlwaysAllowValue"
  - "src/extensions/ttl-validate.ts (NEW): shared parseTtlOverrideMs() three-branch parser used by BOTH endpoints (DRY)"
  - "Defense-in-depth on scope=forever admin gating UNTOUCHED on both endpoints"
  - "Picker Never (ttlOverrideMs: null) on a non-forever scope is allowed for any authenticated user (NOT scope escalation)"
affects: ["56-03 (formatTtl + sticky KV — consumes the picker + endpoint contracts landed here)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single-source picker constant — TTL_OPTIONS exported ONCE in expiry-copy.ts; both surfaces import it; a future 8th option needs one-line edit"
    - "Svelte 5 $derived live-label pattern — selectedTtlMs $state drives expiryCopy() input via $derived, so the Approve button label recomputes when the picker changes (no manual subscription/event wiring)"
    - "svelte-ignore state_referenced_locally on intentional prop-seed initialization (initialTtlMs is the picker SEED, not a live two-way binding — parent changes after mount don't yank the user's mid-edit selection)"
    - "Shared validator helper for body-field accept/reject contract — parseTtlOverrideMs() lives in src/extensions/ttl-validate.ts and is imported by BOTH /api/extensions/[id]/reapprove (SvelteKit web) AND src/routes/tool-permission.ts (chat handler). One verbatim error string, one Pitfall 2 lock"
    - "ApprovalResolution payload widening over the wire: chat-side resolver attaches ttlOverrideMs only when supplied (positive number OR null); undefined stays unset so the downstream writer takes the legacy fallback (buildAlwaysAllowValue with empty options ≠ explicit null)"

key-files:
  created:
    - "src/extensions/ttl-validate.ts (~45 lines) — shared parseTtlOverrideMs three-branch parser"
    - ".planning/phases/56-per-capability-ttl-ui/deferred-items.md — out-of-scope test failure log"
  modified:
    - "web/src/lib/components/permissions/expiry-copy.ts — adds TTL_OPTIONS + DEFAULT_TTL_FIRST_USE_MS; widens expiryCopy() last param to number | null"
    - "web/src/lib/components/permissions/ExpiredReapproveModal.svelte — newTtlMs→initialTtlMs rename; native <select> picker; onApproveDefault signature widens to (ttlOverrideMs: number | null) => void; selectedTtlMs $state drives $derived label"
    - "web/src/lib/components/tool-cards/PermissionGate.svelte — expiredCapability.newTtlMs→initialTtlMs rename; same picker + label parity; handleReapproveDefault forwards selectedTtlMs to sendToolPermissionResponse"
    - "web/src/lib/stores.svelte.ts — sendToolPermissionResponse accepts optional ttlOverrideMs 4th arg; body only carries field when defined"
    - "web/src/routes/(app)/extensions/[id]/+page.svelte — drops DEFAULT_NEW_TTL_MS; imports DEFAULT_TTL_FIRST_USE_MS; handleReapproveSubmit accepts ttlOverrideMs"
    - "web/src/routes/api/extensions/[id]/reapprove/+server.ts — widens scope vocabulary to AlwaysAllowScope; parseTtlOverrideMs validation; buildAlwaysAllowValue+upsertSetting always-allow row write; audit metadata requestedTtl+appliedTtl"
    - "src/routes/tool-permission.ts — parseTtlOverrideMs validation; passes options.ttlOverrideMs to resolvePermission"
    - "src/runtime/tools/permissions.ts — ApprovalResolution widens with ttlOverrideMs?; resolvePermission accepts 4th-arg options; threads into resolveDetailed"
    - "src/extensions/permission-engine.ts — resolvePrompt signature gains 5th-arg options; materializes expiresAt; threads into buildAlwaysAllowValue"
    - "src/extensions/tool-executor.ts — forwards resolution.ttlOverrideMs to engine.resolvePrompt when supplied"
    - "web/src/__tests__/expired-reapprove-modal.component.test.ts — Phase 56 — TTL picker describe block (7 new cases) + existing newTtlMs→initialTtlMs fixture rename"
    - "web/src/__tests__/extension-permission-modal-expired-branch.component.test.ts — 2 new Phase 56 parity cases + existing newTtlMs→initialTtlMs rename + updated body shape assertion"
    - "web/src/__tests__/cap-expiry-flow.server.test.ts — updated 'reject invalid scope' case to use scope='bogus' (the prior 'session' is now valid per the widened vocabulary)"

key-decisions:
  - "[56-02]: null branch yields 'Approve forever' (NOT 'Approve Never'). Distinct from admin button 'Approve forever (admin only)' — the parenthetical disambiguates. User mental model: 'this grant has no expiry' (semantic), 'scope escalation' (admin button). Decision matches the plan's recommendation in Step 2a."
  - "[56-02]: svelte-ignore state_referenced_locally applied at both modal + gate sites. The prop is the SEED for the picker (sticky last-pick or first-use fallback), NOT a live two-way binding — parent changes after mount would yank the user's mid-edit selection. Project precedent: 5 existing sites use the same pattern."
  - "[56-02]: ttl-validate.ts placed at src/extensions/ (server-side path) since web imports it via $server alias. One file, two callers — DRY locked. The plan's Task 3 instruction was 'pick whichever is less code churn'; landing the helper in Task 2 + reusing in Task 3 yielded ~12-line refactor (worth the DRY win)."
  - "[56-02]: scope vocabulary widened on reapprove endpoint from `'forever' | undefined` to AlwaysAllowScope (session/conversation/project/forever). Plan 56-00 SUMMARY flagged this as required for two RED scaffold cases to flip GREEN for the intended reason. Defense-in-depth scope=forever admin gate UNTOUCHED."
  - "[56-02]: Settings-side reapprove writes the always-allow row at scopeId='*' when body omits scope (default scope='forever'). Settings-side reapprove is scope-broad (the user is reasserting the install-time grant, not narrowing to a specific conversation/session/project). Plan 56-03 may revisit this for sticky-pick scoping; the contract here is just 'persist the override somewhere queryable'."
  - "[56-02]: resolvePermission options arg is always passed (never undefined) from handleToolPermission so the resolver doesn't have to defend against arity drift. Test contract case 3: `options.ttlOverrideMs === undefined` is the legacy-caller shape, NOT `options === undefined`."
  - "[56-02]: tool-executor.ts forwards resolution.ttlOverrideMs to engine.resolvePrompt ONLY when defined. undefined here means 'no picker selection from the user' — engine falls back to TTL_CONFIG[kind] / foreverTtlMs (legacy behavior). null OR positive number propagates to buildAlwaysAllowValue's options arg."
  - "[56-02]: ApprovalResolution.ttlOverrideMs is OMITTED (not undefined) when the resolver receives options.ttlOverrideMs === undefined. This preserves the 'empty options object ≠ explicit null' contract from Plan 56-01 — downstream buildAlwaysAllowValue treats absent fields as ABSENT (byte-identical to pre-Phase-56 row shape)."

patterns-established:
  - "Single-source picker contract via export-once + import-twice (TTL_OPTIONS in expiry-copy.ts). Future picker widths (e.g. adding '1y' or replacing 'Never' with 'Until revoked') land in one file. Test files assert against the same constant — paraphrase drift impossible."
  - "$state-from-prop-seed Svelte 5 idiom for initial-only picker prop, with svelte-ignore. Reusable for any 'sticky last-pick' UX (mobile gesture preferences, theme overrides, etc.)."
  - "Shared body-field validator helper for paired endpoints — parseTtlOverrideMs is the reference for 'one parser, multiple callers, one error string'. Future per-row policy knobs (e.g. ttlBoostMs, maxDailyCallsMs) can follow the same shape."
  - "Always-allow row write at the reapprove endpoint (settings-side parity with the chat-side gate). Pre-Phase-56 the reapprove endpoint only touched extensions.grantedPermissions; Phase 56-02 also writes the always-allow setting row so the sweep evaluator can honor per-row overrides regardless of which surface the user came from."

requirements-completed: [TTL-01]

# Metrics
duration: ~47 min
completed: 2026-05-11
---

# Phase 56 Plan 02: Per-Capability TTL UI Endpoints + Picker Summary

**7-option TTL picker (1h/6h/1d/7d/30d/90d/Never) on both settings + chat UI surfaces sourced from a single TTL_OPTIONS export; both endpoints validate + persist `ttlOverrideMs` onto the always-allow row via `buildAlwaysAllowValue`; defense-in-depth on `scope=forever` admin gating unchanged.**

## Performance

- **Duration:** ~47 min
- **Started:** 2026-05-11T21:03:48Z
- **Completed:** 2026-05-11T21:50:48Z
- **Tasks:** 3
- **Files created:** 2 (src/extensions/ttl-validate.ts + deferred-items.md)
- **Files modified:** 13

## Accomplishments

- User can pick 1h / 6h / 1d / 7d / 30d / 90d / Never in BOTH surfaces (settings ExpiredReapproveModal + chat-side PermissionGate expired branch). Live label parity via Svelte 5 `$derived`.
- Both endpoints (`/api/extensions/[id]/reapprove` AND `/api/tool-calls/[id]/permission`) accept `ttlOverrideMs` per the locked Pitfall 2 contract (positive number | null | omitted; 0/negative/NaN/Infinity all → 400).
- Both endpoints persist `ttlOverrideMs` + a materialized `expiresAt` onto the always-allow row via `buildAlwaysAllowValue(true, now, { ttlOverrideMs, expiresAt })`.
- Audit metadata on the settings-side reapprove records `requestedTtl` + `appliedTtl` for every PERMISSION_REAPPROVED event.
- Defense-in-depth on `scope=forever` admin gating is intact (test cases #6 lock).
- Picker `Never` on a non-`forever` scope is allowed for any authenticated user (test cases #7 lock — `Never` is per-row TTL semantics, NOT scope escalation).
- Shared `parseTtlOverrideMs` validator lands in `src/extensions/ttl-validate.ts` — both endpoints consume it, one error string.
- Roadmap success criteria #1 (UI picker + verifiable selection), #3 (Never → null + null + sweep-skip), and #4 (audit metadata `requestedTtl` + `appliedTtl`) all GREEN.

## Task Commits

Each task was committed atomically:

1. **Task 1: TTL_OPTIONS export + ExpiredReapproveModal picker + PermissionGate parity** — `15ec056` (feat)
2. **Task 2: /api/extensions/[id]/reapprove accepts ttlOverrideMs** — `39fafc3` (feat)
3. **Task 3: handleToolPermission + resolvePermission plumb ttlOverrideMs** — `c5f23c6` (feat)

**Plan metadata commit:** _appended as the final docs commit below._

## Files Created/Modified

See frontmatter `key-files`. Highlights:

- `src/extensions/ttl-validate.ts` (NEW, ~45 lines): three-branch parser exported as `parseTtlOverrideMs`. Pure (no I/O); both Bun (chat handler) and Vite (web reapprove route) callers consume via the shared `src/` namespace.
- `web/src/lib/components/permissions/expiry-copy.ts`: gains `TTL_OPTIONS` (7-entry `readonly` array `satisfies` typed) + `DEFAULT_TTL_FIRST_USE_MS` (30 days); `expiryCopy()` last param widens to `number | null` with the null branch producing `"Approve forever"`.
- `ExpiredReapproveModal.svelte` + `PermissionGate.svelte`: both surfaces render the SAME `data-testid="expired-reapprove-ttl-picker"` native `<select>` above their approve button. `selectedTtlMs $state` drives an updated `$derived` (`copy` / `expiredCopy`) that recomputes the Approve label live.
- `(app)/extensions/[id]/+page.svelte`: deletes `DEFAULT_NEW_TTL_MS`; imports `DEFAULT_TTL_FIRST_USE_MS`; `handleReapproveSubmit` plumbs `ttlOverrideMs` into the POST body conditionally.
- `web/src/routes/api/extensions/[id]/reapprove/+server.ts`: scope vocabulary widened to `AlwaysAllowScope`; `parseTtlOverrideMs` validation; `buildAlwaysAllowValue(true, now, { ttlOverrideMs, expiresAt })` + `upsertSetting` writes the per-row always-allow record; audit metadata gains `requestedTtl` + `appliedTtl`.
- `src/routes/tool-permission.ts` + `src/runtime/tools/permissions.ts` + `src/extensions/permission-engine.ts` + `src/extensions/tool-executor.ts`: chat-side plumbing chain. Validation at the handler → options arg through `resolvePermission` → `ApprovalResolution.ttlOverrideMs` → `engine.resolvePrompt(promptId, true, scope, scopeId, { ttlOverrideMs })` → `buildAlwaysAllowValue(true, now, { ttlOverrideMs, expiresAt })`.

## Decisions Made

See frontmatter `key-decisions`. Eight Plan 56-02 execution decisions captured there.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Scope vocabulary needed widening at the reapprove endpoint**

- **Found during:** Task 2 (running the RED scaffold against the existing endpoint)
- **Issue:** The existing reapprove endpoint accepted only `scope: "forever" | undefined`. The Wave 0 RED scaffolds posted `scope: "conversation"` (intentional — Plan 56-00 SUMMARY's "Open observation for Plan 56-02" called this out: *"must extend the scope vocabulary to also accept session/conversation/project per CONTEXT.md"*). Without widening, Wave 0 cases 1, 2, 5, 7 would have stayed RED for the wrong reason ("scope must be 'forever' or unset" error, not "ttlOverrideMs accepted").
- **Fix:** Widened `VALID_REAPPROVE_SCOPES` to the full `AlwaysAllowScope` union (session/conversation/project/forever). Defense-in-depth on `scope=forever` admin gate UNTOUCHED — the `requireRole(locals, "admin")` call sits below the validator.
- **Files modified:** `web/src/routes/api/extensions/[id]/reapprove/+server.ts`
- **Committed in:** `39fafc3` (Task 2 commit)

**2. [Rule 3 — Blocking] Phase 4 cap-expiry-flow.server.test.ts regression from widening**

- **Found during:** Task 2 (post-GREEN regression sweep)
- **Issue:** The Phase 4 test `cap-expiry-flow.server.test.ts > reapprove rejects invalid scope with 400` posted `scope: "session"` to verify the rejection path. With Phase 56-02 widening, `"session"` is now a VALID scope — the test expected 400, got 200.
- **Fix:** Updated the test's payload to use `scope: "bogus"` (a value outside `AlwaysAllowScope`), with an inline comment explaining the Phase 56 vocabulary change. The validator's rejection-path coverage is preserved.
- **Files modified:** `web/src/__tests__/cap-expiry-flow.server.test.ts`
- **Committed in:** `39fafc3` (same task commit — kept atomic with the production change)

**3. [Rule 3 — Blocking] PermissionGate test body assertion updated for new POST shape**

- **Found during:** Task 1 (GREEN verification)
- **Issue:** Pre-Phase-56 chat-side gate POSTed `{approved: true}`. With Phase 56 the body now includes `ttlOverrideMs` (the picker's current selection, defaulting to `initialTtlMs`). The existing assertion `body: JSON.stringify({ approved: true })` would fail.
- **Fix:** Updated the assertion to `body: JSON.stringify({ approved: true, ttlOverrideMs: 30 * DAY_MS })` matching the picker's `initialTtlMs: 30d` fixture. Description updated to reflect the new contract; inline comment notes that picker `Never` does NOT escalate scope.
- **Files modified:** `web/src/__tests__/extension-permission-modal-expired-branch.component.test.ts`
- **Committed in:** `15ec056` (Task 1 commit)

**Auth gates:** None. All authentication for this plan is server-side (`requireAuth` / `requireRole`) already wired before Phase 56.

**Total auto-fixed deviations:** 3 (all Rule 3 — blocking). Zero Rule 1 (bug), zero Rule 2 (missing critical functionality), zero Rule 4 (architectural). All within plan scope.

## Issues Encountered

One pre-existing test failure observed during the backend regression sweep — documented in `deferred-items.md`:

- `src/__tests__/extension-audit-actions.test.ts > extension audit action constants > constant set is exhaustive — covers every audit-emit site through Phase 7 + SDK Phase 50/51` — fails on the Phase 55-03 addition of `MCP_SECCOMP_VIOLATION` + ordering drift of three other constants. Last touched Phase 55-03 (`19f2369`); not caused by Phase 56-02. Out-of-scope per the SCOPE BOUNDARY rule. Phase 59 TEST-04 is the natural owner.

## Pre-existing Working-Tree State

None at plan start — Plan 56-01 had landed and committed cleanly before Plan 56-02 began.

## User Setup Required

None — no env vars, no migrations, no external services. The UI picker renders against existing browser-native `<select>`; the endpoints reuse existing auth/audit infrastructure.

## Next Phase Readiness

**Plan 56-03 (formatTtl + sticky KV) is unblocked:**

- The picker contract is locked: `TTL_OPTIONS` import is the ONLY place Plan 56-03 needs to know about for adding `formatTtl`'s "Never" branch.
- The sticky-pick KV namespace is defined in Plan 56-00 RED scaffold (`user:<id>:reapprove:lastTtl:<kind>`). Plan 56-03 wires the read-on-mount (settings-side `/api/extensions/[id]/expired-grants` route) + write-on-submit (both endpoints — Never-suppression per CONTEXT.md).
- The Wave 0 RED tests for `relative-time.test.ts` (6 cases) and `sticky-last-ttl-pick.test.ts` (4 cases) remain RED — they are explicitly Plan 56-03's contract.
- E2E `ttl-picker` describe block in `web/e2e/v1.3-permission-backbone.spec.ts` stays `test.fixme`; Plan 56-03 (or Phase 59 TEST-03) flips them live.

**Phase 56 success criteria scoreboard (after Plan 56-02):**

| # | Criterion | Status |
|---|-----------|--------|
| 1 | UI picker + verifiable selection (1h..90d, Never) | ✅ Plan 56-02 |
| 2 | Sweep evaluator honors per-row override BEFORE TTL_CONFIG | ✅ Plan 56-01 |
| 3 | Never → ttlOverrideMs=null + expiresAt=null on row + sweep skips | ✅ Plans 56-01 + 56-02 |
| 4 | Audit metadata records requestedTtl + appliedTtl | ✅ Plan 56-02 (settings) — chat-side carried via engine.resolvePrompt → PERM_PROMPTED audit row (already extends ExtensionAuditMetadata) |
| 5 | formatTtl + relative-time helpers | ⏳ Plan 56-03 |
| 6 | Sticky last-pick (per-user, per-kind) | ⏳ Plan 56-03 |

**No blockers for Plan 56-03.**

---

## Self-Check

Verified files exist:

- FOUND: `src/extensions/ttl-validate.ts` (new — 45 lines, parseTtlOverrideMs export)
- FOUND: `web/src/lib/components/permissions/expiry-copy.ts` (TTL_OPTIONS + DEFAULT_TTL_FIRST_USE_MS exported)
- FOUND: `web/src/lib/components/permissions/ExpiredReapproveModal.svelte` (picker + onApproveDefault signature)
- FOUND: `web/src/lib/components/tool-cards/PermissionGate.svelte` (picker parity + initialTtlMs prop)
- FOUND: `web/src/routes/api/extensions/[id]/reapprove/+server.ts` (parseTtlOverrideMs + buildAlwaysAllowValue write + audit fields)
- FOUND: `src/routes/tool-permission.ts` (parseTtlOverrideMs + options to resolvePermission)
- FOUND: `src/runtime/tools/permissions.ts` (ApprovalResolution.ttlOverrideMs + resolvePermission 4th arg)
- FOUND: `src/extensions/permission-engine.ts` (resolvePrompt 5th-arg options + buildAlwaysAllowValue options)
- FOUND: `src/extensions/tool-executor.ts` (resolution.ttlOverrideMs → engine.resolvePrompt)
- FOUND: `.planning/phases/56-per-capability-ttl-ui/deferred-items.md`

Verified commits exist:

- FOUND: `15ec056` (Task 1 — feat: TTL_OPTIONS + modal + gate picker)
- FOUND: `39fafc3` (Task 2 — feat: reapprove endpoint accepts ttlOverrideMs)
- FOUND: `c5f23c6` (Task 3 — feat: chat-side handler + resolver + engine plumb ttlOverrideMs)

Test verification (final state):

- `cd web && bunx vitest run src/__tests__/expired-reapprove-modal.component.test.ts src/__tests__/extension-permission-modal-expired-branch.component.test.ts src/__tests__/extensions-reapprove-route.test.ts src/__tests__/cap-expiry-flow.server.test.ts` — 52/52 GREEN
- `bun test src/__tests__/tool-permission-handler.test.ts` — 5/5 GREEN
- `bun test src/__tests__/permission-engine.test.ts src/__tests__/permission-gate-integration.test.ts src/__tests__/permission-engine-integration.test.ts` — 45/45 GREEN (REGRESSION)
- `bun test src/__tests__/perm-expiry-sweep.test.ts src/__tests__/perm-expiry-sweep.integration.test.ts src/__tests__/always-allow-value-shape.test.ts` — 121/121 GREEN (Plan 56-01 REGRESSION)
- `bun test src/__tests__/tool-permission-api.test.ts src/__tests__/tool-permission-forever-admin-gate.test.ts src/__tests__/security/h2-tool-call-ownership.test.ts` — 25/25 GREEN (REGRESSION)
- `cd web && bunx vitest run src/__tests__/api-tool-calls-id-permission.server.test.ts src/__tests__/extension-permission-modal.component.test.ts` — 14/14 GREEN (REGRESSION)
- `cd web && bunx vitest run` — full web suite 229/232 files passing; the 3 failing files are Plan 56-00 RED scaffolds for Plan 56-03 (`relative-time.test.ts`, `sticky-last-ttl-pick.test.ts`) — out-of-scope.

## Self-Check: PASSED

---
*Phase: 56-per-capability-ttl-ui*
*Completed: 2026-05-11*
