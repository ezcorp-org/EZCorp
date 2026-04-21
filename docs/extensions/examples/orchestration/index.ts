#!/usr/bin/env bun
// orchestration — multi-agent orchestration primitives extension.
//
// Phase 4 §1-§4: provides `invoke_agent` as a bundled extension, porting
// the legacy built-in formerly at src/runtime/tools/invoke-agent.ts
// (deleted in commit 5). The handler dispatches via the Phase 2d
// `spawnAssignment` reverse-RPC and bridges the async handle into the
// synchronous-to-the-LLM tool return via a `task:assignment_update`
// subscription (Phase 2c / same two-hop pattern the task-tracking
// extension shipped in Phase 3).
//
// Phase 5 §1-§3: adds `ask_human` as the extension's second tool. Same
// two-hop bridge pattern — emit `orchestrator:human_input` on call, then
// open a promise gate keyed on `requestId` and resolve it when the
// host's POST endpoint emits `orchestrator:human_response` on user
// reply. The extension subscribes to that event via Phase 2c's
// `registerEventHandler`; the gate's `conversationId` is double-checked
// on receipt to close the UUID-guess attack surface (§5.3 of the plan).
//
// Permission contract: requires `agentConfig: "read"`,
// `spawnAgents: { maxPerHour, maxConcurrent }`, and
// `eventSubscriptions: ["task:assignment_update", "orchestrator:human_response"]`.
// No storage — neither tool has persistent state. Pending invocations +
// human-input gates live in process-local maps keyed on `assignmentId`
// / `requestId`; the subprocess is `persistent: true` so both maps
// survive across calls.

import {
  createToolDispatcher,
  getChannel,
  AgentConfigs,
  registerEventHandler,
  spawnAssignment,
  toolResult,
  type SpawnAssignmentInput,
  type SpawnAssignmentHandle,
  type ToolHandler,
  type ToolHandlerContext,
} from "@ezcorp/sdk/runtime";

// ── Capability bindings (swappable for tests) ──────────────────────

interface AgentConfigsLike {
  list(): Promise<
    Array<{ id: string; name: string; description: string; isTeam: boolean; ownerUserId: string | null }>
  >;
  resolve(
    idOrName: string,
  ): Promise<{ id: string; name: string; description: string; isTeam: boolean; ownerUserId: string | null } | null>;
}

type SpawnFn = (input: SpawnAssignmentInput) => Promise<SpawnAssignmentHandle>;
type RegisterEventHandlerFn = typeof registerEventHandler;

// Host-emit RPC injection. Production path: delegate to
// `getChannel().request("ezcorp/emit-task-event", ...)` with a payload
// shaped as `{ v: 1, type: "orchestrator:human_input", payload: {...} }`.
// The host's `task-events-handler` gained a branch for this type in
// Phase 5 (see `src/extensions/task-events-handler.ts` — comment block
// "Phase 5 widened scope"). Tests swap in an in-memory fake.
type EmitHumanInputFn = (payload: {
  runId: string;
  conversationId: string;
  question: string;
  requestId: string;
}) => Promise<void>;

async function defaultEmitHumanInput(payload: {
  runId: string;
  conversationId: string;
  question: string;
  requestId: string;
}): Promise<void> {
  await getChannel().request<{ ok: true }>("ezcorp/emit-task-event", {
    v: 1,
    type: "orchestrator:human_input",
    payload,
  });
}

let agentConfigs: AgentConfigsLike = new AgentConfigs();
let spawn: SpawnFn = spawnAssignment;
let registerEventHandlerImpl: RegisterEventHandlerFn = registerEventHandler;
let emitHumanInput: EmitHumanInputFn = defaultEmitHumanInput;

/** Test-only: inject a fake AgentConfigs resolver. */
export function _setAgentConfigsForTests(fake: AgentConfigsLike): void {
  agentConfigs = fake;
}
/** Test-only: inject a fake spawnAssignment. */
export function _setSpawnForTests(fake: SpawnFn): void {
  spawn = fake;
}
/** Test-only: inject a fake registerEventHandler. Defaults to the SDK's
 *  real implementation, which opens the channel; tests that want to
 *  drive the subscription manually (via `_internals.handleAssignmentUpdate`)
 *  can swap in a no-op. */
export function _setRegisterEventHandlerForTests(fake: RegisterEventHandlerFn): void {
  registerEventHandlerImpl = fake;
}
/** Test-only: inject a fake `ctx.emit`-style helper for `orchestrator:human_input`.
 *  Production path delegates to `getChannel().request("ezcorp/emit-task-event", ...)`.
 *  Tests swap in a recorder to assert emit payload shape without opening stdin. */
