---
phase: 68-backfill-operations
plan: 02
subsystem: database
tags: [embeddings, outbox, backfill, drizzle, pglite, onConflictDoNothing, hybrid-search]

# Dependency graph
requires:
  - phase: 68-01
    provides: "Wave-0 RED scaffolds (embed-progress.test.ts + backfill-embeddings.test.ts) pinning the getEmbedProgress shape and the enqueueEmbedJobIfAbsent DO-NOTHING idempotency contract"
  - phase: 63-indexing-primitives
    provides: "message_embed_outbox (message_id PK) + message_chunks tables; enqueueEmbedJob DO-UPDATE upsert; DrainDb/EmbedJobTx structural-handle convention"
  - phase: 65-hybrid-search
    provides: "message-search.ts eligibility/test predicates being mirrored verbatim"
provides:
  - "enqueueEmbedJobIfAbsent(tx, messageId, conversationId) — onConflictDoNothing sibling of enqueueEmbedJob for gaps-only backfill (OPS-01)"
  - "EmbedJobInsertTx structural insert handle (DO-NOTHING shape)"
  - "getEmbedProgress(db) — single source of truth for backlog-by-status + eligible-vs-embedded coverage (OPS-04)"
  - "EmbedProgress interface { backlog: {pending,inProgress,failed,total}, coverage: {eligibleMessages,embeddedMessages} }"
affects: [68-03, 68-04, 68-05, backfill-cli, admin-progress-endpoint]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "DO-NOTHING sibling pattern: a second enqueue function (not a boolean flag) keeps gaps-only intent unambiguous and guarantees enqueueEmbedJob stays untouched"
    - "Three small aggregates (backlog GROUP BY + eligible COUNT + embedded COUNT DISTINCT) folded into a typed shape, reusing the result.rows ?? result unwrap idiom"

key-files:
  created: []
  modified:
    - "src/db/queries/message-embed-outbox.ts — added enqueueEmbedJobIfAbsent + EmbedJobInsertTx + getEmbedProgress + EmbedProgress"
    - "src/__tests__/message-embed-outbox-real.test.ts — added 2 real DO-NOTHING coverage cases (file pinned 100% per-file)"

key-decisions:
  - "Sibling function (enqueueEmbedJobIfAbsent) over a flag on enqueueEmbedJob — RESEARCH Pattern 2; gaps-only must never disturb pending/in_progress/failed/backed-off rows"
  - "Eligibility predicates mirrored VERBATIM from message-search.ts (c.test IS NULL OR c.test=false; role IN user,assistant) + isEmbedEligible (length(trim(content))>0) — DRY, never re-derived"
  - "embeddedMessages = COUNT(DISTINCT mc.message_id) joined back to messages+conversations so a 2-chunk message counts once AND a chunk on a now-ineligible message never inflates coverage"
  - "getEmbedProgress reuses the existing DrainDb handle (execute(sql)) so PGlite test db, Bun.sql, and drizzle all satisfy it without a new structural type"
  - "Added DO-NOTHING coverage cases to the EXISTING message-embed-outbox-real.test.ts (the real-helper behavioral suite) rather than a new file — the backfill scaffold can't load until Plan 04 creates scripts/backfill-embeddings.ts"

patterns-established:
  - "DO-NOTHING enqueue sibling: enqueueEmbedJobIfAbsent paired with enqueueEmbedJob, differing in exactly one conflict clause"
  - "Shared progress helper: getEmbedProgress is the single source of truth for --status, the in-run progress line, and the admin endpoint"

requirements-completed: [OPS-01, OPS-04]

# Metrics
duration: 7min
completed: 2026-05-31
---

# Phase 68 Plan 02: Backfill Query Primitives Summary

**Added the two genuinely-new embed-index query primitives — `enqueueEmbedJobIfAbsent` (onConflictDoNothing gaps-only enqueue) and `getEmbedProgress` (backlog-by-status + eligible-vs-embedded coverage) — co-located in the already-gated `message-embed-outbox.ts`, holding the file at 100% per-file coverage.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-05-31T00:46:23Z
- **Completed:** 2026-05-31T00:53:20Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- `enqueueEmbedJobIfAbsent` — a `.onConflictDoNothing({ target: messageEmbedOutbox.messageId })` sibling of `enqueueEmbedJob`; a colliding pending/in_progress/failed/backed-off row is left byte-for-byte unchanged (OPS-01 idempotency). Added the parallel `EmbedJobInsertTx` structural insert handle that never calls `getDb()`.
- `getEmbedProgress(db)` — returns `{ backlog: { pending, inProgress, failed, total }, coverage: { eligibleMessages, embeddedMessages } }`. Backlog folds a `GROUP BY status` into the typed shape (missing statuses default 0); coverage mirrors the message-search.ts eligibility/test predicates verbatim; `embeddedMessages` is `COUNT(DISTINCT mc.message_id)` over chunked-AND-eligible messages so a 2-chunk message counts once.
- `EmbedProgress` interface exported as the shared contract for the CLI `--status` flag, the in-run progress line, and the admin endpoint (Plans 04/05).
- `message-embed-outbox.ts` pinned at **100% funcs / 100% lines** per-file in isolation (was 91.01% lines before the DO-NOTHING coverage cases were added).

## Task Commits

Each task was committed atomically:

1. **Task 1: Add enqueueEmbedJobIfAbsent (DO NOTHING sibling)** - `0c8f7386` (feat)
2. **Task 2: Add getEmbedProgress shared helper** - `32df0eac` (feat)

**Plan metadata:** (this commit) (docs: complete plan)

