---
phase: 66-sidebar-search
verified: 2026-05-30T17:10:00Z
status: passed
score: 5/5 must-haves verified
re_verification:
  previous_status: gaps_found
  previous_score: 4/5
  gaps_closed:
    - "The three pure helper modules are machine-gated at 100% per-file"
  gaps_remaining: []
  regressions: []
human_verification_resolved:
  method: "Playwright screenshot capture (chromium, mocked /api/search/messages fixtures) + computed-style assertions — 3/3 visual tests passed 2026-05-30"
  - test: "Mode toggle appearance and degraded-state dim on Semantic segment"
    result: RESOLVED
    evidence: "Screenshots /tmp/phase66-shots/01-03 show 3-segment control, Hybrid active (accent). /04 shows Semantic visibly dimmed under degraded; assertion: toHaveClass(/opacity-40/) + computed opacity < 1 + search-degraded-notice visible. PASS."
  - test: "message-pulse keyframe under normal motion and prefers-reduced-motion"
    result: RESOLVED
    evidence: "Screenshot /tmp/phase66-shots/05 shows accent-tinted pulse at peak; computed animationName contains 'message-pulse'. /06 under emulateMedia reducedMotion:'reduce' shows neutral bubble; computed animationName === 'none' (app.css:131-133 guard). PASS."
---

# Phase 66: Sidebar Search Verification Report

**Phase Goal:** Users can search the conversation sidebar in Hybrid, Keyword, or Semantic mode, with the chosen mode remembered across sessions, and jump straight to the matching message — all without losing any existing sidebar-search behavior.
**Verified:** 2026-05-30T17:10:00Z
**Status:** passed (both human-verification items resolved via Playwright screenshots + computed-style assertions)
**Re-verification:** Yes — after gap closure (66-05 coverage-gate closure)

---

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| #  | Truth                                                                                              | Status     | Evidence                                                                                                                           |
|----|----------------------------------------------------------------------------------------------------|------------|------------------------------------------------------------------------------------------------------------------------------------|
| 1  | Sidebar offers Hybrid/Keyword/Semantic toggle defaulting to Hybrid; mode persists via localStorage | VERIFIED  | ConversationList.svelte L358-392: 3-segment toggle with `aria-pressed`, initialized from `loadSearchMode()`. Key `chatSearch.mode`. e2e: conversation-search.spec.ts toggle + reload tests |
| 2  | Selecting a result navigates to the conversation and scrolls to the matching message with a pulse  | VERIFIED  | ChatThread.svelte L951,1330-1420: `?m=` consume+strip, `resolveDeepLink` call, `pulseMessageId` state. ChatMessage.svelte L514,570: `pulse ? 'message-pulse' : ''`. app.css L59-65: `@keyframes message-pulse`. e2e: sidebar-search-deeplink.spec.ts 6 cases |
| 3  | Existing behavior (debounce, min query length, title matching, scoping) is unchanged               | VERIFIED  | ConversationList.svelte L74,87-111: `clearTimeout`+300ms `setTimeout`, `searchQuery.length < 2` early-return. L131-140: title-only `filteredConversations`. Two-section e2e assertions in conversation-search.spec.ts |
| 4  | Lexical results keep `<mark>` highlight; semantic-only renders plain snippet without fake highlight | VERIFIED  | ConversationList.svelte L466: `{@html sanitizeSnippet(hit.snippet)}`. snippet-sanitize.ts L17-19: DOMPurify `ALLOWED_TAGS: ["mark"], ALLOWED_ATTR: []`. e2e: `<mark>` survival assertion in conversation-search.spec.ts L313 |
| 5  | Coverage-thresholds.json pins the three pure helper modules at 100% per-file                       | VERIFIED  | scripts/coverage-thresholds.json L40-42: exact 100% pins for `web/src/lib/search/deep-link-resolve.ts`, `web/src/lib/search/snippet-sanitize.ts`, `web/src/lib/search/search-mode.ts`. scripts/test-coverage.sh L39-41: bun shard includes snippet-sanitize + search-mode tests; L116-124: node-vitest --coverage leg for deep-link-resolve, all SF-re-rooted. .github/workflows/ci.yml L92-117: `coverage` job provisions node 22 + runs `bun run test:coverage` on every PR. Commits: 4950dbf1 (harness), 49c3bbc1 (pins), 3cbbe285 (ci). |

