import type {
  AssistantMessage,
  Message,
  UserMessage,
} from "../../types";
import { getConversationPath, getLatestLeaf, resolveSystemPrompt } from "../../db/queries/conversations";
import type { StreamChatContext } from "./context";

/**
 * Token-spend cap: rehydrate ext-files images from at most the last N
 * assistant messages in the branch. Three covers "edit the image you just
 * made" and a follow-up iteration without re-sending images from every
 * prior turn in a long conversation. Adjust via env if needed — kept local
 * until there's a real reason to expose it.
 */
export const ASSISTANT_IMAGE_REHYDRATE_MAX = 3;

/**
 * Pick the indices of the last `max` assistant messages in `branch`. Used to
 * decide which assistant turns get their ext-files URLs resolved back into
 * `ImageContent` parts. Exported for unit-level coverage of the cap logic —
 * kept small and pure so the integration tests can focus on the wired
 * behavior without re-proving the cap arithmetic.
 */
export function pickAssistantIndicesToRehydrate(
  branch: Array<{ role: string }>,
  max: number,
): Set<number> {
  const out = new Set<number>();
  if (max <= 0) return out;
  let seen = 0;
  for (let i = branch.length - 1; i >= 0 && seen < max; i--) {
    if (branch[i]!.role === "assistant") {
      out.add(i);
      seen++;
    }
  }
  return out;
}

/**
 * Find the index of the first user message after `fromIdx`, or -1 if none.
 * Exported for unit coverage.
 */
export function findNextUserIndex(
  branch: Array<{ role: string }>,
  fromIdx: number,
): number {
  for (let i = fromIdx + 1; i < branch.length; i++) {
    if (branch[i]!.role === "user") return i;
  }
  return -1;
}

/** Subset of streamChat's options the load-history phase reads. */
export interface LoadHistoryOptions {
  parentMessageId?: string;
  system?: string;
  projectId?: string;
  modeId?: string;
  provider?: string;
  model?: string;
}

export interface LoadHistoryResult {
  /** pi-ai-shaped messages for the current branch, with past-turn
   *  attachments rehydrated into their UserMessage content. */
  history: Message[];
  /** Every attachment from every earlier user message in the branch.
   *  Threaded into the setup-tools phase so the attachment-handle
   *  resolver can substitute `ez-attachment://` handles emitted on
   *  prior turns into data URIs when the LLM echoes them back to a
   *  tool. */
  allPastAttachments: import("../../chat/attachments/content-builder").StagedAttachment[];
}

/**
 * Load the conversation branch + resolve the system prompt, then
 * rehydrate any past-turn attachments into the user-message content.
 *
 * Mutates `ctx.system` with the resolved value (closures further down
 * — memory/KB injection + orchestrator-prompt rewrites — both read and
 * write `ctx.system`, so the per-call context is the natural home for
 * it). Returns the hydrated message history + the flat list of past
 * attachments for the setup-tools phase to consume.
 */
