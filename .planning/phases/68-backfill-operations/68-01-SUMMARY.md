---
phase: 68-backfill-operations
plan: 01
subsystem: testing
tags: [bun-test, pglite, embed-outbox, backfill, cli, red-scaffold, nyquist]

# Dependency graph
requires:
  - phase: 63-indexing-primitives
    provides: "message_embed_outbox + message_chunks schema, enqueueEmbedJob upsert, DrainDb structural handle"
  - phase: 64-embed-on-write-worker
    provides: "embed-worker env-parse idiom (EZCORP_EMBED_BATCH_SIZE: undefined/empty→default, Math.floor(Number), non-finite/≤0→default, Math.max clamp)"
  - phase: 65-hybrid-search-sql-api
    provides: "message-search.ts eligibility/test predicates the SUT must mirror (role IN (user,assistant); c.test IS NULL OR c.test=false)"
provides:
  - "RED bun:test contract for the backfill CLI (OPS-01 gaps-only + idempotent DO-NOTHING enqueue, OPS-02 throttle/env parse)"
  - "RED bun:test contract for getEmbedProgress() (OPS-04 {backlog, coverage} shape across 5 states)"
  - "Locked import surface for Plan 02 (enqueueEmbedJobIfAbsent, getEmbedProgress, getBackfillBatchSize, getBackfillSleepMs) and Plan 04 (parseArgs, runBackfill from scripts/backfill-embeddings.ts)"
