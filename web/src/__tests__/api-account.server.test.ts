/**
 * Server-handler unit tests for /api/account/+server.ts.
 *
 * Re-added after the vitest+Zod inline fix in vitest.config.ts —
 * this handler imports validationError from $lib/server/security/validation,
 * which uses Zod at module top-level.
 *
 * Auth + validation gates only — success branches mutate the DB.
 */

import { test, expect, describe } from "vitest";
import { GET, PUT } from "../routes/api/account/+server";

function makeEvent(init: {
	href?: string;
	locals?: Record<string, unknown>;
	body?: unknown;
}) {
	return {
		url: new URL(init.href ?? "http://localhost/api/account"),
		locals: init.locals ?? {},
		request: new Request("http://localhost/api/account", {
			method: "POST",
			body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
		}),
	} as any;
}

async function expectThrownResponse(
	fn: () => Promise<Response> | Response,
	status: number,
): Promise<Response> {
	let res: Response | undefined;
	try {
		const out = await fn();
		res = out;
	} catch (thrown) {
		expect(thrown).toBeInstanceOf(Response);
		res = thrown as Response;
	}
	expect(res).toBeInstanceOf(Response);
	expect(res!.status).toBe(status);
	return res!;
}

describe("GET /api/account", () => {
	test("rejects 401 when locals.user is missing", async () => {
		const res = await expectThrownResponse(
			() => GET(makeEvent({ locals: {} })),
			401,
		);
		const body = (await res.json()) as { error?: string };
		expect(typeof body.error).toBe("string");
	});
});

describe("PUT /api/account", () => {
	test("rejects 401 when locals.user is missing", async () => {
		const res = await expectThrownResponse(
			() => PUT(makeEvent({ locals: {}, body: { name: "X" } })),
			401,
		);
		const body = (await res.json()) as { error?: string };
		expect(typeof body.error).toBe("string");
	});
});
