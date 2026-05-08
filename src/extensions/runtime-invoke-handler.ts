/**
 * Host-side dispatcher for `runtime.*` `ezcorp/invoke` methods.
 *
 * Phase 53 Stage 1 introduces three new runtime invoke targets that
 * extensions call via `ctx.invoke("runtime.<area>.<verb>", args)`. Each
 * one exposes a tightly-scoped read of host-only state to extensions
 * that legitimately need it (the lessons-distiller is the first
 * consumer):
 *
 *   - `runtime.conversations.getMessages` — returns the conversation's
 *     messages (chronological) plus its `projectId`. The host owns this
 *     query because the SDK's `ctx.lessons.write` needs a projectId and
 *     extensions can't read the `conversations` table directly. Auth is
 *     conversation-scoped AND PER-CALL: `args.conversationId` MUST equal
 *     `ctx.currentConversationId` (the conversation the calling
 *     extension is currently wired into). Without this gate, any
 *     installed extension could read messages from any conversation
 *     across users — `conversation_extensions` wiring is not consulted
 *     by the runtime-invoke dispatch in `tool-executor.ts`.
 *
 *   - `runtime.lessons.triggerGate` — runs the heuristics in
 *     `src/runtime/lessons/triggers.ts` against the conversation's
 *     tool-call history and returns `{shouldDistill, reason}`. The
 *     heuristics stay host-side because they read `tool_calls.success`
 *     (privileged data) and need to evolve without forcing extension
 *     version bumps. Same conversationId-must-match-ctx gate as
 *     getMessages — the trigger reasoning exposes recent user-message
 *     texts, error-recovery flags, and user-correction signals.
 *
 *   - `runtime.settings.getMine` — resolves the calling extension's
 *     effective per-extension settings for the acting user. The
 *     `tool-executor` already attaches these to `invocationMetadata`
 *     for tool dispatch; the event-handler path has no per-call ctx,
 *     so this RPC fills the gap. Auth: implicit — uses ctx.extensionId
 *     set by the host (NOT a caller-supplied param), so cross-extension
 *     leakage is structurally impossible.
 *
 * Each method is read-only. No mutation paths are exposed via
 * `runtime.*` — by convention, capability surfaces (`ctx.lessons`,
 * `ctx.memory`, `ctx.llm`) handle writes with their own audit trails.
 *
 * Method-name dispatch is via `runtime.<area>.<verb>` string match.
 * Unknown verbs return JSON-RPC error -32601 (Method not found) so the
 * SDK's `invoke` reject path surfaces a clear message to the caller.
 */

import type { ExtensionPermissions, JsonRpcRequest, JsonRpcResponse } from "./types";
import { getMessages, getConversation } from "../db/queries/conversations";
import { listToolCallsByConversation } from "../db/queries/tool-calls";
import {
  shouldDistill,
  detectErrorRecovery,
  detectExplicitTag,
  detectUserCorrection,
} from "../runtime/lessons/triggers";
import { resolveExtensionSettings } from "../db/queries/extension-settings";
import { logger } from "../logger";

const log = logger.child("ext.runtime-invoke");

export interface RuntimeInvokeContext {
  /** Calling extension's id (post-resolution). */
  extensionId: string;
  /** Acting user id, resolved by the host from the per-call rpcMeta.
   *  May be null for system-driven calls (the only `runtime.settings.getMine`
   *  caller in v1 is the `run:complete` listener path). */
  userId: string | null;
  /** The conversation the executor is currently wired into. The
   *  per-method gate for `getMessages` and `triggerGate` requires
   *  `args.conversationId === ctx.currentConversationId`. Null when
   *  the executor has no conversation context (system-driven /
   *  schedule-fired invocations) — those invocations CANNOT call the
   *  conversation-scoped methods (the gate rejects with -32604). */
  currentConversationId: string | null;
  /** Calling extension's manifest settings schema, used to resolve
   *  effective values without an extra DB roundtrip for the schema
   *  fetch. */
  settingsSchema?: import("./types").SettingsSchema;
  /** Granted permissions block — passed in for symmetry with the other
   *  capability handlers; reserved for future per-method gating (e.g.
   *  if `runtime.conversations.getMessages` ever needs a permission
   *  ceiling beyond conversation-scope auth). */
  granted: ExtensionPermissions;
}

