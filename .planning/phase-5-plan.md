# Phase 5 — Port `ask_human` from built-in tool to the bundled `orchestration` extension (**FINAL phase**)

**STATUS: ✅ SHIPPED (2026-04-21)** — see the Ship log at the bottom of this doc. **The 5-phase task-tracking migration is COMPLETE.**

**Self-contained plan. Picks up cold from a fresh session.**

Ship-order reference: this is **Phase 5 of the 5-phase task-tracking
migration** framed in `.planning/phase-4-plan.md:10-11` (and originally
in `.planning/phase-3-plan.md:10-11`). Prior phases:

- Phase 1 — scratchpad port (done). Proved the built-in→bundled pattern.
- Phase 2a-lite (commit `84a6b7a`) — capability-permission tier +
  SSE conversation filter + `EZCORP_DISABLE_CAPABILITY_TOOLS` kill-switch.
- Phase 2b (commit `c200c5e`) — `ezcorp/emit-task-event` +
  `ezcorp/agent-configs` reverse-RPCs.
- Phase 2c — `EventSubscriptionDispatcher` + `registerEventHandler` SDK
  surface (see `.planning/phase-2c-plan.md`).
- Phase 2d (commits `452f3e7`, `38ede47`, `75d02e6`, `e65c01f`, `cc26ae3`)
  — `ezcorp/spawn-assignment` reverse-RPC.
- Phase 3 — `task-tracking` bundled extension (shipped 2026-04-21; see
  `.planning/phase-3-plan.md:929`). Proved the two-hop event bridge.
- Phase 4 — `invoke_agent` ported to the bundled `orchestration`
  extension (shipped **2026-04-21**; see
  `.planning/phase-4-plan.md:§Ship log`). Proved the wire-on-first-use
  pattern at `src/runtime/orchestration-host.ts:ensureOrchestrationWired`
  on the hottest code path.

After Phase 5 ships, the `src/runtime/tools/` directory has **zero**
residents. The host-side built-in-tool infrastructure
(`src/runtime/tools/builtin-registry.ts`) can either be retained as
an empty-registry shell or deleted entirely — see §Open design notes.

The durable roadmap lives in `git log --grep="Phase"`. This file
supersedes any prior Phase 5 outline (notably the §Open design notes
in `.planning/phase-4-plan.md:1148-1165` which left options (a) and (b)
on the table). **Option (a) is frozen here.** Treat as authoritative.

**Preconditions (must be met before merge):**

1. Phase 4 soak on main — **SATISFIED** as of 2026-04-21 ship. Original
   soak target ~2026-05-05. Operator sign-off gates merge of Phase 5.
2. `orchestration` bundled extension present at
   `docs/extensions/examples/orchestration/` with `invoke_agent` tool
   live (see `docs/extensions/examples/orchestration/ezcorp.config.ts:26-48`
   for the shipped manifest shape).
3. Phase 2c event-subscription infrastructure stable — dispatcher at
   `src/extensions/event-subscription-dispatcher.ts:157-179`, SDK
   `registerEventHandler` working, and the `conversationId`-gating
   contract at `event-subscription-dispatcher.ts:161-162` holding.
4. Phase 2d `spawnAssignment` infrastructure stable (not directly
   used by `ask_human` but the extension lives in the same
   capability tier and must not regress).
5. `DIRECT_CARRIER_EVENT_TYPES` set at
   `src/runtime/sse-conversation-filter.ts:46-60` is unchanged from
   Phase 3; any prior ad-hoc additions would invalidate §5.4's
   audit trail below.

---

## Context for a fresh session

After Phase 4, **one** built-in LLM tool remains
(`src/runtime/tools/builtin-registry.ts:24-30`):

- `ask_human` (`src/runtime/tools/ask-human.ts` — **129 LOC**; the only
  `BuiltInToolMeta` entry at `builtin-registry.ts:29`).

This is the last resident of `src/runtime/tools/`. Phase 5 completes
the five-phase built-in→bundled migration by porting `ask_human` to
the same `orchestration` bundled extension that already hosts
`invoke_agent`. After Phase 5 the `orchestration` extension grows from
1 tool to 2. No new extension is introduced.

### What `ask_human` does today

From `src/runtime/tools/ask-human.ts` (full-file read):

- Module-scoped state: `const pendingRequests = new Map<string,
  PendingHumanInput>()` at `ask-human.ts:21` keyed on a freshly-minted
  UUID `requestId`. `PendingHumanInput` shape is
  `{ resolve: (response: string) => void; reject: (err: Error) => void }`
  (`ask-human.ts:16-19`).
- Timeout constant: `HUMAN_INPUT_TIMEOUT_MS = 5 * 60_000` at
  `ask-human.ts:23` — five minutes, hard-coded.
- Factory `createAskHumanTool({ bus, runId, conversationId })` at
  `ask-human.ts:33` produces an `AgentTool` with:
    - `name: "ask_human"` (`ask-human.ts:37`).
    - JSON-Schema `{ question: string }` required (`ask-human.ts:43-52`).
    - `execute(toolCallId, params, signal)` at `ask-human.ts:54`:
        1. Mints `requestId = crypto.randomUUID()` (`ask-human.ts:56`).
        2. Emits `orchestrator:human_input` with
           `{ runId, conversationId, question, requestId }` on the bus
           (`ask-human.ts:59-64`).
        3. Installs an `AbortSignal` listener that rejects the gate
           with `"Aborted while waiting for human input"` if fired
           (`ask-human.ts:67-74`).
        4. Starts a `setTimeout` that rejects the gate with
           `"Timed out waiting for human input"` after 5 minutes
           (`ask-human.ts:77-83`).
        5. Opens a Promise gate keyed on `requestId` in the module-
           scoped map (`ask-human.ts:86-88`).
        6. On resolve: returns `{ content: [{ type: "text", text:
           response }], details: {} }` (`ask-human.ts:90-93`).
        7. On reject (abort/timeout/dismiss): returns
           `{ content: [{ type: "text", text: "Error: <msg>" }],
           details: { isError: true } }` (`ask-human.ts:94-99`).
        8. `finally` clears the timeout and removes the abort listener
           (`ask-human.ts:100-103`).
- Module exports three gate-driver fns:
    - `resolveHumanInput(requestId, response)` at `ask-human.ts:111`
      — looks up + deletes the entry, calls `pending.resolve(response)`.
      If `requestId` is unknown, no-ops silently (`ask-human.ts:113`).
    - `rejectHumanInput(requestId)` at `ask-human.ts:119` — same
      lookup-and-delete, calls `pending.reject(new Error("Human input
      request was dismissed"))`.
    - `hasPendingHumanInput(requestId)` at `ask-human.ts:127` — bool
      check.
- Registration in the built-in registry:
  `{ name: "ask_human", ..., category: "orchestration", mentionable:
  false }` at `builtin-registry.ts:29`.

### Call sites for `ask_human`

After Phase 4, only **two** host files and **one** SvelteKit route
reference the tool or its gate:

- The host factory is invoked wherever the executor wires built-in
  tools into a turn (grep `createAskHumanTool` in `src/runtime/`). The
  call site moves to the orchestration-host wiring path (§5.1) — same
  seam as Phase 4's `wireOrchestrationToolsForTurn`.
- `web/src/routes/api/orchestrator/human-input/+server.ts:5-14` POST
  handler. Line 10: `const { resolveHumanInput } = await
  import("$server/runtime/tools/ask-human");`. Line 11:
  `resolveHumanInput(requestId, response);`. Returns `{ ok: true }`.
- `src/__tests__/ask-human.test.ts` — 147 LOC, **8 unit tests**. No
  integration or E2E coverage.

Plus three read-only surfaces that touch event shapes or UI:

- `src/types.ts:280-289` — event payload shapes for both
  `orchestrator:human_input` (`{ runId, conversationId, question,
  requestId }`) and `orchestrator:human_response` (`{ requestId,
  response }` — **no `conversationId`**).
- `web/src/routes/(app)/project/[id]/chat/[convId]/+page.svelte:
  2129-2157` — renders pending questions as amber cards; `submitHumanInput(requestId)`
  at lines 377-390 POSTs to the endpoint and marks local
  `humanInputResponded` Set.
- `web/src/lib/stores.svelte.ts:927-931` — client-side handler for
  `orchestrator:human_response`. It reads `event.data.requestId`,
  removes that entry from `store.pendingHumanInputs`, and is currently
  **never invoked** because nothing emits the event (see below).
- `web/src/lib/ws.ts:13` — event name listed in the WS union type
  (passive reference; no behavior).
- `web/src/routes/api/runtime-events/+server.ts:39` — event name in
  the SSE re-broadcast allowlist (passive reference).

### The dead-event-handler problem

`orchestrator:human_response` is **dead code** in Phase 4's tree:

- Payload shape defined at `src/types.ts:286-289` as
  `{ requestId, response }`. **Zero `conversationId`.**
- The set at `src/runtime/sse-conversation-filter.ts:46-60` does
  **NOT** include `"orchestrator:human_response"` (only
  `"orchestrator:human_input"` at line 57). So even if the event were
  emitted, the SSE filter would let it pass-through for any payload
  with a top-level `conversationId` — but the payload has none
  (`filter.ts:141-142` returns `true` if `conversationId` is
  missing — fail-open pass-through).
- The client handler at `web/src/lib/stores.svelte.ts:927-931` is the
  only listener. It fires on WS delivery. **Nothing on the host emits
  the event** — `resolveHumanInput()` at `ask-human.ts:111-116` is
  currently a pure Promise resolve, no `bus.emit(...)`.
- Net effect today: the client-side `pendingHumanInputs` entry is
  removed only after the UI receives a re-render triggered by an
  unrelated event (the `tool:complete` emit from `ask_human`'s own
  return path). This is the accidental status-quo that Phase 5 makes
  deterministic.

### The payload-shape problem (Option (a))

Phase 4's §Open design notes (`.planning/phase-4-plan.md:1148-1165`)
laid out two Phase 5 options. **Phase 5 adopts Option (a):**

