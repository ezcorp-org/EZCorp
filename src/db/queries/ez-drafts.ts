import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { getDb } from "../connection";
import { ezDrafts } from "../schema";

/**
 * Phase 48: Ez concierge drafts.
 *
 * Each `propose_*` server tool persists a draft row (kind ∈
 * { 'project' | 'agent' | 'extension' }) and returns its id in the tool
 * result. The Ez panel renders that as a one-button "Open prefilled
 * form" card whose URL embeds the draft id. The destination page reads
 * `?prefill=<id>`, hydrates form state from `payload`, and stamps
 * `consumedAt` on submit. Rows expire 24h after `createdAt` regardless
 * of consumption — sweepExpired() is the GC.
 *
 * Ownership: every read/consume/delete is scoped to userId so an
 * attacker cannot redeem another user's draft by guessing its id.
 */

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export type EzDraftKind = "project" | "agent" | "extension";

export type EzDraftRow = typeof ezDrafts.$inferSelect;

export async function createDraft(data: {
  userId: string;
  kind: EzDraftKind;
  payload: Record<string, unknown>;
  /** Override TTL (ms). Default 24h. */
  ttlMs?: number;
}): Promise<EzDraftRow> {
  if (!data.userId) throw new Error("userId is required");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (data.ttlMs ?? TWENTY_FOUR_HOURS_MS));
  const rows = await getDb()
    .insert(ezDrafts)
    .values({
      userId: data.userId,
      kind: data.kind,
      payload: data.payload,
      createdAt: now,
      expiresAt,
    })
    .returning();
  return rows[0]!;
}

/**
 * Read a draft by id, scoped to its owning user. Returns undefined when
 *  - the draft doesn't exist
 *  - the caller is not the owner
 *  - the draft has expired (regardless of consumption)
 *
 * Note: a consumed-but-not-expired draft is still returned — the caller
 * may want to display "this draft was already used" rather than a 404.
 * Filter on `consumedAt !== null` at the call site if needed.
 */
export async function getDraft(id: string, userId: string): Promise<EzDraftRow | undefined> {
  if (!id || !userId) return undefined;
  const now = new Date();
  const rows = await getDb()
    .select()
    .from(ezDrafts)
    .where(and(eq(ezDrafts.id, id), eq(ezDrafts.userId, userId)));
  const row = rows[0];
  if (!row) return undefined;
  if (row.expiresAt.getTime() <= now.getTime()) return undefined;
  return row;
}

/**
 * Mark a draft as consumed. Idempotent: a second consume on the same row
 * returns the existing consumedAt timestamp (does not advance it).
 *
 * Returns undefined when the draft is missing, expired, or owned by a
 * different user — same gates as getDraft.
 */
export async function consumeDraft(id: string, userId: string): Promise<EzDraftRow | undefined> {
  const existing = await getDraft(id, userId);
  if (!existing) return undefined;
  if (existing.consumedAt) return existing;

  const rows = await getDb()
    .update(ezDrafts)
    .set({ consumedAt: new Date() })
    .where(and(eq(ezDrafts.id, id), eq(ezDrafts.userId, userId), isNull(ezDrafts.consumedAt)))
    .returning();
  return rows[0] ?? existing;
}

/**
 * Delete every draft whose expiresAt is in the past. Returns the number
 * of deleted rows. Safe to call from a cron-like sweep; idempotent.
 */
export async function sweepExpired(now: Date = new Date()): Promise<number> {
  const rows = await getDb()
    .delete(ezDrafts)
    .where(lt(ezDrafts.expiresAt, now))
    .returning({ id: ezDrafts.id });
  return rows.length;
}

/**
 * Diagnostic helper: list a user's still-valid drafts. Excludes expired
 * rows; consumed-but-not-expired rows are included so the UI can show
 * "already used" state.
 */
export async function listActiveDraftsForUser(userId: string): Promise<EzDraftRow[]> {
  if (!userId) return [];
  const now = new Date();
  return getDb()
    .select()
    .from(ezDrafts)
    .where(and(eq(ezDrafts.userId, userId), gt(ezDrafts.expiresAt, now)));
}