**Score:** 5/5 truths verified

---

### Required Artifacts

| Artifact                                                          | Expected                                             | Status    | Details                                                                                 |
|-------------------------------------------------------------------|------------------------------------------------------|-----------|-----------------------------------------------------------------------------------------|
| `web/src/lib/search/deep-link-resolve.ts`                        | Pure resolveDeepLink helper                          | VERIFIED  | 101 lines, exports `resolveDeepLink` + `DeepLinkResolution`. Uses pathToRoot/findLeafByMessageId. No DOM/state imports. |
| `web/src/lib/search/snippet-sanitize.ts`                         | sanitizeSnippet with DOMPurify mark-only allowlist   | VERIFIED  | 19 lines, `DOMPurify.sanitize` with `ALLOWED_TAGS: ["mark"], ALLOWED_ATTR: []`          |
| `web/src/lib/search/search-mode.ts`                              | Global LS key + load/persist/validate/group          | VERIFIED  | 84 lines, exports `SEARCH_MODE_LS_KEY="chatSearch.mode"`, `DEFAULT_SEARCH_MODE="hybrid"`, `loadSearchMode`, `persistSearchMode`, `groupHitsByConversation`. Types imported from `$lib/api.js`. |
| `web/src/lib/components/ConversationList.svelte`                 | Mode toggle + global LS + two-section results + degraded notice + widened onselect | VERIFIED  | Contains `searchMessages`, `loadSearchMode`, `groupHitsByConversation`, `sanitizeSnippet`, `persistSearchMode`. data-testid: `search-mode-toggle`, `search-degraded-notice`, `search-empty`, `message-hit`. onselect widened to `(id, messageId?)`. |
| `web/src/lib/components/ChatThread.svelte`                       | ?m= consume/strip + resolveDeepLink-driven plumbing + pulse trigger | VERIFIED  | `resolveDeepLink` imported at L93. `pendingDeepLink` + `pulseMessageId` state at L951-952. `searchParams.get("m")` at L1330. `replaceState: true, noScroll: true` at L1345-1346. `pulse={msg.id === pulseMessageId}` at L1888. |
| `web/src/app.css`                                                | @keyframes message-pulse + reduced-motion guard      | VERIFIED  | L59-65: `@keyframes message-pulse` + `.message-pulse { animation: message-pulse 1.8s ease-out 1; }`. L131-133: `@media (prefers-reduced-motion: reduce) { .message-pulse { animation: none; } }` |
| `web/src/lib/components/ChatMessage.svelte`                      | pulse prop + data-message-id bubble class binding    | VERIFIED  | L72: `pulse = false` prop. L514: `{pulse ? 'message-pulse' : ''}` on the data-message-id div. |
| `web/src/routes/(app)/project/[id]/chat/[convId]/+page.svelte`  | handleSelect(id, messageId?) appends ?m=             | VERIFIED  | L150-155: `function handleSelect(id, messageId?)` appends `?m=${encodeURIComponent(messageId)}` only when present. Both onselect callsites (L179, L235) forward messageId. |
| `web/e2e/fixtures/api-mocks.ts`                                  | GET /api/search/messages mock                        | VERIFIED  | L492: `path === "/api/search/messages" && method === "GET"` arm present. L219-225: `searchMessages` MockOverrides option with configurable hits + degraded. |
| `web/e2e/fixtures/data.ts`                                       | makeSearchHit factory                                | VERIFIED  | L133: `export function makeSearchHit(overrides: Partial<MessageSearchHit> = {}): MessageSearchHit` |
| `web/e2e/conversation-search.spec.ts`                            | UI-01/02/04 toggle + two-section assertions           | VERIFIED  | 398 lines, 11+ test cases. Contains Hybrid/Keyword/Semantic assertions, reload persistence, two-section render, <2 guard, degraded notice, empty state. |
| `web/e2e/sidebar-search-deeplink.spec.ts`                        | UI-03 deep-link e2e (6 cases)                        | VERIFIED  | 357 lines. 6 test cases: recent, strip-on-reload, paginated-out, off-branch, unknown no-op, group-header not a deep-link. All assert `?m=` URL and pulse via class apply→remove. |
| `web/src/__tests__/deep-link-resolve.unit.test.ts`               | 5+ unit test cases                                   | VERIFIED  | 145 lines, 7 vitest cases. Runs under vitest (.unit.test.ts) due to Svelte-rune transitive import. |
| `web/src/__tests__/snippet-sanitize.test.ts`                     | sanitizeSnippet unit tests                           | VERIFIED  | 45 lines, 5 bun:test cases (mark survives, script stripped, img/onerror stripped, mark-attr dropped, plain text). |
| `web/src/__tests__/search-mode.test.ts`                          | search-mode unit tests                               | VERIFIED  | 167 lines, 11 bun:test cases (default/SSR, valid/garbage/throw, global key, round-trip, setItem throw, grouping). |
| `web/src/__tests__/conversation-list-search-mode.component.test.ts` | Component tests for toggle/LS/debounce/degraded/empty | VERIFIED  | 260 lines, 11 vitest/@testing-library cases. searchMessages mocked. Fake timers for debounce. |
| `scripts/coverage-thresholds.json`                               | 100% per-file entries for web/src/lib/search/*.ts    | VERIFIED  | Lines 40-42: exact 100% pins for all three search modules. Lines 35-36: two latent vitest-only pins (goal-row-logic.ts, GoalPill.svelte) now backed by real lcov data. |
| `scripts/test-coverage.sh`                                       | Extended to measure web/src/lib coverage             | VERIFIED  | Lines 39-41: printf of the two bun:test search-helper suites into the FILES loop. Lines 116-124: node-run `npx vitest` --coverage leg scoped to 5 target lib paths. Lines 128-130: SF:src/ -> SF:web/src/ re-root. Lines 131-135: VITEST_EXIT propagation. Line 157: VITEST_EXIT in final gate condition. |
| `.github/workflows/ci.yml`                                       | `coverage` job provisions node 22 + runs gate on every PR | VERIFIED  | Lines 92-117: `coverage` job with `actions/setup-node@v4` (node-version: '22'), `bun install`, `cd web && bun install`, `svelte-kit sync`, then `bun run test:coverage`. |

---

### Key Link Verification

| From                                               | To                                          | Via                                                    | Status      | Details                                                      |
|----------------------------------------------------|---------------------------------------------|--------------------------------------------------------|-------------|--------------------------------------------------------------|
| `web/e2e/fixtures/api-mocks.ts`                   | `/api/search/messages`                      | `page.route` handler returning `SearchMessagesResponse` | WIRED      | L492: `path === "/api/search/messages"` match arm, JSON fulfill |
| `web/src/lib/search/snippet-sanitize.ts`          | `isomorphic-dompurify`                      | `DOMPurify.sanitize ALLOWED_TAGS: [mark]`               | WIRED      | L14: `import DOMPurify from "isomorphic-dompurify"`. L18: `ALLOWED_TAGS: ["mark"]` |
| `ConversationList.svelte`                         | `searchMessages` (web/src/lib/api.ts)       | debounced fetch in `handleSearchInput`                  | WIRED      | L6: `searchMessages` imported. L103: `const resp = await searchMessages(projectId, q, { mode })` |
| `ConversationList.svelte`                         | `web/src/lib/search/search-mode.ts`         | `loadSearchMode / persistSearchMode / groupHitsByConversation` | WIRED | L13-15: all three imported and used at L66, L119, L138 |
| `ConversationList.svelte`                         | `web/src/lib/search/snippet-sanitize.ts`    | `sanitizeSnippet` before `{@html}`                      | WIRED      | L17: imported. L466: `{@html sanitizeSnippet(hit.snippet)}` |
| `ConversationList.svelte`                         | `onselect` callback                         | `onselect(hit.conversationId, hit.messageId)` on message rows | WIRED | L454: `onclick={() => onselect(hit.conversationId, hit.messageId)}` |
| `+page.svelte`                                    | `goto(...?m=<messageId>)`                   | `handleSelect(id, messageId?)` appends `?m=`            | WIRED      | L150-155: conditional `?m=` append via template literal. L179, L235: both callsites forward messageId |
| `ChatThread.svelte`                               | `?m=` search param                          | `page.url.searchParams.get("m")` on mount + strip via `goto replaceState noScroll` | WIRED | L1330: `searchParams.get("m")`. L1345-1346: `replaceState: true, noScroll: true` |
| `ChatThread.svelte`                               | `web/src/lib/search/deep-link-resolve.ts`   | `resolveDeepLink` to decide branch-switch + window-grow  | WIRED      | L93: `import { resolveDeepLink }`. L1364: `const r = resolveDeepLink(...)` |
| `ChatThread.svelte`                               | `ChatMessage` pulse                         | `pulseMessageId` state → `pulse={msg.id === pulseMessageId}` | WIRED | L1414: `pulseMessageId = target`. L1888: `pulse={msg.id === pulseMessageId}` |
| `web/e2e/sidebar-search-deeplink.spec.ts`         | `/api/search/messages` + `?m=` deep-link    | click hit row → assert URL `?m=` → pulse class apply→remove | WIRED | L116-134: full click→URL→pulse→strip sequence |
| `web/e2e/conversation-search.spec.ts`            | mode toggle + two sections                  | 3-segment default Hybrid, reload restores, both sections render | WIRED | L216-314: toggle, UI-02 persist, two-section, <2 guard, degraded, empty |
| `scripts/test-coverage.sh`                       | `web/src/lib/search/*.ts`                   | bun shards (snippet-sanitize, search-mode) + node-vitest leg (deep-link-resolve) | WIRED | L39-41: two bun shards in FILES glob. L116-124: vitest leg with `--coverage.include='src/lib/search/**'`. L129: SF re-root. L157: VITEST_EXIT gates exit. |
| `scripts/coverage-thresholds.json`               | `web/src/lib/search/*.ts` exact pins        | check-coverage.ts reads thresholds, matches SF paths from merged lcov | WIRED | L40-42: three exact 100% pins. Matched by real lcov data from the node-vitest leg (deep-link-resolve 14/14, snippet-sanitize 3/3, search-mode 31/31). |

---

### Requirements Coverage

| Requirement | Source Plans          | Description                                                                              | Status    | Evidence                                                                 |
|-------------|-----------------------|------------------------------------------------------------------------------------------|-----------|--------------------------------------------------------------------------|
| UI-01       | 66-01, 66-02, 66-04   | Hybrid/Keyword/Semantic mode toggle, defaulting to Hybrid                                | SATISFIED | ConversationList.svelte toggle renders 3 aria-pressed segments; `loadSearchMode()` defaults to "hybrid". e2e asserts `aria-pressed="true"` on Hybrid button |
| UI-02       | 66-01, 66-02, 66-04   | Selected search mode persists across sessions (localStorage)                             | SATISFIED | `persistSearchMode` writes to `chatSearch.mode`; `loadSearchMode` reads it on init. e2e: reload test asserts Keyword stays active after reload |
| UI-03       | 66-03, 66-04          | Selecting a result navigates + scrolls to matching message with brief highlight pulse    | SATISFIED | ?m= appended by handleSelect; ChatThread strips on mount, calls resolveDeepLink, sets pulseMessageId for ~1.8s. e2e: 6 cases covering recent/paginated-out/off-branch/no-op/strip/group-header |
| UI-04       | 66-01, 66-02, 66-04   | Existing sidebar-search behavior (debounce, min query length, title matching) preserved  | SATISFIED | 300ms debounce and `searchQuery.length < 2` guard unchanged. Conversations section is title-only. e2e: `<2` guard test + two-section test with Conversations header assertion |

No orphaned requirements found. REQUIREMENTS.md maps only UI-01..04 to Phase 66; all four are satisfied.

---

### Re-verification: Gap Closure Evidence

The one gap from the initial verification (must-have truth #5) is now closed. Three commits from 66-05 deliver the fix:

**4950dbf1 — Extended scripts/test-coverage.sh**
- `printf` of `web/src/__tests__/snippet-sanitize.test.ts` and `web/src/__tests__/search-mode.test.ts` added to the per-file FILES loop (lines 39-41) — these bun:test suites now feed lcov for snippet-sanitize.ts and search-mode.ts
- New node-run `npx vitest --coverage` leg (lines 116-124) scoped via three `--coverage.include` flags to `src/lib/search/**`, `src/lib/components/goal-row-logic.ts`, and `src/lib/components/GoalPill.svelte` — the only way to measure deep-link-resolve.ts (transitively imports Svelte rune; bun cannot compile it; coverage-v8 needs node:inspector)
- SF path re-root `sed -i 's#^SF:src/#SF:web/src/#'` (line 129) so merge-lcov resolves against repo root
- VITEST_EXIT propagated into final gate condition (line 157)

**49c3bbc1 — Pinned all five targets at 100%**
- `coverage-thresholds.json` lines 40-42: exact 100% pins for `web/src/lib/search/deep-link-resolve.ts`, `web/src/lib/search/snippet-sanitize.ts`, `web/src/lib/search/search-mode.ts`
- Pins now backed by real measured lcov data (14/14, 3/3, 31/31 respectively); not dry-added before measurement
- Two pre-existing latent vitest-only pins (`goal-row-logic.ts`, `GoalPill.svelte`) reconciled — now measured 7/7 and 45/45

**3cbbe285 — Coverage gate wired into ci.yml**
- `coverage` job at ci.yml lines 92-117: provisions node 22 via `actions/setup-node@v4`, installs deps, runs `svelte-kit sync`, then `bun run test:coverage`
- Gate now runs on every PR, not only at SDK release (release-sdk.yml)

**Note on full-tree gate state:** `bun run test:coverage` is currently RED on the working tree due to ~68 pre-existing violations from an uncommitted parallel-session dirty tree (18 modified + 6 untracked src/web files). The HEAD~1 baseline harness fails independently with ~70 violations; the violator diff between baseline and 66-05 branch is empty (zero new violations). 66-05 fixed 2 pre-existing latent violations. This is a concurrent-tree contamination issue outside Phase 66's scope, logged in `deferred-items.md`. The gap is assessed CLOSED on the basis that the harness now measures and pins the three modules at 100% from real lcov data — which is exactly what was missing.

---

### Anti-Patterns Found

No blocker or warning anti-patterns found in any 66-05 deliverable files (scripts/test-coverage.sh, scripts/coverage-thresholds.json, .github/workflows/ci.yml). No TODO/FIXME/XXX, no empty implementations.

---

### Human Verification Required

#### 1. Mode toggle visual appearance and degraded-state Semantic dim

**Test:** Open a chat conversation, click the search icon, observe the toggle. Then type a query while Semantic mode is selected and the mock server returns `degraded: true`.
**Expected:** Three segments render as a visually cohesive control; the active segment is clearly highlighted. When degraded, the Semantic segment appears dimmed (lower opacity / muted styling) but remains clickable.
**Why human:** CSS active/inactive contrast and degraded dim style cannot be verified by grep. Only the class binding and `data-testid` wiring are programmatically confirmed.

#### 2. message-pulse visual appearance and reduced-motion behavior

**Test:** Use a deep-link (`?m=<messageId>`) to navigate to a message. Observe the target bubble. Repeat with `prefers-reduced-motion: reduce` set in the OS or browser.
**Expected:** Normal: a subtle background-color flash fades over ~1.8s on the target message bubble. Reduced-motion: the bubble does not animate (the keyframe is suppressed by the `@media (prefers-reduced-motion: reduce)` guard in app.css).
**Why human:** CSS animation appearance requires visual inspection; the keyframe and reduced-motion guard exist in app.css (verified programmatically), but the actual visual output and timing feel cannot be asserted via grep.

---

*Verified: 2026-05-30T12:00:00Z*
*Verifier: Claude (gsd-verifier)*
