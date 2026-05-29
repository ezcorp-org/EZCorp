---
phase: 63-indexing-primitives
plan: 02
subsystem: db-schema
tags: [schema, migration, pgvector, hnsw, outbox, hybrid-search]
requires: []
provides:
  - "message_chunks table (vector(384) + embedding_model_id, HNSW index, dual-FK CASCADE)"
  - "message_embed_outbox table (message_id PK, status/attempts/timestamps)"
  - "messageChunks / messageEmbedOutbox pgTable defs + inferred types in schema.ts"
affects:
  - "Phase 63 Plan 03 (transactional write boundary: ON CONFLICT (message_id) upsert target)"
  - "Phase 64 Embed-on-Write Worker (drains message_embed_outbox, writes message_chunks)"
  - "Phase 65 Hybrid Search SQL (ANN over message_chunks.embedding, per-conversation scoping via denormalized conversation_id)"
tech-stack:
  added: []
  patterns:
    - "vector(384) literal DDL in migrate.ts (Drizzle can't bind vector)"
    - "HNSW (vector_cosine_ops) — NOT ivfflat (locked carry-forward)"
    - "denormalized conversation_id + dual ON DELETE CASCADE (message + conversation), mirroring message_attachments"
    - "outbox keyed on message_id PK = one-row-per-message + ON CONFLICT target"
key-files:
  created:
    - src/__tests__/message-chunks-schema.test.ts
  modified:
    - src/db/schema.ts
    - src/db/migrate.ts
decisions:
  - "conversation_id DENORMALIZED onto message_chunks (research Open Q#2) — Phase 65 needs per-conversation ANN scoping without a join"
  - "message_embed_outbox kept LEAN (research Open Q#1) — message_id PK + status/attempts/timestamps; NO content-hash/model_id (worker reads current text at drain time)"
  - "message_id is the outbox PRIMARY KEY — one-row-per-message guarantee AND the ON CONFLICT (message_id) upsert target Plan 03 uses"
metrics:
  duration: ~15m
  tasks: 2
  files: 3
  completed: 2026-05-29
---

# Phase 63 Plan 02: Message Chunks + Embed Outbox Schema Summary

Durable storage shape for hybrid chat search: a `message_chunks` table (vector(384) on an HNSW index, `embedding_model_id`, dual ON DELETE CASCADE from both messages and conversations) plus a lean `message_embed_outbox` table (one row per message, `message_id` PK). Schema + idempotent migration + behavioral schema/CASCADE/HNSW tests — no write-path wiring (that is Plan 03).

## What Was Built

**Task 1 — schema.ts + migrate.ts (commit `32da2370`)**
- `messageChunks` pgTable mirroring `knowledge_base_chunks` with the FK retargeted onto `messages`, plus a denormalized `conversation_id` (both `ON DELETE CASCADE`), `embedding_model_id` (text NOT NULL), and two btree indexes.
- `messageEmbedOutbox` pgTable: `message_id` PK referencing `messages` (CASCADE), denormalized `conversation_id` (CASCADE), `status` (`pending|in_progress|failed`, default `pending`), `attempts` (default 0), `created_at`/`updated_at`.
- Inferred types `MessageChunk` / `NewMessageChunk` / `MessageEmbedOutbox`.
- Idempotent DDL in `migrate.ts` placed after the kb_chunks block: `CREATE TABLE IF NOT EXISTS` for both tables, three `CREATE INDEX IF NOT EXISTS` (including `USING hnsw (embedding vector_cosine_ops)`), `vector(384)` as a literal. Each statement is its own `db.execute()` call (PGlite executes one statement per call).
- Verified by `db-migrate-idempotent.test.ts` (3 pass) — idempotency preserved across the new DDL.

**Task 2 — message-chunks-schema.test.ts (commit `3c1e9926`)**
- 7 cases / 19 expect() on PGlite via `setupTestDb()`:
  1. HNSW index present (`vector_cosine_ops`), NO `ivfflat` in any indexdef.
  2. `embedding_model_id` is text NOT NULL (INFORMATION_SCHEMA).
  3. `embedding` is a `vector` udt + a 384-element literal round-trips.
  4. ON DELETE CASCADE via message-delete (behavioral probe).
  5. ON DELETE CASCADE via conversation-delete (chained through messages).
  6. `message_embed_outbox` PK is exactly `[message_id]` + duplicate-insert collides + defaults (`pending`/0).
  7. outbox row cascaded away with its message.

## Verification

- `bun test src/__tests__/message-chunks-schema.test.ts` → 7 pass / 0 fail / 19 expect (1.3s).
- `bun test src/__tests__/db-migrate-idempotent.test.ts` → 3 pass / 0 fail (idempotency preserved).
- Both together → 10 pass / 0 fail.
- `bunx tsc --noEmit -p tsconfig.json` → zero errors in `schema.ts`, `migrate.ts`, and the new test (full-tsconfig check per the test-files-excluded-from-typecheck.sh lesson).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Avoided a forbidden cross-plan import for the model-id stamp**
- **Found during:** Task 2.
- **Issue:** The plan's test instructions said to stamp `embedding_model_id` with an imported `EMBEDDING_MODEL_ID`. No such exported constant exists; the model id lives only as the string literal `"Xenova/all-MiniLM-L6-v2"` inside `src/memory/embeddings.ts`. That file is the concurrent Plan 01 agent's territory and is on this plan's DO-NOT-TOUCH list, so introducing/exporting the constant there was not permitted.
- **Fix:** Used a local `MODEL_ID = "Xenova/all-MiniLM-L6-v2"` constant in the test. The column only needs a NOT NULL text value; any literal satisfies the assertion. Keeps the test self-contained and within plan scope. Documented inline in the test header.
- **Files modified:** `src/__tests__/message-chunks-schema.test.ts` (created).
- **Commit:** `3c1e9926`.

No other deviations — schema + migration landed exactly as specified.

## Notes for Downstream Plans

- Plan 03's transactional write boundary uses `ON CONFLICT (message_id) DO UPDATE` against `message_embed_outbox` — the `message_id` PK is the conflict target.
- Phase 64 worker should read the current message text at drain time (no content-hash column exists by design). Add a hash column in Phase 64 if needed.
- Phase 65 ANN scoping uses the denormalized `message_chunks.conversation_id` directly (no join back to `messages`).
- If a real exported `EMBEDDING_MODEL_ID` constant is later introduced (likely in Phase 01/64 work), the test's local `MODEL_ID` can be swapped to it for a single source of truth.

## Self-Check: PASSED

- Files: schema.ts, migrate.ts, message-chunks-schema.test.ts, 63-02-SUMMARY.md all FOUND.
- Commits: `32da2370` (feat), `3c1e9926` (test) both FOUND in git log.
- Artifact contains: `messageChunks` (schema.ts), `message_chunks` (migrate.ts) confirmed.
