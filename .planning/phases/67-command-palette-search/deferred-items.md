# Phase 67 — Deferred Items (out of scope for the executing plan)

## 67-03 executor discoveries

- **Pre-existing svelte-check errors (baseline, ~34):** `extensions/[id]/audit/+page.svelte`,
  `EntityFormModal.svelte`, `EntityTable.svelte`, `EzPanel.svelte`, `MemoryItem.svelte`,
  `ToolCardRouter.svelte`, `extension-author-page.component.test.ts`, etc. These predate
  67-03 and are unrelated to the message-search change. Not touched.
- **Parallel-session Phase-67 artifacts (out of scope):**
  - `src/lib/search/__tests__/palette-results.test.ts` references a not-yet-created
    `../palette-results` module + has implicit-any params — belongs to a later 67 plan
    (67-04+). Not 67-03's deliverable; left untouched.
  - `src/__tests__/CommandPalette.component.test.ts` errors are likewise from parallel
    palette work, not from the 67-03 search-contract change.
