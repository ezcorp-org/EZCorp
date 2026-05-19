---
phase: 48-ez-button-concierge-agent
verified: 2026-05-06T00:00:00Z
status: verified
score: 6/6 goal-checks verified (revised scope)
re_verification:
  is_re_verification: true
  prior_status: gaps_found
  prior_date: 2026-04-29
  prior_score: 4/7
scope_changes:
  - removed: "Goal #7 — Page context (Tier 1 + Tier 2) is appended to every Ez send"
    reason: "ezContext / <page_context> protocol was ripped from the application in commits a4de90f, fc07608, 6729ee3, 1294b28, 7ae8d91. The page-context-protocol is descoped entirely and is now v1.3 redesign work."
  - amended: "Goal #2 — Sending a message in the panel routes through Ez mode + allowlist"
    reason: "Original wording included '+ page context'; that clause is dropped. Verification now only proves Ez mode + allowlist routing."
  - split: "Goal #3 — server-side propose_*/summarize/find tools work; fill_form/navigate_to dispatch on the client"
    reason: "The five server-side tools are now goal-check #3a; fill_form/navigate_to are explicitly descoped to v1.3 (client dispatcher returns 'no-handler'/path-validation only). Marked as #3b but expected non-functional."
prior_gaps_closed:
  - prior_truth: "Sending a message in the panel routes through Ez mode + allowlist + page context"
    closed_by: ["7a32335", "fec3c6e"]
    note: "Ez tool wiring closed — wireEzToolsForTurn now invoked from setup-tools.ts when convRecord.kind === 'ez'."
  - prior_truth: "Five propose_*/summarize/find tools work server-side; fill_form/navigate_to dispatch on the client"
    closed_by: ["cba56d6", "42a171d"]
    note: "Server-side tools registered via wireEzToolsForTurn; client-side dispatcher path landed (now intentionally degraded post-ezContext-removal)."
  - prior_truth: "Page context (Tier 1 + Tier 2) is appended to every Ez send"
    closed_by: ["f56e2e6"]
    note: "Initially closed in f56e2e6, then DESCOPED ENTIRELY by the ezContext removal series (a4de90f, fc07608, 6729ee3, 1294b28, 7ae8d91). Removed from phase goal."
descoped_to_v1_3:
  - "fill_form tool: client dispatcher always reports 'no-handler' (page-side form registry was removed with <EzContext>)."
  - "navigate_to tool: server-side factory still emits the deferred client event but the user-flow path that benefited from page-aware nav is gone."
  - "Page-context protocol (Tier 1 + Tier 2): the entire <EzContext> provider, ezContext payload, and <page_context> system-prompt injection are removed. The Ez persona has been updated to acknowledge it cannot see the user's page."

human_verification:
  - test: "Manual smoke against `bun run dev`: open Ez panel on /agents and ask 'create a project for ./demo'."
    expected: "Per UAT #3 — card with 'Open prefilled form' button appears. Click → /new-project hydrates from ?prefill=<draftId>."
    why_human: "Wiring is verified statically; whether the LLM actually calls propose_create_project given the persona is non-deterministic and only smoke-testable with a real provider."
  - test: "Manual smoke: with provider configured, give summarize_conversation a conversationId and verify it returns a tweet-length summary."
    expected: "Per UAT #5 (revised) — summarize_conversation returns a one-tweet-length summary when fed a conversationId. The user must supply the id explicitly (Ez can no longer see the page)."
    why_human: "Requires a real LLM; the panel cannot infer the conversation id from the page anymore."
---

# Phase 48: Ez Button — In-App Concierge Agent — Re-Verification Report

**Phase Goal (revised):** Add a floating bottom-right "Ez" button mounted in the app shell. Clicking it opens a slide-in chat panel — an in-app concierge whose only job is helping users manage their EZCorp setup (create projects, build agents, install extensions, summarize conversations, find agents). Ez runs in a locked builtin "Ez" mode with a fixed tool allowlist and persists into a single dedicated conversation per user.

