import type { RequestHandler } from "./$types";
import { json } from "@sveltejs/kit";
import { requireRole } from "$server/auth/middleware";
import { requireScope } from "$lib/server/security/api-keys";
import { getDb } from "$server/db/connection";
import { getEmbedProgress } from "$server/db/queries/message-embed-outbox";

/**
 * Read-only embed-index progress for the admin dashboard (OPS-04, web half).
 *
 * Thin glue over the shared getEmbedProgress() — the single source of truth
 * also feeding the backfill CLI's --status flag. Auth/scope/role gate mirrors
 * admin/system/+server.ts verbatim. getEmbedProgress takes a db handle, so we
 * pass getDb() (the query module never calls getDb itself — Phase 63 Pitfall 1).
 */
export const GET: RequestHandler = async ({ locals }) => {
  const scopeErr = requireScope(locals, "admin");
  if (scopeErr) return scopeErr;
  try {
    requireRole(locals, "admin");

    const progress = await getEmbedProgress(getDb());
    return json(progress);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
};
