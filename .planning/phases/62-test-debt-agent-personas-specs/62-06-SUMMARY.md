---
phase: 62-test-debt-agent-personas-specs
plan: 06
subsystem: testing
tags: [test-add, coverage, vitest, server-test, component-test, meta-agent-chat, agent-configs-generate, svelte-5, testing-library-svelte, phase-6-deliverable]

# Dependency graph
requires:
  - phase: 62-test-debt-agent-personas-specs
    provides: "Wave 3 coverage gap closure. No file-modified overlap with prior plans (62-01/02/03 touched e2e specs; 62-04 touched product code; 62-05/07/08/09 created different test files). Plan 62-06 modifies one existing server test file + creates one new component test file under web/src/__tests__/."
provides:
  - "api-agent-configs-generate.server.test.ts — new third arm asserting malformed JSON inside <agent_config> tags returns body.config=null (not 500), exercising the try/catch around JSON.parse at +server.ts:42-49"
  - "MetaAgentChat.component.test.ts — 2 vitest cases covering the client-side onconfig wiring at MetaAgentChat.svelte:76-78 (the if (data.config) branch that gates the prefill handoff from chat into AgentEditor)"
  - "Pattern: stub /api/models + /api/models/capabilities + /api/modes + /api/agent-configs/generate as a coordinated quartet to drive ChatInput-based components past their model-autoselect submit gate"
  - "Pattern: __resetCapabilityCacheForTests in beforeEach to flush attachment-client.ts's per-(provider, model) module-scope promise cache between component-test renders"
