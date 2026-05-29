---
phase: 65-hybrid-search-sql-api
plan: 01
subsystem: database
tags: [pgvector, hnsw, rrf, postgres-fts, hybrid-search, pglite, drizzle]

# Dependency graph
requires:
  - phase: 63-indexing-primitives
    provides: "message_chunks table (denormalized conversation_id, vector(384), HNSW idx_message_chunks_embedding), EMBEDDING_MODEL_ID, EMBEDDING_DIMENSIONS"
  - phase: 64-embed-on-write-worker
    provides: "populated message_chunks embeddings (the corpus searchMessages reads)"
provides:
  - "searchMessages() — message-grained RRF query builder (mode-parameterized: hybrid/keyword/semantic), the single SQL source of truth for Wave 2 + Phases 66/67"
  - "MessageSearchHit / SearchMode / MatchType / RRF_K exports"
  - "explainVectorLegSql() — exact ANN SQL string for SRCH-05 EXPLAIN proofs"
affects: [65-02 search-route, 66-sidebar-search, 67-command-palette-search]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dual-backend RRF in one CTE round-trip via db.execute(sql`…`) + sql.raw(toVectorLiteral) (searchKBChunks pattern, NOT rawQuery string-interp)"
    - "SRCH-05 HNSW-friendly ANN leg: single-table message_chunks scan, denormalized conversation_id=ANY(ARRAY(<scoped ids>)), SET hnsw.iterative_scan='relaxed_order', role+DISTINCT-ON applied OUTSIDE the ANN scan"

key-files:
  created:
    - src/db/queries/message-search.ts
    - src/__tests__/message-search.test.ts
    - src/__tests__/message-search-explain.test.ts
  modified:
    - scripts/coverage-thresholds.json

key-decisions:
  - "ANN leg scans message_chunks ALONE with conversation_id=ANY(ARRAY(...)) (no join, no role/DISTINCT inside) — the only shape that drives the HNSW index on the shipped PGlite 0.3.16/pgvector 0.8.0 stack; role filter + closest-chunk DISTINCT-ON happen in wrapper CTEs / display join"
  - "SET hnsw.iterative_scan='relaxed_order' best-effort (try/swallow) — needed for filtered HNSW correctness+index use at scale; brute fallback returns identical rows on small corpora"
  - "Lexical-only test rows carry a NULL embedding (not a 'far' vector) because pgvector ANN returns nearest-K regardless of absolute distance — a far vector still surfaces in a small corpus"
  - "semantic snippet = plain ~35-word leading slice computed in the TS mapper (split/slice/join); <mark> snippet only via ts_headline on the lexical/both path"

patterns-established:
  - "HNSW-in-filter ANN: resolve tenant conv-ids as an InitPlan array, scan the embedded table alone ordered by distance, defer every join/role/DISTINCT to outer CTEs — keeps idx_message_chunks_embedding selectable"
  - "Live-probe the SHIPPED engine's EXPLAIN plan before trusting a research planner claim; gate the SRCH proof on the specific 'Index Scan using <idx> on <table>' string + Filter predicate"
  - "Share the exact ANN SQL between the builder and its EXPLAIN test via an exported helper (explainVectorLegSql) so the proof can never drift from the live query"

requirements-completed: [SRCH-02, SRCH-03, SRCH-04, SRCH-05, SRCH-06, SRCH-07]

# Metrics
duration: ~50min
completed: 2026-05-29
---

# Phase 65 Plan 01: Hybrid Search SQL (message-grained RRF) Summary

**`searchMessages()` fuses a pgvector/HNSW semantic leg and a Postgres FTS lexical leg via Reciprocal Rank Fusion (k=60) in one mode-parameterized CTE round-trip, tenant-scoped inside the CTEs, with honest asymmetric snippets, a match-type tag per hit, and a live-proven HNSW-Index-Scan plan for SRCH-05.**

## Performance

- **Duration:** ~50 min
- **Started:** 2026-05-29T19:23Z
- **Completed:** 2026-05-29T19:41Z
- **Tasks:** 3 (plus pre-implementation context read + EXPLAIN-plan live probing)
- **Files modified:** 4 (1 module + 2 tests created, 1 threshold file edited)

## Accomplishments
- `searchMessages()` RRF builder: hybrid (FULL OUTER JOIN of vector ⋈ keyword), keyword-only, semantic-only modes; fused score `1/(K+rank_v)+1/(K+rank_k)`, `RRF_K=60`.
- In-CTE tenant scope (project_id + test-null-safe + optional user_id + role IN user/assistant + embedding NOT NULL); cross-project / cross-user / test=true / system / tool rows never leak.
- Honest asymmetric snippets: `<mark>…</mark>` (ts_headline) for lexical/both, plain leading 35-word slice for semantic-only.
- `DISTINCT ON (message_id)` collapses a multi-chunk message to its closest chunk (one hit).
- SRCH-05 proven: the vector leg drives `Index Scan using idx_message_chunks_embedding on message_chunks` with the tenant predicate as a `Filter:` inside that node, no Seq Scan — verified by EXPLAIN ANALYZE against the SAME SQL the builder runs.
- 14/14 backend tests green; module at 100% line + function coverage; per-file 100% threshold pinned.