**Verified:** 2026-05-06
**Status:** verified (6/6 under revised scope)
**Re-verification:** YES — supersedes 2026-04-29 verification (prior status: gaps_found, 4/7).

---

## Scope changes since prior verification

Two scope decisions landed in late v1.2 that change what Phase 48 needs to prove:

1. **ezContext / page-context protocol removed entirely.** Commits `a4de90f`, `fc07608`, `6729ee3`, `1294b28`, `7ae8d91` ripped the `<EzContext>` provider, the `ezContext` JSON payload on the messages POST, and the runtime's `<page_context>...</page_context>` system-prompt injection. The Ez persona was updated to tell the LLM it cannot see the user's page. Three knock-on effects:
   - **Goal-check #7 ("page context appended to every Ez send") is REMOVED** from the phase goal — there is no page-context wire anymore, by design.
   - `fill_form` and `navigate_to` are now intentionally degraded:
     - `fill_form` always returns `{ ok: false, code: "no-handler" }` because the page-side form registry was the consumer of `<EzContext>`. The server-side tool factory still ships and emits the deferred client event, but the dispatcher cannot resolve a real form.
     - `navigate_to` still validates same-origin paths and calls `goto()`, but the user-journey value that depended on Ez "seeing" the current page is gone.
   - These two tools are **descoped to v1.3** as a tool-driven page-context redesign. Acknowledged tradeoff for v1.2 launch.

