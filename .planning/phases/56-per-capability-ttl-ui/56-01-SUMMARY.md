---
phase: 56-per-capability-ttl-ui
plan: 01
subsystem: extensions
tags: [permissions, ttl, capability-expiry, sweep, additive-shape, lazy-migration]

# Dependency graph
requires:
  - phase: 04-capability-expiry-sweep
    provides: "AlwaysAllowRecord {allowed, grantedAt} value-shape contract + parseAlwaysAllowValue parser + runSweep evaluator with TTL_CONFIG/foreverTtlMs fallback"
  - phase: 56-per-capability-ttl-ui (Plan 56-00)
    provides: "Phase 56 RESEARCH + CONTEXT establishing the data-model + UX shape (parallel sibling — no code dependency)"
provides:
  - "AlwaysAllowRecord additively widened with `ttlOverrideMs?: number | null` and `expiresAt?: number | null` fields (zero DB migration; lazy upgrade on next write)"
  - "readTtlOverrideMs(value: unknown) helper exported from src/extensions/permissions.ts — three-branch (null → Never, number > 0 → override, undefined → fallback) parser"
  - "buildAlwaysAllowValue gains optional third `options` arg `{ ttlOverrideMs?, expiresAt? }` — back-compat with 2-arg legacy callers (fields stay ABSENT, not undefined)"
  - "perm-expiry-sweep.ts runSweep evaluator honors per-row override BEFORE TTL_CONFIG[kind] / foreverTtlMs fallback (Pitfall 6 — override wins over forever-scope env knob)"
