# Capability Expiry — Milestone Plan

**Status:** Multi-phase milestone roadmap. Each phase is a standalone ez-feature run.
**Source design doc:** `tasks/capability-expiry-design.md` (shipped 2026-05-08).
**Total scope:** ~1,650 LOC across 4 phases, ~6-9 days end-to-end.
**Open questions resolved** with design doc's recommended defaults (§A below).

---

## A. Resolved open questions (locked for the milestone)

Per design doc §6, with chosen defaults:

| # | Question | Resolution |
|---|---|---|
| 6.1 | `forever` scope expiry policy | Single env var `EZCORP_PERM_FOREVER_TTL_DAYS`, default `90`. Per-capability override deferred to v1.5. |
| 6.2 | Notification channel | In-app banner only. Email/push deferred (need user opt-in storage + notifications table — separate scope). |
| 6.3 | Storage / schedule TTL | `Never` (skip from sweep). Document the choice in admin UI tooltip when UX phase ships. |
| 6.4 | Sweep on disabled extensions | Preserve grants on `disabled` (failure-cap), revoke on `uninstalled`. 1-line policy flag for future tweaking. |

These are LOCKED. Phases below build on them; if any phase wants to deviate, that's a re-plan, not a deviation-mid-flight.

---

## B. Phase dependency graph

```
Phase 1 (Foundation) ──► Phase 2 (Sweep core) ──► Phase 3 (Daemon) ──► Phase 4 (UX)
       data model           manual-invocable        auto-runs           user-visible
```

Each phase is mergeable on its own (so v1 = Phase 1+2 only is a valid pause point if priorities shift). Phases 1 and 2 are backend-only; Phases 3 and 4 add operational and UX surface.

---

## Phase 1 — Foundation: TTL config + always-allow value-shape migration

**Estimated:** ~420 LOC, 1-2 days. Single ez-feature run.

### Goal

Land the data model changes and the per-capability TTL table without yet doing any sweeping. After this phase, all permission grants populate `grantedAt` (already true for `extensions` row) AND the always-allow settings rows have a forwards-compatible `{allowed, grantedAt}` value shape. No behavior change visible to users yet.

### Locked decisions

1. **Always-allow value shape** widens from `boolean` to `{allowed: boolean, grantedAt: number}`. Legacy `true` is treated as "no expiry — never sweep" on read.
2. **Read-side migration only** in this phase. Existing rows are NOT rewritten — they're upgraded lazily on the next write.
3. **TTL config table lives at `src/extensions/perm-expiry-config.ts`** as a typed const map. Unit-tested. No env-var override in this phase except the global `EZCORP_PERM_FOREVER_TTL_DAYS`.
4. **Audit action constant `EXT_AUDIT_ACTIONS.PERM_GRANT_EXPIRED`** added to the existing audit action enum. Not yet emitted anywhere.

### Tasks

- 1A. Add `perm-expiry-config.ts` with the TTL table from design doc §2.4 (filesystem-write 30d, filesystem-read 90d, shell 30d, network 90d, env 90d, llm 90d, memory 90d, lessons 90d, storage Never, taskEvents Never, appendMessages Never, schedule Never).
- 1B. Add `EZCORP_PERM_FOREVER_TTL_DAYS` env var read with default `90`.
- 1C. Widen always-allow value shape: update `getSensitiveAlwaysAllow` and `setSensitiveAlwaysAllow` to read `{allowed, grantedAt}` OR legacy `boolean`; always WRITE the new shape with `grantedAt: Date.now()`.
- 1D. Add `EXT_AUDIT_ACTIONS.PERM_GRANT_EXPIRED` constant.
- 1E. Tests: TTL config map unit tests; always-allow read backwards-compat (legacy `true` → never-expires); always-allow write new shape; env var read happy path + fallback.

### Verification

- `bun test ./src/__tests__/perm-expiry-config.test.ts` — new tests pass.
- `bun test ./src/__tests__/permissions.test.ts` (existing) — still passes after value-shape change.
- Typecheck + biome clean.

### Out of scope

- The actual sweep job.
- Daemon registration.
- UX changes.
- Migrating existing always-allow rows in the DB (lazy upgrade only).

---

