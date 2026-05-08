import { desc, eq, and, like, or } from "drizzle-orm";
import { getDb } from "../connection";
import { auditLog } from "../schema";
import type { AuditEntry } from "../schema";

export type { AuditEntry };

export async function insertAuditEntry(
  userId: string | null,
  action: string,
  target?: string,
  metadata?: Record<string, unknown>,
): Promise<string> {
  // Phase 4 §M2 — return the inserted row's id so callers chaining
  // audit rows (spawn-assignment seeding the child's parentAuditId)
  // don't need a follow-up SELECT. Existing void-return callers
  // simply ignore the returned id (back-compat: TS accepts ignoring
  // a non-void Promise).
  const inserted = await getDb()
    .insert(auditLog)
    .values({
      userId,
      action,
      target: target ?? null,
      metadata: metadata ?? null,
    })
    .returning({ id: auditLog.id });
  return inserted[0]?.id ?? "";
}

export async function listAuditLog(opts?: {
  limit?: number;
  offset?: number;
  action?: string;
  userId?: string;
}): Promise<AuditEntry[]> {
  const limit = opts?.limit ?? 100;
  const offset = opts?.offset ?? 0;

  const conditions = [];
  if (opts?.action) conditions.push(eq(auditLog.action, opts.action));
  if (opts?.userId) conditions.push(eq(auditLog.userId, opts.userId));

  const query = getDb().select().from(auditLog);
  const filtered = conditions.length > 0
    ? query.where(conditions.length === 1 ? conditions[0]! : and(...conditions))
    : query;

  return filtered
    .orderBy(desc(auditLog.createdAt))
    .limit(limit)
    .offset(offset);
}

/**
 * Fetch all extension-related audit rows for a single extension. Matches
 * both the new typed `ext:*` actions defined in
 * `src/extensions/audit-actions.ts` AND the pre-existing legacy
 * `extension:*` strings written by older grant/activate endpoints, so
 * the detail page shows a unified history without requiring a data
 * migration of historical rows.
 */
export async function listAuditForExtension(
  extensionId: string,
  opts?: { limit?: number; offset?: number },
): Promise<AuditEntry[]> {
  const limit = opts?.limit ?? 100;
  const offset = opts?.offset ?? 0;
  return getDb()
    .select()
    .from(auditLog)
    .where(and(
      eq(auditLog.target, extensionId),
      or(like(auditLog.action, "ext:%"), like(auditLog.action, "extension:%"))!,
    ))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit)
    .offset(offset);
}
