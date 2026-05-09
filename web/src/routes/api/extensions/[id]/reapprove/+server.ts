import { json } from "@sveltejs/kit";
import { getExtension, updateExtension } from "$server/db/queries/extensions";
import { ExtensionRegistry } from "$server/extensions/registry";
import { requireAuth, requireRole } from "$server/auth/middleware";
import { requireScope } from "$lib/server/security/api-keys";
import { errorJson } from "$lib/server/http-errors";
import { insertAuditEntry } from "$server/db/queries/audit-log";
import { EXT_AUDIT_ACTIONS } from "$server/extensions/audit-actions";
import type { ExtensionPermissions } from "$server/extensions/types";
import type { RequestHandler } from "./$types";

/**
 * POST /api/extensions/[id]/reapprove
 *
 * Phase 4 (capability-expiry) — settings-page banner re-approve action.
 *
 * Body: { capability: string, scope?: "forever" }
 *
 * Effect: re-grants the manifest's declared permission for the supplied
 * capability family AND resets `grantedPermissions.grantedAt[<key>]` to
 * now. This silences the corresponding banner row and lets the
 * extension's tool calls go through again until the next TTL window.
 *
 * Auth model:
 *   • `scope: "forever"` is admin-only. The settings-page banner
 *     surfaces the same admin gate as the in-chat modal — the modal's
 *     "Approve forever (admin only)" button posts here with the scope
 *     field set, and the server cross-checks the role.
 *   • Default re-approve (no scope) accepts any authenticated user.
 *     This cannot grant MORE than the manifest declares — the new
 *     value is read directly from the install-time manifest, so a
 *     non-admin re-approve is bounded by what the extension's author
 *     declared and the install-time admin already approved.
 *
 * 404 on unknown extension; 400 on unmappable capability (defensive —
 * the banner only surfaces capabilities written by the sweep, which
 * uses the same map both directions).
 */

/**
 * Reverse `mapGrantKeyToExpiryKind` from
 * `src/extensions/perm-expiry-sweep.ts`. The forward map collapses
 * `"filesystem"` → `"filesystem-write"` (conservative tier choice for
 * the sweep). When re-granting, we map back to the grant-record key
 * the manifest declares — both filesystem-read and filesystem-write
 * collapse to the same `filesystem` slot on `ExtensionPermissions`.
 */
function expiryKindToGrantKey(capability: string): string | null {
  switch (capability) {
    case "filesystem-read":
    case "filesystem-write":
      return "filesystem";
    case "network":
      return "network";
    case "shell":
      return "shell";
    case "env":
      return "env";
    case "storage":
      return "storage";
    case "taskEvents":
      return "taskEvents";
    case "appendMessages":
      return "appendMessages";
    case "llm":
      return "llm";
    case "memory":
      return "memory";
    case "lessons":
      return "lessons";
    case "schedule":
      return "schedule";
    default:
      return null;
  }
}

export const POST: RequestHandler = async ({ request, params, locals }) => {
  const scopeErr = requireScope(locals, "extensions");
  if (scopeErr) return scopeErr;
  const user = requireAuth(locals);

  let body: { capability?: unknown; scope?: unknown };
  try {
    body = await request.json();
  } catch {
    return errorJson(400, "Invalid JSON body");
  }
  const capability = typeof body.capability === "string" ? body.capability : "";
  const scope = body.scope;

  if (!capability) return errorJson(400, "capability (string) is required");

  // Defense in depth: the modal's "Approve forever (admin only)" button
  // is gated client-side via the `isAdmin` prop. A tampered DOM could
  // still post this scope from a non-admin session, so reject server-
  // side. The chat-side gate at `/api/tool-calls/:id/permission`
  // applies the same check.
  if (scope !== undefined && scope !== "forever") {
    return errorJson(400, "scope must be 'forever' or unset");
  }
  if (scope === "forever") {
    requireRole(locals, "admin");
  }

  const ext = await getExtension(params.id);
  if (!ext) return errorJson(404, "Not found");

  const grantKey = expiryKindToGrantKey(capability);
  if (!grantKey) return errorJson(400, `Unknown capability: ${capability}`);

  // Re-grant from the manifest. The manifest is the install-time
  // ceiling — re-granting from it cannot elevate beyond what the
  // extension's author declared (and what the install-time admin
  // already approved).
  const manifestPerms = (ext.manifest?.permissions ?? {}) as Record<string, unknown>;
  const manifestValue = manifestPerms[grantKey as keyof typeof manifestPerms];

  // Build the next granted permissions snapshot. We start from the
  // current value, restore the matching slot from the manifest (if
  // declared), and bump `grantedAt[grantKey]` to now.
  const prior = (ext.grantedPermissions ?? null) as ExtensionPermissions | null;
  const priorGrantedAt = prior?.grantedAt ?? {};
  const nextGrantedAt: Record<string, number> = { ...priorGrantedAt, [grantKey]: Date.now() };

  // The mutator merges the prior snapshot, applies the manifest value
  // to the affected slot, and overwrites grantedAt. We allow `any`
  // here because `ExtensionPermissions` has heterogeneous field types
  // and TS can't narrow on a runtime `grantKey` string.
  const next: any = { ...(prior ?? {}), grantedAt: nextGrantedAt };
  if (manifestValue !== undefined) {
    next[grantKey] = manifestValue;
  }

  const updated = await updateExtension(params.id, {
    grantedPermissions: next as ExtensionPermissions,
  });
  await ExtensionRegistry.getInstance().reload();

  // Audit row — re-approval is a deliberate consent event so it goes
  // into the audit trail. We use `PERMISSION_GRANTED` (not a new
  // action) because this re-grant is observable as such for governance
  // purposes; `metadata.reason` distinguishes it as a re-approval.
  try {
    await insertAuditEntry(user.id, EXT_AUDIT_ACTIONS.PERMISSION_GRANTED, params.id, {
      permission: grantKey,
      oldValue: prior?.[grantKey as keyof ExtensionPermissions],
      newValue: manifestValue,
      actor: user.id,
      reason: scope === "forever" ? "user-reapprove (admin: forever)" : "user-reapprove",
      capability,
    });
  } catch {
    /* swallow — audit-write failure already routed through persistError */
  }

  return json({ reapproved: true, capability, grantKey, extension: updated });
};