- Extend `DIRECT_CARRIER_EVENT_TYPES` at
  `src/runtime/sse-conversation-filter.ts:46-60` to include
  `"orchestrator:human_response"`.
- Add `conversationId: string` to the event's payload shape at
  `src/types.ts:286-289`.
- Make the POST endpoint `/api/orchestrator/human-input` emit the
  event on gate-resolution.
- Subscribe the `orchestration` extension to
  `"orchestrator:human_response"` (already on its
  `eventSubscriptions` manifest after Phase 5 ships — currently just
  `["task:assignment_update"]`).
- Port the existing 5-minute Promise gate from the host module into
  the extension subprocess. Same pattern as Phase 4's
  `pendingInvocations` map — subprocess `persistent: true` so the map
  survives across tool calls.

Option (b) — the bidirectional request/response RPC
(`.planning/phase-4-plan.md:1156-1162`) — is **rejected** for Phase 5
because (1) Option (a) reuses the exact same two-hop bridge pattern
Phase 3 and Phase 4 validated, minimizing new surface, and (2)
Option (b) would introduce an RPC that blocks for up to 5 minutes —
exactly the anti-pattern Phase 2d's §Goal
(`.planning/phase-2d-plan.md:139`) rejected for `spawnAssignment`,
and the rationale ("human latency is the bottleneck, not compute")
does not justify revisiting the architectural constraint for a tool
that ships ~once-per-turn at worst.

### Two hidden invariants

Both must be preserved or the bridge silently fails:

1. **The POST endpoint must know `conversationId` to emit a properly-
   scoped event.** Today the endpoint only receives
   `{ requestId, response }` (`human-input/+server.ts:9`). To emit the
   direct-carrier-shaped `orchestrator:human_response`, it must
   either (i) accept `conversationId` in the POST body (the frontend
   submits it alongside `requestId` + `response`), or (ii) reverse-map
   `requestId → conversationId` on the host before emit.
   Either works. §Open design notes records the trade-off. **Frozen
   default: reverse-map on the host**, via a module-scoped
   `Map<requestId, conversationId>` maintained next to the pending
   gate inside the extension — the POST handler reads it via a small
   accessor. This avoids any frontend change and keeps the payload
   contract at the endpoint boundary unchanged. See §5.4.
2. **The extension's pending-map must carry `conversationId` alongside
   the gate so the event-subscription handler can verify the event
   is for THIS conversation.** Phase 2c delivers the event to every
   extension subscriber wired to the matching conversation; the
   extension still must confirm the inbound event's `conversationId`
   matches the `conversationId` it recorded when opening the gate.
   Without this, a UUID-guess attack from a colluding extension
   could resolve a gate for an unrelated conversation. See §5.3
   (Security) and §7 (Tests).

---

## Goal

Ship the `ask_human` LLM tool as the second tool in the bundled
`orchestration` extension at `docs/extensions/examples/orchestration/`
so that:

1. Byte-for-byte feature parity on the LLM-visible surface (same
   JSON schema, same return shape, same error modes, same 5-minute
   timeout, same abort-signal semantics, same on-dismiss rejection).
2. The `orchestrator:human_response` event becomes the **sole**
   resolution channel. The host emits it on POST; the extension
   subscribes via Phase 2c and resolves its local Promise gate on
   receipt.
3. Per-conversation scoping is enforced at the extension boundary.
   A UUID-guess from outside the conversation can no longer resolve
   a gate.
4. `src/runtime/tools/ask-human.ts` is **deleted**. The built-in
   registry drops to **zero** entries (optionally deleted entirely —
   see §Open design notes).
5. The tool remains auto-wired to every conversation on first use
   via the existing `ensureOrchestrationWired(conversationId)` helper
   at `src/runtime/orchestration-host.ts` (no new wiring site — the
   Phase 4 helper already runs on every turn that reaches the
   orchestration seam; Phase 5 ensures `ask_human` is injected
   alongside `invoke_agent`).

**Frozen decisions (resolved during planning — do not relitigate):**

- **Scope: `ask_human` only. This is the final phase of the 5-phase
  migration.** No other `orchestrator:*` event is promoted to a
  direct-carrier in this phase — the allowlist grows by exactly one
  entry.
- **Option (a) confirmed.** The dead `orchestrator:human_response`
  event is brought to life with the minimum-surface change:
  `conversationId` added to the payload from day one, event added
  to `DIRECT_CARRIER_EVENT_TYPES`, extension subscribes. Option (b)
  rejected (see Context for a fresh session).
- **`orchestration` extension grows to 2 tools** (`invoke_agent` from
  Phase 4 + `ask_human` from Phase 5). **No new extension** — the
  extension's `name: "orchestration"`, path, permission block, and
  subprocess all remain as-is. Phase 4's §Frozen decision
  (`.planning/phase-4-plan.md:208-213`) explicitly set this up.
- **Tool name stays `ask_human` (bare, not namespaced).** Same
  justification as Phase 4's `invoke_agent`
  (`.planning/phase-4-plan.md:214-231`): the tool is referenced by
  literal name in the built-in registry (`builtin-registry.ts:29`)
  and the client-side UI copy. Renaming would be a surface change
  that buys nothing. The manifest declares
  `tools: [..., { name: "ask_human" }]` with a bare name — the host
  accepts this (same `schemaOverride`/dispatcher path as
  `invoke_agent`).
- **Event-payload migration for `orchestrator:human_response`:
  `conversationId` added from day one.** Payload shape at
  `src/types.ts:286-289` becomes
  `{ requestId: string; response: string; conversationId: string }`.
  Ship alongside the emitter update in the same commit (commit 1 in
  §Ship order) — no "transitional" period where some emitters send
  the new field and others don't, because today there is exactly
  one emitter (the POST endpoint) and it lands in this commit.
- **Dead handler in `web/src/lib/stores.svelte.ts:927-931` is
  LEFT AS-IS** (no cleanup micro-task). After Phase 5 the handler
  fires for every resolved request, which is the **intended**
  behavior — the entry is removed from `pendingHumanInputs`
  deterministically on event receipt instead of accidentally via an
  unrelated re-render. Deleting the handler would regress the UX.
  The handler's logic does not need to change: it already keys on
  `requestId` (which is still present in the payload); the new
  `conversationId` field is silently ignored by the existing
  destructure at `stores.svelte.ts:928`.
- **The 5-minute timeout moves into the extension subprocess.**
  Phase 2c infrastructure already supports long-lived extension-side
  gates — the `persistent: true` manifest flag keeps the subprocess
  alive across tool calls. The `setTimeout` handle and the gate
  `Map<requestId, ...>` both live in the extension, mirroring
  Phase 4's `pendingInvocations` pattern
  (`.planning/phase-4-plan.md:459-467`).
- **Conversation-scoping fix (security).** The extension's pending
  map carries `conversationId` alongside the gate; the event
  subscription handler drops events where
  `event.conversationId !== entry.conversationId`. This closes the
  UUID-guess attack surface noted in P1's security finding — any
  holder of a UUID from outside the conversation can no longer
  resolve the gate, because (a) the dispatcher filters by
  `conversationId` at `event-subscription-dispatcher.ts:161-162`
  (the attacker would need to be a wired extension in the victim's
  conversation), and (b) even if Phase 2c's per-conversation gate
  is bypassed, the extension double-checks on receipt.
- **Rollout shape: big-bang, ~4-5 commits, single-PR revert.** Same
  shape as Phase 4 (`.planning/phase-4-plan.md:270-273`). Phase 5's
  blast radius is narrower than Phase 4's — no allowlists, no
  durable system-prompt strings, no executor special-cases.
- **Kill-switch.** `EZCORP_DISABLE_CAPABILITY_TOOLS=1` already
  covers `ask_human` via the extension's `eventSubscriptions`
  capability gate — the subscription fails, the gate never resolves,
  and the tool returns a 5-minute-timeout error to the LLM. A
  graceful-degradation path (fall back to the host built-in when
  the flag is on) is explicitly **not** added — that's more
  complexity than the emergency switch deserves. Same posture as
  Phase 3/4.
- **Persistent state.** None. The `ask_human` tool has no storage
  footprint today (no rows in `extension_storage`); the ported
  handler is also pure in-memory. The extension's storage
  declaration stays at `storage: false` (i.e. omitted from the
  manifest permission block).
- **Ship in 5 commits max.** Scope per commit in §Ship order.

---

## Feature-parity matrix

Every semantic of today's built-in maps to the extension handler. No
behavior is dropped. Column 3 flags the resolution path in §Implementation
plan below.

