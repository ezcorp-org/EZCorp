---
phase: 65-hybrid-search-sql-api
verified: 2026-05-29T16:00:00Z
status: passed
score: 8/8 must-haves verified
re_verification: false
---

# Phase 65: Hybrid Search SQL API Verification Report

**Phase Goal:** A single authenticated endpoint returns ranked, tenant-scoped, message-grained search hits that fuse lexical and semantic signal in one SQL round-trip, with honest snippets and a graceful keyword-only fallback when the embedder is down.
**Verified:** 2026-05-29
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth                                                                                                                                                                              | Status     | Evidence                                                                                                                                      |
|----|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------|-----------------------------------------------------------------------------------------------------------------------------------------------|
| 1  | GET /api/search/messages returns ranked message hits for an authenticated, read-scoped caller; unauthenticated or out-of-scope requests are rejected.                               | VERIFIED | Route exists at web/src/routes/api/search/messages/+server.ts; requireScope (403) + requireAuth (401) gates in place; 18/18 route tests green. |
| 2  | Default (hybrid) mode fuses FTS and vector results via RRF in one CTE-based query; mode=keyword and mode=semantic return the single-leg variants.                                  | VERIFIED | searchMessages() implements FULL OUTER JOIN of vector_ranked/keyword_ranked CTEs in one db.execute() call; keyword/semantic branches present; 14/14 backend tests green. |
| 3  | Every hit belongs to the requesting user's active project, test=true conversations excluded, and EXPLAIN ANALYZE shows tenant filter applied inside/before the ANN scan.             | VERIFIED | scopedConvArray() + test-null-safe filter in CTEs; SRCH-05 EXPLAIN test seeds 2500 chunks, asserts "Index Scan using idx_message_chunks_embedding on message_chunks" + Filter:conversation_id + no Seq Scan; 14/14 pass. |
| 4  | A lexical hit returns a \<mark\>-highlighted snippet; a semantic-only hit returns a plain ±window snippet; each hit tagged with match type (lexical/semantic/both).                 | VERIFIED | ts_headline with StartSel=\<mark\> used for lexical/both; plainSnippet() (split/slice/join) used for semantic; matchType derived from rank_v/rank_k null presence; SRCH-06/07 tests pass. |
| 5  | When the embedder is unavailable (isEmbeddingReady() false OR generateEmbedding throws), hybrid/semantic return keyword hits with degraded:true and servedMode:'keyword' at 200.    | VERIFIED | Degraded gate in +server.ts: pre-check + try/catch; keyword mode never touches embedder; 4 SRCH-08 route test cases pass (not-ready, throw, keyword-never-degraded). |
| 6  | Tenant scoping is applied inside CTEs (cross-project, cross-user, test=true, system/tool exclusion) with no application-level post-filtering.                                       | VERIFIED | All scoping is WHERE clauses inside CTEs; result.rows mapped directly to hits with no .filter() calls; SRCH-04 test asserts 5 exclusion categories. |
| 7  | RRF_K=60, fused score arithmetic is 1/(K+rank_v) + 1/(K+rank_k), DISTINCT ON collapses multi-chunk messages to one hit.                                                            | VERIFIED | RRF_K exported as const 60; Q1 test verifies score arithmetic to 6 decimal places; DISTINCT-ON test confirms long two-chunk message appears exactly once. |
| 8  | MessageSearchHit + SearchMessagesResponse + searchMessages() client helper exist in web/src/lib/api.ts for Phases 66/67.                                                            | VERIFIED | All four types (SearchMode, MatchType, MessageSearchHit, SearchMessagesResponse) + searchMessages() function exported from web/src/lib/api.ts; createdAt:string on wire. |

**Score:** 8/8 truths verified

---

### Required Artifacts

| Artifact                                                             | Min Lines | Actual Lines | Status    | Details                                                                                          |
|----------------------------------------------------------------------|-----------|--------------|-----------|--------------------------------------------------------------------------------------------------|
| `src/db/queries/message-search.ts`                                   | 120       | 377          | VERIFIED  | Exports: searchMessages, RRF_K, SearchMode, MatchType, MessageSearchHit, SearchMessagesParams, explainVectorLegSql |
| `src/__tests__/message-search.test.ts`                               | 150       | 434          | VERIFIED  | 11 test cases; PGlite corpus with 9-row seed covering all exclusion categories                   |
| `src/__tests__/message-search-explain.test.ts`                       | 40        | 112          | VERIFIED  | SRCH-05 EXPLAIN ANALYZE proof seeding 2500 chunks; HNSW index node assertion passes              |
| `web/src/routes/api/search/messages/+server.ts`                      | 40        | 77           | VERIFIED  | GET handler with auth/scope gate, zod validation, clamp, degraded gate, searchMessages call       |
| `web/src/routes/api/search/messages/schema.ts`                       | 8         | 12           | VERIFIED  | Zod enum for mode (hybrid/keyword/semantic, default hybrid)                                       |
| `web/src/lib/api.ts`                                                 | -         | contains     | VERIFIED  | SearchMode, MatchType, MessageSearchHit, SearchMessagesResponse, searchMessages() all present     |
| `web/src/__tests__/api-search-messages.server.test.ts`               | 120       | 294          | VERIFIED  | 18 test cases covering SRCH-01/03/08 + all locked edge cases; 100% off PGlite via vi.mock        |

---

### Key Link Verification

