# Extension Install Fix — Requirements & Acceptance Criteria

Feature owner: PM (team `ext-install-fix`)
Stack: Bun + SvelteKit + PGlite. Tests: `bun test` + Playwright (`web/e2e/`).
Scope: the install-from-GitHub flow, the enable/activate flow, and the runtime
sandbox invariants that guard both. Out of scope: marketplace, MCP-server
install (covered elsewhere), checksum generation UX.

---

## 1. Functional Requirements

### FR-1 — Install from GitHub release
- `POST /api/extensions` with `{ source: "github", repo: "owner/repo"[`@tag`] }`
  downloads the release tarball, finds `ezcorp.config.ts`, validates the
  manifest, copies the package to `data/extensions/<name>/`, and creates a
  disabled DB row with empty `grantedPermissions`.
- If the release has no tarball asset the server falls back to GitHub's
  `tarball_url`. If neither exists → 400 with a descriptive error.
- If the install-dir copy (`cp -r`) fails, the install fails loudly (no
  silent fallback, no half-installed row).

### FR-2 — Install from git clone (new)
- `POST /api/extensions` accepts a new `source: "git"` variant:
  `{ source: "git", url: string, ref?: string }`.
- `url` must be `http(s)://` or a well-formed `git+ssh://` / `git@host:...`
  URL. Reject `file://`, strings starting with `-`, and empty strings.
- Routes to `installFromGit(url, emptyPerms, { enabled: false })`.
- The UI exposes a third tab ("Git URL") alongside "Local Path" and
  "GitHub".
- No automatic fallback from `source:"github"` to `source:"git"` — the
  GitHub-release error message is updated to *suggest* trying `source:"git"`.

### FR-3 — Install from local path (unchanged)
- `POST /api/extensions` with `{ source: "local", path }` still works. Admin
  role still required. Empty perms, disabled on first install.

### FR-4 — Permission-review dialog before enabling
- In `web/src/routes/(app)/extensions/+page.svelte`, the enable toggle (line
  ~198-210 today) no longer calls `PATCH /api/extensions/:id` with
  `{enabled:true}`.
- On enable-intent: open a dialog showing every manifest-declared permission
  (`network[]`, `filesystem[]`, `shell`, `env[]`, `storage`, `lifecycleHooks`)
  with individual checkboxes. `shell:true` must render with a prominent
  red warning.
- "Enable with selected permissions" → `POST /api/extensions/:id/activate`
  with `{ grantedPermissions: <user-selected subset> }`, then reload the list
  and toast success.
- "Cancel" closes the dialog without any network call; extension stays
  disabled.
- Disable-intent (toggle off on an enabled extension) still uses
  `PATCH /api/extensions/:id` with `{enabled:false}`.

### FR-5 — "Create your own" link
- The "Create your own →" link currently points to a personal dotfiles URL.
  It must point to the repo-local `docs/extensions/getting-started.md` —
  either via a static `/docs/...` route or an existing docs-serving API.

### FR-6 — Docs / schema reconciliation
- `docs/extensions/manifest-schema.md` lists `mcpServers[].transport` as
  `"stdio" | "sse"`, but the validator at `src/extensions/manifest.ts:46`
  accepts `stdio | http | sse`. Docs must match the code.
- `docs/extensions/api-reference.md` and `docs/extensions/getting-started.md`
  must document the new `source: "git"` install option with request body
  shape and a cURL example.
- `web/src/routes/api/extensions/+server.ts:33-35` has a stale TODO
  ("separate admin-confirm endpoint (TODO)"). The `/activate` endpoint
  now exists; replace with a one-liner describing the current invariant.

---

## 2. Security Invariants (must hold)

### SEC-1 — Admin gate on POST /api/extensions
`requireRole(locals, "admin")` gates POST. A plain-authenticated user or an
API key with `read`/`write` scope but no admin role must be rejected with
403 before any installer runs. (Regression of sec-C3.)

### SEC-2 — No caller-controlled permissions on install
The POST body's `permissions` field is ignored by the server. First install
is always `grantedPermissions = { grantedAt: {} }` and `enabled = false`,
for every source (`local`, `github`, `git`). (Regression of sec-C3.)

### SEC-3 — Permissions clamped to manifest on /activate
`POST /api/extensions/:id/activate` runs submitted perms through
`clampToManifest()` before persisting:
- `network`, `filesystem`, `env` entries are filtered to only what the
  manifest declared.
- `shell:true` is only honoured if manifest declares `shell:true`.
- `storage:true` only if manifest declares `storage:true`.
- Anything outside those sets is dropped silently (no 400 — clamp is the
  feature).

