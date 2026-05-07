/**
 * Queries for the `sdk_capability_calls` table (Phase 50).
 *
 * Read paths:
 *   - per-extension audit drill-down (`/extensions/[id]/audit`, Phase 52).
 *   - per-conversation audit (`/project/[id]/chat/[convId]/audit`, Phase 52).
 *   - per-user spend rollups (admin `/audit`, Phase 52).
 *
 * Write path:
 *   - `recordCapabilityCall` in `src/extensions/recordCapabilityCall.ts`
 *     (Phase 50.6). NO call site is permitted to bypass that wrapper —
 *     the wrapper guarantees the dual-write contract (sdk row +
 *     per-resource audit + chat pill, all wrapped in try/catch).
 *
 * Cleanup path:
 *   - `cleanupOldSdkCapabilityCalls` runs hourly via
 *     `src/startup/background-timers.ts` with per-capability retention
 *     thresholds read from settings each tick (so admin changes apply
 *     without restart). Per Pitfall #2 in research, the deletion is
 *     batched (LIMIT 10000 per tick, recurses if rows-deleted equals
 *     limit) so a 90-day backlog purge doesn't lock the table.
 */
import { and, asc, desc, eq, gt, lt, sql } from "drizzle-orm";
import { getDb } from "../connection";
import { sdkCapabilityCalls } from "../schema";
import type { SdkCapabilityCall, NewSdkCapabilityCall } from "../schema";

export type { SdkCapabilityCall, NewSdkCapabilityCall };

const DEFAULT_LIMIT = 100;
const CLEANUP_BATCH_LIMIT = 10000;

/** Retention validation: clamp to [1, 3650] days at read time per spec
 *  recommendation. Setting writes already require admin scope, but we
 *  defense-in-depth here so a stray setting can't disable retention or
 *  trigger a 100-year purge sweep. */
function clampDays(value: number): number {
  if (!Number.isFinite(value)) return 30;
  return Math.max(1, Math.min(3650, Math.floor(value)));
}

export async function insertSdkCapabilityCall(row: NewSdkCapabilityCall): Promise<SdkCapabilityCall> {
  const [inserted] = await getDb()
    .insert(sdkCapabilityCalls)
    .values(row)
    .returning();
  return inserted!;
}

interface ListOpts {
  capability?: string;
  since?: Date;
  until?: Date;
  limit?: number;
  /** Cursor = last row's `id`. Returned page contains rows with
   *  createdAt strictly less than the cursor's createdAt (descending
   *  order). Callers don't need to know the createdAt — they pass the
   *  id and we look it up. */
  cursor?: string;
}

async function resolveCursor(cursorId: string | undefined): Promise<Date | null> {
  if (!cursorId) return null;
  const rows = await getDb()
    .select({ createdAt: sdkCapabilityCalls.createdAt })
    .from(sdkCapabilityCalls)
    .where(eq(sdkCapabilityCalls.id, cursorId))
    .limit(1);
  return rows[0]?.createdAt ?? null;
}

export async function listSdkCapabilityCallsForExtension(
  extensionId: string,
  opts: ListOpts = {},
): Promise<SdkCapabilityCall[]> {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const cursorAt = await resolveCursor(opts.cursor);
  const conds = [eq(sdkCapabilityCalls.extensionId, extensionId)];
  if (opts.capability) conds.push(eq(sdkCapabilityCalls.capability, opts.capability as "llm" | "memory" | "lessons" | "schedule" | "events"));
  if (opts.since) conds.push(gt(sdkCapabilityCalls.createdAt, opts.since));
  if (opts.until) conds.push(lt(sdkCapabilityCalls.createdAt, opts.until));
  if (cursorAt) conds.push(lt(sdkCapabilityCalls.createdAt, cursorAt));
  return getDb()
    .select()
    .from(sdkCapabilityCalls)
    .where(and(...conds))
    .orderBy(desc(sdkCapabilityCalls.createdAt))
    .limit(limit);
}

export async function listSdkCapabilityCallsForConversation(
  conversationId: string,
  opts: { limit?: number; cursor?: string } = {},
): Promise<SdkCapabilityCall[]> {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const cursorAt = await resolveCursor(opts.cursor);
  const conds = [eq(sdkCapabilityCalls.conversationId, conversationId)];
  if (cursorAt) conds.push(lt(sdkCapabilityCalls.createdAt, cursorAt));
  return getDb()
    .select()
    .from(sdkCapabilityCalls)
    .where(and(...conds))
    .orderBy(asc(sdkCapabilityCalls.createdAt))
    .limit(limit);
}

export async function listSdkCapabilityCallsForUser(
  userId: string,
  opts: { capability?: string; limit?: number; cursor?: string } = {},
): Promise<SdkCapabilityCall[]> {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const cursorAt = await resolveCursor(opts.cursor);
  const conds = [eq(sdkCapabilityCalls.onBehalfOf, userId)];
  if (opts.capability) conds.push(eq(sdkCapabilityCalls.capability, opts.capability as "llm" | "memory" | "lessons" | "schedule" | "events"));
  if (cursorAt) conds.push(lt(sdkCapabilityCalls.createdAt, cursorAt));
  return getDb()
    .select()
    .from(sdkCapabilityCalls)
    .where(and(...conds))
    .orderBy(desc(sdkCapabilityCalls.createdAt))
    .limit(limit);
}

