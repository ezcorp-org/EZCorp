/**
 * Phase 4 (capability-expiry) — E2E-flavored integration test.
 *
 * NOTE on what this test does and does NOT exercise:
 *   This is a TIGHT integration test (vitest + jsdom + vi.mock'd
 *   server modules), not a true browser E2E. Playwright is configured
 *   in the repo (web/playwright.config.ts) but its `webServer` boots
 *   `bun run build && bun run preview`, which is too heavy for the
 *   per-file vitest harness this test runs in. A future Playwright
 *   spec under `web/e2e/` can exercise the same flow end-to-end with
 *   a real browser; the milestone deferred that to follow-up rather
 *   than fork the test infrastructure mid-phase.
 *
 *   This test instead verifies the *server-side flow* the brief calls
 *   out:
 *     - install ext (seeded as a mock)
 *     - sweep wrote an audit row 1 day ago
 *     - banner load fn (`/api/extensions/[id]/expired-grants`) returns it
 *     - banner click POSTs `/api/extensions/[id]/reapprove`
 *     - reapprove handler updates `grantedPermissions.grantedAt[key]`
 *       to ~now AND re-grants from the manifest
 *
 *   The component layer (banner + modal rendering) is covered separately
 *   by `expired-grants-banner.component.test.ts` and
 *   `extension-permission-modal-expired-branch.component.test.ts`.
 */

import {
	describe,
	test,
	expect,
	vi,
	beforeEach,
} from "vitest";

// ── Mocks: shared backend modules ─────────────────────────────────

vi.mock("$server/db/queries/extensions", () => ({
	getExtension: vi.fn(),
	updateExtension: vi.fn(async (_id: string, data: unknown) => ({ id: _id, ...(data as object) })),
}));

vi.mock("$server/db/queries/expired-grants", () => ({
	listExpiredGrantsForExtension: vi.fn(),
}));

vi.mock("$server/db/queries/audit-log", () => ({
	insertAuditEntry: vi.fn(async () => "audit-id-mock"),
}));

vi.mock("$server/extensions/registry", () => ({
	ExtensionRegistry: {
		getInstance: () => ({ reload: vi.fn(async () => undefined) }),
	},
}));

const { getExtension, updateExtension } = await import("$server/db/queries/extensions");
const { listExpiredGrantsForExtension } = await import("$server/db/queries/expired-grants");
const { insertAuditEntry } = await import("$server/db/queries/audit-log");

const expiredGrantsRoute = await import(
	"../routes/api/extensions/[id]/expired-grants/+server.ts"
);
const reapproveRoute = await import(
	"../routes/api/extensions/[id]/reapprove/+server.ts"
);

const DAY_MS = 24 * 60 * 60 * 1000;

const adminUser = { id: "u-admin", email: "a@x", name: "a", role: "admin" } as const;
const memberUser = { id: "u-member", email: "m@x", name: "m", role: "member" } as const;

function makeEvent(opts: {
	id?: string;
	locals?: Record<string, unknown>;
	body?: unknown;
	method?: string;
	path?: string;
}) {
	const id = opts.id ?? "scratchpad";
	const path = opts.path ?? `/api/extensions/${id}/expired-grants`;
	return {
		url: new URL(`http://localhost${path}`),
		locals: opts.locals ?? {},
		params: { id },
		request: new Request(`http://localhost${path}`, {
			method: opts.method ?? "GET",
			headers: { "content-type": "application/json" },
			body: opts.body ? JSON.stringify(opts.body) : undefined,
		}),
	} as any;
}

beforeEach(() => {
	vi.mocked(getExtension).mockReset();
	vi.mocked(updateExtension).mockReset();
	vi.mocked(listExpiredGrantsForExtension).mockReset();
	vi.mocked(insertAuditEntry).mockReset();

	// Default: updateExtension echoes back its input shape.
	vi.mocked(updateExtension).mockImplementation(async (_id: string, data: any) => ({
		id: _id,
		...data,
	}));
	vi.mocked(insertAuditEntry).mockResolvedValue("audit-id-mock");
});