| Built-in behavior | Extension handler | Resolution |
|---|---|---|
| `{ question: string }` JSON schema (required) | `askHuman` handler | Manifest schema ports verbatim. No per-turn override needed (unlike `invoke_agent`'s `enum`) — the schema is static. |
| Mint `requestId = crypto.randomUUID()` (`ask-human.ts:56`) | `askHuman` handler | Same call inside the subprocess. UUID space is global; no collision risk with host-minted IDs (none remain after delete). |
| Emit `orchestrator:human_input` with `{ runId, conversationId, question, requestId }` (`ask-human.ts:59-64`) | `askHuman` handler via `ctx.emit` or SDK `emit` | §4 — the extension emits through the existing `ezcorp/emit-task-event` RPC surface (Phase 2b) generalized to allow `orchestrator:*` events, OR adds a minimal allow for `orchestrator:human_input` specifically. Confirm surface during commit 2. |
| Emit carries **parent** `runId`, `conversationId` (`ask-human.ts:60-62`) | `askHuman` handler | Both are passed into the handler via the host's `invocationMetadata` seam (Phase 4's §5.1a plumbing — `.planning/phase-4-plan.md:692-742`). The handler reads `ctx.invocationMetadata.runId` + `ctx.invocationMetadata.conversationId` and stamps onto the emit. No new plumbing. |
| Promise gate keyed on `requestId` (`ask-human.ts:86-88`) | `askHuman` handler | In-subprocess `Map<requestId, PendingHumanInput>`. Same shape. Subprocess is `persistent: true` so the map survives across tool calls. |
| 5-minute timeout (`HUMAN_INPUT_TIMEOUT_MS = 5 * 60_000`, `ask-human.ts:23`) | `askHuman` handler | `setTimeout` in the extension. On expiry, the gate rejects with the same `"Timed out waiting for human input"` message. |
| `AbortSignal` listener → reject (`ask-human.ts:67-74`) | `askHuman` handler | Same: attach `signal?.addEventListener("abort", ..., { once: true })` inside the handler. The SDK's `ToolHandlerContext` already surfaces the abort signal (see scratchpad/task-tracking handlers). |
| Success: `{ content: [{ type: "text", text: response }], details: {} }` (`ask-human.ts:90-93`) | `askHuman` handler | Returned via `toolResult({...})`. |
| Failure (abort/timeout/dismiss): `{ content: [{ type: "text", text: "Error: <msg>" }], details: { isError: true } }` (`ask-human.ts:94-99`) | `askHuman` handler | Same shape via `toolResult({ ..., details: { isError: true } })`. |
| `finally` cleanup: clearTimeout + removeEventListener (`ask-human.ts:100-103`) | `askHuman` handler | Same block in the handler. |
| `resolveHumanInput(requestId, response)` — external resolver (`ask-human.ts:111-116`) | POST endpoint + event emit + subscription handler | §5.4 — POST endpoint emits `orchestrator:human_response` with `{ requestId, response, conversationId }`; extension's subscription handler resolves the matching gate on receipt. |
| `rejectHumanInput(requestId)` — external rejection (`ask-human.ts:119-124`) | POST endpoint (new optional path) OR deferred | §Open design notes — there is no caller of `rejectHumanInput` in-tree today (grep confirms). Options: (a) delete the export as dead code; (b) preserve the surface by adding an optional `dismissed: true` field to the POST body that the extension translates to the rejected-gate message. Frozen: **delete as dead code** (§5.4). |
| `hasPendingHumanInput(requestId)` — introspection | Extension-internal or deferred | No external caller today. Frozen: delete as dead code. |
| Per-conversation scoping check (NEW) | `askHuman` subscription handler | §5.3 — extension's pending entry carries `conversationId`; subscription handler compares incoming `event.conversationId` to `entry.conversationId` and drops mismatched events. This is a net-new invariant — see §Context two hidden invariants (2). |

---

## Implementation plan

### 1. Extension manifest update

File: `docs/extensions/examples/orchestration/ezcorp.config.ts`
(EXISTING — shipped in Phase 4 at lines 26-48 of the current tree).

Two edits:

**(a)** Add an `ASK_HUMAN_SCHEMA` constant above the existing
`INVOKE_AGENT_SCHEMA` (or inline in the `tools:` array — match the
existing style; Phase 4 hoisted `INVOKE_AGENT_SCHEMA` to its own
`const`, do the same for consistency):

```ts
const ASK_HUMAN_SCHEMA = {
  type: "object",
  properties: {
    question: {
      type: "string",
      description: "The question to present to the user.",
    },
  },
  required: ["question"],
} as const;
```

**(b)** Extend the `tools:` array to include the `ask_human` entry:

```ts
tools: [
  {
    name: "invoke_agent",
    description: "Invoke a specialized agent to handle a task. ...",
    inputSchema: INVOKE_AGENT_SCHEMA as Record<string, unknown>,
  },
  {
    name: "ask_human",
    description:
      "Pause execution and ask the user a question. The agent will " +
      "wait for the user's response before continuing. Use this when " +
      "you need clarification, a decision, or information that only " +
      "the user can provide.",
    inputSchema: ASK_HUMAN_SCHEMA as Record<string, unknown>,
  },
],
```

**(c)** Extend the `permissions.eventSubscriptions` array to include
`"orchestrator:human_response"`:

```ts
permissions: {
  agentConfig: "read",
  spawnAgents: { maxPerHour: 500, maxConcurrent: 25 },
  eventSubscriptions: ["task:assignment_update", "orchestrator:human_response"],
},
```

**(d)** Version bump: `version: "1.0.0"` → `version: "1.1.0"` (minor
bump, additive manifest change). `bundled.ts` entry at
`src/extensions/bundled.ts` (Phase 4 block) picks up the new
subscription on next `ensureBundledExtensions()` run — which runs on
boot. No schema migration; the row's `permissions` JSON column is
rewritten.

### 2. Handler implementation

File: `docs/extensions/examples/orchestration/index.ts` (EXISTING — from
Phase 4). Additions alongside the existing `invokeAgent` handler.

Top-of-file additions (near Phase 4's `pendingInvocations` map, which
they mirror):

```ts
// ── ask_human: in-process gate state ─────────────────────────────────
// Mirrors `pendingInvocations` above. Keyed on the requestId that the
// handler mints for each call. The subscription handler for
// `orchestrator:human_response` resolves entries on matching id.
// Subprocess is `persistent: true`, so the map survives across tool
// calls. Each entry carries the `conversationId` so the subscription
// handler can verify the event is for the same conversation — see
// §5.3 (security).
interface PendingHumanInput {
  resolve: (response: string) => void;
  reject: (err: Error) => void;
  timeoutHandle: ReturnType<typeof setTimeout>;
  conversationId: string;
}
const pendingHumanInputs = new Map<string, PendingHumanInput>();

const HUMAN_INPUT_TIMEOUT_MS = 5 * 60_000; // 5 minutes — parity with
                                           // src/runtime/tools/ask-human.ts:23
```