## Task Commits

1. **Task 0: failing test scaffolds + seed helper** — `9b4be50` (test)
2. **Task 1: implement searchMessages() RRF builder (GREEN)** — `fff8524` (feat) _(seed/test refinements landed with the implementation per GREEN iteration)_
3. **Task 2: pin per-file coverage threshold** — `7b74ad3` (chore)

**Plan metadata:** _(this docs commit)_

## Files Created/Modified
- `src/db/queries/message-search.ts` — `searchMessages()` RRF builder + `MessageSearchHit`/`SearchMode`/`MatchType`/`RRF_K` exports + `explainVectorLegSql()` SRCH-05 helper.
- `src/__tests__/message-search.test.ts` — PGlite-seeded RRF / mode / scoping / snippet / match-type / DISTINCT-ON / <2-char-guard coverage (deterministic axis-vectors for near/orthogonal; NULL embedding for lexical-only).
- `src/__tests__/message-search-explain.test.ts` — SRCH-05 EXPLAIN-ANALYZE proof that the tenant filter lands inside the HNSW Index Scan.
- `scripts/coverage-thresholds.json` — `"src/db/queries/message-search.ts": 100`.

### Contract for Wave 2 (65-02 depends on this)
```ts
export const RRF_K = 60;
export type SearchMode = "hybrid" | "keyword" | "semantic";
export type MatchType = "lexical" | "semantic" | "both";
export interface MessageSearchHit {
  conversationId: string;
  conversationTitle: string;
  messageId: string;
  role: "user" | "assistant";
  createdAt: Date;
  snippet: string;          // <mark>…</mark> for lexical/both; plain slice for semantic
  matchType: MatchType;
  rankLexical: number | null;
  rankSemantic: number | null;
  score: number;
}
export async function searchMessages(params: {
  projectId: string;
  query: string;
  mode: SearchMode;
  queryEmbedding: number[] | null;   // required for hybrid/semantic
  userId?: string;
  limit?: number;                    // default 20
  offset?: number;                   // default 0
}): Promise<MessageSearchHit[]>;
```
- Snippet strategy: semantic-only snippet is a plain `content.split(/\s+/).slice(0,35).join(" ")` (no `<mark>`); lexical/both reuse the ts_headline `<mark>` snippet.
- `searchMessages` calls `SET hnsw.iterative_scan='relaxed_order'` (best-effort) when the mode needs the vector leg — Wave 2 inherits this automatically.

### Seed-helper quirks the route test should reuse
- Raw `INSERT INTO message_chunks (...)` MUST supply an explicit `id` — raw SQL bypasses drizzle's `$defaultFn`, so an omitted id NOT-NULL-violates.
- A "lexical-only" message needs a **NULL embedding** (or no chunk) to stay out of the semantic leg; a merely-distant vector still appears (ANN = nearest-K, not within-radius).
- The SRCH-05 EXPLAIN proof needs a **large** corpus (~2.5k chunks) — the HNSW index only beats a bitmap/seq scan past the planner's cost crossover; the plan's "≥100" floor was insufficient.

