---
phase: 59-test-debt-repair
plan: 01
subsystem: testing

tags: [playwright, baseline, regression-gate, jq, e2e, test-infra]

# Dependency graph
requires:
  - phase: 58-mcp-stage-2-veth-pair-nftables-seccomp-enforce
    provides: "completed v1.4 MCP stack — phase-branch start commit is stable enough to baseline against"
provides:
  - "Canonical phase-start Playwright passing-test baseline (1678 test cases) committed at .planning/phases/59-test-debt-repair/baseline-passing.txt"
  - "Run metadata (head_sha, captured_at, stash count, full pass/fail/skip/timedout breakdown) at baseline-meta.txt"
  - "Stash invariant captured: 12 entries, top=TEMP-56-03-regression-check — downstream plans can re-assert at phase end"
  - "Background `bun run preview` server pattern documented (mitigation for Playwright webServer 60s timeout)"
affects: [59-02, 59-03, 59-04, 59-05, 59-06, 59-07, 59-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Playwright per-test-case regression baseline — `<file>::<line>:<column>::<title> [<projectName>]` stable identifier for `comm -23` diffs"
    - "jq selector across nested Playwright JSON: `.. | objects | select(has(\"specs\")) | .specs[]? | select(.tests[]?.results[]?.status == \"passed\")`"
    - "Pre-run `bun run preview` background spawn — works around Playwright auto-webServer 60s timeout for fresh builds"

key-files:
  created:
    - ".planning/phases/59-test-debt-repair/baseline-passing.txt — 1678-line passing-test baseline"
    - ".planning/phases/59-test-debt-repair/baseline-meta.txt — run metadata + stash invariant"
    - ".planning/phases/59-test-debt-repair/59-01-SUMMARY.md — this file"
  modified: []

key-decisions:
  - "Followed plan INTENT (per-test-case identifiers) over plan LITERAL (file-only jq) — the literal selector would have yielded 150 unique files, below the 800-line min and unusable for downstream comm -23 regression diffs"
  - "Started preview server in background instead of relying on Playwright's auto-webServer block (60s default timeout was too tight for cold `bun run build && bun run preview`)"
  - "Recorded actual run stats (1678 passing) rather than retro-fitting to the triage doc's 868 figure (3 days stale; today's HEAD has more tests landed)"

patterns-established:
  - "Per-test-case regression baseline: `jq -r '.. | objects | select(has(\"specs\")) | .specs[]? | . as $spec | $spec.tests[]? | select(.results[]?.status == \"passed\") | \"\\($spec.file)::\\($spec.line):\\($spec.column)::\\($spec.title) [\\(.projectName)]\"' run.json | sort -u`"
  - "Downstream wave-merge gates: `comm -23 .planning/phases/59-test-debt-repair/baseline-passing.txt /tmp/phase-59-wave-N-passing.txt` — empty output proves zero regression"

requirements-completed: []  # TEST-02 declared in PLAN.md frontmatter but represents the prerequisite baseline only; full TEST-02 completion lands in 59-05 / 59-06 / 59-08 — see Issues Encountered.

# Metrics
duration: 30 min
completed: 2026-05-12
---

# Phase 59 Plan 01: Phase-Branch Playwright Baseline Capture Summary

**1678 passing Playwright test cases pinned at HEAD `83781b5dd7be` with stable per-test-case identifiers — every downstream TEST-02 wave-merge gate (59-05, 59-06, 59-08) can now run `comm -23 baseline.txt <new-run>` and assert zero regression on previously-green specs.**

## Performance

- **Duration:** 30 min
- **Started:** 2026-05-12T21:39:38Z
- **Completed:** 2026-05-12T22:09:38Z
- **Tasks:** 1 / 1 (Task 1: Capture phase-branch baseline + stash invariant)
- **Files created:** 3 (`baseline-passing.txt`, `baseline-meta.txt`, this SUMMARY)
- **Files modified:** 0 (zero SUT edits, zero test edits — pure capture, per plan scope)

## Accomplishments

- **Phase-start baseline pinned at `83781b5dd7be`** ("wip: JsonBlock component + image-gen timeout extensions") with 1678 passing test cases across `chromium` + `mobile-chromium` Playwright project matrix.
- **Per-test-case stable identifiers** captured (`<file>::<line>:<column>::<title> [<projectName>]`), enabling fine-grained `comm -23` regression detection in downstream waves — a regression in one test case is caught even when the rest of the file still passes.
- **Stash invariant preserved and recorded**: `git stash list | wc -l == 12` both before and after this plan; top entry remains `stash@{0}: On main: TEMP-56-03-regression-check`. Zero `git stash` operations performed.
- **Full Playwright run metadata** captured in `baseline-meta.txt`: 2724 total results, 1678 passed, 695 failed, 162 skipped, 189 timedout, 11-minute run duration (~664 seconds wall-clock). Failing/timing-out tests are the v1.3 test-debt surface that the rest of Phase 59 will repair.

## Task Commits

1. **Task 1: Capture phase-branch baseline + stash invariant** — `029e234` (feat)

**Plan metadata commit (to follow):** `docs(59-01): complete baseline capture plan` — bundles SUMMARY.md + STATE.md + ROADMAP.md + REQUIREMENTS.md.

## Files Created/Modified

- `.planning/phases/59-test-debt-repair/baseline-passing.txt` — 1678 lines, sorted+deduped, one passing test case per line as `<file>::<line>:<column>::<title> [<projectName>]`.
- `.planning/phases/59-test-debt-repair/baseline-meta.txt` — head_sha `83781b5dd7bed7026d843f5c083f990d5bff23a7`, captured_at `2026-05-12T22:07:45Z`, git_stash_count_at_capture `12`, plus full Playwright stats breakdown and deviation notes.
- `.planning/phases/59-test-debt-repair/59-01-SUMMARY.md` — this file (force-added to overcome `.planning/` gitignore rule, matching the pattern of prior SUMMARYs in `.planning/phases/55*` through `.planning/phases/58*`).

## Decisions Made

- **Per-test-case identifier vs. file-only baseline.** The plan's literal jq selector emits only `.file`, which after `sort -u` collapses to ~150 unique files — below the plan's own `min_lines: 800` acceptance gate, and useless for downstream `comm -23` per-test regression detection. Followed the plan's *intent* (machine-checkable wave-merge gate) by emitting `file::line:column::title [projectName]` per passing test case. This is the only sane interpretation given the `min_lines: 800` constraint and the downstream `comm -23` usage. Captured as Rule 3 deviation below.

- **Manual preview-server spawn vs. Playwright's `webServer` block.** Playwright's auto-spawned `webServer` block (`PI_SKIP_INIT=1 bun run build && PI_SKIP_INIT=1 bun run preview`) timed out before the cold build finished, causing the first run to record only 193 passing tests (every spec hit `ERR_CONNECTION_REFUSED` on `http://localhost:4173/`). Started `bun run preview` manually as a background process (logs at `/tmp/phase-59-preview.log`), confirmed health at `/`, then re-ran with `reuseExistingServer: true` honouring it.

- **Recorded actual stats, not retro-fitted figures.** The triage doc cites 868 passing test cases at commit `f16b427` (2026-05-09); today's HEAD is 3 days newer with many specs added or stabilised. Today's actual count is 1678 — recorded as-is. Drift is upward, so the regression invariant remains conservative.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Plan's literal jq selector was unusable for the plan's own acceptance gate**

- **Found during:** Task 1 (Capture phase-branch baseline + stash invariant).
- **Issue:** 59-01-PLAN.md's literal jq command was `jq -r '.suites[]? | .. | .specs[]? | select(.tests[]?.results[]?.status == "passed") | .file'`. This emits one row per passing test case, with only the file path. After the plan's `| sort -u`, the result is one line per unique *file* (~150 lines), which (a) falls well below the plan's own `min_lines: 800` acceptance gate, and (b) is useless for the downstream `comm -23 baseline.txt <new-run>` regression gate in 59-05, 59-06, and 59-08 — a regression in any single test case would be invisible as long as the file still has at least one passing test.
- **Fix:** Followed plan INTENT (a diffable per-test-case baseline). Used the equivalent traversal but emitted `<file>::<line>:<column>::<title> [<projectName>]` per passing test case before `sort -u`. Final line count: 1678 (>> 800, satisfies plan acceptance). Downstream plans regenerate the same shape with the same selector, so `comm -23` invariant is preserved.
- **Files modified:** None outside the plan's stated `<files>` (`baseline-passing.txt`, `baseline-meta.txt`).
- **Verification:** `wc -l baseline-passing.txt` → 1678; `head -3` shows well-formed identifiers; the plan's own automated verification command (`test -f ... && test $(wc -l) -ge 800 && test -f ... && grep -q "head_sha:" ... && test $(git stash list | wc -l) -eq 12`) returns PASS.
- **Committed in:** `029e234` (Task 1).
- **Action item for downstream plans:** 59-05, 59-06, 59-08 must use the **same** jq selector when generating `/tmp/phase-59-wave-N-passing.txt`; the exact command is recorded in `baseline-meta.txt` `notes:` section and in this summary's `patterns-established`. The plan-text in 59-05 / 59-06 / 59-08 should be patched if it cites the broken literal — recommend a follow-up edit in their pre-execution review.

**2. [Rule 3 — Blocking] Playwright `webServer` auto-spawn timeout — manual preview server required**

- **Found during:** Task 1 (first `bunx playwright test` invocation).
- **Issue:** The first run recorded only 193 passing test cases (vs. the expected ~1500–1800). Investigation revealed every test hit `ERR_CONNECTION_REFUSED` on `http://localhost:4173/`. Playwright's auto-spawned `webServer` command (`PI_SKIP_INIT=1 bun run build && PI_SKIP_INIT=1 bun run preview`) was timing out at Playwright's default 60-second window before the cold build finished (`bun run build` alone took 30–60s on the dev box, leaving no time for preview to bind to 4173).
- **Fix:** Started `cd web && PI_SKIP_INIT=1 bun run preview > /tmp/phase-59-preview.log 2>&1 &` as a background process (the build artifacts from the failed first run were reusable, so preview bound to 4173 in ~2s). Confirmed `curl -sI http://localhost:4173/` returned `200 OK`. Re-ran `bunx playwright test --reporter=json`; `reuseExistingServer: true` correctly honoured the running server, and the run completed in ~11 minutes with 1678 passing.
- **Files modified:** None — this is operator-side infrastructure setup, not a code change. `playwright.config.ts` was NOT touched (plan explicitly forbids it: "Touching `playwright.config.ts`, `package.json` scripts, or any CI yaml" is out of scope per 59-CONTEXT.md).
- **Verification:** Re-run completed cleanly (exit code 1, expected because failing tests exist), JSON valid, stats present.
- **Committed in:** Documented in `baseline-meta.txt`; no code change to commit.
- **Action item for downstream plans:** Each wave-merge gate run should either (a) pre-spawn `bun run preview` manually first, OR (b) increase Playwright's `webServer.timeout` if/when `playwright.config.ts` becomes editable (out of Phase 59 scope). Documented in `baseline-meta.txt` so 59-05 / 59-06 / 59-08 executors don't repeat the 30-minute false-start.

---

**Total deviations:** 2 auto-fixed (2 Rule 3 — Blocking).
**Impact on plan:** Both deviations are environmental / interpretive — necessary to make the baseline actually function as a regression gate. Zero SUT changes, zero test-file changes, zero `playwright.config.ts` changes. The plan's stated goal (durable phase-start baseline with `git stash list == 12` invariant) is satisfied. The plan-text bugs (broken jq + missing preview-server lead-up) should be patched in a follow-up doc commit if/when those plans are re-touched.

## Issues Encountered

- **Initial Playwright run was a 4.5-minute false-start** (every test failed with `ERR_CONNECTION_REFUSED`). Total wasted-time impact: ~5 minutes. Resolved by manual preview-server spawn (above).
- **Plan's literal jq selector was broken.** Detected pre-write (during line-count verification of the extracted file). Resolved by emitting per-test-case identifiers (above).
- **Plan frontmatter `requirements: [TEST-02]` was over-claiming.** TEST-02 reads "the 87 + 13 + 3 failing Playwright specs are repaired via `data-testid` selector hardening; no timeout widening; all 868 v1.3-passing specs remain green." Plan 59-01 is the **prerequisite baseline capture** for TEST-02; the actual spec-repair work lands in 59-05 (chat-page cluster), 59-06 (sidebar/layout cluster), and 59-08 (long-tail sweep). The gsd-tools `requirements mark-complete` step initially flipped TEST-02 to `[x]` / `Complete` per the plan's frontmatter contract — this was then reverted to `[ ]` / `In Progress (Plan 59-01 prerequisite baseline captured; full repair pending Plans 59-05 / 59-06 / 59-08)` to keep `REQUIREMENTS.md` truthful. The plan-frontmatter should ideally claim a sub-requirement like `TEST-02a` rather than the umbrella `TEST-02`; recommend a follow-up edit to 59-01-PLAN.md frontmatter if requirements granularity matters for downstream tracking.
- **No `git stash` operations attempted** at any point. Stash count `12` confirmed pre-Task-1 (initial state), post-Task-1 (after baseline files written), and post-commit. Sacred invariant preserved.

## User Setup Required

None — no external service configuration required. This plan is a pure capture/observation step.

## Next Phase Readiness

- **Baseline is live.** 59-02 (api-mocks audit), 59-03 (test.fixme flips), 59-04 (backend triage doc), 59-05 / 59-06 / 59-08 (TEST-02 selector hardening waves), and 59-07 (TEST-05 retro-claim) can now all execute their planned wave-merge `comm -23` regression gates against `.planning/phases/59-test-debt-repair/baseline-passing.txt`.
- **Pre-flight checklist for every downstream Phase-59 wave commit:**
  1. Pre-spawn `cd web && PI_SKIP_INIT=1 bun run preview > /tmp/preview.log 2>&1 &` and wait for `curl -sf http://localhost:4173/` to return 200, OR rely on Playwright's auto-`webServer` if confident the build will fit in 60s (it usually won't on cold cache).
  2. Run `cd web && bunx playwright test --reporter=json > /tmp/phase-59-wave-N.json 2>&1 || true`.
  3. Extract per-test-case identifiers with the canonical jq selector from `patterns-established` above.
  4. `comm -23 .planning/phases/59-test-debt-repair/baseline-passing.txt /tmp/phase-59-wave-N-passing.txt` — empty output is the green-light gate; non-empty is a regression and the offending commit MUST be reverted.
  5. Re-assert `git stash list | wc -l == 12` before merging the wave commit.
- **No blockers** for any downstream plan.

## Self-Check: PASSED

Verified post-summary:

- `.planning/phases/59-test-debt-repair/baseline-passing.txt` — exists, 1678 lines (≥ 800 acceptance gate).
- `.planning/phases/59-test-debt-repair/baseline-meta.txt` — exists, 50 lines, `head_sha:` field present.
- `.planning/phases/59-test-debt-repair/59-01-SUMMARY.md` — this file (exists).
- Task 1 commit `029e234` — present in `git log --oneline --all`.
- `git stash list | wc -l == 12` — sacred invariant preserved.
- Plan's literal automated-verify command — `PASS`.

---
*Phase: 59-test-debt-repair*
*Plan: 01*
*Completed: 2026-05-12*
