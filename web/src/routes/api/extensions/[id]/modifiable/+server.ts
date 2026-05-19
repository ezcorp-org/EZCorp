// Admin-only toggle for the per-extension `modifiable` gate.
//
// `modifiable` authorizes an extension's CREATOR to re-open and edit
// it (web Modify action + the in-chat `modify_extension` tool). Only
// an admin may flip it — a user cannot self-enable editing their own
// extension, and the in-chat LLM can never reach this route. Mirrors
// the admin-guard + audit pattern of `[id]/activate/+server.ts`.

import { json } from "@sveltejs/kit";
import { z } from "zod";
import { requireRole } from "$server/auth/middleware";
import { errorJson } from "$lib/server/http-errors";
import {
	getExtension,
	setExtensionModifiable,
} from "$server/db/queries/extensions";
import { insertAuditEntry } from "$server/db/queries/audit-log";
import { EXT_AUDIT_ACTIONS } from "$server/extensions/audit-actions";
import type { RequestHandler } from "./$types";

const postSchema = z.object({ modifiable: z.boolean() });

export const POST: RequestHandler = async ({ request, params, locals }) => {
	// requireRole throws a raw Response; SvelteKit surfaces that as a
	// 500 unless caught — return it so non-admins see the intended 403.
	let admin;
	try {
		admin = requireRole(locals, "admin");
	} catch (e) {
		if (e instanceof Response) return e;
		throw e;
	}

	const parsed = postSchema.safeParse(await request.json().catch(() => ({})));
	if (!parsed.success) {
		return errorJson(400, "Body must be { modifiable: boolean }");
	}
	const { modifiable } = parsed.data;

	const ext = await getExtension(params.id);
	if (!ext) return errorJson(404, "Not found");

	// Bundled extensions are never user-modifiable — refuse to flip the
	// flag on one so the admin UI can't create a false affordance.
	if (ext.isBundled) {
		return errorJson(400, "Bundled extensions cannot be made modifiable");
	}

	// Idempotent no-op: no write, no audit row, when already at target.
	if (ext.modifiable === modifiable) {
		return json(ext);
	}

	const updated = await setExtensionModifiable(params.id, modifiable);
	if (!updated) return errorJson(404, "Not found");

	await insertAuditEntry(admin.id, EXT_AUDIT_ACTIONS.MODIFIABLE_TOGGLED, params.id, {
		permission: "modifiable",
		oldValue: ext.modifiable,
		newValue: modifiable,
		actor: admin.id,
		reason: modifiable
			? "admin enabled creator modification for this extension"
			: "admin disabled creator modification for this extension",
	});

	return json(updated);
};
