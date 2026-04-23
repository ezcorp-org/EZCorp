import { stream, complete, type Context } from "@mariozechner/pi-ai";
import { resolveModel } from "../providers/router";
import { getCredential } from "../providers/credentials";
import { getDb } from "../db/connection";
import { toolCalls } from "../db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { logger } from "../logger";

const log = logger.child("executor.helpers");

/**
 * Build the pi-ai-backed LLM wrapper used by **code-based agents** (the
 * `runAgent` path — distinct from `streamChat`, which constructs its
 * pi-agent-core `Agent` directly).
 *
 * Pure factory — no executor state. Resolves provider + credential per
 * call so model overrides on each invocation work.
 */
export function createPiLlmAdapter() {
  return {
    async complete(messages: any[], options?: any) {
      const resolved = await resolveModel(options?.provider, options?.model);
      const cred = await getCredential(resolved.provider);
      const context: Context = {
        systemPrompt: options?.system,
        messages: messages.map((m: any) => ({ role: m.role, content: m.content, timestamp: Date.now() })),
      };
      const result = await complete(resolved.piModel, context, { apiKey: cred.token });
      const text = result.content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("");
      return { text, usage: { inputTokens: result.usage.input, outputTokens: result.usage.output } };
    },
    async *stream(messages: any[], options?: any) {
      const resolved = await resolveModel(options?.provider, options?.model);
      const cred = await getCredential(resolved.provider);
      const context: Context = {
        systemPrompt: options?.system,
        messages: messages.map((m: any) => ({ role: m.role, content: m.content, timestamp: Date.now() })),
      };
      const s = stream(resolved.piModel, context, { apiKey: cred.token, signal: options?.signal });
      for await (const event of s) {
        if (event.type === "text_delta") yield { type: "token", text: event.delta };
        if (event.type === "done") yield { type: "done", usage: { inputTokens: event.message.usage.input, outputTokens: event.message.usage.output } };
        if (event.type === "error") yield { type: "error", error: event.error.content?.map((c: any) => c.type === "text" ? c.text : "").join("") ?? "Stream error" };
      }
    },
  };
}

/**
 * Persist an error as an assistant message + re-anchor any orphan tool_calls
 * to that message. Shared by the streamChat error paths (provider-unavailable,
 * generic error, top-level setup error). No-op when persist=false.
 *
 * Imported lazily to keep startup quick — `createMessage` pulls a chunk
 * of the conversations module into the executor's bundle otherwise.
 */
export async function persistErrorMessage(
  conversationId: string,
  errorContent: string,
  options: { model?: string; provider?: string; parentMessageId?: string },
  runId: string,
  persist: boolean,
): Promise<void> {
  if (!persist) return;
  try {
    const { createMessage } = await import("../db/queries/conversations");
    const errorMsg = await createMessage(conversationId, {
      role: "assistant",
      content: errorContent,
      model: options.model,
      provider: options.provider,
      runId,
      parentMessageId: options.parentMessageId,
    });

    // Fix tool call anchoring for error messages too
    await getDb()
      .update(toolCalls)
      .set({ messageId: errorMsg.id })
      .where(and(
        eq(toolCalls.conversationId, conversationId),
        eq(toolCalls.messageId, runId),
      ));
    await getDb()
      .update(toolCalls)
      .set({ messageId: errorMsg.id })
      .where(and(
        eq(toolCalls.conversationId, conversationId),
        isNull(toolCalls.messageId),
      ));
  } catch (err) {
    log.error("Failed to persist error message", { error: String(err) });
  }
}