2. **The three prior gaps were closed.** Re-verified earlier in commits `7a32335`, `fec3c6e`, `cba56d6`, `42a171d`, `f56e2e6`. Specifically:
   - `wireEzToolsForTurn` is now invoked from `setup-tools.ts` (line 333-371) when `convRecord.kind === 'ez'` (closes prior gap #1).
   - The five server-side Ez tools reach the LLM through `ctx.agentTools` and survive `applyToolFilters` against the seeded `mode.allowedTools`.
   - The page-context wire was briefly closed (`f56e2e6`), then deliberately removed when the protocol itself was descoped.

The scope shrinks goal-checks from 7 → 6 and splits #3 into 3a (server-side, in-scope) and 3b (client-side, descoped).

---

## Goal Achievement (revised)

### Observable Truths (six goal-backward checks)

| # | Goal Check | Status | Evidence |
|---|---|---|---|
| 1 | User can click a floating "Ez" bottom-right button on any (app) route → slide-in panel opens | ✓ VERIFIED | `EzButton.svelte` mounted in `web/src/routes/(app)/+layout.svelte`. `EzPanel.svelte` reacts to `ezPanelState.open`. `/login` is in `(auth)` layout → button correctly hidden. |
| 2 | Sending a message in the panel routes through Ez mode + allowlist | ✓ VERIFIED | `messages/+server.ts` plumbs `modeId='builtin-ez'` to `executor.streamChat` (executor.ts:435-461). `setup-tools.ts:333-371` invokes `wireEzToolsForTurn` for `convRecord.kind === 'ez'`, populating `ctx.agentTools` and `ctx.builtinToolDefsMap` BEFORE `applyToolFilters` runs against `mode.allowedTools`. The seven Ez tool names survive the filter; everything else is stripped. Regression guard test: `src/__tests__/ez-tools-wired-into-setup.test.ts`. |
| 3a | The five server-side tools (propose_create_project, propose_create_agent, propose_install_extension, summarize_conversation, find_agents) work server-side | ✓ VERIFIED | All five factories present in `src/runtime/tools/ez/` and registered via `getEzToolDefs(ctx)` (`src/runtime/tools/ez/index.ts:82-98`). `wireEzToolsForTurn` (`src/runtime/ez-tools-host.ts:79-83`) pushes them into `ctx.agentTools` + `ctx.builtinToolDefsMap` per Ez turn. Unit + integration tests cover each factory. |
| 3b | fill_form/navigate_to dispatch on the client | ⚠ DESCOPED to v1.3 | Server-side factories still ship (`fill-form.ts`, `navigate-to.ts`) and emit deferred client events. Client dispatcher (`web/src/lib/ez/client-tool-dispatcher.ts:67-114`) returns `code: "no-handler"` for `fill_form` (page-side form registry was removed with `<EzContext>`) and only allows same-origin `goto()` for `navigate_to`. Acknowledged non-functional pending v1.3 tool-driven page-context redesign. |
| 4 | Drafts hydrate /agents/new and /new-project via ?prefill= and are consumed on submit | ✓ VERIFIED | `web/src/routes/(app)/agents/new/+page.svelte:24-56,110-162` and `web/src/routes/(app)/new-project/+page.svelte:11-89` read `?prefill=<draftId>`, call `getDraft`, hydrate forms via `{#key prefillKey}` remount, render `Agent/ProjectPrefillBanner`, and `consumeDraft` on submit. Upstream is now reachable: `propose_*` tools are registered (per #3a) and persist drafts. |
| 5 | Exactly one Ez conversation per user is enforced at the DB | ✓ VERIFIED | `CREATE UNIQUE INDEX IF NOT EXISTS conversations_user_ez_unique ON conversations (user_id) WHERE kind = 'ez'` is applied in both `src/db/migrate.ts:854-857` and `src/db/migrations/add-ez-mode-and-kind.ts:75-79`. `getOrCreateEzConversation(userId)` (`src/db/queries/conversations.ts:270-300`) does select-then-insert with retry on the unique-violation race. |
| 6 | Ez mode cannot be assigned to regular conversations and conversations with kind='ez' cannot have their mode changed | ✓ VERIFIED | `web/src/routes/api/conversations/[id]/+server.ts:49-54` returns 403 when `conv.kind === "ez"` and the body mutates `modeId`. `web/src/routes/api/conversations/+server.ts:58-67` returns 403 when a non-Ez creation references the Ez mode. Tests: `api-conversations-ez-lock.server.test.ts`, e2e `web/e2e/ez-mode-lock.spec.ts`. |

**Score:** 6/6 in-scope goal-checks verified. (#3b is acknowledged out-of-scope.)

### Required Artifacts

| Artifact | Status | Evidence |
|---|---|---|
| `src/db/migrations/add-ez-mode-and-kind.ts` | ✓ VERIFIED | exists, schema deltas + ez mode seed + ez_drafts table + unique partial index. |
| `src/db/migrate.ts:822-879` | ✓ VERIFIED | Phase 48 block applied in bootstrap path. |
| `src/db/schema.ts` | ✓ VERIFIED | `modes.allowedTools`, `modes.toolRestriction='allowlist'`, `conversations.kind`, `ezDrafts` table all present. |
| `src/runtime/tools/filter.ts` | ✓ VERIFIED | `'allowlist'` value handled with fail-closed branch when `allowedTools` missing. |
| `src/runtime/executor.ts:418-461` | ✓ VERIFIED | mode lookup + `applyToolFilters` with `mode.allowedTools`. |
| `src/runtime/ez-tools-host.ts` | ✓ VERIFIED (NEW since prior) | Exports `wireEzToolsForTurn`; consumed from setup-tools (closes prior gap #1). |
| `src/runtime/stream-chat/setup-tools.ts:333-371` | ✓ VERIFIED (NEW since prior) | Ez-mode branch invokes `wireEzToolsForTurn` per turn for `convRecord.kind === 'ez'`. Fail-soft on errors. |
| `src/db/queries/conversations.ts:270-300` | ✓ VERIFIED | `getOrCreateEzConversation` with race-retry. |
| `src/db/queries/ez-drafts.ts` | ✓ VERIFIED | createDraft / getDraft / consumeDraft / sweepExpired / listActiveDraftsForUser. |
| `src/runtime/tools/ez/{propose-*,summarize-conversation,find-agents,fill-form,navigate-to,index}.ts` | ✓ VERIFIED | All eight files exist; `getEzToolDefs(ctx)` is consumed by `wireEzToolsForTurn`. fill_form/navigate_to ship but are intentionally degraded post-ezContext removal. |
| `web/src/routes/api/ez/conversation/+server.ts` | ✓ VERIFIED | GET/POST find-or-create with auth. |
| `web/src/routes/api/ez/drafts/[id]/+server.ts` (+ /consume) | ✓ VERIFIED | GET (auth+ownership+expiry) + POST consume. |
| `web/src/routes/api/conversations/[id]/+server.ts:49-54` | ✓ VERIFIED | PUT rejects modeId mutation when conv.kind === 'ez'. |
| `web/src/routes/api/conversations/+server.ts:58-67` | ✓ VERIFIED | POST rejects modeId pointing at the ez mode. |
| `web/src/lib/ez/api.ts` | ✓ VERIFIED | getOrCreateEzConversation / getDraft / consumeDraft / clearEzConversation. |
| `web/src/lib/ez/panel-store.svelte.ts` | ✓ VERIFIED | `$state`-backed; openEzPanel/closeEzPanel/consumePendingPrompt. |
| `web/src/lib/ez/client-tool-dispatcher.ts` | ⚠ DEGRADED-BY-DESIGN | fill_form returns 'no-handler' (form registry removed); navigate_to validates + goto. v1.3 redesign work. |
| `web/src/lib/components/ez/EzButton.svelte` | ✓ VERIFIED | fixed bottom-right; hides when panel open. |
| `web/src/lib/components/ez/EzPanel.svelte` | ✓ VERIFIED | Renders messages, locks composer to Ez mode, calls /api/ez/conversation, dispatches client tool events. No longer ships `ezContext` (regression guard at `EzPanel.component.test.ts:275`). |
| `web/src/lib/components/ez/EzToolResultCard.svelte` | ✓ VERIFIED | Renders openUrl card. |
| `web/src/lib/components/ez/{Agent,Project}PrefillBanner.svelte` | ✓ VERIFIED | active/expired states. |
| `web/src/routes/(app)/+layout.svelte` | ✓ VERIFIED | EzButton + EzPanel mounted. |
| `web/src/lib/command-registry.ts` + `CommandPalette.svelte` | ✓ VERIFIED | "Ask Ez" + "ez:" prefix. |
| `web/src/routes/(app)/agents/new/+page.svelte` | ✓ VERIFIED | ?prefill hydration + AgentPrefillBanner + consumeDraft. |
| `web/src/routes/(app)/new-project/+page.svelte` | ✓ VERIFIED | ?prefill hydration + ProjectPrefillBanner + ProjectForm.initial. |

### Files removed since prior verification (descope)

| File | Status | Note |
|---|---|---|
| `web/src/lib/components/ez/EzContext.svelte` | ✗ REMOVED | Provider was the page-side opt-in for `<EzContext data=… formId=…>`. Removed wholesale. |
| `web/src/lib/ez/registry.ts` | ✗ REMOVED | Symbol-keyed register/deregister/snapshot — page-side context registry. |
| `web/src/lib/ez/context-serializer.ts` | ✗ REMOVED | `buildEzContextPayload` + token-budget gate. |
| `web/src/lib/ez/chat-context.ts` | ✗ REMOVED | Truncation helper for chat-page page-context payloads. |

(See commits `a4de90f`, `fc07608`, `6729ee3`, `1294b28`, `7ae8d91` for full deletion list.)

### Key Link Verification

| From | To | Via | Status |
|---|---|---|---|
| `executor.ts` | `filter.ts` | `applyToolFilters({ toolRestriction: mode.toolRestriction, allowedTools: mode.allowedTools })` | ✓ WIRED |
| `setup-tools.ts:333-371` | `runtime/ez-tools-host.ts` | `wireEzToolsForTurn(...)` gated on `convRecord.kind === 'ez'` | ✓ WIRED (closes prior gap #1) |
| `ez-tools-host.ts` | `runtime/tools/ez/index.ts` | `getEzToolDefs(ctx)` returns the seven defs; pushed into `ctx.agentTools` + `ctx.builtinToolDefsMap` | ✓ WIRED |
| migrate.ts | `schema.ts` | ALTER TABLE / CREATE TABLE / CREATE UNIQUE INDEX | ✓ WIRED |
| `web/.../api/conversations/[id]/+server.ts` | `db/queries/conversations.ts` | `conv.kind === 'ez'` check before modeId mutation | ✓ WIRED |
| `web/.../api/ez/conversation/+server.ts` | `db/queries/conversations.ts` | `getOrCreateEzConversation(user.id)` | ✓ WIRED |
| `EzPanel.svelte` | `lib/ez/api.ts` | `getOrCreateEzConversation()` on mount | ✓ WIRED |
| `EzPanel.svelte` | `lib/ez/client-tool-dispatcher.ts` | dispatch on `ez:client-tool` SSE event | ⚠ WIRED but degraded (fill_form returns 'no-handler' by design) |

### UAT Coverage (revised)

| UAT # | Criterion | Status | Notes |
|---|---|---|---|
| 1 | Floating button visible on every (app) route | ✓ | Layout-level mount. |
| 2 | Click button → panel opens; reopen shows same conversation | ✓ | panel-store + getOrCreateEzConversation. |
| 3 | Create project flow (propose → prefill → submit) | ✓ | Tool registered (per 3a); user must supply path explicitly since Ez has no page awareness. |
| 4 | Create agent flow | ✓ | Same as UAT 3. |
| 5 | Summarize current chat | ⚠ Partial | summarize_conversation works server-side; user must supply conversationId explicitly (Ez cannot see the page). Acknowledged regression vs original UAT phrasing. |
| 6 | Fill form on /agents/new | ✗ DESCOPED | fill_form returns 'no-handler' by design — v1.3 redesign work. |
| 7 | Navigate to a route | ⚠ DESCOPED | navigate_to still validates + calls goto, but the user-flow value depended on Ez seeing the page. v1.3. |
| 8 | Ez mode is locked | ✓ | API guard verified. |
| 9 | Ez mode is not selectable on regular conversations | ✓ | API 403 in POST /api/conversations. |
| 10 | CommandPalette `Ask Ez` command + `ez:` prefix | ✓ | command-registry + CommandPalette.svelte. |
| 11 | Graceful degradation on uninstrumented pages | n/a | Removed — Ez no longer differentiates instrumented vs uninstrumented; persona owns the "I cannot see your page" stance. |
| 12 | Tool allowlist is enforced server-side | ✓ | Real wiring now exercised — Ez tools enter the toolset and survive the filter; non-Ez names are stripped. |
| 13 | Page context is captured but bounded | n/a | REMOVED — protocol descoped. |
| 14 | Comprehensive test suite passes | ✓ | Suites green; ezContext-specific assertions removed in commit 6729ee3. Regression guard added that asserts `payload.ezContext` is `undefined` from the panel. |

### Known descoped capabilities (carried into v1.3)

These items are intentionally non-functional in v1.2. They are **NOT** launch blockers — they are explicit, acknowledged tradeoffs for the v1.3 redesign:

1. **`fill_form` tool** — server-side factory still ships; client dispatcher always reports `code: "no-handler"`. Awaits v1.3 tool-driven form-discovery design.
2. **`navigate_to` tool** — still validates same-origin paths and calls `goto()`; the user-journey value (Ez navigating based on page awareness) is gone with `<EzContext>`.
3. **Page-context protocol (`<EzContext>` provider, `ezContext` payload, `<page_context>` system-prompt block)** — removed wholesale. v1.3 redesign will re-introduce a tool-driven approach.

The Ez persona was updated to acknowledge this limitation directly: it tells the LLM it cannot see the user's page and must ask for ids/paths explicitly.

---

## Re-verification Summary

The phase ships cleanly under the revised scope. All three prior gaps were closed before the ezContext descope landed; the descope itself then reduced the goal surface from 7 to 6 checks. The remaining six checks all pass with file:line evidence above.

**Launch readiness:** No goal-check is failing. The two intentionally-degraded tools (`fill_form`, `navigate_to`) are documented as v1.3 carry-over.

---

_Re-verified: 2026-05-06_
_Verifier: Claude (Team C — pre-launch readiness)_
_Supersedes: 2026-04-29 verification (status: gaps_found, score 4/7)_
