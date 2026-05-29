# Roadmap: EZCorp AI Platform

## Milestones

- ✅ **v1.0 MVP** — Phases 1-11 (shipped 2026-03-10)
- ✅ **v1.1 Polish & Extensions** — Phases 12-30 (shipped 2026-03-15)
- ✅ **v1.2 Textbox Shortcuts & Better Extensions** — Phases 31-48 (shipped 2026-05-06)
- ✅ **v1.3 Security & Permissions** — Phases 49-53 + parallel tracks (shipped 2026-05-09)
- ✅ **v1.4 Trust Hardening & v1.3 Closeout** — Phases 54-62 (shipped 2026-05-13)
- 🔨 **v1.5 Hybrid Chat Search** — Phases 63-68 (in progress, roadmap defined 2026-05-29)

## Phases

### v1.5 Hybrid Chat Search (Phases 63-68) — ACTIVE

**Milestone Goal:** Make every past chat findable instantly — add semantic (pgvector/HNSW) recall alongside the existing lexical (Postgres FTS) precision, surfaced through the sidebar search box and a new Cmd+K palette. Additive only; build order is unanimous across all four research streams: schema → embed-on-write worker → hybrid SQL + API → (sidebar ∥ palette ∥ backfill).

- [ ] **Phase 63: Indexing Primitives** — schema (`message_chunks` HNSW + `message_embed_outbox`), chunker, transactional outbox enqueue, embedder truncation fix, test-harness widening (IDX-01..07)
- [ ] **Phase 64: Embed-on-Write Worker** — background outbox drainer on the HostMaintenanceDaemon pattern with degraded-mode gate, retry/backoff, boot recovery, kill-switch (ING-01..05)
- [ ] **Phase 65: Hybrid Search SQL + API** — single-CTE RRF query builder + `/api/search/messages` endpoint with hybrid/keyword/semantic modes, in-CTE tenant scoping, snippet asymmetry, match-type tagging, degraded fallback (SRCH-01..08)
- [ ] **Phase 66: Sidebar Search** — Hybrid/Keyword/Semantic mode toggle on `ConversationList.svelte` with localStorage persistence + deep-link to matching message (UI-01..04)
- [ ] **Phase 67: Command Palette Search** — Cmd+K global search palette extending `CommandPalette.svelte`, Cmd+Shift+P rebind, grouped sections, match-type icons, deep-link, a11y, mobile BottomSheet fallback (PAL-01..07)
- [ ] **Phase 68: Backfill + Operations** — resumable idempotent backfill script with throttle, post-batch ANALYZE, and embedding-progress observability (OPS-01..04)

<details>
<summary>✅ v1.0 MVP (Phases 1-11) — SHIPPED 2026-03-10</summary>

- [x] Phase 1: Chat Foundation (2/2 plans) — completed 2026-03-08
- [x] Phase 2: Chat Completion (4/4 plans) — completed 2026-03-08
- [x] Phase 3: Memory Core (3/3 plans) — completed 2026-03-08
- [x] Phase 4: Memory Management & Knowledge Base (4/4 plans) — completed 2026-03-09
- [x] Phase 5: Model Routing (3/3 plans) — completed 2026-03-09
- [x] Phase 6: Agent Personas (4/4 plans) — completed 2026-03-10
- [x] Phase 7: Agent Tooling & Extensions (6/6 plans) — completed 2026-03-10
- [x] Phase 8: Team Sharing (6/6 plans) — completed 2026-03-10
- [x] Phase 9: Marketplace (3/3 plans) — completed 2026-03-10
- [x] Phase 10: Agent Personas Gap Closure (3/3 plans) — completed 2026-03-10
- [x] Phase 11: Retroactive Verification & Tech Debt (4/4 plans) — completed 2026-03-10

Full details: `.planning/milestones/v1.0-ROADMAP.md`

</details>

<details>
<summary>✅ v1.1 Polish & Extensions (Phases 12-30) — SHIPPED 2026-03-15</summary>

