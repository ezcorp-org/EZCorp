# Phase 4 — Port `invoke_agent` from built-in tool to bundled `orchestration` extension

**STATUS: ✅ SHIPPED (2026-04-21)**

**Self-contained plan. Picks up cold from a fresh session.**

Ship-order reference: this is Phase 4 of the 5-phase task-tracking migration
framed in `.planning/phase-3-plan.md:10-11`. Prior phases: Phase 1 (scratchpad
port, done) proved the built-in→bundled pattern. Phase 2a-lite (commit
`84a6b7a`) shipped the capability-permission tier + SSE conversation filter +
`EZCORP_DISABLE_CAPABILITY_TOOLS` kill-switch. Phase 2b (commit `c200c5e`)
shipped `ezcorp/emit-task-event` + `ezcorp/agent-configs` reverse-RPCs.
Phase 2c (see `.planning/phase-2c-plan.md`) shipped the
`EventSubscriptionDispatcher` and the `registerEventHandler` SDK surface.
Phase 2d (commits `452f3e7`, `38ede47`, `75d02e6`, `e65c01f`, `cc26ae3`)
shipped `ezcorp/spawn-assignment` with SDK signature
`spawnAssignment({ task, agentConfigId?, agentName?, title?, taskId?, assignmentId? })`
returning `{ subConversationId, agentRunId, taskId, assignmentId }` (see
`packages/@ezcorp/sdk/src/runtime/spawn.ts:35-121`). Phase 3 shipped the
`task-tracking` bundled extension on **2026-04-21** (see
`.planning/phase-3-plan.md:929` — Ship log commits `34deb40`, `b61521c`,
`73cefee`, `7e58095`, `7446930`, `5a247ed` plus follow-ups `8a0aeb6`,
`e3237cd`, `989f491`, `2112926`, `13c9a9c`).

The durable roadmap lives in `git log --grep="Phase"`. This file supersedes
any prior Phase 4 outline — treat as authoritative.

**Preconditions (must be met before merge):**

1. Phase 3 two-week soak on main — **SATISFIED** as of 2026-04-21 per
   operator sign-off. Original target was ~2026-05-04
   (`.planning/phase-3-plan.md:925`); Phase 3 verification bullets 14–16
   were executed and passed on 2026-04-21, and no regression on task
   panel or task-tracking extension was observed in the soak window.
2. `task-tracking` bundled extension + `"builtin"` → real-id storage
   migration verified in production — the Phase 3 plan §Verification
   bullets 14–16 (`.planning/phase-3-plan.md:764-766`) were executed
   **today, 2026-04-21** and passed: extension row present, migrated
   storage rows render in the panel, kill-switch cleanly fails tools.
3. Phase 2d capability infrastructure (spawn quotas, reverse RPCs) remains
   stable on main. Specifically: the rate limiter at
   `src/extensions/rate-limit.ts:createRateLimiter(50)`, quota at
   `src/extensions/spawn-quota.ts`, handler at
   `src/extensions/spawn-assignment-handler.ts`, and SDK at
   `packages/@ezcorp/sdk/src/runtime/spawn.ts`.

---

## Context for a fresh session

After Phase 3, only **two** built-in LLM tools remain
(`src/runtime/tools/builtin-registry.ts:24-30`):

- `invoke_agent` (`src/runtime/tools/invoke-agent.ts` — 285 LOC)
- `ask_human` (`src/runtime/tools/ask-human.ts` — 129 LOC)

Both are registered with `category: "orchestration"`, both have
`mentionable: false`, and both require an active run context. They are
the last residents of `src/runtime/tools/` after scratchpad (Phase 1) and
task-tracking (Phase 3) moved out. Phase 4 completes the built-in→bundled
migration pattern for **`invoke_agent` only**. `ask_human` is explicitly
deferred to Phase 5 — see Frozen decisions below for the rationale.

### What `invoke_agent` does today

From `src/runtime/tools/invoke-agent.ts`:

- Factory `createInvokeAgentTool(opts)` is called from
  `src/runtime/executor.ts:779-794` when the parent turn mentions an agent
  (or auto-spin-up fires at `executor.ts:898-926`). The tool is injected
  into the parent turn's `agentTools` array only at orchestration depth 0
  or 1 — deeper runs don't re-inject (see
  `src/__tests__/orchestrator-prompt.test.ts:197` for the max-depth guard).
- Arguments: `{ agentConfigId: string; task: string }` (the
  `enum: availableAgents.map(a => a.id)` constraint in the JSON schema is
  **runtime-scoped** — it's derived per-turn from the mentioned agents).
- Returns: `{ content: [{ type: "text", text: responseText }],
  details: { _agentMeta: { subConversationId, agentName, agentConfigId } } }`.
  Error path returns `isError: true` with a human-readable message.
- Side effects: creates-or-reuses a sub-conversation
  (`createSubConversation`), emits `agent:spawn` / `agent:status` /
  `agent:complete` on the host bus with the **parent** `runId` (not a
  separate one — events pierce the sub-run and bubble to the parent
  watchdog and UI). Runs the sub-conversation via `executor.streamChat()`
  with a Promise.race'd 60s timeout (default; overridable via
  `timeoutMs` test hook at `invoke-agent.ts:45`).
- Persistent state: **none directly** — but the sub-conversations it
  creates are durable in the `conversations` table, and sub-agent
  interactions persist as messages. The tool itself has no extension
  storage footprint.

### Call sites for `invoke_agent`

Grep `runtime/tools/invoke-agent` across `src` finds exactly 4 host files
that depend on it:

- `src/runtime/executor.ts:779` — dynamic-imports `createInvokeAgentTool`.
- `src/runtime/executor.ts:899` — retrieves the injected tool by name for
  auto-spin-up pre-invocation.
- `src/runtime/executor.ts:1079,1099` — special-cases `toolName === "invoke_agent"`
  to suppress the `tool:start`/`tool:complete` WS emissions (the tool
  emits its own `agent:spawn`/`agent:complete` instead).
- `src/runtime/tools/builtin-registry.ts:28` — metadata entry.

Plus four tests:
- `src/__tests__/invoke-agent-tool.test.ts` — the primary 200-line unit
  suite (covers model sentinel resolution, timeout branch, error path,
  reuse-sub-conversation path, override merging).
- `src/__tests__/executor-agent-wiring.test.ts` — injection/filter/event
  suppression integration tests (matches at lines 140, 168, 197, 212, 282,
  303, 307, 326-337, 341, 442, 462, 501).
- `src/__tests__/team-tool-scope-integration.test.ts` — verifies team
  scope cascades into `invoke_agent`.
- `src/__tests__/current-model-e2e.test.ts` — the sentinel resolution is
  shared with task-tracking's auto-start path.
- `src/__tests__/orchestrator-prompt.test.ts` and
  `orchestrator-prompt-task.test.ts` — prompt includes the tool name.
- `src/__tests__/apply-tool-filters.test.ts` — verifies
  `ORCHESTRATION_TOOLS` preservation (`src/runtime/tools/filter.ts:9-27`).

The tool name is baked into three durable prompt strings at
`src/runtime/orchestrator-prompt.ts:12,72,137` and into the
`ORCHESTRATION_TOOLS` allowlist at `src/runtime/tools/filter.ts:10`. After
Phase 4 the name stays **`invoke_agent`** (not namespaced to
`orchestration__invoke_agent` as other bundled extensions would be) —
see Frozen decisions.

### Two hidden invariants

1. **`invoke_agent` emits `agent:spawn`/`agent:complete` with the parent's
   `runId`, not a fresh one.** Consumers rely on this: the executor's
   watchdog at `executor.ts:1237-1247` counts sub-agent events as
   parent-run liveness; the WS routing at `web/src/lib/sub-agent-routing.ts`
   associates sub-conversations to the parent turn. Any port MUST preserve
   this contract — the SDK wrapper must NOT replace `runId` with the
   spawn's own `agentRunId`.
2. **Sub-conversation reuse is a first-class feature.** Lines 100-117 of
   `invoke-agent.ts` find an existing sub-conversation for `agentConfigId`
   under the parent and **reuse it** for persistent context across
   invocations. Phase 2d's `spawnAssignment` today **always creates a
   fresh sub-conversation** (see `spawn-assignment-handler.ts:140-180`).
   This is the single largest semantic gap — see §5 for the resolution.

---

## Goal

Ship a bundled extension at `docs/extensions/examples/orchestration/` that:

1. Exposes **one** LLM tool — `invoke_agent` — with byte-for-byte
   feature parity on the surface (same JSON schema, same return shape,
   same error modes, same model/provider/override resolution).
2. Dispatches the sub-agent run via the existing Phase 2d
   `spawnAssignment` RPC (reused — no new reverse RPC added in Phase 4).
3. Bridges the async `spawnAssignment` handle into the **synchronous-to-
   the-LLM** `execute(...)` return via a two-hop subscription on
   `task:assignment_update` — same pattern Phase 3 proved for task
   completion at `.planning/phase-3-plan.md:§4.2`.
4. Is auto-installed via `BUNDLED_EXTENSIONS` on boot (host gets one new
   entry in `src/extensions/bundled.ts`).
5. Is auto-wired to every conversation that mentions an agent, using the
   **same first-use pattern** Phase 3 ships (`ensureTaskTrackingWired`).

Simultaneously Phase 4 **deletes** `src/runtime/tools/invoke-agent.ts`,
trims `src/runtime/tools/builtin-registry.ts` down to one entry
(`ask_human`, still host-only), and rewrites the 4 host call sites to
route through the extension.

**Frozen decisions (resolved during planning — do not relitigate):**

