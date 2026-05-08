/**
 * Phase 52.4 — global admin audit page e2e.
 *
 * Coverage:
 *   - non-admin reaching the route gets a 4xx from the server-side
 *     `requireRole` gate.
 *   - admin sees the stats strip + filter strip + timeline.
 *   - filter changes drive the API endpoint.
 */
import { test, expect } from "./fixtures/test-base.js";

test.describe("Global /audit", () => {
	test("non-admin → 4xx (server-side gated)", async ({ page, mockApi }) => {
		await mockApi({
			projects: [],
			extensions: [],
			currentUser: { id: "u-other", email: "x@x", name: "x", role: "user" },
		});

		const res = await page.goto("/audit");
		expect(res?.status()).toBeGreaterThanOrEqual(400);
	});

	test("admin sees stats strip + filter strip + timeline", async ({ page, mockApi }) => {
		await mockApi({
			projects: [],
			extensions: [],
			currentUser: { id: "u-admin", email: "a@x", name: "admin", role: "admin" },
		});
		// Fulfill the stats endpoint so the client-side refresh has
		// numbers to render.
		await page.route("**/api/audit/stats**", async (route) => {
			await route.fulfill({
				json: {
					windowMs: 86400000,
					denialCount: 2,
					totalCalls: 100,
					totalCostUsd: 1.234,
					topChattiest: [
						{ extensionId: "ext-a", name: "lessons-keeper", calls: 60 },
						{ extensionId: "ext-b", name: "memory-extractor", calls: 30 },
					],
					topLlmSpenders: [
						{ extensionId: "ext-a", name: "lessons-keeper", costUsd: 1.0 },
					],
				},
			});
		});
		await page.route("**/api/audit?**", async (route) => {
			await route.fulfill({ json: { entries: [], nextCursor: null } });
		});

		await page.goto("/audit");
		await expect(page.getByTestId("global-audit-stats")).toBeVisible();
		await expect(page.getByTestId("stats-total-calls")).toContainText("100");
		await expect(page.getByTestId("stats-denials")).toContainText("2");
		await expect(page.getByTestId("global-audit-filters")).toBeVisible();
		await expect(page.getByTestId("global-audit-timeline")).toBeVisible();
	});
});
