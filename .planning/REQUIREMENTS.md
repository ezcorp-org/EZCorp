# Requirements: EZCorp — v1.5 Hybrid Chat Search

**Defined:** 2026-05-25
**Core Value:** Anyone can sit down, chat with persistent memory, find agent apps others built, and create their own — the full loop from user to builder in one product, with full visibility and control over what every extension can do.
**Milestone Goal:** Make every past chat findable instantly — add semantic (pgvector/HNSW) recall alongside the existing lexical (Postgres FTS) precision, surfaced through the sidebar search box and a new Cmd+K palette.

## v1 Requirements

Requirements for the v1.5 milestone. Each maps to exactly one roadmap phase (63–68).

### Indexing & Schema

- [x] **IDX-01**: Chat messages (user + assistant roles only) are chunked into ≤256-word-piece segments and stored with 384-dim embeddings in a `message_chunks` table (HNSW index)
- [x] **IDX-02**: `message_chunks` rows are removed automatically when their parent message is deleted (`ON DELETE CASCADE` — no new delete-path code)
- [x] **IDX-03**: Each chunk records the embedding model identifier so a future model swap is detectable without ambiguity
- [x] **IDX-04**: Creating a message transactionally enqueues an embedding job — no message persists without its embed job, and no embed job exists without its message
- [x] **IDX-05**: System- and tool-role messages are excluded from embedding at the write boundary (recall is not poisoned by templated prompts or tool JSON)
- [x] **IDX-06**: The embedding pipeline truncates input to the model's 256-token limit, fixing the pre-existing silent-truncation defect that today degrades memories + knowledge-base chunks
- [x] **IDX-07**: Embedding-touching tests run reliably under parallel `bun test` (`embeddings.ts` registered in `mock-cleanup.ts MODULE_PATHS`)

### Ingestion Worker

- [x] **ING-01**: A background worker drains the embedding outbox without ever blocking the chat streaming/finalize path
- [x] **ING-02**: The worker pauses gracefully when the embedder is not ready (degraded mode) and resumes automatically when it becomes ready
- [x] **ING-03**: Failed embed jobs retry with backoff and stop after a capped number of attempts (poison pills do not loop forever)
- [x] **ING-04**: On boot, the worker recovers stale in-flight jobs (clears expired locks) so no message is permanently stuck unembedded
- [x] **ING-05**: A kill-switch environment variable disables the worker entirely for operators who don't want it

### Hybrid Search & API

- [x] **SRCH-01**: A single endpoint `GET /api/search/messages` returns ranked message-grained hits for a query (auth + read-scope gated)
- [x] **SRCH-02**: Hybrid mode fuses lexical (FTS) and semantic (vector) results via Reciprocal Rank Fusion in one SQL query
- [x] **SRCH-03**: The endpoint supports `mode=keyword` (FTS only) and `mode=semantic` (vector only) in addition to `mode=hybrid` (default)
- [x] **SRCH-04**: Results are scoped to the active project and the requesting user; `test=true` conversations are excluded
- [x] **SRCH-05**: Per-tenant filtering is applied inside the query (within/before the ANN scan), verified by `EXPLAIN ANALYZE` to avoid post-filter recall collapse
- [x] **SRCH-06**: Lexical hits return `<mark>`-highlighted snippets; semantic-only hits return plain ±window snippets (no misleading fake highlight)
- [x] **SRCH-07**: Each hit is tagged with its match type (lexical / semantic / both) for the UI to display
- [x] **SRCH-08**: When the embedder is unavailable, the endpoint degrades to keyword mode and signals the degraded state to the client

### Sidebar Search

- [x] **UI-01**: The conversation sidebar search offers a Hybrid / Keyword / Semantic mode toggle, defaulting to Hybrid
- [x] **UI-02**: The selected search mode persists across sessions (localStorage)
- [x] **UI-03**: Selecting a result navigates to the conversation and scrolls to the matching message with a brief highlight pulse
- [x] **UI-04**: Existing sidebar-search behavior (debounce, minimum query length, title matching, project + user scoping) is preserved

### Command Palette Search

- [x] **PAL-01**: Cmd+K (Ctrl+K) opens a global search palette from anywhere in the app, extending the existing `CommandPalette.svelte` (not a parallel component)
- [x] **PAL-02**: The previous command-palette action is rebound to Cmd+Shift+P via the shortcut registry without breaking users' custom shortcut overrides
- [ ] **PAL-03**: When a conversation is active, palette results are grouped into "In this conversation" and "Other conversations"
- [ ] **PAL-04**: Each palette result shows a match-type icon plus a snippet
- [ ] **PAL-05**: Selecting a palette result deep-links to the matching message (scroll into view + highlight)
- [ ] **PAL-06**: The palette is keyboard-navigable (arrows / Enter / Esc) and accessible (ARIA dialog, focus trap, focus restore on close)
- [ ] **PAL-07**: On mobile, the palette falls back to the existing `BottomSheet` pattern (shipped v1.4 UX-01)