export function _setEmitHumanInputForTests(fake: EmitHumanInputFn): void {
  emitHumanInput = fake;
}
/** Test-only: restore real SDK bindings. */
export function _resetBindingsForTests(): void {
  agentConfigs = new AgentConfigs();
  spawn = spawnAssignment;
  registerEventHandlerImpl = registerEventHandler;
  emitHumanInput = defaultEmitHumanInput;
}

// ── Timeouts (injectable for tests) ────────────────────────────────

const DEFAULT_AGENT_TIMEOUT_MS = 60_000;
let defaultTimeoutMs = DEFAULT_AGENT_TIMEOUT_MS;

/** Test-only: shrink the default 60s timeout so the timeout branch can
 *  be exercised without waiting a real minute. */
export function _setDefaultTimeoutMsForTests(ms: number): void {
  defaultTimeoutMs = ms;
}

// Phase 5 — ported verbatim from src/runtime/tools/ask-human.ts:23.
const DEFAULT_HUMAN_INPUT_TIMEOUT_MS = 5 * 60_000;
let humanInputTimeoutMs = DEFAULT_HUMAN_INPUT_TIMEOUT_MS;

/** Test-only: shrink the 5-minute ask_human timeout so the timeout
 *  branch can be exercised without waiting 5 real minutes. Mirrors
 *  `_setDefaultTimeoutMsForTests` for `invoke_agent`. */
export function _setHumanInputTimeoutForTests(ms: number): void {
  humanInputTimeoutMs = ms;
}

// ── Pending-invocation tracking ────────────────────────────────────
//
// Keyed on `assignmentId` — the handle returned by `spawnAssignment`
// carries it through, and the host's `task:assignment_update` payload
// echoes it back. Resolved / rejected by the subscription handler
// registered at module load. Subprocess is `persistent: true`, so this
// map survives across tool calls.

interface PendingInvocation {
  resolve: (result: { resultPreview: string; success: boolean }) => void;
  reject: (err: Error) => void;
  timeoutHandle: ReturnType<typeof setTimeout>;
  agentName: string;
  agentConfigId: string;
  subConversationId: string;
}

const pendingInvocations = new Map<string, PendingInvocation>();

// ── Pending human-input tracking (Phase 5) ─────────────────────────
//
// Mirrors `pendingInvocations` above, keyed on the `requestId` minted by
// the `askHuman` handler on each call. The `orchestrator:human_response`
// subscription handler resolves entries on matching id. Each entry
// carries `conversationId` so the subscription handler can drop events
// whose conversationId does not match the opener's — belt-and-suspenders
// on top of Phase 2c's dispatcher-level conversation filter (§5.3
// security).

interface PendingHumanInput {
  resolve: (response: string) => void;
  reject: (err: Error) => void;
  timeoutHandle: ReturnType<typeof setTimeout>;
  conversationId: string;
}

const pendingHumanInputs = new Map<string, PendingHumanInput>();

// ── invoke_agent tool handler ──────────────────────────────────────
//
// Mirrors the legacy built-in (formerly at
// `src/runtime/tools/invoke-agent.ts`, deleted in Phase 4 commit 5)
// surface: same JSON schema, same error strings, same `_agentMeta`
// in the details. Overrides / teamToolScope / parentMessageId /
// orchestrationDepth ride in on `ctx.invocationMetadata` — the host's
// `wireOrchestrationToolsForTurn` (commit 4) binds them at tool-wiring
// time via `extensionToAgentTool`'s `invocationMetadata` seam.

