---
phase: 67-command-palette-search
plan: 03
subsystem: api
tags: [search, hybrid-search, pgvector, hnsw, rrf, postgres, drizzle, zod, sveltekit, cross-project, command-palette]

# Dependency graph
requires:
  - phase: 65-hybrid-search-sql-api
    provides: "searchMessages() single-CTE RRF query + /api/search/messages endpoint + MessageSearchHit contract + explainVectorLegSql() EXPLAIN proof"
provides:
  - "scope=project|all search path: scope=all ranks across ALL of the requesting user's projects in one SQL round-trip (PAL-01)"
  - "projectId + projectName on every MessageSearchHit (server + client types) — the foundational field cross-project deep-links depend on (PAL-05)"
  - "tenantPredicate() helper unifying single-project (project_id) and cross-project (user_id) scoping for both ANN and lexical legs"
  - "endpoint scope enum (zod): scope=all skips the projectId-required 400; scope=project keeps it"
  - "multi-project EXPLAIN proof: scope=all keeps idx_message_chunks_embedding HNSW Index Scan, no Seq Scan (SRCH-05 invariant preserved cross-project)"
affects: [67-04, 67-05, 67-06, 67-07, command-palette-deep-link, palette-results]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "tenantPredicate(projectId,userId,scope): swappable scope predicate (project_id vs user_id) shared by scopedConvArray (ANN leg) + keywordLegInner (lexical leg) — single source of tenant truth, mirrored verbatim in explainVectorLegSql"
    - "scope=all keeps single-table ANN: tenant resolved as conversation_id = ANY(ARRAY(SELECT ... WHERE c.user_id = userId)) — no project->conversation join inside the HNSW scan (Pitfall 5), so the index scan survives multi-project scale"
    - ".unit.test.ts suffix for pure-function client-contract tests so the web vitest include glob picks them up (vs .server/.component)"
key-files:
  created:
    - "web/src/__tests__/api-search-messages.client.unit.test.ts"
    - ".planning/phases/67-command-palette-search/deferred-items.md"
  modified:
    - "src/db/queries/message-search.ts"
    - "src/__tests__/message-search.test.ts"
    - "src/__tests__/message-search-explain.test.ts"
    - "web/src/routes/api/search/messages/schema.ts"
    - "web/src/routes/api/search/messages/+server.ts"
    - "web/src/lib/api.ts"
    - "web/src/__tests__/api-search-messages.server.test.ts"
    - "web/src/__tests__/conversation-list-logic.test.ts"
    - "web/src/__tests__/conversation-list-search-mode.component.test.ts"
    - "web/src/__tests__/search-mode.test.ts"

key-decisions:
  - "scope=all without userId returns [] (tenant unresolvable) rather than going global — a missing tenant must never widen to every user's data"
  - "projectId/projectName added as REQUIRED (non-optional) fields on MessageSearchHit — every real query path now selects them via the projects JOIN, so optional would only mask fixture bugs"
  - "tenantPredicate() helper instead of inlining two scope branches in three places — DRY across the ANN leg, lexical leg, and the raw EXPLAIN string"
  - "Client test named .unit.test.ts (not .client.test.ts) to satisfy the web vitest include glob, which only matches .component/.server/.unit suffixes"

patterns-established:
  - "Scope-predicate swap: a single tenantPredicate() drives both legs + the EXPLAIN mirror so single-project and cross-project share one tested code path"
  - "Required-field type extension forces fixture audit: making MessageSearchHit.projectId/projectName required surfaced 3 stale Phase-66 fixtures at typecheck time (caught by svelte-check, not runtime)"

requirements-completed: [PAL-01, PAL-05]

# Metrics
duration: ~25min
completed: 2026-05-30
---

# Phase 67 Plan 03: Cross-Project Search Scope + projectId/projectName Summary

**`scope=project|all` message search that ranks across ALL of the requesting user's projects in one HNSW-indexed round-trip, never leaks another user, and returns projectId/projectName on every hit (the field cross-project palette deep-links depend on).**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-30T20:46:32Z
- **Completed:** 2026-05-30T20:51:08Z
- **Tasks:** 2
- **Files modified:** 10 (1 created test, 1 created deferred-items doc, 8 modified)

