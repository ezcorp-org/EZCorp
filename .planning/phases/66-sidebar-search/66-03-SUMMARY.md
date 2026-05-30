---
phase: 66-sidebar-search
plan: 03
subsystem: ui
tags: [search, deep-link, scroll, pulse, svelte, chat-thread]

# Dependency graph
requires:
  - phase: 66-sidebar-search
    plan: 01
    provides: "resolveDeepLink() — pure window/branch decision helper (web/src/lib/search/deep-link-resolve.ts)"
  - phase: 66-sidebar-search
    plan: 02
    provides: "ConversationList.onselect widened to (id, messageId?) => void + search-hit rows calling onselect(conversationId, messageId)"
provides:
  - "?m=<messageId> deep-link plumbed end-to-end: handleSelect appends it, ChatThread consumes/strips it on mount, resolves via resolveDeepLink (branch-switch/window-grow, never re-fetch), scrolls, and pulses the target bubble"
  - "@keyframes message-pulse + .message-pulse (one-shot accent fade, reduced-motion-guarded) in app.css"
  - "ChatMessage `pulse` boolean prop driving the highlight class on the data-message-id bubble"
affects: [66-04-e2e]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Consume-and-strip URL param on mount mirroring the existing ?initial pattern (goto replaceState + noScroll), preserving other params via URLSearchParams.delete"
    - "Pure resolution-descriptor helper applied by the component (resolveDeepLink) — component only applies branch-switch/window-grow, never recomputes the tree/window math"
    - "Prop-driven one-shot pulse (boolean prop + timer-cleared state) — observable in component tests, self-clearing via a CSS one-shot animation"

key-files:
  created: []
  modified:
    - web/src/routes/(app)/project/[id]/chat/[convId]/+page.svelte
    - web/src/lib/components/ChatThread.svelte
    - web/src/lib/components/ChatMessage.svelte
    - web/src/app.css
    - web/src/lib/components/ChatThread.component.test.ts

key-decisions:
  - "Optional-typed inline mobile-drawer arrow `(id: string, messageId?: string) => …` so it stays assignable to BOTH the pre-66-02 narrow `(id: string) => void` and 66-02's widened `(id, messageId?) => void` ConversationList.onselect — no churn either way, and no edit to ConversationList (66-02's file)"
  - "Deep-link action gated behind initialScrollDone + populated allMessages + container (analogous to the ?initial apply) so the open-scroll-restore decides first and the stick-to-bottom ResizeObserver can't yank to bottom (Pitfall 1)"
  - "Set stuck=false + userScrolledUp=true before scrolling to the (older) target — mirrors the open-scroll restore-branch trio"
  - "scrollTopForAnchor retried once after an extra tick to cover the DOM-mount race after a branch-switch/window-grow (Pitfall 2), then startAnchorReapplyWatch handles late tool-card/image height growth"
  - "Pulse is prop-driven (pulse={msg.id === pulseMessageId}) per 66-RESEARCH Open Question 2 — observable in component tests; timer (1.8s) clears it, plus conv-switch and unmount clear the timer"
  - "Pulse class applied to BOTH the user and assistant data-message-id bubbles (the two interactive message rows); color via color-mix(in srgb, var(--color-accent) 28%, transparent) fading to transparent"
  - "Unknown/deleted target (resolveDeepLink → found:false) is a silent no-op, mirroring ?initial / @[file:…] for missing targets; the param is still stripped"

requirements-completed: [UI-03]

# Metrics
duration: 6min
completed: 2026-05-29
---

# Phase 66 Plan 03: Deep-Link Scroll + Pulse Summary

**The `?m=<messageId>` deep-link plumbed end-to-end (UI-03): the chat route appends `?m=` from both onselect callsites, ChatThread consumes-and-strips it on mount, resolves the target with the pure `resolveDeepLink` helper (branch-switch / window-grow, never re-fetch), scrolls to it, and fires a reduced-motion-guarded ~1.8s highlight pulse on the target bubble — then clears so a reload never re-pulses.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-05-29T21:41:13Z
- **Completed:** 2026-05-29T21:46:51Z
- **Tasks:** 3
- **Files modified:** 5 (route + ChatThread + ChatMessage + app.css + ChatThread component test)

