# Phase 67: Command Palette Search - Research

**Researched:** 2026-05-30
**Domain:** SvelteKit (Svelte 5 runes) command-palette UX + PGlite/pgvector cross-project hybrid search SQL (full-stack)
**Confidence:** HIGH (all claims verified against in-tree source; no external/training-data dependence)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Entry model & two-surface relationship (PAL-01, PAL-02)**
- **One component, two entry views** — extend `CommandPalette.svelte`; do NOT build a parallel component.
- **`Cmd+K`** opens the palette with the **search field focused**, the command list visible below. Cmd+K *leans search* but is still the unified palette.
- **`Cmd+Shift+P`** opens the **same palette in pure-command mode** — lands in the command list (search field not focused). This is the rebind that satisfies PAL-02.
- **Crossing is allowed** within one open palette — reuse the existing `goBack()` / empty-query-Backspace pattern. Both shortcuts just pick the starting view.
- **Replace the old `search-conversations` command.** The existing conversation-grained sub-view (uses `searchConversations`, deep-links to a *conversation*, bails on global project) is removed; the new message-grained search (deep-links to a *message*) is the single search surface.

**Search scope (PAL-01) — full-stack, cross-project**
- **Cross-project search.** Results span **all of the requesting user's projects**, not just the active one.
- **Implementation: extend the Phase 65 backend** (NOT client fan-out, NOT active-project-only). Add an "all my projects" scope to `searchMessages` query builder (`src/db/queries/message-search.ts`) and the `/api/search/messages` endpoint (new scope param; today it hard-requires a single `projectId`). The tenant filter must still run **inside/before the HNSW ANN scan** (Phase 65 SRCH-03/05 invariant) — now scoped to the user's project set. Ranked in one SQL round-trip.
- Backend change ships with its own unit + integration coverage.

**Empty / initial state (PAL-01)**
- **Empty query shows the existing command list** — recent commands, then grouped commands.
- **No new "recent searches" surface** for v1.

**Result mixing & grouping (PAL-03, PAL-04)**
- **Commands and messages coexist** once the user types (≥2 chars): matching commands AND message hits render together in one scrolling list.
- **Section order when a conversation is active:** 1. **Commands**, 2. **In this conversation**, 3. **Other conversations**.
- **"Other conversations" is grouped by project, then conversation** — project header → conversation title sub-header → message rows. Conversation title is a **non-clickable group header**; each **message row deep-links to its own `messageId`**.
- **When NO conversation is active**: drop the In/Other split — show a **single "Messages" section** (still grouped by project → conversation), Commands still on top.
- **Each message row shows**: snippet · user/assistant role badge · **match-type icon** (`lexical`/`semantic`/`both`) · relative time.

**Deep-link + highlight (PAL-05) — reuse Phase 66 verbatim**
- Selecting a message hit deep-links via the **`?m=<messageId>`** URL param; `ChatThread` already consumes/strips it. **No new deep-link machinery.**

**Snippet & degraded handling — reuse Phase 66 verbatim**
- Render snippets through the existing **`<mark>`-only sanitizer** (`snippet-sanitize.ts`).
- **Degraded**: inline, non-blocking notice; never auto-mutate the user's mode preference.
- **Empty results:** single generic "No matching messages."

**Mobile fallback (PAL-07)**
- On **`<lg`** (reuse `useBreakpoint("lg")`), render the palette inside the shared **`BottomSheet`**. Desktop keeps the centered modal.
- **Auto-focus the search input on open** even on mobile.
- **Same section structure as desktop** inside the sheet. Do NOT flatten the project nesting on mobile.

**Keyboard navigation & accessibility (PAL-06)**
- **Arrow keys skip non-clickable headers** (project + conversation titles) and land only on **actionable rows** (commands + message hits).
- **Enter is row-type-aware:** command → `cmd.action()`; message hit → deep-link. The existing **`ez:` prefix shortcut still wins**.
- **Reuse the a11y primitives already in `CommandPalette.svelte`**: ARIA `role="dialog"` + `aria-modal`, `createFocusTrap`, capture-phase Escape, arrow/Enter handling, backdrop click, focus restore on close. Extend — don't rebuild.