_Note: These are GREEN-only TDD tasks — the RED tests landed in Plan 68-01, so each task is a single feat commit turning existing failing tests green._

## Files Created/Modified
- `src/db/queries/message-embed-outbox.ts` - Added `enqueueEmbedJobIfAbsent` + `EmbedJobInsertTx` (DO-NOTHING enqueue) and `getEmbedProgress` + `EmbedProgress` (progress snapshot). Purely additive — `enqueueEmbedJob` (DO UPDATE) untouched.
- `src/__tests__/message-embed-outbox-real.test.ts` - Added an `enqueueEmbedJobIfAbsent (real DO NOTHING)` describe block (2 cases: insert-once no-op, pre-existing-failed-row-intact incl. backoff stamp preserved). Provides the per-file coverage Plan 04's backfill suite cannot yet provide.

## Decisions Made
- **Sibling, not a flag** — `enqueueEmbedJobIfAbsent` is a separate function rather than a boolean on `enqueueEmbedJob` (RESEARCH Pattern 2). Gaps-only backfill must never reset an in-flight or deliberately-failed (attempts=3) row; two small functions keep each intent unambiguous and guarantee `enqueueEmbedJob` stays byte-for-byte unchanged (`--refresh-stale` in Plan 04 reuses the DO-UPDATE path for the stale subset only).
- **DRY eligibility predicates** — `(c.test IS NULL OR c.test = false)`, `role IN ('user','assistant')` mirrored verbatim from message-search.ts; `length(trim(m.content)) > 0` mirrors `isEmbedEligible`. Never re-derived.
- **DISTINCT-and-eligible coverage** — `embeddedMessages` joins `message_chunks` back to `messages`+`conversations` and applies the same eligibility filter, so a chunk pointing at a now-ineligible message can't inflate coverage.
- **Reuse DrainDb** — `getEmbedProgress(db: DrainDb)` uses the existing `execute(sql)` structural handle, so the PGlite test db, `Bun.sql`, and drizzle all satisfy it with no new type.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking → coverage gap] Added real DO-NOTHING coverage cases to keep the file ≥95%**
- **Found during:** Task 2 (coverage measurement)
- **Issue:** The plan's Task 1 verify command (`bun test src/__tests__/backfill-embeddings.test.ts -t "enqueueEmbedJobIfAbsent"`) cannot run in isolation: that test file top-level-imports `../../scripts/backfill-embeddings`, a module Plan 04 has not yet created, so the whole file fails to load (`Cannot find module`). With no runnable test exercising `enqueueEmbedJobIfAbsent`, the file dropped to 91.01% lines — under the ≥95% bar this plan must hold.
- **Fix:** Added an `enqueueEmbedJobIfAbsent (real DO NOTHING)` describe block to the existing real-helper suite `message-embed-outbox-real.test.ts` (2 cases: twice → exactly one pending row; pre-existing failed row left byte-for-byte intact incl. its backoff stamp). This is the plan's own Task-2 instruction ("Add unit cases as needed to hold the file ≥95%") applied to Task 1's deliverable, in the correct co-located home.
- **Files modified:** src/__tests__/message-embed-outbox-real.test.ts
- **Verification:** Per-file coverage for `message-embed-outbox.ts` went 91.01% → **100%** lines / 100% funcs in isolation; `enqueueEmbedJob` regression suite (5/5) + drain-helpers (36/36) all stay green.
- **Committed in:** `32df0eac` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking/coverage-gap, via the plan's own ≥95% instruction)
**Impact on plan:** Necessary to satisfy the plan's explicit ≥95% per-file coverage success criterion given the cross-plan import coupling. No scope creep — only `message-embed-outbox.ts` (the plan's sole files_modified) plus its already-existing real-helper test suite were touched.

## Issues Encountered
- **backfill-embeddings.test.ts stays RED (expected).** The full backfill suite imports the not-yet-created `scripts/backfill-embeddings.ts` (Plan 04). Per the plan ("the rest of that file stays RED until Plan 04"), this is the intended Nyquist state — `enqueueEmbedJobIfAbsent` is behaviorally verified instead via the real-helper suite. It turns fully GREEN once Plan 04 lands the script.
- **`bunx tsc -p tsconfig.json` standalone OOM-crashes** on this large project (node stack trace, not a type error). The authoritative gate `scripts/typecheck.sh` passes cleanly; touched test files were verified to have zero own type errors via filtered isolated `tsc`.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- OPS-01 (`enqueueEmbedJobIfAbsent`) + OPS-04 (`getEmbedProgress`/`EmbedProgress`) primitives are exported, GREEN, and ≥95% (100%) covered — co-located, so no new coverage-threshold entry is needed.
- Plan 04 (`scripts/backfill-embeddings.ts`) can now compose `enqueueEmbedJobIfAbsent` for gaps-only enqueue and import `getEmbedProgress`/`EmbedProgress` for `--status`; turning backfill-embeddings.test.ts GREEN is then purely a matter of creating that script.
- Plan 05 (admin endpoint) can import `getEmbedProgress` directly as the single source of truth.

---
*Phase: 68-backfill-operations*
*Completed: 2026-05-31*

## Self-Check: PASSED

- FOUND: src/db/queries/message-embed-outbox.ts (4/4 exported symbols: enqueueEmbedJobIfAbsent, getEmbedProgress, EmbedProgress, EmbedJobInsertTx)
- FOUND: src/__tests__/message-embed-outbox-real.test.ts
- FOUND: .planning/phases/68-backfill-operations/68-02-SUMMARY.md
- FOUND commit: 0c8f7386 (Task 1)
- FOUND commit: 32df0eac (Task 2)
