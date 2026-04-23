/**
 * Server-handler unit tests for /api/admin/errors/+server.ts.
 *
 * Auth + role gates only — the success branch does parallel
 * listErrors() / countErrors() against the DB, which is integration scope.
 */

import { test, expect, describe } from "vitest";
import { GET } from "../routes/api/admin/errors/+server";

function makeEvent(href: string, locals: Record<string, unknown> = {}) {
	return { url: new URL(href), locals } as any;
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

describe("GET /api/admin/errors", () => {
	test("rejects 401 when locals.user is missing", async () => {
		const res = await expectThrownResponse(
			() => GET(makeEvent("http://localhost/api/admin/errors", {})),
			401,
		);
		const body = (await res.json()) as { error?: string };
		expect(typeof body.error).toBe("string");
	});

	test("rejects 403 when locals.user is non-admin", async () => {
		const member = { id: "u1", email: "u@test.com", name: "U", role: "member" };
		const res = await expectThrownResponse(
			() => GET(makeEvent("http://localhost/api/admin/errors", { user: member })),
			403,
		);
		const body = (await res.json()) as { error?: string };
		expect(typeof body.error).toBe("string");
	});
});