- [x] Phase 12: Extension Manifest v2 (3/3 plans) — completed 2026-03-10
- [x] Phase 13: Git Installation & Versioning (2/2 plans) — completed 2026-03-11
- [x] Phase 14: Extension Dependencies & Composition (2/2 plans) — completed 2026-03-11
- [x] Phase 15: Extension Security Hardening (3/3 plans) — completed 2026-03-11
- [x] Phase 16: OAuth Subscription Access (3/3 plans) — completed 2026-03-12
- [x] Phase 17: Pi-Mono Migration (7/7 plans) — completed 2026-03-13
- [x] Phase 18: Provider Connection UI (2/2 plans) — completed 2026-03-13
- [x] Phase 19: Chat UX Polish (3/3 plans) — completed 2026-03-13
- [x] Phase 20: Platform UX Polish (5/5 plans) — completed 2026-03-13
- [x] Phase 21: Extension SDK & CLI (4/4 plans) — completed 2026-03-13
- [x] Phase 22: Extension Documentation (3/3 plans) — completed 2026-03-14
- [x] Phase 23: Rename to EZCorp (3/3 plans) — completed 2026-03-14
- [x] Phase 24: Showcase Example Extensions (2/2 plans) — completed 2026-03-14
- [x] Phase 25: API Security Hardening (4/4 plans) — completed 2026-03-15
- [x] Phase 26: Marketplace Moderation & Agent Sharing (3/3 plans) — completed 2026-03-15
- [x] Phase 27: Reliability & Error Resilience (2/2 plans) — completed 2026-03-15
- [x] Phase 28: TS Manifest Migration (2/2 plans) — completed 2026-03-15
- [x] Phase 29: Gap Closure (1/1 plan) — completed 2026-03-15
- [x] Phase 30: Integration Hardening (1/1 plan) — completed 2026-03-15

Full details: `.planning/milestones/v1.1-ROADMAP.md`

</details>

<details>
<summary>✅ v1.2 Textbox Shortcuts & Better Extensions (Phases 31-48) — SHIPPED 2026-05-06</summary>

- [x] Phase 31: @-Mention System — completed 2026-03-16
- [x] Phase 32: Inline Extension Invocation — completed 2026-03-16
- [x] Phase 33: Sub-Conversations & Composition — completed 2026-03-17
- [x] Phase 34: Chat UX Polish — completed 2026-03-17
- [→] Phase 35: Navigation & Agent Management — **deferred to v1.3** (renumbered as Phase 49)
- [x] Phase 36: Shared extension UI components — completed 2026-03-18
- [x] Phase 37: Tool & agent invocation hydration in chat harness — completed 2026-03-19
- [x] Phase 38: Code & file diff rendering in chat — completed 2026-03-19
- [x] Phase 39: Diff summary slide-out panel — completed 2026-03-20
- [x] Phase 40: Modular built-in tool system + permission gates — completed 2026-03-21
- [x] Phase 41: Launch blockers — password reset, error pages, onboarding — completed 2026-03-22
- [x] Phase 42: User self-service — help, logging, branding, loading states — completed 2026-03-23
- [x] Phase 43: Support readiness — analytics, API docs, session management — completed 2026-03-24
- [x] Phase 44: Scale readiness — mobile UX, perf, external Postgres, a11y — completed 2026-03-25
- [x] Phase 45: Sub-conversation integration wiring (gap closure) — completed 2026-03-26
- [x] Phase 46: Accessibility gap closure — completed 2026-03-27
- [x] Phase 47: Navigation & extension attachment (gap closure stub) — completed 2026-03-27
- [x] Phase 48: Ez Button — In-App Concierge Agent — completed 2026-05-06 (re-verified post-ezContext-removal)

Full details: `.planning/milestones/v1.2-ROADMAP.md` (post-archival).

</details>

<details>
<summary>✅ v1.3 Security & Permissions (Phases 49-53 + parallel tracks) — SHIPPED 2026-05-09</summary>

**Delivered:** Security backbone for the extension ecosystem — unified permission engine (PDP), capability expiry sweeps, MCP isolation via netns + bearer-token proxy, audit visibility surface, Phase 49 navigation/agent UX carryover from v1.2, and bundled extension ports proving the SDK is dogfood-complete.

- [x] **Phase 49: Navigation & Agent Management** (formerly Phase 35) — completed 2026-05-08
- [x] **Phase 50: Audit & Visibility** — completed ~2026-05-07
- [x] **Phase 51: SDK Capabilities + Cron Daemon** — completed ~2026-05-07
- [x] **Phase 52: Library Audit UI** — completed ~2026-05-07
- [x] **Phase 53: Bundled Extension Ports** (+ 53.6 subprocess boot-spawn fix + Stage 2 legacy deletion) — completed 2026-05-09
- [x] **Unified Permission System (Phases 1-7, parallel track)** — completed 2026-05-08 via merge `e5511ea`
- [x] **Capability Expiry Milestone (A-D, parallel track)** — completed 2026-05-08
- [x] **Post-perm Cleanup** — completed 2026-05-08
- [x] **Lessons Keeper v1 + v1.5** — completed 2026-05-06/07
- [x] **Multi-select chat turns** — already shipped 2026-04-30 (commit `335a200`), formally closed in v1.3
- [x] **v1.3 Closeout PR** — completed 2026-05-09 (PGlite `:memory:`, Vite preview Bun runner, reapprove auth doc, hydration mock, c2 mock pollution, JWT `jti`, triage closeout)