/** Identifies invoke targets this handler owns. The tool-executor
 *  consults this BEFORE the existing `resolveDepTool` lookup so cross-
 *  extension namespaced tools (e.g. `claude-design__tweak_design`) are
 *  unaffected. */
export function isRuntimeInvokeMethod(toolName: string): boolean {
  return toolName.startsWith("runtime.");
}

export async function handleRuntimeInvoke(
  toolName: string,
  args: Record<string, unknown>,
  ctx: RuntimeInvokeContext,
  req: JsonRpcRequest,
): Promise<JsonRpcResponse> {
  switch (toolName) {
    case "runtime.conversations.getMessages":
      return handleGetMessages(args, ctx, req);
    case "runtime.lessons.triggerGate":
      return handleTriggerGate(args, ctx, req);
    case "runtime.settings.getMine":
      return handleGetMySettings(ctx, req);
    default:
      return {
        jsonrpc: "2.0",
        id: req.id,
        error: {
          code: -32601,
          message: `Unknown runtime invoke method: ${toolName}`,
        },
      };
  }
}

/**
 * Per-call conversation-scope gate shared by `getMessages` and
 * `triggerGate`. The two-step check (string-shape, then identity match)
 * yields distinct error codes so callers can branch:
 *
 *   - `-32602` (Invalid params) when `args.conversationId` is missing /
 *     wrong type — caller bug, retry with proper args.
 *   - `-32604` (host extension: not-found / no-access) when the id is
 *     well-formed but doesn't match the executor's wiring. Used here
 *     for the auth gate: a mismatch means "this conversation is not
 *     yours to read", and the same code is reused below for "the
 *     conversation row no longer exists" so callers don't have to
 *     distinguish the two cases (the security-relevant signal is the
 *     same: do not retry, do not log loudly).
 *
 * `ctx.currentConversationId === null` (system-driven invocations,
 * schedule-fired extensions) ALWAYS rejects — those invocations have no
 * conversation context, so the only safe answer is "no". If a
 * legitimate cross-conversation read use case shows up, surface it as
 * a new RPC with its own auth gate, do NOT widen this one.
 */
function checkConversationGate(
  args: Record<string, unknown>,
  ctx: RuntimeInvokeContext,
  req: JsonRpcRequest,
): { ok: true; conversationId: string } | { ok: false; response: JsonRpcResponse } {
  const conversationId = args.conversationId;
  if (typeof conversationId !== "string" || !conversationId) {
    return {
      ok: false,
      response: {
        jsonrpc: "2.0",
        id: req.id,
        error: { code: -32602, message: "conversationId required" },
      },
    };
  }
  if (
    ctx.currentConversationId === null ||
    conversationId !== ctx.currentConversationId
  ) {
    // Match the wording the SDK surfaces verbatim — the test suite
    // asserts on the message string, and the same wording is reused
    // for the "not found" branch below.
    return {
      ok: false,
      response: {
        jsonrpc: "2.0",
        id: req.id,
        error: {
          code: -32604,
          message: "conversationId must match current conversation",
        },
      },
    };
  }
  return { ok: true, conversationId };
}