describe("cap-expiry flow — banner load → reapprove → grantedAt resets", () => {
	test("banner load fn returns the audit-row shape the banner consumes", async () => {
		vi.mocked(getExtension).mockResolvedValue({
			id: "scratchpad",
			name: "Scratchpad",
			manifest: {},
		} as any);
		vi.mocked(listExpiredGrantsForExtension).mockResolvedValue([
			{
				auditId: "a-1",
				extensionId: "scratchpad",
				capability: "shell",
				ageMs: 1 * DAY_MS,
				expiredAt: Date.now() - 1 * DAY_MS,
			},
		]);

		const res = await expiredGrantsRoute.GET(
			makeEvent({ locals: { user: memberUser } }),
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { grants: any[] };
		expect(body.grants).toHaveLength(1);
		expect(body.grants[0]).toMatchObject({
			auditId: "a-1",
			capability: "shell",
			extensionId: "scratchpad",
		});
	});

	test("banner load returns 404 for unknown extension", async () => {
		vi.mocked(getExtension).mockResolvedValue(null as any);
		const res = await expiredGrantsRoute.GET(
			makeEvent({ locals: { user: memberUser } }),
		);
		expect(res.status).toBe(404);
	});

	test("banner load requires authentication", async () => {
		// No `user` in locals — requireAuth throws a 401 Response.
		let res: Response | undefined;
		try {
			res = await expiredGrantsRoute.GET(makeEvent({ locals: {} }));
		} catch (thrown) {
			expect(thrown).toBeInstanceOf(Response);
			res = thrown as Response;
		}
		expect(res!.status).toBe(401);
	});

	test("reapprove resets grantedAt[key] and re-grants manifest value", async () => {
		const ninetyOneDaysAgo = Date.now() - 91 * DAY_MS;
		vi.mocked(getExtension).mockResolvedValue({
			id: "scratchpad",
			name: "Scratchpad",
			manifest: {
				permissions: {
					shell: true,
					filesystem: ["/tmp/scratchpad"],
				},
			},
			grantedPermissions: {
				// shell was swept (key gone, no grantedAt entry)
				filesystem: ["/tmp/scratchpad"],
				grantedAt: {
					filesystem: ninetyOneDaysAgo,
					// shell intentionally absent — that's the swept state.
				},
			},
		} as any);

		const before = Date.now();
		const res = await reapproveRoute.POST(
			makeEvent({
				method: "POST",
				path: "/api/extensions/scratchpad/reapprove",
				locals: { user: memberUser },
				body: { capability: "shell" },
			}),
		);
		const after = Date.now();
		expect(res.status).toBe(200);

		// updateExtension was called with the next granted-permissions
		// snapshot. Verify shell was re-granted from the manifest AND
		// grantedAt[shell] = ~now.
		expect(vi.mocked(updateExtension)).toHaveBeenCalledTimes(1);
		const call = vi.mocked(updateExtension).mock.calls[0]!;
		expect(call[0]).toBe("scratchpad");
		const nextGrant = (call[1] as any).grantedPermissions;
		expect(nextGrant.shell).toBe(true);
		expect(nextGrant.grantedAt.shell).toBeGreaterThanOrEqual(before);
		expect(nextGrant.grantedAt.shell).toBeLessThanOrEqual(after);
		// filesystem (untouched) preserved.
		expect(nextGrant.filesystem).toEqual(["/tmp/scratchpad"]);
		expect(nextGrant.grantedAt.filesystem).toBe(ninetyOneDaysAgo);

		// Audit row written.
		expect(vi.mocked(insertAuditEntry)).toHaveBeenCalled();
	});

	test("reapprove with capability='filesystem-write' re-grants manifest filesystem slot", async () => {
		vi.mocked(getExtension).mockResolvedValue({
			id: "scratchpad",
			name: "Scratchpad",
			manifest: { permissions: { filesystem: ["/var/lib/scratchpad"] } },
			grantedPermissions: { grantedAt: {} },
		} as any);

		const res = await reapproveRoute.POST(
			makeEvent({
				method: "POST",
				path: "/api/extensions/scratchpad/reapprove",
				locals: { user: memberUser },
				body: { capability: "filesystem-write" },
			}),
		);
		expect(res.status).toBe(200);
		const call = vi.mocked(updateExtension).mock.calls[0]!;
		const nextGrant = (call[1] as any).grantedPermissions;
		expect(nextGrant.filesystem).toEqual(["/var/lib/scratchpad"]);
		expect(typeof nextGrant.grantedAt.filesystem).toBe("number");
	});

	test("reapprove rejects scope='forever' from non-admin (defense in depth)", async () => {
		vi.mocked(getExtension).mockResolvedValue({
			id: "scratchpad",
			name: "Scratchpad",
			manifest: { permissions: { shell: true } },
			grantedPermissions: { grantedAt: {} },
		} as any);

		let res: Response | undefined;
		try {
			res = await reapproveRoute.POST(
				makeEvent({
					method: "POST",
					path: "/api/extensions/scratchpad/reapprove",
					locals: { user: memberUser },
					body: { capability: "shell", scope: "forever" },
				}),
			);
		} catch (thrown) {
			expect(thrown).toBeInstanceOf(Response);
			res = thrown as Response;
		}
		expect(res!.status).toBe(403);
		// updateExtension MUST NOT have been called.
		expect(vi.mocked(updateExtension)).not.toHaveBeenCalled();
	});

	test("reapprove with scope='forever' from admin succeeds", async () => {
		vi.mocked(getExtension).mockResolvedValue({
			id: "scratchpad",
			name: "Scratchpad",
			manifest: { permissions: { shell: true } },
			grantedPermissions: { grantedAt: {} },
		} as any);

		const res = await reapproveRoute.POST(
			makeEvent({
				method: "POST",
				path: "/api/extensions/scratchpad/reapprove",
				locals: { user: adminUser },
				body: { capability: "shell", scope: "forever" },
			}),
		);
		expect(res.status).toBe(200);
		expect(vi.mocked(updateExtension)).toHaveBeenCalledTimes(1);
	});

	test("reapprove rejects unknown capability with 400", async () => {
		vi.mocked(getExtension).mockResolvedValue({
			id: "scratchpad",
			name: "Scratchpad",
			manifest: { permissions: {} },
			grantedPermissions: { grantedAt: {} },
		} as any);

		const res = await reapproveRoute.POST(
			makeEvent({
				method: "POST",
				path: "/api/extensions/scratchpad/reapprove",
				locals: { user: memberUser },
				body: { capability: "bogus-capability" },
			}),
		);
		expect(res.status).toBe(400);
		expect(vi.mocked(updateExtension)).not.toHaveBeenCalled();
	});

	test("reapprove rejects invalid scope with 400", async () => {
		vi.mocked(getExtension).mockResolvedValue({
			id: "scratchpad",
			name: "Scratchpad",
			manifest: { permissions: { shell: true } },
			grantedPermissions: { grantedAt: {} },
		} as any);

		const res = await reapproveRoute.POST(
			makeEvent({
				method: "POST",
				path: "/api/extensions/scratchpad/reapprove",
				locals: { user: adminUser },
				body: { capability: "shell", scope: "session" },
			}),
		);
		expect(res.status).toBe(400);
		expect(vi.mocked(updateExtension)).not.toHaveBeenCalled();
	});
});