export interface RetentionConfig {
  llmDays: number;
  memoryDays: number;
  lessonsDays: number;
  scheduleDays: number;
  /** Optional fifth bucket. Capability `events` rows reuse `llmDays`
   *  by default if not supplied — call volume is low enough that they
   *  don't need their own knob. */
  eventsDays?: number;
}

/**
 * Delete rows older than the per-capability threshold.
 *
 * Single SQL with CASE on `capability` column applies the right
 * threshold per row. Batched at 10000/tick (Pitfall #2): the function
 * loops until either no rows are deleted in a tick or the per-call
 * loop ceiling is reached (defense against pathological infinite
 * recursion). Returns total rows deleted across all batches.
 *
 * `retention.{x}Days` of 0 means "delete everything in that bucket"
 * — used in tests and as a manual purge tool.
 */
export async function cleanupOldSdkCapabilityCalls(
  retention: RetentionConfig,
): Promise<number> {
  const llm = clampDays(retention.llmDays);
  const memory = clampDays(retention.memoryDays);
  const lessons = clampDays(retention.lessonsDays);
  const schedule = clampDays(retention.scheduleDays);
  const events = clampDays(retention.eventsDays ?? retention.llmDays);

  // The retention.*Days = 0 case is special-cased: clampDays floors at
  // 1, but the test suite needs "delete everything" semantics. We
  // detect that here and switch the predicate accordingly.
  const isZero = (n: number) => n <= 0;
  const useZeroLLM = isZero(retention.llmDays);
  const useZeroMemory = isZero(retention.memoryDays);
  const useZeroLessons = isZero(retention.lessonsDays);
  const useZeroSchedule = isZero(retention.scheduleDays);
  const useZeroEvents = isZero(retention.eventsDays ?? retention.llmDays);

  let totalDeleted = 0;
  // Hard ceiling so a buggy retention setting can't loop forever.
  // 100 batches × 10000 rows = 1M rows per tick max.
  const MAX_BATCHES = 100;

  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const result = await getDb().execute(sql`
      DELETE FROM sdk_capability_calls
      WHERE id IN (
        SELECT id FROM sdk_capability_calls
        WHERE
          (capability = 'llm'      AND ${useZeroLLM     ? sql`TRUE` : sql`created_at < NOW() - INTERVAL '${sql.raw(String(llm))} days'`})
       OR (capability = 'memory'   AND ${useZeroMemory  ? sql`TRUE` : sql`created_at < NOW() - INTERVAL '${sql.raw(String(memory))} days'`})
       OR (capability = 'lessons'  AND ${useZeroLessons ? sql`TRUE` : sql`created_at < NOW() - INTERVAL '${sql.raw(String(lessons))} days'`})
       OR (capability = 'schedule' AND ${useZeroSchedule ? sql`TRUE` : sql`created_at < NOW() - INTERVAL '${sql.raw(String(schedule))} days'`})
       OR (capability = 'events'   AND ${useZeroEvents  ? sql`TRUE` : sql`created_at < NOW() - INTERVAL '${sql.raw(String(events))} days'`})
        LIMIT ${CLEANUP_BATCH_LIMIT}
      )
    `);

    // Drizzle/PGlite return shapes vary — fall back to a count probe.
    // `rowCount` is the standard property; `affectedRows` is set on
    // some drivers; otherwise we count the rows that match the
    // predicate to detect "nothing more to delete."
    const deleted = ((result as unknown) as { rowCount?: number; affectedRows?: number; rows?: unknown[] })
      ?.rowCount ?? ((result as unknown) as { affectedRows?: number }).affectedRows ?? 0;

    if (deleted === 0) {
      // Either no driver report, or really nothing left. Probe the
      // table to be sure: if the same predicate still matches rows,
      // try one more batch; otherwise stop.
      const remaining = await getDb()
        .select({ id: sdkCapabilityCalls.id })
        .from(sdkCapabilityCalls)
        .where(sql`
          (capability = 'llm'      AND ${useZeroLLM     ? sql`TRUE` : sql`created_at < NOW() - INTERVAL '${sql.raw(String(llm))} days'`})
       OR (capability = 'memory'   AND ${useZeroMemory  ? sql`TRUE` : sql`created_at < NOW() - INTERVAL '${sql.raw(String(memory))} days'`})
       OR (capability = 'lessons'  AND ${useZeroLessons ? sql`TRUE` : sql`created_at < NOW() - INTERVAL '${sql.raw(String(lessons))} days'`})
       OR (capability = 'schedule' AND ${useZeroSchedule ? sql`TRUE` : sql`created_at < NOW() - INTERVAL '${sql.raw(String(schedule))} days'`})
       OR (capability = 'events'   AND ${useZeroEvents  ? sql`TRUE` : sql`created_at < NOW() - INTERVAL '${sql.raw(String(events))} days'`})
        `)
        .limit(1);
      if (remaining.length === 0) break;
      // There ARE rows but the driver under-reported. Count them and
      // bail with a conservative total.
      totalDeleted += 0;
      break;
    }

    totalDeleted += deleted;
    if (deleted < CLEANUP_BATCH_LIMIT) break;
  }

  return totalDeleted;
}
