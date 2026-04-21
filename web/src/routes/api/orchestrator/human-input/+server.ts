import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireScope } from "$lib/server/security/api-keys";
import { getBus } from "$lib/server/context";
import {
	getPendingHumanConversationId,
	clearPendingHumanInput,
} from "$server/runtime/ask-human-registry";

export const POST: RequestHandler = async ({ request, locals }) => {
	const scopeErr = requireScope(locals, "chat");
	if (scopeErr) return scopeErr;

	const { requestId, response } = await request.json();

	// Reverse-map requestId → conversationId through the host-side shadow
	// registry populated by `task-events-handler.ts`' Phase 5
	// `orchestrator:human_input` branch. If the entry is missing the
	// extension's gate has already collapsed (timeout, abort, restart) —
	// return ok so the UI's optimistic dismissal doesn't raise a spurious
	// error. Phase 5 commit 4: the legacy built-in ask-human tool is
	// deleted; the extension's subscription handler is the sole gate.
	const conversationId = getPendingHumanConversationId(requestId);
	if (!conversationId) {
		return json({ ok: true });
	}

	getBus().emit("orchestrator:human_response", {
		requestId,
		response,
		conversationId,
	});
	clearPendingHumanInput(requestId);

	return json({ ok: true });
};
