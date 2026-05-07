import { desc, eq, and, like, or } from "drizzle-orm";
import { getDb } from "../connection";
import { auditLog } from "../schema";
import type { AuditEntry } from "../schema";
import { redactForAudit } from "../../extensions/audit-redaction";

export type { AuditEntry };

/**
 * Insert a row into the shared `audit_log` table.
 *
 * The `metadata` argument is ALWAYS routed through `redactForAudit`
 * before persistence — this is the single chokepoint that every existing
 * call site (18+ across `bundled.ts`, `task-events-handler.ts`, the
 * permission grant/revoke endpoints, etc.) plus every future capability
 * handler relies on. No call site is permitted to bypass this wrapper
 * (i.e. there must be exactly one `getDb().insert(auditLog).values(...)`
 * invocation in the codebase, here).
 *
 * Ref: tasks/v1.3-phase-50-audit-foundation.md § Phase 50.2.
 */
export async function insertAuditEntry(
  userId: string | null,
  action: string,
  target?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const safeMetadata = metadata
    ? (redactForAudit(metadata).redacted as Record<string, unknown> | null)
    : null;
  await getDb().insert(auditLog).values({
    userId,
    action,
    target: target ?? null,
    metadata: safeMetadata,
  });
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