### Backfill & Operations

- [ ] **OPS-01**: An operator-run script enqueues embedding jobs for all existing eligible messages; it is resumable and idempotent (`ON CONFLICT DO NOTHING`)
- [ ] **OPS-02**: Backfill throttles itself so live chat traffic is not starved during a large catch-up
- [ ] **OPS-03**: `ANALYZE` runs after backfill batches so the query planner has fresh statistics (no autovacuum under PGlite)
- [ ] **OPS-04**: Operators can observe embedding progress — outbox backlog depth and `message_chunks` coverage

## v2 Requirements

Deferred to v1.5.x / v1.6. Tracked, not in this roadmap.

### Search Polish

- **POLISH-01**: `MentionText` rendering inside snippets (needs HTML-safety review vs `ts_headline` `<mark>`)
- **POLISH-02**: Embedding-status toast during backfill
- **POLISH-03**: Cmd+Enter to split-open a result (gated on multi-conversation view existing)
- **POLISH-04**: Role badge per result row

### Ranking Tuning

- **RANK-01**: Project-boost and recency-decay coefficients on fused scores (requires corpus measurement)
- **RANK-02**: Binary-quantization storage option for `message_chunks` embeddings

## Out of Scope

Explicitly excluded. Documented to prevent scope creep. (From research anti-features AF-1..AF-12 + PROJECT.md scope lock.)

| Feature | Reason |
|---------|--------|
| Raw RRF score numbers in the UI | Anchors a false "percentage relevance" mental model; match-type icon communicates enough |
| Date / agent / model / project filters | PROJECT.md scope lock; revisit v1.6 once base ranking is validated |
| Saved searches / pinned queries | Zero value before base ranking is proven |
| Dedicated `/search` page | Sidebar + Cmd+K palette are the proven minimum surface set |
| In-conversation Ctrl+F bar | Native browser Ctrl+F works; intercepting it breaks a 30-year shortcut |
| Chat-as-RAG (past chats as context in new chat) | Crosses a trust boundary against the v1.3 PDP model; separate scope + review |
| Cross-encoder reranking | 50–200ms/query for marginal gain at chat-corpus scale; validate RRF first |
| Searching tool-call outputs | Separate schema + redaction concerns; tracked as a later follow-up |
| External vector DB / cloud embedding API | Violates self-hosted-first; `ctx.llm.embed()` SDK is already out of scope |
| New search libraries (cmdk-sv, fuse.js, bullmq, langchain splitters) | Every primitive already exists in-tree at production version |

## Traceability

Which phases cover which requirements. Populated during roadmap creation (Phases 63–68).

| Requirement | Phase | Status |
|-------------|-------|--------|
| IDX-01 | Phase 63 | Complete |
| IDX-02 | Phase 63 | Complete |
| IDX-03 | Phase 63 | Complete |
| IDX-04 | Phase 63 | Complete |
| IDX-05 | Phase 63 | Complete |
| IDX-06 | Phase 63 | Complete |
| IDX-07 | Phase 63 | Complete |
| ING-01 | Phase 64 | Complete |
| ING-02 | Phase 64 | Complete |
| ING-03 | Phase 64 | Complete |
| ING-04 | Phase 64 | Complete |
| ING-05 | Phase 64 | Complete |
| SRCH-01 | Phase 65 | Complete |
| SRCH-02 | Phase 65 | Complete |
| SRCH-03 | Phase 65 | Complete |
| SRCH-04 | Phase 65 | Complete |
| SRCH-05 | Phase 65 | Complete |
| SRCH-06 | Phase 65 | Complete |
| SRCH-07 | Phase 65 | Complete |
| SRCH-08 | Phase 65 | Complete |
| UI-01 | Phase 66 | Complete |
| UI-02 | Phase 66 | Complete |
| UI-03 | Phase 66 | Complete |
| UI-04 | Phase 66 | Complete |
| PAL-01 | Phase 67 | Complete |
| PAL-02 | Phase 67 | Complete |
| PAL-03 | Phase 67 | Pending |
| PAL-04 | Phase 67 | Pending |
| PAL-05 | Phase 67 | Pending |
| PAL-06 | Phase 67 | Pending |
| PAL-07 | Phase 67 | Pending |
| OPS-01 | Phase 68 | Pending |
| OPS-02 | Phase 68 | Pending |
| OPS-03 | Phase 68 | Pending |
| OPS-04 | Phase 68 | Pending |

**Coverage:**
- v1 requirements: 35 total
- Mapped to phases: 35 (Phases 63–68) ✓
- Unmapped: 0

---
*Requirements defined: 2026-05-25*
*Last updated: 2026-05-29 after v1.5 roadmap creation — all 35 requirements mapped to Phases 63–68 (100% coverage)*
