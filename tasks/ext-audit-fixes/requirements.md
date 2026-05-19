# Extension Audit-Fix Round — Requirements & Scope Lock

Feature owner: PM (team `ext-audit-fixes`)
Prior round: `tasks/ext-install-fix/requirements.md` (SEC-1..7, FR-1..6).
Stack: Bun + SvelteKit + PGlite. Tests: `bun test` + Playwright.

This round fixes findings from three independent audits of the prior
`ext-install-fix` work. All SEC-* and FR-* invariants from the prior
requirements doc are **carried forward** and must continue to hold.

---

## 0. Critical non-negotiable

**NO fix may silently disable currently-working MCP extensions.**

- Existing enabled extensions keep working after this branch ships.
- Existing manifest schemas still load without a new permission grant.
- `source:"github"` / `source:"local"` install paths remain functionally unchanged.
- Additive validation only. A tighter check that would reject an existing
  bundled manifest is a bug, not an acceptable trade-off.
- The 23 runtime-enforcement tests from prior commit `a74e196` are the
  non-regression bar for SEC-7.
- The MCP sandbox-envelope fix (task #14) must **wrap** the spawn, not
  **gate** it behind a permission that existing installs don't have.
  New installs may require new permissions at install time; existing
  enabled installs are grandfathered.

If any fix path appears to require breaking an enabled extension, the
owner **stops and escalates to PM** before shipping (see §5 Escalation).

---

## 1. Audit findings → acceptance criteria

Findings are numbered per the feature brief / audit. Task IDs refer to
the board.

### AF-1 — MCP stdio spawn has no sandbox envelope (highest severity)

Fix tasks: **#14** (dev), **#11 regression #1** (sdet).

**Problem.** `src/mcp/client.ts:67-72` instantiates `StdioClientTransport`
with the extension's `command + args` from the parent web-server process.
No `prlimit`, no bounded env, no envelope. An MCP extension with
`permissions:{}` can run arbitrary binaries and inherit the web server's
full environment including `EZCORP_PERMITTED_HOSTS`, parent env vars, etc.

**Acceptance.**
- MCP stdio spawn goes through an envelope mirroring
  `src/extensions/subprocess.ts` — `prlimit` CPU/memory/FD bounds,
  env restricted to `buildAllowedEnv(manifest, grantedPermissions)`.
- Spawned MCP process has NO `EZCORP_PERMITTED_HOSTS`,
  `EZCORP_SHELL_ALLOWED`, or parent-process env unless explicitly granted.
- Stdin/stdout/stderr streaming still works end-to-end — MCP tool calls
  succeed; protocol unchanged.
- An existing MCP stdio extension that was enabled before this branch
  lands continues to function after. Verified by: start dev server on
  prior-branch DB, migrate, confirm the MCP tool-call round-trip.
- Regression test (task #11) fails on `main`, passes after fix, asserts
  bounded env + prlimit applied to the spawned process.

**Out of bounds.**
- Adding a new `mcp` permission bit that existing installs lack →
  **forbidden** (silent disable).
- Breaking MCP stdio streaming → **forbidden**.
- Changing MCP client protocol or transport contract → **forbidden**.

---

### AF-2 — Bundled-by-name lookup is spoofable

Fix tasks: **#12** (dev), **#11 regression #2** (sdet).

**Problem.** `isBundledExtensionName` (`src/extensions/bundled.ts:170-176`)
is a pure string lookup. Installing a non-bundled extension with
`manifest.name:"ai-kit"` grants it bundled trust — skips integrity
checks, exempt from version re-approval.

**Acceptance.**
- Extensions table has an `isBundled boolean` column set at row creation.
- Bundled seeder sets `isBundled:true`. All other install paths
  (`installFromLocal`, `installFromGitHub`, `installFromGit`) set
  `isBundled:false`.
- `registry.ts:282-298` and every other caller of
  `isBundledExtensionName(manifest.name)` switches to the DB row's
  `isBundled` column. No caller remains that uses the name-lookup
  function for trust decisions. (The name-lookup function itself may
  stay for seeder-internal use, but must not gate trust.)
- **Backfill.** On first boot after the migration, existing bundled
  rows get `isBundled:true` via an idempotent migration step. Existing
  bundled extensions (ai-kit etc.) do NOT lose trust on upgrade. Verify
  by: fresh start against a DB that has the prior-branch bundled
  extensions installed; assert they still bypass integrity checks.
- An install of `manifest.name:"ai-kit"` from `source:"git"` or
  `source:"local"` creates a row with `isBundled:false` and is NOT
  exempt from integrity checks.
- Regression test (task #11 #2) locks this behavior.

---

### AF-3 — Manifest entrypoint traversal + orphaned `validateMcpManifest`

Fix tasks: **#17** (dev), **#11 regression #3** (sdet).

**Problem (A).** `validateManifestV2` in `src/extensions/manifest.ts` does
not validate `entrypoint`. A manifest can declare
`entrypoint:"../../etc/passwd"` or `entrypoint:"/etc/hostname"`.

**Problem (B).** `validateMcpManifest` at `src/extensions/manifest.ts:95`
is orphaned — never called from `loadManifest`. MCP manifests skip the
validation that was written for them.

**Acceptance.**
- Entrypoints containing `..` or starting with `/` are rejected at
  validator level — covers `installFromLocal`,`installFromGitHub`,
  `installFromGit`, `installWithDependencies` by construction
  (mirrors D-2 from prior round).
- `entrypoint:"./index.ts"` and `entrypoint:"index.ts"` still accepted.
- `validateMcpManifest` is called from `loadManifest` for every
  `kind:"mcp"` manifest entering the system.
- Part A's entrypoint check and Part B's validator do not conflict —
  if MCP manifests legitimately omit `entrypoint`, Part A must handle
  an absent entrypoint as valid rather than required.
- Existing MCP manifests (bundled + in `docs/extensions/examples/*`)
  still load with no changes.
- Regression tests (task #11 #3) cover both traversal patterns and
  the accepted form.

---

### AF-4 — Local install DB write missing `JSON.stringify`

Fix task: **#15** (dev, in progress).

**Problem.** `createExtension` in `src/db/queries/extensions.ts` passes
the manifest JS object to Postgres without serializing. Every
`POST /api/extensions {source:"local"}` fails with a Postgres
`[object Object]` param error.

**Acceptance.**
- `manifest` and `grantedPermissions` are JSON-stringified at the
  query layer (preferred) OR the schema switches to Drizzle's `json()`
  column type without breaking existing reads.
- `curl -X POST /api/extensions {source:"local", path:".../auto-note"}`
  as admin → 201, row appears in list.
- Schema change (if used) must be backwards-compatible with prior rows.
- Unit test covers the persistence shape.

---

### AF-5 — Non-admin install/activate returns 500 instead of 403

Fix task: **#8** (dev).

**Problem.** `requireRole(locals, "admin")` throws a `Response`.
SvelteKit POST handlers for `/api/extensions` and `/:id/activate` do
not catch it, so non-admin callers get `500 Internal Error` instead of
the intended 403.

**Acceptance.**
- Preferred fix: change `requireRole` to return `Response | null`,
  mirroring `requireScope`. Handlers `if (res) return res;`.
- Alternative: wrap each handler body in try/catch that re-throws
  `Response` instances. Allowed only if the preferred fix has a
  downstream blocker; PM ack required before taking this path.
- `curl -X POST /api/extensions` as member → **403** with JSON body,
  not 500.
- Admin caller behavior unchanged (201 on success, 4xx on validation,
  etc.). SEC-1 from prior round still holds.
- Audit all other `requireRole` call sites; confirm either the fix
  propagates cleanly or note explicit callers that need individual
  review.

---

### AF-6 — Install errors not surfaced in UI

Fix task: **#2** (dev).

**Problem.** `startInstall()` / `startMcpInstall()` in
`web/src/routes/(app)/extensions/+page.svelte` swallow non-2xx
responses — no toast, no message. Admin retries blindly.

**Acceptance.**
- Any non-2xx from `/api/extensions` (all three sources) yields
  `addToast({type:"error", message: serverErr || "Install failed"})`.
- Same treatment for `startMcpInstall`.
- Manual verification: bad local path → error toast; valid path →
  existing success toast.
- Dialog-based flows are not regressed (SEC-4 still holds).

---

### AF-7 — MCP command not shown in permission-review dialog

Fix task: **#4** (dev).

**Problem.** Permission-review dialog surfaces
`network/filesystem/shell/env` from `manifest.permissions` but not
`mcpServers[].command` + `args` + `transport`. Admin activates an MCP
extension without seeing the binary that will spawn.

**Acceptance.**
- When `manifest.kind === "mcp"` and `mcpServers` is populated, dialog
  renders a read-only "MCP Command" section per server: `transport`,
  `command`, `args[]`. For `http`/`sse` transports: `url`.
- Visually distinct (orange/yellow warning tone) to signal
  command-execution weight.
- `/activate` request body schema unchanged; `grantedPermissions`
  shape unchanged. Display-only.
- E2E test (task #5 reconcile or a new #11-family test) verifies the
  section renders for an MCP extension.

---

### AF-8 — Stale Playwright tests against the pre-dialog PATCH flow

Fix task: **#5** (dev, blocked by #15, #8).

**Problem.** 8 of 45 specs in `web/e2e/extensions.spec.ts` still assert
the old `PATCH {enabled:true}` behavior. The dialog intercepts the
toggle now, so PATCH never fires.

**Acceptance.**
- "Extensions Toggle Round-Trip" and "Auto-disabled Re-enable banner"
  groups updated to expect: dialog open → confirm → POST `/activate`.
- "Extension Detail Page" — either restore the Permissions / shell
  Requested / Sensitive Operations sections if they were accidentally
  dropped, OR update the tests if the page was legitimately simplified.
  Decision documented in §4 D-3.
- All 45 (or revised count) specs green against a live dev server with
  `DOCKER_TEST=1 DOCKER_TEST_URL=http://localhost:3000`.
- FR-4 from prior round still holds (dialog, not PATCH, for enable).

---

### AF-9 — Test coverage gaps

Fix tasks: **#6** (clamp legs), **#7** (GET/DELETE), **#9** (FR-2
no-tarball error rewrite), **#13** (hasSecurityViolation 403).

**Problem.** The prior round landed `network` and `shell` clamp tests
only; three legs are untested. GET + DELETE extension routes have
zero tests. FR-2 error-message rewrite and `/activate`'s
`hasSecurityViolation` 403 guard are both untested.

**Acceptance.**
- **#6** — clamp tests for `filesystem`, `env`, `storage`, `grantedAt`
  passthrough, plus a suffix-attack regression
  (`api.example.com.evil.com` ≠ `api.example.com`).
- **#7** — GET list (role behavior), GET detail (404 path), DELETE
  (admin success, non-admin 403, unknown id 404, verifies both
  `killAll` and `deleteExtension` called via mock spies).
- **#9** — `installFromGitHub` throws "No tarball found" → handler
  rewrites with `source:"git"` suggestion; other error shapes pass
  through unchanged.
- **#13** — `hasSecurityViolation(extId) === true` → `/activate`
  returns 403 with the violation-specific body; no DB update; audit
  entry reflects the rejection (if current code writes one).
- Coverage on scope files reaches: lines ≥ 90%, branches ≥ 80% for
  `installer.ts`, `manifest.ts`, `permissions.ts`,
  `web/src/routes/api/extensions/**` (carried forward from prior
  round — task #10 verifies).

---

### AF-10 — `git` binary missing from `Dockerfile.dev`

Fix task: **#16** (dev).

**Problem.** `installFromGit` fails in dev container with
`Executable not found in $PATH: git`.

**Acceptance.**
- `Dockerfile.dev` installs `git` alongside existing packages.
- `source:"git"` install works in the dev container end-to-end (manual
  verify + covered by `#11` regression suite implicitly).

---

## 2. Non-regression list (must stay green)

These are the invariants that this branch MUST NOT break. `task #10`
is gated on all of these.

### From prior round (ext-install-fix):

- **SEC-1** — `requireRole(locals,"admin")` gates POST `/api/extensions`.
  This round TIGHTENS the error code (500 → 403) but does NOT loosen
  the gate. Non-admin still rejected.
- **SEC-2** — POST body's `permissions` is ignored; first install is
  always `grantedPermissions = { grantedAt: {} }`, `enabled = false`,
  for every source.
- **SEC-3** — `/activate` clamps submitted perms to manifest via
  `clampToManifest()`. All 5 legs (`network`, `filesystem`, `env`,
  `shell`, `storage`) honoured; unknown keys dropped silently. This
  round ADDS test coverage (AF-9 #6) but does NOT change clamp logic.
- **SEC-4** — PATCH `{enabled:true}` returns 400 with the
  "Use POST /:id/activate" error.
- **SEC-5** — manifest `name` regex `/^[a-z0-9][a-z0-9-_.]{0,63}$/`.
  Existing bundled extension names still pass. This round adds
  entrypoint traversal check (AF-3); does NOT touch name regex.
- **SEC-6** — `installFromGitHub` fails loudly on `cp -r` non-zero;
  no silent fallback; no half-installed row.
- **SEC-7** — Runtime enforces `grantedPermissions`. Extension with
  `enabled:true` + empty grants cannot fetch, read files, spawn, or
  read unapproved env. Realpath check rejects traversal through a
  granted prefix. **The 23 tests in
  `src/__tests__/permission-enforcement.test.ts` from commit `a74e196`
  are the non-regression bar for this round.** Task #10 re-runs them.
- **FR-1..6** — GitHub/git/local install paths, permission-review
  dialog, "create your own" link, docs/schema reconciliation. No
  behavior regressions.

### New to this round (must also hold):

- **NR-1** — Enabled MCP stdio extensions work after AF-1 lands with
  the same manifests they had before. (No new permission required.)
- **NR-2** — Existing bundled extensions keep bundled trust after
  AF-2 migration + backfill. (ai-kit, etc.)
- **NR-3** — Existing manifests in `docs/extensions/examples/*` and
  bundled seeds pass AF-3's new entrypoint validation and
  `validateMcpManifest`.
- **NR-4** — Non-admin callers on routes other than `/api/extensions`
  do NOT regress when AF-5 changes `requireRole`'s return shape.
  Audit pass required in the task description of #8.
- **NR-5** — Baseline `scripts/test.sh` on HEAD `07af445`: **5283 pass /
  45 fail across 9 files** (recorded by sdet-2, see
  `tasks/ext-audit-fixes/baseline-test-count.md`). Prior estimate of
  ~180 was wrong. This branch MUST NOT increase the fail count above
  45, and the failing-files list post-merge MUST be a subset of the 9
  listed in the baseline doc. Task #10 re-runs `scripts/test.sh` and
  diffs.

---

## 3. Acceptance checklist (SDET-validatable, rolled up for task #10)

### Security (audit findings):
- [ ] AF-1: MCP stdio spawn runs under envelope — env bounded,
      prlimit applied, existing MCP stdio extensions still connect.
- [ ] AF-2: Non-bundled `manifest.name:"ai-kit"` gets `isBundled:false`;
      existing bundled rows are backfilled to `isBundled:true`.
- [ ] AF-3a: `entrypoint:"../../etc/passwd"` and `"/etc/hostname"`
      rejected. `"./index.ts"` accepted.
- [ ] AF-3b: `validateMcpManifest` is wired into `loadManifest` for
      `kind:"mcp"`.

### Functional / UX:
- [ ] AF-4: `POST /api/extensions {source:"local"}` → 201.
- [ ] AF-5: `POST /api/extensions` as member → 403 JSON body, not 500.
- [ ] AF-5: `POST /api/extensions/:id/activate` as member → 403.
- [ ] AF-6: install-error toast on non-2xx for all three sources.
- [ ] AF-7: permission-review dialog shows MCP command section with
      warning tone when `kind:"mcp"`.
- [ ] AF-8: All `web/e2e/extensions.spec.ts` green against live server.
- [ ] AF-10: `installFromGit` works in `Dockerfile.dev` container.

### Test coverage:
- [ ] AF-9 #6: 5 clamp-leg tests + suffix-attack test.
- [ ] AF-9 #7: GET list, GET detail, DELETE with role + 404 + spy
      assertions.
- [ ] AF-9 #9: FR-2 tarball-missing error rewrite + passthrough.
- [ ] AF-9 #13: `hasSecurityViolation` 403 path.
- [ ] #11: regression suite for AF-1, AF-2, AF-3.
- [ ] All SEC-*/FR-* tests from prior round still green.
- [ ] 23 runtime-enforcement tests from `a74e196` still green.

### Non-regression / infra:
- [ ] No new failures vs baseline `bun test` count.
- [ ] Coverage on scope files ≥ 90% lines / 80% branches.
- [ ] Existing enabled MCP and non-MCP extensions continue working
      against a migrated DB.

---

## 4. Decision log

### D-1 — MCP sandbox: wrap, don't gate

**Question.** AF-1 could be fixed by (a) wrapping the MCP stdio spawn
in the existing extension subprocess envelope, or (b) adding a new
`mcp` permission and gating the spawn on it — requiring admins to
re-approve every existing MCP extension.

**Decision.** (a) — wrap. The manifest already declares the MCP server
at install time; the admin already approved the extension via
`/activate`; no new permission is needed to keep honoring that
approval. Gating would silently disable every currently-enabled MCP
stdio extension on upgrade.

**Consequence.** Task #14's acceptance test verifies that the existing
MCP extension functions after the wrap — not just that the wrap is
in place.

### D-2 — Bundled trust: DB flag, not name lookup

**Question.** AF-2 could add a crypto signature check over bundled
extensions, or a simple `isBundled` boolean column set at seed time.

**Decision.** Boolean column. Signature infrastructure is out of scope
for this round — it's in the checksum-generation UX that was already
punted. The boolean flag closes the specific spoof vector
(name-collision) without requiring a signing pipeline. If a future
threat model escalates to requiring signature, this column becomes
one input to that check, not a replacement to remove.

**Consequence.** Backfill step is mandatory — without it, existing
bundled extensions lose trust on upgrade. Task #12 explicitly calls
this out.

### D-3 — E2E test reconciliation: repair vs. rewrite

**Question.** AF-8 detail-page tests fail because sections (Permissions,
shell Requested, Sensitive Operations) are missing. Were those
sections accidentally dropped, or legitimately removed?

**Decision.** Dev reads the page component first. If the sections are
still meaningful and were accidentally dropped, restore them. If the
page was deliberately simplified and the sections are redundant with
the dialog, update the tests. Decision is dev's call during execution;
flagged to PM only if the judgement is ambiguous. Commit message
reflects direction taken.

**Consequence.** Task #5's commit message may be either
`test(e2e): …` or `fix(ui): restore extension detail sections` + the
test commit, depending on which path is taken.

### D-4 — `requireRole` fix: return-shape vs. handler-wrap

**Question.** AF-5 could change `requireRole` to return `Response|null`
(consistent with `requireScope`) OR wrap each handler in try/catch
that re-throws `Response` instances.

**Decision.** Return-shape. SvelteKit-idiomatic, consistent with the
sibling `requireScope`, single-point fix propagates to every caller.
Task #8 audit pass over other `requireRole` call sites confirms no
regression.

**Consequence.** Any route currently relying on `requireRole` to
throw (i.e., catching it in a `try`) must be updated in the same
commit. Audit is required, not optional.

### D-5 — `storage` clamp test: manifest-absent behavior

**Question.** AF-9 #6: if manifest omits `storage` entirely, should
submitting `{storage:true}` to `/activate` drop it silently (current
clamp behavior) or 400?

**Decision.** Drop silently. Matches SEC-3's existing contract —
"anything outside those sets is dropped silently (no 400 — clamp is
the feature)". Task #6's test locks this.

### D-6 — Escalation criteria (restated from prior round's D-6)

If any fix task discovers that the simplest path would break an
existing enabled extension OR silently loosen an SEC-* invariant,
that is an **immediate PM escalation**, not a scope decision the
task owner makes alone. The escalation is the deliverable. No
paper-over.

This applies specifically to:
- AF-1 if the wrapper approach turns out to require a new permission
  bit that existing manifests lack → STOP, escalate.
- AF-2 if the backfill step can't be made idempotent or safe → STOP,
  escalate.
- AF-3 if existing MCP manifests can't be made to pass the wired
  `validateMcpManifest` without schema changes → STOP, escalate.

---

## 5. Escalation path

Task owner → PM (via SendMessage) → PM re-plans (possibly entering a
plan-mode re-review) → board updated with new tasks/dependencies
before the owner resumes. PM does NOT merge a workaround that
violates §0 or the non-regression list.

---

## 5.1 Known gaps deferred to a follow-up round

- **KG-1 — DELETE + GET extension routes lack admin gate.** Discovered by
  sdet during task #7 (commit 294d764). SEC-1 from the prior round
  scoped the admin gate to POST only; DELETE and GET are protected by
  `requireAuth` + `requireScope("extensions")` but not `requireRole`.
  A non-admin cookie member (or an `extensions`-scoped API key without
  admin role) can list and delete. Tracked as task #18. **Does not
  block sign-off** — pre-existing gap, not a regression from this
  round, and fixing it cleanly depends on D-4's `requireRole` return-
  shape change landing in task #8 first. PM surfaces this in the
  task #3 sign-off so the orchestrator can prioritize the follow-up.

---

## 6. Out of scope (same as prior round + carry-forward)

- Marketplace browse/publish.
- Extension checksum / signature generation UX (AF-2 resolves the
  spoof with a DB flag; signature is deferred).
- Dependency resolution UX beyond what #11 tests touch.
- Migrating `enabled:true, grantedPerms:{}` rows in prod — ops task.
- Expanding sandbox envelope beyond MCP stdio (sse/http transports
  don't spawn, so AF-1 doesn't apply; any future fix for
  http/sse transport-level trust is a separate round).
