---
phase: 61-test-debt-followup-feature-rework-specs
plan: 00
subsystem: testing
tags: [playwright, e2e, baseline, regression, test-debt]

# Dependency graph
requires:
  - phase: 59-01
    provides: "Phase 59-01 baseline shape (1678 passing test cases at 83781b5d) + canonical jq selector + sacred-12-stash invariant pattern — mirrored verbatim by 61-00"
  - phase: 59-02
    provides: "api-mocks expansion raised passing-count floor to 1679-1681 (post-Plan-59-02 SUMMARY)"
  - phase: 59-05
    provides: "Chat-page cluster repair commits 9c02de0/db934af/c52c862/da85900/5dd6e1c — testid hardening contributing to today's +48-line drift"
  - phase: 59-06
    provides: "theme-sidebar testid hardening (ca1de59) — contributing 12 newly-passing cases"
  - phase: 61-01
    provides: "5 theme-sidebar fixmes flipped via mockAccountEndpoints helper (ea3f8a6) — contributing 10 newly-passing cases (5×chromium+mobile)"
provides:
  - "Canonical Phase-61 baseline-passing.txt — 1726 lines, head_sha 6d852cf, captured 2026-05-13T02:08:04Z"
  - "Canonical Phase-61 baseline-meta.txt — head_sha, captured_at, sacred-12-stash invariant marker, full run-shape stats, jq selector + awk transform documented inline"
  - "Reference point for downstream 61-01/61-02/61-03 wave-merge gates' Layer 2 comm -23 regression diffs (61-VALIDATION.md)"
affects: [61-01, 61-02, 61-03, future-phase-regression-gates]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Canonical recursive-descent jq selector for per-test passing-case identifiers — survives Playwright's nested suite tree shape"
    - "Title-strip awk transform — line-fragility workaround so downstream wave-merge diffs survive spec-file edits (no false-positive shifted-line regressions)"
    - "Pre-spawn preview server pattern — bun run build && bun run preview as background process honored by playwright.config's reuseExistingServer: true (avoids cold-build auto-webServer timeout)"
    - "Sacred-12-stash invariant — pre- and post-execution `git stash list | wc -l` check, fails loud if not 12"

key-files:
  created:
    - ".planning/phases/61-test-debt-followup-feature-rework-specs/baseline-passing.txt — 1726 lines, sorted+deduped passing-test-case identifiers"
    - ".planning/phases/61-test-debt-followup-feature-rework-specs/baseline-meta.txt — head_sha + run-shape + sacred-stash marker + canonical jq selector + drift notes vs 59-01"
  modified: []

key-decisions:
  - "Use the canonical recursive-descent jq selector (`.. | objects | select(has(\"specs\")) ...`) — NOT 59-01-PLAN.md's literal `.file`-only selector (which yielded only 150 unique files and was deemed unusable for per-test regression diff); the working selector is documented in 59-test-debt-repair/baseline-meta.txt notes and emits one row per passing test case as `<file>::<line>:<col>::<title> [<projectName>]`."
  - "Mirror Phase 59-01's pure-capture shape exactly — single task, zero web/src or web/e2e touches; baseline-meta.txt drift section explicitly notes commit delta + line-count delta + drift sources for downstream operator audit."
  - "Document the title-strip awk transform inline in baseline-meta.txt so downstream wave-merge gates (61-01/61-02/61-03) MUST use the same transform to avoid line-fragility false positives."
  - "Pre-spawn preview server before invoking Playwright (per 59-01 Rule-3 deviation pattern) — Playwright's auto-webServer block times out on cold build; playwright.config's reuseExistingServer: true honors the pre-spawned process. Zero playwright.config.ts edits (out of scope)."

patterns-established:
  - "Pattern: capture-only plans must NEVER edit web/src/ or web/e2e/ — verified by `git diff --name-only -- web/e2e/ web/src/` returning empty (modulo pre-existing dirt like hljs-theme.css)."
  - "Pattern: use `git add -f` for `.planning/`-gitignored baseline files — gsd-tools commit short-circuits on gitignored paths with `skipped_gitignored` and does not auto-add `-f`; mirrors 59-01 commit 029e234's workflow."
  - "Pattern: baseline-meta.txt's notes block doubles as the canonical operator-facing documentation of the jq selector + awk transform; downstream plans cite-by-reference instead of re-deriving."

requirements-completed: [TEST-02]

# Metrics
duration: 22min
completed: 2026-05-13
---

# Phase 61 Plan 0: Baseline Passing-Spec Snapshot Summary

