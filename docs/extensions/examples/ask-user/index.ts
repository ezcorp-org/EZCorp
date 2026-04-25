#!/usr/bin/env bun
// ask-user — bundled extension providing `ask_user_question`. Pauses
// the LLM run on a process-local promise gate keyed on `toolCallId`,
// resolved when the host emits `ask-user:answer` with a matching id.
//
// Architecture (mirrors the Phase 5 orchestration ask_human two-hop
// bridge, simplified):
//   1. LLM emits a tool_use for `ask_user_question`. The host's
//      `tool:start` event carries `cardType: "ask-user-question"`,
//      `input.question`, `input.options`, and the host-minted
//      `invocationId` (= toolCallId). The chat UI's tool-card renderer
//      delegates to `AskUserQuestionCard.svelte` which renders inline
//      in the assistant message — buttons when `options` is non-empty,
//      a textarea otherwise.
//   2. This handler reads `toolCallId` + `conversationId` from
//      `ctx.invocationMetadata`. Both are populated by:
//        • the per-call seam in `extensionToAgentTool` (toolCallId)
//        • the per-turn auto-wire block in
//          `src/runtime/stream-chat/setup-tools.ts` (conversationId)
//      It registers a pending-answer record keyed on `toolCallId` in
//      a process-local map, then awaits a Promise that resolves when
//      the subscription handler fires.
//   3. User clicks an option (or submits text). The chat page POSTs
//      `{ toolCallId, answer }` to `/api/ask-user/answer`. The endpoint
//      looks up `conversationId` from the `tool_calls` DB table (no
//      shadow registry needed) and emits `ask-user:answer` on the host
//      bus with conversation scope.
//   4. The host's `EventSubscriptionDispatcher` delivers the event to
//      every subscribed extension wired to the conversation. The
//      handler below validates `conversationId` matches the gate's
//      recorded value (defense against UUID-guess attacks where a
//      colluding extension in the same process tries to redirect a
//      different conversation's gate), resolves the promise with
//      `answer`, and clears the timeout.
//
// Permission contract: requires
// `eventSubscriptions: ["ask-user:answer"]`. No storage, no spawn, no
// network. The subprocess is `persistent: true` so the pending map
// survives across calls.

import {
  createToolDispatcher,
  getChannel,
  registerEventHandler,
  toolResult,
  type ToolHandler,
  type ToolHandlerContext,
} from "@ezcorp/sdk/runtime";

// ── Capability bindings (swappable for tests) ──────────────────────

type RegisterEventHandlerFn = typeof registerEventHandler;

let registerEventHandlerImpl: RegisterEventHandlerFn = registerEventHandler;

/** Test-only: inject a fake registerEventHandler. Defaults to the SDK's
 *  real implementation, which opens the channel; tests that want to
 *  drive the subscription manually (via `_internals.handleAnswer`) can
 *  swap in a no-op. */
export function _setRegisterEventHandlerForTests(fake: RegisterEventHandlerFn): void {
  registerEventHandlerImpl = fake;
}

/** Test-only: restore the real SDK binding. */
export function _resetBindingsForTests(): void {
  registerEventHandlerImpl = registerEventHandler;
}

// ── Timeout (injectable for tests) ─────────────────────────────────

const DEFAULT_ASK_USER_TIMEOUT_MS = 5 * 60_000;
let askUserTimeoutMs = DEFAULT_ASK_USER_TIMEOUT_MS;

/** Test-only: shrink the 5-minute timeout so the timeout branch can be
 *  exercised without a real five-minute wait. */
export function _setAskUserTimeoutForTests(ms: number): void {
  askUserTimeoutMs = ms;
}

// ── Pending-answer tracking ────────────────────────────────────────
//
// Keyed on `toolCallId` (the host-minted invocation id). The gate is
// resolved by the `ask-user:answer` subscription handler when the user
// replies, rejected on timeout or abort. Subprocess is `persistent:
// true`, so this map survives across calls.
//
// `conversationId` is recorded for a defense-in-depth check inside the
// subscription handler — even though the host's
// `EventSubscriptionDispatcher` already filters delivery to wired
// extensions for the right conversation, a mismatch here drops the
// event silently. Mirrors the orchestration extension's posture (§5.3
// of the Phase 5 plan).

interface PendingAskUser {
  resolve: (answer: string) => void;
  reject: (err: Error) => void;
  timeoutHandle: ReturnType<typeof setTimeout>;
  conversationId: string;
}

const pendingAskUser = new Map<string, PendingAskUser>();

// ── ask_user_question handler ──────────────────────────────────────

/** Per-invocation context surface the extension expects from the host.
 *  `ToolHandlerContext.signal` is not yet part of the SDK's stable
 *  surface — typed here as optional so a forward-compatible host
 *  wiring can pass one while current production callers (which don't)
 *  continue to work. Mirrors the orchestration extension's pattern. */
interface AskUserToolContext extends ToolHandlerContext {
  signal?: AbortSignal;
}