const invokeAgent: ToolHandler = async (args, ctx?: ToolHandlerContext) => {
  const { agentConfigId, task } = args as { agentConfigId: string; task: string };

  // Validate: agent must exist and be visible to this user. Legacy
  // built-in returned "Error: Unknown agent "${id}"" when the id wasn't
  // in the per-turn allowlist. The extension path has a single error
  // string for both "not in allowlist" and "config not found in DB"
  // because the `ezcorp/agent-configs` reverse RPC returns null for
  // both cases — the SDK never distinguishes them.
  const config = await agentConfigs.resolve(agentConfigId);
  if (!config) {
    return toolResult(`Error: Unknown agent "${agentConfigId}".`, {
      isError: true,
    });
  }

  const timeoutMs = defaultTimeoutMs;

  // Build spawn input from ctx.invocationMetadata (set by the host at
  // tool-invoke time in commit 4). Spread each field optionally — only
  // include when metadata has it.
  const md = ctx?.invocationMetadata ?? {};
  const spawnInput: SpawnAssignmentInput = {
    task,
    agentConfigId,
    reuseSubConversationFor: agentConfigId,
    title: config.name,
    ...(typeof md.parentMessageId === "string"
      ? { parentMessageId: md.parentMessageId }
      : {}),
    ...(md.overrides && typeof md.overrides === "object"
      ? { overrides: md.overrides as Record<string, unknown> }
      : {}),
    ...(md.teamToolScope && typeof md.teamToolScope === "object"
      ? { teamToolScope: md.teamToolScope as { allowedTools?: string[]; deniedTools?: string[] } }
      : {}),
    ...(typeof md.orchestrationDepth === "number"
      ? { orchestrationDepth: md.orchestrationDepth }
      : {}),
  };

  let handle: SpawnAssignmentHandle;
  try {
    handle = await spawn(spawnInput);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return toolResult(
      `Agent "${config.name}" failed: ${msg}`,
      { isError: true },
    );
  }

  // Wait-for-completion promise gate. The subscription handler below
  // resolves this with `{ resultPreview, success }` when it sees a
  // matching `task:assignment_update` with a terminal status. Timeout
  // is the only reject path — both `completed` and `failed` resolve,
  // differentiated by the `success` flag, so callers only have one
  // branch for "terminal" vs "timeout".
  const completion = new Promise<{ resultPreview: string; success: boolean }>(
    (resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        if (pendingInvocations.has(handle.assignmentId)) {
          pendingInvocations.delete(handle.assignmentId);
          reject(
            new Error(
              `Agent "${config.name}" timed out after ${Math.round(timeoutMs / 1000)}s`,
            ),
          );
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
    },
  );

  try {
    const { resultPreview, success } = await completion;
    return toolResult(resultPreview, {
      ...(success ? {} : { isError: true }),
      details: {
        _agentMeta: {
          subConversationId: handle.subConversationId,
          agentName: config.name,
          agentConfigId,
        },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return toolResult(message, {
      isError: true,
      details: {
        _agentMeta: {
          subConversationId: handle.subConversationId,
          agentName: config.name,
          agentConfigId,
        },
      },
    });
  }
};

// ── task:assignment_update subscription (two-hop bridge) ───────────
//
// §4.2 of the plan: Phase 2c delivers `task:assignment_update` to every
// wired extension in the conversation, which means the orchestration
// extension will see assignment updates that belong to task-tracking
// (and vice versa). Guard: assignmentIds are globally unique UUIDs, so
// bailing out fast when the id isn't in our pending map keeps the
// handler a no-op for foreign updates.

interface IncomingAssignmentUpdate {
  conversationId: string;
  taskId: string;
  assignment: {
    id: string;
    status: string;
    resultPreview?: string;
  };
}

async function handleAssignmentUpdate(
  payload: IncomingAssignmentUpdate,
): Promise<void> {
  const pending = pendingInvocations.get(payload.assignment.id);
  if (!pending) return;

  const status = payload.assignment.status;
  if (status !== "completed" && status !== "failed") return;

  clearTimeout(pending.timeoutHandle);
  pendingInvocations.delete(payload.assignment.id);

  const resultPreview = payload.assignment.resultPreview ?? "(no result)";
  // Both terminal statuses resolve (not reject) — timeout is the only
  // reject path. Success flag distinguishes for the tool-result builder.
  pending.resolve({
    resultPreview,
    success: status === "completed",
  });
}

// ── ask_human tool handler (Phase 5) ───────────────────────────────
//
// Ported from the legacy built-in at `src/runtime/tools/ask-human.ts`
// (still live — executor injects it alongside this extension during
// commit 2/3 soak; commit 4 will delete the built-in and wire the
// extension exclusively). Same LLM-visible surface: same schema, same
// error strings, same 5-minute timeout, same abort semantics, same
// output shape.
//
// `runId` + `conversationId` ride in on `ctx.invocationMetadata` (Phase
// 4's §5.1a seam, already used by `invoke_agent` above). `ctx.signal`
// — if surfaced by the host — lets the caller cancel the wait; when
// absent (e.g. current SDK pre-wiring), abort simply has no effect.

/** Per-invocation context surface the orchestration extension expects
 *  from the host. `ToolHandlerContext.signal` is not yet part of the
 *  SDK's stable surface — it is typed here as optional so tests and a
 *  forward-compatible host wiring can pass one while current production
 *  callers (which don't) continue to work. */
interface OrchestrationToolContext extends ToolHandlerContext {
  signal?: AbortSignal;
}

const askHuman: ToolHandler = async (args, ctx?: OrchestrationToolContext) => {
  const { question } = args as { question: string };
  const md = ctx?.invocationMetadata ?? {};
  const runId = typeof md.runId === "string" ? md.runId : undefined;
  const conversationId =
    typeof md.conversationId === "string" ? md.conversationId : undefined;

  // Context guard: the host must bind runId + conversationId via
  // `invocationMetadata` for the emit to scope correctly. In practice
  // `wireOrchestrationToolsForTurn` seeds these on every call; this
  // branch catches misconfigured test harnesses or a future refactor
  // that forgets to thread them through.
  if (!runId || !conversationId) {
    return toolResult("Error: missing run context.", { isError: true });
  }

  const requestId = crypto.randomUUID();

  // Fire-and-forget emit: the host's POST endpoint will later reverse-
  // map requestId → conversationId and emit `orchestrator:human_response`
  // when the user replies. Failure to emit is surfaced to the LLM as a
  // tool error — otherwise the gate would wait the full 5-minute timeout.
  try {
    await emitHumanInput({ runId, conversationId, question, requestId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return toolResult(`Error: failed to emit human-input event: ${msg}`, {
      isError: true,
    });
  }

  const signal = ctx?.signal;

  // Abort listener before creating the gate — parity with
  // src/runtime/tools/ask-human.ts:67-74. `{ once: true }` ensures the
  // handler fires at most once even if the signal is reused.
  const onAbort = () => {
    const pending = pendingHumanInputs.get(requestId);
    if (pending) {
      clearTimeout(pending.timeoutHandle);
      pendingHumanInputs.delete(requestId);
      pending.reject(new Error("Aborted while waiting for human input"));
    }
  };
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    const response = await new Promise<string>((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        const pending = pendingHumanInputs.get(requestId);
        if (pending) {
          pendingHumanInputs.delete(requestId);
          pending.reject(new Error("Timed out waiting for human input"));
        }
      }, humanInputTimeoutMs);
      pendingHumanInputs.set(requestId, {
        resolve,
        reject,
        timeoutHandle,
        conversationId,
      });
    });
    return toolResult(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return toolResult(`Error: ${message}`, { isError: true });
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
};

// ── orchestrator:human_response subscription (Phase 5) ─────────────
//
// §3 of the plan: Phase 2c delivers `orchestrator:human_response` to
// every wired extension that declared the subscription. The emitter is
// the POST endpoint at `/api/orchestrator/human-input` (host-side,
// commit 1). Payload carries `{ requestId, response, conversationId }`.
//
// Guard 1: drop events whose `requestId` isn't in our pending map —
//   either the gate already timed out / aborted, or the event belongs
//   to a future extension we don't know about.
// Guard 2: drop events whose `conversationId` doesn't match the gate's
//   — belt-and-suspenders on top of the dispatcher-level filter. Closes
//   the UUID-guess attack surface noted in the plan's §5.3 security
//   analysis: a colluding extension in the same conversation cannot
//   redirect gate resolution to a different conversationId.

interface IncomingHumanResponse {
  requestId: string;
  response: string;
  conversationId: string;
}

async function handleHumanResponse(
  payload: IncomingHumanResponse,
): Promise<void> {
  const { requestId, response, conversationId } = payload;
  const pending = pendingHumanInputs.get(requestId);
  if (!pending) return;

  // Security double-check: the gate's conversationId was recorded when
  // `askHuman` opened the gate; a mismatch means the event is for a
  // different conversation (or tampered). Drop silently — no error path
  // back to the emitter for this class of drop.
  if (pending.conversationId !== conversationId) return;

  clearTimeout(pending.timeoutHandle);
  pendingHumanInputs.delete(requestId);
  pending.resolve(response);
}

export const tools: Record<string, ToolHandler> = {
  invoke_agent: invokeAgent,
  ask_human: askHuman,
};

// Expose internals for tests that want to drive the subscription
// handler directly without routing through the real event dispatcher.
export const _internals = {
  pendingInvocations,
  handleAssignmentUpdate,
  DEFAULT_AGENT_TIMEOUT_MS,
  pendingHumanInputs,
  handleHumanResponse,
  DEFAULT_HUMAN_INPUT_TIMEOUT_MS,
};

// Production wiring — gated on `import.meta.main` so test imports don't
// open stdin. Same pattern as scratchpad / task-tracking.
if (import.meta.main) {
  const ch = getChannel();
  createToolDispatcher(tools);
  registerEventHandlerImpl("task:assignment_update", handleAssignmentUpdate);
  registerEventHandlerImpl("orchestrator:human_response", handleHumanResponse);
  ch.start();
}
