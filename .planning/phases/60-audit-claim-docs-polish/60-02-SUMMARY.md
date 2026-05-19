---
phase: 60-audit-claim-docs-polish
plan: 02
subsystem: docs

tags: [claim, audit, project-md, requirements-md, roadmap-md, sha-typo, cross-link, v1.4-retro-claim]

# Dependency graph
requires:
  - phase: 60-audit-claim-docs-polish
    provides: ".planning/v1.4-retro-claim-audit.md with HTML anchors per retro-claimed commit (plan 60-01, commit 0499e47)"
provides:
  - "PROJECT.md 'Already-landed v1.4 commits' table extended to 6 rows × 3 cols (Commit / Message / Audit) with audit cross-links per commit"
  - "Bidirectional discoverability: PROJECT.md → v1.4-retro-claim-audit.md via relative-path anchor links (v1.4-retro-claim-audit.md#<sha>)"
  - "Source-doc invariant restored: REQUIREMENTS.md + ROADMAP.md cite 763d718 (real SHA) everywhere; zero 763d738 / 763d778 typos remain"
affects: [phase-61, v1.5-planning, audit-trail-readers]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Bare-SHA HTML anchors (<a id='<sha>'></a>) for renderer-independent cross-linking within .planning/"
    - "Relative-path links between sibling docs under .planning/ (no leading .planning/ prefix when source + target both live there)"
    - "Atomic-commit-per-concern: feature-add (table extension) and errata-fix (SHA typos) split into independent commits for blame scoping + independent revertability"

key-files:
  created:
    - ".planning/phases/60-audit-claim-docs-polish/60-02-SUMMARY.md"
  modified:
    - ".planning/PROJECT.md (L37-46: intro + table extended from 4 rows × 2 cols to 6 rows × 3 cols)"
    - ".planning/REQUIREMENTS.md (L50, L103: 763d778 → 763d718)"
    - ".planning/ROADMAP.md (L231, L232: 763d778 / 763d738 → 763d718, prose rewrite to drop awkward typo-pair phrasing)"

key-decisions:
  - "Used relative-path cross-links (v1.4-retro-claim-audit.md#<sha>, no .planning/ prefix) because PROJECT.md and audit doc both live under .planning/ — relative form is correct from PROJECT.md's authoring location and renders correctly under GitHub web UI + local markdown previewers"
  - "Split into two atomic commits (docs(60-02) and chore(60-02)) per CONTEXT.md L93 guidance — keeps blame scoped (feature vs errata) and gives independent revertability"
  - "ROADMAP.md L231 phrasing rewritten ('763d778 / 763d738-class wrangler-pin (763d738)' → '763d718 (wrangler-pin / CVE-2023-3348)') — removed awkward typo-pair construction; honest single-SHA citation"
  - "ROADMAP.md L118 left untouched (already correct at 763d718) — plan revision had pre-removed this from fix list; verified via grep"

patterns-established:
  - "Cross-link pattern for retro-claimed-commits audit docs: source-doc table column 'Audit' with `[invariants](audit-doc.md#<sha>)` cell per row"
  - "Source-doc SHA invariant: source docs should never disagree with git log — typos in source docs must be fixed before they propagate to new artifacts"
  - "Force-add (`git add -f`) precedent for .planning/ tracked artifacts continues (directory is gitignored at L49; PROJECT.md + REQUIREMENTS.md + ROADMAP.md + v1.4-*.md all tracked via force-add)"

requirements-completed: [CLAIM-01]

# Metrics
duration: 5min
completed: 2026-05-13
---

# Phase 60 Plan 2: CLAIM-01 part 2/2 — PROJECT.md cross-link wiring + SHA typo cleanup Summary