## Phase 2 — Sweep core (manually invokable)

**Estimated:** ~550 LOC, 2-3 days. Single ez-feature run.

### Goal

Build the sweep itself as a pure function + a manual CLI script (`bun run scripts/sweep-perm-expiry.ts`). After this phase, an admin can invoke the sweep on demand; the sweep correctly identifies and revokes expired grants, writes audit rows, and emits the `event:perm-expired` event. Not yet auto-running.

### Depends on

Phase 1 must ship first.

### Locked decisions

1. **Sweep is a pure function** `runSweep({ db, now, config }): SweepResult` taking deps explicitly. Side effects (audit row write, event emit) returned as a list and applied at the call site.
2. **Race mitigation:** `SELECT FOR UPDATE` on the read; CHECK clause fallback on the UPDATE if the SQL backend doesn't support it (PGlite + Postgres both do).
3. **No transactional bundling with dispatch.** Crash-mid-sweep is fine; next run picks up.
4. **CLI script outputs a summary** (`{ swept: N, errors: [...] }`) and exits 0 on success. Exits 1 if any extension's sweep errored.
5. **`event:perm-expired`** emitted on the existing event bus (find the right module — likely `src/events/bus.ts` or similar; if none, this phase establishes one with minimal scope).

### Tasks

- 2A. Implement `runSweep` in `src/extensions/perm-expiry-sweep.ts`. Inputs: db handle, current time, config. Outputs: list of revocations to apply.
- 2B. Implement `applySweepResult` that runs the side effects (audit write, value updates, event emit).
- 2C. Add CLI script `scripts/sweep-perm-expiry.ts` that wires real DB + real now() and applies results.
- 2D. Wire `EXT_AUDIT_ACTIONS.PERM_GRANT_EXPIRED` emission with metadata `{capability, scope, ttlMs, ageMs}`.
- 2E. Wire `event:perm-expired` emission. If no event bus exists, the bus itself is a tiny scope addition (~50 LOC).
- 2F. Race mitigation: `SELECT FOR UPDATE` on the read; CHECK clause on the UPDATE.
- 2G. Tests:
  - Unit: `runSweep` over a synthetic store with 100 extensions, 50% expired → asserts only the expired half is revoked.
  - Unit: per-capability TTL evaluation for each kind in the config.
  - Unit: idempotence — second sweep over the same state produces zero revocations.
  - Integration: CLI script against a real PGlite instance.
  - Integration: race-mitigation behavior under simulated concurrent write.

### Verification

- `bun test ./src/__tests__/perm-expiry-sweep.test.ts` (unit).
- `bun test ./src/__tests__/perm-expiry-sweep.integration.test.ts` (PGlite).
- `bun run scripts/sweep-perm-expiry.ts --dry-run` against a clean DB → outputs `{swept: 0}`.
- Typecheck + biome clean.

### Out of scope

- Daemon hookup (next phase).
- UX changes.
- Orphan-row cleanup (deferred per design doc §2.7).

---

## Phase 3 — Daemon registration

**Estimated:** ~230 LOC, 1 day. Single ez-feature run.

### Goal

Auto-run the sweep hourly via a sibling host-maintenance daemon. After this phase, expired grants get cleaned up automatically without admin intervention.

### Depends on

Phase 2 must ship first.

### Locked decisions

1. **Sibling daemon, not extension-scope.** New `src/extensions/host-maintenance-daemon.ts` (or extend `schedule-daemon.ts` with a non-extension-scoped tick — pick the cleaner option during planning). Reject reusing the extension schedule table for plumbing per design doc §2.2.
2. **Cadence:** hourly, configurable via `EZCORP_PERM_SWEEP_INTERVAL_MS` env var, default `3_600_000`.
3. **PID lockfile pattern reused** from `schedule-daemon.ts:140-150`.
4. **Daemon starts on server boot** alongside `schedule-daemon`. Disabled by `EZCORP_DISABLE_PERM_SWEEP=1` (test override + emergency kill switch).

### Tasks

