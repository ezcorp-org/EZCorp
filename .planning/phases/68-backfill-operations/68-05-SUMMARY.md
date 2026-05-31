---
phase: 68-backfill-operations
plan: 05
subsystem: api
tags: [svelte, sveltekit, admin, embed-index, rbac, vitest]

# Dependency graph
requires:
  - phase: 68-backfill-operations (Plan 02)
    provides: getEmbedProgress(db) shared {backlog, coverage} query in message-embed-outbox.ts
  - phase: 68-backfill-operations (Plan 01)
    provides: embed-progress.test.ts RED scaffold (turned green by Plan 02)
provides:
  - admin-gated GET /api/admin/embed-progress returning getEmbedProgress() {backlog, coverage}
  - read-only embedding-progress card on the admin dashboard (system tab), fetched on mount
affects: [POLISH-02, admin-dashboard, backfill-operations]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Admin endpoint = requireScope(admin) + try{requireRole(admin); work}catch(Response) — mirrored verbatim from admin/system"
    - "Endpoint passes getDb() into the shared query (query module never calls getDb itself — Phase 63 Pitfall 1)"

key-files:
  created:
    - web/src/routes/api/admin/embed-progress/+server.ts
    - web/src/__tests__/api-admin-embed-progress.server.test.ts
  modified:
    - web/src/routes/(app)/admin/dashboard/+page.svelte

key-decisions:
  - "Did NOT pin the new endpoint in coverage-thresholds.json — sibling admin/system/+server.ts is unpinned; the 100%-pinned routes are Phase 65/66 search features, a different gate. Followed the admin-endpoint convention (unpinned)."
  - "Skipped the optional dashboard component test — the dashboard page is not component-coverage-gated and no existing dashboard component-test convention exists to mirror (plan marked it optional)."
  - "Endpoint calls getDb() and passes it to getEmbedProgress(db) since the shared query requires a handle (unlike zero-arg analytics helpers); matches web endpoints that import getDb from $server/db/connection."

patterns-established:
  - "Read-only admin status card: $state holder + fetchX() mirroring fetchSystem() + wired into refreshAll() Promise.all; data-testid hook for future targeting."

requirements-completed: [OPS-04]

# Metrics
duration: 3min
completed: 2026-05-31
---

# Phase 68 Plan 05: Admin Embed-Progress Surface Summary

**Admin-gated `GET /api/admin/embed-progress` composing the shared `getEmbedProgress()` query, plus a read-only embedding-progress card (backlog depth + coverage %) on the admin dashboard's system tab.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-05-31T00:57:28Z
- **Completed:** 2026-05-31T00:59:55Z
- **Tasks:** 2
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments
- Thin admin-scoped endpoint returning `{ backlog, coverage }` from the single-source-of-truth `getEmbedProgress()` (DRY across CLI `--status` + admin UI)
- Auth gate (`requireScope("admin")` + `requireRole("admin")`) mirrored verbatim from `admin/system/+server.ts` — no bespoke auth
- Read-only dashboard card (`data-testid="embed-progress-card"`) fetched on mount via `fetchEmbedProgress()` wired into `refreshAll()`'s `Promise.all`
- Server test GREEN 5/5 (401 no-user, 403 non-admin, 403 missing scope, happy-path verbatim, 500 propagation)

## Task Commits

1. **Task 1 (RED): failing server test** - `ab469421` (test)
2. **Task 1 (GREEN): admin embed-progress endpoint** - `2d126a64` (feat)
3. **Task 2: read-only dashboard card** - `efebc4d0` (feat)

_TDD task 1 has the standard test→feat pair; no refactor was needed (clean on first green)._

## Files Created/Modified
- `web/src/routes/api/admin/embed-progress/+server.ts` - admin-gated GET returning `getEmbedProgress(getDb())` output
- `web/src/__tests__/api-admin-embed-progress.server.test.ts` - 5-case server-handler suite (mocks getDb + getEmbedProgress)
- `web/src/routes/(app)/admin/dashboard/+page.svelte` - `embedProgress` state + `fetchEmbedProgress()` + system-tab card + coverage-% derived + card styling

## Decisions Made
- **Coverage pin:** not added. The sibling `admin/system/+server.ts` is unpinned in `scripts/coverage-thresholds.json`; the 100%-pinned routes there are Phase 65/66 search features (a separate feature gate). Followed the admin-endpoint convention rather than inventing a new pin.
- **Optional component test:** skipped. The dashboard page is not component-coverage-gated and there is no existing dashboard component-test to mirror; the plan explicitly marked this optional.
- **DB handle:** endpoint imports `getDb` from `$server/db/connection` and passes it into `getEmbedProgress(db)` (the query requires a handle and never calls getDb itself); matches the pattern in `web/src/routes/api/users/[id]/+server.ts`.

## Deviations from Plan

None - plan executed exactly as written. RED on first run (module-not-found for the not-yet-created endpoint), GREEN on first implementation (5/5), no refactor needed. Zero Rule 1-4 deviations.

## Issues Encountered
- `svelte-check` initially flagged `Cannot find module './$types'` on the new endpoint — resolved by `bunx svelte-kit sync` (generates route types). This is expected for any new route file, not a code issue.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- OPS-04 web half complete; operators can watch backlog drain + coverage from the admin dashboard.
- Live streaming + toast remain deferred to POLISH-02 (intentionally out of scope per CONTEXT lock).
- Coupled with Plan 04 (CLI half, web-only parallel) — zero file overlap; both compose the same `getEmbedProgress`/`enqueueEmbedJobIfAbsent` from Plan 02.

---
*Phase: 68-backfill-operations*
*Completed: 2026-05-31*

## Self-Check: PASSED
- FOUND: web/src/routes/api/admin/embed-progress/+server.ts
- FOUND: web/src/__tests__/api-admin-embed-progress.server.test.ts
- FOUND: web/src/routes/(app)/admin/dashboard/+page.svelte (modified, tracked)
- FOUND: .planning/phases/68-backfill-operations/68-05-SUMMARY.md
- FOUND commit ab469421 (test RED)
- FOUND commit 2d126a64 (feat endpoint)
- FOUND commit efebc4d0 (feat dashboard card)
