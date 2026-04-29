/**
 * Phase 48 Wave 2 — fill_form Ez tool (CLIENT-SIDE STUB).
 *
 * Marked `clientSide: true`, which the runtime treats as "do not execute
 * this server-side." Instead, when the LLM emits a `fill_form(...)` call,
 * the runtime emits an `ez:client-tool` SSE event to the streaming
 * client; the Ez panel intercepts the event, looks up the page-
 * registered form handler in the global EzContext store, runs it
 * locally, and POSTs the resolution back to the runtime so the agent
 * loop continues. Wave 2 ships the emit + a deferred-placeholder
 * execute body; Wave 3 wires the panel-side dispatcher.
 *
 * The execute body emits the event via the EventBus passed in via
 * context and returns a "deferred" sentinel — the runtime treats this
 * as a still-pending call and waits for the client's POST. If no bus
 * is wired (e.g. raw unit test instantiation), the execute returns an
 * error so the LLM doesn't loop forever on a silently-broken tool.
 */
import { Type } from "@mariozechner/pi-ai";
import type { BuiltinToolDef } from "../types";
import type { EventBus } from "../../events";
import type { AgentEvents } from "../../../types";

export interface ClientToolContext {
  conversationId: string;
  bus?: EventBus<AgentEvents>;
}

export const EZ_CLIENT_TOOL_DEFERRED_MARKER = "[ez-client-tool:deferred]";

export function createFillFormTool(ctx: ClientToolContext): BuiltinToolDef {
  return {
    name: "fill_form",
    label: "fill_form",
    description:
      "Fill in a form on the page the user is currently looking at. Inputs: formId (from page context) and values (record matching the form's declared schema). Resolved client-side by the Ez panel.",
    category: "ez",
    cardType: "default",
    clientSide: true,
    parameters: Type.Unsafe({
      type: "object",
      properties: {
        formId: { type: "string", minLength: 1, description: "ID of the page-registered form to fill (from page context)." },
        values: { type: "object", additionalProperties: true, description: "Field-name → value map matching the form's declared schema." },
      },
      required: ["formId", "values"],
    }),
    execute: async (toolCallId, params: any) => {
      const formId = typeof params?.formId === "string" ? params.formId : "";
      const values = params?.values && typeof params.values === "object" ? params.values : {};
      if (!formId) {
        return {
          content: [{ type: "text" as const, text: "Error: formId is required" }],
          details: { isError: true },
        };
      }
      if (!ctx.bus) {
        return {
          content: [{ type: "text" as const, text: "Error: client-tool bus not wired" }],
          details: { isError: true, clientSide: true, toolName: "fill_form" },
        };
      }
      ctx.bus.emit("ez:client-tool", {
        conversationId: ctx.conversationId,
        toolCallId,
        toolName: "fill_form",
        input: { formId, values },
      });
      return {
        content: [{ type: "text" as const, text: EZ_CLIENT_TOOL_DEFERRED_MARKER }],
        details: { clientSide: true, toolName: "fill_form", deferred: true, formId },
      };
    },
  };
}