## Accomplishments
- **Route (`+page.svelte`):** `handleSelect(id, messageId?)` appends `?m=${encodeURIComponent(messageId)}` only when a messageId is present (no stray `?m=` on a plain title-row select). Both onselect callsites forward the messageId — desktop via `onselect={handleSelect}`, mobile drawer via an optional-typed inline arrow that stays assignable to both the narrow and 66-02-widened ConversationList signature.
- **app.css:** Net-new `@keyframes message-pulse` (accent → transparent fade, `1.8s ease-out 1`, one-shot) modeled on `shimmer`, with a `.message-pulse { animation: none; }` entry added to the existing `@media (prefers-reduced-motion: reduce)` block.
- **ChatMessage.svelte:** New `pulse` boolean prop conditionally appends `message-pulse` to the class on both the user-row and assistant-row `data-message-id` bubbles. Prop-driven, self-clearing.
- **ChatThread.svelte:** onMount reads `?m=` (alongside `?initial`), stashes `pendingDeepLink`, and strips the consumed param(s) via `goto(pathname + remainingQS, { replaceState: true, noScroll: true })` — preserving any other params. A gated `$effect` (after `initialScrollDone`, populated `allMessages`, `container` present) calls `resolveDeepLink`, applies branch-switch (`activeLeafId = r.newLeafId`) and/or window-grow (`visibleMessageCount = r.newVisibleCount`) with `await tick()`, sets `stuck=false`/`userScrolledUp=true`, scrolls via `scrollTopForAnchor` (retry-once on DOM-mount race + `startAnchorReapplyWatch` for late mounts), sets `pulseMessageId`, and clears it after 1.8s. Conv-switch and unmount clear the pulse timer. `pulse={msg.id === pulseMessageId}` threaded into `<ChatMessage>`.
- **Component test:** 3 new cases asserting the wiring — consume+strip (`?m=` gone from the URL after mount), pulse-applied-then-cleared (fake timers, `.message-pulse` class on the `a1` bubble then gone after 1.9s), unknown-id silent no-op (param stripped, no pulse, no throw).

## Task Commits

1. **Task 1: Append ?m= in handleSelect + forward messageId** — `39253e1b` (feat)
2. **Task 2: message-pulse keyframe (app.css) + ChatMessage pulse prop** — `d1ea6b28` (feat)
3. **Task 3: ChatThread ?m= consume/strip + resolveDeepLink scroll + pulse + extended component test** — `ad122637` (feat)

## Files Created/Modified
- `web/src/routes/(app)/project/[id]/chat/[convId]/+page.svelte` — `handleSelect(id, messageId?)` appends `?m=`; both onselect callsites forward messageId
- `web/src/app.css` — net-new `@keyframes message-pulse` + `.message-pulse` + reduced-motion guard
- `web/src/lib/components/ChatMessage.svelte` — `pulse` prop + `.message-pulse` class on both data-message-id bubbles
- `web/src/lib/components/ChatThread.svelte` — `?m=` consume/strip onMount, `resolveDeepLink`-driven branch-switch/window-grow/scroll/pulse effect, pulse-timer cleanup, `pulse` prop into `<ChatMessage>`
- `web/src/lib/components/ChatThread.component.test.ts` — +3 wiring cases (consume/strip, pulse-then-clear, unknown-id no-op)

## Verification
- `bunx vitest run src/lib/components/ChatThread.component.test.ts` → 23/23 green (20 prior + 3 new).
- `bunx vitest run …deep-link-resolve.unit.test.ts` → 7/7 (pure resolver math) still green.
- Adjacent suites green, zero regression: ChatThread.behavior (17), ChatThread.coverage + ChatThread.render-branches + ChatMessage.attachments + ChatMessage.excludedPill (68 combined).
- `bunx --bun svelte-kit sync && bunx tsc --noEmit` → zero errors on any of the 5 files (full web tsconfig, which does NOT exclude tests).
- `bunx svelte-check` → zero errors on my files (only the pre-existing `seedMessages` `state_referenced_locally` warning at ChatThread.svelte:273, not mine).
- Route re-typechecked clean against 66-02's now-landed widened `onselect` signature.
- Contract greps: `resolveDeepLink` imported/used; `searchParams.get("m")`; `replaceState: true` + `noScroll: true` (2 occurrences — `?initial` + `?m=`).