- **Scope: `invoke_agent` only. `ask_human` stays host-only in Phase 4.**
  The surface-level brief recommended porting both to a combined
  `orchestration` extension. On the source read this is wrong for
  `ask_human`. Full rationale:
    - `ask_human` synchronously gates on a host-local
      `Map<requestId, { resolve, reject }>` (see `ask-human.ts:21` and
      `ask-human.ts:86`). Resolution is driven by a SvelteKit route
      (`web/src/routes/api/orchestrator/human-input/+server.ts:10-11`)
      calling the module-level `resolveHumanInput(requestId, response)`.
    - Moving this into an extension subprocess requires a **new reverse
      RPC** (`ezcorp/ask-human`) that blocks up to 5 minutes waiting for
      a user response, which is exactly the anti-pattern Phase 2d's §Goal
      (`.planning/phase-2d-plan.md:139`) explicitly rejects for
      `spawnAssignment`.
    - The obvious async alternative is to subscribe to
      `orchestrator:human_response` via Phase 2c and pair the
      question-side `ezcorp/ask-human-notify` RPC with a
      response-side subscription. **But `orchestrator:human_response`
      has no `conversationId`** (`src/types.ts:286-289` — payload is
      `{ requestId, response }`), so it isn't in `DIRECT_CARRIER_EVENT_TYPES`
      at `src/runtime/sse-conversation-filter.ts:46-60`. Phase 2c's
      dispatcher drops events without `conversationId` at
      `event-subscription-dispatcher.ts:161-162`. Wiring it up requires
      either (a) extending Phase 2c's allowlist — explicitly out of scope
      for this migration (see `.planning/phase-3-plan.md:§4.3`,
      `.planning/phase-4-plan.md:§Out of scope`), or (b) synthesizing
      a host-side shim that stamps `conversationId` onto the event
      before emit, which is a non-trivial design decision.
    - `ask_human` is also low-volume — there's no operational cost to
      leaving it as a built-in through the Phase 5 cycle.
    - Extensions that want user-interaction semantics can already invoke
      via `invoke_agent` and have the sub-agent call `ask_human`
      directly. No feature regression.
    - **Phase 5 (not yet planned) takes up the full `orchestrator`
      extension including `ask_human`, with the allowlist expansion or
      a bidirectional request/response RPC pattern — whichever the
      operator prefers.** See §Open design notes and §Out of scope.
- **Single-tool extension name.** The extension is named
  **`orchestration`** (not `invoke-agent`, not `orchestrator`) — keeps
  `category: "orchestration"` naming consistent across the codebase,
  and leaves the door open for Phase 5 to add `ask_human` as the second
  tool in the same extension without another rename. Path:
  `docs/extensions/examples/orchestration/`.
- **Tool name stays `invoke_agent` (NOT namespaced).** Bundled extensions
  normally publish tools as `<extName>__<toolName>` — scratchpad's
  `scratchpad__scratchpad_write` (see `src/runtime/tools/filter.ts:16`).
  Breaking this convention requires explicit host support. Justification:
  (a) the tool is referenced by literal name in three places in durable
  system prompts (`src/runtime/orchestrator-prompt.ts:12,72,137`) —
  renaming breaks LLM-facing invocation grammar; (b) the
  `ORCHESTRATION_TOOLS` allowlist at `src/runtime/tools/filter.ts:9-27`
  is consumed by every tool-filter call site and the string matching is
  exact; (c) the executor special-cases the literal name at
  `executor.ts:1079,1099` for event suppression. Renaming would be a
  surface change affecting prompts, UI copy, tests, and on-disk team
  configs. **The extension manifest declares `tools: [{ name: "invoke_agent" }]`
  directly — no prefix.** The host's tool-dispatch path already accepts
  bare names (scratchpad's Phase 1 notes in `filter.ts:13-17` confirm
  namespacing is what the filter "sees at runtime", not a hard
  requirement). This is a narrow one-off deviation for the two built-in
  orchestration tools.
- **Per-turn schema override via a new `extensionToAgentTool` arg.** The
  `invoke_agent` JSON schema has a runtime-scoped `enum` on `agentConfigId`
  (today's `invoke-agent.ts:62-66` — enum = current turn's available
  agent IDs). Bundled-extension manifests publish **static** schemas, so
  the enum can't live in `docs/extensions/examples/orchestration/ezcorp.config.ts`.
  Option (2) considered and rejected: "omit the enum, rely on
  `agentConfigs.resolve` for validation" — loses JSON-Schema-time
  enforcement and gives the LLM no schema-level signal about valid
  IDs. **Frozen choice: option (1).** Extend `extensionToAgentTool`
  (`src/extensions/tool-executor.ts:30-50`) with an optional 5th arg
  `schemaOverride?: Record<string, unknown>`. When present, the wrapper
  uses it in place of `extTool.inputSchema`. `wireOrchestrationToolsForTurn`
  builds the per-turn enum and passes it through. Other bundled extensions
  (scratchpad, task-tracking) call the 4-arg form — additive, non-breaking.
  This is the sole host-SDK surface change beyond §5.2's `SpawnAssignmentInput`
  additions.
- **SDK path: reuse `spawnAssignment`. No new reverse RPC.** Phase 2d's
  SDK (`packages/@ezcorp/sdk/src/runtime/spawn.ts:35-121`) accepts
  `{ task, agentConfigId?, agentName?, title?, taskId?, assignmentId? }`
  and returns `{ subConversationId, agentRunId, taskId, assignmentId }`.
  The extension's `invoke_agent` handler calls `spawnAssignment()` for
  the dispatch and waits on the bridged completion event. §5 details the
  gaps this exposes (sub-conversation reuse, `parentMessageId`, member
  overrides, `runId` preservation) and how each is resolved.
- **Completion bridge: two-hop via `task:assignment_update`.** Same
  pattern as Phase 3 §4.2 (`.planning/phase-3-plan.md:371-407`). The
  extension subscribes to `task:assignment_update`, waits for the
  matching `assignmentId` to become `completed`/`failed`, and then
  resolves its internal Promise gate. The host's `start-assignment.ts`
  already emits this event on `run:complete` / `run:error`.
- **Conversation wiring: wire-on-first-use.** Same as Phase 3 §5.
  New helper `src/runtime/orchestration-host.ts` with
  `ensureOrchestrationWired(conversationId)` — idempotent insert into
  `conversation_extensions`. Called from
  `executor.ts` at the exact site where `createInvokeAgentTool` used to
  run (the agent-mention branch). First-use race falls back on the
  unique `(conversationId, extensionId)` constraint, same as
  `ensureTaskTrackingWired` (see `.planning/phase-3-plan.md:786-792`).
- **Rollout shape: big-bang.** One PR, ~5 commits, revert of the merge
  commit if broken. No `EZCORP_INVOKE_AGENT_EXT=1` gate — Phase 1 and
  Phase 3 both ran unflagged cutovers and nothing in this phase is
  larger or riskier. Big-bang keeps the test surface half the size.
- **Kill-switch.** `EZCORP_DISABLE_CAPABILITY_TOOLS=1` already covers
  the extension — every one of its reverse RPCs (`spawnAssignment`,
  `task:assignment_update` subscription) flows through the same
  capability gate. A boot with the flag set means `invoke_agent` returns
  a permission error to the LLM on every call; the parent turn then
  either recovers (agent retries without it) or surfaces the error in
  chat. Acceptable failure mode — **same shape Phase 3 ships**
  (`.planning/phase-3-plan.md:766`).
- **Feature parity is total.** No feature dropped. Every semantic in
  today's `invoke-agent.ts` ports, including: (a) sub-conversation reuse
  across invocations, (b) `parentMessageId` linkage for historical
  display, (c) team-tool-scope cascade, (d) `memberOverrides` resolution
  (model / provider / systemPromptAppend / permissionMode /
  toolRestriction / allowedTools / deniedTools / modeId), (e) the
  60-second timeout with `agent:complete` emit-on-timeout safety net,
  (f) `_agentMeta` in the tool-result details. The SDK's handle extension
  in §5.2 makes all but (a) a direct pass-through; (a) is resolved via
  a new optional `reuseSubConversationFor: agentConfigId` field in
  `spawnAssignment` input — see §5.2.
- **Depth limit.** `invoke_agent` today doesn't enforce its own depth
  limit — depth flows through `options.orchestrationDepth` (see
  `invoke-agent.ts:187`) and is checked upstream in
  `executor.ts:767-768` before the tool is even injected (max depth 1).
  Phase 2d's `spawn-assignment-handler.ts` enforces its own
  `MAX_CALL_DEPTH = 10` cross-extension depth gate via
  `conversations.metadata.spawnDepth`. The two are separate counters —
  the existing orchestration-depth check stays where it is (in the
  executor, before wiring the extension), and the `spawnAssignment`
  depth gate is additional defense-in-depth. Nothing to change.
- **Persistent state.** None — `invoke_agent` has no storage. The
  extension's manifest declares `storage: false` (i.e. omits the
  permission). No migration. No `__tasks`-style data rehoming.
- **Ship in 5 commits max.** One-line scope per commit in §Ship order.

---

## Feature-parity matrix

Every semantic of today's built-in maps to the extension handler. No
behavior is dropped. Column 3 flags the resolution path in the
implementation plan below.

