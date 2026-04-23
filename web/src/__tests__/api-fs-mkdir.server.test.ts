/**
 * Server-handler unit tests for /api/fs/mkdir/+server.ts.
 * Auth gate — success path actually mkdir's; we test only the auth/validation.
 */

import { test, expect, describe } from "vitest";
import { POST } from "../routes/api/fs/mkdir/+server";

function makeEvent(opts: { body?: unknown; locals?: Record<string, unknown> }) {
	return {
		url: new URL("http://localhost/api/fs/mkdir"),
		locals: opts.locals ?? {},
		request: new Request("http://localhost/api/fs/mkdir", {
			method: "POST",
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

describe("POST /api/fs/mkdir", () => {
	test("rejects 401 when no auth", async () => {
		await expectThrownResponse(
			() => POST(makeEvent({ body: { path: "/tmp/x" } })),
			401,
		);
	});
});