## Decisions Made
See frontmatter `key-decisions`. Highlights: optional-typed inline arrow for cross-signature compatibility with 66-02; deep-link action gated like `?initial`; `stuck=false`/`userScrolledUp=true` before scroll; retry-once + anchor-reapply-watch for the mount race; prop-driven self-clearing pulse on both bubble rows; unknown id silent no-op.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Sibling 66-02's pre-staged index files were swept into the Task-2 commit; split back out**
- **Found during:** Task 2 (commit)
- **Issue:** `git commit` after `git add src/app.css src/lib/components/ChatMessage.svelte` produced a 4-file commit including `web/src/lib/components/ConversationList.svelte` and `web/src/__tests__/conversation-list-logic.test.ts` — files owned by the concurrent 66-02 agent, which I must NOT touch. Root cause: the sibling agent had those two files already staged in the shared index; a bare `git commit` commits the whole index, not just my freshly-added paths.
- **Fix:** `git reset --soft HEAD~1`, then `git restore --staged` the two 66-02 files (unstages without altering their working-tree content), then re-committed with only my two files in the index. The sibling's work was preserved untouched (it has since landed independently as commits `8b24c312` / `453d904c`).
- **Files modified:** none beyond my own; the corrective action only re-scoped the commit.
- **Verification:** `git show --stat d1ea6b28` shows exactly `web/src/app.css` + `web/src/lib/components/ChatMessage.svelte`. Sacred-12-stash invariant held (12 → 12).
- **Committed in:** `d1ea6b28` (the corrected Task-2 commit)
- **Process note:** Subsequent commits verified the staged index (`git diff --cached --name-only`) before committing to prevent recurrence.

**2. [Rule 1 - Bug] Mobile-drawer inline onselect arrow failed typecheck under the pre-66-02 narrow signature**
- **Found during:** Task 1 (svelte-check)
- **Issue:** Writing the mobile callsite as `onselect={(id, messageId) => …}` (two untyped params) failed: at the moment of execution, 66-02 had not yet widened `ConversationList.onselect` (still `(id: string) => void`), so a 2-arg handler tripped "Target signature provides too few arguments" + implicit-any.
- **Fix:** Typed the params explicitly with the second optional — `(id: string, messageId?: string) => …`. An arrow with a trailing optional param is assignable to the narrow `(id: string) => void` AND to 66-02's widened `(id, messageId?) => void`, so it typechecks under both — no edit to ConversationList required, and verified clean after 66-02 landed.
- **Files modified:** web/src/routes/(app)/project/[id]/chat/[convId]/+page.svelte
- **Verification:** `bunx svelte-check` clean on the route both before AND after 66-02 widened the signature.
- **Committed in:** `39253e1b` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking commit-scope correction, 1 cross-signature typing fix)
**Impact on plan:** No scope creep. All 5 declared files modified exactly as planned; zero touches to ConversationList.svelte (66-02) or the search helpers (66-01); `resolveDeepLink` imported, never reimplemented.

## Issues Encountered
- `scripts/coverage-thresholds.json` does not pin ChatThread.svelte / ChatMessage.svelte / deep-link-resolve.ts. It is a parallel-session-dirty file whose ownership was deferred by 66-01; per scope-boundary/explicit-path discipline I did not stage or modify it. My new ChatThread wiring branches are exercised by the 3 new component tests; the pure resolver math is 100% covered by 66-01's unit test. Pinning these SUT modules in the gate remains a downstream/owner task.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- 66-04 (e2e) can now drive the full sidebar-search → deep-link journey: seed `setupApiMocks(page, { searchMessages: { hits: [makeSearchHit(...)] } })` (66-01 fixture), click a result row (66-02 sidebar), and assert the chat thread navigated with `?m=`, scrolled to the message, and pulsed it (`.message-pulse`).
- No blockers.

---
*Phase: 66-sidebar-search*
*Completed: 2026-05-29*

## Self-Check: PASSED

- All 5 deliverable files + SUMMARY.md exist on disk.
- All 3 commits (39253e1b, d1ea6b28, ad122637) present in git log.
- 23/23 ChatThread component tests green (20 prior + 3 new); 7/7 pure resolver; 68 adjacent green; zero tsc/svelte-check errors on owned files.
- Sacred-12-stash invariant held throughout (12 → 12); zero ConversationList.svelte (66-02) touches.
