# Phase 2 — Remaining Work

Self-contained pickup doc. Anyone (fresh Claude session, human dev, or new team) should be able to execute from this file alone.

**Plan source:** `/home/dev/.claude/plans/floating-dancing-cookie.md` (Phase 2 section).
**Last HEAD:** `73797e2` (verify with `git log --oneline -3`).
**Repo:** `/home/dev/work/ez-corp-ai` on `main` branch (unpushed; do not push).

---

## 1. Where we are

| Sub-phase | Status |
|---|---|
| **2.1 Coverage infra** (Block D) | DONE — Gate #2 passed. `scripts/test-coverage.sh` + `merge-lcov.ts` + `check-coverage.ts` + `coverage-thresholds.json` shipped. |
| **2.2 5 runtime wrappers** (Block A) | DONE — Gate #5 passed. http/invoke/panel/lifecycle/storage shipped at 100% line coverage isolated. |
| **2.3 3 example refactors + integration/E2E** (Block B) | DONE — Gate #19 passed. task-stack/todo-tracker/github-stats migrated onto `@ezcorp/sdk/runtime`. |
| **2.4 TS cleanup + host coverage + 8-file resolution + GATE** (Blocks C+E+F+#14) | **IN FLIGHT** — #16 ~60% done. #20, #17, #14 not started. |

**Current `bun run test` baseline:** 4936 pass / 34 fail / 305 files. The 34 fails are the locked 8-file pre-existing set (see §3).
**Current `bun x tsc --noEmit -p tsconfig.json` (non-web):** ~166 error-lines remaining.

---

## 2. Remaining tasks (concrete punch list)

### Task #16 — DEV TS diagnostic cleanup (in progress, ~60% done)

**Goal:** Drive `bun x tsc --noEmit -p tsconfig.json` non-web error count to zero (or as low as practical with documented deferrals).

**Approach:** per-file atomic commits. ≤5-file cascade per commit (typically 1 file). One descriptive subject (e.g. `fix(test/<name>): <pattern>`). No verbatim body language required for #16.

**Recommended next-file order (small wins first; biggest last):**
1. `src/__tests__/ts-manifest-e2e.test.ts` (~3 errors) — next up per dev-rot-13 handoff
2. Other 2-7-error files (see `bun x tsc --noEmit -p tsconfig.json 2>&1 | grep "error TS" | cut -d: -f1 | sort | uniq -c | sort -rn`)
3. `src/__tests__/task-tracking.test.ts` (~112 errors — biggest single file; **do this with a fresh-context dev so the whole file lands in one rotation**)

**Pattern library (from prior rotations — reuse these):**
- `at<T>(arr: T[] | undefined, i: number): T` — array-index narrowing helper. Throws on missing.
- `need<T>(v: T | undefined, what: string): T` — non-array `T | undefined` narrowing helper.
- `textOf(content): string` — narrows JSON-RPC `TextContent | ImageContent` to text.
- **Pattern A:** for `Record<string, unknown>` row-narrowing in source files (e.g. `db/queries/analytics.ts`), inline annotate map/reduce params with `Record<string, unknown>` — zero runtime change.
- **`!` non-null assertion removal:** allowed ONLY on lines already being edited for a tsc fix. NEVER as a standalone commit.
- **Widen-cast:** `as { field?: unknown }` for over-narrow inferred types triggering TS2339.

**Acceptance per commit:**
- `bun run test` returns ≥ 4936/34/305 (pass count must not drop; fail count must not rise; 8-file allowlist exact match).
- `bun x tsc --noEmit -p tsconfig.json` non-web error count drops by N (where N matches the file's pre-commit count).
- Cascade ≤5 files via `git show <sha> --stat`.
- No edits to sealed files (see §4).

**Done when:** non-web tsc error-count is at zero, OR remaining errors are documented as deferrals (with rationale per file) in the Phase 2 final report.

---

### Task #20 — SDET host coverage gap-closing (Block E, not started)

**Goal:** Close coverage gaps on host SDK files per thresholds in `scripts/coverage-thresholds.json`.

**Targets:**
- `src/extensions/subprocess.ts` (95% target) — prlimit error branch, memory-exhaust, `persistent: false` cleanup
- `src/extensions/json-rpc.ts` (100% target) — every error code (-32600…-32603, -32029) parse test
- `src/extensions/storage-handler.ts` (95% target) — batch empty, batch-over-limit, scope-switch-mid-batch
- `src/extensions/loader.ts` (90% target) — malformed manifest, missing entrypoint, fs-error injection
- `src/extensions/lifecycle-dispatcher.ts` (95% target) — every event routing + unknown-event rejection
- `src/extensions/tool-executor.ts` (95% target) — timeout branch, permission-denied branch
- `src/extensions/registry.ts` (95% target) — any remaining uncovered

**HARD constraint:** TEST-ONLY commits. If a coverage test surfaces a host bug, **do NOT fix the host source.** File a follow-on dev task and continue adding coverage tests. Host source is sealed to #20.

**Approach:** one new `*.test.ts` file per source file (or per logical category). Atomic commits. ≤5-file cascade.

**Acceptance:** target source files reach their threshold in `bun run test:coverage` merged lcov. Pass-count rises by added tests; fail count holds; 8-file set unchanged.

**Brief reference:** `/tmp/phase2-subphase-2.4-briefs.md` §3.

---

### Task #17 — Resolve 8 pre-existing failing test files (Block F, not started)

**Goal:** Either fix or formally defer the 8 host-side test files in the locked failing-set.

**The 8 files (all trace to commit `6e9e6b9` Anthropic namespacing drift, `.` → `__` storage-key form):**
- `src/__tests__/chat-tool-loop-e2e.test.ts`
- `src/__tests__/cross-extension.test.ts`
- `src/__tests__/extension-runtime-comprehensive.test.ts`
- `src/__tests__/extension-runtime.test.ts`
- `src/__tests__/extension-security-runtime.test.ts`
- `src/__tests__/memory-validation.test.ts`
- `src/__tests__/phase14-integration.test.ts`
- `src/__tests__/seam-permission-disable-integration.test.ts`

**Decision tree per file:**
- If failures are simple to fix (storage-key format update, etc.): fix, atomic commit per file.
- If failures are entangled or require non-trivial rework: document as deferral in Phase 2 final report with specific diagnosis. Do not let scope balloon.

**HARD constraint:** #17 has exclusive edit rights on these 8 files for Phase 2. No other task touches them.

**Brief reference:** `/tmp/phase2-subphase-2.4-briefs.md` §2.

---

### Task #14 — Sub-phase 2.4 GATE (PM-owned, blocks Phase 2 close)

**Goal:** Verify all 2.4 work cleanly closed. Gate command sequence (run AFTER #16, #20, #17 are done):

```bash
bun install                                        # workspace links resolve
bun run typecheck                                  # bun x tsc --noEmit -p tsconfig.json
cd web && bun run check && cd ..                   # web/svelte-check
bun run test                                       # canonical (NEVER raw `bun test`)
bun run test:sdk                                   # SDK isolated
bun run test:coverage                              # check-coverage.ts threshold gate
bun run test:e2e                                   # auto-note + 3 refactored examples
```

**Gate passes when:**
- Each command exits 0 OR has a documented deferral with rationale.
- `bun run test` matches or exceeds 4936 pass / ≤ 34 fail / ≥ 305 files (8-file set unchanged or smaller after #17).
- `bun x tsc --noEmit -p tsconfig.json` non-web errors at 0 (or all remaining errors are documented Phase 2 final-report deferrals).
- `bun run test:coverage` either exits 0 OR all under-threshold files are explicitly listed in the deferral list (sharding-artifact items already approved).
- `cd web && bun run check` is clean ON NON-SEALED files (sealed mention-sigil files' web-check errors are deferred per pm-v7 ruling γ).

---

### Phase 2 final report (PM-owned)

**Aggregate ALL deferrals** from Phase 2 work. Send to user in a single message. Required sections:

1. **Headline:** Phase 2 complete, X commits across N rotations, baseline movement (start → end).
2. **Sub-phase summary table** with gate status.
3. **Commit log:** `git log --oneline <phase2-start>..HEAD` filtered to Phase 2 commits.
4. **Test/coverage/tsc deltas** vs Phase 1 close baseline.
5. **Deviation/deferral list** (see §5 below — pre-aggregated).
6. **Carryforward to Phase 3:** what Phase 3 inherits (npm publish, c8 escalation if Bun adds BRDA, sharding artifact resolution, subprocess.test.ts try/finally hygiene, mention-sigil sealed-file web-check cleanup, etc.).

---

### Flip Task #1 to completed

After Gate #14 passes and final report sent. Just `TaskUpdate(taskId: "1", status: "completed")`. End of Phase 2.

---

## 3. Locked baseline + sealed files

### Test baseline
- **Canonical command:** `bun run test` (NOT raw `bun test` — raw causes mock.module cascade failures, 100+ spurious cascading failures from per-file isolation breakage).
- **Pass/fail:** 4936 pass / 34 fail / 305 files at HEAD `73797e2`.
- **Failing-file allowlist (the 8):** chat-tool-loop-e2e, cross-extension, extension-runtime-comprehensive, extension-runtime, extension-security-runtime, memory-validation, phase14-integration, seam-permission-disable-integration. **Any new failing file outside this set = stop-and-escalate.**

### Sealed files (DO NOT EDIT outside their owning task)
- `packages/@ezcorp/sdk/src/**` — SDK source. Single exception: `fs.ts` header comment softening (already done).
- `docs/extensions/examples/auto-note/**` — Phase 1 flagship.
- `docs/extensions/examples/{task-stack,todo-tracker,github-stats}/index.ts` — refactored examples (their tests are editable for refactor-fit).
- `src/__tests__/{task-stack,todo-tracker,github-stats}-sdk-integration.test.ts` — Sub-phase 2.3 SDET integration tests.
- `docs/extensions/examples/{task-stack,todo-tracker,github-stats}/e2e-server-pipeline.test.ts` — Sub-phase 2.3 E2E tests.
- `src/__tests__/ext-docs-validation.test.ts` — refactor-fit assertion swap already locked.
- **User's mention-sigil work-in-progress files** — currently live concurrent edits to `src/runtime/mention-wiring.ts`, `web/src/__tests__/mention-logic.test.ts`, `web/src/lib/mention-logic.ts`, etc. Do NOT touch; user is actively iterating.
- 8 pre-existing failing test files (§2 task #17) — exclusive edit rights belong to #17.

---

## 4. Hard constraints (apply to every commit)

- **Bun only.** `Bun.file`, `Bun.write`, `Bun.$`, `Bun.Glob`. `node:fs` sync primitives OK. **No `node:fs/promises`** in new code (existing usage in `src/runtime/mention-wiring.ts:139` is intentional per user; do not revert).
- **No `!` non-null assertions** in new code. Use guard clauses (`if (!x) throw new Error(...)`). `noUncheckedIndexedAccess: true` is enforced. `!` removal allowed ONLY on lines already being edited for a tsc fix.
- **Forward-additive only.** No `git push`, `git push --force`, `git reset --hard`, `git commit --amend`, `git rebase`. Atomic commits.
- **5-file cascade HARD per commit.** SvelteKit auto-generated `$types` files are gitignored — they don't count toward cascade.
- **Conventional commit subjects.** No Claude/Anthropic attribution lines.
- **80% proactive rotation** — applies to PMs, devs, sdets. Write a handoff doc at `/tmp/phase2-<role>-handoff-*.md` before rotating.

---

## 5. Pre-aggregated deferral list for Phase 2 final report

When drafting final report, fold these in (already ruled, do NOT re-litigate):

1. **c8 rejected** (pm-v2): Bun 1.3.x doesn't emit V8 coverage. Use Bun native lcov; branch coverage via PM inspection (no BRDA).
2. **check-coverage.ts missing-file silent skip** (pm-v3 LOCK): warning-enhancement candidate for post-Phase-2.
3. **merge-lcov SUM vs MAX** (pm-v3 LOCK): gate-verdict-equivalent at the 0/non-zero boundary.
4. **Sharding artifact on `channel.ts` (90.27%), `panel.ts` (89.87%), `storage.ts` (86.14%)** in merged lcov: substance verified at 100% in isolated SDK shard runs; cause is non-executable line DA-record emission interacting with merge-lcov's per-shard aggregation. Phase 3 candidate (either patch merge-lcov to filter non-executable lines OR migrate to istanbul-style emission once Bun supports it upstream).
5. **`storage.ts` unreachable backoff-loop exit line** (pm-v5): line-equivalence pass per Phase 1 no-BRDA methodology.
6. **`ext-docs-validation` assertion swap** (pm-v6 Option A): refactor-fit, locked.
7. **Sub-phase 2.3 E2E pattern reversal** (pm-v6): Bun `e2e-server-pipeline.test.ts` chosen over Playwright mocked-UI specs; matches auto-note precedent.
8. **fetchPermitted deny-path covers BOTH branches** (pm-v7 revised ruling): empty-allowlist + decoy-mismatch in integration; e2e picks Branch 1.
9. **`networkAllowed: true`** locked on deny-path ExtensionProcess (bypasses sandbox-preload to exercise fetchPermitted's own guard).
10. **Root tsconfig excludes `web` + `node_modules` + `.svelte-kit`** (pm-v7 α): delegates web type-checking to `cd web && bun run check` per SvelteKit standard pattern.
11. **svelte-kit sync postinstall additions DROPPED** (pm-v7 β): empirically already wired via `prepare`/`check` scripts.
12. **Web-check errors on user's ~22 mention-sigil sealed files** (pm-v7 γ): deferred to user's branch landing. Gate #14 evaluates non-sealed subset.
13. **subprocess.test.ts `:96-133` write/unlink try/finally hygiene** (pm-v8): non-blocking — under canonical `bun run test` the leak doesn't occur. Post-Phase-2 candidate.
14. **Canonical `bun run test`** vs raw `bun test` (pm-v8 process note): not a deferral — operational rule for all future work. `scripts/test.sh` exists for mock.module isolation.
15. **Pattern library for #16** (pm-v12 LOCKs): `at<T>` (array-index), `need<T>` (non-array T|undefined), `textOf` (JSON-RPC narrowing), `Record<string, unknown>` inline annotation for source row-narrowing, widen-cast for over-narrow inferred types, `!` removal only inline-with-fix.

If #16 leaves any tsc errors unresolved, list them per file with rationale. If #17 defers any of the 8 files, list with diagnosis.

---

## 6. Resume protocol (for fresh Claude session)

1. **Read this file completely** (`PHASE2_REMAINING.md`).
2. **Read latest dev handoff:** `/tmp/phase2-dev-handoff-2.4-16-v6-rot13.md` (pattern library + next-file order for #16).
3. **Verify state:** `git log --oneline -10`, `git status --short`, `bun run test 2>&1 | tail -5` to confirm 4936/34/305.
4. **Spawn fresh PM** (general-purpose subagent) with autonomous-operation directive + this file as primary brief. PM uses `team_name: "feature-team-p2"` (preserved on disk) or creates fresh team if needed.
5. **PM requests dev/sdet spawns via team-lead** (only team-lead can spawn). Each spawn brief includes:
   - Mandatory-rulings ack (verbatim — see template below).
   - Canonical `bun run test`.
   - Sealed file list from §3.
   - Hard constraints from §4.
   - Pattern library from §2 task #16 (if dev) or §2 task #20 (if sdet).
   - 80% proactive rotation with handoff doc.
6. **Sequence:** finish #16 → #20 → #17 → Gate #14 → final report → flip #1.
7. **Pane limit:** one active dev/sdet at a time.

### Mandatory-rulings ack template (every dev/sdet sends this verbatim before any code)

> "Acknowledged: rulings from team-lead are mandatory, not advisory. I will implement every ruling as issued. If I disagree with a ruling, I will escalate via SendMessage before writing code, never via commit body, never by deferring to a follow-up session, never by treating it as optional scope. I will also honor any explicit hold from pm before touching related code. When resuming from a handoff doc, I will ping PM to confirm current ruling state before touching code."

### Mandatory PM-rotation ack template

> "Acknowledged: I will break Phase 2 into sub-phases with individual gates. I will enforce the 5 carry-forward conditions on every dev commit (pass-count, verbatim commit body language where applicable, 5-file cascade stop, still-failing test list, 80% proactive dev rotation). I will not accept phase-close until every Phase 2 success criterion is met or explicitly deferred with team-lead ruling. I will write handoff docs on proactive rotation."

---

## 7. Cross-references

- **Plan:** `/home/dev/.claude/plans/floating-dancing-cookie.md` (Phase 2 section).
- **Phase 1 audit:** complete + 3-way verified (gates / code / behavior).
- **Team-lead handoff (Phase 2 foundation):** `/tmp/phase2-team-lead-handoff-for-resume.md`.
- **Latest delta:** `/tmp/phase2-resume-delta-v2.md` (covers 23-commit post-resume session).
- **Latest dev handoff:** `/tmp/phase2-dev-handoff-2.4-16-v6-rot13.md` (pattern library, file priority).
- **Sub-phase 2.4 briefs:** `/tmp/phase2-subphase-2.4-briefs.md` (#16/#17/#20/#14 specs).
- **Earlier handoffs:** `/tmp/phase2-handoff-pm-v{1..11}.md` for ruling provenance.

---

## 8. Estimated remaining work

| Task | Estimate (rough) |
|---|---|
| Finish #16 (small files + task-tracking monolith) | 4-6 dev rotations |
| #20 SDET host coverage | 3-4 sdet rotations |
| #17 8-file resolution OR formal deferral | 2-3 dev rotations |
| Gate #14 + final report | 1 PM rotation |
| **Total to Phase 2 close** | **~10-14 agent rotations** |

Phase 3 (npm publish to public registry) is a separate engagement and not covered here.

**End. Resume from §6.**
