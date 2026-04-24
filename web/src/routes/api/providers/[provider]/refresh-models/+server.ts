import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAuth } from "$server/auth/middleware";
import { requireScope } from "$lib/server/security/api-keys";
import { errorJson } from "$lib/server/http-errors";
import { fetchProviderModels } from "$server/providers/model-discovery";
import { upsertSetting } from "$server/db/queries/settings";

const VALID_PROVIDERS = new Set(["anthropic", "openai", "google"]);

export const POST: RequestHandler = async ({ params, locals }) => {
	const scopeErr = requireScope(locals, "admin");
	if (scopeErr) return scopeErr;
	requireAuth(locals);

	const { provider } = params;
	if (!provider || !VALID_PROVIDERS.has(provider)) {
		return errorJson(400, "Invalid provider. Must be one of: anthropic, openai, google");
	}

	try {
		const models = await fetchProviderModels(provider);
		await upsertSetting(`provider:discoveredModels:${provider}`, models);
		return json({
			success: true,
			count: models.length,
			ids: models.map((m) => m.id),
			fetchedAt: new Date().toISOString(),
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error(`[refresh-models] ${provider}:`, err);
		return json({ success: false, error: message });
	}
};
