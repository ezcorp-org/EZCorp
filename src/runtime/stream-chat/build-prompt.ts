import { getProject } from "../../db/queries/projects";

/** Subset of streamChat's options the prompt-building phase reads. */
export interface BuildPromptOptions {
  projectId?: string;
  provider?: string;
  model?: string;
  attachments?: import("../../chat/attachments/content-builder").StagedAttachment[];
  commandResolver?: import("../mention-wiring").CommandResolver;
}

export interface BuildPromptResult {
  /** Final text to feed `piAgent.prompt(...)`. */
  text: string;
  /** Image parts for the `piAgent.prompt(text, images)` overload. Empty
   *  when the model is text-only or the user attached no images. */
  images: import("@mariozechner/pi-ai").ImageContent[];
}

/**
 * Build the prompt body for `piAgent.prompt`. Three independent
 * non-fatal expansions:
 *   - slash-command expansion (rewrite `/[cmd:name]` → command body)
 *   - file-mention prepend (`@[file:…]` → system note listing the
 *     resolved paths so the agent knows which files were referenced)
 *   - multi-modal attachment lift (image/text/pdf parts → either
 *     inlined into text, or split into the images return value)
 *
 * Pure function — no IO except the project lookup for file mentions.
 */
export async function buildPromptInput(
  userMessage: string,
  options: BuildPromptOptions,
): Promise<BuildPromptResult> {
  // Slash-command expansion runs against the raw userMessage and
  // produces the text that goes to the LLM. The persisted message
  // (stored upstream) keeps the raw `/[cmd:name]` tokens so edit /
  // replay semantics remain stable. Expansion is literal — we do
  // NOT re-parse the expanded text for other mention kinds (see
  // expand-command-mentions.test.ts for the injection guards).
  let text = userMessage;
  if (options.commandResolver) {
    try {
      const { applyCommandExpansion } = await import("../mention-wiring");
      text = await applyCommandExpansion(userMessage, options.commandResolver);
    } catch { /* Slash-command expansion failure is non-fatal */ }
  }

  // Resolve @[file:…] mentions against the active project and prepend a
  // lazy system note so the agent knows which files the user referenced.
  // The agent can read them on demand via the readFile tool.
  if (options.projectId) {
    try {
      const { resolveFileMentions, formatFileMentionSystemNotes } = await import("../mention-wiring");
      const project = await getProject(options.projectId);
      const fileMentions = await resolveFileMentions(userMessage, project?.path);
      const note = formatFileMentionSystemNotes(fileMentions);
      if (note) text = `${note}\n\n${text}`;
    } catch { /* File mention resolution failure is non-fatal */ }
  }

  // Multi-modal attachments for the current turn: convert to pi-ai parts.
  // Images go through the prompt(text, images) overload; text/pdf content
  // is inlined into the prompt string. Incompatible attachments throw
  // UnsupportedAttachmentError, which the endpoint should have prevented —
  // if we reach here, the user provided a model that can't accept them and
  // we surface the error rather than silently dropping content.
  const images: import("@mariozechner/pi-ai").ImageContent[] = [];
  if (options.attachments && options.attachments.length > 0 && options.provider && options.model) {
    const { getCapabilities } = await import("../../providers/model-capabilities");
    const { buildUserContent } = await import("../../chat/attachments/content-builder");
    const caps = getCapabilities(options.provider, options.model);
    const built = await buildUserContent(text, options.attachments, caps);
    if (Array.isArray(built)) {
      const textBits: string[] = [];
      for (const part of built) {
        if (part.type === "text") textBits.push(part.text);
        else if (part.type === "image") images.push(part);
      }
      text = textBits.join("\n\n");
    }
  }

  return { text, images };
}
