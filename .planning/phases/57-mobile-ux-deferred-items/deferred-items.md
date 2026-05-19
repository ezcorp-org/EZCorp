# Phase 57 — Deferred Items

Out-of-scope items discovered during execution; logged here to avoid scope creep.

## Plan 57-03 (Wave 2 Track A — picker BottomSheet wraps)

- **Pre-existing vitest failure**: `web/src/__tests__/agent-picker-prefs-route.server.test.ts`
  references the not-yet-created handler at
  `src/routes/api/user/agent-picker/+server`. This is a Plan 57-01 RED
  scaffold awaiting impl in Plan 57-06 (UX-03 agent-picker prefs). The
  failure is unrelated to BottomSheet wrap correctness — keeping it
  out-of-scope per scope boundary rule. Will GREEN when Plan 57-06 ships
  the `/api/user/agent-picker` GET+PUT handler.

- **E2e suite remains fully fixme'd** (`web/e2e/bottom-sheet-pickers.spec.ts`):
  The `(app)` route group is auth-protected; the non-Docker Playwright
  config has no auth setup. Un-fixme'ing converts the cases into RED
  failures on every CI run, masking real wrap regressions. Component-
  layer wrap correctness is verified by:
    - `BottomSheet.component.test.ts` 8/8 GREEN
    - source-grep: every picker has `import BottomSheet` + `bp.below`
      conditional wrap
  Phase 59 (TEST-03) or an opportunistic 57-04+ pass owns wiring real
  route fixtures + Docker auth harness so these e2e cases can flip
  GREEN. The deterministic `open-*-picker` testids already landed in
  57-03 — only URL + auth scaffolding is missing.
