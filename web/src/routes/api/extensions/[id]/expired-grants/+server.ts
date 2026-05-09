import { json } from "@sveltejs/kit";
import { requireAuth } from "$server/auth/middleware";
import { requireScope } from "$lib/server/security/api-keys";
import { errorJson } from "$lib/server/http-errors";
import { getExtension } from "$server/db/queries/extensions";
import { listExpiredGrantsForExtension } from "$server/db/queries/expired-grants";
import type { RequestHandler } from "./$types";

/**
 * GET /api/extensions/[id]/expired-grants
 *
 * Phase 4 (capability-expiry) — feeds the settings-page
 * `ExpiredGrantsBanner.svelte`. Returns the audit rows the sweep wrote
 * for THIS extension within the last 7 days, projected onto the
 * banner's `ExpiredGrant` prop shape.
 *
 * Auth: any authenticated user — the rows reveal "this extension's
 * grant for shell expired 2 days ago", which is the user's own
 * permission state on the page they're already looking at. The
 * detailed audit drill-down at /api/extensions/[id]/audit remains
 * admin-only because it surfaces actor identifiers + system-internal
 * fields.
 *
 * 404 on unknown extension so the URL doesn't probe the extension id
 * space.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
  const scopeErr = requireScope(locals, "extensions");
  if (scopeErr) return scopeErr;
  requireAuth(locals);

  const ext = await getExtension(params.id);
  if (!ext) return errorJson(404, "Not found");

  const grants = await listExpiredGrantsForExtension(params.id);
  return json({ grants });
};