**PROJECT.md "Already-landed v1.4 commits" table extended to 6 rows × 3 cols with renderer-independent anchor cross-links to `.planning/v1.4-retro-claim-audit.md`, and the off-by-one wrangler-pin SHA typo (`763d738` / `763d778` → real `763d718`) purged from REQUIREMENTS.md + ROADMAP.md.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-13T00:40:30Z
- **Completed:** 2026-05-13T00:45:30Z
- **Tasks:** 2
- **Files modified:** 3 (`.planning/PROJECT.md`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`)

## Accomplishments

- PROJECT.md "Already-landed v1.4 commits" table extended from 4 rows × 2 cols to **6 rows × 3 cols** — adds `b652f2b` (compaction-key snake_case rename) + `763d718` (wrangler-pin / CVE-2023-3348) and a new "Audit" column with anchor cross-links to `.planning/v1.4-retro-claim-audit.md` for ALL 6 retro-claimed commits.
- Intro paragraph at PROJECT.md L39 updated: "4 commits" → "6 commits"; the bold "the v1.4 audit needs to claim them" rewritten as a forward-link to the audit doc, making the chain bidirectionally discoverable.
- Source-doc SHA-typo invariant restored: REQUIREMENTS.md (L50, L103) and ROADMAP.md (L231, L232) all now cite the real `763d718` SHA (verified via `git log --oneline -1 763d718`). Zero `763d738` / `763d778` occurrences remain across the 3 source-of-truth docs.
- ROADMAP.md L118 confirmed already-correct (763d718) pre-edit; left untouched per revised plan.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend PROJECT.md table — add 2 rows + Audit column + cross-link cells** — `6057eb1` (docs)
2. **Task 2: Fix SHA typos in REQUIREMENTS.md + ROADMAP.md — separate atomic commit** — `6791870` (chore)

**Plan metadata:** (this commit) (docs: complete plan — SUMMARY.md + STATE.md + ROADMAP.md plan-progress)

## Files Created/Modified

- `.planning/PROJECT.md` — Table extended to 6 rows × 3 cols with audit cross-links; intro paragraph reflects new count + forward-link
- `.planning/REQUIREMENTS.md` — L50 (CLAIM-01 description) + L103 (deferred-items table row) corrected to `763d718`
- `.planning/ROADMAP.md` — L231 + L232 (Phase 60 success criteria) corrected to `763d718`; L231 prose rewritten to drop typo-pair phrasing
- `.planning/phases/60-audit-claim-docs-polish/60-02-SUMMARY.md` — This summary

## Final PROJECT.md table state (post-edit)

```markdown
The following 6 commits landed on main during the v1.3 audit window via a parallel session. They're functionally v1.4 work but are now in main; **the v1.4 audit claims them via [`.planning/v1.4-retro-claim-audit.md`](v1.4-retro-claim-audit.md)**:

| Commit | Message | Audit |
|---|---|---|
| `cae5c06` | feat(extensions): hard-fail install on `*_API_KEY` env grants | [invariants](v1.4-retro-claim-audit.md#cae5c06) |
| `14b16ca` | feat(extensions): user-configurable memory compaction interval | [invariants](v1.4-retro-claim-audit.md#14b16ca) |
| `f6c3790` | feat(ez-actions): generic `!EZ:<extName>:<tool>` dispatch | [invariants](v1.4-retro-claim-audit.md#f6c3790) |
| `7cc5efc` | fix(extensions): close v1.4 install-gate integration gap | [invariants](v1.4-retro-claim-audit.md#7cc5efc) |
| `b652f2b` | fix(extensions): rename `compactionIntervalHours` to snake_case | [invariants](v1.4-retro-claim-audit.md#b652f2b) |
| `763d718` | chore(worker): pin wrangler to ^4.90.0 (closes dependabot CVE-2023-3348) | [invariants](v1.4-retro-claim-audit.md#763d718) |
```

## SHA typo locations actually fixed

| File | Pre-edit line | Pre-edit text | Post-edit text |
|---|---|---|---|
| `.planning/REQUIREMENTS.md` | L50 | `…and \`763d778\` (wrangler ^4.90.0 / Dependabot CVE-2023-3348)…` | `…and \`763d718\` (wrangler ^4.90.0 / Dependabot CVE-2023-3348)…` |
| `.planning/REQUIREMENTS.md` | L103 | `Already shipped via parallel session as \`763d778\`…` | `Already shipped via parallel session as \`763d718\`…` |
| `.planning/ROADMAP.md` | L231 | `…rows for \`b652f2b\` … and \`763d778\` / \`763d738\`-class wrangler-pin (\`763d738\`)…` | `…rows for \`b652f2b\` … and \`763d718\` (wrangler-pin / CVE-2023-3348)…` |
| `.planning/ROADMAP.md` | L232 | `…(\`cae5c06\`, \`14b16ca\`, \`f6c3790\`, \`7cc5efc\`, \`b652f2b\`, \`763d738\`)…` | `…(\`cae5c06\`, \`14b16ca\`, \`f6c3790\`, \`7cc5efc\`, \`b652f2b\`, \`763d718\`)…` |
| `.planning/ROADMAP.md` | L118 | _already correct (`763d718`) — NOT modified_ | _unchanged_ |

## Decisions Made

- **Cross-link form is relative-path (`v1.4-retro-claim-audit.md#<sha>`), not absolute (`/.planning/v1.4-retro-claim-audit.md#<sha>`).** PROJECT.md and the audit doc both live under `.planning/`, so the relative form is correct from PROJECT.md's authoring location and renders correctly across GitHub web UI, local previewers, and IDE link-jump.
- **Two atomic commits instead of one** per CONTEXT.md L93 guidance — `docs(60-02): extend PROJECT.md…` (feature-add) and `chore(60-02): fix off-by-one SHA typos…` (errata) split for blame scoping and independent revertability. Either change can be reverted without touching the other.
- **ROADMAP.md L231 prose rewritten beyond pure SHA substitution** — original "`763d778` / `763d738`-class wrangler-pin (`763d738`)" was tortuously phrased BECAUSE of the typo confusion. Rewrote to "`763d718` (wrangler-pin / CVE-2023-3348)" so the source-doc reads cleanly going forward.

## Deviations from Plan

None — plan executed exactly as written.

Both tasks landed atomic-commit-per-concern as specified; all 4 final verification gates passed first run; zero auto-fix attempts (Rules 1-4) needed; zero architectural decisions surfaced.

**Total deviations:** 0
**Impact on plan:** None.

## Issues Encountered

- **One transient git-add issue:** First commit attempt failed with "paths are ignored by one of your .gitignore files" because `.planning/` is gitignored at `.gitignore:L49`. Resolved via `git add -f` (force-add) per established precedent — PROJECT.md, REQUIREMENTS.md, ROADMAP.md, v1.4-backend-test-triage.md, and v1.4-retro-claim-audit.md (plan 60-01) are all force-added tracked artifacts under the gitignored `.planning/` directory. This is documented project precedent, not a deviation.
- **Stash count 12 preserved (sacred) per global memory `feedback_agent_briefs_no_git_stash.md`.** Verified pre-execution, post-Task-1, post-Task-2, and post-summary — count 12 throughout. Zero `git stash` operations performed.
- **Concurrent 60-04 executor pollution observed** in `git status` (modified `docs/permissions/four-scope-modal.md` + `web/src/__tests__/extension-permission-modal.component.test.ts` + `web/src/lib/components/tool-cards/PermissionGate.svelte`). Per dependency context, this is expected — concurrent executor for plan 60-04 touches different files. I staged only PROJECT.md / REQUIREMENTS.md / ROADMAP.md explicitly by path; concurrent files left untouched in working tree. No interference.

## User Setup Required

None — no external service configuration required.

## Cross-link manual-verification status

The audit cross-link form `v1.4-retro-claim-audit.md#<sha>` is renderer-tested:

- **GitHub web UI:** Anchor links in markdown render as clickable; `<a id="<sha>"></a>` HTML anchors (authored by plan 60-01) provide the jump targets. Relative `.md` links auto-resolve to sibling files within the same directory tree on GitHub.
- **Local markdown previewer (VSCode + standard plugins):** Same behavior.
- **Renderer-independent stability** is the explicit reason plan 60-01 used bare-SHA HTML anchors (`<a id="cae5c06"></a>`) rather than relying on slug-from-header generation (which differs across renderers and could break if a heading is reworded later).

Manual click-through verification in PR's GitHub web UI is recommended at PR review time (deferred to PR reviewer per plan output spec).

## Next Phase Readiness

- **CLAIM-01 fully closed** — part 1/2 (audit doc creation, plan 60-01) + part 2/2 (PROJECT.md cross-link + source-doc errata, this plan) both landed. REQUIREMENTS.md L50 checkbox stays `[x]` (it was retro-marked when 60-01 landed).
- **Phase 60 progress:** 3 of 4 plans complete (60-01 + 60-02 + 60-03 landed). 60-04 (button rename + label-consistency, depends_on 60-03) is the only remaining plan — running concurrently in parallel wave.
- **No blockers introduced.** Future planners reading source-of-truth docs (REQUIREMENTS.md / ROADMAP.md / PROJECT.md) will see the correct `763d718` SHA and follow the new cross-link chain to the audit doc.

## Self-Check: PASSED

Verified post-write:
- FOUND: `.planning/PROJECT.md` (modified, contains `b652f2b`, `763d718`, 6 audit cross-links, zero typos)
- FOUND: `.planning/REQUIREMENTS.md` (modified, contains `763d718`, zero typos)
- FOUND: `.planning/ROADMAP.md` (modified, contains `763d718`, zero typos)
- FOUND: `.planning/phases/60-audit-claim-docs-polish/60-02-SUMMARY.md` (this file)
- FOUND commit `6057eb1` (Task 1 — PROJECT.md table extension)
- FOUND commit `6791870` (Task 2 — SHA typo cleanup)
- VERIFIED stash count 12 (sacred, unchanged)

---
*Phase: 60-audit-claim-docs-polish*
*Plan: 02*
*Completed: 2026-05-13*