Full details: `.planning/milestones/v1.3-ROADMAP.md` and `.planning/milestones/v1.3-MILESTONE-AUDIT.md`.

</details>

<details>
<summary>✅ v1.4 Trust Hardening & v1.3 Closeout (Phases 54-62) — SHIPPED 2026-05-13</summary>

**Milestone Goal:** Close v1.3 release-readiness debt + harden the trust boundary for non-trusted users. Six v1.3 security-review findings closed (5 LOW CCs + Claim-1), MCP Phase-8 isolation hardened (DNS rebind, tmpfs, seccomp, netns veth-pair), per-capability TTL UI, Phase 49 deferred mobile UX, test-debt repair, and audit-claim for already-landed commits.

- [x] Phase 54: Security Backbone Hardening (CC1–CC5 + Claim-1) (3/3 plans) — completed 2026-05-11
- [x] Phase 55: MCP Stage 1 — DNS Rebind + tmpfs + seccomp Log Mode (3/3 plans) — completed 2026-05-11
- [x] Phase 56: Per-Capability TTL UI (4/4 plans) — completed 2026-05-11
- [x] Phase 57: Phase 49 Mobile UX Deferred Items (7/7 plans) — completed 2026-05-12
- [x] Phase 58: MCP Stage 2 — Seccomp Enforce + Netns Veth-Pair (3/3 plans) — completed 2026-05-12
- [x] Phase 59: Test Debt Repair (8/8 plans) — completed 2026-05-13
- [x] Phase 60: Audit-Claim & Docs Polish (4/4 plans) — completed 2026-05-13
- [x] Phase 61: Test Debt Follow-up — Feature-Rework Specs (5/4 plans) — completed 2026-05-13
- [x] Phase 62: Test Debt Continuation — Agent-Personas Specs + Coverage (9/9 plans) — completed 2026-05-13

Full details: `.planning/milestones/v1.4-ROADMAP.md` and `.planning/milestones/v1.4-MILESTONE-AUDIT.md`.

</details>

## Phase Details

### Phase 63: Indexing Primitives
**Goal**: The durable indexing foundation exists — chat messages get chunked and enqueued for embedding transactionally at the write boundary, on the correct (HNSW) index type, with the pre-existing embedder truncation defect fixed and the test harness hardened so no downstream search test can flake.
**Depends on**: Nothing (foundation — universal prerequisite for all v1.5 work)
**Requirements**: IDX-01, IDX-02, IDX-03, IDX-04, IDX-05, IDX-06, IDX-07
**Success Criteria** (what must be TRUE):
  1. Creating a user or assistant message writes exactly one `message_embed_outbox` row in the same transaction as the message insert — kill the process between the two and no message ever exists without its embed job (and no embed job without its message).
  2. Creating a system- or tool-role message writes NO outbox row — templated prompts and tool JSON are excluded from the index at the write boundary.
  3. Deleting a message (or its parent conversation) removes all of that message's `message_chunks` rows automatically via `ON DELETE CASCADE`, with no new code in any delete path.
  4. The `message_chunks` table carries a `vector(384)` embedding on an HNSW index (verified `indexdef ILIKE '%hnsw%'`, NOT ivfflat) plus an `embedding_model_id` column recording which model produced each chunk.
  5. Feeding the embedder a 10,000-character string produces a result truncated to the model's 256-token limit (explicit `max_length: 256` + `truncation: true`), and the full embedding-touching test suite runs green under parallel `bun test` (`embeddings.ts` registered in `mock-cleanup.ts MODULE_PATHS`).
