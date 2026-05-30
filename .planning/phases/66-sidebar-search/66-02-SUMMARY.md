---
phase: 66-sidebar-search
plan: 02
subsystem: ui
tags: [search, sidebar, svelte, localStorage, dompurify, debounce, hybrid-search, deep-link]

# Dependency graph
requires:
  - phase: 66-01
    provides: "loadSearchMode/persistSearchMode/groupHitsByConversation (search-mode.ts) + sanitizeSnippet (snippet-sanitize.ts)"
  - phase: 65-hybrid-search
    provides: "searchMessages() client + SearchMode/MatchType/MessageSearchHit/SearchMessagesResponse contract (web/src/lib/api.ts)"
provides:
  - "ConversationList sidebar search-mode toggle (Hybrid/Keyword/Semantic, defaults Hybrid) + global-LS persistence"
  - "Two-section message-grained results (Conversations title-only + grouped Messages) with sanitized <mark> snippets, role badge, match-type glyph, relative time"
  - "Widened onselect prop signature: (id: string, messageId?: string) — message rows emit messageId for 66-03 deep-link"
  - "Non-blocking degraded notice + generic empty state"
affects: [66-03-deep-link, 66-04-e2e]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Reuse 66-01 pure helpers (load/persist/group/sanitize) wired into the SUT — never reimplement persistence/grouping/sanitization"
    - "Pure derivation for degraded annotation (semanticDegraded) — reads the last response, never mutates the stored/selected mode (Pitfall 4)"
    - "Component fetch-seam mock (vi.mock $lib/api.js for searchMessages + fetchConversations) + fake timers for debounce assertions"
    - "Explicit-pathspec `git commit <files>` to land owned files while a sibling agent has unrelated files staged in the shared index"

key-files:
  created:
    - web/src/__tests__/conversation-list-search-mode.component.test.ts
  modified:
    - web/src/lib/components/ConversationList.svelte
    - web/src/__tests__/conversation-list-logic.test.ts

key-decisions:
  - "Conversations section reduced to TITLE-ONLY (removed the searchConversations/searchResults content-match merge) — the Messages section now owns content matches, avoiding double-surfacing the same conversation (66-RESEARCH.md Open Question 1, recommended)"
  - "Degraded annotation derives from lastResponse.degraded only; dims+titles the Semantic segment but keeps it selectable (CONTEXT lock); never writes the LS key on degrade"
  - "Match-type glyphs: lexical = open-quote, semantic = approx (≈), both = ⊕"
  - "selectMode captures query+mode at debounce-schedule time and routes through the SAME handleSearchInput debounce/guard rather than firing an immediate fetch"
  - "Section headers render only when their section is non-empty (discretion per 66-CONTEXT.md); the single generic 'No matching messages.' empty state covers the all-empty case"

requirements-completed: [UI-01, UI-02, UI-04]

# Metrics
duration: 5min
completed: 2026-05-29
---

# Phase 66 Plan 02: Sidebar Search Wiring Summary

**Wired the 66-01 pure helpers into `ConversationList.svelte` — a Hybrid/Keyword/Semantic mode toggle with global-localStorage persistence, two labeled result sections (title-only Conversations + grouped, `<mark>`-sanitized Messages), a non-blocking degraded notice, and a widened `onselect(id, messageId?)` for downstream deep-link — all preserving the existing 300ms debounce, `<2`-char guard, and instant title matching.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-29T21:40:54Z
- **Completed:** 2026-05-29T21:45:54Z
- **Tasks:** 2
- **Files:** 3 (1 SUT + 1 new component test + 1 extended pure-logic test)