## Decisions Made
- See `key-decisions` frontmatter. Headline: the SRCH-05 ANN leg is single-table + denormalized `conversation_id=ANY(ARRAY(...))` + `hnsw.iterative_scan` — the only structure that yields the required HNSW-Index-Scan plan on the shipped engine.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Correctness/blocking-premise] SRCH-05 required the `hnsw.iterative_scan` GUC + single-table ANN restructure (plan's anti-pattern was based on a false research claim)**
- **Found during:** Task 1 (GREEN), confirmed by live EXPLAIN-plan probing of the shipped PGlite 0.3.16 / pgvector 0.8.0 stack.
- **Issue:** The plan's Task-1 anti-pattern said "do NOT feature-detect `hnsw.iterative_scan` — pgvector 0.8.0 default behavior satisfies SRCH-05 (no GUC)", and prescribed a JOIN-based ANN CTE with `DISTINCT ON` in the innermost select. Live probing showed that structure NEVER picks `idx_message_chunks_embedding` (the planner falls back to a Bitmap/Seq scan + brute top-N sort), so the must-have "tenant Filter inside the HNSW Index Scan" plan never appears. `DISTINCT ON ... ORDER BY message_id, dist` is also fundamentally HNSW-incompatible (HNSW only accelerates `ORDER BY embedding <=> q LIMIT k`).
- **Fix:** Restructured the vector leg to (1) resolve scoped conversation ids as an `ANY(ARRAY(SELECT ...))` InitPlan, (2) scan `message_chunks` ALONE ordered by `embedding <=> q LIMIT k*2` filtered by the denormalized `conversation_id` (no join, no role, no DISTINCT inside), (3) apply role filter + closest-chunk `DISTINCT ON (message_id)` + `ROW_NUMBER` + display join OUTSIDE the ANN scan, (4) `SET hnsw.iterative_scan='relaxed_order'` (best-effort, swallowed on backends without it). `explainVectorLegSql()` returns this exact single-table ANN shape.
- **Files modified:** `src/db/queries/message-search.ts`, `src/__tests__/message-search-explain.test.ts` (set the GUC, assert the specific HNSW-index-scan node, seed ~2.5k chunks).
- **Verification:** EXPLAIN ANALYZE shows `Index Scan using idx_message_chunks_embedding on message_chunks` with `Filter: … conversation_id = ANY((InitPlan 1).col1)` and no Seq Scan; the SRCH-05 test asserts that exact node string. Functional results identical to the join form on small corpora (the other 13 tests still pass).
- **Committed in:** `fff8524` (Task 1 commit).

**2. [Rule 1 - Bug] Raw chunk INSERTs omitted the `id` primary key**
- **Found during:** Task 1 (first GREEN run).
- **Issue:** `db.execute(sql\`INSERT INTO message_chunks …\`)` bypasses drizzle's `$defaultFn` for `id`, NOT-NULL-violating on insert.
- **Fix:** Supply `crypto.randomUUID()` explicitly in the test seed's raw chunk inserts (matches the knowledge-base.ts precedent of passing id on raw vector inserts).
- **Files modified:** `src/__tests__/message-search.test.ts`, `src/__tests__/message-search-explain.test.ts`.
- **Verification:** seed inserts succeed; tests run.
- **Committed in:** `fff8524`.

**3. [Rule 1 - Bug] "lexical-only" seed row leaked into the semantic leg**
- **Found during:** Task 1 (SRCH-03/SRCH-07 failures).
- **Issue:** The lexical-only message originally carried a "far" (orthogonal) chunk vector. pgvector ANN returns nearest-K regardless of absolute distance, so in the tiny corpus that far chunk still ranked into the vector leg → the row was tagged `both` instead of `lexical`.
- **Fix:** Give the lexical-only message a **NULL embedding** so the `embedding IS NOT NULL` filter excludes it from the semantic leg entirely while it still matches FTS — the honest lexical-only signal.
- **Files modified:** `src/__tests__/message-search.test.ts`.
- **Verification:** SRCH-03 (keyword/semantic mode partitioning) and SRCH-07 (match-type) pass.
- **Committed in:** `fff8524`.

---

**Total deviations:** 3 auto-fixed (3 Rule-1: 1 correctness/false-premise restructure, 2 test-seed bugs).
**Impact on plan:** Deviation #1 is the load-bearing one — it changes the vector-leg SQL shape (and the exported EXPLAIN helper) vs the plan's prescription, but preserves the entire public contract (`searchMessages` signature, `MessageSearchHit`, all three modes, match types, RRF_K=60) and is REQUIRED for SRCH-05 to actually hold on the shipped engine. No new dependencies, no architectural change (still one CTE round-trip over the same tables, using the denormalized column the schema was explicitly designed for). #2/#3 are test-seed corrections. No scope creep.

## Issues Encountered
- Full-project `bunx tsc --noEmit` OOM-crashes under node (V8 stack trace, not a type error) — pre-existing environmental issue, out of scope. The new module typechecks clean in isolation (`tsc --noEmit --skipLibCheck` on `message-search.ts`), and the project typecheck gate excludes `src/__tests__` per `web/scripts/test.sh` precedent.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Wave 2 (`65-02`) can build `/api/search/messages` directly on `searchMessages()` — the full contract + snippet strategy + GUC behavior are documented above.
- Degraded-fallback gate (`isEmbeddingReady`) is consumed in Wave 2, NOT here (this module takes a `queryEmbedding` arg and returns `[]` when a vector-needing mode gets a null embedding).
- Phases 66/67 consume `MessageSearchHit` unchanged.

---
*Phase: 65-hybrid-search-sql-api*
*Completed: 2026-05-29*

## Self-Check: PASSED

- FOUND: src/db/queries/message-search.ts
- FOUND: src/__tests__/message-search.test.ts
- FOUND: src/__tests__/message-search-explain.test.ts
- FOUND: scripts/coverage-thresholds.json entry ("src/db/queries/message-search.ts": 100)
- FOUND: commit 9b4be50 (Task 0 test scaffolds)
- FOUND: commit fff8524 (Task 1 implementation)
- FOUND: commit 7b74ad3 (Task 2 coverage threshold)
