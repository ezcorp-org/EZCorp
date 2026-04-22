import { json } from "@sveltejs/kit";
import * as convQueries from "$server/db/queries/conversations";
import { requireAuth } from "$server/auth/middleware";
import { requireScope } from "$lib/server/security/api-keys";
import { validationError } from "$lib/server/security/validation";
import { cloneTurnsSchema } from "../../schema";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request, params, locals }) => {
  const scopeErr = requireScope(locals, "chat");
  if (scopeErr) return scopeErr;
  const user = requireAuth(locals);
  const sourceConvId = params.id;

  const source = await convQueries.getConversation(sourceConvId);
  if (!source) return json({ error: "Not found" }, { status: 404 });
  if (source.userId !== user.id && user.role !== "admin") {
    return json({ error: "Not found" }, { status: 404 });
  }

  const parsed = cloneTurnsSchema.safeParse(await request.json());
  if (!parsed.success) return validationError(parsed.error);

  try {
    const { conversation } = await convQueries.cloneTurnsIntoNewConversation(
      sourceConvId,
      parsed.data.messageIds,
      { userId: user.id, title: parsed.data.title },
    );
    return json(conversation, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("do not belong")) {
      return json({ error: message }, { status: 400 });
    }
    console.error("[clone-turns] failed:", message);
    return json({ error: "Failed to clone turns" }, { status: 500 });
  }
};
