/**
 * Server-handler unit tests for /api/mentions/search/+server.ts.
 *
 * Covers the scope/auth gates. The happy paths fan out into the command
 * registry, extension registry, DB, and filesystem — all integration scope.
 */

import { test, expect, describe } from "vitest";
import { GET } from "../routes/api/mentions/search/+server";

function makeEvent(opts: {
	href?: string;
	locals?: Record<string, unknown>;
}) {
	const href = opts.href ?? "http://localhost/api/mentions/search";
	return {
		url: new URL(href),
		locals: opts.locals ?? {},
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

describe("GET /api/mentions/search", () => {
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

	test("type=path with no projectId returns [] (short-circuit before FS)", async () => {
		// Exercises the type=path short-circuit when projectId is missing —
		// deliberately avoids the filesystem listing path.
		const res = await GET(
			makeEvent({
				href: "http://localhost/api/mentions/search?type=path&q=foo",
				locals: {
					user: { id: "u1", email: "u@x", name: "u", role: "user" },
				},
			}),
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as unknown[];
		expect(Array.isArray(body)).toBe(true);
		expect(body.length).toBe(0);
	});
});
