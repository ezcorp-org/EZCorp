---
phase: 54-security-backbone-hardening-cc1-cc5-claim-1
plan: 01
subsystem: security
tags: [pdp, permission-engine, conversation-extensions, cache, ttl, pglite, boot-spawn, sec-01, cc1]

# Dependency graph
requires:
  - phase: 53
    provides: bootSpawnFlaggedBundledExtensions + memory-extractor / lessons-distiller boot-spawn that the cache protects from PGlite warm-up lag
provides:
  - TTL-bounded conversation-override cache (Map<convId+extId, override>) absorbing PGlite warm-up lag at boot
  - primeConversationOverrideCache(convId, extId, value) — module-level export of permission-engine.ts
  - _resetOverrideCacheForTests() — module-level export of permission-engine.ts (used by Plan 02 + downstream)
  - addConversationExtensions auto-prime hook (only for entries supplying effectiveGrantedPermissions)
  - 3 RED-then-GREEN integration tests: prime+hit, TTL expiry, Plan-1 fail-OPEN boundary
affects: [54-02, 54-03, 59, 60]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Module-scoped cache (vs factory-scoped allowCache) when prime caller has no engine handle"
    - "Lazy TTL expiry on get (no background sweeper) — keeps memory honest with bounded entry count"
    - "spyOn(Date, 'now') for Bun-test time-mock (vi.useFakeTimers not supported)"
    - "Plan-boundary canary tests — explicit assertion that fail-OPEN behavior is preserved (Plan 02 will flip)"

key-files:
  created:
    - src/__tests__/permission-engine-conversation-override-cache.test.ts (255 lines, 3 tests)
  modified:
    - src/extensions/permission-engine.ts (+57 lines — cache + prime export + cache-read in loadConversationOverride)
    - src/db/queries/conversation-extensions.ts (+10 lines — prime hook in addConversationExtensions)

key-decisions:
  - "Cache lives at module scope (NOT inside createPermissionEngine factory) because the prime caller addConversationExtensions has no engine handle"
  - "Lazy expiry on get — no background setInterval sweeper. Keeps the host quiescent during idle periods"
  - "Prime ONLY for entries with effectiveGrantedPermissions. Auto-wire entries (no override) skip the cache because their loadConversationOverride answer is correctly null and registry-fallback handles them with no warm-up risk"
  - "Plan 1 keeps the silent null-on-DB-failure semantic. The null→deny swap is gated to Plan 02 (per Pitfall 1 in 54-RESEARCH.md). Test 3 codifies this boundary"
  - "Static circular import (permission-engine ↔ conversation-extensions) accepted: both imports are used at function-call time, never at module load, so ESM resolves cleanly"

patterns-established:
  - "TTL cache pattern: { value, expiresAt } entries with lazy drop on get; mirrors no-sweeper convention from allowCache"
  - "Test pattern for time-based cache expiry: spyOn(Date, 'now').mockImplementation() — Bun-test compatible"
  - "Plan-boundary canary: explicit test that failure semantic is preserved when a multi-plan refactor splits a swap across plans"

requirements-completed: [SEC-01]

# Metrics
duration: 3min
completed: 2026-05-10
---

# Phase 54 Plan 01: Conversation-Override Cache (CC1 / SEC-01) Summary

**TTL-bounded in-memory override cache primed by spawn-assignment writes; absorbs PGlite warm-up lag so bundled lessons-distiller and memory-extractor boot-spawn flows survive a cold start.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-05-11T03:05:53Z
- **Completed:** 2026-05-11T03:09:09Z
- **Tasks:** 2 (Task 1 RED test → Task 2 GREEN implementation)
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments

- Module-scoped `overrideCache` with `OVERRIDE_CACHE_TTL_MS = 60_000` and lazy expiry on `get`
- `primeConversationOverrideCache(convId, extId, value)` exported and called from `addConversationExtensions` for every entry that supplies an `effectiveGrantedPermissions` field (the spawn-assignment path)
- `loadConversationOverride` now reads the cache BEFORE the DB query and populates it on a successful read; PGlite warm-up throws are absorbed transparently
- `_resetOverrideCacheForTests()` exported so Plan 02 + downstream test files can keep cache state hermetic
- Plan 1 boundary preserved: `loadConversationOverride`'s catch still returns `null` on DB failure (Test 3 codifies this — Plan 02 will flip it to fail-CLOSED)

## Task Commits

Each task was committed atomically:

1. **Task 1: Wave 0 — write failing override-cache integration test** — `4161049` (test)
2. **Task 2: Implement override cache + cache-read + prime hook** — `3420a04` (feat)

_TDD: Task 1 was RED-only (3 failing tests via missing imports); Task 2 turned all 3 GREEN with no refactor needed._

## Files Created/Modified