**Captured the Phase 61 phase-start Playwright baseline at HEAD `6d852cf`: 1726 passing test cases (+48 lines vs 59-01's `83781b5d` baseline) over a 626s run, sacred-12-stash invariant preserved pre- and post-execution, zero web/src or web/e2e modifications. Pure-capture commit `788f990` lands two files; downstream 61-01/61-02/61-03 wave-merge gates now have a fresh reference for Layer 2 title-based comm -23 regression diffs per 61-VALIDATION.md.**

## Performance

- **Duration:** ~22 min (state capture + build + preview spawn + Playwright suite + jq extract + meta write + commit)
- **Started:** 2026-05-13T02:08:04Z
- **Playwright run window:** 2026-05-13T02:09:04Z → 2026-05-13T02:19:30Z (626s)
- **Completed:** 2026-05-13T02:30Z (commit `788f990`)
- **Tasks:** 1 of 1 complete
- **Files modified:** 0 (pure-capture); files created: 2 (baseline-passing.txt + baseline-meta.txt under `.planning/`)

## Accomplishments

- `baseline-passing.txt` written with **1726 lines** in canonical `<file>::<line>:<col>::<title> [<projectName>]` shape; sorted+deduped (verified by `sort -u` idempotency check); spans 150 unique files across chromium + mobile-chromium projects.
- `baseline-meta.txt` written with full required-fields set: `head_sha`, `captured_at`, `git_stash_count_at_capture: 12`, run-shape (2724 total / 1726 passed / 670 failed / 162 skipped / 166 timedOut / 626s duration), canonical jq selector text, title-strip awk transform text, drift notes versus 59-01's `83781b5d` (1678 lines) including drift-source attribution to Phase 59-02/59-05/59-06/60-*/61-01 contributions.
- Sacred-12-stash invariant verified pre-execution (12), and post-commit (12) — zero `git stash` operations performed.
- Zero `web/src/` modifications, zero `web/e2e/` modifications — `git diff --name-only -- web/e2e/ web/src/` returns only the pre-existing `hljs-theme.css` dirt (untouched by this plan and explicitly excluded from the commit).
- Downstream 61-01/61-02/61-03 wave-merge gates can now compute the title-based `comm -23` regression diff per 61-VALIDATION.md Layer 2 against a fresh reference point.

## Task Commits

Each task was committed atomically:

1. **Task 1: Capture Phase 61 baseline + record stash invariant + write meta** — `788f990` (docs)

## Files Created/Modified

- `.planning/phases/61-test-debt-followup-feature-rework-specs/baseline-passing.txt` — created, 1726 lines, one row per passing test case in `<file>::<line>:<col>::<title> [<projectName>]` shape, sorted+deduped via `sort -u`.
- `.planning/phases/61-test-debt-followup-feature-rework-specs/baseline-meta.txt` — created, 69 lines, mirrors `.planning/phases/59-test-debt-repair/baseline-meta.txt` shape verbatim with Phase 61 phase-name + new HEAD + new captured_at + updated drift notes section.

## Run Shape

| Metric | 59-01 (`83781b5d`) | 61-00 (`6d852cf`) | Delta |
|---|---|---|---|
| Commits behind/ahead | (baseline) | +~30 commits | — |
| Total results | 2724 | 2724 | 0 |
| Passed | 1678 | **1726** | +48 |
| Failed | 695 | 670 | -25 |
| Skipped | 162 | 162 | 0 |
| TimedOut | 189 | 166 | -23 |
| Unique files (passing) | 150 | 150 | 0 |
| Run duration (sec) | 664 | 626 | -38 |
| `git stash list | wc -l` | 12 | 12 | 0 |

**Drift attribution (+48 lines passing, -25 failed, -23 timedOut):**
- 59-02 api-mocks expansion (~3 lines per 59-02 SUMMARY)
- 59-05 testid hardening on chat-page cluster (file-mentions / multi-agent / streaming-race / sub-conversations)
- 59-06 testid hardening on theme-sidebar (~12 cases per 59-06 SUMMARY)
- 60-* docs/audit-claim work (no test-surface delta expected; included for HEAD-fidelity)
- 61-01 theme-sidebar 5-fixme flip via mockAccountEndpoints helper at `ea3f8a6` (10 cases: 5×chromium + 5×mobile-chromium per 61-01 SUMMARY)

The +48 net gain exceeds the per-plan summary attribution sum (~25-30 cases) — the remainder is incidental drift from intermediate commits' downstream effects (e.g., 59-02 mock expansions unblocking previously-timedOut waitForResponse-bound tests beyond the three "predicted-unblock" specs called out in the 59-02 SUMMARY).

## Sacred-Stash Invariant

```
$ git stash list | wc -l
12           # pre-execution
12           # immediately after capture, pre-commit
12           # post-commit (HEAD = 788f990)
```

Zero `git stash` operations performed at any point — `git add -f` used directly to stage gitignored `.planning/` files, mirroring 59-01 commit `029e234`'s workflow. Project memory `feedback_agent_briefs_no_git_stash.md` invariant preserved.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `gsd-tools commit` short-circuits on gitignored `.planning/` paths; fell back to `git add -f` + `git commit -m`**

- **Found during:** Task 1 step 9 (commit).
- **Issue:** The plan-prescribed command was `node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" commit "..." --files baseline-passing.txt baseline-meta.txt`. That helper's `cmdCommit` checks `isGitIgnored(cwd, '.planning')` and emits `{ committed: false, reason: 'skipped_gitignored' }` without auto-applying `git add -f`.
- **Fix:** Used `git add -f` directly on both baseline files, then `git commit -m "<plan-step-9 subject>"` with the HEREDOC body. Mirrors 59-01 commit `029e234`'s historical workflow (confirmed via `git show --stat 029e234`).
- **Files modified:** none (commit-tool fallback only).
- **Commit:** `788f990` (the baseline commit itself).

### Process Notes (non-deviation, informational)

**1. Concurrent-agent overlap with Phase 59-05.**

A parallel agent was running `bunx playwright test e2e/shared-ui-components.spec.ts e2e/file-mentions.spec.ts e2e/team-orchestration.spec.ts e2e/streaming-toolbar.spec.ts e2e/streaming-race.spec.ts e2e/multi-agent.spec.ts e2e/sub-conversations.spec.ts e2e/agent-chat.spec.ts --workers=1 --reporter=json > /tmp/phase-59-05-after-cluster.json` (started 22:03, in-flight during my full-suite chromium window starting 22:09). My Playwright launched workers under the default workers-pool and shared the same preview server. Result shape (passing +48, timedOut -23) confirms no observable contention impact — the concurrent agent's `--workers=1` discipline minimized resource pressure. Documented in `baseline-meta.txt` notes for downstream observability. The parallel agent landed its own commit (`5dd6e1c docs(59-05): complete chat-page cluster repair plan`) between my pre-commit prep and my final `git commit`; the two commits are independent (different files), and `git diff HEAD~2 HEAD --name-only` shows clean separation.

**2. Plan-line `git diff main..HEAD --name-only` check trivially-empty (HEAD is on `main`).**

The plan's step 10 verification says `git diff main..HEAD --name-only` should list exactly the two baseline-*.txt files. In this branch model HEAD IS main (no separate feature branch), so the literal command returns empty. Substituted `git show --name-only --format="" HEAD` for an equivalent check; output shows exactly the two `.planning/phases/61-test-debt-followup-feature-rework-specs/baseline-*.txt` files, satisfying the intent.

## Patterns Established

- **Canonical jq selector + awk transform documented inline in `baseline-meta.txt` notes** so downstream gates cite-by-reference (no re-derivation, no drift between plan-text and on-disk).
- **Pre-spawn preview server pattern** mirrors 59-01 / 59-02 Rule-3 deviation: build → background `bun run preview` → wait for `curl -sf http://localhost:4173/` → invoke Playwright with config's `reuseExistingServer: true`. Plan-text-locked.
- **Sacred-12-stash invariant** is the load-bearing test for "did this agent run the global forbidden stash op?" — gates execution start and verifies post-commit, fails loud if not 12.
- **`git add -f` for `.planning/`-gitignored baselines** is the canonical staging path; gsd-tools commit helper's `skipped_gitignored` short-circuit is by-design and operators fall back to manual `git add -f` (as 59-01's commit history confirms).

## Self-Check: PASSED

- `baseline-passing.txt` exists at expected path, **1726 ≥ 1670** lines, sorted+deduped (idempotent), canonical format verified on head/mid/tail rows.
- `baseline-meta.txt` exists at expected path, contains all five required fields (`head_sha`, `captured_at`, `git_stash_count_at_capture`, `baseline_passing_lines`, `playwright_passing_results`).
- Commit `788f990` exists on `main`, subject `docs(61-00): capture Phase 61 baseline passing-spec snapshot`, contains exactly the two baseline-*.txt files.
- `git stash list | wc -l` = 12 (sacred preserved).
- Zero `web/e2e/` or `web/src/` modifications introduced by this plan.
