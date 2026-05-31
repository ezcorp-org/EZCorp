---
phase: 68-backfill-operations
plan: 04
subsystem: infra
tags: [backfill, cli, embeddings, outbox, throttle, idempotent, bun]

# Dependency graph
requires:
  - phase: 68-01
    provides: "RED contract src/__tests__/backfill-embeddings.test.ts (parseArgs/runBackfill/env-parse/gaps-only/idempotency/dry-run)"
  - phase: 68-02
    provides: "enqueueEmbedJobIfAbsent (DO NOTHING), enqueueEmbedJob (DO UPDATE), getEmbedProgress/EmbedProgress in message-embed-outbox.ts"
provides:
  - "scripts/backfill-embeddings.ts — resumable, idempotent operator CLI that enqueues embed jobs for every eligible message lacking chunks+outbox row, paced in --batch-size pages with --sleep-ms between"
  - "--status flag printing the shared getEmbedProgress JSON without enqueuing"
  - "--refresh-stale stale-model re-enqueue pass via the DO-UPDATE enqueueEmbedJob"
  - "--project scoping, worker-down detection (kill-switch env + PID lockfile liveness), JSON-summary-on-stdout / progress-on-stderr split"
  - "getBackfillBatchSize / getBackfillSleepMs env resolvers + backfill:embeddings package.json alias"
affects: [operations, backfill, embed-worker, admin-status-endpoint]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Operator CLI mirroring sweep-perm-expiry.ts: shebang + initDb/getDb + parseArgs→{error} + JSON-on-stdout + verbose/warn-on-stderr + exit 0/1/2"
    - "Enqueue-only backfill: compose Plan-02 outbox primitives; never import generateEmbedding/chunkByTokens/EmbedWorker"
    - "Keyset (created_at ASC, id ASC) paged enqueue with Bun.sleep between pages for traffic-yielding throttle"
    - "Cross-process worker-down probe: EZCORP_DISABLE_EMBED_WORKER==1 OR absent/dead .ezcorp/embed-worker.pid via process.kill(pid,0) liveness"

key-files:
  created:
    - scripts/backfill-embeddings.ts
  modified:
    - src/db/queries/message-embed-outbox.ts
    - package.json

key-decisions:
  - "Placed getBackfillBatchSize/getBackfillSleepMs in message-embed-outbox.ts (not the script) because the Plan-01 RED test imports them from that module — the immutable test contract dictated the location."
  - "Defaults batch=100 / sleep=200ms (plan CONTEXT discretion) — larger pages than the worker's batch=5 since enqueue is a cheap INSERT, sleep yields traffic between pages."
  - "Keyset pagination by (created_at ASC, id ASC) over OFFSET — stable under concurrent inserts and idempotent on re-run; short final page short-circuits the loop (no trailing sleep)."
  - "Worker-down is warn-then-proceed (not abort) per CONTEXT lock — the queue is durable and waits for a worker; aborting would defeat resumability."
  - "main() guarded by import.meta.main so the test can import parseArgs/runBackfill without triggering process.exit."

patterns-established:
  - "Pattern: env-knob resolvers co-located with the outbox primitives they pace, mirroring embed-worker getEmbedBatchSize defensive idiom verbatim"
  - "Pattern: stdout = single JSON summary doc; ALL progress/verbose/warn output to stderr (RESEARCH Pitfall 4)"

requirements-completed: [OPS-01, OPS-02, OPS-04]

# Metrics
duration: 4min
completed: 2026-05-31
---

# Phase 68 Plan 04: Embedding Backfill Operator CLI Summary

**`scripts/backfill-embeddings.ts` — a resumable, idempotent enqueue-only operator CLI that paces gaps-only embed-job enqueues in configurable batches, exposes `--status`/`--dry-run`/`--refresh-stale`/`--project`, warns loudly when the EmbedWorker is down, and turns the 13-case Plan-01 RED suite GREEN.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-05-31T00:57:13Z
- **Completed:** 2026-05-31T01:01:00Z
- **Tasks:** 2
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments
- Built the headline `scripts/backfill-embeddings.ts` (≈340 lines): `parseArgs` (full flag matrix + numeric validation), `runBackfill` (keyset-paced gaps-only enqueue + stale-model pass + dry-run), and `main` (initDb/getDb wiring, `--status`, worker-down warn, progress-on-stderr, summary-JSON-on-stdout, exit codes 0/1/2).
- Composed the Plan-02 primitives only — `enqueueEmbedJobIfAbsent` (DO NOTHING gaps-only), `enqueueEmbedJob` (DO UPDATE for `--refresh-stale`), `getEmbedProgress` (`--status` + final summary). Zero embedding logic in the script.
- Added `getBackfillBatchSize` / `getBackfillSleepMs` env resolvers (EZCORP_BACKFILL_* knobs; flag > env > default) and the `backfill:embeddings` package.json alias.

## Task Commits

