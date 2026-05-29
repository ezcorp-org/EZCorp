---
phase: 64-embed-on-write-worker
plan: "01"
subsystem: db
tags:
  - migration
  - outbox
  - embed-worker
  - tdd
dependency_graph:
  requires:
    - 63-embed-outbox-schema
  provides:
    - next_attempt_after TIMESTAMPTZ column on message_embed_outbox
    - claimBatch export
    - markDone export
    - markFailed export
    - resetAttemptsForPending export
  affects:
    - src/db/migrate.ts
    - src/db/queries/message-embed-outbox.ts
tech_stack:
  added: []
  patterns:
    - structural typing for db handle (DrainDb mirrors EmbedJobTx pattern)
    - subquery UPDATE instead of UPDATE...LIMIT (PGlite restriction)
    - TDD RED→GREEN on both tasks
key_files:
  created:
    - src/__tests__/message-embed-outbox-next-attempt-column.test.ts
    - src/__tests__/message-embed-outbox-drain-helpers.test.ts
  modified:
    - src/db/migrate.ts
    - src/db/queries/message-embed-outbox.ts
decisions:
  - "NULL sentinel (no DEFAULT) for next_attempt_after — NULL means never backed off; presence means a backoff timestamp"
  - "DrainDb structural type mirrors EmbedJobTx pattern — no getDb() calls inside helpers"
  - "markDone uses db.delete() (Drizzle fluent API) to match existing ClearEmbedTx pattern; markFailed/resetAttemptsForPending use raw sql`` for multi-column UPDATEs"
  - "claimBatch uses subquery UPDATE (SELECT...LIMIT inside WHERE IN) — PGlite does not support UPDATE...LIMIT directly"
metrics:
  duration: "~15 minutes"
  completed: "2026-05-29"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 4
  tests_added: 20
---

# Phase 64 Plan 01: DB Layer — next_attempt_after Column + Outbox Drain Helpers Summary

**One-liner:** Idempotent migration addendum adding the `next_attempt_after TIMESTAMPTZ` backoff column + four new DB helpers (`claimBatch`, `markDone`, `markFailed`, `resetAttemptsForPending`) the EmbedWorker (Plan 02) will consume to claim, complete, and fail embed jobs without raw SQL in the worker layer.

## What Was Built

### Task 1 — Migration addendum

Added `ALTER TABLE message_embed_outbox ADD COLUMN IF NOT EXISTS next_attempt_after TIMESTAMP WITH TIME ZONE` to `src/db/migrate.ts` immediately after the outbox `CREATE TABLE` block. The column has no DEFAULT — `NULL` is the sentinel for "never backed off" and avoids ambiguity with actual timestamps.

### Task 2 — Outbox drain helpers

Four new exports in `src/db/queries/message-embed-outbox.ts`:

| Export | Behavior |
|---|---|
| `claimBatch(db, N)` | Claims up to N pending rows eligible for processing (next_attempt_after IS NULL or past), marks them `in_progress`, returns `{messageId, conversationId, attempts}[]` |
| `markDone(db, messageId)` | DELETEs the outbox row (no `done` status in schema) |
| `markFailed(db, messageId, newAttempts, nextAttemptAfter)` | Sets `status='failed'` on exhaustion (null); sets `status='pending'` with backoff timestamp on retry |
| `resetAttemptsForPending(db)` | Resets `attempts=0` and `next_attempt_after=NULL` on all `pending` rows only; returns row count |

New structural type `DrainDb` follows the same pattern as `EmbedJobTx` and `ClearEmbedTx` — the module never calls `getDb()` internally.

## Verification

- `bun test src/__tests__/message-embed-outbox.test.ts` — 13/13 pass (pre-existing Phase 63 suite, no regressions)
- `bun test src/__tests__/message-embed-outbox-real.test.ts` — 5/5 pass (no regressions)
- `bun test src/__tests__/message-embed-outbox-next-attempt-column.test.ts` — 3/3 pass (new Task 1 suite)
- `bun test src/__tests__/message-embed-outbox-drain-helpers.test.ts` — 17/17 pass (new Task 2 suite)
- Total: 38/38 pass across all 4 outbox test files

## Commits

| Task | Commit | Description |
|---|---|---|
| 1 | `3e8da516` | feat(64-01): add next_attempt_after backoff column to message_embed_outbox |
| 2 | `25cb46bc` | feat(64-01): add claimBatch, markDone, markFailed, resetAttemptsForPending to outbox |

## Deviations from Plan

None — plan executed exactly as written. The plan's prescribed code was used verbatim for all four helpers. The `DrainDb` type and all four function bodies match the plan's `<action>` sections precisely.

## Success Criteria Verification

- [x] `src/db/migrate.ts` contains `ALTER TABLE message_embed_outbox ADD COLUMN IF NOT EXISTS next_attempt_after TIMESTAMP WITH TIME ZONE`
- [x] `src/db/queries/message-embed-outbox.ts` exports `claimBatch`, `markDone`, `markFailed`, `resetAttemptsForPending`
- [x] All four helpers accept `db` as first param (never call `getDb()` internally)
- [x] `claimBatch` uses subquery UPDATE pattern (no `UPDATE ... LIMIT`)
- [x] `markFailed(db, id, n, null)` sets `status='failed'`; `markFailed(db, id, n, futureDate)` sets `status='pending'` with backoff
- [x] `resetAttemptsForPending` scoped to `WHERE status = 'pending'` only
- [x] Existing `bun test src/__tests__/message-embed-outbox.test.ts` still passes (13/13)

## Self-Check: PASSED
