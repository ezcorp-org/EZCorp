/**
 * Server-handler unit tests for /api/agents/[id]/share/+server.ts.
 * Auth gate — success branches share/unshare via DB.
 */

import { test, expect, describe } from "vitest";
import { GET, POST, DELETE } from "../routes/api/agents/[id]/share/+server";

function makeEvent(opts: {
	id?: string;
	body?: unknown;
	locals?: Record<string, unknown>;
}) {
	const id = opts.id ?? "agent-1";
	return {
		url: new URL(`http://localhost/api/agents/${id}/share`),
		locals: opts.locals ?? {},
		params: { id },
		request: new Request(`http://localhost/api/agents/${id}/share`, {
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

describe("GET /api/agents/[id]/share", () => {
	test("rejects 401 when no auth", async () => {
		await expectThrownResponse(() => GET(makeEvent({})), 401);
	});
});

describe("POST /api/agents/[id]/share", () => {
	test("rejects 401 when no auth", async () => {
		await expectThrownResponse(
			() => POST(makeEvent({ body: { teamId: "t1", permission: "read" } })),
			401,
		);
	});
});

describe("DELETE /api/agents/[id]/share", () => {
	test("rejects 401 when no auth", async () => {
		await expectThrownResponse(
			() => DELETE(makeEvent({ body: { teamId: "t1" } })),
			401,
		);
	});
});
