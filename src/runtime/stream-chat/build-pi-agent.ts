import { Agent } from "@mariozechner/pi-agent-core";
import type { Message } from "../../types";
import { resolveOAuthModel } from "../../providers/registry";
import { getCredential } from "../../providers/credentials";
import type { StreamChatContext } from "./context";
import type { SetupToolsResult } from "./setup-tools";

/** Subset of streamChat's options the pi-agent construction reads. */
export interface BuildPiAgentOptions {
  thinkingLevel?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
}

/**
 * Resolve the OAuth-compatible model (when applicable) and construct the
 * pi-agent for this turn. The OAuth swap is necessary because the
 * standard API endpoints (google-generative-ai, openai-responses) use
 * API key auth which is incompatible with OAuth tokens — we need the
 * subscription-eligible Model object so the correct API + endpoint +
 * metadata is wired in.
 *
 * Pure function — touches `ctx.system` + `ctx.agentTools` for read only,
 * does NOT subscribe (that's {@link subscribeBridge}'s job). Callers
 * register the agent on the host's `activeAgents` map themselves so the
 * cancel + watchdog paths can `.abort()` it.
 */
export function buildPiAgent(
  ctx: StreamChatContext,
  history: Message[],
  options: BuildPiAgentOptions,
  resolvedModel: SetupToolsResult,
  credentialConversationId: string,
): Agent {
  const { resolved, initialCred } = resolvedModel;

  // When using OAuth, the standard API endpoints (google-generative-ai, openai-responses)
  // use API key auth which is incompatible with OAuth tokens. Resolve the actual
  // OAuth-compatible Model object so the correct API + endpoint + metadata is used.
  let model = resolved.piModel;
  if (initialCred.type === "oauth") {
    const oauthModel = resolveOAuthModel(resolved.provider, model.id);
    if (oauthModel) {
      // Keep the original provider name so credential lookups (getApiKey callback)
      // resolve against "openai"/"google", not "openai-codex"/"google-gemini-cli"
      model = { ...oauthModel, provider: resolved.provider as any };
    } else if (resolved.provider === "google" || resolved.provider === "openai") {
      throw new Error(
        `Model "${model.id}" is not supported with ${resolved.provider} OAuth. ` +
        `Only subscription-eligible models are available with OAuth authentication.`,
      );
    }
  }

  return new Agent({
    initialState: {
      systemPrompt: ctx.system ?? "",
      model,
      tools: ctx.agentTools,
      messages: history,
      thinkingLevel: options.thinkingLevel ?? (model.reasoning ? "medium" : "off"),
    },
    convertToLlm: (messages) => {
      return messages.filter((m) =>
        "role" in m && (m.role === "user" || m.role === "assistant" || m.role === "toolResult"),
      ) as Message[];
    },
    getApiKey: async (provider) => {
      const freshCred = await getCredential(provider, credentialConversationId);
      return freshCred.token;
    },
    onPayload: async (body: any) => {
      // Force reasoning summaries so thinking text is visible to the user
      if (body?.reasoning && body.reasoning.summary === "auto") {
        body.reasoning.summary = "detailed";
      }
      return body;
    },
  });
}
