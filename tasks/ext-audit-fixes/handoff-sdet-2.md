# sdet-2 handoff note (context at 84%, pausing)

**Date:** 2026-04-20
**Last commit:** `ec2b883` test(audit-regressions): land AF-2 (bundled provenance flag)

## What's done

- **Baseline captured** (`tasks/ext-audit-fixes/baseline-test-count.md`).
  HEAD `07af445`: 5283 pass / 45 fail / 345 files. 9 failing files
  enumerated — `#10`'s acceptance bar.
- **`src/__tests__/audit-regressions.test.ts`** — 14 pass / 6 skip / 0 fail.
  - **AF-3** (task #17, dev-2 `1043bc8` + `77eb270`): 12/12 live.
    Entrypoint traversal + absolute-path rejection; MCP validator wired
    into loadManifest; NR-3 well-formed MCP + plain-tools still load.
  - **AF-2** (task #12, dev-2 `898730d`): 2/3 live.
    Spoofed `installFromLocal name:"ai-kit"` → `isBundled:false`;
    registry.ts no longer imports `isBundledExtensionName`.
    **1 test left skipped** (NR-2 seeded-bundled isBundled:true) —
    needs DB-migration-driven fixture. Commit message locks rationale.
  - **AF-1** (task #14): 5/5 `test.skip`. **BLOCKED** — #14 is pending,
    team-lead re-queued it for dev-3 per dev-2's handoff note.

## What's next for #11

1. **Un-skip AF-1** once dev-3 lands #14. Tests are fully sketched
   in the file — each `test.skip(...)` has commented pseudocode that
   should become live code once you know how #14 exposes the envelope.
   Key assertion surfaces: probe MCP server at `makeProbeServer()`
   returns `process.env` + `/proc/self/limits`; check env doesn't
   contain `EZCORP_PERMITTED_HOSTS`, `EZCORP_SHELL_ALLOWED`, arbitrary
   parent SECRETs, and `Max address space` is bounded (not unlimited).
2. **Optionally un-skip NR-2 seeded-bundled test** — see the inline
   comment for steps. Not strictly on the #11 acceptance critical path
   (commit `898730d` manually verified it) but NR-2 is in the
   non-regression list so it's worth having hermetic coverage.
3. **NR-3 strengthen (optional)**: current NR-3 test uses synthetic
   fixtures. pm asked that the NR-3 test "actually load every manifest
   in `docs/extensions/examples/*` + the bundled seeds through the new
   `validateMcpManifest` path" — a loop calling `loadManifest(dir)` on
   each and asserting none throw. Low-risk to add.

## What's next for #10 (after #11 fully lands)

Per the task #10 assignment:
1. Re-run `scripts/test.sh`. TOTAL_FAIL must be ≤ 45. Failing files
   must be a subset of the 9 in `baseline-test-count.md`. Any new
   entry is a regression — escalate to pm, don't paper over.
2. Run `web/e2e/extensions.spec.ts` against live dev server. Blocked
   on task #5 (Playwright reconcile).
3. Verify 23 runtime-enforcement tests in
   `src/__tests__/permission-enforcement.test.ts` still green —
   SEC-7 non-regression bar.
4. Coverage per-file on scope: `installer.ts`, `manifest.ts`,
   `permissions.ts`, `web/src/routes/api/extensions/**`. Target:
   lines ≥ 90% / branches ≥ 80% per AF-9.
5. Deliver coverage report + pre/post-diff to pm.

## Known minor noise

- 3 TypeScript `'await' has no effect on the type of this expression`
  warnings on `await expect(...).rejects.toThrow(...)` lines in AF-3b.
  Runtime is correct (tests pass; without await would give unhandled
  rejections). This is a known bun:test `.d.ts` quirk — safe to
  ignore or suppress with `// @ts-expect-error` if it bothers the
  next reviewer.

## Open comms

- pm is expecting pings when #14 lands and when #11 is fully live.
- dev-2 (handed off at 83%) asked to ping when AF-1 tests flip green
  so they can close the loop mentally. Team-lead assigned #14 to dev-3.
- Task board: #11 sits `in_progress` with me as owner. The next sdet
  can either continue under that task or claim a fresh sub-task.

## Quick verify command

```sh
bun test src/__tests__/audit-regressions.test.ts
# Expected: 14 pass, 6 skip, 0 fail (before #14 lands).
```
