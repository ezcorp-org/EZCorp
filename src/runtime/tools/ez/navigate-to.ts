/**
 * Phase 48 Wave 2 — navigate_to Ez tool (CLIENT-SIDE STUB).
 *
 * Mirror of fill_form: marked `clientSide: true`, the execute body emits
 * an `ez:client-tool` event and returns a deferred sentinel. The Ez
 * panel intercepts the event and calls SvelteKit's `goto(path)`.
 *
 * Path validation is server-side here (must be a relative in-app path,
 * starting with `/`, no protocol or host) so even a buggy/malicious
 * client can't redirect the user to an external site by re-emitting the
 * event. We reject `//` (protocol-relative URLs) and any string with
 * `://` (full URLs). The Ez panel applies its own `goto`-side
 * validation in Wave 3 as defense-in-depth.
 */
import { Type } from "@mariozechner/pi-ai";
import type { BuiltinToolDef } from "../types";
import type { ClientToolContext } from "./fill-form";
import { EZ_CLIENT_TOOL_DEFERRED_MARKER } from "./fill-form";

export function isValidInAppPath(path: unknown): path is string {
  if (typeof path !== "string" || path.length === 0) return false;
  if (!path.startsWith("/")) return false;
  if (path.startsWith("//")) return false; // protocol-relative
  if (path.includes("://")) return false; // absolute URL
  // Reject newlines / control chars that could smuggle headers downstream.
  if (/[\r\n]/.test(path)) return false;
  return true;
}

export function createNavigateToTool(ctx: ClientToolContext): BuiltinToolDef {
  return {
    name: "navigate_to",
    label: "navigate_to",
    description:
      "Navigate the user to an in-app route (e.g. '/marketplace?q=pdf' or '/agents/<id>'). External URLs are rejected. Resolved client-side by the Ez panel.",
    category: "ez",
    cardType: "default",
    clientSide: true,
    parameters: Type.Unsafe({
      type: "object",
      properties: {
        path: {
          type: "string",
          minLength: 1,
          description: "Relative in-app path starting with '/'. External URLs (with ://) are rejected.",
        },
      },
      required: ["path"],
    }),
    execute: async (toolCallId, params: any) => {
      const path = params?.path;
      if (!isValidInAppPath(path)) {
        return {
          content: [{ type: "text" as const, text: "Error: path must be a relative in-app path starting with '/'. External URLs are rejected." }],
          details: { isError: true },
        };
      }
      if (!ctx.bus) {
        return {
          content: [{ type: "text" as const, text: "Error: client-tool bus not wired" }],
          details: { isError: true, clientSide: true, toolName: "navigate_to" },
        };
      }
      ctx.bus.emit("ez:client-tool", {
        conversationId: ctx.conversationId,
        toolCallId,
        toolName: "navigate_to",
        input: { path },
      });
      return {
        content: [{ type: "text" as const, text: EZ_CLIENT_TOOL_DEFERRED_MARKER }],
        details: { clientSide: true, toolName: "navigate_to", deferred: true, path },
      };
    },
  };
}