## Accomplishments
- **UI-01** — 3-segment Hybrid/Keyword/Semantic toggle on a second row beneath the search input, shown only while the search box is open, defaulting to Hybrid. Built inline (no segmented primitive exists per 66-RESEARCH.md): three `aria-pressed` buttons with active-state styling.
- **UI-02** — `searchMode` initializes from `loadSearchMode()` (global key `chatSearch.mode`); `selectMode` calls `persistSearchMode` then re-runs the query. Remount restores the persisted mode. The stored preference is NEVER mutated by a degraded server response.
- **UI-04** — Preserved the exact 300ms debounce, `searchQuery.length < 2` early-return, `searchLoading` lifecycle, and instant client-side title matching (now title-only). The debounced body fetches via `searchMessages(projectId, query, { mode })`.
- **Two-section results** — `Conversations` (title-only instant matches, existing styling) + `Messages` (grouped by conversation via `groupHitsByConversation`; group header = title, nested rows = each hit). Each message row: `{@html sanitizeSnippet(hit.snippet)}` in the `[&_mark]:bg-yellow-500/30 …` span + role badge + match-type glyph + `relativeTime(hit.createdAt)`, click → `onselect(hit.conversationId, hit.messageId)`.
- **Degraded + empty** — Inline non-blocking notice ("Semantic search unavailable — showing keyword matches.") above results when `lastResponse.degraded`; single generic "No matching messages." when both sections are empty and not loading.
- **Widened `onselect`** to `(id: string, messageId?: string) => void`; title-row callsites keep working (optional 2nd arg); message rows emit the `messageId` consumed by 66-03.

## Task Commits

1. **Task 1: Mode toggle + global LS persistence + widened onselect** - `8b24c312` (feat)
   - SUT script + template changes (imports, `searchMode` state, `selectMode`, toggle render, two-section block, title-only `filteredConversations`) + extended `conversation-list-logic.test.ts` (`isSemanticDegraded` + `groupHitsByConversation` wiring).
2. **Task 2: Component test for the search-mode surface** - `453d904c` (test)
   - `conversation-list-search-mode.component.test.ts` (11 vitest cases; `searchMessages`/`fetchConversations` fetch-seam mocked; fake timers for debounce).

_Note: the SUT template work for both tasks was tightly coupled (the toggle, the message-grained fetch, and the two-section block share state), so it all landed in the Task-1 commit; Task 2's commit is the new component test that exercises it. The pure-logic RED+GREEN folded into Task 1 because the imported 66-01 helpers passed clean on first wiring._

## Files Created/Modified
- `web/src/lib/components/ConversationList.svelte` — imports `searchMessages` + 66-01 helpers; `searchMode` global-LS state; `selectMode`; widened `onselect`; 3-segment toggle; message-grained `handleSearchInput`; title-only `filteredConversations`; `messageGroups`/`semanticDegraded` deriveds; `matchTypeGlyph`; two-section results + degraded notice + empty state. Removed the `searchConversations`/`SearchResult`/`searchResults` content-merge path.
- `web/src/__tests__/conversation-list-search-mode.component.test.ts` — 11 vitest/@testing-library cases (toggle/default/persist/remount, `<2` guard + 300ms debounce, grouped Messages, lexical-mark-survives/semantic-plain, `<script>` sanitization, instant title section, `onselect(convId, messageId)`, degraded notice without mutating LS, generic empty state).
- `web/src/__tests__/conversation-list-logic.test.ts` — appended `isSemanticDegraded` (degraded → annotate without mutating selected mode) + `groupHitsByConversation` wiring cases (imports the real 66-01 helper).

