# Baseline `scripts/test.sh` on current main

**Recorded:** 2026-04-20 (sdet-2, pre-dev-2 landings for #12, #14, #17)
**Git HEAD:** `07af445` (chore(docker): add git binary to Dockerfile.dev)
**Full log:** `/tmp/baseline-main.log`

## Summary

| Metric       | Count |
| ------------ | ----- |
| Total files  | 345   |
| Total pass   | 5283  |
| Total fail   | 45    |

## Failing files on baseline main (to diff against post-merge in #10)

These 9 files hold all 45 failing assertions. Task #10 MUST show zero
new entries in this list — no existing-green file flips red, and no
file not listed here appears in the post-merge fail list.

- `src/__tests__/extension-agent-integration.test.ts`
- `src/__tests__/ext-registry-executor.test.ts`
- `src/__tests__/marketplace-routes.test.ts`
- `src/__tests__/memory-validation.test.ts`
- `src/__tests__/messages-multipart-route.test.ts`
- `src/__tests__/namespace-integration.test.ts`
- `src/__tests__/tool-executor-ns.test.ts`
- `src/__tests__/tool-executor-shared-vars.test.ts`
- `src/__tests__/tool-use-comprehensive.test.ts`

## Interpretation notes

- Per-file fail counts (from baseline log):
  - `memory-validation`: 2
  - `messages-multipart-route`: 1
  - `namespace-integration`: 9
  - `tool-executor-ns`: 2
  - `tool-executor-shared-vars`: 6
  - `tool-use-comprehensive`: 10
  - Remaining 3 files account for the other 15 (not re-counted per-file in the log output; see `/tmp/baseline-main.log` if needed).
- Baseline is **45 failing assertions, not ~180** as estimated in the
  requirements (NR-5). Acceptance bar for #10 stands: `TOTAL_FAIL` must
  be **≤ 45** after this branch lands, and the failing-files list must
  be a subset of the 9 above.
- `scripts/test.sh` runs each file in its own `bun test` subprocess
  (6-way parallel, `PARALLEL` env override). Rerun with same defaults.

## Reproduction

```sh
cd /home/dev/work/ez-corp-ai
scripts/test.sh 2>&1 | tee /tmp/post-merge.log
# Then diff TOTAL_FAIL and the Failed files block against this doc.
```