affects: [62-08, 62-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server-test coverage triad for regex+JSON.parse extraction: happy-path-with-match (1), no-match (config=null), match-but-parse-fails (config=null). Each branch of the extractor reachable from one mocked LLM response shape — locks the contract that parse failure is a silent fall-through, not a 500."
    - "Component-test fetch stub ordering matters: substring-overlap routes (/api/models vs /api/models/capabilities) MUST be checked in most-specific-first order, else the broader prefix swallows the narrower path and returns the wrong response shape (here, an array instead of a ClientCapabilities object), crashing downstream $derived expressions on `.kinds.length`."
    - "Component-test gate ChatInput submit() pathway: ChatInput.svelte:592 short-circuits submit when selectedModel is null. Wait for /api/models to land + the Send button to become enabled before fireEvent.keyDown(...,{key:'Enter'}). Otherwise Enter is a no-op."

key-files:
  created:
    - web/src/__tests__/MetaAgentChat.component.test.ts
    - .planning/phases/62-test-debt-agent-personas-specs/62-06-SUMMARY.md
  modified:
    - web/src/__tests__/api-agent-configs-generate.server.test.ts

key-decisions:
  - "Server handler at +server.ts:42-49 already wraps JSON.parse in try/catch returning null — the plan's anticipated escape hatch (test.fixme + UN-BLOCKER for handler hardening) was NOT triggered. The malformed-JSON arm passes GREEN against current product."
  - "Use container.querySelector('.chat-textarea') instead of getByRole('textbox') — ChatInput's textarea exposes role='combobox' (it owns the mention-listbox), not role='textbox'. The .chat-textarea class is a stable hook (used elsewhere in the codebase for mention-related selectors)."
  - "Stub the full quartet (/api/models, /api/models/capabilities, /api/modes, /api/agent-configs/generate) — partial stubbing leaks: missing capabilities returns [] from the default branch, then ChatInput's `$derived(... && capabilities.kinds.length > 1)` blows up on `undefined.length`. The capabilities stub also has to come BEFORE the /api/models branch in the if-ladder because /api/models is a strict prefix of /api/models/capabilities."
  - "__resetCapabilityCacheForTests in beforeEach — attachment-client.ts caches the capability promise per (provider,model,conversationId,extensions) key at module scope. Without an explicit flush, the second test reuses the first test's already-rejected promise (cache.delete only fires on rejection, not on test-boundary cleanup), and the Send button never re-enables."
  - "Gate fireEvent.keyDown on the Send button being enabled — ChatInput.svelte:592 returns early when selectedModel is null. Polling for `button[aria-label='Send message']:not(:disabled)` is cheaper + more reliable than racing the onMount → /api/models → onautoselect → setSelectedModel chain via fixed setTimeout."
  - "Wait on the fetch spy seeing /api/agent-configs/generate (not on a stable DOM signal) for the negative case — the negative case has no observable DOM change after Enter (config=null means no follow-up route push). Asserting the fetch landed is the cleanest signal that the if (data.config) branch has been evaluated."

patterns-established:
  - "Disposition: TEST-ADD (coverage) trailer per Phase 62 convention — third distinct disposition convention in Phase 62 (FIX (product) in 62-04; REPAIR (test-layer) in 62-01/02/03; TEST-ADD (coverage) in 62-05/07/06)."
  - ".component.test.ts suffix routes through vitest (jsdom + @testing-library/svelte); .server.test.ts routes through vitest (node + vi.mock); bare .test.ts routes through bun:test."

requirements-completed: [TEST-02]

# Metrics
duration: 8min
completed: 2026-05-13
---

# Phase 62 Plan 6: MetaAgentChat Coverage + agent-configs-generate Malformed-JSON Arm Summary

**1 new test arm in existing server test file (malformed JSON inside `<agent_config>` returns config=null) + 1 new component test file with 2 cases (`onconfig` fires iff `config` is non-null) — closes 1 of 5 Phase 6 deliverable coverage gaps for the MetaAgentChat 06-04 surface.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-05-13T16:03:48Z
- **Completed:** 2026-05-13T16:11:00Z (approximate; final commit + SUMMARY)
- **Tasks:** 3 (Task 1 server-test extension, Task 2 component-test creation, Task 3 atomic commit with Disposition trailer)
- **Files modified:** 1 file modified (`web/src/__tests__/api-agent-configs-generate.server.test.ts` +33 lines for one new test) + 1 file created (`web/src/__tests__/MetaAgentChat.component.test.ts` ~180 lines)

## Accomplishments

- **Server-test extension (Task 1):** 7 → 8 cases pass on `api-agent-configs-generate.server.test.ts` (1.27s vitest run, jsdom-equivalent node). New case `"malformed JSON inside <agent_config>: returns config=null, no 500"` mocks the LLM to emit valid opening + closing tags around an unparseable body (`{ name: not-quoted, prompt }`) and asserts:
  - `res.status === 200` (not 500 — i.e. the regex+JSON.parse chain at `+server.ts:39-50` is graceful)
  - `body.config === null` (the catch branch returns null)
  - `body.text` still contains `agent_config` (text is unchanged; only extraction failed)
- **Component-test creation (Task 2):** 0 → 2 cases pass on the new `MetaAgentChat.component.test.ts` (1.28s vitest run, jsdom). Cases:
  - **Positive:** `/api/agent-configs/generate` returns `{ text, config: {name, prompt} }` → `onconfig` called exactly once with the config object.
  - **Negative:** `/api/agent-configs/generate` returns `{ text, config: null }` → `onconfig` NOT called. Verified by waiting on the fetch spy seeing the generate call (so we know the branch has been evaluated) then asserting `onconfig.mock.calls.length === 0`.
- **Combined run:** 10/10 GREEN in 1.44s on both files together.
- **Zero SUT changes** — `git diff main -- web/src/lib/components/MetaAgentChat.svelte` and `git diff main -- web/src/routes/api/agent-configs/generate/+server.ts` both empty. Layer 5 sacred.
- **Sacred-12-stash invariant preserved** (12 → 12 → 12 throughout pre-flight, post-Task-1, post-commit).
- **Disposition: TEST-ADD (coverage)** trailer present on the atomic commit, matching 62-05/62-07 convention.
- **Atomic single-commit** (per plan Task 3): both file changes in one commit `a3b6ad2`, independently revertable as one unit.

## Task Commits

Each task was committed atomically per plan:

1. **Task 1 + Task 2 + Task 3 (combined per plan's atomic-commit policy):** `a3b6ad2` — `test(62-06): extend agent-configs-generate malformed-JSON arm + add MetaAgentChat.component.test.ts`

The plan's Task 3 explicitly bundled both file changes into ONE commit (atomic blast radius); per-task commits in this plan map 1:1 onto the one atomic commit.

## Files Created/Modified

- `web/src/__tests__/api-agent-configs-generate.server.test.ts` (MODIFIED; +33 lines) — appended one new `test(...)` block after the existing `"happy path without <agent_config> tags returns config=null"` case at line 181. New block tests the regex-matches-but-JSON-parse-fails branch of `extractAgentConfig` at `+server.ts:39-50`.
- `web/src/__tests__/MetaAgentChat.component.test.ts` (NEW; ~180 lines) — vitest component-test using `@testing-library/svelte` to render `MetaAgentChat.svelte` with a stubbed `globalThis.fetch` that returns a fully-coordinated quartet of API responses (`/api/models`, `/api/models/capabilities`, `/api/modes`, `/api/agent-configs/generate`). 2 cases assert the `onconfig` prop wiring at `MetaAgentChat.svelte:76-78`.

## Decisions Made

1. **Handler already gracefully handles malformed JSON** — pre-flight `grep` confirmed `extractAgentConfig` at `+server.ts:39-50` already wraps `JSON.parse` in try/catch returning null. The plan's anticipated escape hatch (test.fixme + UN-BLOCKER for handler hardening) was NOT needed. The test passes GREEN against current product.
2. **Locate textarea via `.chat-textarea` class, not `role="textbox"`** — ChatInput's textarea has `role="combobox"` (mention-listbox owner). The first iteration of the test used `findByRole("textbox")` and failed with "Unable to find an accessible element with the role 'textbox'". Switched to `container.querySelector<HTMLTextAreaElement>(".chat-textarea")`.
3. **Stub the full four-route quartet** — first iteration only stubbed `/api/modes` + the generate endpoint, but `ChatInput` mounts `ModelSelector` which calls `/api/models`, and the `$effect` at `ChatInput.svelte:197-207` calls `getClientCapabilities` which hits `/api/models/capabilities`. Missing either crashed the test with `Cannot read properties of undefined (reading 'length')` on `capabilities.kinds.length` at `ChatInput.svelte:298`.
4. **If-ladder ordering: capabilities BEFORE models** — `/api/models` is a strict prefix of `/api/models/capabilities`. With `url.includes(...)` predicates in alphabetical order, capabilities was matched by the models branch first, returning an array instead of a `ClientCapabilities` shape, so `caps.kinds` was undefined. Fix: re-order the if-ladder so capabilities is checked first; added a code-comment lock at the branch.
5. **`__resetCapabilityCacheForTests` in beforeEach** — `attachment-client.ts:21` holds a module-scope `Map<string, Promise<ClientCapabilities>>`. Without flushing, the second test reuses the first test's promise, which is already settled (or worse, rejected) against stale fetch state. Importing the test seam from `$lib/chat/attachment-client` and calling it in `beforeEach` is the explicit, plan-aligned solution.
6. **Wait for Send button to be enabled (not just for /api/models to land)** — `ChatInput.svelte:592` returns early when `selectedModel` is null. The autoselect flow is async (fetch → setState in the parent). Polling for `button[aria-label='Send message']:not(:disabled)` via `waitFor` is robust against re-render timing.
7. **Use `aria-label="Send message"` selector for the Send button** — confirmed by inspecting the ChatInput DOM dump from the failing test run; the button has `aria-label="Send message"` as its accessible name.
8. **Wait for the fetch spy on the negative case (not for a DOM signal)** — the negative case has no DOM change post-Enter (config=null means MetaAgentChat doesn't push to the editor route, doesn't update the title, etc.). Asserting `callsTo(fetchSpy, "/api/agent-configs/generate") > 0` is the cleanest signal that the `if (data.config)` branch at `MetaAgentChat.svelte:76` has been evaluated.
9. **`vi.mocked(complete).mockResolvedValue({ stopReason: "stop", ... })` not `"endTurn"`** — examined existing tests (`api-agent-configs-generate.server.test.ts:152`): they use `"stop"` as the success stop reason. The handler at `+server.ts:130` only short-circuits on `"error"`, so the literal stopReason doesn't matter for the test's assertions, but using the same literal as adjacent tests keeps mock shapes consistent.

## Patterns Established

- **Server-test branch triad for regex+JSON.parse extractors:**
  - happy-path-with-match
  - no-match (regex misses)
  - match-but-parse-fails (regex hits, JSON.parse throws)
  Locks the contract that parse failure is a silent fall-through to `null`, not a 500. This is a generalizable pattern for any handler that extracts structured data from LLM output with `text.match(/<tag>(...)<\/tag>/)` + `JSON.parse`.
- **Component-test fetch stub ordering:** substring-overlap routes (`/api/models` vs `/api/models/capabilities`) MUST be checked most-specific-first. Generalizable to any URL hierarchy.
- **Component-test gate for ChatInput-based components:** wait for `button[aria-label='Send message']:not(:disabled)` before pressing Enter. Re-usable for any component that embeds ChatInput.
- **Capability-cache flush via test seam:** `__resetCapabilityCacheForTests` exists for exactly this reason; it's the prescribed way to flush module-scope caches between test renders. Use it instead of `vi.resetModules()` or `vi.doUnmock()` — those reset the whole module graph and are far heavier.

## Deviations from Plan

**Three Rule-1 deviations auto-fixed during Task 2 (component-test driver iteration):**

### 1. [Rule 1 - Bug] Textarea role mismatch

- **Found during:** Task 2 first vitest run
- **Issue:** Plan's example code used `findByRole("textbox")` for the ChatInput textarea, but the textarea in ChatInput.svelte has `role="combobox"` (it owns the mention-listbox at `aria-controls="mention-listbox"`).
- **Fix:** Switched to `container.querySelector<HTMLTextAreaElement>(".chat-textarea")` — a stable hook the codebase uses elsewhere for chat-textarea selectors.
- **Files modified:** `web/src/__tests__/MetaAgentChat.component.test.ts` (added a clarifying comment about role=combobox at the top of the file's driver-notes block).

### 2. [Rule 1 - Bug] Missing /api/models/capabilities stub crashed $derived

- **Found during:** Task 2 second vitest run (after fixing #1)
- **Issue:** `ChatInput.svelte:197-207` has a `$effect` that calls `getClientCapabilities(provider, model, fetch, ...)`. With my fetch stub returning `[]` from the default branch on the capabilities URL, `caps = []` then `caps.kinds.length` at `ChatInput.svelte:298` blew up with `Cannot read properties of undefined (reading 'length')`. Plan's example didn't anticipate this — ChatInput's capabilities $effect is downstream of ModelSelector's autoselect, which the plan example also didn't stub.
- **Fix:** Added a `/api/models/capabilities` branch in the fetch stub returning a minimal `{kinds: ["text"], acceptedMimeTypes: [], maxBytesPerFile, maxFilesPerMessage}` shape. Also added `__resetCapabilityCacheForTests` in `beforeEach` to flush the module-scope promise cache between tests.
- **Files modified:** `web/src/__tests__/MetaAgentChat.component.test.ts` (added the new branch + import + beforeEach call).

### 3. [Rule 1 - Bug] Substring-prefix swallow on /api/models vs /api/models/capabilities

- **Found during:** Task 2 third vitest run (after fixing #2)
- **Issue:** With my fetch stub's if-ladder ordering as `/api/models` first, then `/api/models/capabilities`, the capabilities URL (`/api/models/capabilities?provider=...`) was matched by the **models** branch (which returns an array), not the capabilities branch (which returns the shape). Same `undefined.length` crash as #2.
- **Fix:** Re-ordered the if-ladder: most-specific URL first. Added an explicit code-comment lock at the branch noting the ordering invariant. (This generalizes: any URL hierarchy with substring-overlap needs most-specific-first matching.)
- **Files modified:** `web/src/__tests__/MetaAgentChat.component.test.ts` (capabilities branch moved above models branch + invariant comment).

All three deviations are within scope (test-code only), self-caused by missing details in the plan example, and resolved without touching the SUT.

**Out of scope (NOT touched):** the pre-existing dirty working-tree files (`.planning/ROADMAP.md`, `.planning/STATE.md`, `web/src/lib/hljs-theme.css`) carried in from parallel sessions remain untouched per explicit-path `git add` discipline.

## Issues Encountered

None blocking. Three iterations on the component-test driver (deviations #1, #2, #3 above) were all resolved in-band via Rule 1 auto-fix per the plan's own scope. No checkpoints, no architectural questions raised, no plan-shape changes.

## User Setup Required

None — pure test coverage addition; no external services, no environment variables.

## Next Phase Readiness

- Plan 62-06 closes 1 of 5 Phase 6 deliverable coverage gaps (the MetaAgentChat 06-04 surface).
- Phase 62 remaining: 62-08 and 62-09 (per STATE.md "3/9 plans remain (62-06, 62-08, 62-09)" pre-this-plan; now 2/9 remain).
- The component-test driver pattern (full-quartet fetch stub + cap-cache reset + send-button-enabled gate) is reusable for any future MetaAgentChat / ChatInput-derived coverage plan.
- Disposition: TEST-ADD (coverage) trailer is now well-established across three Phase 62 commits (62-05 e6e3647, 62-07 5048b32, 62-06 a3b6ad2).

## Verification Layers

- **Layer 1 (target tests pass):** `cd web && bunx vitest run src/__tests__/api-agent-configs-generate.server.test.ts src/__tests__/MetaAgentChat.component.test.ts --reporter=verbose` → 10/10 GREEN in 1.44s.
- **Layer 5 (no SUT changes):** `git diff main -- web/src/lib/components/MetaAgentChat.svelte` empty; `git diff main -- web/src/routes/api/agent-configs/generate/+server.ts` empty.
- **Layer 6 (sacred-12-stash):** `git stash list | wc -l` returns 12 pre-flight, post-Task-1, post-Task-2, and post-commit. Zero `git stash` operations.
- **Disposition trailer:** `git log -1 --pretty=%B | grep -E "Disposition: TEST-ADD"` matches.

## Self-Check: PASSED

- FOUND: web/src/__tests__/MetaAgentChat.component.test.ts (created)
- FOUND: web/src/__tests__/api-agent-configs-generate.server.test.ts (modified; +33 lines)
- FOUND: commit a3b6ad2 with Disposition: TEST-ADD (coverage) trailer
- FOUND: 10/10 vitest cases pass on the two target files
- FOUND: 0 lines diff against main for web/src/lib/components/MetaAgentChat.svelte (Layer 5 sacred)
- FOUND: 0 lines diff against main for web/src/routes/api/agent-configs/generate/+server.ts (Layer 5 sacred)
- FOUND: git stash list = 12 (sacred-12 invariant preserved)
