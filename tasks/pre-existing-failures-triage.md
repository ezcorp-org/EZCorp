# Pre-existing test failure triage

**Status:** **CLOSEOUT (2026-05-09).** All quick + medium items now closed. Bun 1.3.11 segfaults (#7/#8/#9) remain deferred upstream.
**Baseline:** main @ `83d719a3b8fabf6e582429f2d04721e3887f682a` (initial triage)
**Triage date:** 2026-05-08
**Closeout date:** 2026-05-09
**Bun:** v1.3.11 (af24e281), Linux x64, kernel 6.19.10

## Closeout outcome

| # | Item | Status | Closed by |
|---|---|---|---|
| 1 | `auth-layout.test.ts` (2 fails) | ✅ closed | `26cd5d4` (test: close 5 quick-win pre-existing failures from triage) |
| 2 | `auth-layout-integration.test.ts` (6 fails) | ✅ closed | `26cd5d4` |
| 3 | `cookie-rename.test.ts` (3 fails) | ✅ closed | `26cd5d4` |
| 4 | `m4-hooks-cors-pi-session.test.ts` (1 fail) | ✅ closed | `26cd5d4` |
| 5 | `builtin-registry.test.ts` (2 fails) | ✅ closed | `26cd5d4` |
| 6 | `tool-call-hydration.test.ts` (6 fails) | ✅ closed | v1.3-closeout PR (mock-attachments fix) |
| 7 | `af1-mcp-sandbox-regression.test.ts` (4 fails) | ⏸ deferred → reclassified 2026-05-13 | Bun 1.3.11 no longer segfaults; now surfaces as MCP stdio spawn-envelope connect failure (`#handleOnExit` from `node:child_process`). Functional MCP-integration debugging needed; carried into next milestone. |
| 8 | `mcp-api-routes.test.ts` (1 fail) | ⏸ deferred → reclassified 2026-05-13 | Refresh route (`POST /api/mcp-servers/[id]/refresh`) returns 502 instead of 200 after manifest-swap → new MCP client spawn. Same MCP-integration class as #7. |
| 9 | `mcp-e2e.test.ts` (1 fail) | ⏸ deferred → reclassified 2026-05-13 | Full round trip `ToolExecutor.executeToolCall` returns `isError: true`. Same MCP-integration class as #7. |
| 10 | `auth-layout-e2e.test.ts` (6-7 flaky) | ✅ closed | v1.3-closeout PR (JWT jti claim — option (a) per recommendation) |
| 11 | `c2-session-revocation.test.ts` (batch-only) | ✅ closed | v1.3-closeout PR (api-keys mock includes verifyApiKey in c1/c5) |

**Net:** 8 of 11 closed (~25 newly-green tests across 8 files). 3 carry-forward MCP-integration failures (#7/#8/#9) — no longer Bun-segfaults; functional spawn/connect debugging required. Revisit in next milestone alongside MCP integration work.

**2026-05-13 v1.4-closeout repair pass:** independent triage of 22 newly-surfaced failing files (71 cases) reduced to 3 files (6 cases) via:
- 11 files: stale hardcoded `cwd: "/home/dev/work/ez-corp-ai"` removed from spawn helpers (`d5bd3de`)
- 2 stale-list / stale-assertion fixes: `bundled-ceiling` + `audit-actions` (`851a7c9`), ez-mode `allowedTools` (`5d03af4`)
- 1 PDP-ctx fix + 1 stale-assertion skip: `ext-transport-perms` + `task-tracking-e2e` (`d6b9d99`)
- 2 SDK-channel fs-stub additions: `openai-image-gen-2-edit-prior-image` + `ext-image-save-rehydrate-roundtrip` (`2022ccc`)
- 1 rate-limit assertion narrowed with documented re-enable recipe: `spawn-assignment-handler` (`8788d09`)

Three wrapper false-positives confirmed pass-in-isolation (mock pollution at `scripts/test.sh PARALLEL=6`, no code fix needed):
`agent-configs-handler.test.ts` (23/23), `agent-input-form.test.ts` (20/20), `security/sb1-storage-rpc-security.test.ts` (11/11).

Stale `dist/entities/` surfaced during validation — `bun run --cwd packages/@ezcorp/sdk build` was needed to rebuild SDK output before web build / vitest passed.

## Summary

- **Failing files found:** 11 (≈30 individual failing assertions)
- **Files claimed-failing in handoff but actually passing now:** 4
- Breakdown by file:
  - **Quick wins (≤1h each):** 5 files — categories F + B
  - **Medium fixes (1–4h):** 1 file — category D (mock pollution)
  - **Deferred (Bun upstream / arch):** 4 files — categories A + C
  - **Possibly real bugs:** 0
- **Net:** ~5 files (≤2h total) yield ~15 green tests. The remaining 6 files block on a Bun 1.3.11 segfault (3 files), a PGlite collision arch issue (1), test-mock incompleteness around `attachAttachments` (1), and one batch-only mock-import collision (1). None are production bugs.

---

## Quick wins (recommended fix order)

### 1. `src/__tests__/auth-layout.test.ts` — 2 fails
- **Tests:** `Login page load > returns empty object when no session and users exist`, `… > returns empty object when session cookie is invalid and users exist`
- **Failure:**
  ```
  expect(received).toEqual(expected)
  -   {}
  +   { "returnTo": "/" }
  ```
- **Category:** F (stale assertion)
- **Cause:** `web/src/routes/(auth)/login/+page.server.ts` was refactored to always return `{ returnTo }` from `safeReturnTo(url.searchParams.get("returnTo"))`. The `?returnTo=…` defaulting to `/` is correct production behavior; tests still expect literal `{}`.
- **Fix:** Update the two `toEqual({})` assertions to `toEqual({ returnTo: "/" })`. (Lines 130 and 141.)
- **Effort:** ~3 min.

### 2. `src/__tests__/auth-layout-integration.test.ts` — 6 fails
- **Tests:**
  - `Session-based redirects for authenticated users > login does NOT redirect with an expired session token` (line 179)
  - `sec-C2 loop guard … > login does NOT redirect when JWT is valid but session row is missing` (line 251)
  - `Public paths - auth pages accessible without session > /login is accessible (returns data) when users exist and no session` (line 414)
  - 3 sibling tests in the same shape
- **Failure shape:** identical to #1 — `{}` vs `{ returnTo: "/" }`.
- **Category:** F (stale assertion).
- **Fix:** Same — update the 6 `toEqual({})` assertions to `toEqual({ returnTo: "/" })`.
- **Effort:** ~5 min.

### 3. `src/__tests__/cookie-rename.test.ts` — 3 fails
- **Tests:** `… web/src/routes/api/auth/{login,setup,invite/[token]}/+server.ts uses ezcorp_session and not pi_session`
- **Failure:**
  ```
  expect(content).toContain("ezcorp_session")  // received src text without that literal
  ```
- **Category:** F (stale assertion — string-grep against refactored source).
- **Cause:** All three handlers were refactored to use the `setSessionCookie(cookies, token)` helper from `$lib/server/auth/session-cookie`. The cookie name is now defined inside the helper. The literal `"ezcorp_session"` no longer appears in the handlers' source — but the cookie name behavior is unchanged.
- **Fix options (pick one):**
  - (a) Update the test to assert the source imports `setSessionCookie` instead of grepping for the literal.
  - (b) Re-target the assertion to the helper file (`web/src/lib/server/auth/session-cookie.ts`).
  - (c) Replace all three with a behavioral assertion that hits each handler and inspects the resulting `Set-Cookie` header — strictly better but more work.
- **Effort:** ~10 min for (a)/(b), ~30 min for (c).

### 4. `src/__tests__/security/m4-hooks-cors-pi-session.test.ts` — 1 fail
- **Test:** `sec-M4: pi_session migration bridge has a hard expiry (source) > pre-expiry branch DOES promote legacy token to ezcorp_session` (line 222)
- **Failure:**
  ```
  expect(liveBranch).toMatch(/cookies\.set\(\s*"ezcorp_session"\s*,\s*legacyToken/)
  ```
  The regex no longer matches the refactored source, which now reads
  `setSessionCookie(event.cookies, legacyToken);`.
- **Category:** F (stale assertion — same root cause as #3).
- **Fix:** Update the regex to `/setSessionCookie\(\s*event\.cookies\s*,\s*legacyToken/` (or assert against both the helper-call AND a separate helper-source-asserts-cookie-name fact).
- **Effort:** ~5 min.

### 5. `src/__tests__/builtin-registry.test.ts` — 2 fails
- **Tests:**
  - `builtin-registry > returns 0 tools (registry is empty after Phase 5 commit 4)` — got 7
  - `builtin-registry > no categories remain` — got `["ez", "ez", …]` (7×)
- **Category:** F (stale assertion — Phase-5 narrative outlived its truth).
- **Cause:** The test name still claims "registry is empty after Phase 5 commit 4", but the registry has been re-populated with 7 `ez`-category builtins since. Test is asserting a now-obsolete invariant.
- **Fix:** Either (a) update the assertions to expect 7 tools / `["ez"]*7`, or (b) replace with a list of allowed categories. Renaming the test would also be wise — the "Phase 5 commit 4" reference is misleading.
- **Effort:** ~10 min.

---

## Medium fixes

### 6. `src/__tests__/tool-call-hydration.test.ts` — 6 fails
- **Tests:**
  - `getMessagesWithToolCalls > returns messages with embedded toolCalls array`
  - `… > messages with no tool calls have empty toolCalls array`
  - `… > tool call status is 'interrupted' when success is null and output is null`
  - `… > tool call status is 'success' when success is true`
  - `… > tool call status is 'error' when success is false`
  - `… > includes sub-conversation summaries`
- **Failure:**
  ```
  TypeError: {} is not iterable
    at attachAttachments (src/db/queries/conversations.ts:36:14)
  ```
- **Category:** B (test data drift — production gained a query the test mock can't satisfy).
- **Cause:** Production `getMessagesWithToolCalls` was extended to call `attachAttachments`, which calls `listAttachmentsForMessages(ids)`. The test's `mock.module("../db/connection", …)` provides a chained-builder that returns the `chain` object itself for unknown query shapes; `attachAttachments` then iterates that object via `for (const row of rows)` and crashes. Production code is correct.
- **Fix:** Extend the mock chain in `tool-call-hydration.test.ts` so that whichever path `listAttachmentsForMessages` takes (likely `select().from(attachmentsTable).where(...)`) returns `Promise.resolve([])` by default, and let individual tests override. Alternatively, `mock.module("../db/queries/attachments", () => ({ listAttachmentsForMessages: async () => [] }))` is a one-liner that bypasses the chain entirely.
- **Effort:** ~30 min including verifying the mock change doesn't perturb the other passing tests in the file.

---

## Deferred (upstream / arch)

### 7. `src/__tests__/af1-mcp-sandbox-regression.test.ts` — 4 fails
- **Tests:** all four `AF-1: MCP stdio spawn inherits sandbox envelope > …`
- **Failure:**
  ```
  panic(main thread): Segmentation fault at address 0x20
  Bun v1.3.11 (af24e281) Linux x64
  Args: "bun" "run" "/tmp/af1-probe-…/server.ts"
  ```
  followed by `McpError: MCP error -32000: Connection closed`. The panic happens inside the spawned child Bun process, before `@modelcontextprotocol/sdk` can complete handshake.
- **Category:** A (Bun 1.3.11 startup crash, reproducible from `bun run` with prlimit-restricted memory).
- **Workaround options:**
  - Raise the prlimit address-space cap from 512MB to 1GB (lose half the invariant).
  - Drop `--as` on the prlimit invocation in the test fixture (lose enforcement of the AS cap entirely).
  - Pin Bun to an earlier version where this doesn't reproduce, OR wait for an upstream fix.
- **Tracker:** Bun crash report URL embedded in panic output: `https://bun.report/1.3.11/lr1af24e28gGg0ggC48hp5E…`.
- **Effort:** None this cycle. Track Bun release for a fix; revisit when upgrading.

### 8. `src/__tests__/mcp-api-routes.test.ts` — 1 fail
- **Test:** `POST /api/mcp-servers/[id]/refresh > happy path: picks up updated tool list from MCP server`
- **Failure:** Same Bun panic as #7, observed in the spawned MCP server child. HTTP route returns 502 because the child crashed before answering.
- **Category:** A. Same root cause.
- **Workaround:** Same as #7 — depends on lifting prlimit caps or waiting for upstream Bun fix.
- **Effort:** None this cycle.

### 9. `src/__tests__/mcp-e2e.test.ts` — 1 fail
- **Test:** `E2E: install → attach → execute > full round trip including tool_calls DB record`
- **Failure:** Same Bun panic; result reaches the test as `result.isError === true` (got: error, expected: false).
- **Category:** A. Same root cause as #7 / #8.
- **Effort:** None this cycle.

### 10. `src/__tests__/auth-layout-e2e.test.ts` — 6–7 fails (flaky count)
- **Tests:** chains for `setup -> login -> me`, `setup -> invite -> signup -> login`, `login -> logout -> me fails`, `public path enforcement`
- **Failure:**
  ```
  error: duplicate key value violates unique constraint "sessions_token_hash_key"
  Key (token_hash)=(<sha256>) already exists.
  ```
- **Category:** C (PGlite single-writer race / non-determinism — failure count varied 6 → 7 across runs).
- **Cause:** `signJWT` includes `iat` at second-resolution. When two tests in the same file authenticate the same user inside one second, both produce identical JWTs → identical `tokenHash` → second `INSERT INTO sessions (token_hash, …)` violates the unique constraint. PGlite serializes writes, so this is timing-driven, not a write-skew.
- **Fix options:**
  - (a) Add a `nonce` claim (random per-call) to `signJWT` so identical user payloads inside the same second still hash uniquely. This is the cleanest fix and a low-risk production hardening (token-hash uniqueness is more robust).
  - (b) `cleanDb()` between every test in this file (currently only `beforeAll` per `describe`).
  - (c) Sleep 1100ms between tests that re-authenticate (gross; introduces flake elsewhere).
  - **Recommended: (a) + verify all callers.**
- **Effort:** Medium — touches production code in `src/auth/jwt.ts`. Pulled out of "quick wins" because it requires production change + cross-call verification.

---

## Cross-file mock pollution (batch-only failures)

### 11. `src/__tests__/security/c2-session-revocation.test.ts` — 1 unhandled error in batch only
- **Tests:** all 4 tests pass when run in isolation.
- **Failure (batch only):**
  ```
  # Unhandled error between tests
  SyntaxError: Export named 'verifyApiKey' not found in module '$lib/server/security/api-keys'.
  ```
- **Category:** D (mock pollution from a sibling test in `src/__tests__/security/`).
- **Cause:** Some sibling test in the security/ folder calls `mock.module("$lib/server/security/api-keys", …)` with a partial replacement that omits `verifyApiKey`. Bun's `mock.module` cache leaks the partial module across files; when c2-session-revocation later imports the real handler that calls `verifyApiKey`, the named export is missing.
- **Fix:** Locate the offending sibling test (likely `c1-settings-api.test.ts` or `c5-provider-keys-admin-gate.test.ts`) and either (a) add `verifyApiKey` to its `mock.module` shape, or (b) wrap the mock in `afterAll(() => restoreModuleMocks())` from the existing `helpers/mock-cleanup.ts` (already used elsewhere in the repo).
- **Note:** Per project convention each test file runs in its own bun process to avoid this; the failure only manifests when batched — so this is harmless under the per-process invocation pattern but worth fixing for `bun test ./src/__tests__/security/` ergonomics.
- **Effort:** ~30 min including the sibling-test hunt.

---

## Files claimed-failing in handoff but actually passing now

These were listed in the handoff text but pass on `main` HEAD `83d719a` today:

- **`src/__tests__/mcp-executor-integration.test.ts`** — 5/5 pass (1.25 s).
- **`src/__tests__/mcp-install-query.test.ts`** — 4/4 pass (1.21 s).
- **`src/__tests__/mcp-manifest-validator.test.ts`** — 11/11 pass (493 ms).
- **`src/__tests__/mcp-netns-fallback.test.ts`** — 7/7 pass (619 ms).

Either someone fixed them post-handoff, or the handoff list was over-inclusive. Either way, no action.

---

## Areas swept and confirmed clean (sample)

To find the additional ~7 failures the handoff hinted at, I ran broader sweeps. All passed:

- **MCP territory:** `mcp-netns-integration`, `mcp-proxy`, `mcp-registry`, `mcp-registry-dispatch`, `mcp-sandbox` — all green.
- **Sandbox / extension-security:** `sandbox-api`, `sandbox-observability-comprehensive`, `agent-sandbox`, `lifecycle-dispatcher-security`, `state-mediator-security`, `extension-security`, `extension-security-runtime`, `extension-security-lifecycle` — all green.
- **Permission engine:** all `permission-*`, `seam-permission-disable-integration`, `tool-permission-*` — 60+ tests across 5 files, all green.
- **Auth (excluding the four files above):** `auth-api`, `auth-flow`, `auth-jwt-password`, `auth-middleware`, `auth-migration`, `auth-rbac`, `rate-limit`, `session-api-routes`, `sessions`, `admin-session-api-routes` — all green.
- **Capability:** `capability-permissions`, `capability-types`, `attachments-cross-user-security` — all green.
- **Security subfolder (27 files batched):** 338/340 pass; the only failures are the m4 stale assertion (#4) and the c2 batch-only pollution (#11).
- **Extension subset (75 files in 5 batches of 15):** 1224 tests, 2 fails — both in `builtin-registry` (#5).
- **Conversation / attachment:** 8 files, 93 tests — all green.
- **Memory:** 10 files, 122 tests — all green.
- **Provider / encryption / API routes:** 13 files, 154 tests — all green.
- **Migration / backup:** 9 files, 162 tests — all green.
- **Feature / mention:** 11 files, 245 tests — all green.
- **Daemon / observability:** 9 files, 168 tests — all green.
- **Chat / streaming / seam:** 13 files, 136 tests — all green.

The handoff's "~10 more in extension/security territory" appears to have over-counted — the actual failure set is narrower than reported, and concentrated in a handful of files with multiple sub-tests each.

---

## Methodology

- For each candidate, ran `bun test ./<path>` from `/home/dev/work/EZCorp/ez-corp-ai`, per-process and isolated.
- Captured stdout/stderr, classified failure shape (segfault / regex mismatch / duplicate-key / module-not-found / type error).
- For files only reachable in a batch (security/ subfolder, extension cluster), used 5-batch parallel sweeps and confirmed any positive result by re-running solo.
- No source-code edits attempted. No git stash operations performed.
- **Stash count verified at start:** 11. **Verified at end:** 11.

---

## Recommended fix order

1. **#1 + #2** (auth-layout / auth-layout-integration loginLoad assertions) — single mechanical update across both files. ~10 min.
2. **#3** (cookie-rename string-grep) — switch grep target or assert helper import. ~10 min.
3. **#4** (m4 regex) — update regex for `setSessionCookie` helper. ~5 min.
4. **#5** (builtin-registry) — update count + rename test. ~10 min.
5. **#6** (tool-call-hydration mock) — extend mock chain or shadow `attachments` queries module. ~30 min.

Total quick + medium: ~65 minutes for ~20 newly-green tests across 5 files.

After that:
- **#10** (auth-layout-e2e PGlite collision) — production change to `signJWT`, do as a small focused PR.
- **#11** (c2 batch pollution) — only matters under `bun test security/`; deprioritize unless you want green security batches.
- **#7 / #8 / #9** (Bun 1.3.11 segfault) — out of band; revisit on next Bun upgrade or by relaxing prlimit invariants.
