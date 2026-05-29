---
phase: 64-embed-on-write-worker
plan: "02"
subsystem: embed-worker
tags:
  - embed-worker
  - background-daemon
  - outbox-drain
  - tdd
  - degraded-mode
dependency_graph:
  requires:
    - 64-01: claimBatch, markDone, markFailed, resetAttemptsForPending, DrainDb type
  provides:
    - EmbedWorker class (start/stop/tickOnce, PID lockfile, kill switch)
    - runBacklogRecovery standalone export
    - EmbedWorker wiring in background-timers.ts
    - Full ING-01..05 test coverage
  affects:
    - src/extensions/embed-worker.ts (new)
    - src/startup/background-timers.ts (wired)
    - src/__tests__/embed-worker.test.ts (new)
    - src/__tests__/helpers/mock-cleanup.ts (registered)
tech_stack:
  added: []
  patterns:
    - HostMaintenanceDaemon mirror shape (PID lockfile inlined, kill switch, interval-driven)
    - Degraded-mode gate with log-once + resume-reset pattern
    - Sequential drain loop (no Promise.all — Transformers.js singleton)
    - Delete-before-insert for re-embed on edit (avoids duplicate chunks)
    - Standalone runBacklogRecovery export (not a private method)
    - TDD RED->GREEN: test file committed before implementation
key_files:
  created:
    - src/extensions/embed-worker.ts
    - src/__tests__/embed-worker.test.ts
  modified:
    - src/startup/background-timers.ts
    - src/__tests__/helpers/mock-cleanup.ts
decisions:
  - "mock.module paths in test file use '../memory/embeddings' (one level up from src/__tests__), NOT '../../memory/embeddings' (which is helpers/ depth) — confirmed via resolve() that both reach the same absolute path; mock-cleanup.ts stores the helpers/ form"
  - "runBacklogRecovery is a standalone exported function (not a private method) per PLAN requirement — allows tests to call it without a worker instance"
  - "Sequential embed loop (no Promise.all) enforced to honor Transformers.js singleton constraint"
  - "Lockfile helpers inlined (~30 LOC) per same rationale as host-maintenance-daemon.ts — extract at third daemon"
  - "'../../memory/message-chunker' added to MODULE_PATHS in mock-cleanup.ts since embed-worker.test.ts mocks it"
metrics:
  duration: "~10 minutes"
  completed: "2026-05-29"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 4
  tests_added: 11
---

# Phase 64 Plan 02: EmbedWorker Daemon + Full ING-01..05 Coverage Summary

**One-liner:** EmbedWorker background daemon with sequential outbox drain, degraded-mode gate (log-once + resume-reset), exponential-backoff retry exhaustion, boot recovery via runBacklogRecovery, and EZCORP_DISABLE_EMBED_WORKER kill switch — wired into background-timers.ts alongside HostMaintenanceDaemon.

## What Was Built

### Task 1 (TDD) — src/extensions/embed-worker.ts (NEW, 430 lines)

`EmbedWorker` class mirrors `HostMaintenanceDaemon` shape:

| Export | Description |
|---|---|
| `EmbedWorker` | Main daemon class: start/stop/tickOnce, PID lockfile, kill switch |
| `runBacklogRecovery` | Standalone exported function: resets all `in_progress` rows to `pending` |
| `getEmbedPollIntervalMs` | Env-var parser for `EZCORP_EMBED_POLL_INTERVAL_MS` (default 3000ms, floor 1000ms) |
| `EmbedWorkerOptions` | Options interface (wakeIntervalMs, batchSize, maxAttempts, skipLockfile, lockfilePath, now) |
| `EmbedTickOutcome` | Tick result interface (claimed, embedded, failed, skipped) |

**ING-01 drain loop** (sequential, no Promise.all):
1. `claimBatch(db, batchSize)` — claims eligible pending rows
2. Per row: fetch message, check `isEmbedEligible`, `chunkByTokens`, `generateEmbedding` per chunk
3. `db.delete(messageChunks)` then `db.insert(messageChunks)` — delete-before-insert prevents duplicate chunks on re-embed
4. `markDone(db, messageId)` — removes outbox row

**ING-02 degraded gate**: `if (!isEmbeddingReady())` → log once on entry, return `{skipped: batchSize}`. On first ready tick: `this._inDegradedMode = false`, log resume, call `resetAttemptsForPending(db)`.

**ING-03 backoff**: `computeNextAttemptAfter(attempts, now)` with `BASE_DELAY=5s * 2^attempts + jitter(30%)`. Exhausted (`newAttempts >= maxAttempts`) → `nextAttemptAfter=null` → `markFailed` sets `status='failed'`.

**ING-04 boot recovery**: `start()` calls `await runBacklogRecovery(getDb())` before arming the interval. `runBacklogRecovery` resets `in_progress` → `pending` via raw SQL RETURNING.

**ING-05 kill switch**: `EZCORP_DISABLE_EMBED_WORKER=1` (strict "1" only) → `start()` returns false without touching the lockfile.