| Built-in behavior | Extension handler | Resolution |
|---|---|---|
| `{ agentConfigId, task }` JSON schema with `enum` constraint on `agentConfigId` | `invokeAgent` handler | Schema ports verbatim; the `enum` becomes runtime-resolved from the host's `availableAgents` via a new `orchestrator/get-available-agents` or bundled directly in the tool injection (see §5.1). |
| Sub-conversation reuse by `(parentConversationId, agentConfigId)` | `invokeAgent` handler | §5.2 — extend `SpawnAssignmentInput` with `reuseSubConversationFor?: string` (pass-through of `agentConfigId`); handler in `spawn-assignment-handler.ts` queries `getSubConversations` and reuses when present. |
| `parentMessageId` linkage for sub-conversation (for replay/history display) | `invokeAgent` handler | §5.2 — extend `SpawnAssignmentInput` with `parentMessageId?: string`. |
| Timeout (default 60s, `timeoutMs` override) | `invokeAgent` handler + bridge | Timer in the extension; on expiry, call `orchestrator/cancel-run` (a thin existing primitive, wrap `executor.cancelRun` — see §5.3) and return the legacy timeout error shape. |
| `agent:spawn` / `agent:status` / `agent:complete` events with **parent** `runId` | Host, inside `spawn-assignment-handler.ts` + `start-assignment.ts` | §5.4 — the emissions already happen inside `start-assignment.ts`; verify they use the parent's `runId`. Today they do (see `executor.ts:1233-1247`). Port is a no-op. |
| `_agentMeta` in tool-result `details` | `invokeAgent` handler | Handler constructs it from the `SpawnAssignmentHandle` + agent name lookup. |
| Model/provider sentinel resolution via `CURRENT_MODEL_SENTINEL` | Handled by `spawn-assignment-handler.ts` | Already resolves from `parentConversation.model/provider` at `spawn-assignment-handler.ts:167-175`. Port is a no-op. |
| `memberOverrides` (8 fields) cascade | `invokeAgent` handler | §5.2 — extend `SpawnAssignmentInput` with the override fields that `startAssignment` already supports. Handler accepts them verbatim. |
| `teamToolScope` cascade (allow/deny list overrides per-member lists) | `invokeAgent` handler | §5.2 — extend `SpawnAssignmentInput`. Same pass-through. |
| Timeout `agent:complete` safety-net emit | Host | `start-assignment.ts` already emits on `run:error` / timeout. Port is a no-op. |
| Unknown `agentConfigId` → error (with allowlist) | `invokeAgent` handler | Validates before calling `spawnAssignment`; returns legacy error string. |

---

## Implementation plan

### 1. Extension scaffold

Create `docs/extensions/examples/orchestration/` with:

**`ezcorp.config.ts`** (mirror `task-tracking/ezcorp.config.ts:188-275`):

```ts
import { defineExtension } from "../../../../src/extensions/sdk/define";

const INVOKE_AGENT_SCHEMA = {
  type: "object",
  properties: {
    agentConfigId: {
      type: "string",
      description:
        "The ID of the agent to invoke. Must be one of the agents available for this turn.",
    },
    task: {
      type: "string",
      description: "A clear description of what the agent should do.",
    },
  },
  required: ["agentConfigId", "task"],
} as const;

export default defineExtension({
  schemaVersion: 2,
  name: "orchestration",
  version: "1.0.0",
  description:
    "Multi-agent orchestration primitives. Currently provides `invoke_agent` for delegating to a sub-agent within a conversation.",
  author: { name: "EzCorp" },
  entrypoint: "./index.ts",
  persistent: true,
  tools: [
    {
      name: "invoke_agent",
      description:
        "Invoke a specialized agent to handle a task. The agent runs as an independent sub-conversation and returns its response. You can call this tool multiple times in parallel for independent tasks.",
      inputSchema: INVOKE_AGENT_SCHEMA as Record<string, unknown>,
    },
  ],
  permissions: {
    agentConfig: "read",
    spawnAgents: { maxPerHour: 500, maxConcurrent: 25 },
    eventSubscriptions: ["task:assignment_update"],
  },
});
```

Rate-limit rationale: `maxPerHour: 500` is 2.5× the task-tracking
ceiling of 200 (the same argument — the busiest observed team run hit
~100 spawns/hour in the team-orchestration seam test and `invoke_agent`
tends to run at higher burst because of auto-spin-up). `maxConcurrent: 25`
is 2.5× task-tracking's 10 because `Promise.all` fan-out in
`auto-spin-up` (see `executor.ts:904-908`) commonly hits 8–15 parallel
sub-invocations, and we need headroom.

**`src/extensions/bundled.ts` entry** — inserted alongside the existing
`task-tracking` block (`bundled.ts:50-71`):

```ts
{
  // Orchestration primitives extension. Converted from the built-in tools
  // formerly at src/runtime/tools/invoke-agent.ts in Phase 4. Wire-on-
  // first-use via orchestration-host.ensureOrchestrationWired — no
  // per-conversation wiring happens at install time.
  //
  // Phase 5 will fold `ask_human` into this same extension once the
  // request/response bridge design lands (out of scope for Phase 4 —
  // see .planning/phase-4-plan.md §Open design notes).
  name: "orchestration",
  path: "docs/extensions/examples/orchestration",
  permissions: {
    agentConfig: "read",
    spawnAgents: { maxPerHour: 500, maxConcurrent: 25 },
    eventSubscriptions: ["task:assignment_update"],
    grantedAt: {
      agentConfig: Date.now(),
      spawnAgents: Date.now(),
      eventSubscriptions: Date.now(),
    },
  },
},
```

### 2. Storage: none

The tool holds no persistent state. Transient request tracking
(request-id → promise gate) lives in a process-local `Map` inside the
extension subprocess. The subprocess is `persistent: true` so the map
survives across calls. No `Storage("conversation")` wiring; no
migration.

### 3. Tool handler — `invokeAgent`

File: `docs/extensions/examples/orchestration/index.ts`.

Top-of-file pattern from `task-tracking/index.ts:22-44`:

```ts
import {
  createToolDispatcher,
  getChannel,
  AgentConfigs,
  registerEventHandler,
  spawnAssignment,
  toolError,
  toolResult,
  type SpawnAssignmentInput,
  type ToolHandler,
} from "@ezcorp/sdk/runtime";

// Injectable bindings for tests (scratchpad/task-tracking pattern).
let agentConfigs = new AgentConfigs();
let spawn = spawnAssignment;
export function _setAgentConfigsForTests(fake: typeof agentConfigs) { agentConfigs = fake; }
export function _setSpawnForTests(fake: typeof spawn) { spawn = fake; }

const DEFAULT_AGENT_TIMEOUT_MS = 60_000;

// In-process tracking of pending invocations. Keyed on assignmentId —
// the SDK-provided handle carries it through. Resolved/rejected by the
// `task:assignment_update` subscription handler below. Subprocess is
// `persistent: true`, so this map survives across tool calls.
interface PendingInvocation {
  resolve: (result: { resultPreview: string; success: boolean }) => void;
  reject: (err: Error) => void;
  timeoutHandle: ReturnType<typeof setTimeout>;
  agentName: string;
  agentConfigId: string;
  subConversationId: string;
}
const pendingInvocations = new Map<string, PendingInvocation>();
```

Handler body (sketch):

```ts
const invokeAgent: ToolHandler = async (args, ctx) => {
  const { agentConfigId, task } = args as { agentConfigId: string; task: string };

  // Validate: agent must exist and be visible to this user.
  const config = await agentConfigs.resolve(agentConfigId);
  if (!config) {
    return toolResult({
      content: [{ type: "text", text: `Error: Unknown agent "${agentConfigId}".` }],
      details: { isError: true },
    });
  }

  const timeoutMs = DEFAULT_AGENT_TIMEOUT_MS;

  // Dispatch via Phase 2d RPC.
  let handle;
  try {
    handle = await spawn({
      task,
      agentConfigId,
      // Reuse-by-config — see §5.2 for the host-side handling.
      reuseSubConversationFor: agentConfigId,
      title: config.name,
      // Overrides come from ctx.invocationMetadata (set by the host at
      // tool-invoke time — see §5.1). The host forwards memberOverrides,
      // teamToolScope, parentMessageId, parentModel/parentProvider,
      // depth, etc.
      ...(ctx.invocationMetadata?.parentMessageId ? { parentMessageId: ctx.invocationMetadata.parentMessageId } : {}),
      ...(ctx.invocationMetadata?.overrides ? { overrides: ctx.invocationMetadata.overrides } : {}),
      ...(ctx.invocationMetadata?.teamToolScope ? { teamToolScope: ctx.invocationMetadata.teamToolScope } : {}),
    });
  } catch (err) {
    return toolResult({
      content: [{ type: "text", text: `Agent "${config.name}" failed to dispatch: ${err instanceof Error ? err.message : String(err)}` }],
      details: { isError: true },
    });
  }

  // Set up the wait-for-completion promise gate. The subscription
  // handler (registered at module load) resolves this when it sees
  // a matching `task:assignment_update` with a terminal status.
  const completion = new Promise<{ resultPreview: string; success: boolean }>((resolve, reject) => {
    const timeoutHandle = setTimeout(() => {
      if (pendingInvocations.has(handle.assignmentId)) {
        pendingInvocations.delete(handle.assignmentId);
        reject(new Error(`Agent "${config.name}" timed out after ${Math.round(timeoutMs / 1000)}s`));
      }
    }, timeoutMs);
    pendingInvocations.set(handle.assignmentId, {
      resolve,
      reject,
      timeoutHandle,
      agentName: config.name,
      agentConfigId,
      subConversationId: handle.subConversationId,
    });
  });

  try {
    const { resultPreview, success } = await completion;
    return toolResult({
      content: [{ type: "text", text: resultPreview }],
      details: {
        ...(success ? {} : { isError: true }),
        _agentMeta: {
          subConversationId: handle.subConversationId,
          agentName: config.name,
          agentConfigId,
        },
      },
    });
  } catch (err) {
    return toolResult({
      content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }],
      details: {
        isError: true,
        _agentMeta: {
          subConversationId: handle.subConversationId,
          agentName: config.name,
          agentConfigId,
        },
      },
    });
  }
};
```

### 4. Event subscription (Phase 2c consumer)

The manifest declares `eventSubscriptions: ["task:assignment_update"]`.
The extension registers exactly one handler at module load:

```ts
registerEventHandler("task:assignment_update", async (payload) => {
  const { assignment } = payload as {
    conversationId: string;
    taskId: string;
    assignment: { id: string; status: string; resultPreview?: string };
  };
  const pending = pendingInvocations.get(assignment.id);
  if (!pending) return;   // not ours — race with task-tracking or unrelated update
  if (assignment.status !== "completed" && assignment.status !== "failed") return;

  clearTimeout(pending.timeoutHandle);
  pendingInvocations.delete(assignment.id);

  const resultPreview = assignment.resultPreview ?? "(no result)";
  if (assignment.status === "completed") {
    pending.resolve({ resultPreview, success: true });
  } else {
    pending.resolve({ resultPreview, success: false });  // reported to LLM as isError
  }
});
```