### SEC-4 — No enable-bypass via PATCH
`PATCH /api/extensions/:id` with `{enabled:true}` returns **400** with
`{ error: "Use POST /:id/activate to enable an extension" }`. `enabled:false`
via PATCH continues to work. This closes a back-door around the
permission-review flow.

### SEC-5 — Path-traversal in manifest name
Manifest `name` is used as a directory segment (`data/extensions/<name>/`).
Validation must reject:
- any `name` containing `/`, `\`, or `..`
- any `name` starting with `.` or `-`
- absolute paths
- empty string
Recommended allowlist: `/^[a-z0-9][a-z0-9-_.]{0,63}$/` (but must not reject
names that existing bundled extensions rely on — verify against
`src/extensions/bundled.ts` and `docs/extensions/examples/*`).
Enforcement at validator level so every install path (`installFromLocal`,
`installFromGitHub`, `installFromGit`) is covered by construction.

### SEC-6 — Install-dir copy failures fail loudly
`installFromGitHub`'s current silent-fallback (`src/extensions/installer.ts:
133-135`) is removed. On `cp -r` non-zero exit, throw with source, dest, and
captured stderr; temp dir is still cleaned up; no DB row is created.

### SEC-7 — Runtime actually enforces `grantedPermissions`
An extension with `enabled:true` and empty `grantedPermissions` MUST NOT be
able to:
- open outbound network connections (fetch / TCP)
- read arbitrary files (`/etc/passwd`, etc.)
- spawn subprocesses (`Bun.spawn`, `exec`)
- read host env vars that aren't in the allowlist
Path-traversal through a granted filesystem prefix (e.g. `/granted/../etc`)
must be rejected by the realpath-based check in
`src/extensions/permissions.ts:checkFilesystemPermission`.

> If the SDET discovers the runtime does NOT enforce this, that is an
> escalation to the orchestrator, not a paper-over. See SDET task #11.

---

## 3. Acceptance Checklist (SDET-validatable)

Functional:
- [ ] `POST /api/extensions {source:"local", path}` → 201 (admin), 403 (non-admin).
- [ ] `POST /api/extensions {source:"github", repo}` → 201; caller-supplied
      `permissions` in body is ignored.
- [ ] `POST /api/extensions {source:"git", url, ref?}` → 201 with valid url;
      400 with `file://`, empty, or flag-like url.
- [ ] `POST /api/extensions {source:"github", repo}` where release has no
      tarball → 400 with "No tarball found".
- [ ] `POST /api/extensions {source:"github", repo}` where `cp -r` fails →
      400 with descriptive error; no DB row.
- [ ] UI "GitHub" install works end-to-end against a mocked tarball.
- [ ] UI "Git URL" tab is present and installs via `source:"git"`.
- [ ] "Create your own →" link resolves to an in-repo docs target.
- [ ] UI enable toggle opens permission-review dialog, not a direct PATCH.
- [ ] Dialog renders all manifest perms, including red warning for `shell`.
- [ ] Approving dialog calls `POST /:id/activate` with the exact checked
      subset; cancel calls nothing.
- [ ] After approval, extension list shows enabled state; no "Security Issue"
      badge.
- [ ] Disable via toggle still calls PATCH with `{enabled:false}`.

Security:
- [ ] PATCH with `{enabled:true}` returns 400 with the "Use POST /:id/activate"
      error.
- [ ] `/activate` clamps submitted perms to manifest (test: submit
      `{shell:true}` where manifest says `shell:false` → granted perms omit
      shell).
- [ ] `/activate` with unknown id → 404; non-admin → 403; audit entry
      `extension:confirmed` written on success.
- [ ] Manifest names `"../escape"`, `"/absolute"`, `"foo/bar"`, `".."`,
      `""` are rejected at validation; existing bundled extensions still load.
- [ ] Runtime: extension with empty grantedPerms cannot fetch, read files,
      spawn, or read unapproved env vars.
- [ ] Runtime: filesystem traversal through a granted prefix is rejected
      (realpath check).

Docs / cleanup:
- [ ] `manifest-schema.md` lists `stdio|http|sse` for transports.
- [ ] `api-reference.md` and `getting-started.md` document `source:"git"`.
- [ ] No stale TODO at `web/src/routes/api/extensions/+server.ts:33-35`.

Coverage:
- [ ] No *new* failures in `bun test` (root) attributable to this branch.
      Baseline main has ~180 pre-existing failures (ToolExecutor, hybridSearch,
      observability-collector syntax error) that are out of scope — SDET must
      run the suite on main first and diff, then confirm our commits add
      zero new failures.
- [ ] `bun run test:e2e` (web) all green for the extensions spec(s) we
      touch; pre-existing e2e failures outside extensions scope are noted
      but not blockers.
- [ ] Lines ≥ 90%, branches ≥ 80% on:
      `src/extensions/installer.ts`,
      `src/extensions/manifest.ts`,
      `src/extensions/permissions.ts`,
      `web/src/routes/api/extensions/**`.
- [ ] New test files added in this branch all pass in isolation:
      `src/__tests__/permission-enforcement.test.ts` (done, 23/23),
      `src/__tests__/installer.test.ts` (T4),
      `web/src/routes/api/extensions/__tests__/extensions-api.test.ts` (T1),
      `web/e2e/extensions.spec.ts` (T5 additions).

---

## 4. Decision Log

### D-1 — PATCH `{enabled:true}` is forbidden *unconditionally*, not conditionally
**Question:** should PATCH forbid `enabled:true` always, or only when
`grantedPermissions` is empty and the manifest declares any permissions?

**Decision:** forbid unconditionally. The UI goes through `/activate`, and
`/activate` works for the "no-perms manifest" case too (`grantedPermissions`
can be omitted; enable flips without touching perms). A conditional rule
adds branching that's easy to get subtly wrong and hard to audit.

**Consequence:** any programmatic re-enable (e.g. after a security-violation
clear flow) must hit `/activate`. Note: `resetFailures()` is still called
from PATCH when `enabled` transitions; we need to decide whether re-enable-
after-auto-disable goes through PATCH or `/activate`. Ruling: through
`/activate` for uniformity. If that turns out to require admin re-approval
every time an extension auto-disables, we'll revisit.

### D-2 — Path-traversal check lives in the manifest validator, not the installer
**Question:** add the safety check in `installer.ts` before `join`, or in
the manifest `name` validator?

**Decision:** validator. Fails earliest, covers every install path
(`installFromLocal`, `installFromGitHub`, `installFromGit`,
`installWithDependencies`) by construction, and keeps the installer code
free of defence-in-depth sprinkle. Regex: `/^[a-z0-9][a-z0-9-_.]{0,63}$/`.

**Consequence:** dev must verify existing bundled manifests still pass.

### D-3 — No auto-fallback from `source:"github"` to `source:"git"`
**Question:** if a user picks "GitHub" but the repo has no release, should
we silently try `installFromGit`?

**Decision:** no. Keep the two sources distinct. The GitHub-release path
verifies release tarball checksums; the git path doesn't. Silently falling
back would downgrade the trust level without the user's awareness.

**Consequence:** error message for "no release found" is updated to
suggest: *"This repo has no GitHub releases. Try the 'Git URL' tab to
install from a git clone instead."*

### D-4 — Dialog: default-checked vs. default-unchecked
**Question:** does the permission-review dialog open with all boxes checked
(opt-out) or all unchecked (opt-in)?

**Decision:** all checked by default. Rationale: the extension manifest is
effectively the developer's permission *request*; the dialog's job is to
let the admin *deny* anything they don't need. Default-unchecked would
cause usability friction (admin must check a list of N items to make the
extension functional) and invite rubber-stamping. `shell:true` still gets
visual red warning regardless of default state.

**Consequence:** if a future attack surface emerges around rubber-stamping,
revisit and consider a shell-unchecked-by-default split.

### D-5 — Git URL validation strictness
**Question:** how tightly do we validate `url` in `source:"git"`?

**Decision:** allow `http(s)://`, `git+ssh://`, and `git@host:owner/repo`;
reject empty strings, anything starting with `-`, and `file://`. Rely on
`git` itself for deeper validation, but protect against obvious
command-injection primitives (leading `-`) before spawning.

### D-6 — Runtime escalation
If task #11 reveals the runtime sandbox does not actually enforce permissions
(e.g. an `enabled:true, grantedPerms:{}` extension can fetch arbitrary URLs),
that is immediately escalated to the orchestrator. The team does NOT paper
over this by loosening the test, by marking it "expected", or by scoping it
out. The escalation is the deliverable in that branch.

---

## 5. Out of Scope (don't get distracted)
- MCP server install flow (`/api/mcp-servers`) — separate team.
- Marketplace browse/publish.
- Extension checksum generation UX.
- Dependency resolution UX (covered partially in T4 unit tests only).
- Migrating existing `enabled:true, grantedPerms:{}` rows in prod (ops task).