- 3A. Implement `host-maintenance-daemon.ts` with the lockfile + hourly tick + sweep invocation.
- 3B. Wire `EZCORP_PERM_SWEEP_INTERVAL_MS` env var read.
- 3C. Wire `EZCORP_DISABLE_PERM_SWEEP=1` kill switch.
- 3D. Register the daemon at server boot — single line in the bootstrap that starts `schedule-daemon`.
- 3E. Tests:
  - Integration: daemon lifecycle (start, tick, stop) with a fake clock.
  - Integration: kill switch disables the tick.
  - Integration: lockfile prevents two instances.

### Verification

- `bun test ./src/__tests__/host-maintenance-daemon.test.ts`.
- Boot the server with a `grantedAt` set 91 days in the past; observe the sweep fires within the first tick.
- Typecheck + biome clean.

### Out of scope

- UX changes (next phase).

---

## Phase 4 — UX surface

**Estimated:** ~450 LOC, 2-3 days. Single ez-feature run.

### Goal

User-visible re-approval flow. After this phase: (a) the existing in-chat permission modal renders the "expired — re-approve" branch when the PDP returns `deny: capability expired`; (b) `/settings/extensions/[id]` shows a banner listing recently-expired grants with a one-click re-approve.

### Depends on

Phases 1-3 must ship first.

### Locked decisions

1. **Reuse the existing permission modal** (Phase 6 of perm-system). Add a `expiredCapability?: { capability, ageMs }` prop that swaps the title + body copy.
2. **Settings banner is a new component** at `web/src/lib/components/permissions/ExpiredGrantsBanner.svelte`. Lists capabilities expired in the last 7 days. Click → opens the same modal.
3. **"Approve forever (admin only)" button** is gated by the user's role check (existing `isAdmin` helper). Regular users see "Approve $newTtl" only.
4. **Dismissal is non-authoritative.** Sweep already revoked; dismissing the modal just defers the next prompt.
5. **Modal copy matches design doc §3.2 exactly.**

### Tasks

- 4A. Add `expiredCapability` prop + branch to existing permission modal component.
- 4B. Implement `ExpiredGrantsBanner.svelte` + load fn (queries audit log for `PERM_GRANT_EXPIRED` rows in last 7 days, scoped to user's installed extensions).
- 4C. Wire banner into `/settings/extensions/[id]/+page.svelte`.
- 4D. Role-gate the "Approve forever" button.
- 4E. Tests:
  - Component test for modal expired-branch rendering.
  - Component test for banner row click → modal open.
  - Component test for role-gating (non-admin sees "Approve $newTtl" only).
  - E2E (Playwright if available, vitest+jsdom otherwise): install ext → fast-forward clock past TTL → trigger sweep → reload settings → banner shows → click re-approve → row's `grantedAt` resets.

### Verification

- `cd web && bunx vitest run` — new component + e2e tests pass.
- Manual: install an extension, set its `grantedAt` 91 days back, hit a tool call → modal shows expired branch; admin user sees "Approve forever", regular user does not.
- Typecheck + biome clean.

### Out of scope

- Email / push notifications (deferred per resolved open question 6.2).
- Per-user TTL admin UI (deferred to v2).

---

## C. Sequencing notes

- **Phases 1 and 2** can be executed back-to-back without UX. They're the riskiest because they touch data shape; ship them first to lock invariants.
- **Phase 3** is operationally important but small. Could land within a few hours of Phase 2 merging.
- **Phase 4** is the most user-facing and the most likely to surface design questions during implementation. Take time on it.

If priorities shift mid-milestone, a valid pause point is **after Phase 2** — sweep is invocable on demand by an admin (or a cron hooked up out-of-band). UX waits.

## D. Open milestone-level questions (none for v1)

The 4 design-doc open questions are resolved (§A). New questions surfacing during implementation should be flagged via checkpoint to the orchestrator, not resolved silently.

## E. Cross-phase artifacts

- **`tasks/capability-expiry-design.md`** — the source of truth for design-level reasoning. Re-read before each phase's planning round.
- **TTL config map** in `src/extensions/perm-expiry-config.ts` (Phase 1) is the SOLE place TTL values live. No magic numbers in sweep code or UI copy.
- **`EXT_AUDIT_ACTIONS.PERM_GRANT_EXPIRED`** is the audit action; metadata shape `{capability, scope, ttlMs, ageMs}` is the contract every phase honors.
