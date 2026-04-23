/**
 * Server-handler unit tests for /api/users/[id]/+server.ts.
 * Admin-role gate — success branches mutate the DB.
 */

import { test, expect, describe } from "vitest";
import { PUT } from "../routes/api/users/[id]/+server";

function makeEvent(opts: {
	id?: string;
	body?: unknown;
	locals?: Record<string, unknown>;
}) {
	const id = opts.id ?? "u1";
	return {
		url: new URL(`http://localhost/api/users/${id}`),
		locals: opts.locals ?? {},
		params: { id },
		request: new Request(`http://localhost/api/users/${id}`, {
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
	try {
		res = await fn();
	} catch (thrown) {
		expect(thrown).toBeInstanceOf(Response);
		res = thrown as Response;
	}
	expect(res!.status).toBe(status);
	return res!;
}

describe("PUT /api/users/[id]", () => {
	test("rejects 401 when no auth", async () => {
		await expectThrownResponse(
			() => PUT(makeEvent({ body: { status: "inactive" } })),
			401,
		);
	});

	test("rejects 403 when caller is not admin", async () => {
		const member = { id: "u1", email: "u@test.com", name: "U", role: "member" };
		await expectThrownResponse(
			() => PUT(makeEvent({ body: { status: "inactive" }, locals: { user: member } })),
			403,
		);
	});
});

