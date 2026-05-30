# Phase 68: Backfill + Operations - Context

**Gathered:** 2026-05-30
**Status:** Ready for planning

<domain>
## Phase Boundary

An operator can index an existing install's **entire** eligible message history with **one resumable, idempotent script** that:
- enqueues embedding jobs for all existing eligible (user/assistant) messages (OPS-01),
- yields to live chat traffic during a large catch-up (OPS-02),
- keeps the query planner's statistics fresh via `ANALYZE` since PGlite has no autovacuum (OPS-03),
- and exposes embedding progress — outbox backlog depth + `message_chunks` coverage (OPS-04).

**Fixed model (from Phase 64 dependency):** the script **enqueues** outbox rows; the existing `EmbedWorker` (Phase 64) is what actually drains them into `message_chunks`. This phase does NOT build a second embedding engine.

**Out of scope (scope locks carried in):** embedding-status **toast** (deferred POLISH-02, v2); a dedicated `/search` page; ranking changes (RANK-01/02); new queue/splitter libraries (bullmq, langchain — explicitly excluded). Coverage bar for this operator-facing surface is **unit + integration** (NOT e2e — unlike UI phases 66/67).

</domain>

<decisions>
## Implementation Decisions

### Enqueue / drain model (OPS-02)
- **Enqueue paced, worker drains.** The backfill inserts outbox rows in paced chunks (sleep between batches) so it never floods the DB; the existing `EmbedWorker` drains them at its own throttled rate. Reuses all of Phase 64's pacing / retry / degraded-mode / boot-recovery logic — no duplicate embedding loop in the script.
- **Pacing is configurable** with sane traffic-yielding defaults: `--batch-size` / `--sleep-ms` flags **plus** matching `EZCORP_BACKFILL_*` env vars, mirroring how `EmbedWorker` reads `EZCORP_EMBED_*`. *(Assumption — the pacing-knobs answer was garbled in transit; locked to the recommended option. Flag if you disagree.)*

### Eligibility & idempotency (OPS-01)
- **Default run = gaps only.** Enqueue eligible (user/assistant role) messages that have **no** `message_chunks` **and** **no** existing outbox row. Idempotent via `ON CONFLICT DO NOTHING` — never disturbs already-embedded or already-queued messages. Re-running is safe; kill mid-run + re-run resumes cleanly.
- **`--refresh-stale` (opt-in)** additionally re-enqueues messages whose chunks carry an `embedding_model_id` ≠ the current `EMBEDDING_MODEL_ID` (handles a future model swap). This path resets those rows to `pending` (the worker already deletes stale chunks before re-inserting). NOT default — keeps routine catch-up fast and predictable.
- **Skip `test=true` conversations.** They're excluded from search (SRCH-04) and never queried, so embedding them wastes CPU + index space. Reuse the exact null-safe idiom search uses: `(c.test IS NULL OR c.test = false)` (`message-search.ts:139/194/451`), against `conversations.test boolean default false` (`schema.ts:56`).
- **Scope = whole install by default** (all projects, all users) — it's an admin migration tool. Optional `--project <id>` narrows it for targeted re-runs.

### ANALYZE / planner stats (OPS-03)
- **The worker runs `ANALYZE message_chunks` after draining**, not the script. Under the async enqueue-paced model the script exits before most chunks are written, so the script-end ANALYZE would be premature. The `EmbedWorker` runs ANALYZE after a drain pass that cleared a meaningful backlog (e.g. backlog reached 0, or every N processed) — stats refresh exactly when chunks actually land.

### Worker-down handling
- **Warn loudly, still enqueue.** Detect the kill-switch (`EZCORP_DISABLE_EMBED_WORKER=1`) and/or no live worker; print a clear warning that jobs won't drain until the worker runs, then enqueue anyway (resumable — they drain whenever it starts). Supports the legitimate "enqueue now, enable worker later" workflow.

### Invocation & ergonomics
- **Apply by default.** A bare `bun run scripts/backfill-embeddings.ts` performs the backfill; `--dry-run` plans only (counts what *would* be enqueued, writes nothing). Matches `scripts/sweep-perm-expiry.ts`. Safe because the run is resumable + idempotent.
- Mirror the `sweep-perm-expiry.ts` CLI contract: `#!/usr/bin/env bun`, `--dry-run` / `--verbose` / `--help`, JSON summary on stdout, exit codes `0` (ran) / `1` (per-item error) / `2` (invocation error); honor `DATABASE_URL`→PGlite fallback via `src/db/connection`.
- Add a **package.json alias** (e.g. `backfill:embeddings`) alongside the existing `verify:*` aliases.

