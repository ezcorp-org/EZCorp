/**
 * Server-handler unit tests for /api/account/password/+server.ts.
 * Auth gate — success path runs argon2id + DB.
 */

import { test, expect, describe } from "vitest";
import { PUT } from "../routes/api/account/password/+server";

function makeEvent(opts: { body?: unknown; locals?: Record<string, unknown> }) {
	return {
		url: new URL("http://localhost/api/account/password"),
		locals: opts.locals ?? {},
		cookies: {
			set: () => undefined,
			get: () => undefined,
			delete: () => undefined,
		},
		request: new Request("http://localhost/api/account/password", {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
		}),
	} as any;
}

async function expectThrownResponse(
	fn: () => Promise<Response> | Response,
	status: number,
): Promise<Response> {
	let res: Response | undefined;
	try { res = await fn(); }
	catch (thrown) { expect(thrown).toBeInstanceOf(Response); res = thrown as Response; }
	expect(res!.status).toBe(status);
	return res!;
}

describe("PUT /api/account/password", () => {
	test("rejects 401 when no auth", async () => {
		await expectThrownResponse(
			() =>
				PUT(makeEvent({ body: { currentPassword: "x", newPassword: "Aa1bcdef" } })),
			401,
		);
	});
});
