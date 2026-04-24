/**
 * Server-handler unit tests for /api/modes/+server.ts.
 *
 * Covers scope/auth gates and the zod validation gate on POST. Success
 * paths hit the DB, so they're integration scope.
 */

import { test, expect, describe } from "vitest";
import { GET, POST } from "../routes/api/modes/+server";

function makeGetEvent(opts: { locals?: Record<string, unknown> }) {
	return {
		url: new URL("http://localhost/api/modes"),
		locals: opts.locals ?? {},
		request: new Request("http://localhost/api/modes", { method: "GET" }),
	} as any;
}

function makePostEvent(opts: {
	body?: unknown;
	locals?: Record<string, unknown>;
}) {
	return {
		url: new URL("http://localhost/api/modes"),
		locals: opts.locals ?? {},
		request: new Request("http://localhost/api/modes", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: opts.body !== undefined ? JSON.stringify(opts.body) : "{}",
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

const authedUser = {
	user: { id: "u1", email: "u@x", name: "u", role: "user" },
};

describe("GET /api/modes", () => {
	test("returns 403 when API-key scope missing 'read'", async () => {
		const res = await GET(
			makeGetEvent({
				locals: { ...authedUser, apiKeyScopes: ["chat"] },
			}),
		);
		expect(res.status).toBe(403);
	});

	test("throws 401 when unauthenticated", async () => {
		await expectThrownResponse(() => GET(makeGetEvent({})), 401);
	});
});

describe("POST /api/modes", () => {
	test("returns 403 when API-key scope missing 'chat'", async () => {
		const res = await POST(
			makePostEvent({
				locals: { ...authedUser, apiKeyScopes: ["read"] },
				body: {},
			}),
		);
		expect(res.status).toBe(403);
		const body = (await res.json()) as { error?: string; required?: string };
		expect(body.required).toBe("chat");
	});

	test("throws 401 when unauthenticated", async () => {
		await expectThrownResponse(
			() => POST(makePostEvent({ body: {} })),
			401,
		);
	});

	test("returns 400 on empty body (missing required fields)", async () => {
		const res = await POST(makePostEvent({ locals: authedUser, body: {} }));
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error?: string };
		expect(body.error).toBe("Validation failed");
	});

	test("returns 400 when slug has invalid characters", async () => {
		const res = await POST(
			makePostEvent({
				locals: authedUser,
				body: {
					name: "Debug",
					slug: "NOT_ok",
					systemPromptInstruction: "think hard",
				},
			}),
		);
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error?: string };
		expect(body.error).toBe("Validation failed");
	});

	test("returns 400 when systemPromptInstruction is empty", async () => {
		const res = await POST(
			makePostEvent({
				locals: authedUser,
				body: {
					name: "Debug",
					slug: "debug",
					systemPromptInstruction: "",
				},
			}),
		);
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error?: string };
		expect(body.error).toBe("Validation failed");
	});
});