### Progress visibility (OPS-04)
- **Live stdout during the run** — periodic "enqueued N / M eligible, backlog X" lines + final JSON summary.
- **`--status` mode** — run the script with `--status` to print current backlog depth + `message_chunks` coverage **without enqueuing anything**, so an operator can poll progress while the worker drains.
- **Reusable `getEmbedProgress()` query helper** in `src/db/queries` returning `{ backlog, coverage }` — single source of truth shared by the CLI, `--status`, and the admin surface (DRY).
- **Read-only admin progress surface:** an admin-scoped `GET` endpoint (e.g. `/api/admin/embed-progress`) returning `{ backlog, coverage }` from `getEmbedProgress()`, surfaced as a small **read-only status card** on an existing admin/settings page. No live streaming, no toast (that's the deferred POLISH-02 scope).

### Claude's Discretion
- Exact stdout formatting / progress cadence; dry-run summary shape.
- Exact ANALYZE trigger threshold inside the worker (backlog==0 vs every-N).
- Backoff/jitter on the inter-batch sleep; default `--batch-size` / `--sleep-ms` values.
- Exact admin endpoint path + which settings/admin page hosts the status card.
- Whether `getEmbedProgress()` computes coverage as a single SQL aggregate vs two counts.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/extensions/embed-worker.ts` — `EmbedWorker` (the drainer this phase feeds). Batch 5 / 3s poll, env-tunable (`EZCORP_EMBED_BATCH_SIZE`, `EZCORP_EMBED_POLL_INTERVAL_MS`, `EZCORP_EMBED_MAX_ATTEMPTS`), kill-switch `EZCORP_DISABLE_EMBED_WORKER=1`, `runBacklogRecovery`, sequential drain that writes `message_chunks`. **The ANALYZE-after-drain logic (OPS-03) hooks here.**
- `src/db/queries/message-embed-outbox.ts` — `enqueueEmbedJob(tx, messageId, conversationId)` is `ON CONFLICT DO **UPDATE**` (resets row to pending). **Backfill needs a sibling enqueue that is `ON CONFLICT DO NOTHING`** for gaps-only; `--refresh-stale` can reuse the DO-UPDATE semantics for stale rows only. Also `claimBatch` / `markDone` / `markFailed` / `resetAttemptsForPending`. `message_id` is the PK (one row per message).
- `src/db/queries/message-search.ts` — already encodes the eligibility + tenant + `test=true`-exclusion predicates the backfill must mirror; reuse its filtering shape rather than re-deriving (DRY).
- `src/memory/message-chunker.ts` — `isEmbedEligible(role, content)`, `chunkByTokens`. `src/memory/embeddings.ts` — `EMBEDDING_MODEL_ID` (stale-model comparison key), `isEmbeddingReady`.
- `scripts/sweep-perm-expiry.ts` — the operator-CLI template: shebang, `initDb`/`getDb` from `src/db/connection`, `DATABASE_URL`→PGlite fallback, flag parsing, JSON stdout summary, exit-code contract, `--dry-run`/`--verbose`/`--help`.
- `src/startup/background-timers.ts` — where `EmbedWorker` is constructed + wired into boot/shutdown; the place to confirm worker liveness for the worker-down warning, and where any new ANALYZE cadence config is read.

### Established Patterns
- **Outbox/transactional-enqueue** (Phase 63/64): enqueue modules must accept a tx/db handle and never call `getDb()` themselves; backfill enqueue should follow the same structural-typing discipline.
- **Daemon kill-switch + env-tunable knobs**: `EZCORP_*` env vars with defensive parsing + floors (see `getEmbedPollIntervalMs`). Backfill `EZCORP_BACKFILL_*` knobs should match this style.
- **package.json script aliases**: existing `verify:*` entries are the precedent for a `backfill:embeddings` alias.

### Integration Points
- New script: `scripts/backfill-embeddings.ts` (run via `bun run` + package.json alias).
- New query helper: `getEmbedProgress()` in `src/db/queries/` (likely alongside `message-embed-outbox.ts`).
- ANALYZE wiring inside `EmbedWorker` (`src/extensions/embed-worker.ts`).
- New admin-scoped read endpoint under `web/src/routes/api/admin/` (siblings to copy auth/shape from: `sessions/`, `system/`, `errors/`, `analytics/` `+server.ts`) — e.g. `web/src/routes/api/admin/embed-progress/+server.ts`. Surface the status card on the existing **admin dashboard** (`web/src/routes/(app)/admin/dashboard/+page.svelte`), which already hosts admin-only widgets.

</code_context>

<specifics>
## Specific Ideas

- "It should feel like the existing operator scripts" — `sweep-perm-expiry.ts` is the explicit reference for CLI shape, output, and exit codes.
- The headline use case is "one script indexes an existing install's entire history" — a bare run should Just Work across all projects/users.
- `--status` exists so an operator can watch the worker chew through the backlog after enqueuing, without re-triggering enqueue.

</specifics>

<deferred>
## Deferred Ideas

- **Embedding-status toast / live progress UI** — already tracked as POLISH-02 (v2). This phase ships only a read-only status card + JSON endpoint, not streaming/toast.
- **Stale-model bulk re-embed as a routine/automatic operation** — only the manual `--refresh-stale` flag is in scope; automated model-swap migration is a future concern (relates to RANK-02 / model-swap detection via `embedding_model_id`).

</deferred>

---

*Phase: 68-backfill-operations*
*Context gathered: 2026-05-30*