**Plans**: 3 plans (2 waves)
  - [ ] 63-01-PLAN.md — Embedder primitives: EMBEDDING_MODEL_ID + 256-token truncation fix + getTokenizer + pure token-aware chunker + isEmbedEligible; IDX-07 regression pin (IDX-01/05/06/07, wave 1)
  - [ ] 63-02-PLAN.md — Schema + migration: message_chunks (vector(384) HNSW, embedding_model_id, ON DELETE CASCADE) + message_embed_outbox; schema/HNSW/CASCADE tests (IDX-02/03, wave 1)
  - [ ] 63-03-PLAN.md — Transactional write boundary: db.transaction in createMessage + in-tx outbox enqueue + edit re-enqueue (IDX-04/05, wave 2)

### Phase 64: Embed-on-Write Worker
**Goal**: A background worker turns enqueued outbox jobs into searchable `message_chunks` without ever touching the chat streaming/finalize hot path, surviving crashes, embedder unavailability, and poison pills.
**Depends on**: Phase 63 (worker drains the outbox and writes the chunks defined there)
**Requirements**: ING-01, ING-02, ING-03, ING-04, ING-05
**Success Criteria** (what must be TRUE):
  1. Sending 100 chat messages drains the outbox into populated `message_chunks` rows on the worker's own schedule, while streaming finalize latency stays unchanged (embedding never blocks the SSE turn-end).
  2. When the embedder is not ready (degraded mode), the worker pauses without consuming jobs and resumes automatically once `isEmbeddingReady()` returns true — no jobs are lost or errored during the pause.
  3. A job that repeatedly fails retries with backoff and stops after a capped number of attempts, leaving the failed row inspectable rather than looping forever.
  4. After a crash mid-embed, the next boot clears stale in-flight locks (`runBacklogRecovery`) so every previously-claimed-but-unfinished message gets re-drained — no message is permanently stuck.
  5. Setting the kill-switch environment variable disables the worker entirely; chat continues to function and the outbox simply accumulates until the worker is re-enabled.
**Plans**: TBD

### Phase 65: Hybrid Search SQL + API
**Goal**: A single authenticated endpoint returns ranked, tenant-scoped, message-grained search hits that fuse lexical and semantic signal in one SQL round-trip, with honest snippets and a graceful keyword-only fallback when the embedder is down.
**Depends on**: Phase 64 (the semantic leg returns nothing until `message_chunks` is populated by the worker)
**Requirements**: SRCH-01, SRCH-02, SRCH-03, SRCH-04, SRCH-05, SRCH-06, SRCH-07, SRCH-08
**Success Criteria** (what must be TRUE):
  1. `GET /api/search/messages?q=…` returns ranked message hits for an authenticated, read-scoped caller; an unauthenticated or out-of-scope request is rejected.
  2. Default (hybrid) mode fuses FTS and vector results via Reciprocal Rank Fusion in one CTE-based query; `mode=keyword` and `mode=semantic` return the single-leg variants.
  3. Every hit belongs to the requesting user's active project, with `test=true` conversations excluded, and `EXPLAIN ANALYZE` shows the tenant filter applied inside/before the ANN scan (no post-filter recall collapse).
  4. A lexical hit returns a `<mark>`-highlighted snippet; a semantic-only hit returns a plain ±window snippet (no misleading fake highlight), and each hit is tagged with its match type (lexical / semantic / both).
  5. With the embedder unavailable, the endpoint returns keyword-mode results and signals the degraded state to the client instead of erroring.
**Plans**: TBD
**Research flag**: `/gsd:research-phase` recommended — (a) RRF `k`-value at chat-corpus scale (canonical 60 vs likely ~20; needs NDCG@10 measurement against a curated corpus); (b) `hnsw.iterative_scan` availability across PGlite + external-Postgres pgvector versions (feature-detect with two-stage fallback). New API surface ships with 100% unit + integration coverage, CI-gated per-file.

### Phase 66: Sidebar Search
**Goal**: Users can search the conversation sidebar in Hybrid, Keyword, or Semantic mode, with the chosen mode remembered across sessions, and jump straight to the matching message — all without losing any existing sidebar-search behavior.
**Depends on**: Phase 65 (consumes the `/api/search/messages` contract). Parallelizable with Phase 67.
**Requirements**: UI-01, UI-02, UI-03, UI-04
**Success Criteria** (what must be TRUE):
  1. The sidebar search offers a Hybrid / Keyword / Semantic toggle defaulting to Hybrid, and the selected mode persists across sessions via localStorage.
  2. Selecting a result navigates to the conversation and scrolls to the matching message with a brief highlight pulse.
  3. Existing sidebar-search behavior — debounce, minimum query length, title matching, project + user scoping — continues to work unchanged.
  4. Lexical results keep their `<mark>` highlight rendering; semantic-only results render their plain ±window snippet in the same component without a fake highlight.
