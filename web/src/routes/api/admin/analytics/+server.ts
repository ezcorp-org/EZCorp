import type { RequestHandler } from "./$types";
import { json } from "@sveltejs/kit";
import { requireRole } from "$server/auth/middleware";
import { requireScope } from "$lib/server/security/api-keys";
import {
  getChatActivity,
  getModelUsage,
  getAgentStats,
  getExtensionStats,
  getUserStats,
  getToolUsageByTool,
  getToolUsageByAgent,
  getToolUsageByUser,
  getToolUsageByModel,
} from "$server/db/queries/analytics";

export const GET: RequestHandler = async ({ url, locals }) => {
  const scopeErr = requireScope(locals, "admin");
  if (scopeErr) return scopeErr;
  try {
    requireRole(locals, "admin");

    const days = Math.min(
      Math.max(parseInt(url.searchParams.get("days") ?? "30", 10) || 30, 1),
      365,
    );

    // Run the nine aggregations SEQUENTIALLY, not via Promise.all.
    //
    // Each helper issues 1–3 queries; getUserStats issues 3. Fanned out with
    // Promise.all, a single request demands up to 11 concurrent pooled
    // connections. The external-Postgres path uses Bun.sql's default pool
    // (max: 10), so even TWO concurrent requests (e.g. the admin dashboard's
    // overlapping initial-load + auto-refresh) over-subscribe the pool. Because
    // Promise.all holds every already-resolved leg's connection-acquire intent
    // until the whole batch settles, the pool hits a hold-and-wait deadlock that
    // never recovers — wedging not just this route but the entire process (every
    // other endpoint shares the same pool). Reproduced at N=2 concurrent requests
    // (40s+ HTTP-000 hang); raising the pool size only moves the cliff because
    // per-request demand still scales with fan-out.
    //
    // Running sequentially caps each request at ONE in-flight connection, so the
    // pool serialises requests gracefully instead of deadlocking (verified: 100
    // concurrent requests settle in ~150ms at the default pool). The queries are
    // 1–3ms each, so the lost intra-request parallelism is negligible. The
    // response shape is unchanged.
    const chatActivity = await getChatActivity(days);
    const modelUsage = await getModelUsage(days);
    const agentStats = await getAgentStats();
    const extensionStats = await getExtensionStats();
    const userStats = await getUserStats();
    const toolUsageByTool = await getToolUsageByTool(days);
    const toolUsageByAgent = await getToolUsageByAgent(days);
    const toolUsageByUser = await getToolUsageByUser(days);
    const toolUsageByModel = await getToolUsageByModel(days);

    return json({
      chatActivity,
      modelUsage,
      agentStats,
      extensionStats,
      userStats,
      toolUsage: {
        byTool: toolUsageByTool,
        byAgent: toolUsageByAgent,
        byUser: toolUsageByUser,
        byModel: toolUsageByModel,
      },
    });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
};