## Accomplishments
- Generalized `scopedConvArray()` to a `tenantPredicate()` helper: `scope=project` keeps `c.project_id = projectId`, `scope=all` switches to `c.user_id = userId` across every project — both driving the SAME single-table denormalized `conversation_id = ANY(...)` ANN scan (no join inside the HNSW node).
- Added `projectId` + `projectName` to every hit via a `JOIN projects p` on all three display SELECTs (keyword/semantic/hybrid) and to `toHit()` + both the server (`message-search.ts`) and client (`api.ts`) `MessageSearchHit` types.
- Endpoint: zod `scope` enum (`project|all`, default `project`); `scope=all` skips the projectId-required 400 and resolves tenant by `userId`; `scope=project` keeps the Phase 65 hard 400. Auth/read-scope gate, limit/offset clamp, and degraded envelope all unchanged.
- Proved the SRCH-05 invariant survives cross-project: the multi-project (`scope=all`) EXPLAIN keeps `Index Scan using idx_message_chunks_embedding` with `Filter: conversation_id` and NO `Seq Scan on message_chunks`.
- Client `searchMessages(projectId, query, {..., scope})` forwards `scope`; new typed fields surfaced on the returned hit.

## Task Commits

Each task was committed atomically:

1. **Task 1: Cross-project scope + projectId/projectName in the query builder** - `dde7a142` (feat)
2. **Task 2: Endpoint scope param + client contract (projectId/projectName)** - `52f97504` (feat)

_Note: both tasks were TDD; tests were extended alongside the implementation in a single feat commit each (the suites were already green from Phase 65 and extended in place rather than RED-from-scratch)._

## Files Created/Modified
- `src/db/queries/message-search.ts` - `SearchScope` type; `tenantPredicate()` + generalized `scopedConvArray()`; `scope` threaded through both leg builders + `searchMessages()`; `projectId`/`projectName` selected via projects JOIN on all 3 display SELECTs + `toHit()` + `MessageSearchHit`; `explainVectorLegSql()` gains a `scope` param mirroring the tenant predicate.
- `src/__tests__/message-search.test.ts` - second project (C) owned by userA + a C test=true conversation added to the seed; new `scope=all` describe block (cross-project hits, cross-user leak guard, test/role exclusion, keyword+semantic coverage, no-userId→[]) + a projectId/projectName-on-every-hit case.
- `src/__tests__/message-search-explain.test.ts` - second project owned by the same user (~10% of rows) + a `scope=all` multi-project EXPLAIN case asserting the HNSW Index Scan + user_id tenant + no Seq Scan.
- `web/src/routes/api/search/messages/schema.ts` - zod `scope: z.enum(["project","all"]).default("project")`.
- `web/src/routes/api/search/messages/+server.ts` - parse `scope`; branch the projectId-required 400; pass `{scope, projectId?, userId}` to `searchMessages`.
- `web/src/lib/api.ts` - `SearchScope` type; `opts.scope` forwarded as a query param; `projectId`/`projectName` on the client `MessageSearchHit`.
- `web/src/__tests__/api-search-messages.server.test.ts` - `scope` param in the `href()` helper + a PAL-01 describe block (scope=all no-400, scope=project still 400, scope enum 400, projectId/projectName on hits, default-project passthrough).
- `web/src/__tests__/api-search-messages.client.unit.test.ts` (created) - fetch-spy harness asserting `scope` forwarding (all/project/omitted), mode/limit/offset coexistence, and the new typed fields on the returned hit.
- `web/src/__tests__/conversation-list-logic.test.ts`, `conversation-list-search-mode.component.test.ts`, `search-mode.test.ts` - backfilled `projectId`/`projectName` into the local `MessageSearchHit` fixture factories (Rule-1; see Deviations).
- `.planning/phases/67-command-palette-search/deferred-items.md` (created) - logged the parallel-session `palette-results.test.ts` / `CommandPalette.component.test.ts` out-of-scope errors.

