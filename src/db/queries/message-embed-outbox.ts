import { eq, sql, type SQL } from "drizzle-orm";
import { messageChunks, messageEmbedOutbox } from "../schema";

/**
 * Minimal structural handle accepted by {@link enqueueEmbedJob}. Both the
 * top-level drizzle db AND a `db.transaction((tx) => …)` callback's `tx`
 * satisfy this shape, which is the whole point: the caller MUST pass its own
 * handle so the upsert runs INSIDE the enclosing transaction.
 *
 * PITFALL (Phase 63 research Pitfall 1): this module must NEVER call
 * `getDb()` itself. Fetching a fresh handle here would open a SECOND
 * connection/statement outside the caller's transaction, silently breaking
 * the IDX-04 atomicity guarantee (the message insert could roll back while
 * the outbox enqueue had already committed on its own connection).
 */
export type EmbedJobTx = {
  insert: (table: typeof messageEmbedOutbox) => {
    values: (v: {
      messageId: string;
      conversationId: string;
      status: "pending";
      attempts: number;
    }) => {
      onConflictDoUpdate: (cfg: {
        target: typeof messageEmbedOutbox.messageId;
        set: { status: "pending"; attempts: number; updatedAt: ReturnType<typeof sql> };
      }) => Promise<unknown>;
    };
  };
};

/**
 * Enqueue (or re-enqueue) an embed job for a message via an upsert on the
 * `message_embed_outbox` table.
 *
 * `message_id` is the PRIMARY KEY (one row per message), so:
 *   - first call for a message inserts a fresh `pending` row (attempts=0);
 *   - any subsequent call for the SAME message id upserts, resetting
 *     status→`pending`, attempts→0, updated_at→NOW() WITHOUT creating a
 *     duplicate row. This is what makes a content edit re-enqueue cleanly.
 *
 * `tx` is REQUIRED and must be the caller's transaction handle (see
 * {@link EmbedJobTx}). Never default it to `getDb()`.
 */
export async function enqueueEmbedJob(
  tx: EmbedJobTx,
  messageId: string,
  conversationId: string,
): Promise<void> {
  await tx
    .insert(messageEmbedOutbox)
    .values({ messageId, conversationId, status: "pending", attempts: 0 })
    .onConflictDoUpdate({
      target: messageEmbedOutbox.messageId,
      set: { status: "pending", attempts: 0, updatedAt: sql`NOW()` },
    });
}

/**
 * Minimal structural handle accepted by {@link clearMessageEmbedState} — a
 * `.delete(table).where(cond)` chain. Same contract as {@link EmbedJobTx}:
 * the caller passes its own transaction handle so the deletes run INSIDE the
 * enclosing transaction (this module never calls `getDb()` itself).
 */
export type ClearEmbedTx = {
  delete: (table: typeof messageEmbedOutbox | typeof messageChunks) => {
    where: (cond: SQL<unknown> | undefined) => Promise<unknown>;
  };
};

/**
 * Drop a message's entire embed-index state — its outbox job AND any chunks
 * already written for it. Called when an edit turns a previously-eligible
 * message embed-INELIGIBLE (e.g. cleared to whitespace), so neither a pending
 * outbox row nor stale chunks survive pointing at content that is no longer
 * indexable. Idempotent: deleting absent rows is a harmless no-op, so it is
 * safe to call on every ineligible edit regardless of prior state.
 *
 * `tx` is REQUIRED and must be the caller's transaction handle — never default
 * it to `getDb()` (see {@link EmbedJobTx} for why).
 */
export async function clearMessageEmbedState(tx: ClearEmbedTx, messageId: string): Promise<void> {
  await tx.delete(messageEmbedOutbox).where(eq(messageEmbedOutbox.messageId, messageId));
  await tx.delete(messageChunks).where(eq(messageChunks.messageId, messageId));
}
