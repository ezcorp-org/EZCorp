import type { RequestHandler } from "./$types";
import { requireAuth } from "$server/auth/middleware";
import { getServablePreview, isValidPreviewId } from "$server/db/queries/preview-sessions";
import { mintOneTimeCode } from "$server/runtime/preview/preview-token";

// ── POST /api/preview/:id/token — app-origin handoff mint ──────────────
//
// The authenticated app origin (this route is behind the normal
// ezcorp_session auth in hooks.server.ts) mints a ONE-TIME CODE the
// browser then redeems at `https://<id>.preview.<host>/__open?c=<code>`.
//
// Ownership is enforced here via getServablePreview (owned + active +
// unexpired + unrevoked). A user can only mint a handoff for their OWN
// live preview — minting for another user's preview returns 404 (opaque).
//
// The one-time code is short-lived + single-use, so a leaked code (e.g.
// in browser history) is inert after the first redemption. See
// tasks/preview-port-exposure.md §3.5.

export const POST: RequestHandler = async ({ params, locals }) => {
  const user = requireAuth(locals);
  const id = params.id;
  if (!id || !isValidPreviewId(id)) {
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const row = await getServablePreview(id, user.id);
  if (!row) {
    // Missing, expired, revoked, or owned by another user — all opaque 404.
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const code = mintOneTimeCode({ previewId: id, userId: user.id });
  return new Response(JSON.stringify({ code }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      // Don't let the mint response leak via referer either.
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "private, no-store",
    },
  });
};
