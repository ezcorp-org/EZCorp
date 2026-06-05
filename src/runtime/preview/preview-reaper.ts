/**
 * preview-reaper.ts — tear down a conversation's dynamic previews on
 * conversation close / idle timeout / explicit stop (Secure User-Site
 * Preview / Port Exposure, Phase 3b, deliverable 4 "idle reaping").
 *
 * Reaping a conversation must, in one atomic-ish sweep:
 *   1. KILL its dev-server processes (so the untrusted code stops running),
 *   2. REVOKE its preview_sessions rows (so the proxy fails closed instantly
 *      — even an in-flight request with a valid token gets a 404),
 *   3. RELEASE its preview uid back to the pool (reuse-after-reap),
 *   4. DROP the watcher's watch (so the daemon stops polling /proc for it),
 *   5. FORGET its rate-limit accounting (so a freed id doesn't leak memory).
 *
 * Pure over injected deps so the full ordering + the "kills proc + revokes +
 * drops watch" contract is unit-tested without a live process, DB, or daemon.
 * The live wiring (conversation-close hook + the watcher idle sweep) calls
 * `reapPreviewConversation` with the real implementations.
 */

import { logger } from "../../logger";
import { killConversationProcesses } from "./preview-spawn-orchestration";
import { reapPreviewUid } from "./preview-uid-pool";
import { reapPreviewNetns } from "./preview-netns";

const log = logger.child("preview.reaper");

export interface ReapPreviewDeps {
  /** Kill every tracked dev-server process for the conversation. Defaults to
   *  the live orchestration registry. */
  killProcesses?: (conversationId: string) => number;
  /** Revoke the conversation's preview_sessions rows (DB). Defaults to the
   *  live query. Returns the count revoked. */
  revokePreviews?: (conversationId: string) => Promise<number>;
  /** Release the conversation's preview uid. Defaults to the live uid pool. */
  reapUid?: (conversationId: string) => boolean;
  /** Release the conversation's netns allocation (hardened mode). Defaults to
   *  the live netns registry — a no-op in uid mode (nothing allocated). */
  reapNetns?: (conversationId: string) => boolean;
  /** Drop the watcher's watch so it stops polling for this conversation. */
  unwatch?: (conversationId: string) => void;
}

export interface ReapPreviewResult {
  conversationId: string;
  processesKilled: number;
  previewsRevoked: number;
  uidReleased: boolean;
}

/**
 * Reap a conversation's dynamic previews. Fail-safe: every step is guarded so
 * one failure (e.g. a DB hiccup) never blocks the others — killing the
 * untrusted process is the most important step and runs first. Returns a
 * summary for logging/observability.
 */
export async function reapPreviewConversation(
  conversationId: string,
  deps: ReapPreviewDeps = {},
): Promise<ReapPreviewResult> {
  const result: ReapPreviewResult = {
    conversationId,
    processesKilled: 0,
    previewsRevoked: 0,
    uidReleased: false,
  };
  if (!conversationId) return result;

  // 1. Kill the untrusted dev-server processes FIRST.
  try {
    const killer = deps.killProcesses ?? killConversationProcesses;
    result.processesKilled = killer(conversationId);
  } catch (err) {
    log.warn("reap: killing processes failed", { conversationId, error: String(err) });
  }

  // 2. Revoke the DB rows so the proxy fails closed immediately.
  try {
    const revoke =
      deps.revokePreviews ??
      (async (c: string) => {
        const { reapPreviewsForConversation } = await import("../../db/queries/preview-sessions");
        return reapPreviewsForConversation(c);
      });
    result.previewsRevoked = await revoke(conversationId);
  } catch (err) {
    log.warn("reap: revoking previews failed", { conversationId, error: String(err) });
  }

  // 3. Release the preview uid (uid mode) + netns (hardened mode) — whichever
  //    was allocated; the other is a no-op.
  try {
    result.uidReleased = (deps.reapUid ?? reapPreviewUid)(conversationId);
  } catch (err) {
    log.warn("reap: releasing uid failed", { conversationId, error: String(err) });
  }
  try {
    (deps.reapNetns ?? reapPreviewNetns)(conversationId);
  } catch (err) {
    log.warn("reap: releasing netns failed", { conversationId, error: String(err) });
  }

  // 4. Drop the watcher's watch so the daemon stops polling for it.
  //    (Quota accounting is keyed by previewId, not conversationId; the
  //    singleton's per-id buckets are bounded + roll over on their own
  //    window, so there is nothing conversation-scoped to forget here.)
  try {
    deps.unwatch?.(conversationId);
  } catch (err) {
    log.warn("reap: unwatch failed", { conversationId, error: String(err) });
  }

  log.info("preview conversation reaped", {
    conversationId,
    processesKilled: result.processesKilled,
    previewsRevoked: result.previewsRevoked,
    uidReleased: result.uidReleased,
  });
  return result;
}