- **`src/__tests__/permission-engine-conversation-override-cache.test.ts`** (created, 255 lines) — 3 integration tests:
  - Test 1: `primeConversationOverrideCache` populates cache; `loadConversationOverride` hits without touching DB (DB layer wired to throw — cache absorbs the lookup)
  - Test 2: TTL expiry via `spyOn(Date, "now")` advancing past 60_000ms; second authorize forces a DB read with fresh grants
  - Test 3: cache miss + DB throw → engine falls back to registry grants (Plan 1 fail-OPEN boundary; deny reason is the missing-cap form, NOT `override-lookup-failed`)
- **`src/extensions/permission-engine.ts`** (+57 lines):
  - New module-scoped `OverrideCacheEntry` type, `overrideCache: Map<string, OverrideCacheEntry>`, `OVERRIDE_CACHE_TTL_MS = 60_000`, `overrideCacheKey(convId, extId)` helper
  - New exports: `primeConversationOverrideCache(convId, extId, value)` and `_resetOverrideCacheForTests()`
  - `loadConversationOverride` now performs cache read → drop-if-expired → DB read → cache populate, all gated by the existing `try/catch` that still returns null on DB throw
- **`src/db/queries/conversation-extensions.ts`** (+10 lines):
  - New static import of `primeConversationOverrideCache` from `permission-engine.ts`
  - `addConversationExtensions` now iterates entries after the insert and primes the cache for every entry with `effectiveGrantedPermissions !== undefined`; auto-wire entries (no override) deliberately skip

## Decisions Made

- **Cache scope:** module-scoped, not factory-scoped. Rationale: the prime caller (`addConversationExtensions`) does not have an engine handle, and the cache must be reachable from a different module. The existing `allowCache` is per-engine-instance because it ties to `resolvePrompt` lifecycle; the override cache has no such tie-in.
- **No background sweeper:** lazy expiry on `get` is correct AND simpler. Cache is bounded by `(active conversations × extensions with overrides)`, which is small in practice; entries naturally evict on the next read after expiry.
- **Selective prime (overrides only):** `addConversationExtensions` auto-wires every extension on every conversation when called from the messageToolbar path with no override. Priming those would bloat the cache with `null` entries that are never DB-read on the slow path. Only entries with `effectiveGrantedPermissions !== undefined` (the spawn-assignment path) get primed — exactly the entries where PGlite warm-up race actually matters.
- **Static circular import accepted:** `permission-engine.ts` already imports from `db/queries/conversation-extensions.ts`. The new prime hook adds an edge in the reverse direction. Both edges resolve at function-call time (not module-load time), so ESM handles this without runtime issues. Avoided dynamic `await import()` workaround to keep the call path synchronous.
- **Plan boundary canary (Test 3):** asserts the engine falls back to registry on DB throw and that the deny reason is the missing-cap form, NOT `"override-lookup-failed"`. If a future change flips fail-OPEN to fail-CLOSED, this test fails — exactly what Plan 02's swap intends to do, but only after the cache has been on mainline.

## Deviations from Plan

None — plan executed exactly as written.

The plan called out a contingency: if `spyOn(Date, "now")` proved insufficient for Test 2's time-advance, document the alternative time-mock approach. `spyOn(Date, "now").mockImplementation(() => baseline + delta)` worked on the first attempt; no alternative was needed.

## Issues Encountered

None. All test runs were single-pass:
- Task 1: 1 fail / 0 pass / 1 error (RED state — `_resetOverrideCacheForTests` import not found, exactly as predicted)
- Task 2: cache test 3/3 pass, regression suite 25/25 pass, boot-spawn 12/12 pass, conversation-extensions 10/10 pass, spawn-cap-inheritance + effective-grants 19/19 pass

## Plan 02 Dependency

**The cache MUST be on mainline before Plan 02's null→deny swap lands.** Plan 02 modifies `loadConversationOverride`'s catch block to throw, and the caller (`authorize`) upgrades the decision to `{decision: "deny", reason: "override-lookup-failed"}`. Without this plan's cache, that swap would cascade boot-spawn flakes during PGlite warm-up — bundled lessons-distiller and memory-extractor would deny their first event after boot instead of falling through to registry grants.

The Test 3 canary in this plan will start failing the moment Plan 02 lands — that is the EXPECTED transition signal, and Plan 02 will rewrite Test 3 to assert the new fail-CLOSED behavior.

## Next Phase Readiness

- Plan 02 (CC1 part 2 of 2 — null→deny swap) is unblocked
- Plan 03 (CC5 + Claim-1 documentation) is independent of this work
- No blockers; full backend regression for affected paths (~70 tests) all green

## Self-Check: PASSED

All claims verified against disk:
- 4 files exist (1 created test, 2 modified source, 1 new SUMMARY.md)
- 2 commits present (`4161049` test + `3420a04` feat)
- `primeConversationOverrideCache` exported from `permission-engine.ts`
- `_resetOverrideCacheForTests` exported from `permission-engine.ts`
- `primeConversationOverrideCache` call site present in `conversation-extensions.ts`

---
*Phase: 54-security-backbone-hardening-cc1-cc5-claim-1*
*Completed: 2026-05-10*