### Claude's Discretion
- Exact match-type icon glyphs + role-badge treatment (keep consistent with Phase 66's sidebar).
- Project-header / conversation-header visual treatment and indentation depth.
- Whether section headers hide when their section is empty.
- The precise new endpoint/scope param shape (`scope=all` vs `projectId=*` vs a new route) — decide in research/planning, but keep the filter-inside-HNSW invariant.
- BottomSheet sizing / max-height and scroll behavior on mobile.
- Pulse keyframe reuse vs Phase 66's existing one.

### Deferred Ideas (OUT OF SCOPE)
- **Recent searches** surface in the palette empty state.
- **Filters (date / agent / model / project), saved searches, dedicated `/search` page, in-conversation Ctrl+F** — deferred to v1.6+.
- **Header-action semantics** (Enter on a conversation header jumps to the conversation).
- **Cross-project RRF score normalization** (RANK-01) — stays deferred (no labeled corpus).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PAL-01 | Cmd+K opens a global search palette from anywhere, extending `CommandPalette.svelte` (not a parallel component) | §Architecture Pattern 1 (extend the `searchMode` sub-view into a unified results model); §Standard Stack (backend cross-project scope); §Code Examples (scope-param + query-builder shape) |
| PAL-02 | Previous command-palette action rebound to Cmd+Shift+P without breaking custom overrides | §Architecture Pattern 4 (`shortcuts.ts` is the ONLY shortcut registry — no extension shortcuts exist; merge-by-action proven); §Code Examples (DEFAULT_SHORTCUTS + `(app)/+layout.svelte` switch) |
| PAL-03 | With conversation active, results grouped "In this conversation" / "Other conversations" | §Architecture Pattern 2 (cross-project grouping helper, one level deeper than Phase 66); §Common Pitfall 2 |
| PAL-04 | Each result shows a match-type icon plus a snippet | §Don't Hand-Roll (reuse `matchTypeGlyph` + `sanitizeSnippet`); §Code Examples |
| PAL-05 | Selecting a result deep-links to the matching message (scroll + highlight) | §Architecture Pattern 3 (`?m=` is route-driven; needs cross-project `projectId` on the hit — see §Open Questions 1, CRITICAL); §Common Pitfall 1 |
| PAL-06 | Palette keyboard-navigable + accessible (ARIA dialog, focus trap, focus restore) | §Architecture Pattern 1 (a11y primitives already present); §Common Pitfall 3 (header-skipping flat-nav model) |
| PAL-07 | On mobile, palette falls back to existing `BottomSheet` | §Architecture Pattern 5 (`<lg` → BottomSheet adapter); §Common Pitfall 4 |
</phase_requirements>

## Summary

Phase 67 is **full-stack but almost entirely additive-by-extension**. Every primitive it needs already exists at production version in-tree: the palette component with its full a11y stack, the shortcut registry with merge-by-action override safety, the Phase 65 single-CTE RRF query builder with a *proven* filter-inside-HNSW plan, the Phase 66 deep-link machinery (`?m=` consume/strip in `ChatThread`), the `<mark>`-only snippet sanitizer, the match-type glyph helper, the per-conversation grouping helper, and the `BottomSheet` mobile primitive. The work is wiring, not invention.

There are exactly **two pieces of genuinely new logic**: (1) a **cross-project scope** in the backend query builder — generalizing the tenant filter from "one project_id" to "the user's project set" while preserving the single-table ANN scan that keeps the HNSW index in the plan; and (2) a **`projectId` (and project label) on the `MessageSearchHit` contract** — because a cross-project deep-link URL is `/project/<projectId>/chat/<conversationId>?m=<messageId>`, and the hit today carries no `projectId`. This is the single most consequential research finding: **the existing hit shape cannot deep-link across projects.** Everything else is a careful extension of the `searchMode` sub-view in `CommandPalette.svelte` into a unified commands+messages results model.

The shortcut collision concern (research flag 3) resolves cleanly: **there is no extension-registered shortcut system.** `shortcuts.ts` (`DEFAULT_SHORTCUTS` + localStorage `pi-shortcuts` merge-by-action) is the *entire* registry; only `(app)/+layout.svelte`, `ShortcutHelp.svelte`, and the shortcuts unit test consume it. Adding a `palette-commands` action bound to `Cmd+Shift+P` and rebinding nothing about `palette` (`Cmd+K`) is safe and the merge-by-action path already has unit coverage proving custom overrides survive.

**Primary recommendation:** Extend (do NOT fork) the existing `searchMode` sub-view in `CommandPalette.svelte` into a unified results model; add a `scope=all` param + user-project-set scope to the Phase 65 query builder/endpoint; **add `projectId`+`projectName` to `MessageSearchHit`**; wire `Cmd+Shift+P` as a new `palette-commands` action; reuse Phase 66's `?m=` deep-link, `sanitizeSnippet`, `matchTypeGlyph`, and `groupHitsByConversation` verbatim, wrapping the modal in `BottomSheet` at `<lg`.

## Standard Stack

This phase introduces **no new libraries** (REQUIREMENTS.md Out-of-Scope explicitly bans cmdk-sv / fuse.js / new search libs — "every primitive already exists in-tree"). The "stack" is the in-tree asset set, verified to exist and behave as CONTEXT.md claims.

### Core (verified in-tree, reuse directly)
| Asset | Path | Purpose | Verified Behavior |
|-------|------|---------|-------------------|
| `CommandPalette.svelte` | `web/src/lib/components/CommandPalette.svelte` | The SUT to extend | ARIA `role="dialog"`+`aria-modal`, `createFocusTrap` (L247), capture-phase document Escape (L252-260), `flatItems` arrow/Enter/Backspace nav (L182-236), backdrop close (L111), `searchMode` sub-view (L34, L156-173) using `searchConversations` + deep-link to conversation (L137-141), bails on `global` project (L158), `ez:` prefix (L215). Props: `open`, `onclose`, `activeProjectId`. |
| `shortcuts.ts` | `web/src/lib/shortcuts.ts` | Shortcut registry | `DEFAULT_SHORTCUTS` has `{key:"k",meta:true,action:"palette"}` (L10). `ShortcutBinding` supports `shift?:boolean` (L3). `matchShortcut` honors shift exactly (L35). `loadCustomShortcuts` merges custom-over-default **by action name** (L80-82). |
| `(app)/+layout.svelte` | `web/src/routes/(app)/+layout.svelte` | Global keydown + palette mount | `matchShortcut → switch(action)` at L90-111; `case "palette"` toggles `commandPaletteOpen` (L91-93). `shortcuts = loadCustomShortcuts()` at L72. Palette mounted with `open`/`onclose`/`activeProjectId`. |
| `message-search.ts` | `src/db/queries/message-search.ts` | RRF query builder (backend) | Single-CTE RRF k=60 (L51); tenant filter via `scopedConvArray()` `ANY(ARRAY(...))` subquery (L89-96); single-table ANN scan keeps HNSW in plan (L108-125); `SET hnsw.iterative_scan='relaxed_order'` best-effort (L222); `explainVectorLegSql()` EXPLAIN proof (L353). |
| `+server.ts` (search) | `web/src/routes/api/search/messages/+server.ts` | Endpoint | `requireScope(read)`+`requireAuth` gate (L22-24); **hard-requires `projectId` → 400** (L26-27); zod mode-enum (L31-35); limit/offset clamp (L39-42); degraded gate (L47-64); `{hits,degraded,requestedMode,servedMode}` envelope (L76). |
| `api.ts` search section | `web/src/lib/api.ts` L389-437 | Client contract | `searchMessages(projectId,query,{mode,limit,offset})` (L425); `MessageSearchHit` (L405-416) has `conversationId/conversationTitle/messageId/role/createdAt/snippet/matchType/rankLexical/rankSemantic/score` — **NO `projectId`** (critical, see Open Questions 1); `SearchMessagesResponse` (L418-423). |
| `snippet-sanitize.ts` | `web/src/lib/search/snippet-sanitize.ts` | `<mark>`-only XSS-safe snippet render | `sanitizeSnippet(html)` → DOMPurify allowlist `["mark"]`, no attrs (L17-19). 100%-covered (Phase 66). |
| `search-mode.ts` | `web/src/lib/search/search-mode.ts` | mode LS + grouping helpers | `groupHitsByConversation(hits)` → `MessageHitGroup[]` first-seen order (L69-84); `loadSearchMode`/`persistSearchMode` global key `chatSearch.mode` (L16). 100%-covered. |
| `deep-link-resolve.ts` | `web/src/lib/search/deep-link-resolve.ts` | Pure deep-link decision math | `resolveDeepLink(targetId, allMessages, activeLeafId, visibleCount)` → branch-switch/window-grow decision (L46). Consumed by `ChatThread`; palette never touches it. 100%-covered. |
| `ChatThread.svelte` `?m=` | `web/src/lib/components/ChatThread.svelte` L946-1420 | Deep-link consume/strip/scroll/pulse | Reactive `$effect` (L1319+) reads `page.url.searchParams.get("m")` (L1330), arms `pendingDeepLink`, strips `?m=` preserving other params (L1339), gated apply via `resolveDeepLink` (L1358-1384). Fires on cold load AND client nav (Phase 66 Rule-1 fix). **No changes expected.** |
| `BottomSheet.svelte` | `web/src/lib/components/BottomSheet.svelte` | Mobile sheet primitive | `open`/`onclose`/`ariaLabel`/`children` (L34-44); `role="dialog"`+`aria-modal` (L115-116); `data-testid="bottom-sheet"`; own `createFocusTrap` (L104-109) + window Escape (L90-100) + backdrop (L121-127); safe-area inset (L62). Wraps 9 pickers. |
| `use-breakpoint.svelte.ts` | `web/src/lib/use-breakpoint.svelte.ts` | `<lg` detection | `useBreakpoint("lg").below` (L24), SSR-safe, matchMedia `(max-width:1023px)`. |
| `command-registry.ts` | `web/src/lib/command-registry.ts` | Command factory | `buildCommands(activeProjectId)`, `resolveCommands`, `fuzzyMatch`, `addRecentCommand`/`getRecentCommands`, `tryParseEzPrefix`. `search-conversations` command at L152-161 (the one to **remove**). |

### Supporting (reference for parity, not modified)
| Asset | Path | Why It Matters |
|-------|------|----------------|
| `ConversationList.svelte` sidebar search | `web/src/lib/components/ConversationList.svelte` | The Phase 66 reference UI to mirror. `matchTypeGlyph` (L147-151: `≈` semantic / `⊕` both / `"` lexical), grouped two-section render, `onselect(convId, messageId)` (L454), degraded dim (L142), generic empty. **Copy these patterns; don't re-derive glyphs.** |
| chat page `handleSelect` | `web/src/routes/(app)/project/[id]/chat/[convId]/+page.svelte` L150-156 | The exact deep-link URL build: `` `/project/${projectId}/chat/${id}?m=${encodeURIComponent(messageId)}` ``. The palette's message-row select must build the SAME URL — but with the **hit's own projectId** (cross-project), which the hit doesn't yet carry. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Extend `searchMode` sub-view into unified model | Add a sibling `commandSearchMode` view | Rejected — CONTEXT.md locks "commands+messages coexist in one list" (PAL-03). A sibling view re-implements `flatItems` nav + a11y; the locked layout needs them merged anyway. See Architecture Pattern 1. |
| Backend `scope=all` (extend Phase 65) | Client fan-out (N parallel per-project calls) | Rejected by CONTEXT.md explicitly. Fan-out can't rank across projects in one round-trip and re-introduces the post-filter recall risk SRCH-05 closed. |
| `scope=all` query param on existing route | New `/api/search/all-messages` route | Param keeps one endpoint + one zod schema + one degraded envelope + one client fn. New route duplicates all of it. **Recommend `scope` param.** (Claude's discretion — see Code Examples.) |

**Installation:** none. No `bun add`. (REQUIREMENTS.md Out-of-Scope bars new search libs.)

## Architecture Patterns

### Recommended file-touch map
```
src/db/queries/message-search.ts        # NEW cross-project scope branch + projectId/projectName on hit
src/__tests__/message-search.test.ts          # extend: cross-project + cross-user-leak cases
src/__tests__/message-search-explain.test.ts  # extend: multi-project EXPLAIN proof
web/src/routes/api/search/messages/+server.ts # accept scope=all; user-project-set resolution
web/src/routes/api/search/messages/schema.ts  # zod: add scope enum
web/src/lib/api.ts                       # searchMessages opts.scope; MessageSearchHit gains projectId+projectName
web/src/lib/shortcuts.ts                 # DEFAULT_SHORTCUTS += {k:"p",meta,shift,action:"palette-commands"}
web/src/routes/(app)/+layout.svelte      # switch: case "palette-commands"; pass initialView to palette
web/src/lib/command-registry.ts          # REMOVE search-conversations command
web/src/lib/components/CommandPalette.svelte  # the big extension (unified results model + BottomSheet wrap)
web/src/lib/search/palette-results.ts    # NEW pure helper: cross-project section/group builder (testable)
```

### Pattern 1: Extend the `searchMode` sub-view into a unified results model (PAL-01/03/06)
**What:** Today `searchMode` is a *modal sub-view* — when true, the command list disappears and only `searchResults` render (`visibleItems` returns `[]` in searchMode, L46; `flatItems` returns `searchResults`, L87). CONTEXT.md locks **commands AND messages coexist in one list**. So the change is to make `flatItems` (the keyboard-nav model) a **heterogeneous ordered array** of actionable rows: `[...matchingCommands, ...inThisConvHits, ...otherHits]`, with non-clickable section/group headers interleaved only at *render* time (not in `flatItems`).
**When to use:** Always — it's the locked layout.
**Why extend not fork:** All four a11y primitives (`createFocusTrap`, capture-Escape, `flatItems` arrow/Enter, backdrop) already wrap `flatItems`. A heterogeneous `flatItems` reuses them for free. A sibling view would duplicate them (and CONTEXT.md PAL-06 says "Extend — don't rebuild").
**Key implementation note:** `flatItems` currently types `(Command | SearchResult)[]`. Widen to `(Command | MessageSearchHit)[]` and make `Enter` row-type-aware (L211-235 already branches on `searchMode`; generalize to branch on the *item kind* — a discriminant like `"messageId" in item`).

### Pattern 2: Cross-project grouping — one level deeper than Phase 66 (PAL-03)
**What:** Phase 66's `groupHitsByConversation` (search-mode.ts L69) groups by conversation only — correct for single-project sidebar. Phase 67 needs **project → conversation → message**. Build a new pure helper `palette-results.ts` that:
1. Splits hits into `inThisConversation` (hit.conversationId === activeConversationId) and `other`.
2. Groups `other` by `projectId` then by `conversationId` (reusing `groupHitsByConversation` per-project).
3. Returns a flat actionable-row list (for `flatItems`) plus a render-tree (headers + rows).
**When to use:** When the response has a `projectId` on each hit (see Open Questions 1 — this is why the hit MUST gain `projectId`/`projectName`).
**Anti-pattern:** Do NOT group in the Svelte component inline — it's the exact "risky tree-walk … deterministically unit-testable" rationale that made Phase 66 extract `deep-link-resolve.ts` and `search-mode.ts` as pure 100%-covered helpers. The 100% coverage bar demands a pure module.

### Pattern 3: Deep-link is route-driven and ALREADY built (PAL-05)
**What:** The palette's only job on message-row select is `goto(url)` where `url = ` `/project/${hit.projectId}/chat/${hit.conversationId}?m=${encodeURIComponent(hit.messageId)}`, then close. `ChatThread`'s reactive `$effect` (L1319+) does the rest (consume/strip/branch-switch/scroll/pulse) on the client nav. This mirrors `handleSelect` (chat page L150-156) exactly.
**CRITICAL dependency:** `hit.projectId` does not exist today. Without it the palette can only build a deep-link inside the *active* project — defeating cross-project (PAL-01). The hit MUST gain `projectId`. (Open Questions 1.)
**When to use:** Every message-row Enter/click.

### Pattern 4: Shortcut rebind is safe — no extension shortcut registry exists (PAL-02)
**What:** Add to `DEFAULT_SHORTCUTS`: `{ key: "p", meta: true, shift: true, action: "palette-commands", label: "Open command palette (commands)" }`. Leave `palette` (`Cmd+K`) untouched. In `(app)/+layout.svelte` add `case "palette-commands":` that opens the palette in command-first mode.
**Why safe (research flag 3 resolved):** A repo-wide search for shortcut registration (`ShortcutBinding|registerShortcut|loadCustomShortcuts|matchShortcut|pi-shortcuts`) returns ONLY `shortcuts.ts`, `ShortcutHelp.svelte`, `(app)/+layout.svelte`, and the unit test. **Extensions cannot register shortcuts.** There is no dynamic shortcut surface to collide with. `loadCustomShortcuts`' merge-by-action (L80-82) maps `DEFAULT_SHORTCUTS` over the user's custom overrides keyed by action — adding a new default action is a pure append; existing user overrides for `palette` (and any new override for `palette-commands`) survive. The unit test already proves this (`merges custom overrides by action name`, shortcuts.test.ts L258-273; shift-modifier matching L142-153).
**Caveat:** `Cmd+Shift+P` is Chrome/Firefox/Edge's "open incognito/private window" shortcut. `e.preventDefault()` already runs (L88) before the switch, so the browser default is suppressed when the app handles it. Verify in the Playwright e2e on chromium (the browser may still intercept at the OS layer in some configs — note as a manual-verify line, but `preventDefault` is the correct mitigation and is already in place).

### Pattern 5: Mobile = wrap the SAME modal body in BottomSheet at `<lg` (PAL-07)
**What:** `const isMobile = useBreakpoint("lg").below;` Render `{#if isMobile}<BottomSheet open {onclose} ariaLabel="Search">…same results body…</BottomSheet>{:else}<div role="dialog">…same body…</div>{/if}`. Extract the results body into a `{#snippet}` so it's rendered identically in both branches (CONTEXT.md: "Same section structure as desktop … Do NOT flatten the project nesting on mobile").
**Focus note:** `BottomSheet` runs its OWN focus trap (L104-109) and window Escape (L90-100). When in the sheet branch, the palette must NOT also install its document-capture Escape (L252) or a second `createFocusTrap` on the same subtree — that double-traps. Gate the palette's own trap/Escape install on `!isMobile`. CONTEXT.md also requires auto-focusing the search input even inside the sheet — do it in an `$effect` after the sheet mounts.
**Reference:** Phase 57 pattern — 9 pickers wrap on `<lg`.

### Anti-Patterns to Avoid
- **Forking a second palette component** — CONTEXT.md PAL-01 forbids it; duplicates the a11y stack.
- **Putting section/conversation headers in `flatItems`** — breaks arrow-key skip-headers (PAL-06). Headers are render-only; `flatItems` = actionable rows only.
- **Building the deep-link from `activeProjectId`** — must use `hit.projectId` for cross-project.
- **Re-deriving match-type glyphs / re-sanitizing snippets by hand** — reuse `matchTypeGlyph` + `sanitizeSnippet` (XSS-class regression risk; Phase 66 Pitfall 5).
- **Mutating stored search mode on a degraded response** — Phase 66 Pitfall 4; `persistSearchMode` only on explicit user toggle.
- **Joining inside the ANN scan in the cross-project query** — collapses the HNSW plan to Seq Scan (see Common Pitfall 5).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| `<mark>` snippet → safe HTML | Regex stripper | `sanitizeSnippet()` (snippet-sanitize.ts) | DOMPurify allowlist; misses attribute/nested/entity payloads otherwise (Phase 66 Pitfall 5). |
| Deep-link scroll/pulse/branch-switch | New scroll machinery | `?m=` param + `ChatThread` `$effect` | Already built + 100%-covered in Phase 66; palette just `goto`s. |
| Match-type icon | New glyph map | `matchTypeGlyph` (ConversationList.svelte L147) | Phase 66 parity (CONTEXT.md "keep consistent with Phase 66"). |
| Group hits by conversation | Inline map | `groupHitsByConversation` (search-mode.ts) | Pure, tested; reuse per-project. |
| Mobile sheet (focus trap, Escape, safe-area) | New sheet | `BottomSheet.svelte` | 9-picker proven primitive; own a11y. |
| Focus trap / capture-Escape / arrow nav | New handlers | Existing `CommandPalette.svelte` primitives | Already wrap `flatItems`. |
| Shortcut override safety | New merge logic | `loadCustomShortcuts` merge-by-action | Unit-proven; just append a default. |
| Filter-inside-HNSW for cross-project | New ANN query | Generalize `scopedConvArray()` to a project SET | The single-table ANN structure is the *only* shape that keeps the HNSW index in the plan (message-search.ts header note + EXPLAIN test). |

**Key insight:** Phase 67's correctness risk is concentrated in two pure-logic seams (cross-project SQL scope, cross-project grouping) and one contract change (`projectId` on the hit). Both seams are unit-testable in isolation — which is exactly what the 100% coverage bar (and the Phase 66 precedent of extracting pure helpers) demands.

## Common Pitfalls

### Pitfall 1: Cross-project deep-link is impossible with the current hit shape
**What goes wrong:** You wire the palette, click an "Other conversations" result in a *different* project, and `goto` either 404s or lands in the wrong project — because the only project id available is `activeProjectId`, and the hit carries `conversationId` but no `projectId`.
**Why it happens:** `MessageSearchHit` (api.ts L405-416 / message-search.ts L56-68) predates cross-project scope; Phase 66 only ever searched one project so `projectId` was implicit.
**How to avoid:** Add `projectId` (required) and `projectName` (for the project header) to `MessageSearchHit` on BOTH the server (`message-search.ts` — join/select `c.project_id`, `p.name`) and the client (`api.ts`). Update `toHit` + the SELECT lists in all three mode branches (keyword/semantic/hybrid). This is the highest-value backend change; flag it as a Wave-0 contract decision.
**Warning signs:** A deep-link e2e from a non-active-project result that fails to scroll/pulse.

### Pitfall 2: `flatItems` index drift across heterogeneous rows
**What goes wrong:** Arrow keys highlight the wrong row, or `highlightedIndex` lands on a header.
**Why it happens:** The current `flatIndex(cmd)` helper (L271) does `flatItems.indexOf(cmd)` over a homogeneous `Command[]`. With commands+hits interleaved and headers in the render tree, the render loop's positional index ≠ the `flatItems` index.
**How to avoid:** Keep `flatItems` = actionable rows only (no headers). At render, compute each row's flat index via identity lookup (`flatItems.indexOf(item)`) the way `flatIndex` already does — extend it to accept `Command | MessageSearchHit` with a stable discriminant. Unit-test the flat-index mapping in `palette-results.ts`.
**Warning signs:** Component test: ArrowDown from last command should land on first message hit, skipping the "In this conversation" header.

### Pitfall 3: Double focus-trap / double-Escape in the mobile branch
**What goes wrong:** On mobile, Escape closes twice or focus can't leave the input.
**Why it happens:** `BottomSheet` installs its own `createFocusTrap` + window Escape; the palette also installs a document-capture Escape (L252) and `createFocusTrap` (L247).
**How to avoid:** Gate the palette's own trap + capture-Escape install on `!isMobile`. Let `BottomSheet` own a11y inside the sheet.
**Warning signs:** Playwright mobile-chromium: one Escape should close; focus-trap test inside sheet.

### Pitfall 4: Mobile flatten regression
**What goes wrong:** Project nesting collapses on mobile.
**Why it happens:** Tempting to simplify the tree for small screens.
**How to avoid:** CONTEXT.md locks identical section structure desktop/mobile. Render the SAME `{#snippet}` body in both branches; only the wrapper differs.

### Pitfall 5: Cross-project ANN scan falls back to Seq Scan (recall collapse / slow)
**What goes wrong:** The multi-project query stops using `idx_message_chunks_embedding`; the tenant filter post-filters after a brute scan (SRCH-05 regression at scale).
**Why it happens:** The header note in message-search.ts (L26-44) documents that ANY join/correlated subquery *inside* the ANN scan makes the planner abandon the HNSW index. Naively widening scope by joining projects→conversations inside the vector leg re-triggers this.
**How to avoid:** Keep the single-table ANN structure. Generalize `scopedConvArray()` (L89-96) so the `WHERE c.project_id = ${projectId}` becomes `WHERE c.project_id = ANY(${projectIds})` (or, for `scope=all`, drop the project predicate and keep only `c.user_id = ${userId}` + test-null-safe). The ANN scan still sees a single `conversation_id = ANY(ARRAY(<scoped ids>))` predicate (one denormalized column, no join). Re-run the EXPLAIN proof (`message-search-explain.test.ts`) with a multi-project corpus asserting the same `Index Scan using idx_message_chunks_embedding` + `Filter: conversation_id` + no `Seq Scan on message_chunks`.
**Warning signs:** EXPLAIN test shows `Seq Scan on message_chunks` once scope widens.

### Pitfall 6: `search-conversations` removal leaves dangling references
**What goes wrong:** Removing the command (command-registry.ts L152-161) without removing its handler in `executeCommand` (CommandPalette.svelte L125-130) or the `searchConversations` import (L4) leaves dead code / a broken sub-view path.
**How to avoid:** Remove together: the command def, the `if (cmd.id === "search-conversations")` branch, the `searchConversations`/`SearchResult` import, the `doConversationSearch`/`selectSearchResult` conversation-grained functions, and the conversation-search render block (L322-344). Replace with the message-grained flow. Existing `command-registry.test.ts` and `commands.test.ts` will need the `search-conversations` assertions updated.
**Warning signs:** `svelte-check` unused-import error; a stale test asserting `search-conversations` exists.

## Code Examples

### Backend: cross-project scope (generalize `scopedConvArray`)
```ts
// Source: src/db/queries/message-search.ts L89-96 (current), generalized.
// CURRENT (single project):
function scopedConvArray(projectId: string, userId: string | undefined) {
  const userFilter = userId ? sql` AND c.user_id = ${userId}` : sql``;
  return sql`ANY (ARRAY(
    SELECT c.id FROM conversations c
    WHERE c.project_id = ${projectId}
      AND (c.test IS NULL OR c.test = false)${userFilter}
  ))`;
}
// PHASE 67 (scope=all → all the user's projects; userId becomes REQUIRED for scope=all):
//   WHERE c.user_id = ${userId} AND (c.test IS NULL OR c.test = false)
//   (drop the project_id predicate; keep single-table ANN — Pitfall 5)
// The display join then also selects c.project_id + p.name for the hit's projectId/projectName.
```

### Backend: hit gains projectId/projectName
```ts
// Source: message-search.ts toHit() L174 + the three display-join SELECTs (L235, L268, L319).
// Add to each SELECT: c.project_id AS project_id, p.name AS project_name
//   ... FROM ... JOIN conversations c ON ... JOIN projects p ON p.id = c.project_id
// Add to MessageSearchHit (server L56 + client api.ts L405): projectId: string; projectName: string;
```

### Endpoint: scope param (Claude's-discretion shape — recommend `scope`)
```ts
// Source: web/src/routes/api/search/messages/+server.ts L26-27 (current hard 400) + schema.ts.
// schema.ts:
export const searchMessagesQuerySchema = z.object({
  mode: z.enum(["hybrid", "keyword", "semantic"]).default("hybrid"),
  scope: z.enum(["project", "all"]).default("project"),
});
// +server.ts: when scope==="all", projectId is NOT required; pass {scope:"all", userId:user.id}
//   to searchMessages (which drops the project predicate). When "project", keep the existing
//   projectId-required 400. Auth/read-scope gate + degraded envelope unchanged.
```

### Shortcut rebind (append a default; rebind nothing)
```ts
// Source: web/src/lib/shortcuts.ts L9-14.
export const DEFAULT_SHORTCUTS: ShortcutBinding[] = [
  { key: "k", meta: true, action: "palette", label: "Open command palette" },        // unchanged
  { key: "p", meta: true, shift: true, action: "palette-commands", label: "Command palette (commands)" }, // NEW
  // ...existing new-chat / help / sidebar-toggle
];
// (app)/+layout.svelte switch (L90): add
//   case "palette-commands": commandPaletteOpen = true; paletteInitialView = "commands"; break;
//   case "palette":          commandPaletteOpen = !commandPaletteOpen; paletteInitialView = "search"; break;
```

### Deep-link on message-row select (mirror handleSelect, use hit.projectId)
```ts
// Source: chat page handleSelect L150-156 — same shape, cross-project projectId.
function selectMessageHit(hit: MessageSearchHit) {
  goto(`/project/${hit.projectId}/chat/${hit.conversationId}?m=${encodeURIComponent(hit.messageId)}`);
  resetState();
  onclose();
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Conversation-grained palette search (`searchConversations`, deep-link to conversation, bails on global) | Message-grained, cross-project, deep-link to message | Phase 67 | The `search-conversations` command + sub-view is fully replaced (CONTEXT.md). |
| Single-project `searchMessages` (`projectId` required) | `scope=all` over the user's project set | Phase 67 | New scope param + user-project-set tenant filter, same single-CTE round-trip. |
| `MessageSearchHit` without project context | Hit carries `projectId`+`projectName` | Phase 67 | Enables cross-project deep-link + project-header grouping. |

**Deprecated/outdated (remove in this phase):**
- `search-conversations` command (command-registry.ts L152-161) and its palette sub-view branch.

## Open Questions

1. **CRITICAL — `projectId` on `MessageSearchHit` (research flag 1 corollary).**
   - What we know: cross-project deep-link URL needs `projectId`; the hit doesn't carry it; the display join already touches `conversations` (has `project_id`) so adding `c.project_id` + a `JOIN projects p` for `p.name` is a small, contained change.
   - What's unclear: whether `projectName` is wanted on the header or just `projectId` (CONTEXT.md leaves header treatment to discretion).
   - Recommendation: add BOTH `projectId` (required for the link) and `projectName` (for the header label) in Wave 0; cheaper than a later contract bump.

2. **Scope-param shape (research flag 1, Claude's discretion).**
   - Recommendation: `scope=project|all` on the existing route (keeps one endpoint/schema/envelope/client fn). When `scope=all`, `projectId` optional; `userId` becomes the sole tenant key (always present via `requireAuth`).

3. **Cross-project ranking honesty (research flag 2).**
   - What we know: the single multi-project CTE ranks in one round-trip; RRF scores are not globally normalized (Phase 65 noted this; RANK-01 deferred). The single-table ANN keeps the HNSW index (Pitfall 5).
   - What's unclear: whether mixed-project recency/relevance feels right without RANK-01 — un-measurable without a labeled corpus.
   - Recommendation: ship the single-CTE multi-project query; document the RANK-01 caveat (CONTEXT.md already defers it). No per-project fan-out.

4. **Palette extension point (research flag 4) — RESOLVED.**
   - Extend the `searchMode` sub-view into a unified heterogeneous `flatItems` model (Architecture Pattern 1), NOT a sibling view. Reuses the a11y stack; matches the locked commands+messages-together layout.

5. **`Cmd+Shift+P` browser interception.**
   - `e.preventDefault()` runs before the switch (layout L88) — correct mitigation. Verify on chromium e2e; note as manual-verify if a headless config still intercepts.

## Validation Architecture

> nyquist_validation is enabled (`.planning/config.json` → `workflow.nyquist_validation: true`).

### Test Framework
| Property | Value |
|----------|-------|
| Framework (backend/pure) | `bun test` (`bun:test`) — runs from repo root |
| Framework (web component/server) | `vitest` via `bunx vitest run` — **MUST run from `web/`** (MEMORY: wrong config from root fails 1100+ files) |
| Framework (e2e) | Playwright — `bunx playwright test` from `web/`, projects `chromium` + `mobile-chromium`; preview server rebuild+restart required for SUT Svelte edits (Phase 61/62 pattern) |
| Coverage gate | `scripts/test-coverage.sh` + `scripts/coverage-thresholds.json`, per-file 100% on new paths, CI-gated (ci.yml `coverage` job, node-22). `SF:src/→SF:web/src/` re-rooting; vitest-only files run via the node-vitest leg. |
| Quick run (backend) | `bun test src/__tests__/message-search.test.ts` |
| Quick run (web) | `cd web && bunx vitest run src/__tests__/<file>` |
| Full suite | `bun run test:coverage` (note: currently RED on dirty tree from uncommitted parallel work — pre-existing, per STATE.md) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PAL-01 | `scope=all` query returns hits across the user's projects | unit (DB) | `bun test src/__tests__/message-search.test.ts` | extend existing |
| PAL-01 | cross-project query does NOT leak other users' projects | unit (DB) | `bun test src/__tests__/message-search.test.ts` | extend existing |
| PAL-01 | cross-project ANN keeps HNSW index, tenant filter inside scan, no Seq Scan | unit (DB EXPLAIN) | `bun test src/__tests__/message-search-explain.test.ts` | extend existing |
| PAL-01 | hit carries `projectId`+`projectName` | unit (DB) | `bun test src/__tests__/message-search.test.ts` | extend existing |
| PAL-01 | endpoint: `scope=all` doesn't require projectId; `scope=project` keeps 400 | integration (server) | `cd web && bunx vitest run src/__tests__/api-search-messages.server.test.ts` | ❌ Wave 0 (verify existing server test exists; create if not) |
| PAL-01 | `searchMessages(client)` passes `scope`/forwards `projectId`+`projectName` | unit (client) | `cd web && bunx vitest run src/__tests__/api-search-messages.client.test.ts` | ❌ Wave 0 |
| PAL-01 | Cmd+K opens palette search-focused; Cmd+Shift+P opens command-first | e2e | `cd web && bunx playwright test e2e/command-palette-search.spec.ts` | ❌ Wave 0 |
| PAL-02 | `palette-commands` action exists; merge-by-action preserves overrides for `palette` AND `palette-commands` | unit | `cd web && bun test src/lib/__tests__/shortcuts.test.ts` | extend existing |
| PAL-02 | `(app)/+layout.svelte` routes `palette`/`palette-commands` to the right initial view | unit (source-read or component) | `cd web && bunx vitest run src/__tests__/app-layout-palette-shortcut.test.ts` | ❌ Wave 0 |
| PAL-03 | grouping: commands / in-this-conv / other(project→conv); headers not in flatItems | unit (pure) | `cd web && bunx vitest run src/lib/search/__tests__/palette-results.test.ts` | ❌ Wave 0 (new helper) |
| PAL-03 | no-active-conversation → single "Messages" section | unit (pure) | same file | ❌ Wave 0 |
| PAL-03/04 | component renders sections + match-type glyph + role badge + snippet | component | `cd web && bunx vitest run src/__tests__/CommandPalette.component.test.ts` | ❌ Wave 0 |
| PAL-04 | snippet sanitized through `sanitizeSnippet` (no raw HTML) | component / pure | CommandPalette.component or snippet-sanitize (existing) | ❌/✅ |
| PAL-05 | message-row select builds `/project/<hit.projectId>/chat/<convId>?m=<msgId>` | component | `cd web && bunx vitest run src/__tests__/CommandPalette.component.test.ts` | ❌ Wave 0 |
| PAL-05 | full deep-link journey: click cross-project result → scroll + pulse + `?m=` stripped | e2e | `cd web && bunx playwright test e2e/command-palette-search.spec.ts` | ❌ Wave 0 (reuse Phase 66 `?m=` mocks) |
| PAL-06 | arrow nav skips headers, lands on commands+hits; Enter row-type-aware; `ez:` wins | component | `cd web && bunx vitest run src/__tests__/CommandPalette.component.test.ts` | ❌ Wave 0 |
| PAL-06 | ARIA dialog + focus trap + focus restore on close | component / e2e | CommandPalette.component + e2e | ❌ Wave 0 |
| PAL-07 | `<lg` renders palette inside BottomSheet; same section structure; single Escape closes; input auto-focused | e2e (mobile-chromium) | `cd web && bunx playwright test e2e/command-palette-search.spec.ts --project=mobile-chromium` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** the single targeted file command for the layer touched (e.g. `bun test src/__tests__/message-search.test.ts`, or `cd web && bunx vitest run src/__tests__/CommandPalette.component.test.ts`).
- **Per wave merge:** the web vitest shard + bun search suites + the new e2e spec on both projects.
- **Phase gate:** per-file 100% coverage green on all new paths (`scripts/test-coverage.sh`) before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `web/src/lib/search/palette-results.ts` + `…/__tests__/palette-results.test.ts` — pure cross-project section/group builder (PAL-03), 100%-pinned.
- [ ] `web/src/__tests__/CommandPalette.component.test.ts` — component test (sections, glyph, role badge, snippet sanitize, arrow-skip-headers, row-type Enter, deep-link URL, ARIA/focus). Likely the largest new test file.
- [ ] `web/src/__tests__/api-search-messages.server.test.ts` — verify/create; add `scope=all` (no projectId) + `scope=project` (400) + projectId/projectName passthrough cases.
- [ ] `web/src/__tests__/api-search-messages.client.test.ts` — verify/create; `scope` forwarding + new fields.
- [ ] `web/src/__tests__/app-layout-palette-shortcut.test.ts` — `palette` vs `palette-commands` routing (source-read mirrors `app-layout-agents-nav.test.ts` precedent, or component).
- [ ] `web/e2e/command-palette-search.spec.ts` — Cmd+K / Cmd+Shift+P, cross-project deep-link journey, BottomSheet at mobile-chromium; reuse Phase 66 `/api/search/messages` mock + `makeSearchHit` (now with `projectId`/`projectName`).
- [ ] Extend `src/__tests__/message-search.test.ts` (cross-project + cross-user-leak + projectId/projectName) and `src/__tests__/message-search-explain.test.ts` (multi-project EXPLAIN).
- [ ] Extend `web/src/lib/__tests__/shortcuts.test.ts` (palette-commands present + override-survives) and update `command-registry.test.ts` / `commands.test.ts` for `search-conversations` removal.
- Framework install: none (all frameworks present).

## Sources

### Primary (HIGH confidence — in-tree source, read directly)
- `web/src/lib/components/CommandPalette.svelte` — full a11y stack, searchMode sub-view, flatItems nav, ez: prefix.
- `web/src/lib/shortcuts.ts` + `web/src/lib/__tests__/shortcuts.test.ts` — DEFAULT_SHORTCUTS, merge-by-action, shift matching (proven).
- `web/src/routes/(app)/+layout.svelte` L70-138 — global keydown switch, palette mount, shortcuts load.
- `src/db/queries/message-search.ts` — RRF builder, `scopedConvArray`, single-table ANN, `explainVectorLegSql`, SRCH-05 deviation note.
- `web/src/routes/api/search/messages/+server.ts` + `schema.ts` — endpoint gate, projectId-required 400, zod, degraded envelope.
- `web/src/lib/api.ts` L389-471 — `searchMessages`, `MessageSearchHit` (no projectId), `searchConversations`.
- `web/src/lib/search/{snippet-sanitize,search-mode,deep-link-resolve}.ts` — Phase 66 pure helpers.
- `web/src/lib/components/{BottomSheet.svelte,ConversationList.svelte}`, `use-breakpoint.svelte.ts`, `command-registry.ts`.
- `web/src/routes/(app)/project/[id]/chat/[convId]/+page.svelte` L150-156, 225-239 — `handleSelect` deep-link URL build + `onselect` wiring.
- `web/src/lib/components/ChatThread.svelte` L946-1420 — `?m=` reactive consume/strip/resolve/scroll/pulse.
- `src/__tests__/message-search-explain.test.ts` + `message-search.test.ts` — the EXPLAIN proof + RRF contract corpus to extend.
- Repo-wide grep for shortcut registration — confirms NO extension shortcut system (research flag 3).
- `.planning/{CONTEXT,REQUIREMENTS,ROADMAP,STATE,config}.md/json` — scope, requirements, dependency on Phase 65/66, coverage bar.

### Secondary / Tertiary
- None — no external sources needed; all claims sourced from in-tree code at production version.

## Metadata

**Confidence breakdown:**
- Standard stack (in-tree assets): HIGH — every asset read and verified against CONTEXT.md claims.
- Architecture (extend searchMode; cross-project SQL; projectId-on-hit): HIGH — grounded in the existing query builder's documented single-table-ANN constraint and the existing flatItems/a11y model.
- Shortcut collision (research flag 3): HIGH — repo-wide search proves no extension shortcut registry exists; merge-by-action unit-proven.
- Cross-project HNSW recall (research flag 1): HIGH on the *mechanism* (generalize `scopedConvArray`, keep single-table ANN, re-run EXPLAIN); the multi-project EXPLAIN itself must be re-run in a test (Wave 0) to confirm the plan empirically — MEDIUM until that test is green.
- Cross-project ranking honesty (research flag 2): MEDIUM — single-CTE ranks in one round-trip, but RRF cross-project normalization (RANK-01) is un-measurable without a corpus; CONTEXT.md already defers it.
- Pitfalls: HIGH — each maps to a concrete in-tree line or a Phase 66 documented pitfall.

**Research date:** 2026-05-30
**Valid until:** 2026-06-29 (stable — in-tree code; re-verify only if Phase 66/65 files change before planning).
