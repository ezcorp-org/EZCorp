/**
 * Server-handler unit tests for /api/orchestrator/human-input/+server.ts.
 *
 * The handler has no requireAuth — only a scope gate. When the requestId is
 * not in the in-memory pending registry the handler short-circuits with
 * `{ ok: true }` without emitting. We exercise the scope gate and the
 * stale-request fast path (no bus emit, no side effect).
 */

import { test, expect, describe } from "vitest";
import { POST } from "../routes/api/orchestrator/human-input/+server";

function makeEvent(opts: {
	body?: unknown;
	locals?: Record<string, unknown>;
}) {
	return {
		url: new URL("http://localhost/api/orchestrator/human-input"),
		locals: opts.locals ?? {},
		request: new Request("http://localhost/api/orchestrator/human-input", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: opts.body !== undefined ? JSON.stringify(opts.body) : "{}",
		}),
	} as any;
}

describe("POST /api/orchestrator/human-input", () => {
	test("returns 403 when API-key scope missing 'chat'", async () => {
		const res = await POST(
			makeEvent({
				locals: {
					user: { id: "u1", email: "u@x", name: "u", role: "user" },
					apiKeyScopes: ["read"],
				},
				body: { requestId: "r1", response: "hi" },
			}),
		);
		expect(res.status).toBe(403);
		const body = (await res.json()) as { required?: string };
		expect(body.required).toBe("chat");
	});

	test("returns 200 ok for stale/unknown requestId (no registered gate)", async () => {
		// Cookie-auth path (no apiKeyScopes -> scope passes). With a fresh
		// module-level registry this requestId is unknown, so the handler
		// short-circuits to ok:true without hitting the bus.
		const res = await POST(
			makeEvent({
				body: {
					requestId: "nonexistent-" + Math.random().toString(36),
					response: "hi",
				},
			}),
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { ok?: boolean };
		expect(body.ok).toBe(true);
	});
});
