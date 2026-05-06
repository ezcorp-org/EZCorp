import { json } from "@sveltejs/kit";
import { errorJson } from "$lib/server/http-errors";
import { requireAuth } from "$server/auth/middleware";
import { requireScope } from "$lib/server/security/api-keys";
import { listVisibleLessons } from "$server/db/queries/lessons";
import type { RequestHandler } from "./$types";

/**
 * GET /api/lessons?projectId=<id>
 *
 * Returns the lesson curation list for the `/memories → Lessons` tab
 * (v1.5 admin tab — see tasks/lessons-keeper-v1.5-admin.md).
 *
 * Returns the same visibility-deduped set as the `%`-popover search,
 * but with the FULL body + counters + owner-of-mine flag so the UI
 * can render delete + promote affordances. Internal fields
 * (`ownerId`, `sourceSha256`, `projectId`) are stripped — `ownedByMe`
 * is the only owner-related signal the UI needs.
 *
 * Visibility ladder:
 *   - user-owned, in this project (ownedByMe: true)
 *   - project-shared, in this project (ownedByMe: ownerId === user.id)
 *   - global, in this project (ownedByMe: ownerId === user.id)
 *
 * Auth: standard `requireAuth` + `requireScope("read")`. The list
 * endpoint MAY surface lessons the user doesn't own; mutations
 * (DELETE, PATCH) re-check ownership server-side in `[id]/+server.ts`.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	const scopeErr = requireScope(locals, "read");
	if (scopeErr) return scopeErr;
	const user = requireAuth(locals);
	const projectId = url.searchParams.get("projectId");
	if (!projectId) return errorJson(400, "projectId query parameter required");

	const rows = await listVisibleLessons(projectId, user.id);
	return json(
		rows.map((r) => ({
			id: r.id,
			slug: r.slug,
			title: r.title,
			body: r.body,
			visibility: r.visibility,
			ownedByMe: r.ownerId === user.id,
			source: r.source,
			firedCount: r.firedCount,
			lastFiredAt: r.lastFiredAt,
			dismissedCount: r.dismissedCount,
			createdAt: r.createdAt,
			updatedAt: r.updatedAt,
			frontmatter: r.frontmatter,
		})),
	);
};
