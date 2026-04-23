/**
 * Server-handler unit tests for /api/extensions/[id]/+server.ts.
 * Auth gate only — success paths hit DB + ExtensionRegistry singleton.
 */

import { test, expect, describe } from "vitest";
import { GET } from "../routes/api/extensions/[id]/+server";

function makeEvent(opts: { id?: string; locals?: Record<string, unknown> }) {
	const id = opts.id ?? "ext-1";
	return {
		url: new URL(`http://localhost/api/extensions/${id}`),
		locals: opts.locals ?? {},
		params: { id },
	} as any;
}

async function expectThrownResponse(
	fn: () => Promise<Response> | Response,
	status: number,
): Promise<Response> {
	let res: Response | undefined;
	try {
		res = await fn();
	} catch (thrown) {
		expect(thrown).toBeInstanceOf(Response);
		res = thrown as Response;
	}
	expect(res!.status).toBe(status);
	return res!;
}

describe("GET /api/extensions/[id]", () => {
	test("rejects 401 when locals.user is missing", async () => {
		const res = await expectThrownResponse(() => GET(makeEvent({})), 401);
		const body = (await res.json()) as { error?: string };
		expect(typeof body.error).toBe("string");
	});
});