affects: [68-02, 68-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wave-0-RED scaffold (mirrors 66-01/67-01): tests import not-yet-existing symbols so plans 02/04 turn them GREEN"
    - "Raw-insert seeding (bypass createMessage) so the auto-enqueue at conversations.ts:414 does not pre-populate the outbox and defeat the gaps-only premise"

key-files:
  created:
    - src/__tests__/backfill-embeddings.test.ts
    - src/__tests__/embed-progress.test.ts
  modified: []

key-decisions:
  - "Seed via raw drizzle inserts into messages/conversations rather than createMessage(), because createMessage auto-enqueues eligible messages (conversations.ts:414) which would pre-fill the outbox and make gaps-only assertions impossible to control"
  - "OPS-02 contract pinned as separate resolver helpers getBackfillBatchSize/getBackfillSleepMs mirroring embed-worker.ts's getEmbedBatchSize idiom (undefined/empty→default, Math.floor(Number(raw)), !isFinite/≤0→default, Math.max clamp)"
  - "runBackfill opts use sleepMs=0 in tests so paced batches never actually sleep — no Bun.sleep mock needed"

patterns-established:
  - "Mirror (not re-derive) message-search.ts predicates: tests assert against role IN (user,assistant) + (c.test IS NULL OR c.test=false) + content.trim().length>0 as the eligibility contract"
  - "DO-NOTHING vs DO-UPDATE contrast: enqueueEmbedJobIfAbsent must leave a pre-existing failed row's status/attempts intact across re-runs (the opposite of enqueueEmbedJob's onConflictDoUpdate reset)"

requirements-completed: [OPS-01, OPS-02, OPS-04]

# Metrics
duration: 2min
completed: 2026-05-31
---

# Phase 68 Plan 01: Wave-0 RED Backfill + Progress Scaffolds Summary

**Two RED bun:test files pinning the backfill CLI contract (gaps-only + idempotent DO-NOTHING enqueue, throttle/env parse) and the shared getEmbedProgress() {backlog, coverage} query, using the PGlite harness and mirroring message-search.ts eligibility predicates.**

## Performance

- **Duration:** ~2 min (active execution; research preceded the timer)
- **Started:** 2026-05-31T00:41:03Z
- **Completed:** 2026-05-31T00:43:05Z
- **Tasks:** 2
- **Files modified:** 2 (both created)

## Accomplishments
- `src/__tests__/backfill-embeddings.test.ts` (≈300 lines): RED integration+unit contract for OPS-01/OPS-02 — gaps-only select (skips chunked / already-queued / system / test-conversation / whitespace messages), DO-NOTHING idempotency (re-runs enqueue 0, a failed row survives untouched), `enqueueEmbedJobIfAbsent` unit (insert-once, leave failed intact), `--dry-run` (writes nothing, reports would-enqueue count), `EZCORP_BACKFILL_BATCH_SIZE`/`_SLEEP_MS` parse, and full `parseArgs` flag matrix incl `--help`/`-h` and unknown-flag errors.
- `src/__tests__/embed-progress.test.ts` (≈140 lines): RED integration contract for OPS-04 `getEmbedProgress()` across empty / pending-backlog / coverage-DISTINCT / test-exclusion / role-exclusion states.
- Both files RED for the intended reason (missing not-yet-implemented exports), not harness/syntax errors. Zero production code modified. `background-timers.test.ts` regression guard still GREEN (16/16).

## Task Commits

1. **Task 1: RED scaffold backfill-embeddings.test.ts (OPS-01, OPS-02)** - `574a3fc1` (test)
2. **Task 2: RED scaffold embed-progress.test.ts (OPS-04)** - `14655a68` (test)

_No TDD multi-commit split — these are pure RED scaffolds (no GREEN production code in this plan)._

## Files Created/Modified
- `src/__tests__/backfill-embeddings.test.ts` - RED contract for `parseArgs`/`runBackfill` (Plan 04) + `enqueueEmbedJobIfAbsent`/`getBackfillBatchSize`/`getBackfillSleepMs` (Plan 02)
- `src/__tests__/embed-progress.test.ts` - RED contract for `getEmbedProgress` (Plan 02)

## Decisions Made
- **Raw-insert seeding over createMessage():** `createMessage` auto-enqueues eligible (user/assistant non-whitespace) messages inside its transaction (`conversations.ts:414` → `enqueueEmbedJob`). Seeding through it would pre-populate `message_embed_outbox`, making it impossible to assert which rows are "true gaps". Tests insert directly into `conversations`/`messages`/`message_chunks`/`message_embed_outbox` so each row's outbox/chunk state is controlled explicitly.
- **OPS-02 resolver shape:** pinned as standalone `getBackfillBatchSize()`/`getBackfillSleepMs()` helpers that mirror `embed-worker.ts`'s `getEmbedBatchSize` idiom verbatim (undefined/empty→default, `Math.floor(Number(raw))`, `!Number.isFinite || ≤0`→default, `Math.max(MIN, n)` clamp). `process.env` saved/restored around each case.
- **No Bun.sleep mock:** `runBackfill` test opts pass `sleepMs: 0` so paced batches don't actually sleep — simpler than `mock.module`-ing `Bun.sleep`.

## Deviations from Plan

None - plan executed exactly as written. The plan's research into the embed-worker env idiom and the `createMessage` auto-enqueue side effect informed the test design but required no scope changes; both are explicitly anticipated by the plan's <action> guidance.

## Issues Encountered
None. Both RED files failed on the first run for exactly the intended reason — Task 1 with `Cannot find module '../../scripts/backfill-embeddings'` (Plan-04 module absent) and Task 2 with `getEmbedProgress is not a function` (Plan-02 export absent). The PGlite harness, seeders, and schema references all resolved cleanly, confirming the RED is contract-driven, not harness breakage.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- **Plan 02** (extends `src/db/queries/message-embed-outbox.ts`) must add `enqueueEmbedJobIfAbsent` (DO-NOTHING sibling of `enqueueEmbedJob`), `getEmbedProgress` (returning `{backlog:{pending,inProgress,failed,total}, coverage:{eligibleMessages,embeddedMessages}}`), and the `getBackfillBatchSize`/`getBackfillSleepMs` env resolvers — turning both RED files partially GREEN.
- **Plan 04** (creates `scripts/backfill-embeddings.ts`) must export `parseArgs` + `runBackfill` per the plan's <interfaces>, turning the backfill suite fully GREEN.
- Both downstream plans have a pre-existing automated test to satisfy (Nyquist rule met for OPS-01/02/04).

---
*Phase: 68-backfill-operations*
*Completed: 2026-05-31*

## Self-Check: PASSED

- FOUND: src/__tests__/backfill-embeddings.test.ts
- FOUND: src/__tests__/embed-progress.test.ts
- FOUND: .planning/phases/68-backfill-operations/68-01-SUMMARY.md
- FOUND commit: 574a3fc1 (Task 1)
- FOUND commit: 14655a68 (Task 2)