## Decisions Made
- **Conversations = title-only** (Open Question 1, the 66-RESEARCH.md recommendation): removed the `searchConversations`-backed content merge so a conversation isn't surfaced twice. UI-04's literal "title matching continues to work" is preserved; content matches now live exclusively in the Messages section.
- **Degraded is a pure read** (`semanticDegraded = lastResponse?.degraded === true`): drives the dim + title + inline notice; the Semantic segment stays selectable; the LS key is only ever written by an explicit `selectMode` click (Pitfall 4).
- **`selectMode` reuses the debounce**: it sets+persists the mode then calls `handleSearchInput()`, going through the same 300ms timer and `<2` guard rather than bypassing them.
- **Match-type glyphs** lexical/semantic/both → `“` / `≈` / `⊕` (discretion).
- **Section headers conditional on non-empty section**; all-empty → the single generic empty state (CONTEXT lock: no mode-specific copy).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Component test asserted a uniquely-findable "Conversations" header that collides with the always-present panel title**
- **Found during:** Task 2 (component test driver iteration)
- **Issue:** `findByText("Conversations")` threw `Found multiple elements` — the sidebar panel header (`<span>Conversations</span>`) and the results-section header share the literal text, so the single-match query is ambiguous. This was a test-assertion bug, not a component bug (the section header rendered correctly).
- **Fix:** Assert the title row directly (`findByText("Alpha Project")`) and use `findAllByText("Conversations")` with a `>= 2` count to prove both the panel header and the results-section header are present.
- **Files modified:** web/src/__tests__/conversation-list-search-mode.component.test.ts
- **Verification:** 11/11 cases green.
- **Committed in:** `453d904c` (Task 2 commit)

### Environment note (not a plan deviation)
- **Sibling-agent shared index:** while landing Task 1, the concurrent 66-03 agent had `web/src/app.css` and `web/src/lib/components/ChatMessage.svelte` staged in the shared git index, and a transient index race briefly unstaged my `git add`. Resolved by committing with explicit pathspec (`git commit <my-files> -m …`), which commits only the named paths and ignores the sibling's staged files. Verified each of my two commits contains exactly its own files (`git show --stat`): zero touches to the chat route, ChatThread, ChatMessage, or app.css.

---

**Total deviations:** 1 auto-fixed (test-assertion ambiguity).
**Impact on plan:** No scope change. All three declared files only; Phase 65 types imported from `$lib/api.js` (zero redefinitions); 66-01 helpers consumed, not reimplemented.

## Issues Encountered
- **`.planning/` lives at the repo ROOT**, not under `web/` — the `<files_to_read>` paths were relative to repo root. Read accordingly.
- **`scripts/coverage-thresholds.json` not pinned for the new surface:** the file is dirty from a parallel session and has no entries for `ConversationList.svelte` or the `web/src/lib/search/*.ts` modules. Per the explicit-path / scope-boundary discipline (and the 66-01 SUMMARY's deferral note), it was NOT staged or modified by this plan. Pinning the search surface in the coverage gate is deferred to whoever owns that file. Logged here as a carry-forward, not silently fixed.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- **66-03 (deep-link):** the message rows now emit `onselect(conversationId, messageId)`; the consumer can append `?m=` / drive `resolveDeepLink` to scroll-to-message. (66-03 was observed landing its `?m=` append + ChatMessage pulse concurrently.)
- **66-04 (e2e):** the two-section Messages UI + degraded notice + empty state are seedable via the 66-01 `/api/search/messages` Playwright mock (`setupApiMocks(page, { searchMessages: {...} })`).
- **Deferred:** pin `web/src/lib/components/ConversationList.svelte` + `web/src/lib/search/*.ts` in `scripts/coverage-thresholds.json` (parallel-session ownership of that file).

---
*Phase: 66-sidebar-search*
*Completed: 2026-05-29*

## Self-Check: PASSED

- All 3 deliverable files + SUMMARY.md exist on disk.
- Both task commits (8b24c312, 453d904c) present in git log.
- Tests green: 45/45 bun (conversation-list-logic) + 11/11 vitest (conversation-list-search-mode.component).
- tsc --noEmit clean on all three files under the full web tsconfig (post svelte-kit sync).
- Zero Phase-65 type redefinitions in the component; searchMessages + 66-01 helpers imported.
- Scope clean: each commit contains only its own files; zero touches to chat route / ChatThread / ChatMessage / app.css (66-03's files).
- Sacred-12-stash invariant held throughout (12 → 12).