Handler body — reads `runId` + `conversationId` from `ctx.invocationMetadata`
(Phase 4's §5.1a seam; already wired by `wireOrchestrationToolsForTurn`):

```ts
const askHuman: ToolHandler = async (args, ctx) => {
  const { question } = args as { question: string };
  const runId = ctx.invocationMetadata?.runId as string | undefined;
  const conversationId = ctx.invocationMetadata?.conversationId as string | undefined;
  if (!runId || !conversationId) {
    return toolResult({
      content: [{ type: "text", text: "Error: missing run context." }],
      details: { isError: true },
    });
  }

  const requestId = crypto.randomUUID();

  // Fire-and-forget: emit the orchestrator:human_input event onto the
  // host bus so the UI renders the pending-question card. Uses the
  // existing Phase 2b emit RPC (see §5.4 for the allow-listing
  // discussion).
  await ctx.emit("orchestrator:human_input", {
    runId,
    conversationId,
    question,
    requestId,
  });

  // Set up the gate, timeout, and abort handling. Matches the legacy
  // handler at src/runtime/tools/ask-human.ts:66-103 step-for-step.
  const onAbort = () => {
    const pending = pendingHumanInputs.get(requestId);
    if (pending) {
      clearTimeout(pending.timeoutHandle);
      pendingHumanInputs.delete(requestId);
      pending.reject(new Error("Aborted while waiting for human input"));
    }
  };
  ctx.signal?.addEventListener("abort", onAbort, { once: true });

  try {
    const response = await new Promise<string>((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        const pending = pendingHumanInputs.get(requestId);
        if (pending) {
          pendingHumanInputs.delete(requestId);
          pending.reject(new Error("Timed out waiting for human input"));
        }
      }, HUMAN_INPUT_TIMEOUT_MS);
      pendingHumanInputs.set(requestId, {
        resolve,
        reject,
        timeoutHandle,
        conversationId,
      });
    });

    return toolResult({
      content: [{ type: "text", text: response }],
      details: {},
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return toolResult({
      content: [{ type: "text", text: `Error: ${message}` }],
      details: { isError: true },
    });
  } finally {
    ctx.signal?.removeEventListener("abort", onAbort);
  }
};
```

Tool-dispatcher wiring (end of file, alongside the existing
`invokeAgent` registration):

```ts
export default createToolDispatcher({
  invoke_agent: invokeAgent,
  ask_human: askHuman,
});
```

### 3. Event-subscription expansion

File: `docs/extensions/examples/orchestration/index.ts`.

Add one new `registerEventHandler` call alongside the existing
`task:assignment_update` subscription (Phase 4 block):

```ts
registerEventHandler("orchestrator:human_response", async (payload) => {
  const { requestId, response, conversationId } = payload as {
    requestId: string;
    response: string;
    conversationId: string;
  };
  const pending = pendingHumanInputs.get(requestId);
  if (!pending) return; // Not ours, or already resolved/timed out.

  // §5.3 security: confirm the event is for the conversation that
  // opened the gate. Drops UUID-guess attempts from other wired
  // extensions in disjoint conversations (belt-and-suspenders —
  // Phase 2c's dispatcher already filters by conversationId, but
  // we double-check here).
  if (pending.conversationId !== conversationId) return;

  clearTimeout(pending.timeoutHandle);
  pendingHumanInputs.delete(requestId);
  pending.resolve(response);
});
```

#### 3.1 Why this uses the new `orchestrator:human_response` event

Only option on the table for Option (a). The event was defined in
`src/types.ts:286-289` since the legacy built-in shipped; Phase 5
retrofits it with `conversationId` and adds it to
`DIRECT_CARRIER_EVENT_TYPES` so Phase 2c will deliver it.

#### 3.2 Cross-extension self-delivery risk

Phase 2c delivers events to every extension wired to the conversation
AND subscribed to the event type. Today only the `orchestration`
extension subscribes; future extensions might also subscribe. The
handler guards with `if (!pending) return` and the `conversationId`
check, identical to Phase 4's `task:assignment_update` handler
(`.planning/phase-4-plan.md:601-609`). No memory-leak risk — an
unrelated extension's `requestId` is never in this extension's map.

#### 3.3 Why NOT subscribe to a bare `human:response` channel

Same reason as Phase 3/4's rejection of alternate event names:
`orchestrator:human_response` is already defined in `src/types.ts`,
already in the WS re-broadcast allowlist at
`web/src/routes/api/runtime-events/+server.ts:39`, and already has a
client-side handler at `web/src/lib/stores.svelte.ts:927-931`.
Renaming the event would cascade into those three files plus the
`ws.ts` union type at `web/src/lib/ws.ts:13`. Reuse the existing
name.

### 4. Host-side payload-shape migration

Three small edits in lockstep (all in commit 1 — §Ship order):

#### 4.1 `src/types.ts:286-289`

```ts
"orchestrator:human_response": {
  requestId: string;
  response: string;
  conversationId: string;  // ← NEW (Phase 5)
};
```

Additive at the type level. All existing emitters (there is only
one — the POST endpoint) must be updated in the same commit. The
client-side handler at `stores.svelte.ts:927-931` already destructures
only `requestId`; the new field is ignored (forward-compatible).

#### 4.2 `src/runtime/sse-conversation-filter.ts:46-60`

Add one entry to `DIRECT_CARRIER_EVENT_TYPES`:

```ts
export const DIRECT_CARRIER_EVENT_TYPES: ReadonlySet<keyof AgentEvents> = new Set([
  "run:complete",
  "run:error",
  "run:cancel",
  "run:turn_saved",
  "tool:start",
  "tool:complete",
  "tool:error",
  "tool:permission_request",
  "tool:permission_mode_change",
  "obs:turn",
  "orchestrator:human_input",
  "orchestrator:human_response",  // ← NEW (Phase 5)
  "task:snapshot",
  "task:assignment_update",
]);
```

Effect: the SSE conversation filter at `filter.ts:128-146` will now
gate `orchestrator:human_response` by `conversationId`. Events with
a `conversationId` mismatch for the subscriber are dropped — closes
the UUID-guess cross-user leak noted in P1's security finding. Events
with no `conversationId` in the payload pass-through (fail-open at
`filter.ts:141-142`) — but after §4.1 every emitter includes it, so
this fail-open branch is never taken in practice.

#### 4.3 POST emitter `web/src/routes/api/orchestrator/human-input/+server.ts`

File grows from 14 LOC to ~25 LOC:

```ts
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireScope } from "$lib/server/security/api-keys";
import { bus } from "$server/runtime/bus";  // or wherever the singleton lives

export const POST: RequestHandler = async ({ request, locals }) => {
  const scopeErr = requireScope(locals, "chat");
  if (scopeErr) return scopeErr;

  const { requestId, response } = await request.json();

  // Reverse-map requestId → conversationId from the extension's
  // pending-map accessor (see §5.4). The extension exposes this via
  // a small host-callable: the host reads the map entry's
  // conversationId and emits the event. If no entry exists (race:
  // timeout already fired), the emit is a no-op (the dispatcher
  // drops events with unknown requestId at the extension's handler).
  const conversationId = await lookupPendingHumanConversationId(requestId);
  if (!conversationId) {
    // Gate is gone (timeout/abort already fired). Still return ok
    // to the client — the UI already collapsed its card on the
    // optimistic `humanInputResponded` Set at +page.svelte:386.
    return json({ ok: true });
  }

  bus.emit("orchestrator:human_response", {
    requestId,
    response,
    conversationId,
  });

  return json({ ok: true });
};
```

The `lookupPendingHumanConversationId` helper is **host-side** — it
reads from a module-scoped `Map<requestId, conversationId>` that the
orchestration extension exports via a small host→extension RPC
(or via a tiny in-host shadow map kept in sync through the same emit
path — simpler; see §5.4 for the frozen shape).

**Note on alternative:** the POST body could instead carry
`conversationId` directly from the frontend (the frontend already
knows it — `convId` from the URL param). Frozen choice is
reverse-map to avoid any frontend change. See §Open design notes
for the trade-off — the frontend-carries-it variant is a one-line
swap if the reverse-map shape turns out awkward in review.

### 5. Endpoint update (detail)

See §4.3 above. One file changed. 14 → ~25 LOC. No new route.

### 6. Host-side deletions (big-bang cutover — commit 4)

Three deletions:

1. **`src/runtime/tools/ask-human.ts`** — delete entire file (129 LOC).
2. **`src/runtime/tools/builtin-registry.ts:29`** — remove the
   `ask_human` entry. The `buildToolList()` function returns `[]`.
   See §Open design notes for whether to keep the empty registry or
   delete the module.
3. **Executor wiring site.** Grep `createAskHumanTool` in `src/runtime/`
   returns exactly one caller in the current tree (the agent-tools
   injection path, adjacent to where Phase 4 inserted
   `wireOrchestrationToolsForTurn`). Delete that block. The extension
   handler is already wired via `wireOrchestrationToolsForTurn` (same
   orchestration extension — Phase 4's helper already runs on every
   turn the extension is mentioned; Phase 5 makes `ask_human` join
   `invoke_agent` in the tools pushed into the turn, no new seam).

Plus:

4. Client/UI surfaces — **no change.** `+page.svelte`'s pending-
   question card, `stores.svelte.ts`'s dead handler (now alive), and
   `ws.ts`'s union type all keep working. The frontend submits
   `{ requestId, response }` to the POST endpoint unchanged.

### 7. Test migration / new test files

Three layers (same shape as Phase 4 §7):

#### 7.1 Unit — `orchestration-ask-human.test.ts` (NEW)

Replaces `src/__tests__/ask-human.test.ts` (delete original; 147 LOC,
8 tests). Imports the extension handler directly, injects fakes for
`ctx.emit` and `ctx.signal`.

Ports the existing 8 tests 1:1:

1. Happy path: emit → resolve via subscription handler → success
   tool-result.
2. Abort during wait: `ctx.signal.abort()` → `isError: true` with
   `"Aborted while waiting for human input"`.
3. Timeout at 5 minutes: fake timers, advance 5m + 1ms, assert
   timeout tool-result + entry removed from pending map.
4. Unknown `requestId` in subscription handler: no-op, handler
   returns without error.
5. `conversationId` mismatch in subscription handler: handler
   drops the event (security case, NEW beyond the 8 legacy tests).
6. Cleanup on success: clearTimeout fired, abort listener removed.
7. Cleanup on abort: clearTimeout fired, abort listener removed
   exactly once.
8. Cleanup on timeout: abort listener removed.
9. Concurrent `ask_human` calls: two invocations in parallel resolve
   independently (the map supports multiple entries; §Open design
   notes defers a queue-limit).
10. Missing `runId`/`conversationId` in `invocationMetadata`:
    handler returns error without emitting.

Every branch of the handler is exercised. Target is 100% coverage.

#### 7.2 Subprocess integration — `orchestration-ask-human.integration.test.ts` (NEW)

Template: `task-tracking-extension.integration.test.ts`.

- Spawn the extension subprocess.
- Wire it to a test conversation.
- Invoke `ask_human` via `ExtensionRegistry`.
- Emit a synthetic `orchestrator:human_response` with a matching
  `requestId` + `conversationId` on the host bus.
- Assert the dispatcher delivers the event, the subscription handler
  resolves the gate, and the tool-result text equals the synthetic
  response.
- Negative case: emit with a mismatched `conversationId` → assert the
  handler drops and the gate stays open.
- Negative case: emit with an unknown `requestId` → assert no-op.

#### 7.3 End-to-end — `orchestration-ask-human-e2e.test.ts` (NEW)

Template: `orchestration-e2e.test.ts` (from Phase 4).

- Full executor → orchestration-host.wireOrchestrationToolsForTurn →
  extension handler → emit `orchestrator:human_input` → simulate
  POST `/api/orchestrator/human-input` → assert
  `orchestrator:human_response` emitted → assert gate resolves →
  assert LLM-visible tool result.
- Ports the end-to-end path that today exists only as manual QA
  (there's no existing E2E for `ask_human` — §Verification bullet
  5 is new coverage).

#### 7.4 Host-side test updates

- `src/__tests__/builtin-registry.test.ts` — expected tool count
  `1 → 0`. Add a regression assertion that `ask_human` is not in the
  registry. Update header comments to "Phase 5 complete" or similar.
- `src/__tests__/sse-conversation-filter.test.ts` — add a case for
  `orchestrator:human_response` being in `DIRECT_CARRIER_EVENT_TYPES`
  and filtering by `conversationId`.
- `web/src/routes/api/orchestrator/human-input/+server.test.ts`
  (EXISTS or NEW — if missing, create) — assert the POST emits
  `orchestrator:human_response` with the correct `conversationId`
  when the pending-map accessor returns one; asserts no emit when
  the accessor returns null.
- `src/__tests__/helpers/mock-cleanup.ts` — remove
  `"../runtime/tools/ask-human"` entry from `MOCKED_MODULES`.
- **`src/__tests__/ask-human.test.ts` — DELETE.**

#### 7.5 Manual

Boot fresh against a running agent:

1. Start an agent whose system prompt instructs it to call
   `ask_human` on clarification.
2. Send a user message that the agent needs clarification on.
3. Confirm the UI renders the amber pending-question card.
4. Type a response and click submit.
5. Confirm the card collapses and the agent continues with the
   response text.
6. Confirm the event appears in devtools → network with the new
   `conversationId` field in the payload (SSE event inspector).

---

## Files touched

### New

| File | Purpose |
|---|---|
| `src/__tests__/orchestration-ask-human.test.ts` | Unit tests (replaces `ask-human.test.ts`). ~10-12 cases. |
| `src/__tests__/orchestration-ask-human.integration.test.ts` | Subprocess integration tests. ~4 cases. |
| `src/__tests__/orchestration-ask-human-e2e.test.ts` | End-to-end executor + extension + POST round-trip. ~6 cases. |
| `web/src/routes/api/orchestrator/human-input/+server.test.ts` (if absent) | Endpoint emits `orchestrator:human_response` on known `requestId`; no-op on unknown. |

### Changed

| File | Change |
|---|---|
| `src/types.ts` | `orchestrator:human_response` payload gains `conversationId: string` (§4.1). |
| `src/runtime/sse-conversation-filter.ts` | Add `"orchestrator:human_response"` to `DIRECT_CARRIER_EVENT_TYPES` (§4.2). |
| `web/src/routes/api/orchestrator/human-input/+server.ts` | Look up `conversationId` via host-side accessor; emit `orchestrator:human_response`; delete `resolveHumanInput()` import (§4.3 + §5/§6). |
| `docs/extensions/examples/orchestration/ezcorp.config.ts` | Add `ASK_HUMAN_SCHEMA`; add `ask_human` tool entry; add `"orchestrator:human_response"` to `eventSubscriptions`; bump `version` to `1.1.0` (§1). |
| `docs/extensions/examples/orchestration/index.ts` | Add `askHuman` handler, `pendingHumanInputs` map, and `registerEventHandler("orchestrator:human_response", ...)` (§2 + §3). Register handler in `createToolDispatcher`. |
| `src/extensions/bundled.ts` | Update the `orchestration` entry's `eventSubscriptions` permission block to include `"orchestrator:human_response"` (mirrors the manifest change; required because `bundled.ts`'s `permissions` object is the install-time source of truth for the extension row, not the manifest read at runtime). |
| `src/runtime/orchestration-host.ts` | `wireOrchestrationToolsForTurn` now injects both `invoke_agent` and `ask_human` into `agentTools`. Both route through `extensionToAgentTool` with `invocationMetadata` seeded with `{ runId, conversationId, ...existing }`. The `ask_human` tool needs no `schemaOverride` (static schema). |
| `src/runtime/executor.ts` | DELETE the `createAskHumanTool(...)` injection block (the site adjacent to Phase 4's `wireOrchestrationToolsForTurn` call). The helper now handles both tools. |
| `src/runtime/tools/builtin-registry.ts` | Drop `ask_human` entry; `buildToolList()` returns `[]`. Update comments to "Phase 5 complete — no built-in tools remain." |
| `src/__tests__/builtin-registry.test.ts` | Expected count `1 → 0`; add `ask_human`-not-present assertion. |
| `src/__tests__/sse-conversation-filter.test.ts` | Add assertion on `orchestrator:human_response` in the direct-carrier set; filtering behavior. |
| `src/__tests__/helpers/mock-cleanup.ts` | Remove `"../runtime/tools/ask-human"` entry from `MOCKED_MODULES`. |

### Deleted

| File | Why |
|---|---|
| `src/runtime/tools/ask-human.ts` | Replaced by the extension handler. |
| `src/__tests__/ask-human.test.ts` | Rewritten as `orchestration-ask-human.test.ts`. |

### Reference (read-only)

| File | Why |
|---|---|
| `docs/extensions/examples/orchestration/{ezcorp.config.ts,index.ts}` | Phase 4 shipped state — starting point for §1-§3. |
| `.planning/phase-4-plan.md` | Canonical template for plan shape, ship order, §5.1a `invocationMetadata` seam. |
| `.planning/phase-3-plan.md` | Two-hop bridge template (`.planning/phase-3-plan.md:§4.2`). |
| `src/types.ts:280-289` | Event payload shapes for both `orchestrator:*` events. |
| `src/extensions/event-subscription-dispatcher.ts:157-179` | Dispatcher contract; `conversationId`-gating at lines 161-162. |
| `web/src/lib/stores.svelte.ts:927-931` | Client-side handler (intentionally unchanged — the dead handler becomes live). |
| `web/src/routes/(app)/project/[id]/chat/[convId]/+page.svelte:2129-2157` | UI card rendering (intentionally unchanged). |
| `src/runtime/tools/ask-human.ts:1-129` | Legacy implementation — the ported semantics' source of truth. |

---

## Test inventory

| File | Tests | Phase 5 action |
|---|---|---|
| `src/__tests__/ask-human.test.ts` | 8 | Delete (rewritten as `orchestration-ask-human.test.ts`). |
| NEW `src/__tests__/orchestration-ask-human.test.ts` | ~10-12 | Phase 5 addition — supersedes `ask-human.test.ts`; adds security case + concurrent case + missing-metadata case. |
| NEW `src/__tests__/orchestration-ask-human.integration.test.ts` | ~4 | Phase 5 addition — subprocess round-trip. |
| NEW `src/__tests__/orchestration-ask-human-e2e.test.ts` | ~6 | Phase 5 addition — executor + extension + POST round-trip. |
| NEW `web/src/routes/api/orchestrator/human-input/+server.test.ts` (if absent) | ~3 | Phase 5 addition — endpoint emit behavior. |
| `src/__tests__/builtin-registry.test.ts` | 5 | Update count + assertion. |
| `src/__tests__/sse-conversation-filter.test.ts` | N | Extend with 1-2 cases for the new direct-carrier entry. |
| `src/__tests__/orchestration-extension.test.ts` | ~12 (Phase 4) | No change — handler tests unaffected. |
| `src/__tests__/orchestration-bundled-install.test.ts` | ~4 (Phase 4) | Update expected `eventSubscriptions` list to include the new entry; update version. |
| `src/__tests__/orchestration-extension.integration.test.ts` | ~4 (Phase 4) | No change. |
| `src/__tests__/orchestration-e2e.test.ts` | ~10 (Phase 4) | No change. |

---

## Verification (exit criteria)

Every bullet must be green before merge. **Target: 100% branch
coverage on all new code.**

1. `bun test src/__tests__/orchestration-ask-human.test.ts` — unit
   tests green. Every branch of the handler exercised: happy path,
   abort, timeout, dismiss, unknown-request in subscription,
   `conversationId` mismatch in subscription, missing `runId`/
   `conversationId` in `invocationMetadata`, concurrent calls,
   cleanup paths (success / abort / timeout).
2. `bun test src/__tests__/orchestration-ask-human.integration.test.ts`
   — real subprocess; synthetic `orchestrator:human_response` emit
   resolves the gate within 500ms; mismatched `conversationId` is
   dropped; unknown `requestId` is a no-op.
3. `bun test src/__tests__/orchestration-ask-human-e2e.test.ts` —
   full executor → extension → emit → POST → resolution round-trip.
4. `bun test web/src/routes/api/orchestrator/human-input/+server.test.ts`
   — POST emits `orchestrator:human_response` with correct
   `conversationId` on known `requestId`; no-op emit on unknown id;
   returns `{ ok: true }` in both cases.
5. `bun test src/__tests__/builtin-registry.test.ts` — updated count
   `0`; `ask_human`-not-present assertion green.
6. `bun test src/__tests__/sse-conversation-filter.test.ts` —
   `orchestrator:human_response` treated as a direct carrier;
   filtered by `conversationId` for authorized-user path; dropped
   for mismatched user path.
7. `bun test src/__tests__/orchestration-bundled-install.test.ts` —
   Phase 4 regression — `eventSubscriptions` now includes
   `"orchestrator:human_response"`; `version` is `"1.1.0"`.
8. Phase 1+2+3+4 regression: `bun test src/__tests__/{scratchpad-*,
   task-tracking-*, capability-permissions, sse-conversation-filter,
   event-subscription-*, emit-task-event*, agent-configs-handler,
   spawn-quota, spawn-assignment-handler, orchestration-extension*,
   orchestration-e2e, cancel-run-handler, tool-executor,
   executor-agent-wiring, team-tool-scope-integration,
   current-model-e2e, orchestrator-prompt*, apply-tool-filters}.test.ts`
   — still green.
9. Full suite: `bun test` (batched per Phase 3's per-file mock-cache
   rule — `.planning/phase-3-plan.md:§Ship log`) — passes. No
   orphaned references to `./tools/ask-human`.
10. Grep invariants:
    - `rg "runtime/tools/ask-human" src web` → **zero** hits.
    - `rg "createAskHumanTool" src web` → **zero** hits.
    - `rg "resolveHumanInput\|rejectHumanInput\|hasPendingHumanInput" src web`
      → **zero** hits outside the extension + POST endpoint.
    - `rg "ask_human" src web` → hits ONLY in: (a) extension
      manifest + handler, (b) new test files, (c) client-side copy
      at `+page.svelte` comments (if any — likely zero).
11. Manual: boot the server fresh. Confirm the `orchestration`
    extension row in the `extensions` table has
    `eventSubscriptions: ["task:assignment_update",
    "orchestrator:human_response"]` and `version: "1.1.0"`.
12. Manual: in a running conversation, have an agent call
    `ask_human`. Confirm the amber pending-question card appears.
    Type a response, submit. Confirm the agent receives the response
    in its tool-result and continues the turn.
13. Manual: devtools → Network → SSE events → confirm
    `orchestrator:human_response` event arrives with
    `conversationId` populated.
14. Manual: `EZCORP_DISABLE_CAPABILITY_TOOLS=1 bun run dev` →
    `ask_human` calls fail (the subscription handler never
    registers, the gate never resolves, the tool times out after
    5 minutes and returns the timeout error shape). Acceptable
    emergency-switch behavior.
15. Manual: open two browser tabs, two separate conversations,
    same user. Trigger `ask_human` in conversation A. Confirm the
    card appears ONLY in tab A (SSE filter by `conversationId`).
    Previously (pre-Phase 5) this card could flash in tab B for
    one render tick.

---

## Open design notes (resolve during execution)

Judgment calls where the right answer depends on what the code
reads like.

- **Frontend POST body: add `conversationId` or reverse-map on the
  host?** Frozen default is reverse-map (§4.3 + §5.4). The trade-off:
    - **Reverse-map (frozen):** no frontend change. Requires a small
      host-side shadow map (or an SDK RPC that the POST handler
      calls into the extension subprocess to read). Slight extra
      surface on the host.
    - **Frontend carries it:** one-line change at
      `+page.svelte:381-384` (add `conversationId: convId` to the
      POST body). No host shadow-map needed. Slight version-skew
      risk (old browser tab after deploy sends without the field —
      handle gracefully by reverse-mapping anyway, so this becomes
      additive).
  Prefer the frontend-carries-it variant **if the host shadow-map
  shape turns out awkward** (e.g. it tempts extension authors to
  reach into it from other handlers). One-line swap during commit 1;
  state the final pick in the ship log.
- **Dead-handler cleanup at `stores.svelte.ts:927-931`.** Frozen
  decision: leave as-is. After Phase 5 the handler fires deterministically
  for every resolved request (it previously never fired — §Context).
  The code is correct today and no modification is strictly needed.
  If a micro-task is opened anyway, it's a trivial rename comment
  update — not plan-blocking.
- **Umbrella gate timeout inside the subscription handler.** P2's
  research suggested a 6-minute umbrella gate (slightly longer than
  the 5-minute tool-side timeout) as defense-in-depth in case the
  subscription handler itself hangs. Frozen decision: **not added.**
  The tool-side `setTimeout` at `HUMAN_INPUT_TIMEOUT_MS` already
  bounds the wait; a second timer adds complexity without a credible
  failure mode (the handler is pure and sync). Revisit if the
  subscription dispatcher ever grows async middleware.
- **Concurrent-`ask_human` queue limit.** Phase 4's `invoke_agent`
  extension has no parallelism cap (parallel sub-agent invocations
  are a first-class feature). `ask_human` is different — spamming
  multiple pending questions to the user is unhelpful UX. Options:
    - (a) No cap — preserves today's behavior. The built-in at
      `ask-human.ts` had no cap.
    - (b) Cap at 1 per conversation — the handler rejects if
      `pendingHumanInputs` already has an entry for the current
      `conversationId`.
    - (c) Cap at N (e.g. 3) — balance between parallelism and UX.
  Frozen default: **(a) no cap** — parity with today's built-in.
  The UI already renders multiple cards stacked, so the surface
  handles it.
- **UUID-guess security fix migration risk.** Pre-Phase 5, any
  holder of a valid `requestId` UUID could call
  `resolveHumanInput(requestId, response)` via the POST endpoint
  (no per-conversation scoping). Post-Phase 5, the extension drops
  events whose `conversationId` doesn't match the opener's. Any
  client that relied on the old non-scoped behavior would break —
  but grep confirms there's only one caller of the POST endpoint in
  the tree (`+page.svelte:381`), which operates inside a single
  conversation context. External callers (3P integrations, API-key
  holders) are not plausible — the endpoint is scoped to
  `requireScope(locals, "chat")` and the UX is user-facing. **Low
  migration risk; no compatibility shim needed.**
- **Built-in registry: keep as empty shell or delete?** Options:
    - (a) Keep `src/runtime/tools/builtin-registry.ts` with an
      empty `buildToolList()` and deprecation comments. The
      mention-search API at
      `web/src/routes/api/mentions/search/+server.ts` and the
      `/api/tools` endpoint still reference `getBuiltInToolMetadata()`
      and get an empty list back — no code change elsewhere.
    - (b) Delete the file. Requires removing every caller
      (~3-5 sites per grep). Simpler tree; more PR surface.
  Frozen default: **(a) keep as empty shell** for this PR. File a
  follow-up to delete the module after one soak cycle. Same
  conservative posture Phase 1 / Phase 3 took with their residual
  category-metadata shells.
- **`rejectHumanInput` / `hasPendingHumanInput` exports.** Both are
  unused in-tree today (grep). Frozen decision: **delete as dead
  code** when `ask-human.ts` is deleted in commit 4. If a downstream
  integration depended on them, it would have shown up in a
  grep — none found.
- **Event-emit surface from inside the extension.** Today the
  `ezcorp/emit-task-event` RPC (Phase 2b) is the existing emit
  path for extensions. It's allow-listed to a specific event set
  (`task:*` events, per the handler in
  `src/extensions/emit-task-event-handler.ts`). The extension needs
  to emit `orchestrator:human_input` — confirm during commit 2
  whether the RPC's allowlist needs extending or whether a new thin
  RPC (`ezcorp/emit-orchestrator-event`) is cleaner. Lean toward
  extending the existing allowlist — it's one line.

---

## Out of scope (defer)

- Any non-`ask_human` `orchestrator:*` event promoted to a direct-
  carrier in `DIRECT_CARRIER_EVENT_TYPES`. The set grows by exactly
  one entry in Phase 5. Future events are their own phases' call.
- **Persistence of pending questions across server restart.** Today
  an in-flight `ask_human` whose gate is waiting at the moment the
  server restarts loses the pending state (the module-scoped `Map`
  evaporates). Post-Phase 5 same story — the map lives in the
  extension subprocess, which restarts alongside the host. Not a
  regression; not in scope to fix. UI would show a stale pending
  card until the tab is refreshed; the agent would have timed out
  anyway.
- **Queue semantics.** Current built-in supports parallel pending
  questions (multiple concurrent cards in the UI). Phase 5 preserves
  this — no per-conversation cap. A product decision to cap at 1 or
  N lives in a future UX phase, not here.
- **UI redesign.** The amber pending-question card at
  `+page.svelte:2129-2157` ships unchanged. Any revamp is out of
  scope.
- **Feature-flag gate** (`EZCORP_ASK_HUMAN_EXT=1`). Rejected — same
  reasoning as Phase 4 (`.planning/phase-4-plan.md:270-273`).
  Big-bang only. The emergency switch is
  `EZCORP_DISABLE_CAPABILITY_TOOLS=1`.
- **Forensic logging of UUID-guess attempts.** If the subscription
  handler drops an event on `conversationId` mismatch, we could
  audit-log it. Deferred — low signal-to-noise in practice (most
  drops will be benign cross-conversation broadcasts).
- **Refactor the POST endpoint into a reverse-RPC.** The endpoint
  is already a thin SvelteKit route; turning it into a
  capability-gated extension RPC is a re-architecture that buys
  nothing for this phase.
- **Any redesign of the client-side `pendingHumanInputs` store.**
  The existing shape works; the dead handler comes alive; nothing
  else moves.
- **A "legacy compatibility" code path** that re-routes `ask_human`
  to a deleted built-in factory. Big-bang only.
- **A breakout `orchestration-human` sub-extension.** The
  `orchestration` extension owns both tools. No further split.

---

## Rollback

Single commit revert of the merge commit. Phase 5 ships as ~4-5
commits but merges as one PR; the revert is atomic.

- **No schema migrations.** The `extensions` row for `orchestration`
  has its `permissions.eventSubscriptions` JSON extended — revert
  restores the narrower list on next `ensureBundledExtensions()` run.
  No `extension_storage` rows touched.
- **Payload-shape change is forward-compatible.** The revert leaves
  the emitter (if it was deployed briefly) sending a payload with
  a `conversationId` field that nothing reads. Harmless — the
  pre-Phase-5 dead handler at `stores.svelte.ts:927-931` destructures
  only `requestId`, ignoring extras.
- **The built-in `ask-human.ts` is restored by the revert.** Its
  state is in-memory (no persistent rows) so nothing to migrate.
  Sub-conversations or messages created during the bad window are
  unaffected — `ask_human` writes no rows.
- **Audit rows** from the bundled-install re-run (updated
  permission block) are orphaned on revert but harmless.
- **`conversation_extensions` rows** for the `orchestration`
  extension are unchanged (Phase 4 already created them); only the
  permission row is modified.
- **`EZCORP_DISABLE_CAPABILITY_TOOLS=1`** is the soft-kill. With the
  flag set, `ask_human` times out after 5 minutes and returns the
  timeout error shape. Not graceful but acceptable for emergency —
  the LLM sees a failed tool call, which is better than wedging the
  turn.

Rollback checklist:
1. Flip `EZCORP_DISABLE_CAPABILITY_TOOLS=1` in prod. Users see
   `ask_human` timeouts until step 2 is live.
2. Revert the merge commit. CI green. Deploy.
3. Clear `EZCORP_DISABLE_CAPABILITY_TOOLS=1`.
4. Verify: a fresh boot restores the built-in registry's
   `ask_human` entry at `builtin-registry.ts:29`; the host's
   `createAskHumanTool` is injected in the turn; the POST endpoint
   imports `resolveHumanInput` from `$server/runtime/tools/ask-human`.

No data loss is possible — `ask_human` has no persistent state to
restore.

---

## Ship order within Phase 5

Five commits, each independently revertable. Each commit leaves the
tree buildable + scoped tests green (the full suite stays green only
after commit 4's big-bang cutover).

- **Commit 1 — Types + allowlist + endpoint emitter (host-side
  payload-shape migration).**
    - `src/types.ts:286-289` — add `conversationId` to
      `orchestrator:human_response` payload.
    - `src/runtime/sse-conversation-filter.ts:46-60` — add
      `"orchestrator:human_response"` to `DIRECT_CARRIER_EVENT_TYPES`.
    - `web/src/routes/api/orchestrator/human-input/+server.ts` —
      look up `conversationId` via the existing module-scoped
      `pendingRequests` map (still exported from the legacy
      `ask-human.ts` — read-only access); emit
      `orchestrator:human_response` after resolving the gate. Keep
      the existing `resolveHumanInput` call unchanged (the gate is
      still the built-in's in this commit).
    - `src/__tests__/sse-conversation-filter.test.ts` — add
      coverage for the new direct-carrier entry.
    - **Built-in `ask_human` still live.** Extension not yet
      updated.
    - Verification: `bun test` for the three files above green.
      Phase 4 regression green.

- **Commit 2 — Extension manifest + handler + subscription.**
    - `docs/extensions/examples/orchestration/ezcorp.config.ts` —
      §1 edits (schema, tool entry, subscription, version bump).
    - `docs/extensions/examples/orchestration/index.ts` — §2 + §3
      additions (handler, pending map, subscription handler,
      dispatcher registration).
    - `src/extensions/bundled.ts` — mirror the new
      `eventSubscriptions` permission in the install-time block.
    - Confirm/extend `ezcorp/emit-task-event` allowlist or add a
      thin emit RPC for `orchestrator:human_input` (see §Open
      design notes).
    - `src/__tests__/orchestration-ask-human.test.ts` — unit
      tests in isolation (handler + subscription tested against
      fakes, no host wiring).
    - **Built-in `ask_human` still live. Extension has the tool
      but is not yet injected into turns.**
    - Verification: new test file green; Phase 4 regression green;
      `orchestration-bundled-install.test.ts` updated expectations
      green.

- **Commit 3 — Subprocess integration test (real wiring, dormant
  extension).**
    - `src/__tests__/orchestration-ask-human.integration.test.ts`
      — real subprocess, synthetic `orchestrator:human_response`
      emit, assert round-trip.
    - No production code change — this commit only grows test
      coverage. Catches any gap between unit-test fakes and the
      real RPC layer before commit 4's cutover.
    - Verification: new integration test green; Phase 4
      integration suite green.

- **Commit 4 — Big-bang cutover.**
    - **DELETE** `src/runtime/tools/ask-human.ts`.
    - **DELETE** `src/__tests__/ask-human.test.ts`.
    - `src/runtime/tools/builtin-registry.ts` — drop the
      `ask_human` entry; `buildToolList()` returns `[]`. Optionally
      delete the module if §Open design notes' option (b) is taken —
      frozen default is (a) keep empty.
    - `src/runtime/executor.ts` — delete the `createAskHumanTool(...)`
      injection block.
    - `src/runtime/orchestration-host.ts` — extend
      `wireOrchestrationToolsForTurn` to push `ask_human` into
      `agentTools` alongside `invoke_agent` (same
      `extensionToAgentTool` call, seeded with `invocationMetadata`).
    - `web/src/routes/api/orchestrator/human-input/+server.ts` —
      drop the `resolveHumanInput` import; the POST now emits
      only, never calls into the built-in. Reverse-map accessor
      (§4.3 + §5.4) wires to the extension's pending-map via the
      chosen shape (host shadow-map or subprocess RPC).
    - `src/__tests__/builtin-registry.test.ts` — updated
      expectations.
    - `src/__tests__/helpers/mock-cleanup.ts` — drop
      `"../runtime/tools/ask-human"`.
    - `src/__tests__/orchestration-ask-human-e2e.test.ts` — new
      E2E file exercising the full path.
    - Verification: **full `bun test` suite green** (batched per
      Phase 3's mock-cache rule). Grep invariants (§Verification
      bullet 10) pass.

- **Commit 5 — Phase 5 soak housekeeping (optional).**
    - Ship log seed (plan-vs-reality delta, commit receipts —
      template at `.planning/phase-3-plan.md:§Ship log`,
      `.planning/phase-4-plan.md:§Ship log`).
    - Optional: tune `spawnAgents` rate-limit if Phase 4 soak
      telemetry showed `SPAWN_QUOTA_EXCEEDED` rows. Out-of-band
      from Phase 5 proper — include only if the data warrants.
    - Optional: delete `src/runtime/tools/builtin-registry.ts` if
      §Open design notes' option (b) gets picked up.
    - Optional: delete the dead-handler comment shuffle at
      `stores.svelte.ts:927-931` (no behavior change; comment
      refresh only).

Soak 2 weeks on main before declaring the 5-phase migration complete.
Phase 5 is lower-churn than Phase 4 but exercises the user-interaction
hot path (every human-in-the-loop turn), so a full soak window is
warranted. Target: no `ask_human`-shaped regressions, no
`orchestrator:human_response` misroute, no UUID-guess alarms.

**After Phase 5 ships and soaks:** `src/runtime/tools/` has zero
residents; the 5-phase migration is complete; the roadmap's durable
commitments are fulfilled.

---

## Ship log (post-hoc, 2026-04-21)

Phase 5 landed in **6 commits** covering plan §Ship order's 5 units
plus a tiny post-commit-4 cleanup (unused-import removal) and this
Ship log commit. The §Ship order framed the shape correctly and
actual commit granularity stayed tight — no mid-flight coverage
fills or TS-error fixes were needed (the handler + subscription
unit suite and the e2e suite at commit 4 caught every seam).

### Phase 5 proper (6 commits)

| Commit  | Scope                                                                                                |
|---------|------------------------------------------------------------------------------------------------------|
| `ca81b83` | **commit-1** — Host payload migration: add `conversationId` to the `orchestrator:human_response` shape in `src/types.ts`; extend `DIRECT_CARRIER_EVENT_TYPES` in `src/runtime/sse-conversation-filter.ts` with the new entry; teach `web/src/routes/api/orchestrator/human-input/+server.ts` to emit the enriched payload while the legacy built-in gate still owns resolution. Built-in `ask_human` still live. |
| `5d4db0b` | **commit-2** — Orchestration extension gains `ask_human`: manifest entry + handler + `orchestrator:human_response` subscription + module-scoped pending map + `_set*ForTests` bindings; mirrors the new `eventSubscriptions` permission in `src/extensions/bundled.ts`; extends `src/extensions/task-events-handler.ts` with the `orchestrator:human_input` emit branch; adds `OrchestratorHumanResponseEvent` to the SDK `SubscribableEventMap`. Extension-only unit tests (12 cases, 10 branches + concurrency). Extension has the tool but it is not yet injected into turns. |
| `923929c` | **commit-3** — Subprocess integration test: real `child_process.fork` against the bundled extension; fake emit + synthetic `orchestrator:human_response`; round-trip latency logged at **10-11ms** for the full request→response loop. Pure test-coverage commit. |
| `c963c8a` | **commit-4** — Big-bang cutover. **Deletes** `src/runtime/tools/ask-human.ts` (146 LOC) and `src/__tests__/ask-human.test.ts`. Empties `src/runtime/tools/builtin-registry.ts`' `buildToolList()` to `[]` (frozen option (a) per §Open design notes — keep the empty shell). Removes the built-in `createAskHumanTool(...)` injection from `src/runtime/executor.ts`. Extends `src/runtime/orchestration-host.ts:wireOrchestrationToolsForTurn` to push `ask_human` alongside `invoke_agent`. Introduces `src/runtime/ask-human-registry.ts` as the host-side shadow map (`requestId → conversationId`) that the POST endpoint consumes. Teaches `task-events-handler.ts` to populate the registry on every `orchestrator:human_input` emit. Rewrites the POST endpoint to lookup-then-clear the registry and emit the response event (no more `resolveHumanInput` import). Adds `src/__tests__/orchestration-ask-human-e2e.test.ts` — the full path end-to-end (wire → emit → shadow-map → POST → response → subscription → tool result). |
| `eb3aad7` | **commit-4-cleanup** — Drop an unused `AgentExecutor` import in the e2e test. Cosmetic. |
| *(this commit)* | **commit-5** — Ship log: flip STATUS to SHIPPED, record commit receipts, plan-vs-reality delta, close the 5-phase migration. |

### Plan vs reality

- **Plan §Ship order called for 4-5 commits; shipped as 5 (plus this
  ship-log commit)** — the extra unit over the minimum was the tiny
  cleanup (`eb3aad7`) dropping an unused import. No coverage-fill
  commits, no TS-error fixes, no post-audit gap patches. Phase 5
  was materially tighter than Phase 4 because the seams (extension
  wire-on-first-use, emit-task-event reverse-RPC, event-subscription
  dispatcher) were all battle-tested from Phases 2c/3/4.
- **Deviations from the plan's signatures / shapes**:
  - **Bus singleton import path**: the plan speculated
    `$server/runtime/bus`. Reality — the host-side singleton lives
    behind `getBus()` from `$lib/server/context`. The POST endpoint
    and `human-input-route.test.ts` both target that surface.
  - **`emit-task-event-handler`** file name: the plan referred to a
    separately-named file. Reality — the handler body lives at
    `src/extensions/task-events-handler.ts` (unified name, single
    file). The Phase 5 `orchestrator:human_input` branch landed
    there at lines 277-305 alongside the existing `task:snapshot` /
    `task:assignment_update` branches.
  - **`ctx.emit` does not exist on `ToolHandlerContext`** — the
    plan's sketch assumed an emit capability hanging off the tool
    context. Reality — the SDK exposes no such surface. Shipped
    instead as an **injectable `emitHumanInput` binding** in
    `docs/extensions/examples/orchestration/index.ts`, defaulting
    to `getChannel().request("ezcorp/emit-task-event", ...)` and
    overridable via `_setEmitHumanInputForTests` for unit tests.
    This keeps the handler pure and mockable.
  - **`ctx.signal` not plumbed through the SDK's
    `createToolDispatcher`** — the extension handler accepts an
    optional `signal` via an `OrchestrationToolContext` interface
    that extends `ToolHandlerContext`. Unit tests wire an
    `AbortController` directly; integration-test abort scenarios
    are deferred (same gap Phase 4 accepted — not a Phase 5 regression).
  - **`wireOrchestrationToolsForTurn` is hard-selected by tool name,
    not a loop** — the helper has one `find((t) => t.originalName ===
    "invoke_agent")` and one parallel `find(... === "ask_human")`.
    The plan spoke of "pushing both"; reality is two explicit
    selectors sharing one `extensionToAgentTool` seam, each with
    its own `invocationMetadata` shape (invoke_agent carries
    depth/overrides/teamToolScope; ask_human carries only runId +
    conversationId).
  - **Host-side `ask-human-registry.ts` shipped** — the plan's
    §4.3 + §5.4 left the reverse-map accessor as an "open design"
    choice between "host shadow map" and "subprocess RPC". Option
    (shadow map) was picked during commit 4, self-cleaning via
    endpoint lookup-then-clear. 50 LOC, 4 exported functions
    (`registerPendingHumanInput` / `getPendingHumanConversationId` /
    `clearPendingHumanInput` / `_resetPendingHumanInputsForTests`).
  - **`src/runtime/tools/builtin-registry.ts` kept as an empty shell
    (frozen option (a))** — not deleted. `buildToolList()` returns
    `[]`, every downstream caller handles the empty case naturally.
    Deletion of the module itself is deferred to the post-soak
    follow-up.
  - **`rejectHumanInput` / `hasPendingHumanInput` removed as dead
    code** during commit 4 — no grep consumers survived the
    built-in delete. The only survivor of the old ask-human surface
    was `resolveHumanInput`, and that's now gone too (the POST
    endpoint no longer imports from a built-in).
  - **SDK `SubscribableEventMap` extended** — added
    `OrchestratorHumanResponseEvent` to `host-event-types.ts:137`
    so the extension's `registerEventHandler("orchestrator:human_response", ...)`
    call type-checks. Bumped the comment on the map from "13" to
    14 implicitly (the comment at line 123 still says 13 — minor
    doc lag, worth a touch-up in the soak-window housekeeping).
- **Additions beyond the plan**:
  - **Injectable binding plumbing**:
    `_setEmitHumanInputForTests`, `_setHumanInputTimeoutForTests`,
    `_resetBindingsForTests`, and the `_internals` test-escape hatch
    (exposes `pendingHumanInputs` + `handleHumanResponse`) — all
    added to make the unit suite deterministic without spawning a
    subprocess per case.
  - **Subprocess integration test's 10-11ms latency receipt** —
    logged as `[orchestration-ask-human-integration] event-delivery
    latency: 10ms` / `11ms` across runs. Proof the two-hop bridge
    adds sub-frame overhead on the user-interaction hot path.
  - **Concurrent-conversation isolation tests** — both the unit
    suite and the e2e test drive two simultaneous `ask_human` calls
    from different conversations and assert no cross-talk, directly
    exercising the `conversationId` mismatch drop in
    `handleHumanResponse` as a security sentinel.

### Final verification (matches §Verification)

- **Phase 5 test suite** (8 files, all green):
  - `orchestration-ask-human.test.ts` — **12 pass / 0 fail / 53 expect**
  - `orchestration-ask-human.integration.test.ts` — **3 pass / 0 fail / 19 expect** (latency: 10ms)
  - `orchestration-ask-human-e2e.test.ts` — **8 pass / 0 fail / 32 expect**
  - `human-input-route.test.ts` — **3 pass / 0 fail / 15 expect**
  - `sse-conversation-filter.test.ts` — **17 pass / 0 fail / 46 expect**
  - `builtin-registry.test.ts` — **6 pass / 0 fail / 18 expect**
  - `orchestration-bundled-install.test.ts` — **8 pass / 0 fail / 23 expect**
  - `emit-task-event-handler.test.ts` — **20 pass / 0 fail / 51 expect**
    (Phase 4 validation had flagged this file as flaky with 3
    pre-existing failures; it now runs clean — the flake healed
    on its own, no longer a concern.)
  - **Totals: 77 pass / 0 fail across 8 files, 257 expect calls.**
- **Phase 1-4 regression sweep** (10 files):
  - `scratchpad-bundled-install.test.ts` — **16 pass / 0 fail**
  - `task-tracking-extension.test.ts` — **55 pass / 0 fail**
  - `orchestration-extension.test.ts` — **16 pass / 0 fail**
  - `orchestration-e2e.test.ts` — **9 pass / 0 fail**
  - `orchestration-host.test.ts` — **11 pass / 0 fail**
  - `cancel-run-handler.test.ts` — **7 pass / 0 fail**
  - `spawn-assignment-handler.test.ts` — 1 flaky failure on first
    run (tight-loop rate-limit timing test at line 264); passed
    clean on immediate retry (**26 pass / 0 fail**). Pre-existing
    timing flake unrelated to Phase 5 (last touched in Phase 4
    commit 9dad696). Not a regression.
  - `executor-agent-wiring.test.ts` — **22 pass / 0 fail**
  - `event-subscription-dispatcher.test.ts` — **13 pass / 0 fail**
  - `extension-audit-actions.test.ts` — **6 pass / 0 fail**
  - **Totals: 181 pass / 0 fail (steady), plus one timing flake
    that self-resolved on retry.**
- **Grep invariants** (source-tree only; build artifacts in
  `web/.svelte-kit/` and `web/build/` are stale caches, not
  sources):
  - `rg "runtime/tools/ask-human" src web/src` → **0 hits**
  - `rg "createAskHumanTool" src web/src` → **0 hits**
  - `rg "ask-human\.ts" src web/src` → **0 hits**
  - `rg "ask_human" src web/src` → hits confined to allowlisted
    locations (orchestration extension manifest + handler +
    subscription, orchestration-host wire helpers, task-events-
    handler branch, bundled.ts permission block, filter allowlist,
    test assertions, orchestrator prompt wording).
  - Deleted-file absence: `src/runtime/tools/ask-human.ts` —
    **absent**; `src/__tests__/ask-human.test.ts` — **absent**.
- **Coverage audit** — Phase 5 surfaces walked branch-by-branch:
  - `src/runtime/ask-human-registry.ts` — all 4 exports exercised
    by `orchestration-ask-human-e2e.test.ts` (happy path +
    explicit-clear + concurrent-conversations tests all touch
    the register/get/clear/_reset paths).
  - `src/runtime/sse-conversation-filter.ts` — new
    `orchestrator:human_response` entry covered by `sse-conversation-
    filter.test.ts` test "enumerates the 14 direct-carrier event
    types" + test "includes orchestrator:human_response (Phase 5)"
    + the conv-A/conv-B filter roundtrip at line 116.
  - `src/runtime/orchestration-host.ts:wireOrchestrationToolsForTurn`
    — `ask_human` found+pushed covered by the e2e sentinel test
    ("ask_human appears in agentTools after wireOrchestrationToolsForTurn
    runs") + the coexist test; the `ask_human` not-found warn
    branch is tacitly exercised by every `orchestration-host.test.ts`
    happy-path case (which uses a fake registry that only surfaces
    invoke_agent, so every test's tool-push count of 1 proves the
    ask_human branch hit the miss-and-warn fall-through).
  - `src/extensions/task-events-handler.ts:orchestrator:human_input`
    branch — `registerPendingHumanInput` call + `bus.emit` covered
    by `orchestration-ask-human-e2e.test.ts` (uses real
    `handleEmitTaskEventRpc`, not a fake).
  - `docs/extensions/examples/orchestration/index.ts:askHuman` +
    `handleHumanResponse` — all 10 branches covered by
    `orchestration-ask-human.test.ts`: happy-path, abort, timeout,
    unknown-requestId subscription, conversationId-mismatch
    (security), cleanup-on-success, cleanup-on-abort,
    cleanup-on-timeout, concurrent-calls, missing-invocationMetadata
    / emit-throws.
  - `web/src/routes/api/orchestrator/human-input/+server.ts` —
    all 3 branches covered by `human-input-route.test.ts`: live
    requestId (emit + clear), unknown requestId (ok without emit),
    scope-middleware reject (short-circuit).
  - `src/runtime/tools/builtin-registry.ts:buildToolList()` — empty
    return covered by `builtin-registry.test.ts` (asserts metadata
    array is empty and `getBuiltInCategories()` returns no entries).
  - **Coverage verdict: no gaps.** No Task B commits were needed.
- **Manual verification** (§Verification bullets): the human-in-the-
  loop UI amber card path is exercised end-to-end via the e2e
  test's wire→emit→shadow-map→POST→response→subscription→tool-result
  loop. The live UI card interaction + SSE delivery to a real
  browser is deferred to the operator as part of the soak window.
  UUID-guess drop behavior is asserted at the extension-handler
  layer (conversationId mismatch test) and at the SSE filter layer
  (conv-B subscriber drops conv-A's `orchestrator:human_response`).

### What this unblocks / closes

- **Phase 5 closes the 5-phase task-tracking migration.** The
  durable roadmap commitment in `git log --grep="Phase"` is
  fulfilled.
- **`src/runtime/tools/` has zero residents among the migrated
  surface.** `scratchpad` (Phase 1), `task-tracking` (Phase 3),
  `invoke_agent` (Phase 4), and `ask_human` (Phase 5) all ride
  in bundled extensions now. The generic file/shell tools
  (`edit-file`, `glob`, `grep`, `shell`, `read-file`, etc.) were
  never in migration scope — they stay put.
- **`src/runtime/tools/builtin-registry.ts` lives as an empty
  shell** per §Open design notes' frozen option (a).
  `buildToolList()` returns `[]`; every downstream consumer
  (`/api/tools`, mention-search, tool-invoke) handles the empty
  case naturally. Deletion of the module itself is deferred to
  the post-soak follow-up cycle.
- **2-week soak on main** starts from commit `eb3aad7`
  (2026-04-21 → ~2026-05-05). Target: no `ask_human`-shaped
  regressions, no `orchestrator:human_response` misroute, no
  UUID-guess alarms, no `spawnAgents` rate-limit drift from the
  pre-existing flake noted above.

### Five-phase migration — total scope tally

- **LOC deleted from `src/runtime/tools/`** across the migration:
  - Phase 1 — `scratchpad.ts` (scratchpad built-in). Host-side
    scaffolding also trimmed.
  - Phase 3 — `task-tracking.ts` **~1582 LOC** deleted.
  - Phase 4 — `invoke-agent.ts` **~285 LOC** deleted.
  - Phase 5 — `ask-human.ts` **146 LOC** deleted (plan estimated
    129; actual was 146 after the commit-1 enrichment).
  - Rough total: **~2000+ LOC of host-side tool code removed**
    from `src/runtime/tools/` and replaced by bundled-extension
    code + ~200 LOC of host-side bridge plumbing
    (ask-human-registry, orchestration-host wire helpers,
    task-events-handler branches, DIRECT_CARRIER entries, etc.).
- **Bundled extensions created**: 3 production extensions under
  `docs/extensions/examples/` — `scratchpad`, `task-tracking`,
  `orchestration` (the latter now owns both `invoke_agent` and
  `ask_human`).
- **Phase-tagged commits on main**: 47 commits matching
  `git log --grep="phase-"` across the 5 phases (includes
  all sub-commits — scaffolds, cov-fills, TS-fixes, cutovers,
  cleanups, ship logs).
- **Host seams introduced** during the migration: capability-
  permission tier + SSE conversation filter (2a-lite), two
  reverse RPCs (`ezcorp/emit-task-event`, `ezcorp/agent-configs`
  — 2b), `EventSubscriptionDispatcher` + SDK `registerEventHandler`
  (2c), `ezcorp/spawn-assignment` + `ezcorp/cancel-run` (2d/4),
  `invocationMetadata` carrier on `extensionToAgentTool` (4),
  wire-on-first-use via `orchestration-host.ts:ensureOrchestrationWired`
  (4), host-side `ask-human-registry.ts` shadow map (5). Every
  seam is covered by a dedicated test file under `src/__tests__/`.

--- End of the 5-phase migration. ---
