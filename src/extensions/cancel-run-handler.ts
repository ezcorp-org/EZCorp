/**
 * Handles `ezcorp/cancel-run` reverse RPC (Phase 4 — §5.3).
 *
 * Lets an extension cancel a sub-run it previously originated via
 * `ezcorp/spawn-assignment`. The host invokes `executor.cancelRun`
 * (the same primitive the legacy `invoke-agent.ts` calls on signal
 * abort) and — per §5.3's "Slot-release semantics" — immediately
 * decrements the caller's concurrent quota counter so the cancelled
 * slot is available for the very next spawn without waiting for the
 * async bus-driven `run:cancel` notification to round-trip.
 *
 * Enforcement ladder (strict order):
 *   1. Kill-switch (`EZCORP_DISABLE_CAPABILITY_TOOLS=1`)
 *   2. `granted.spawnAgents` present + `maxPerHour > 0`  — same gate
 *      as spawn: an extension that can spawn can cancel its own spawns.
 *   3. Payload validation — non-empty `agentRunId` string.
 *   4. Ownership — `agentRunId` must be in the caller's live
 *      reservation set. Cross-extension cancel is rejected with
 *      `reason: "not-owned"`.
 *   5. Dispatch — call `executor.cancelRun(agentRunId)`. If it
 *      returns `true`, release the slot and audit `reason: "cancelled"`.
 *      If it returns `false` (run already torn down), release the
 *      stale set entry defensively and audit `reason: "missing-run"`.
 *
 * The bus-driven release in `spawn-quota.ts` remains idempotent against
 * the manual release here — when `executor.cancelRun` later emits
 * `run:cancel` on the bus, `release(token)` is a no-op because the
 * token has already been removed from the tracking maps.
 */

import type {
  JsonRpcRequest,
  JsonRpcResponse,
  ExtensionPermissions,
} from "./types";
import type { AgentExecutor } from "../runtime/executor";
import type { SpawnQuota } from "./spawn-quota";
import { capabilityToolsDisabled } from "./capability-flags";
import { insertAuditEntry } from "../db/queries/audit-log";
import { EXT_AUDIT_ACTIONS } from "./audit-actions";
import { rpcError, rpcResult } from "./json-rpc";

export interface CancelRunContext {
  /** Acting user; `"unknown"` is tolerated (audit writes `null`). */
  userId: string;
  grantedPermissions: ExtensionPermissions;
  executor: AgentExecutor;
  quota: SpawnQuota;
}

type CancelReason = "cancelled" | "not-owned" | "missing-run" | "permission-missing";

async function auditCancel(
  extensionId: string,
  userId: string | null,
  reason: CancelReason,
  extra: Record<string, unknown>,
): Promise<void> {
  try {
    await insertAuditEntry(
      userId,
      EXT_AUDIT_ACTIONS.SPAWN_CANCELLED,
      extensionId,
      {
        permission: "spawnAgents",
        oldValue: undefined,
        newValue: undefined,
        actor: "system",
        reason,
        ...extra,
      },
    );
  } catch {
    // Audit failure must never break the response path.
  }
}

export async function handleCancelRunRpc(
  extensionId: string,
  req: JsonRpcRequest,
  ctx: CancelRunContext,
): Promise<JsonRpcResponse> {
  const params = (req.params ?? {}) as Record<string, unknown>;
  const auditUser = ctx.userId && ctx.userId !== "unknown" ? ctx.userId : null;

  // 1. Kill-switch.
  if (capabilityToolsDisabled()) {
    await auditCancel(extensionId, auditUser, "permission-missing", {
      agentRunId: typeof params.agentRunId === "string" ? params.agentRunId : null,
    });
    return rpcError(req.id, -32001, "spawnAgents permission not granted");
  }

  // 2. Permission check — structural (spawnAgents is an object, not a bool).
  const granted = ctx.grantedPermissions.spawnAgents;
  if (!granted || typeof granted.maxPerHour !== "number" || granted.maxPerHour <= 0) {
    await auditCancel(extensionId, auditUser, "permission-missing", {
      agentRunId: typeof params.agentRunId === "string" ? params.agentRunId : null,
    });
    return rpcError(req.id, -32001, "spawnAgents permission not granted");
  }

  // 3. Payload validation.
  const agentRunId =
    typeof params.agentRunId === "string" && params.agentRunId.trim()
      ? params.agentRunId
      : undefined;
  if (!agentRunId) {
    return rpcError(req.id, -32602, "'agentRunId' must be a non-empty string");
  }

  // 4. Ownership gate — caller must own the run.
  if (!ctx.quota.isOwner(extensionId, agentRunId)) {
    await auditCancel(extensionId, auditUser, "not-owned", { agentRunId });
    return rpcResult(req.id, { v: 1, cancelled: false, reason: "not-owned" });
  }

  // 5. Dispatch.
  const didCancel = ctx.executor.cancelRun(agentRunId);
  // Release the slot unconditionally — whether the run actually existed
  // or not, the caller's reservation is now stale. `spawn-quota.release`
  // is idempotent against the later bus-driven release.
  ctx.quota.release(agentRunId);

  if (!didCancel) {
    await auditCancel(extensionId, auditUser, "missing-run", { agentRunId });
    return rpcResult(req.id, { v: 1, cancelled: false, reason: "missing-run" });
  }

  await auditCancel(extensionId, auditUser, "cancelled", { agentRunId });
  return rpcResult(req.id, { v: 1, cancelled: true });
}