Lockfile at `.ezcorp/embed-worker.pid`. Logger via `logger.child("embed-worker")`.

### Task 2A — src/__tests__/embed-worker.test.ts (NEW, 389 lines)

11 test cases covering all 5 ING requirements:

| Describe | Tests |
|---|---|
| ING-01: drain works | tickOnce() embeds and removes from outbox; skips ineligible (marks done) |
| ING-02: degraded mode | skipped when not ready; resumes and drains on first ready tick |
| ING-03: retry + exhaustion | increments attempts with backoff; exhaustion sets status=failed |
| ING-04: boot recovery | runBacklogRecovery resets in_progress; start() calls it before arming interval |
| ING-05: kill switch | EZCORP_DISABLE_EMBED_WORKER=1 → false; idempotent start; idempotent stop |

Mock pattern (Bun mock.module, module-level before static imports):
- `../memory/embeddings` — controls `isEmbeddingReady()` + `generateEmbedding()` via closure over `embeddingReady` let variable
- `../memory/message-chunker` — predictable `chunkByTokens` returning `[text]`

**Key discovery**: from `src/__tests__/`, mock paths need `../memory/...` (one level up), NOT `../../memory/...` (which is the helpers/ depth used in mock-cleanup.ts). Both resolve to the same absolute `src/memory/` path.

### Task 2B — src/startup/background-timers.ts (modified)

Added after HostMaintenanceDaemon block:
- `import { EmbedWorker }` at top
- `let embedWorker: EmbedWorker | undefined` singleton
- `_getEmbedWorkerForTests()` test accessor
- `startBackgroundTimers()`: try/catch wiring block mirroring permSweepDaemon pattern
- `stopBackgroundTimers()`: teardown block
- `_resetForTests()`: teardown block

### Task 2C — src/__tests__/helpers/mock-cleanup.ts (modified)

Added to MODULE_PATHS:
- `"../../extensions/embed-worker"` (after `host-maintenance-daemon`)
- `"../../memory/message-chunker"` (after `memory/embeddings`)

Pre-existing mock-cleanup-coverage failures (`ez-drafts`, `sdk/verify`, `entities/migrate`) unchanged — these predate this plan.

## Verification

```
bun test src/__tests__/embed-worker.test.ts
11 pass, 0 fail, 33 expect() calls

grep -n "_getEmbedWorkerForTests|EmbedWorker" src/startup/background-timers.ts
→ import + singleton + accessor + start/stop blocks confirmed

grep "extensions/embed-worker|memory/message-chunker" src/__tests__/helpers/mock-cleanup.ts
→ both entries present
```

## Commits

| Task | Commit | Description |
|---|---|---|
| 1 (RED) | `b18b5b6a` | test(64-02): add failing test suite for EmbedWorker ING-01..05 |
| 1 (GREEN) | `f5eb2f14` | feat(64-02): implement EmbedWorker class with runBacklogRecovery |
| 2 | `52ab0bab` | feat(64-02): wire EmbedWorker in background-timers + register in mock-cleanup |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Wrong mock path depth in test file**
- **Found during:** Task 1 GREEN phase (first test run)
- **Issue:** Plan prescribed `mock.module("../../memory/embeddings", ...)` which from `src/__tests__/` resolves to `/home/dev/work/EZCorp/ez-corp-ai/memory/embeddings` (wrong — two levels up from `__tests__` skips `src/`). The correct path from `src/__tests__/` is `../memory/embeddings`.
- **Fix:** Changed mock paths from `../../memory/embeddings` and `../../memory/message-chunker` to `../memory/embeddings` and `../memory/message-chunker` in the test file. Confirmed both resolve to the same absolute path as the `../../` form used in `helpers/mock-cleanup.ts` (which is one level deeper).
- **Files modified:** `src/__tests__/embed-worker.test.ts`
- **Commit:** `f5eb2f14`

## Success Criteria Verification

- [x] `src/extensions/embed-worker.ts` exists and exports `EmbedWorker`, `runBacklogRecovery`, `EmbedWorkerOptions`, `EmbedTickOutcome`, `getEmbedPollIntervalMs`
- [x] `EmbedWorker.start()` returns false when `EZCORP_DISABLE_EMBED_WORKER=1`; runs `runBacklogRecovery` before arming interval otherwise
- [x] `tickOnce()` is degraded-mode aware (log once; reset pending attempts on resume)
- [x] `tickOnce()` drains sequentially (no concurrent embed calls)
- [x] Chunk delete-before-insert prevents duplicate chunks on re-embed
- [x] `background-timers.ts` starts/stops `EmbedWorker` alongside `permSweepDaemon`
- [x] `"../../extensions/embed-worker"` in `mock-cleanup.ts MODULE_PATHS`
- [x] `bun test src/__tests__/embed-worker.test.ts` — all 11 test cases green
- [x] `bun test src/__tests__/mock-cleanup-coverage.test.ts` — IDX-07 pin passes; only pre-existing failures remain

## Self-Check: PASSED
