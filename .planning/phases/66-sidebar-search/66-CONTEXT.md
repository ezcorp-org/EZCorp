# Phase 66: Sidebar Search - Context

**Gathered:** 2026-05-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a Hybrid / Keyword / Semantic **mode toggle** to the existing
`ConversationList.svelte` sidebar search, persist the chosen mode across sessions
(localStorage), switch the sidebar from conversation-grained search
(`searchConversations`) to **message-grained** search (`searchMessages` — the
Phase 65 `/api/search/messages` contract), and **deep-link** a clicked result to
the matching message with a brief highlight pulse — all **without regressing** any
existing sidebar-search behavior (debounce, min query length, instant title
matching, project + user scoping).

Requirements: UI-01, UI-02, UI-03, UI-04.

NOT in scope: the Cmd+K command palette (Phase 67), the backfill script
(Phase 68), the search SQL/API itself (Phase 65 — already shipped). This phase is
purely the sidebar UI consuming the existing `searchMessages()` client contract.

</domain>

<decisions>
## Implementation Decisions

### Mode toggle (UI-01, UI-02)
- **Full-width segmented control on a second row** beneath the search input,
  rendered while the search panel is open. The existing search row (icon + input +
  loading dot + close) stays as-is; the toggle gets its own row so it isn't
  crowded at sidebar width.
- **Text labels**: `Hybrid` / `Keyword` / `Semantic` (a 3-segment control). No
  icon-only — the mode names aren't obvious from icons.
- **Default `Hybrid`** on first use (UI-01).
- **Global localStorage preference** — one key across all projects (search mode is
  a personal habit, not project-specific). Reuse the codebase's existing
  `localStorage` convention/prefix (cf. `ezcorp-last-chat:<projectId>`,
  `COLLAPSE_LS_KEY` in `ConversationList.svelte`). Key name is Claude's discretion
  but must be project-agnostic (no projectId in the key).
- **Switching mode re-runs the current query immediately** in the new mode,
  respecting the same debounce + `< 2` char min-length rules as typing. Lets users
  compare modes live without retyping.

### Result display (UI-04 + match-type asymmetry)
- **Two labeled sections** in the results panel:
  1. **"Conversations"** — the existing instant, client-side **title** matches
     (UI-04: must keep working, no debounce).
  2. **"Messages"** — the debounced message-grained API hits from
     `searchMessages()`.
- **Messages section is grouped by conversation**: the conversation **title is the
  group header**; the conversation's matching messages are nested rows beneath it.
  **The group header is NOT a deep-link** — each nested **message row** deep-links
  to its own `messageId` (see Deep-link below).
- **Each message row shows**: snippet · a **user/assistant role badge** · a
  **match-type icon** · **relative time**. (Conversation title lives in the group
  header, not repeated per row.)
- **Match-type indicated by a small icon per row** — distinct glyphs for
  `lexical` / `semantic` / `both` (e.g. magnifier / sparkle / combined). Icon is
  the primary "why this matched" cue, especially since semantic rows render plain
  snippets with no `<mark>`.
- **Snippet rendering (locked from Phase 65)**: render `snippet` through a
  sanitizer that **allow-lists only `<mark>`** (lexical/both carry `<mark>`;
  semantic snippets are plain ±35-word windows with no fake highlight). Reuse the
  existing `[&_mark]:bg-yellow-500/30 …` styling already on the content-match row.

### Deep-link + highlight pulse (UI-03)
- **Carry the target via a `?m=<messageId>` URL query param** on the conversation
  route (`/project/[id]/chat/[convId]?m=<messageId>`). `ChatThread` reads and
  strips it on mount — the **same pattern as the existing `?initial` param**.
  Shareable, survives reload, Playwright-testable.
- **Reuse the existing scroll-to-anchor machinery** — `data-message-id` anchors
  (`MESSAGE_ANCHOR_ATTR`) + `scrollTopForAnchor()` in `chat-scroll-restore.ts`.
- **If the target message is paginated out of the loaded window** (the anchor
  isn't in the DOM / `scrollTopForAnchor` returns null): **load the message window
  around the target** so it's mounted, then scroll + pulse. (Requires ChatThread to
  support loading around an arbitrary message — flag as a research/planning item.)
- **If the target sits on a non-active fork branch**: **switch the active branch**
  to the path containing the message (via ChatThread's `pathToRoot` /
  `navigateBranch`) before scrolling, so every result reliably resolves.
- **Highlight pulse**: a **brief background-color pulse on the message bubble that
  fades out over ~1.5–2s** (ease-out), then clears. Non-disruptive "flash to
  locate" — net-new (no existing pulse animation; `app.css` has only a `shimmer`
  keyframe to model after).