| From                                          | To                                           | Via                                          | Status    | Details                                                                                                   |
|-----------------------------------------------|----------------------------------------------|----------------------------------------------|-----------|-----------------------------------------------------------------------------------------------------------|
| `web/src/routes/api/search/messages/+server.ts` | `src/db/queries/message-search.ts`          | `import { searchMessages } from "$server/db/queries/message-search"` | WIRED | Import line 2; called at line 66 with all params; mode and queryEmbedding threaded through. |
| `web/src/routes/api/search/messages/+server.ts` | `isEmbeddingReady() + generateEmbedding()` | Degraded gate (pre-check + try/catch)        | WIRED     | isEmbeddingReady() called line 52; generateEmbedding() called line 57 in try/catch block.               |
| `src/db/queries/message-search.ts`            | `message_chunks JOIN conversations (mc.conversation_id)` | `scopedConvArray()` + `mc.conversation_id = ANY(ARRAY(...))` | WIRED | Lines 89-96, 121; denormalized conversation_id used in ANN scan without join. |
| `src/db/queries/message-search.ts`            | Tenant scope (test-null-safe + role filter)  | `c.test IS NULL OR c.test = false` in CTEs   | WIRED     | Lines 94, 148; both vector CTE (via scopedConvArray) and keyword CTE apply the test-null-safe filter.   |
| `web/src/lib/api.ts` `searchMessages()`       | `GET /api/search/messages`                   | `fetch(\`\${BASE}/api/search/messages?...\`)` | WIRED | Builds URLSearchParams with projectId, q, mode, limit, offset; calls checkResponse; returns res.json().  |
| `src/api-registry.ts`                         | `GET /api/search/messages`                   | Registry row in `conversations` category     | WIRED     | Line 46: `{ method: "GET", path: "/api/search/messages", ... }` confirmed present.                      |

---

### Requirements Coverage

| Requirement | Source Plan | Description                                                                                      | Status    | Evidence                                                                                                     |
|-------------|-------------|--------------------------------------------------------------------------------------------------|-----------|--------------------------------------------------------------------------------------------------------------|
| SRCH-01     | 65-02       | Authenticated, read-scoped GET endpoint returns ranked message-grained hits                       | SATISFIED | requireScope(401)/requireAuth(403) gates confirmed in +server.ts; 18/18 route tests green including auth cases. |
| SRCH-02     | 65-01       | Hybrid mode fuses FTS + vector via RRF in one SQL query                                          | SATISFIED | FULL OUTER JOIN of vector_ranked/keyword_ranked in single db.execute(); Q1 RRF arithmetic test passes.       |
| SRCH-03     | 65-01, 65-02 | mode=keyword, mode=semantic, mode=hybrid (default) supported                                     | SATISFIED | Three distinct branches in searchMessages(); zod enum default 'hybrid'; threading tests pass.                |
| SRCH-04     | 65-01       | Results scoped to active project + user; test=true excluded                                      | SATISFIED | scopedConvArray() + keyword CTE tenant triple; SRCH-04 test excludes 5 categories.                          |
| SRCH-05     | 65-01       | Per-tenant filtering inside/before ANN scan; verified by EXPLAIN ANALYZE                          | SATISFIED | EXPLAIN ANALYZE test: "Index Scan using idx_message_chunks_embedding" + Filter:conversation_id + no Seq Scan; 2500-chunk corpus needed GUC SET. |
| SRCH-06     | 65-01       | Lexical hits get \<mark\> snippet; semantic-only get plain slice                                  | SATISFIED | ts_headline with StartSel=\<mark\>/StopSel=\</mark\> for lexical/both; plainSnippet() for semantic; SRCH-06 test passes. |
| SRCH-07     | 65-01       | Match type tagged per hit (lexical/semantic/both)                                                | SATISFIED | toHit() derives matchType from null presence of rank_v/rank_k; SRCH-07 test covers all three values.       |
| SRCH-08     | 65-02       | Embedder-down degrades hybrid/semantic to keyword; degraded:true in response                      | SATISFIED | Three SRCH-08 test cases (not-ready, generateEmbedding throws, keyword-never-degraded) all pass.            |

No orphaned requirements — all 8 SRCH-01 through SRCH-08 are claimed in plan frontmatter and verified. REQUIREMENTS.md marks all 8 as Complete for Phase 65.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | — | — | — |

The three `return []` occurrences in message-search.ts are intentional guard clauses (short-circuit for \<2-char query, null vectorLiteral when semantic mode has no embedding), not stub implementations.

---

### Human Verification Required

None — all success criteria are verifiable programmatically and tests confirm behavior.

---

### Load-Bearing Deviation Confirmed

The 65-01-SUMMARY.md documents that `searchMessages` sets `hnsw.iterative_scan='relaxed_order'` itself (best-effort, swallowed) and uses a single-table `conversation_id = ANY(ARRAY(...))` InitPlan for tenant scoping rather than the plan's prescribed JOIN-based approach. This deviation is:

- **Correct:** Required to drive `idx_message_chunks_embedding` on the shipped PGlite 0.3.16/pgvector 0.8.0 stack.
- **Tested:** The SRCH-05 EXPLAIN test (`message-search-explain.test.ts`) asserts the exact HNSW node with Filter:conversation_id.
- **Non-breaking:** Public contract (searchMessages signature, MessageSearchHit, RRF_K=60, all three modes) unchanged.
- **Verified live:** 14/14 backend tests pass including the EXPLAIN proof.

---

## Gaps Summary

No gaps. All must-haves are verified at all three levels (exists, substantive, wired). All 6 documented commit hashes resolve to real commits. Both test suites pass (14/14 backend, 18/18 route). Coverage thresholds pinned at 100% for both new files. No anti-patterns found. Phase goal is fully achieved.

---

_Verified: 2026-05-29T16:00:00Z_
_Verifier: Claude (gsd-verifier)_