1. **Task 1: CLI shell + gaps-only paced enqueue + env knobs** - `40171e28` (feat) — script core + env resolvers; turned the 13-case suite GREEN
2. **Task 2: package.json alias** - `1fec9593` (chore) — `backfill:embeddings` script entry (main() wiring shipped within Task 1's single-file write)

_TDD note: this plan's RED phase landed in 68-01; Task 1 was the GREEN implementation against that pre-existing suite (no separate test commit needed)._

## Files Created/Modified
- `scripts/backfill-embeddings.ts` - The operator CLI: parseArgs/runBackfill/main, gaps-only keyset-paced enqueue, --status/--dry-run/--refresh-stale/--project, worker-down detection, JSON summary on stdout / progress+warn on stderr, exit codes 0/1/2.
- `src/db/queries/message-embed-outbox.ts` - Added `getBackfillBatchSize` / `getBackfillSleepMs` (EZCORP_BACKFILL_* defensive env resolvers, embed-worker idiom verbatim).
- `package.json` - Added `"backfill:embeddings": "bun run scripts/backfill-embeddings.ts"` alongside verify:*.

## Decisions Made
- **Env-resolver location:** `getBackfillBatchSize`/`getBackfillSleepMs` live in `message-embed-outbox.ts` because the immutable Plan-01 test imports them from there (the plan `<action>` suggested the script, but the test contract — which must not be edited — dictated the module).
- **Defaults:** batch=100, sleep=200ms — enqueue is a cheap INSERT so pages can be larger than the worker's batch=5; sleep yields traffic between pages.
- **Keyset over OFFSET:** ordered by `(created_at ASC, id ASC)`, stable + idempotent under concurrent inserts; short final page short-circuits without a trailing sleep.
- **Worker-down = warn-then-proceed** per CONTEXT lock (durable queue, resumable).
- **`import.meta.main` guard** so tests can import `parseArgs`/`runBackfill` without triggering `process.exit`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added env resolvers to message-embed-outbox.ts instead of the script**
- **Found during:** Task 1 (CLI shell + env knobs)
- **Issue:** The plan `<action>` said to define `getBackfillBatchSize`/`getBackfillSleepMs` in `scripts/backfill-embeddings.ts`, but the Plan-01 RED test (line 41-43) imports them from `../db/queries/message-embed-outbox`. The coordination note claimed they "landed in Plan 02" — they had NOT (absent from the file). The module-resolution import would fail, keeping the suite RED, with no way to satisfy it without editing the (immutable) test.
- **Fix:** Added both resolvers to `message-embed-outbox.ts` (mirroring the embed-worker `getEmbedBatchSize` defensive idiom verbatim) and imported them into the script for DRY use. Minimal additive change; `enqueueEmbedJob`/`enqueueEmbedJobIfAbsent`/`getEmbedProgress` untouched.
- **Files modified:** src/db/queries/message-embed-outbox.ts (also in this plan's scope-adjacent query module; explicit-path staged)
- **Verification:** `bun test src/__tests__/backfill-embeddings.test.ts` 13/13 GREEN; `embed-progress.test.ts` 5/5 regression-green.
- **Committed in:** 40171e28 (Task 1 commit)

**2. [Rule 1 - Bug] Fixed two TS2322 typecheck errors in the gap-select helpers**
- **Found during:** Task 1 verification (typecheck gate)
- **Issue:** `db.execute` returns `Record<string,unknown>[]` per the `DrainDb` type, so the generic `rowsOf` helper couldn't narrow to the row shape, failing backend typecheck at lines 188/213.
- **Fix:** Changed `rowsOf<T>(res: unknown): T[]` with an explicit cast and supplied the row-shape type argument at each call site.
- **Files modified:** scripts/backfill-embeddings.ts
- **Verification:** `bunx tsc --noEmit -p tsconfig.json` — zero errors in backfill-embeddings.ts / message-embed-outbox.ts.
- **Committed in:** 40171e28 (Task 1 commit, before the commit was made)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both necessary to land the deliverable and pass the immutable test + typecheck gate. No scope creep — the env-resolver relocation is the only departure from the plan's prescribed file layout, forced by the test contract.

## Issues Encountered
- The live `--status` smoke test prints initDb's db-connection log lines to stdout (pre-existing logger behavior, not from this script); the single JSON progress doc follows cleanly. Out of scope — the script itself writes exactly one JSON doc to stdout.

## User Setup Required
None - no external service configuration required. Optional env knobs: `EZCORP_BACKFILL_BATCH_SIZE` (default 100), `EZCORP_BACKFILL_SLEEP_MS` (default 200).

## Next Phase Readiness
- OPS-01 (gaps-only idempotent resumable backfill), OPS-02 (paced throttle + env knobs), and the CLI half of OPS-04 (`--status` + live progress) are complete.
- The remaining Phase 68 work (admin/UI progress surface, Plan 05) can reuse `getEmbedProgress` exactly as the CLI `--status` does.

## Self-Check: PASSED

- scripts/backfill-embeddings.ts — FOUND
- .planning/phases/68-backfill-operations/68-04-SUMMARY.md — FOUND
- package.json `backfill:embeddings` alias — FOUND
- message-embed-outbox.ts env resolvers — FOUND
- Commit 40171e28 (Task 1) — FOUND
- Commit 1fec9593 (Task 2) — FOUND

---
*Phase: 68-backfill-operations*
*Completed: 2026-05-31*