#### 4.1 Why this reuses `task:assignment_update` instead of a new event

- `task:assignment_update` is already in `DIRECT_CARRIER_EVENT_TYPES`
  (`sse-conversation-filter.ts:59`) — Phase 2c delivers it.
- The Phase 2d `spawnAssignment` handler emits it on dispatch
  (`spawn-assignment-handler.ts` — verify in the audit at §5.2), and
  `start-assignment.ts` emits it again on terminal run status with the
  updated `status: "completed"|"failed"` + `resultPreview`.
- Phase 3's `task-tracking` extension already consumes this same event,
  and the `assignmentId` space is globally unique (UUID) — there's no
  overlap risk between the two extensions consuming it.

#### 4.2 Cross-extension self-delivery risk

Phase 2c delivers events to every wired extension in the conversation,
including the emitter itself. Today when `invoke_agent` runs, **both**
extensions (orchestration + task-tracking) will receive every
`task:assignment_update` for the conversation. That's fine — each
extension keys its pending set by the `assignmentId`s *it created*, and
`task-tracking`'s assignmentIds are disjoint from orchestration's
assignmentIds. Guard: the handler bails out fast (`if (!pending) return`)
when the assignmentId isn't in its own pending map.

#### 4.3 Why NOT subscribe to `agent:complete`

Same reason as Phase 3 §4.1: `agent:complete` lacks `conversationId` at
the top level of its payload (`src/types.ts:269-278`), so
`event-subscription-dispatcher.ts:161-162` drops it. The two-hop via
`task:assignment_update` inherits the plumbing Phase 3 already validated.

### 5. Host-side changes

#### 5.1 `src/runtime/executor.ts` — replace the `createInvokeAgentTool` block

**Lines 779-794** currently do:

```ts
const { createInvokeAgentTool } = await import("./tools/invoke-agent");
agentTools.push(createInvokeAgentTool({ executor: this, bus: this.bus, ... }));
```

After Phase 4: **delete** this block. Instead, wire the `orchestration`
extension on first-use (matches scratchpad's S7 gate at
`executor.ts:815-847` and the Phase 3 `ensureTaskTrackingWired` pattern
at `.planning/phase-3-plan.md:440-447`):

```ts
// Orchestration extension (Phase 4): wire-on-first-use for invoke_agent.
try {
  const { ensureOrchestrationWired, wireOrchestrationToolsForTurn } =
    await import("./orchestration-host");
  const wired = await ensureOrchestrationWired(conversationId);
  if (wired) {
    await wireOrchestrationToolsForTurn({
      agentTools,
      conversationId,
      runId: run.id,
      availableAgents: allAvailableAgents,
      parentModel: options.model,
      parentProvider: options.provider,
      parentMessageId: options.parentMessageId,
      depth,
      memberOverrides: resolvedMemberOverrides,
      subAgentMembers: resolvedSubAgentMembers,
      teamToolScope: resolvedTeamToolScope,
      registry: ExtensionRegistry.getInstance(),
      executor: this,
      stateMediator: this._stateMediator,
      spawnQuota: this._spawnQuota,
      userId: convRecord?.userId,
    });
  }
} catch (orchWireErr) {
  log.warn("Orchestration extension wire failed — agent orchestration unavailable this turn", {
    error: String(orchWireErr),
  });
}
```

The helper `wireOrchestrationToolsForTurn` lives in a new file
`src/runtime/orchestration-host.ts` (NEW) and does three things:

