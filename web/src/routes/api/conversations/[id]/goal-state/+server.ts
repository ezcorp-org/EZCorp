import { json } from "@sveltejs/kit";
import { requireAuth } from "$server/auth/middleware";
import { requireScope } from "$lib/server/security/api-keys";
import { errorJson } from "$lib/server/http-errors";
import { resolveRootConversationForOwnership } from "$lib/server/conversation-ownership";
import { getGoalHost } from "$lib/server/context";
import { readPersistedGoal } from "$server/runtime/goal-host";
import type { RequestHandler } from "./$types";

/**
 * GET /api/conversations/[id]/goal-state — initial-state hydration for
 * the `◎ /goal active|paused` chip (PRD §5.9, FR-13 / FR-15 / FR-20).
 *
 * Why a dedicated endpoint:
 *   - `GET /api/conversations/[id]` returns the `Conversation` row but
 *     does NOT expose `metadata.goal` (api.ts:322 — the type omits
 *     `metadata` entirely; the conversation route projects to a
 *     curated shape on purpose).
 *   - The chip needs both the persisted condition AND the in-memory
 *     `GoalRecord` (armedAt / turnsEvaluated / lastReason — those live
 *     only in the goal-host's in-memory map; they reset on
 *     resume/restart by spec). Two reads belong server-side so the
 *     client gets one consistent snapshot.
 *   - Subsequent updates arrive via the `goal:update` SSE event
 *     (FR-20) — this route is mount-time hydration only.
 *
 * Auth: same root-walk ownership as the messages route — a non-owner
 * (or unauthenticated request) gets 404 (matches the messages route's
 * "Not found" so we never leak conversation existence).
 *
 * Response shape (stable contract — used by GoalPill.svelte):
 *   { state: "active" | "paused" | "off",
 *     condition?: string,
 *     armedAt?: number,           // epoch ms; absent unless in-memory record exists
 *     turnsEvaluated?: number,
 *     lastReason?: string | null }
 *
 * - `state:"off"` is returned when there is no `metadata.goal`. The
 *   pill renders nothing in this case.
 * - `state:"paused"` is returned when `metadata.goal` is present AND
 *   the in-memory `GoalRecord.status === "paused"`. If `metadata.goal`
 *   is present but no in-memory record exists yet (boot sweep raced /
 *   conv created after boot), we report `"paused"` only if it was
 *   left paused before the restart — which we cannot tell because
 *   paused-ness lives ONLY in-memory by design (D3). In that case we
 *   default to `"active"` so the chip surfaces immediately; the next
 *   POST will rebuild the record via FR-13b and the SSE stream
 *   reconciles. The pill is tolerant of this — see its mount logic.
 * - `lastReason` may come from the in-memory record OR from
 *   `metadata.goal.lastReason` (the persisted mirror — FR-15) so the
 *   status card surfaces a useful value even after a restart that
 *   wiped the in-memory record.
 *
 * The endpoint is a thin projection; all decisions (armed predicate,
 * paused semantics) live in `goal-host`. We deliberately do NOT call
 * `goalHost.handleGoalCommand` here — that path mutates state. This
 * is read-only.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
  const scopeErr = requireScope(locals, "read");
  if (scopeErr) return scopeErr;
  const user = requireAuth(locals);

  // Same ownership gate the messages route uses. 404 (not 403) so the
  // existence of the conversation is not disclosed to non-owners.
  const ownership = await resolveRootConversationForOwnership(params.id, user);
  if (!ownership) return errorJson(404, "Not found");

  const persisted = await readPersistedGoal(params.id);
  if (!persisted) {
    // No goal armed on this conversation — pill renders nothing.
    return json({ state: "off" as const });
  }

  // `metadata.goal` present ⇒ armed (canonical disarm is deletion of
  // the key, per D3/FR-14). The in-memory record is the source of
  // truth for paused-vs-active and for the timer/turn counters.
  const host = getGoalHost();
  const record = host?.getRecord(params.id);

  // Defaults when there is no in-memory record yet (boot raced, or a
  // conversation created after boot). The pill needs SOMETHING to
  // render or the chip would disappear during a benign window. We
  // default to "active" with the persisted condition + last reason;
  // the next user message triggers FR-13b which rebuilds the record
  // and the SSE stream then reconciles. The timer starts fresh in
  // that branch anyway by spec.
  const state: "active" | "paused" = record?.status ?? "active";
  return json({
    state,
    condition: persisted.condition,
    ...(record ? {
      armedAt: record.armedAt,
      turnsEvaluated: record.turnsEvaluated,
      lastReason: record.lastReason,
    } : {
      // No in-memory record — surface the persisted mirror so the
      // status card has a reason to show even before the record is
      // rebuilt (FR-15).
      lastReason: persisted.lastReason,
    }),
  });
};
