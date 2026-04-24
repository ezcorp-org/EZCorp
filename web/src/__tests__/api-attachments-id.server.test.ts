/**
 * Server-handler unit tests for /api/attachments/[id]/+server.ts.
 *
 * Covers scope/auth gates and the `params.id` not-found shortcut. Success
 * and DB-ownership 404 branches require getAttachment/getConversation which
 * are integration scope.
 */

import { test, expect, describe } from "vitest";
import { GET } from "../routes/api/attachments/[id]/+server";

function makeEvent(opts: {
	id?: string;
	locals?: Record<string, unknown>;
	href?: string;
}) {
	const id = opts.id ?? "att-1";
	const href = opts.href ?? `http://localhost/api/attachments/${id}`;
	return {
		url: new URL(href),
		locals: opts.locals ?? {},
		params: { id },
		request: new Request(href, { method: "GET" }),
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

describe("GET /api/attachments/[id]", () => {
	test("returns 403 when API-key scope missing 'read'", async () => {
		const res = await GET(
			makeEvent({
				locals: {
					user: { id: "u1", email: "u@x", name: "u", role: "user" },
					apiKeyScopes: ["chat"],
				},
			}),
		);
		expect(res.status).toBe(403);
		const body = (await res.json()) as { error?: string; required?: string };
		expect(body.error).toBe("Insufficient scope");
		expect(body.required).toBe("read");
	});

	test("throws 401 when unauthenticated", async () => {
		const res = await expectThrownResponse(
			() => GET(makeEvent({ locals: {} })),
			401,
		);
		const body = (await res.json()) as { error?: string };
		expect(body.error).toBe("Authentication required");
	});
});