const askUserQuestion: ToolHandler = async (args, ctx?: AskUserToolContext) => {
  const { question, options } = args as { question?: unknown; options?: unknown };

  if (typeof question !== "string" || question.trim().length === 0) {
    return toolResult("Error: 'question' is required and must be a non-empty string.", {
      isError: true,
    });
  }
  // Validate options shape if present — host clamping is best-effort, so
  // a bad payload (e.g. an LLM hallucination of `options: "foo"`) should
  // surface as a tool error rather than a runtime crash in the gate.
  if (options !== undefined) {
    if (!Array.isArray(options) || !options.every((o) => typeof o === "string")) {
      return toolResult("Error: 'options', if provided, must be an array of strings.", {
        isError: true,
      });
    }
  }

  const md = ctx?.invocationMetadata ?? {};
  const toolCallId = typeof md.toolCallId === "string" ? md.toolCallId : undefined;
  const conversationId =
    typeof md.conversationId === "string" ? md.conversationId : undefined;

  // Context guard: both fields must be threaded by the host
  // (`extensionToAgentTool`'s per-call seam → `toolCallId`; the
  // setup-tools auto-wire block → `conversationId`). A miss here means
  // the host wiring regressed; surface as a tool error so the LLM gets
  // a concrete failure rather than a 5-minute hang.
  if (!toolCallId || !conversationId) {
    return toolResult("Error: missing tool-call context (toolCallId + conversationId).", {
      isError: true,
    });
  }

  // Abort listener attached BEFORE the gate is created — parity with
  // orchestration/index.ts:392-400. `{ once: true }` ensures the
  // handler fires at most once even if the same signal is reused.
  const signal = ctx?.signal;
  const onAbort = () => {
    const pending = pendingAskUser.get(toolCallId);
    if (pending) {
      clearTimeout(pending.timeoutHandle);
      pendingAskUser.delete(toolCallId);
      pending.reject(new Error("Aborted while waiting for user answer"));
    }
  };
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    const answer = await new Promise<string>((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        const pending = pendingAskUser.get(toolCallId);
        if (pending) {
          pendingAskUser.delete(toolCallId);
          pending.reject(new Error("Timed out waiting for user answer"));
        }
      }, askUserTimeoutMs);
      pendingAskUser.set(toolCallId, {
        resolve,
        reject,
        timeoutHandle,
        conversationId,
      });
    });
    return toolResult(answer);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return toolResult(`Error: ${message}`, { isError: true });
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
};

// ── ask-user:answer subscription handler ───────────────────────────
//
// Phase 2c delivers `ask-user:answer` to every wired extension that
// declared the subscription. The emitter is the POST endpoint at
// `/api/ask-user/answer` (host-side). Payload carries
// `{ toolCallId, conversationId, answer }`.
//
// Guard 1: drop events whose `toolCallId` isn't in our pending map —
//   either the gate already timed out / aborted, or the event belongs
//   to a different in-flight ask-user the same conversation never
//   saw resolve.
// Guard 2: drop events whose `conversationId` doesn't match the gate's
//   recorded value — belt-and-suspenders on top of the dispatcher-
//   level filter. Closes the UUID-guess attack surface noted in the
//   Phase 5 §5.3 security analysis.

interface IncomingAskUserAnswer {
  toolCallId: string;
  conversationId: string;
  answer: string;
}

async function handleAnswer(payload: IncomingAskUserAnswer): Promise<void> {
  const { toolCallId, conversationId, answer } = payload;
  const pending = pendingAskUser.get(toolCallId);
  if (!pending) return;

  // Security double-check: gate's `conversationId` was recorded when
  // the handler opened it; a mismatch means the event is for a
  // different conversation (or tampered). Drop silently.
  if (pending.conversationId !== conversationId) return;

  clearTimeout(pending.timeoutHandle);
  pendingAskUser.delete(toolCallId);
  pending.resolve(answer);
}

export const tools: Record<string, ToolHandler> = {
  ask_user_question: askUserQuestion,
};

// Expose internals for tests that drive the subscription handler
// directly without routing through the real event dispatcher.
export const _internals = {
  pendingAskUser,
  handleAnswer,
  DEFAULT_ASK_USER_TIMEOUT_MS,
};

/**
 * Wire the dispatcher + subscription + start the channel. Extracted as
 * an exported function so unit tests can cover the production wiring
 * branch (the `import.meta.main` block below alone would never run
 * under `bun test`). Mirrors the `start()` pattern used by
 * `openai-image-gen-2/index.ts`.
 */
export function start(): void {
  const ch = getChannel();
  createToolDispatcher(tools);
  registerEventHandlerImpl("ask-user:answer", handleAnswer);
  ch.start();
}

// Production wiring — gated on `import.meta.main` so test imports
// don't open stdin. Single-line form so the executable-statement count
// stays at one line (which the load-time `if` test always hits),
// matching the openai-image-gen-2 pattern that the coverage gate
// expects.
if (import.meta.main) start();