## Decisions Made
- **scope=all + no userId → `[]`**, never global: an unresolvable tenant must fail closed, not widen to every user's data.
- **projectId/projectName are REQUIRED** (non-optional) on `MessageSearchHit`: every real query path selects them, so optional would only hide fixture drift.
- **`tenantPredicate()` helper** instead of inlining two scope branches in three call sites (ANN leg, lexical leg, EXPLAIN string) — one tested source of tenant truth.
- **Client test suffix `.unit.test.ts`** to match the web vitest include glob.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Backfilled projectId/projectName into 3 Phase-66 MessageSearchHit fixtures**
- **Found during:** Task 2 (svelte-check after the api.ts type extension)
- **Issue:** Making `MessageSearchHit.projectId`/`projectName` required broke three existing Phase-66 test fixture factories (`conversation-list-logic.test.ts`, `conversation-list-search-mode.component.test.ts`, `search-mode.test.ts`) which constructed the type without the new fields — 3 typecheck errors directly caused by this plan's change.
- **Fix:** Added `projectId`/`projectName` defaults to each local fixture factory's base object.
- **Files modified:** the three test files above.
- **Verification:** svelte-check errors dropped 40→37 (only the 3 caused by my change cleared); all three suites still green (56 bun + 23 vitest cases).
- **Committed in:** `52f97504` (Task 2 commit)

**2. [Rule 3 - Blocking] Renamed the client test to `.unit.test.ts` + parseUrl base**
- **Found during:** Task 2 (running the plan's verify command)
- **Issue:** (a) The plan named the file `api-search-messages.client.test.ts`, but the web vitest `include` glob only matches `.component/.server/.unit.test.ts` + one explicit file — so the file was silently not collected ("No test files found"). (b) Once collected, `new URL(urls[0])` threw "Invalid URL" because the client uses `BASE=""` → relative fetch URLs.
- **Fix:** (a) named the file `api-search-messages.client.unit.test.ts`; (b) added a `parseUrl()` helper passing `"http://localhost"` as the base for all relative-URL assertions.
- **Files modified:** `web/src/__tests__/api-search-messages.client.unit.test.ts`.
- **Verification:** `bunx vitest run` (from web/) now collects both files: 28 cases green.
- **Committed in:** `52f97504` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 Rule-1 bug, 1 Rule-3 blocking)
**Impact on plan:** Both essential — Rule-1 keeps the existing Phase-66 fixtures type-correct against the new required fields; Rule-3 makes the plan's own verify command actually exercise the client test. No scope creep; no SUT logic changed beyond the plan.

## Issues Encountered
- `.planning/` is gitignored in this repo (consistent with prior `docs(67): ... (force-add)` commits) — code commits land normally; the SUMMARY/STATE/ROADMAP planning docs are force-added in the final metadata commit.

## Verification

- `bun test src/__tests__/message-search.test.ts src/__tests__/message-search-explain.test.ts` → 21 pass / 0 fail (was 16; net +5 cross-project/leak/EXPLAIN cases).
- `cd web && bunx vitest run src/__tests__/api-search-messages.server.test.ts src/__tests__/api-search-messages.client.unit.test.ts` → 28 pass / 0 fail.
- Multi-project EXPLAIN asserts `Index Scan using idx_message_chunks_embedding on message_chunks` + `Filter: conversation_id` + `user_id` tenant + NO `Seq Scan on message_chunks`.
- `svelte-check`: zero errors in any 67-03-touched file (37 remaining errors are all pre-existing baseline / parallel-session Phase-67 artifacts, logged in deferred-items.md).

## Sacred-12-stash invariant
- `git stash list | wc -l` held at 12 → 12 → 12 throughout; explicit-path `git add` only; zero `git stash` operations; zero touches to parallel-session dirty files.

## Next Phase Readiness
- The cross-project search contract (PAL-01) and the `projectId`/`projectName` deep-link fields (PAL-05) are now in place — the foundational backend every palette deep-link depends on. 67-04+ (palette UI, `palette-results` grouping module, `CommandPalette` wiring) can consume `searchMessages(projectId, q, {scope:"all"})` and the per-hit `projectId`/`projectName` directly.
- Note for parallel palette work: `web/src/lib/search/__tests__/palette-results.test.ts` references a not-yet-created `../palette-results` module (a later 67 plan's deliverable) — those errors are not from 67-03.

## Self-Check: PASSED

- FOUND: `web/src/__tests__/api-search-messages.client.unit.test.ts`
- FOUND: `.planning/phases/67-command-palette-search/deferred-items.md`
- FOUND: `.planning/phases/67-command-palette-search/67-03-SUMMARY.md`
- FOUND: `src/db/queries/message-search.ts` (modified)
- FOUND commit: `dde7a142` (Task 1)
- FOUND commit: `52f97504` (Task 2)

---
*Phase: 67-command-palette-search*
*Completed: 2026-05-30*
