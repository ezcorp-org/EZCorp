import { resolve } from "node:path";
import { json } from "@sveltejs/kit";
import { errorJson } from "$lib/server/http-errors";
import { requireAuth } from "$server/auth/middleware";
import { requireScope } from "$lib/server/security/api-keys";
import * as projectQueries from "$server/db/queries/projects";
import * as featureQueries from "$server/db/queries/features";
import { scanFeatures } from "$server/runtime/scan/feature-scan";
import type { RequestHandler } from "./$types";

/**
 * Feature Index — synchronous scan endpoint.
 *
 * POST /api/projects/:id/features/scan
 *
 * Walks the project's filesystem (via `scanFeatures`), upserts the
 * results as `source='agent'` features, and replaces each agent
 * feature's `source='scan'` files. User-pinned files
 * (`source='user'`) and user-renamed features (`source='user'`)
 * survive every rescan — the load-bearing invariant.
 *
 * Returns the post-scan list of features with file counts (same shape
 * as GET /api/projects/:id/features) so the UI can render in one
 * round trip.
 *
 * Synchronous: the scan is sub-second on real-world projects (no
 * LLM calls, plain FS walk). If that ever becomes false, the
 * design doc has us deferring async/streaming progress to a follow-up.
 */
export const POST: RequestHandler = async ({ params, locals }) => {
  const scopeErr = requireScope(locals, "chat");
  if (scopeErr) return scopeErr;
  requireAuth(locals);

  const project = await projectQueries.getProject(params.id);
  if (!project) return errorJson(404, "Project not found");
  if (!project.path) return errorJson(400, "Project has no filesystem path configured");

  // Resolve to absolute so symlink-escape gets the canonical root.
  const projectRoot = resolve(project.path);
  const scanned = await scanFeatures(projectRoot);

  // Index existing features by name for the upsert pass. Pulling them
  // all once (per project, sub-100 features in practice) is cheaper
  // than a getFeature() round trip per scanned candidate.
  const existing = await featureQueries.listFeatures(params.id);
  const byName = new Map(existing.map((f) => [f.name, f]));

  for (const candidate of scanned) {
    const prior = byName.get(candidate.name);
    if (!prior) {
      // Brand-new agent-discovered feature.
      const created = await featureQueries.createFeature({
        projectId: params.id,
        name: candidate.name,
        description: candidate.description,
        source: "agent",
      });
      await featureQueries.replaceAgentFiles(created.id, candidate.files);
      continue;
    }

    if (prior.source === "user") {
      // User has claimed this slug — do NOT touch the description or
      // source. Refresh only the agent file slice (replaceAgentFiles
      // never deletes user-pinned rows, so this is safe even on
      // user-owned features).
      await featureQueries.replaceAgentFiles(prior.id, candidate.files);
      continue;
    }

    // Agent-owned feature: refresh the description (keeps the
    // "Files under <relpath>" placeholder in sync if the dir was moved
    // and re-discovered) + replace its agent file slice.
    if (prior.description !== candidate.description) {
      await featureQueries.updateFeature(prior.id, {
        description: candidate.description,
      });
    }
    await featureQueries.replaceAgentFiles(prior.id, candidate.files);
  }

  // Note: features that EXISTED before but did NOT appear in this
  // scan are deliberately not deleted. The directory may have been
  // temporarily moved or the user may have pinned files there; the
  // user can delete the row explicitly. Matches the design doc's
  // hybrid-ownership intent ("rescans never clobber user edits").

  const updated = await featureQueries.listFeatures(params.id);
  return json(updated);
};