**Plans**: TBD
**Note**: User-visible surface — ships with 100% unit + integration + e2e (Playwright) coverage, CI-gated per-file on new paths.

### Phase 67: Command Palette Search
**Goal**: Cmd+K opens a global search palette from anywhere in the app — built by extending the existing command palette, not a parallel component — that deep-links to any matching message, is fully keyboard-accessible, and falls back gracefully on mobile.
**Depends on**: Phase 65 (consumes the `/api/search/messages` contract). Parallelizable with Phase 66.
**Requirements**: PAL-01, PAL-02, PAL-03, PAL-04, PAL-05, PAL-06, PAL-07
**Success Criteria** (what must be TRUE):
  1. Cmd+K (Ctrl+K) opens a global search palette from anywhere in the app via the existing `CommandPalette.svelte`, and the previous command-palette action is rebound to Cmd+Shift+P through the shortcut registry without breaking users' custom overrides.
  2. With a conversation active, results are grouped into "In this conversation" and "Other conversations"; each result row shows a match-type icon plus a snippet.
  3. Selecting a result deep-links to the matching message (scroll into view + highlight pulse).
  4. The palette is fully keyboard-navigable (arrows / Enter / Esc) and accessible (ARIA dialog, focus trap, focus restore on close).
  5. On mobile, the palette falls back to the existing `BottomSheet` pattern shipped in v1.4.
**Plans**: TBD
**Research flag**: `/gsd:research-phase` recommended — confirm the `CommandPalette.svelte` extension point (existing sub-view vs new sibling), the mobile `BottomSheet` adapter fit, and that the Cmd+K ↔ Cmd+Shift+P swap doesn't collide with extension-registered shortcuts. User-visible surface — ships with 100% unit + integration + e2e (Playwright) coverage, CI-gated per-file on new paths.

### Phase 68: Backfill + Operations
**Goal**: An operator can index an existing install's entire eligible message history with one resumable, idempotent script that yields to live traffic, keeps the query planner's statistics fresh, and exposes embedding progress.
**Depends on**: Phase 64 (the running worker is what actually drains the backfill-enqueued jobs). Decoupled from Phases 66 and 67.
**Requirements**: OPS-01, OPS-02, OPS-03, OPS-04
**Success Criteria** (what must be TRUE):
  1. Running the backfill script enqueues embedding jobs for all existing eligible (user/assistant) messages; re-running it is safe and adds no duplicates (`ON CONFLICT DO NOTHING`), and killing it mid-run then re-running resumes cleanly.
  2. During a large backfill, the script throttles itself so live chat traffic is not starved — interactive chat latency stays unaffected.
  3. `ANALYZE` runs after backfill batches so the planner has fresh statistics (PGlite has no autovacuum), and the HNSW index is actually used post-backfill.
  4. An operator can observe embedding progress — outbox backlog depth and `message_chunks` coverage.
**Plans**: TBD
**Note**: Operator-facing surface — ships with unit + integration coverage on the script and progress-visibility paths.

## Progress

**Execution Order:**
Phases execute in numeric order with the unanimous research build order: 63 (foundation) → 64 (worker) → 65 (search SQL + API) → then 66, 67, 68 in parallel. Hard dependencies: 64→63 (worker drains the outbox), 65→64 (semantic leg empty until chunks exist), 66→65 and 67→65 (both consume the same endpoint contract), 68→64 (worker drains the backfill enqueue). Phases 66, 67, 68 are mutually independent once 65 lands. **Critical correction carried into every vector-touching phase: the index type is HNSW, NOT ivfflat (verified `src/db/migrate.ts:173,209`).** Phases 65 and 67 are flagged for `/gsd:research-phase` during planning.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 63. Indexing Primitives | 0/TBD | Not started | - |
| 64. Embed-on-Write Worker | 0/TBD | Not started | - |
| 65. Hybrid Search SQL + API | 0/TBD | Not started | - |
| 66. Sidebar Search | 0/TBD | Not started | - |
| 67. Command Palette Search | 0/TBD | Not started | - |
| 68. Backfill + Operations | 0/TBD | Not started | - |

---

*Last updated: 2026-05-29 — v1.5 Hybrid Chat Search roadmap created. Phases 63-68 defined; 35/35 v1.5 requirements mapped (100% coverage). Next: `/gsd:plan-phase 63`.*