### Degraded & empty states
- **Degraded (`degraded: true`)** — embedder down, `servedMode` fell back to
  `keyword` while `requestedMode` was semantic/hybrid: show an **inline,
  non-blocking notice above the results** (e.g. "Semantic search unavailable —
  showing keyword matches."). It clears when the embedder recovers.
- **Mode toggle while degraded**: **annotate Semantic as unavailable but keep it
  selectable.** The user's selection + persisted preference stay intact; when the
  embedder recovers their mode works again with no re-click.
- **Never auto-mutate the persisted mode preference on degrade.** Degrade only
  affects what's served for that request (`servedMode`); the stored preference is
  the user's choice and is left untouched.
- **Empty results**: a **single generic "No matching messages."** empty state
  regardless of mode. The envelope can't reliably distinguish an un-backfilled
  corpus (semantic returns nothing but `degraded:false`) from a genuine no-match,
  so no mode-specific "indexing in progress" copy. (Empty semantic results on a
  fresh corpus are expected, per Phase 65 — not an error.)

### Claude's Discretion
- Exact localStorage key name (must be global / project-agnostic).
- Specific match-type icons and the role-badge visual treatment.
- Segmented-control component: reuse an existing toggle/segmented primitive if one
  exists, else build inline.
- Pulse keyframe details (color token, exact duration within ~1.5–2s, easing).
- Whether the "Conversations" vs "Messages" section headers are always shown or
  hidden when a section is empty.

</decisions>

<specifics>
## Specific Ideas

- The deep-link param should mirror `?initial` exactly in lifecycle: ChatThread
  consumes it on mount and strips it from the URL so a refresh doesn't re-pulse.
- The degraded notice should read in plain language about *what the user gets*
  ("showing keyword matches"), not about the embedder internals.
- Match-type icon is the main differentiator for `both` vs `semantic` rows, since
  semantic snippets have no `<mark>` to visually distinguish them.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `web/src/lib/api.ts` — `searchMessages(projectId, query, {mode, limit, offset})`
  client helper + types already exist (Phase 65): `SearchMode`
  (`hybrid|keyword|semantic`), `MatchType` (`lexical|semantic|both`),
  `MessageSearchHit` (`conversationId`, `conversationTitle`, `messageId`, `role`,
  `createdAt`, `snippet`, `matchType`, `rankLexical`, `rankSemantic`, `score`),
  `SearchMessagesResponse` (`{ hits, degraded, requestedMode, servedMode }`).
  **This is the contract to consume — do not redefine it.**
- `web/src/lib/components/ConversationList.svelte` — the SUT. Existing search state
  (`searchOpen`, `searchQuery`, `searchResults`, `searchLoading`, `searchTimer`),
  300ms debounce + `< 2` char guard (`handleSearchInput`, lines ~69–85), instant
  client-side title filter merged with API content matches
  (`filteredConversations()`, lines ~91–124), and the `<mark>` snippet styling
  (line ~351). The search-results `{#if isSearchActive}` block is lines ~335–359.
- `web/src/lib/chat-scroll-restore.ts` — `MESSAGE_ANCHOR_ATTR` (`data-message-id`)
  + `scrollTopForAnchor(container, messageId, offset)` (returns `null` when the
  message isn't in the DOM — the pagination-window-collapsed case).
- `web/src/lib/components/ChatMessage.svelte` — already renders
  `data-message-id={message.id}` on every bubble (lines ~463–564); the pulse
  target.
- `web/src/lib/components/ChatThread.svelte` — owns the message window, scroll
  anchoring (`scrollTopForAnchor` usage ~1181/1242), branch navigation
  (`pathToRoot`, `navigateBranch` ~1405), and exported imperative methods. The
  `?m=` consumer + load-around-message + branch-switch wiring lands here.
- The **`?initial` param pattern**: ChatThread reads/strips a query param on mount
  (per `chat/[convId]/+page.svelte` comment ~115–117) — mirror this for `?m=`.

### Established Patterns
- **localStorage helpers** in `ConversationList.svelte` (`COLLAPSE_LS_KEY`,
  load/save with `typeof localStorage === "undefined"` guards) — mirror for the
  mode preference (but global, not per-project).
- **`?initial` query-param mount-consume-and-strip** — the template for `?m=`.
- **`onselect(id)` → `handleSelect(id)` → `goto(/project/.../chat/<id>)`** in
  `chat/[convId]/+page.svelte:150`. To deep-link, `onselect` must also carry the
  `messageId` (widen its signature or add a sibling callback) and `goto` must
  append `?m=<messageId>`.
- **100% test coverage bar** — user-visible surface ships with 100% unit +
  integration + e2e (Playwright) coverage, CI-gated per-file on new paths
  (roadmap reiterates the project standard).

### Integration Points
- `web/src/lib/components/ConversationList.svelte` — mode toggle UI, mode state +
  localStorage persistence, switch `searchConversations` → `searchMessages`,
  two-section grouped results rendering, degraded notice, widened `onselect`.
- `web/src/routes/(app)/project/[id]/chat/[convId]/+page.svelte` (+ the sibling
  `chat/+page.svelte` mobile/index variants) — `handleSelect` must append `?m=` and
  `onselect` callsites updated.
- `web/src/lib/components/ChatThread.svelte` — consume/strip `?m=`, load window
  around target message, branch-switch, trigger scroll + pulse.
- `web/src/lib/components/ChatMessage.svelte` + `app.css` — pulse class/keyframe on
  the `data-message-id` bubble.
- Playwright e2e + vitest component + unit tests across the above (coverage bar).

</code_context>

<deferred>
## Deferred Ideas

- **Keyboard navigation of results** (arrow/Enter to select a hit) — natural fit
  for the Phase 67 Cmd+K palette (PAL-04 a11y), not required for the sidebar here.
- **Result count / "show more" / pagination** beyond the default `limit` — the API
  supports `limit`/`offset` (default 20, max 50) but paged sidebar results weren't
  requested for this phase.
- Mentioned-but-out-of-scope by Phase 65: response caching, rate limiting,
  cross-mode RRF score normalization.

</deferred>

---

*Phase: 66-sidebar-search*
*Context gathered: 2026-05-29*