1. Builds the per-turn `availableAgents` schema constraint for
   `invoke_agent` (mirroring today's `invoke-agent.ts:62-66` enum). This
   is **dynamic per-turn**, which is the one place the extension's
   static manifest schema falls short. Resolution: the host wraps the
   extension's tool via `extensionToAgentTool()` but **overrides the
   input schema** at wire time to inject the current turn's agent IDs.
   Precedent: scratchpad's per-turn wiring at `executor.ts:836-843`
   already uses `extensionToAgentTool`.
2. Threads per-turn metadata (`memberOverrides`, `teamToolScope`,
   `parentMessageId`, `parentModel`, `parentProvider`, `depth`) onto
   every outbound tool invocation via the `invocationMetadata` seam that
   `extensionToAgentTool` exposes. This lands in the extension handler
   as `ctx.invocationMetadata`.
3. Installs the event-suppression special-case for `invoke_agent` — it
   already exists at `executor.ts:1079,1099` and stays put (the tool
   name doesn't change, so the special-case works as-is).

**Auto-spin-up** (`executor.ts:898-926`) — the code at line 899
(`const invokeAgentTool = agentTools.find(t => t.name === "invoke_agent")`)
KEEPS WORKING because the extension-wrapped tool in `agentTools` has the
same `name`. No change.

#### 5.1a `invocationMetadata` seam — NEW host+SDK plumbing

Grep confirms today's SDK `ctx` has no `invocationMetadata` field —
the handler sketch in §3 reads from one anyway. This is a net-new seam
Phase 4 adds. The alternative (fold every field into
`SpawnAssignmentInput` and have the host pre-bake values into the tool
wrapper via closure) works for the four per-turn fields
(`parentMessageId`, `overrides`, `teamToolScope`, `orchestrationDepth`)
but fails for any field that is per-call-instance rather than
per-turn — of which none exist today but are likely in Phase 5
(`ask_human` needs a per-call `requestId`, for example). Pay the
seam cost once.

Shape:

- **SDK side** (`packages/@ezcorp/sdk/src/runtime/tool-context.ts`
  — new file OR extend the existing `ctx` type in `tool-handler.ts`):
  add an optional `invocationMetadata?: Record<string, unknown>` to
  the `ToolHandlerContext` interface. Handlers read it like any other
  ctx field.
- **Host side** (`src/extensions/tool-executor.ts:executeToolCall`):
  accept an optional trailing `metadata?: Record<string, unknown>`
  parameter. Forward it into the extension subprocess via the
  existing tool-invoke RPC payload (the JSON-RPC request already
  carries opaque params — adding a sibling `metadata` field is
  backward-compatible with existing extensions that ignore it).
- **Wrapper side** (`extensionToAgentTool`, §Frozen decisions' new
  5th-arg overhaul): the wrapper closes over a per-turn metadata
  object and passes it as the trailing arg to
  `toolExecutor.executeToolCall`. `wireOrchestrationToolsForTurn`
  builds the per-turn object once and binds it into the wrapper.

Concretely, `extensionToAgentTool` grows from a 4-arg call to a
6-arg call (back-compat via optional args):

```ts
extensionToAgentTool(
  extTool, toolExecutor, conversationId, messageId,
  schemaOverride?,         // §Frozen decisions — per-turn JSON-Schema enum
  invocationMetadata?,     // §5.1a — per-turn opaque data for the handler
);
```

This **is** scope — call it out in review rather than hide it.
Other bundled extensions continue to call the 4-arg form; only the
orchestration extension's wiring path uses both new args.

**Tests:** `tool-executor` gets new unit tests covering metadata
forwarding + schemaOverride precedence. `extensionToAgentTool`
gets a test for the 6-arg form.

#### 5.2 `spawnAssignment` SDK surface — NEW optional fields

Phase 2d's current surface (see `packages/@ezcorp/sdk/src/runtime/spawn.ts:35-60`):

```ts
export interface SpawnAssignmentInput {
  task: string;
  agentConfigId?: string;
  agentName?: string;
  title?: string;
  taskId?: string;
  assignmentId?: string;
}
```

Phase 4 extends this with **five new optional fields**:

```ts
export interface SpawnAssignmentInput {
  task: string;
  agentConfigId?: string;
  agentName?: string;
  title?: string;
  taskId?: string;
  assignmentId?: string;

  // ── Phase 4 additions ──
  /** If set, the host queries existing sub-conversations of the current
   *  conversation for one whose `agentConfigId` matches. If found, it's
   *  reused (persistent context across invocations). If not, a fresh
   *  sub-conversation is created as today. Matches the legacy
   *  `invoke-agent.ts:100-117` reuse semantics. */
  reuseSubConversationFor?: string;
  /** Anchors the sub-conversation to a specific parent message for
   *  historical display after refresh. Matches
   *  `invoke-agent.ts:110` `parentMessageId`. */
  parentMessageId?: string;
  /** Per-member override bundle — `model`, `provider`, `systemPromptAppend`,
   *  `permissionMode`, `toolRestriction`, `allowedTools`, `deniedTools`,
   *  `modeId`. Shape mirrors `TeamMemberOverrides` in `src/types.ts`.
   *  Serialized as a flat object; handler at
   *  `spawn-assignment-handler.ts` forwards onto `streamChat`. */
  overrides?: Record<string, unknown>;
  /** Team-level allow/deny list that overrides per-member `overrides`.
   *  Shape mirrors `TeamToolScope`. */
  teamToolScope?: { allowedTools?: string[]; deniedTools?: string[] };
  /** Current orchestration depth. Defaults to 0. The handler forwards
   *  this as `options.orchestrationDepth` to `startAssignment` — which
   *  in turn becomes the starting depth for `streamChat`. */
  orchestrationDepth?: number;
}
```

Host-side changes in `src/extensions/spawn-assignment-handler.ts`:

- Accept and validate the new fields (optional; omitted → legacy
  behavior).
- `reuseSubConversationFor`: before calling `createSubConversation`,
  query `getSubConversations(currentConversationId)` and pick the one
  whose `agentConfigId` matches. If found, reuse its id. If not, fall
  through. Mirrors `invoke-agent.ts:99-117` verbatim.
- `parentMessageId`: pass into `createSubConversation` when provided
  (already supported).
- `overrides` / `teamToolScope` / `orchestrationDepth`: forward onto the
  `startAssignment` call.

**Critical invariant: `runId`.** The two-hop bridge the extension uses
relies on the host's `start-assignment.ts` bumping activity on the
parent `runId`. Verify at `start-assignment.ts` that the emitted
`run:complete` / `agent:complete` / `task:assignment_update` all carry
the **parent** `runId`, not a freshly-generated one. Today's
`spawnAssignment` handler at `spawn-assignment-handler.ts` generates its
own `agentRunId` but `start-assignment.ts`'s event-emission layer keeps
the parent `runId` on the parent-run events and uses `agentRunId` only
for the sub-run's internal bookkeeping. **Acceptance check during
execution: grep `start-assignment.ts` for `bus.emit("agent:` and confirm
the `runId:` field is the parent's.**

#### 5.3 Cancellation path

Today `invoke-agent.ts:152` calls `executor.cancelRun(agentRunId)` when
the parent tool signal aborts. The extension subprocess doesn't have
direct access to `executor.cancelRun`. Resolution options:

- **Preferred (lightweight):** the extension calls an existing host RPC
  `ezcorp/cancel-run` if one exists; if not, **add one** as part of
  Phase 4's commit 2. Surface: `cancelRun(agentRunId)`. Host handler
  looks up the run by id and calls `executor.cancelRun(agentRunId)`.
  Permission gate: reuse `spawnAgents` (an extension that can spawn can
  cancel its own spawns; cross-extension cancel is rejected by checking
  that `agentRunId` belongs to a run the calling extension originated —
  track in `spawn-quota.ts`'s already-existing `Map<extensionId, Set<agentRunId>>`
  from the concurrent-cap tracker at
  `.planning/phase-2d-plan.md:146-147`).
- **Fallback (only if the above is too much scope):** rely on the
  timeout. The timeout in §3 still fires. The sub-run continues to
  completion in the background but the tool call returns. This leaks
  compute for up to the sub-run's natural duration but is not
  user-visible.

**Frozen choice:** add `ezcorp/cancel-run` in commit 2. It's ~40 LOC
plus a test and keeps the parity true. The `spawn-quota` module already
knows which extension owns which `agentRunId` for the concurrent cap
(plan §2d.2), so the permission check is a one-liner.

**Slot-release semantics.** A successful cancel **immediately decrements**
the spawn-quota concurrent counter for the owning extension and removes
the `agentRunId` from its `Set<agentRunId>`. The existing on-run-complete
hook in `spawn-quota.ts` becomes a no-op for cancelled runs (check: if
the id is no longer in the set, the decrement is skipped — i.e. the hook
is idempotent against prior cancel). Without this, a timeout-loop under
fan-out load leaks slots until the underlying run terminates naturally,
defeating the cancel's purpose. Add a `cancel-run-handler.test.ts` case
that spawns to cap, cancels one, and asserts a subsequent spawn succeeds
immediately (rather than erroring with `SPAWN_QUOTA_EXCEEDED`).

#### 5.4 `src/runtime/tools/builtin-registry.ts` — drop to 1 entry

Delete the `invoke_agent` entry (lines 28). The list becomes:

```ts
function buildToolList(): BuiltInToolMeta[] {
  return [
    // Orchestration (1) — ask_human stays as a built-in pending Phase 5.
    // invoke_agent moved to the `orchestration` bundled extension in Phase 4.
    { name: "ask_human", description: "Pause execution and ask the user a question. The agent will wait for the user's response before continuing.", category: "orchestration", mentionable: false },
  ];
}
```

Update `src/__tests__/builtin-registry.test.ts`:
- `"returns 2 tools"` → `"returns 1 tool"`, expected length `1`.
- Add an assertion that `invoke_agent` is NOT in the built-in registry
  (mirroring the task-tracking assertion at `builtin-registry.test.ts:15-22`).
- Update the comment at `builtin-registry.test.ts:6-10` to reflect Phase 4.

#### 5.5 `src/runtime/tools/filter.ts:9-27` — leave untouched

The `ORCHESTRATION_TOOLS` allowlist contains `"invoke_agent"` as a bare
name at line 10. Since the extension publishes the tool under the bare
name (Frozen decision), the filter keeps working unchanged. **Audit
confirmed: no change needed.**

#### 5.6 `src/runtime/orchestrator-prompt.ts:12,72,137` — leave untouched

The system prompts reference `invoke_agent` by literal name. Since the
tool retains its bare name under the extension, no prompt change is
needed. **Audit confirmed: no change needed.**

#### 5.7 `src/runtime/executor.ts:1079,1099` — leave untouched

The event-suppression special-case matches on literal `toolName === "invoke_agent"`.
The extension-wrapped tool emits the same literal name through the
dispatcher. **Audit confirmed: no change needed.**

### 6. Data migration: none

`invoke_agent` has no persistent state today. No migration helper. No
sentinel. No backup rows. Omitting storage entirely is the simplest
possible port.

### 7. Test migration

Three layers, same pattern as Phase 3 §8.

#### 7.1 Unit / in-process — `orchestration-extension.test.ts` (NEW)

Replaces `src/__tests__/invoke-agent-tool.test.ts` (delete original).
Imports the extension handler directly. Uses
`_setAgentConfigsForTests` / `_setSpawnForTests` to inject fakes.

All cases in `invoke-agent-tool.test.ts` port 1:1 with substitutions:
- Construction: `createInvokeAgentTool({...})` → call
  `tools.invokeAgent.execute(args)` directly.
- Bus assertions (`bus.on("agent:spawn", ...)`) → replaced by asserting
  on `fakeSpawn.calls` (the Phase 2d RPC shape).
- Sub-conversation reuse test → verify `fakeSpawn` was called with
  `reuseSubConversationFor: agentConfigId`.
- Timeout test → drive the fake spawn to never emit
  `task:assignment_update`, assert the handler times out cleanly.
- `_agentMeta` test → assert on the tool-result `details`.

Tests for the override cascade (model / provider / systemPromptAppend /
permissionMode / toolRestriction / allowedTools / deniedTools / modeId):
move to the handler test here. The host-side merge (executor → handler)
is retained — the executor injects the overrides onto `ctx.invocationMetadata`
before calling; the handler forwards onto `spawnAssignment`.

#### 7.2 Bundled-install — `orchestration-bundled-install.test.ts` (NEW)

Template: `scratchpad-bundled-install.test.ts`.

- `ensureBundledExtensions()` creates a row for `orchestration` with the
  expected permission block.
- The permission block matches the manifest (`agentConfig: "read"`,
  `spawnAgents: {maxPerHour: 500, maxConcurrent: 25}`,
  `eventSubscriptions: ["task:assignment_update"]`).
- Running twice is a no-op (idempotent).
- No storage rows are touched (the extension has none).

#### 7.3 In-subprocess integration — `orchestration-extension.integration.test.ts` (NEW)

Template: `task-tracking-extension.integration.test.ts`.

- Spawn the extension subprocess.
- Wire it to a test conversation.
- Invoke `invoke_agent` via `ExtensionRegistry` with a stubbed
  `spawnAssignment` RPC that immediately emits a synthetic
  `task:assignment_update` with `status: "completed"` and a preset
  `resultPreview`.
- Assert the tool-result text equals the stub's resultPreview.
- Assert the `_agentMeta.subConversationId` equals the handle's
  subConversationId.
- Emit the same event for an assignmentId the extension doesn't own —
  assert the handler is a no-op (guard at §4.2).

#### 7.4 End-to-end — `orchestration-e2e.test.ts` (NEW)

Template: `task-tracking-e2e.test.ts`.

- Full executor → orchestration-host.ensureOrchestrationWired → extension →
  spawnAssignment → run:complete round-trip against a simulated sub-agent.
- Ports the `executor-agent-wiring.test.ts` assertions that today check
  tool injection, depth-gate, filter preservation, and
  `agent:spawn`/`agent:complete` suppression.
- Port the `team-tool-scope-integration.test.ts` assertions for
  team-scope cascade (via the new `teamToolScope` SDK field).
- Port the sentinel-resolution assertions from `current-model-e2e.test.ts`
  (these are shared — they also cover task-tracking; the assertion on
  `invoke_agent` moves here).

#### 7.5 Tests that port unchanged (name stays `invoke_agent`)

- `src/runtime/orchestrator-prompt.test.ts` — checks system prompt
  mentions `invoke_agent`. Text unchanged → passes without edit.
- `src/runtime/orchestrator-prompt-task.test.ts` — same.
- `src/runtime/apply-tool-filters.test.ts` — checks
  `ORCHESTRATION_TOOLS` preserves `invoke_agent` under restrictive
  filters. Same string, same set, same assertions. Passes unchanged.
- `web/e2e/team-orchestration.spec.ts` — behavioral Playwright test.
  Should pass unchanged (tool name is the contract; wiring is
  transparent).

---

## Files touched

### New

| File | Purpose |
|---|---|
| `docs/extensions/examples/orchestration/ezcorp.config.ts` | Extension manifest — single `invoke_agent` tool. |
| `docs/extensions/examples/orchestration/index.ts` | `invokeAgent` handler + `task:assignment_update` subscription. |
| `src/runtime/orchestration-host.ts` | `ensureOrchestrationWired`, `wireOrchestrationToolsForTurn` helpers + per-turn schema override. |
| `src/extensions/cancel-run-handler.ts` | `ezcorp/cancel-run` reverse-RPC handler for timeout/abort (§5.3). |
| `packages/@ezcorp/sdk/src/runtime/cancel-run.ts` | SDK wrapper for `cancelRun(agentRunId)` (§5.3). |
| `src/__tests__/orchestration-extension.test.ts` | Unit tests (replaces `invoke-agent-tool.test.ts`). |
| `src/__tests__/orchestration-bundled-install.test.ts` | Bundled-install regression. |
| `src/__tests__/orchestration-extension.integration.test.ts` | In-subprocess integration. |
| `src/__tests__/orchestration-e2e.test.ts` | End-to-end executor + extension + spawn. |
| `src/__tests__/cancel-run-handler.test.ts` | Unit tests for the new RPC. |

### Changed

| File | Change |
|---|---|
| `src/extensions/bundled.ts` | Add `orchestration` entry with permission block. |
| `src/runtime/executor.ts` | DELETE lines 779-794 (the `createInvokeAgentTool` injection). Insert the `ensureOrchestrationWired` + `wireOrchestrationToolsForTurn` block at the same site. Leave lines 1079,1099 event-suppression unchanged. Leave auto-spin-up at 898-926 unchanged. |
| `src/runtime/tools/builtin-registry.ts` | Drop `invoke_agent` entry; update header comments to reflect Phase 4. |
| `src/extensions/tool-executor.ts` | §5.1a — extend `extensionToAgentTool` (4-arg → 6-arg, optional) with `schemaOverride?` + `invocationMetadata?`. Extend `executeToolCall` to forward metadata into the extension subprocess RPC payload. Back-compat: all existing callers use the 4-arg form. |
| `src/extensions/spawn-assignment-handler.ts` | Accept new `SpawnAssignmentInput` fields: `reuseSubConversationFor`, `parentMessageId`, `overrides`, `teamToolScope`, `orchestrationDepth`. Forward onto `startAssignment`. |
| `packages/@ezcorp/sdk/src/runtime/spawn.ts` | Extend `SpawnAssignmentInput` interface (additive only — no breaking change). |
| `packages/@ezcorp/sdk/src/runtime/tool-handler.ts` (or `tool-context.ts`) | §5.1a — add optional `invocationMetadata?: Record<string, unknown>` to `ToolHandlerContext`. Additive. |
| `src/__tests__/builtin-registry.test.ts` | Expected tool count 2 → 1; add `invoke_agent`-not-present assertion. |
| `src/__tests__/executor-agent-wiring.test.ts` | Retarget injection assertions to the extension path (the `agentTools.find(t => t.name === "invoke_agent")` still works; the `await import("./tools/invoke-agent")` assertion becomes `await import("./orchestration-host")`). |
| `src/__tests__/helpers/mock-cleanup.ts` | Remove `"../runtime/tools/invoke-agent"` entry from `MOCKED_MODULES`. |
| `src/__tests__/team-tool-scope-integration.test.ts` | Update `mock.module` paths. |
| `src/__tests__/current-model-e2e.test.ts` | File retained. Retarget ONLY the invoke-agent-branch tests (imports + module mocks) to the new orchestration extension handler. Task-tracking-branch tests are not touched. No test is deleted; no test is moved to a different file. |

### Deleted

| File | Why |
|---|---|
| `src/runtime/tools/invoke-agent.ts` | Replaced by the extension. |
| `src/__tests__/invoke-agent-tool.test.ts` | Rewritten as `orchestration-extension.test.ts`. |

### Reference (read-only)

| File | Why |
|---|---|
| `docs/extensions/examples/{scratchpad,task-tracking}/{ezcorp.config.ts,index.ts}` | Canonical bundled-extension templates. |
| `src/__tests__/task-tracking-*.test.ts` | Three-layer test pattern. |
| `src/extensions/spawn-assignment-handler.ts` | Phase 2d handler — site of new field additions. |
| `src/extensions/event-subscription-dispatcher.ts` | Phase 2c delivery contract. |
| `src/runtime/sse-conversation-filter.ts` | `DIRECT_CARRIER_EVENT_TYPES` allowlist. |
| `packages/@ezcorp/sdk/src/runtime/spawn.ts` | SDK surface to extend. |
| `.planning/phase-2d-plan.md` | `spawnAssignment` contract. |
| `.planning/phase-3-plan.md` | Bridge + wire-on-first-use templates. |
| `src/runtime/orchestrator-prompt.ts` | Durable `invoke_agent` string references — do NOT change. |
| `src/runtime/tools/filter.ts` | `ORCHESTRATION_TOOLS` allowlist — do NOT change. |

---

## Test inventory

| File | Tests | Phase 4 action |
|---|---|---|
| `src/__tests__/invoke-agent-tool.test.ts` | ~10 | Rewrite as `orchestration-extension.test.ts` (delete original). |
| `src/__tests__/executor-agent-wiring.test.ts` | ~15 (wiring, filter, depth-gate, event suppression) | Port assertions; module-import retarget. |
| `src/__tests__/team-tool-scope-integration.test.ts` | ~6 | `mock.module` retarget; assertions unchanged. |
| `src/__tests__/current-model-e2e.test.ts` | ~4 (split between invoke-agent and task-tracking) | File retained. Retarget only the invoke-agent-branch tests; task-tracking-branch tests unchanged. |
| `src/__tests__/orchestrator-prompt.test.ts` | N | No change (tool-name string still matches). |
| `src/__tests__/orchestrator-prompt-task.test.ts` | N | No change. |
| `src/__tests__/apply-tool-filters.test.ts` | N | No change. |
| `src/__tests__/builtin-registry.test.ts` | 5 | Update expected count + add assertion. |
| NEW `src/__tests__/orchestration-extension.test.ts` | ~12 | Phase 4 addition — supersedes invoke-agent-tool.test.ts |
| NEW `src/__tests__/orchestration-bundled-install.test.ts` | ~4 | Phase 4 addition |
| NEW `src/__tests__/orchestration-extension.integration.test.ts` | ~4 | Phase 4 addition |
| NEW `src/__tests__/orchestration-e2e.test.ts` | ~10 | Phase 4 addition |
| NEW `src/__tests__/cancel-run-handler.test.ts` | ~4 | Phase 4 addition (the new RPC). One case asserts slot-release (§5.3): spawn to cap, cancel one, next spawn succeeds. |
| `src/__tests__/tool-executor.test.ts` (extend) | +3 | Phase 4 addition — assert `schemaOverride` precedence and `invocationMetadata` forwarding through the 6-arg `extensionToAgentTool` / `executeToolCall` path (§5.1a). Existing cases unchanged. |

---

## Verification (exit criteria)

Every bullet must be green before merge.

1. `bun test src/__tests__/orchestration-extension.test.ts` — unit tests for the handler (including all override-cascade cases, reuse-sub-conversation, timeout, error shape, _agentMeta).
2. `bun test src/__tests__/orchestration-bundled-install.test.ts` — bundled-install regression green (permission block, idempotency).
3. `bun test src/__tests__/orchestration-extension.integration.test.ts` — real subprocess round-trip, event-delivery latency within 500ms.
4. `bun test src/__tests__/orchestration-e2e.test.ts` — end-to-end executor + extension + spawnAssignment.
5. `bun test src/__tests__/executor-agent-wiring.test.ts` — green after retargeting (tool injection, filter preservation, depth-gate, event-suppression).
6. `bun test src/__tests__/team-tool-scope-integration.test.ts` — green after retargeting (team-scope cascade via the new SDK fields).
7. `bun test src/__tests__/current-model-e2e.test.ts` — sentinel resolution still works for the invoke-agent branch (depends on `spawn-assignment-handler.ts` propagating the sentinel — verify at commit 3).
8. `bun test src/__tests__/cancel-run-handler.test.ts` — new RPC handler tests green, including the slot-release case from §5.3.
8a. `bun test src/__tests__/tool-executor.test.ts` — §5.1a seam tests green: `schemaOverride` replaces the manifest schema; `invocationMetadata` reaches the handler ctx; 4-arg callers (scratchpad, task-tracking) still work.
9. `bun test src/__tests__/builtin-registry.test.ts` — updated expectations green.
10. `bun test src/__tests__/orchestrator-prompt.test.ts src/__tests__/orchestrator-prompt-task.test.ts src/__tests__/apply-tool-filters.test.ts` — unchanged; green without edit.
11. Phase 1+2+3 regression: `bun test src/__tests__/{scratchpad-bundled-install,scratchpad-extension.integration,scratchpad-e2e,task-tracking-extension,task-tracking-bundled-install,task-tracking-extension.integration,task-tracking-e2e,capability-permissions,sse-conversation-filter,event-subscription-dispatcher,event-subscription.integration,emit-task-event-handler,emit-task-event.integration,agent-configs-handler,spawn-quota,spawn-assignment-handler}.test.ts` — still green.
12. Full suite: `bun test` (in batched mode — Phase 3 documented the per-file mock-cache limitation) — passes. No orphaned references to `./tools/invoke-agent`.
13. Grep invariants: `rg "runtime/tools/invoke-agent" src web` returns **zero** hits. `rg "createInvokeAgentTool" src web` returns **zero** hits. `rg "invoke_agent" src web` returns hits ONLY in: (a) system prompts in `orchestrator-prompt.ts`, (b) filter allowlist in `filter.ts`, (c) executor event-suppression in `executor.ts:1079,1099`, (d) extension manifest + handler, (e) tests that assert on the literal name (via `agentTools.find`).
14. Manual: boot the server fresh. Confirm the `orchestration` extension row exists in `extensions` table with the expected permission block.
15. Manual: send a message `@agent-name do X` in a conversation. Confirm the agent is invoked and the response lands in chat. Confirm the sub-conversation appears in the sidebar with the agent's name.
16. Manual: trigger an auto-spin-up (mention 2+ agents in a team with `autoSpinUp: true`). Confirm all members invoke in parallel and their outputs synthesize into the team response.
17. Manual: send an agent task whose prompt includes "use the scratchpad to store …" — confirm scratchpad interop still works (the extensions are disjoint; this is a regression check).
18. Manual: kill-switch. `EZCORP_DISABLE_CAPABILITY_TOOLS=1 bun run dev` → every `invoke_agent` call returns a permission error. The parent turn surfaces it. Acceptable emergency-switch behavior.

---

## Open design notes (resolve during execution)

Judgment calls where the right answer depends on what the code reads like.

- **`ezcorp/cancel-run` RPC surface.** §5.3 adds a new narrow RPC. Shape
  during execution: (a) one-arg `cancelRun(agentRunId: string)` returning
  `{ cancelled: boolean }`, OR (b) fire-and-forget notification
  `cancelRun(agentRunId)` with no response. Lean toward (a) — the
  extension's timeout path benefits from knowing whether the host
  actually had the run to cancel. Permission model: reuse `spawnAgents`;
  caller must own the `agentRunId` (checked against the spawn-quota
  module's per-extension Set). Audit row `SPAWN_CANCELLED` with
  `reason: "timeout" | "abort"`.
- **`reuseSubConversationFor` vs new `agent-thread` semantics.** Today's
  `invoke-agent.ts:100-117` reuses by `(parentConversationId, agentConfigId)`.
  An extension future-proofs by keying on a caller-supplied "thread id"
  so multiple independent threads of the same agent can exist in one
  conversation. For Phase 4, port the existing keying semantics exactly —
  don't accidentally expand the contract. The field name
  `reuseSubConversationFor: string` (value = `agentConfigId`) makes the
  narrow semantics visible.
- **Two-hop bridge self-loop (cross-extension).** The orchestration
  extension subscribes to `task:assignment_update`. Task-tracking emits
  this event when its own assignments transition. The orchestration
  handler bails on `!pending` — but verify via an integration-test
  assertion that spam on unrelated `assignmentId`s doesn't cause memory
  leaks or audit amplification.
- **Rate-limit ceiling (500/hour, 25 concurrent).** A guess. Observe
  `SPAWN_QUOTA_EXCEEDED` audit rows in the first week on main. Team-
  orchestration auto-spin-up is the most likely ceiling-hitter.
- **Timeout as tool-result vs RPC error.** If the sub-run times out, the
  extension emits a `task:assignment_update` with `failed` OR just
  resolves the gate locally and returns an error tool-result. Leaning
  toward local-resolve: the sub-run continues to run in the background
  and may eventually emit its own `failed` — we want the LLM to see the
  timeout as a failed tool call, not a second post-hoc one. The cancel
  path in §5.3 is what ensures the sub-run actually stops.
- **Auto-spin-up timeout semantics.** `executor.ts:904-918` uses
  `Promise.allSettled` with no external timeout — each `invoke_agent`
  call enforces its own 60s. Under the extension, the auto-spin-up loop
  still works because it calls the wrapper tool. But note: 8 parallel
  invocations × 60s = up to 60s on the critical path (they race the
  same wall clock). No behavior change — same ceiling as today. Verify
  no test breaks because of the extra hop's latency.
- **Sub-conversation lifecycle on extension-driven spawn.** Phase 2d's
  `spawn-assignment-handler.ts` copies parent `conversation_extensions`
  rows into the new sub-conversation. Check that **the orchestration
  extension itself** is in that copied set (via the wire-on-first-use
  helper running before the spawn). If not, depth-2 chains silently
  lose orchestration-tool access. Fix: `ensureOrchestrationWired` must
  run at both parent AND sub-conversation — or, simpler, the bundled-
  install path auto-wires every new conversation at creation time.
  Lean toward: wire in `ensureOrchestrationWired` before the spawn
  dispatches, and trust the copy-down to carry the orchestration row
  into the sub-conversation for any depth-2 nested invoke.
- **`ask_human` Phase 5 shape.** The §Frozen decision defers, but the
  two plausible designs are:
    - (a) Extend Phase 2c's `DIRECT_CARRIER_EVENT_TYPES` to include
      `orchestrator:human_response` — requires a payload-shape change
      in `src/types.ts:286-289` (add `conversationId` — breaking the
      emitter at `web/src/routes/api/orchestrator/human-input/+server.ts:10-11`
      and its caller at `ask-human.ts:34-35`). Then `ask_human`'s
      extension port uses the same two-hop bridge as everything else.
    - (b) Add a bidirectional request/response RPC
      `ezcorp/ask-human-request` → the host opens a gate, notifies the
      UI via the existing `orchestrator:human_input` event, and on user
      reply the host resolves the gate and returns the RPC response.
      This is an **RPC that blocks for up to 5 minutes** — the same
      anti-pattern Phase 2d rejected, but with a justification (human
      latency is the bottleneck, not compute).
  Both are valid Phase 5 designs. Don't decide now. Leave both on the
  table and pick based on whether Phase 5 needs other `orchestrator:*`
  events to become direct-carriers (which would tip toward (a)).

---

## Out of scope (defer)

- Porting `ask_human` to the `orchestration` extension — deferred to
  Phase 5 per the §Frozen decision on scope.
- Extending Phase 2c's `DIRECT_CARRIER_EVENT_TYPES` allowlist to include
  `orchestrator:human_response` or `agent:complete` — Phase 5's call.
- A bidirectional request/response RPC pattern (Phase 5 Open design
  notes option (b)).
- Team-share conversation scoping (same deferral as Phase 2a-lite,
  `.planning/phase-2a-plan.md` and Phase 3 §Out of scope).
- Splitting `task-dependencies.ts` into a `@ezcorp/task-core` workspace
  package — still blocked on a second in-workspace consumer (Phase 3
  §Out of scope).
- A "legacy compatibility" code path that re-routes `invoke_agent` tool
  calls to the deleted built-in — big-bang is the explicit choice.
- Renaming `invoke_agent` to a namespaced form
  (`orchestration__invoke_agent`) — Frozen decision forbids this.
- Admin UI for live-inspecting the orchestration extension's in-memory
  pending-invocation map (dev tool only; not a product feature).
- A feature-flag gate (`EZCORP_INVOKE_AGENT_EXT=1`) — Frozen decision
  forbids; big-bang.
- Expanding `spawnAssignment` to support arbitrary host tool-filter
  resolution (the `overrides` surface is deliberately narrow; anything
  not already in `TeamMemberOverrides` stays host-only).
- A `Phase 6` breakout extension for workflow-scheduling tools — not in
  the 5-phase roadmap.

---

## Rollback

Single commit revert of the merge commit. Because Phase 4 ships as ~5
commits but merges as one PR, the revert is atomic.

- **No schema migrations.** The extension has no storage; no `extension_storage`
  rows to rehome on revert.
- **No storage migration sentinel** to worry about — contrast with Phase 3
  which had `__tasks_pre_migration` backup rows.
- **Audit rows** for the bundled install + capability grants are
  orphaned on revert but harmless (harmless-orphan pattern proven by
  Phase 1 and 3).
- **New `conversation_extensions` rows** for the `orchestration` extension
  are orphaned on revert (they reference a no-longer-existing row).
  Harmless — the executor's wiring loop ignores unknown extension ids.
- **`EZCORP_DISABLE_CAPABILITY_TOOLS=1`** is the soft-kill. With the flag
  set, `invoke_agent` becomes non-functional (the handler's spawn + subscribe
  both fail through the capability gate). Not a graceful degradation —
  the parent turn's LLM will see a permission error on every `invoke_agent`
  call. If production surfaces a bug in the extension but not in the
  built-in, flip the flag AND revert. Don't rely on the flag alone.

Rollback checklist:
1. Flip `EZCORP_DISABLE_CAPABILITY_TOOLS=1` in prod. Users see `invoke_agent`
   errors until step 2 is live.
2. Revert the merge commit. CI green. Deploy.
3. Clear `EZCORP_DISABLE_CAPABILITY_TOOLS=1`.

No data loss is possible — `invoke_agent` has no persistent state to
restore. Sub-conversations created by the extension during the bad
window persist in the `conversations` table; they're parented correctly
and remain visible in history.

---

## Ship order within Phase 4

Five commits, each independently revertable. Each commit leaves the
tree buildable + tests green (the tests that belong to that commit's
scope — the full suite stays green only after commit 5).

- **Commit 1 — SDK + handler extensions (spawn + tool-executor seams).**
  Two additive SDK-surface changes bundled because both are prerequisite
  for commit 3's handler tests.
  (a) **`SpawnAssignmentInput`**: adds the 5 new optional fields to
  `packages/@ezcorp/sdk/src/runtime/spawn.ts`. Teaches
  `src/extensions/spawn-assignment-handler.ts` to accept and forward
  them. Adds `reuseSubConversationFor` branching (query
  `getSubConversations`, reuse id when match). Extends
  `spawn-assignment-handler.test.ts` with 5 new tests (one per new
  field).
  (b) **`extensionToAgentTool` + `executeToolCall` plumbing** (§5.1a):
  extends `src/extensions/tool-executor.ts` with optional
  `schemaOverride?` + `invocationMetadata?` params — 4-arg callers
  unchanged. Adds `invocationMetadata?` to `ToolHandlerContext` in
  `packages/@ezcorp/sdk/src/runtime/tool-handler.ts` (or new
  `tool-context.ts`). Extends `tool-executor.test.ts` with 3 new
  cases: schemaOverride replaces the static schema; metadata forwards
  to the handler ctx; absent-metadata caller still works.
  **No extension yet; built-in path UNCHANGED.**
  Verification: `bun test src/__tests__/spawn-assignment-handler.test.ts
  src/__tests__/tool-executor.test.ts
  packages/@ezcorp/sdk/test/spawn.test.ts`. 2d regression green.

- **Commit 2 — `ezcorp/cancel-run` RPC.** Adds
  `src/extensions/cancel-run-handler.ts` + SDK wrapper at
  `packages/@ezcorp/sdk/src/runtime/cancel-run.ts` + barrel export. Wires
  permission check to `spawnAgents` + per-extension run-ownership gate
  (reuses `spawn-quota`'s existing `Set<agentRunId>`). Adds
  `cancel-run-handler.test.ts` (~4 tests: happy path, not-my-run,
  missing-run, permission-denied). **No extension yet.**
  Verification: new handler tests green; existing cancel-run sites
  (executor.ts `cancelRun` direct callers) unchanged.

- **Commit 3 — Extension scaffold + handler + subscription.** Adds
  `docs/extensions/examples/orchestration/{ezcorp.config.ts,index.ts}`.
  Adds `src/__tests__/orchestration-extension.test.ts` (the
  replacement for invoke-agent-tool.test.ts; ~12 tests against the
  extension's tool handler with fake spawn/events).
  **Extension NOT yet bundled; built-in path UNCHANGED.**
  Verification: `bun test src/__tests__/orchestration-extension.test.ts`.
  Adapt if §5.2's `overrides` pass-through shape shifted during commit 1.

- **Commit 4 — Subprocess integration + wire-on-first-use helper.** Adds
  `src/runtime/orchestration-host.ts` with `ensureOrchestrationWired`
  and `wireOrchestrationToolsForTurn`. Adds
  `src/__tests__/orchestration-extension.integration.test.ts` (real
  subprocess, stubbed spawn, synthetic task:assignment_update). Adds
  `src/__tests__/orchestration-bundled-install.test.ts`. **Extension
  bundled via `src/extensions/bundled.ts` — but built-in path still
  exists. Dual-wired: `executor.ts` still hosts `createInvokeAgentTool`;
  the extension is installed but its tool is not injected into turns.**
  Verification: the two new test files green + Phase 3 regression green.
  This commit is the safety net — if CI turns red after commit 5's
  big-bang cutover, revert just commit 5 and leave the extension
  installed-but-dormant for forensics.

- **Commit 5 — Big-bang cutover.** **Deletes**
  `src/runtime/tools/invoke-agent.ts`. Rewrites
  `src/runtime/executor.ts:779-794` to call
  `wireOrchestrationToolsForTurn` instead of `createInvokeAgentTool`.
  Trims `src/runtime/tools/builtin-registry.ts` down to 1 entry (just
  `ask_human`). Updates `src/__tests__/builtin-registry.test.ts`,
  `executor-agent-wiring.test.ts`, `team-tool-scope-integration.test.ts`,
  `current-model-e2e.test.ts`, `mock-cleanup.ts`. Deletes
  `invoke-agent-tool.test.ts`. Adds `orchestration-e2e.test.ts`.
  Verification: **full `bun test` suite green**. Grep invariants
  (§Verification bullet 13) pass.

Soak 2 weeks on main before Phase 5 (`ask_human` port + `orchestrator:human_response`
bridge design) or any subsequent orchestration feature work. Phase 4 is
smaller in churn than Phase 3 but lives on the hottest path in the
codebase (every team turn exercises it), so soak is non-negotiable.

---

## Ship log (post-hoc, 2026-04-21)

The phase landed in **11 commits** covering plan §Ship order's 5 commit
units plus mid-flight coverage fills, TS fixes, and a post-cutover
audit-test gap. The §Ship order framed the shape correctly; the actual
commit granularity was finer because validation agents flagged coverage
holes inside each unit that we chose to fix in their own commits rather
than amend.

### Phase 4 proper (11 commits)

| Commit  | Scope                                                                                                |
|---------|------------------------------------------------------------------------------------------------------|
| `9dad696` | **commit-1** — SDK + tool-executor seams: extend `SpawnAssignmentInput` with `overrides` / `teamToolScope` / `orchestrationDepth` / `parentMessageId` / `reuseSubConversationId`; add the `invocationMetadata` carrier to `extensionToAgentTool` (the 6-arg seam). `ToolHandlerContext` didn't exist pre-phase — introduced in this commit. |
| `62d3824` | **commit-1-cov** — Coverage fill: invocationMetadata round-trip + start-assignment plumbing. Not in the original ship order; validation found the new seams had no dedicated tests. |
| `8f8cbcf` | **commit-1-fix** — `AssignmentStatus` type-fix in a plumbing test (used a literal the union didn't include). |
| `10edf8b` | **commit-2** — `ezcorp/cancel-run` reverse RPC with slot-release semantics on `SpawnQuota`. Added an `isOwner` seam on `SpawnQuota` rather than leaking the internal tracking Map, per validation feedback. |
| `c468376` | **commit-2-cov** — Coverage fill: cancel-run round-trip + audit-event shape assertions. |
| `a8912e3` | **commit-2-fix** — Add `SPAWN_CANCELLED` to the exhaustive audit-actions test (it enumerates every action literal). Discovered only by the post-commit full-suite run. |
| `26b336f` | **commit-3** — Orchestration bundled-extension scaffold with `invoke_agent` handler + `task:assignment_update` subscription + 15-test unit suite. Extension code only; not yet bundled or wired. |
| `74d4100` | **commit-4a** — `src/runtime/orchestration-host.ts` wire helpers (`ensureOrchestrationWired` / `wireOrchestrationToolsForTurn`) + `orchestration` entry in `BUNDLED_EXTENSIONS`. Dual-wired — extension installed but executor still uses the built-in. |
| `ec19f0c` | **commit-4b** — Subprocess-integration test (real subprocess, stubbed spawn, synthetic assignment_update). |
| `4f4212a` | **commit-5** — Big-bang cutover. **Deletes** `src/runtime/tools/invoke-agent.ts` and `createInvokeAgentTool`. Rewrites `src/runtime/executor.ts` to call `wireOrchestrationToolsForTurn` through the wire-on-first-use pattern. Trims `builtin-registry.ts` down to `ask_human` only. |
| `a97b84a` | **commit-5-fix** — 6 TypeScript errors in the big-bang cutover (surfaced by `bun tsc` after the delete). |
| `7815724` | **test(phase-4)** — Cover orchestration wire-failure catch branch in `executor.ts:810-814` (coverage gap #1 from post-ship audit). |
| `eeda6e3` | **test(phase-4)** — Cover non-terminal status no-op branch in `orchestration/index.ts:246` subscription (coverage gap #2 from post-ship audit). |

### Plan vs reality

- **Plan §Ship order called for 5 commits; shipped as 11** — the
  expansion came from coverage-fill commits (`62d3824`, `c468376`),
  TypeScript fixes surfaced after the cutover (`8f8cbcf`, `a97b84a`),
  the audit-test gap discovered by a post-commit full-suite run
  (`a8912e3`), and two post-audit coverage fills for executor
  wire-failure + orchestration non-terminal subscription branches
  (`7815724`, `eeda6e3`).
- **Deviations from the plan's signatures / shapes**:
  - `ToolHandlerContext` didn't exist pre-phase — the plan assumed
    it was already available as the extensionToAgentTool context
    bag. Created it in commit-1 alongside the `invocationMetadata`
    carrier.
  - The plan pointed at `tool-executor.test.ts` for the
    `extensionToAgentTool` unit coverage; that file doesn't exist —
    the seam tests live in `ext-registry-executor.test.ts` and that's
    where commit-1-cov added coverage.
  - `startAssignment` didn't accept `overrides` / `teamToolScope` /
    `orchestrationDepth` / `parentMessageId` / `reuseSubConversationId`
    at phase start — added additively in commit-1.
  - `SpawnQuota`'s cancel-run slot-release path: plan suggested
    exposing internals; shipped an `isOwner(runId, userId)` seam
    instead, keeping the internal Map private.
  - `helpers/mock-cleanup.ts` had no `invoke-agent` entry at phase
    start — the plan called for removing it, which was a no-op.
  - `team-tool-scope-integration.test.ts` didn't actually import from
    the soon-to-be-deleted built-in path — the plan's edit to this
    file was a no-op.
  - `memberOverrides` flattened from `Map<string, TeamMemberOverrides>`
    to `Record<string, TeamMemberOverrides>` at the
    `wireOrchestrationToolsForTurn` seam (the extension sees JSON,
    not Map) — done via `Object.fromEntries` at the call site.
  - **`BUNDLED_INSTALLED` audit rows for orchestration**: validation
    found zero rows in the audit table. Not a regression — the audit
    writer only persists rows for `{network, filesystem, shell, env,
    storage}` perms and `orchestration` declares none. The plan's
    audit-row language was over-stated; no code change needed.
- **Additions beyond the plan**:
  - Coverage-fill commits (`62d3824`, `c468376`, `7815724`, `eeda6e3`)
    — not originally planned at this granularity; added in response
    to validation agent findings.
  - `ezcorp/cancel-run`'s slot-release integration-test assertion
    was extended to verify the quota drops to zero on explicit
    cancel (not just on natural run completion).
  - §5.1a `invocationMetadata` seam was promoted from the Open-design
    notes to a Frozen decision during the plan amendments — it
    became the only carrier shape for per-turn metadata crossing the
    host→extension boundary.

### Final verification (matches §Verification)

- Full Phase 4 test suite: **363 pass / 0 fail** across 21 files
  (`orchestration-extension.test.ts`, `orchestration-bundled-install.test.ts`,
  `orchestration-extension.integration.test.ts`, `orchestration-e2e.test.ts`,
  `executor-agent-wiring.test.ts`, `ext-registry-executor.test.ts`,
  `cancel-run-handler.test.ts`, `start-assignment-flow.test.ts`,
  `extension-audit-actions.test.ts`, and the touched-file
  regression set). Coverage audit: **45/45 branches** after
  Tasks 1 + 2 land (was 43/45 during audit; the two gaps were
  executor wire-failure catch + orchestration non-terminal
  subscription no-op).
- Phase 1/2/3 regression sweep: **89/89** on the task-tracking
  surface + **111 pass** on the scratchpad / capability-permission /
  emit-task-event / agent-configs / event-subscription surface
  (3 pre-existing failures in `emit-task-event-handler.test.ts`
  noted by the validation agent as predating Phase 4 — unchanged
  by this phase).
- Grep invariants:
  - `rg "runtime/tools/invoke-agent" src web` → **0 source hits**.
  - `rg "createInvokeAgentTool" src web` → **0 source hits**.
  - `rg "invoke_agent" src web` → only in allowlisted locations
    (orchestration extension body, orchestration-host wire helpers,
    filter allowlist, test assertions, documentation).
- Manual verification bullets 14–18 (§Verification): **all PASS**.

### What this unblocks

Phase 5 (`ask_human` port to a bundled extension + the
`orchestrator:human_response` direct-carrier expansion — see the
Phase 5 plan for the full bridge design). The 2-week soak on main
starts from the last Phase 4 commit landed on main. The built-in
registry is now a 1-entry file (`ask_human`); after Phase 5 it
disappears entirely and the migration's 5-phase arc closes.
