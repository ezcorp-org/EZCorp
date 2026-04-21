import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireScope } from "$lib/server/security/api-keys";
import { getBus } from "$lib/server/context";

export const POST: RequestHandler = async ({ request, locals }) => {
	const scopeErr = requireScope(locals, "chat");
	if (scopeErr) return scopeErr;

	const { requestId, response } = await request.json();

	// Reverse-map requestId → conversationId from the still-live built-in
	// ask-human tool's pending-gate map. The accessor returns `undefined`
	// when the gate already timed out / was aborted — in that case we
	// still resolve (no-op) and return ok so the UI doesn't surface a
	// spurious error on a late POST. See `.planning/phase-5-plan.md §4.3`.
	const { resolveHumanInput, getPendingHumanConversationId } = await import(
		"$server/runtime/tools/ask-human"
	);
	const conversationId = getPendingHumanConversationId(requestId);

	resolveHumanInput(requestId, response);

	if (conversationId) {
		getBus().emit("orchestrator:human_response", {
			requestId,
			response,
			conversationId,
		});
	}

	return json({ ok: true });
};