affects: ["56-02 (UI + endpoint wiring against this contract)", "56-03 (formatTtl + sticky KV against this contract)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Additive widening of JSONB row shape — optional fields, structural typing tolerates extras, NO Object.keys length checks (Pitfall 1)"
    - "Three-branch sentinel: null=Never, positive number=override, undefined=fallback. 0/negative/NaN/Infinity all collapse to undefined (Pitfall 2 — null is sole Never)"
    - "Override precedence FIRST, fallback LAST: readTtlOverrideMs short-circuits BEFORE scope===forever ? foreverTtlMs : TTL_CONFIG[kind] (Pitfall 6 — honest Never even on forever scope)"

key-files:
  created: []
  modified:
    - "src/extensions/permissions.ts — AlwaysAllowRecord widened; readTtlOverrideMs exported; buildAlwaysAllowValue options arg"
    - "src/extensions/perm-expiry-sweep.ts — runSweep always-allow loop now branches on readTtlOverrideMs BEFORE TTL_CONFIG fallback"
    - "src/__tests__/always-allow-value-shape.test.ts — 20 new RED→GREEN cases (parse tolerance + readTtlOverrideMs branches + buildAlwaysAllowValue options)"
    - "src/__tests__/perm-expiry-sweep.test.ts — 7 new RED→GREEN cases (override precedence + Pitfall 6 + REGRESSION fallbacks)"

key-decisions:
  - "[56-01]: null is the SOLE Never sentinel — 0 collapses to undefined (Pitfall 2). A future refactor that adds `0 === Never` would silently brick the override-vs-fallback decision."
  - "[56-01]: parseAlwaysAllowValue stays unchanged — structural typing already tolerates extra fields (Pitfall 1). Adding `Object.keys(v).length === 2` would break legacy {allowed, grantedAt} rows the moment we widen the shape."
  - "[56-01]: buildAlwaysAllowValue empty options object ≠ explicit null. `{}` keeps fields ABSENT (byte-identical to pre-Phase-56 output); `{ ttlOverrideMs: null }` writes null. This lets Plan 56-02 pass through caller-supplied options without injecting null on bypass."
  - "[56-01]: Override precedence wins everywhere, including `TTL_CONFIG[kind] === \"never\"`. Rare but contractual — Plan 56-01 task 2 case 7 locks this. If a user explicitly picks a 1h override on a storage grant (TTL=never), the sweep MUST revoke at 1h."
  - "[56-01]: extension-grant scope unchanged in this plan — per-row override applies ONLY to always-allow rows (settings table JSONB values). extensions.grantedPermissions.grantedAt entries continue to use TTL_CONFIG fallback. Per-grant override on extension-grant rows is out of scope per the must_haves frontmatter."

patterns-established:
  - "Three-branch sentinel parser pattern (null | number | undefined) for optional-field overrides on JSONB rows — reusable for future per-row policy knobs"
  - "Precedence-first / fallback-last evaluator branch — short-circuit on null, use override on number, fall through on undefined. Keeps the legacy code path inert when the new field is absent"
  - "Test-first additive widening: 20 new cases in always-allow-value-shape.test.ts + 7 in perm-expiry-sweep.test.ts drive both shapes (data + behavior); RED before GREEN; existing 28+50 pre-existing cases remain GREEN as REGRESSION lock"

requirements-completed: [TTL-01]

# Metrics
duration: ~4 min
completed: 2026-05-11
---

# Phase 56 Plan 01: Per-Grant ttlOverrideMs Backend Contract Summary

**Additive widening of AlwaysAllowRecord with optional `ttlOverrideMs` / `expiresAt` fields + `readTtlOverrideMs` three-branch helper + sweep evaluator that honors per-row override before TTL_CONFIG / foreverTtlMs fallback (Pitfall 6).**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-05-11T20:50:29Z
- **Completed:** 2026-05-11T20:54:00Z (approx)
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Backend data contract for Phase 56 is on disk and tested. UI (Plan 56-02) and formatTtl/sticky-KV (Plan 56-03) can now wire endpoints against this contract.
- Zero DB migration — additive optional fields on the JSONB row shape. Lazy upgrade on every write. Legacy `{allowed, grantedAt}` rows parse unchanged.
- Sweep evaluator (perm-expiry-sweep.ts runSweep loop) now consults `readTtlOverrideMs(row.value)` BEFORE the existing `scope === "forever" ? foreverTtlMs : TTL_CONFIG[kind]` fallback. Pitfall 6 is locked: honest Never even on forever-scope rows.
- Roadmap success criteria #2 satisfied (sweep honors override before fallback). Data half of success criteria #3 satisfied (Never path stores `ttlOverrideMs: null` + `expiresAt: null` on the row; sweep skips it).

## Task Commits

Each task was committed atomically:

1. **Task 1: Widen AlwaysAllowRecord + readTtlOverrideMs helper + buildAlwaysAllowValue options** — `2637aa3` (feat)
2. **Task 2: Sweep evaluator precedence — readTtlOverrideMs before TTL_CONFIG** — `60a39a7` (feat)

**Plan metadata:** TBD (final docs commit at end of execution)

_TDD shape: both tasks landed test+impl in one commit (RED proven in-process via local `bun test` runs; then GREEN; commit recorded the green state). Atomic per the plan's stated single `<action>` block per task — no separate RED test commit was specified by the plan._

## Files Created/Modified
- `src/extensions/permissions.ts` — AlwaysAllowRecord interface gains `ttlOverrideMs?: number | null` + `expiresAt?: number | null`; new exported `readTtlOverrideMs(value: unknown): number | null | undefined`; `buildAlwaysAllowValue` accepts optional third options arg.
- `src/extensions/perm-expiry-sweep.ts` — imports `readTtlOverrideMs`; always-allow loop's TTL-resolution branch replaced with precedence-aware version (null skip → override use → legacy fallback).
- `src/__tests__/always-allow-value-shape.test.ts` — adds `describe("Phase 56 — ttlOverrideMs additive shape", ...)` with 4 parseAlwaysAllowValue tolerance cases + 11 readTtlOverrideMs branch cases + 4 buildAlwaysAllowValue options cases = 19 new tests (one combined test covered two assertions, hence 20 declared / 19 cases).
- `src/__tests__/perm-expiry-sweep.test.ts` — adds `describe("Phase 56 — per-row ttlOverrideMs precedence", ...)` with 7 new cases: override-wins-over-TTL_CONFIG (project shell 1d vs 30d), override-null-skip at 365d, override-absent fallback REGRESSION, Pitfall 6 (override 1h vs foreverTtlMs 90d), override-null on scope=forever, TTL_CONFIG=never + no-override skip REGRESSION, TTL_CONFIG=never + override=1h revoke.

## Decisions Made

See frontmatter `key-decisions` — five Plan 56-01 execution decisions extracted there:
- null is the SOLE Never sentinel; 0 collapses to undefined (Pitfall 2)
- parseAlwaysAllowValue stays unchanged — structural typing tolerates extras (Pitfall 1)
- buildAlwaysAllowValue empty options object ≠ explicit null (fields stay absent)
- Override precedence wins everywhere, including TTL_CONFIG[kind]==="never"
- extension-grant scope per-row override is out of scope this plan — applies ONLY to always-allow rows

## Deviations from Plan

None — plan executed exactly as written. The plan's two `<action>` blocks (one per task) landed without scope expansion. No auto-fixes triggered (Rules 1-3); no Rule 4 architectural questions surfaced.

One stylistic note: the plan listed 20 readTtlOverrideMs test cases but several were natural one-asserter pairs (e.g. "ttlOverrideMs: null → null" and "ttlOverrideMs: number → that number" were always going to be two separate cases, not one). Final count: 19 distinct test cases in the new describe block (added an array-value defensive case for symmetry with the typeof object guard). All 20 plan-listed branches covered.

---

**Total deviations:** 0 auto-fixed, 0 Rule 4 questions, 0 deferred items.
**Impact on plan:** None — clean execution.

## Issues Encountered
None. RED verified after each test addition; GREEN verified after each production change. Integration test (`perm-expiry-sweep.integration.test.ts`) ran GREEN unchanged (16/16) — confirms the always-allow row write/apply path under real PGlite still works.

## User Setup Required
None — purely internal data-contract change. No env vars, no migrations, no external services.

## Next Phase Readiness

**Plan 56-02 (UI + endpoints) is unblocked:**
- `buildAlwaysAllowValue(allowed, now, { ttlOverrideMs, expiresAt })` is the wire format. Reapprove endpoint + first-time-grant write site will pass the options arg.
- `readTtlOverrideMs(row.value)` is the read seam for any UI/admin endpoint that needs to know "what's the per-row TTL? null / number / fallback?".
- Sweep evaluator already honors per-row override — no further changes needed in `perm-expiry-sweep.ts` for the UI to flip Never on/off (it just writes `{ ttlOverrideMs: null }` and the sweep stops revoking).

**Plan 56-03 (formatTtl + sticky KV) is unblocked:**
- `expiresAt` (when set) is the materialized timestamp formatTtl can render directly. When absent, formatTtl derives from `grantedAt + TTL_CONFIG[kind]`.
- Sticky KV pattern (last-used override per capability) writes to settings, NOT to the always-allow row — orthogonal to this plan's contract.

**No blockers for Plans 56-02 / 56-03.**

---

## Self-Check

Verified files exist:
- FOUND: src/extensions/permissions.ts (AlwaysAllowRecord widened, readTtlOverrideMs exported, buildAlwaysAllowValue options)
- FOUND: src/extensions/perm-expiry-sweep.ts (readTtlOverrideMs imported, precedence branch in runSweep)
- FOUND: src/__tests__/always-allow-value-shape.test.ts (Phase 56 describe block)
- FOUND: src/__tests__/perm-expiry-sweep.test.ts (Phase 56 precedence describe block)

Verified commits exist:
- FOUND: 2637aa3 (Task 1 — feat: AlwaysAllowRecord widen + readTtlOverrideMs + options arg)
- FOUND: 60a39a7 (Task 2 — feat: sweep evaluator precedence)

Test verification (final state):
- `bun test src/__tests__/always-allow-value-shape.test.ts` — 48/48 GREEN
- `bun test src/__tests__/perm-expiry-sweep.test.ts` — 57/57 GREEN
- `bun test src/__tests__/perm-expiry-sweep.integration.test.ts` — 16/16 GREEN (REGRESSION)
- `bun test src/__tests__/extension-permissions.test.ts src/__tests__/permission-engine.test.ts` — 56/56 GREEN (REGRESSION)

## Self-Check: PASSED

---
*Phase: 56-per-capability-ttl-ui*
*Completed: 2026-05-11*