async function handleGetMessages(
  args: Record<string, unknown>,
  ctx: RuntimeInvokeContext,
  req: JsonRpcRequest,
): Promise<JsonRpcResponse> {
  const gate = checkConversationGate(args, ctx, req);
  if (!gate.ok) return gate.response;
  const { conversationId } = gate;

  // Single round-trip: fetch the conversation row (for projectId) and
  // its messages. Both are needed by the lessons-distiller for the
  // `lessons.write` projectId and the LLM input slice.
  //
  // Distinguish "conversation not found" (row deleted, returns null) from
  // "DB error" (driver throws): not-found returns -32604 so callers can
  // silent-skip (matches the wiring-mismatch code above — the conversation
  // is unreachable to this caller in either case), while DB errors
  // surface as -32603 so callers log + propagate. Pre-fix this branch
  // swallowed the error and returned a `projectId: null` envelope, which
  // looked indistinguishable from a legit projectless conversation.
  let projectId: string | null = null;
  try {
    const conversation = await getConversation(conversationId);
    if (!conversation) {
      return {
        jsonrpc: "2.0",
        id: req.id,
        error: { code: -32604, message: "conversation not found" },
      };
    }
    projectId = conversation.projectId ?? null;
  } catch (err) {
    log.warn("getConversation threw", { conversationId, error: String(err) });
    return {
      jsonrpc: "2.0",
      id: req.id,
      error: {
        code: -32603,
        message: `getConversation failed: ${(err as Error).message}`,
      },
    };
  }

  let messages: { id: string; role: string; content: string }[];
  try {
    const rows = await getMessages(conversationId);
    messages = rows.map((m) => ({
      id: m.id,
      role: m.role,
      // `content` is text on chat messages; cast covers the union with
      // structured assistant blocks (the legacy distiller handles those
      // via `String(content)` implicitly through the join).
      content: typeof m.content === "string" ? m.content : String(m.content ?? ""),
    }));
  } catch (err) {
    return {
      jsonrpc: "2.0",
      id: req.id,
      error: { code: -32603, message: `getMessages failed: ${(err as Error).message}` },
    };
  }

  return {
    jsonrpc: "2.0",
    id: req.id,
    result: { messages, projectId },
  };
}

async function handleTriggerGate(
  args: Record<string, unknown>,
  ctx: RuntimeInvokeContext,
  req: JsonRpcRequest,
): Promise<JsonRpcResponse> {
  const gate = checkConversationGate(args, ctx, req);
  if (!gate.ok) return gate.response;
  const { conversationId } = gate;

  // Mirror the legacy `runDistillation` trigger-gate body verbatim
  // (src/runtime/lessons/distiller.ts:256-272). `triggers.ts` stays
  // host-side because the heuristics need privileged signals
  // (`tool_calls.success`, `messages.role` for user-message tokens)
  // that aren't safe to expose to extensions wholesale.
  let toolCallRows: Awaited<ReturnType<typeof listToolCallsByConversation>>;
  let messages: Awaited<ReturnType<typeof getMessages>>;
  try {
    toolCallRows = await listToolCallsByConversation(conversationId);
    messages = await getMessages(conversationId);
  } catch (err) {
    return {
      jsonrpc: "2.0",
      id: req.id,
      error: { code: -32603, message: `triggerGate read failed: ${(err as Error).message}` },
    };
  }

  // Only consider the last 20 messages (matches the legacy slice) for
  // user-text scans — the same window the LLM eventually sees.
  const recent = messages.slice(-20);
  const userMessageTexts = recent
    .filter((m) => m.role === "user")
    .map((m) => (typeof m.content === "string" ? m.content : String(m.content ?? "")));

  const triggerInput = {
    toolCallCount: toolCallRows.length,
    errorRecoveryObserved: detectErrorRecovery(
      toolCallRows.map((r) => ({ status: r.success ? "ok" as const : "error" as const })),
    ),
    userCorrectionObserved: detectUserCorrection(userMessageTexts),
    explicitlyTagged: detectExplicitTag(userMessageTexts),
  };
  const fire = shouldDistill(triggerInput);
  return {
    jsonrpc: "2.0",
    id: req.id,
    result: {
      shouldDistill: fire,
      reason: fire
        ? "trigger-fired"
        : `no-signal (toolCalls=${triggerInput.toolCallCount}, errorRecovery=${triggerInput.errorRecoveryObserved}, userCorrection=${triggerInput.userCorrectionObserved}, tagged=${triggerInput.explicitlyTagged})`,
    },
  };
}

async function handleGetMySettings(
  ctx: RuntimeInvokeContext,
  req: JsonRpcRequest,
): Promise<JsonRpcResponse> {
  // No user → return declared defaults. Mirrors the
  // `resolveExtensionSettings(extensionId, null, schema)` contract.
  let resolved: Record<string, unknown>;
  try {
    resolved = await resolveExtensionSettings(
      ctx.extensionId,
      ctx.userId,
      ctx.settingsSchema,
    );
  } catch (err) {
    return {
      jsonrpc: "2.0",
      id: req.id,
      error: { code: -32603, message: `settings resolve failed: ${(err as Error).message}` },
    };
  }
  return {
    jsonrpc: "2.0",
    id: req.id,
    result: resolved,
  };
}
