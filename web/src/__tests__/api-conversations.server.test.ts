/**
 * Server-handler unit tests for /api/conversations/+server.ts.
 * Auth gate only — list/create both hit the DB on success.
 */

import { test, expect, describe } from "vitest";
import { GET, POST } from "../routes/api/conversations/+server";

function makeEvent(opts: {
	href?: string;
	body?: unknown;
	locals?: Record<string, unknown>;
}) {
	return {
		url: new URL(opts.href ?? "http://localhost/api/conversations"),
		locals: opts.locals ?? {},
		request: new Request("http://localhost/api/conversations", {
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
	try {
		res = await fn();
	} catch (thrown) {
		expect(thrown).toBeInstanceOf(Response);
		res = thrown as Response;
	}
	expect(res!.status).toBe(status);
	return res!;
}

describe("GET /api/conversations", () => {
	test("rejects 401 when locals.user is missing", async () => {
		const res = await expectThrownResponse(() => GET(makeEvent({})), 401);
		const body = (await res.json()) as { error?: string };
		expect(typeof body.error).toBe("string");
	});
});

describe("POST /api/conversations", () => {
	test("rejects 401 when locals.user is missing", async () => {
		await expectThrownResponse(
			() => POST(makeEvent({ body: { agentName: "x" } })),
			401,
		);
	});
});