export async function loadHistory(
  ctx: StreamChatContext,
  conversationId: string,
  options: LoadHistoryOptions,
): Promise<LoadHistoryResult> {
  // Load history and resolve system prompt in parallel (they're independent)
  const [branchMessages, resolvedSystem] = await Promise.all([
    // Gather branch-aware conversation history
    (async () => {
      if (options.parentMessageId) {
        return getConversationPath(options.parentMessageId, conversationId);
      }
      const leaf = await getLatestLeaf(conversationId);
      return leaf ? getConversationPath(leaf.id, conversationId) : [];
    })(),
    // Resolve system prompt (conversation > project > global)
    (async () => {
      if (options.system) return options.system;
      if (options.projectId) return resolveSystemPrompt(conversationId, options.projectId, options.modeId);
      return undefined;
    })(),
  ]);

  // Rehydrate past-turn attachments into history so images uploaded on
  // earlier turns (and their `ez-attachment://` handles) remain visible +
  // resolvable on the current turn. Server-only code path — storagePath
  // never leaks past the pi-ai call below.
  const { loadPastAttachments, rehydrateUserMessageContent, rehydrateAssistantMessageContent } =
    await import("../../chat/attachments/history-rehydrate");
  const pastCaps = options.provider && options.model
    ? (await import("../../providers/model-capabilities")).getCapabilities(options.provider, options.model)
    : null;
  const { byMessage: pastByMessage, all: allPastAttachments } = pastCaps
    ? await loadPastAttachments(branchMessages).catch(() => ({ byMessage: new Map(), all: [] }))
    : { byMessage: new Map(), all: [] };

  // Tool-generated images persisted to `/api/ext-files/…` URLs in prior
  // assistant text need their bytes replayed on subsequent turns so the
  // model can describe/edit them. pi-ai's AssistantMessage content can't
  // carry image parts, so we attach each assistant message's resolved
  // images to the *next* user message in the branch — the model sees them
  // alongside the user's follow-up prompt (e.g. "edit this"). Capped to
  // the last N assistant messages to bound token spend on long chats.
  const supportsImageInput = pastCaps?.kinds.includes("image") === true;
  const assistantIndicesToRehydrate = pickAssistantIndicesToRehydrate(
    branchMessages,
    supportsImageInput ? ASSISTANT_IMAGE_REHYDRATE_MAX : 0,
  );

  // Pre-compute: for each user-message index, the list of ImageContent
  // parts to inject from preceding assistant messages in range.
  //
  // We scan TWO sources for ext-files URLs:
  //   1. the assistant message's text itself (models that echo markdown)
  //   2. the tool-call outputs anchored to that assistant message (models
  //      that follow the extension's "don't echo" guidance — the URL only
  //      lives in tool_calls.output for them)
  const injectedImages = new Map<number, Array<{ type: "image"; data: string; mimeType: string }>>();
  const rehydrateIds = Array.from(assistantIndicesToRehydrate);
  if (rehydrateIds.length > 0) {
    const { listToolCallOutputsForMessages } = await import("../../db/queries/tool-calls");
    const { extractOutputText } = await import("../../db/queries/conversations");

    const targetMessageIds = rehydrateIds.map((i) => branchMessages[i]!.id);
    const toolOutputs = await listToolCallOutputsForMessages(targetMessageIds).catch(() => []);
    const outputsByMessage = new Map<string, string[]>();
    for (const row of toolOutputs) {
      const text = extractOutputText(row.output);
      if (!text) continue;
      const list = outputsByMessage.get(row.messageId) ?? [];
      list.push(text);
      outputsByMessage.set(row.messageId, list);
    }

    await Promise.all(rehydrateIds.map(async (assistantIdx) => {
      const nextUserIdx = findNextUserIndex(branchMessages, assistantIdx);
      if (nextUserIdx === -1) return; // trailing assistant — no follow-up to attach to
      const assistantMsg = branchMessages[assistantIdx]!;
      // Join assistant text with each tool output so the single regex pass
      // in the rehydrator catches URLs wherever they live. `\n\n` separators
      // keep markdown image syntax from fusing across boundaries.
      const toolTexts = outputsByMessage.get(assistantMsg.id) ?? [];
      const combined = [assistantMsg.content, ...toolTexts].filter(Boolean).join("\n\n");
      const parts = await rehydrateAssistantMessageContent(combined)
        .catch(() => [] as import("../../chat/attachments/content-builder").PiContentPart[]);
      const images = parts.filter((p): p is { type: "image"; data: string; mimeType: string } =>
        p.type === "image",
      );
      if (images.length === 0) return;
      // Dedupe by base64 payload so a model that both echoes AND keeps the
      // URL in the tool output doesn't produce duplicate image parts.
      const existing = injectedImages.get(nextUserIdx) ?? [];
      const seen = new Set(existing.map((i) => i.data));
      for (const img of images) {
        if (!seen.has(img.data)) {
          existing.push(img);
          seen.add(img.data);
        }
      }
      injectedImages.set(nextUserIdx, existing);
    }));
  }

  const history: Message[] = await Promise.all(branchMessages.map(async (m, idx): Promise<Message> => {
    if (m.role === "assistant") {
      return {
        role: "assistant" as const,
        content: [{ type: "text" as const, text: m.content }],
        api: "unknown" as any,
        provider: "unknown",
        model: "unknown",
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: "stop" as const,
        timestamp: Date.now(),
      } satisfies AssistantMessage;
    }
    const attsForMsg = pastByMessage.get(m.id) ?? [];
    const injected = injectedImages.get(idx) ?? [];
    let content: string | import("../../chat/attachments/content-builder").PiContentPart[] = pastCaps
      ? await rehydrateUserMessageContent(m.content, attsForMsg, pastCaps)
      : m.content;
    if (injected.length > 0) {
      // Lift plain-string content into a parts array so we can append the
      // injected images without losing the user's typed text.
      const base: import("../../chat/attachments/content-builder").PiContentPart[] =
        typeof content === "string" ? [{ type: "text", text: content }] : content;
      content = [...base, ...injected];
    }
    return {
      role: "user" as const,
      content,
      timestamp: Date.now(),
    } satisfies UserMessage;
  }));

  // System prompt lives on the per-call context so the memory/KB injection
  // closure (in the parallel Promise.all below) and the orchestrator-prompt
  // rewrites further down can both mutate it without threading it as a param.
  ctx.system = resolvedSystem;

  return { history, allPastAttachments };
}
