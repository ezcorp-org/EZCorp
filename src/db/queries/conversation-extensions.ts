import { getDb } from "../connection";
import { conversationExtensions } from "../schema";
import { eq } from "drizzle-orm";
import { ExtensionRegistry } from "../../extensions/registry";

export async function getConversationExtensionIds(conversationId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ extensionId: conversationExtensions.extensionId })
    .from(conversationExtensions)
    .where(eq(conversationExtensions.conversationId, conversationId));
  return rows.map((r: { extensionId: string }) => r.extensionId);
}

export async function addConversationExtensions(
  conversationId: string,
  entries: { extensionId: string; messageId?: string }[],
): Promise<void> {
  if (entries.length === 0) return;
  const db = getDb();
  await db.insert(conversationExtensions)
    .values(entries.map(e => ({
      conversationId,
      extensionId: e.extensionId,
      addedByMessageId: e.messageId,
    })))
    .onConflictDoNothing();
}

/**
 * Copy the `conversation_extensions` rows from one conversation to
 * another. Used by Phase 2d's `ezcorp/spawn-assignment` so a freshly
 * created sub-conversation inherits the parent's extension set — the
 * spawning extension (and its wired siblings) are automatically
 * observable on the child with no per-spawn opt-in. Idempotent via
 * the existing UNIQUE(conversation_id, extension_id) constraint.
 */
export async function copyConversationExtensions(
  fromConversationId: string,
  toConversationId: string,
): Promise<void> {
  const ids = await getConversationExtensionIds(fromConversationId);
  if (ids.length === 0) return;
  await addConversationExtensions(
    toConversationId,
    ids.map((extensionId) => ({ extensionId })),
  );
}

/**
 * Union of `acceptedAttachmentMimes` across every extension wired into
 * the conversation. Used by the upload route + `/api/models/capabilities`
 * to extend the file picker's allowlist with extension-declared MIMEs.
 *
 * Extensions that aren't loaded into the in-memory registry (e.g. just
 * inserted but the registry hasn't reloaded yet) contribute nothing —
 * they'll start contributing on the next registry reload.
 */
export async function getConversationExtensionMimes(
  conversationId: string,
): Promise<string[]> {
  const ids = await getConversationExtensionIds(conversationId);
  if (ids.length === 0) return [];
  const reg = ExtensionRegistry.getInstance();
  const out = new Set<string>();
  for (const id of ids) {
    const manifest = reg.getManifest(id);
    if (!manifest?.acceptedAttachmentMimes) continue;
    for (const m of manifest.acceptedAttachmentMimes) out.add(m);
  }
  return [...out];
}

/**
 * Like {@link getConversationExtensionMimes} but keyed by extension names
 * — used by the chat composer to grant accept-list slots to extensions
 * the user has *drafted* via `!ext:NAME` mentions but not yet sent (and
 * therefore not yet inserted into `conversation_extensions`). Without
 * this, dragging an .xlsx into a fresh chat that mentions `!ext:excel`
 * would be rejected because the registry sees no wired extensions.
 */
export function getExtensionMimesByNames(names: readonly string[]): string[] {
  if (names.length === 0) return [];
  const unique = [...new Set(names.filter((n) => typeof n === "string" && n.length > 0))];
  if (unique.length === 0) return [];
  const reg = ExtensionRegistry.getInstance();
  const out = new Set<string>();
  for (const name of unique) {
    const manifest = reg.getManifestByName(name);
    if (!manifest?.acceptedAttachmentMimes) continue;
    for (const m of manifest.acceptedAttachmentMimes) out.add(m);
  }
  return [...out];
}
