/**
 * Phase 52.2 — per-extension audit drill-down e2e.
 *
 * The page is server-side gated (admin-only); the e2e harness logs in
 * as an admin via the existing `mockApi` fixture. We mock the SSR
 * loader's data path through the API responses + the explicit page
 * route fulfillments below.
 *
 * Coverage:
 *   - "Audit" link on the extension detail page navigates to the
 *     drill-down route.
 *   - Filter pills update the entries list.
 *   - Stats strip renders + carries the disclaimer line.
 *   - Expand-row reveals redacted before/after metadata + carries
 *     the cost-disclaimer.
 *   - No fixture-shaped credentials are visible anywhere on the
 *     rendered page (regex sweep against the full body text).
 */
import { test, expect } from "./fixtures/test-base.js";
import { makeProject } from "./fixtures/data.js";

const EXT_ID = "ext-audit-1";

const auditEntries = [
	{
		kind: "capability",
		id: "cap-1",
		createdAt: new Date("2026-05-01T10:00:00Z").toISOString(),
		capability: "llm",
		action: "complete",
		success: true,
		durationMs: 1200,
		resourceType: null,
		resourceId: null,
		tokensUsed: 1230,
		costUsd: 0.003,
		provider: "openai",
		model: "gpt-4o-mini",
		errorCode: null,
		errorMessage: null,
		conversationId: "conv-1",
		onBehalfOf: "u-1",
		before: null,
		after: { redacted: "[REDACTED]" },
	},
	{
		kind: "governance",
		id: "gov-1",
		createdAt: new Date("2026-05-01T09:00:00Z").toISOString(),
		action: "ext:permission-granted",
		target: EXT_ID,
		userId: "u-1",
		metadata: { reason: "admin install" },
	},
];

const stats = {
	totalCalls: 2,
	totalCostUsd: 0.003,
	successRate: 1,
	denialCount: 0,
};

async function setupAuditMocks(page: import("@playwright/test").Page) {
	// Page route override — the audit endpoints aren't part of the
	// stock mockApi dispatcher, so plug in their handlers ourselves.
	await page.route(`**/api/extensions/${EXT_ID}/audit/stats**`, async (route) => {
		await route.fulfill({ json: stats });
	});
	await page.route(`**/api/extensions/${EXT_ID}/audit*`, async (route) => {
		const url = new URL(route.request().url());
		// Don't intercept stats sub-path here.
		if (url.pathname.endsWith("/stats")) return route.continue();
		const status = url.searchParams.get("status");
		const capability = url.searchParams.get("capability");
		let entries = auditEntries;
		if (status === "denial") entries = [];
		if (capability === "memory") entries = [];
		await route.fulfill({ json: { entries, nextCursor: null } });
	});
}

test.describe("Per-extension audit drill-down", () => {
	const proj = makeProject({ id: "proj-1" });

	test("navigates from extension detail → audit page", async ({
		page,
		mockApi,
	}) => {
		await mockApi({
			projects: [proj],
			extensions: [
				{
					id: EXT_ID,
					name: "audit-test-ext",
					version: "1.0.0",
					description: "audit drill-down target",
					enabled: true,
					source: "local",
					installPath: "/tmp/audit-ext",
					checksumVerified: true,
					consecutiveFailures: 0,
					manifest: {
						author: "tester",
						entrypoint: "index.ts",
						persistent: false,
						tools: [],
						permissions: {},
					},
					grantedPermissions: { storage: true, grantedAt: { storage: 1 } },
				} as any,
			],
		});
		await setupAuditMocks(page);

		await page.goto(`/extensions/${EXT_ID}`);
		await page
			.getByTestId("extension-detail-audit-link")
			.click();

		await expect(page).toHaveURL(new RegExp(`/extensions/${EXT_ID}/audit$`));
		await expect(page.getByTestId("audit-timeline")).toBeVisible();
	});

	test("renders timeline + stats strip + disclaimer", async ({
		page,
		mockApi,
	}) => {
		await mockApi({ projects: [proj], extensions: [] });
		await setupAuditMocks(page);

		await page.goto(`/extensions/${EXT_ID}/audit`);

		await expect(page.getByTestId("audit-stats-total")).toContainText("2");
		await expect(page.getByTestId("audit-stats-denials")).toContainText("0");
		await expect(page.getByText("approximate; provider billing may differ")).toBeVisible();

		// Two rows.
		await expect(page.getByTestId("audit-row")).toHaveCount(2);
	});

	test("clicking Denials filter narrows the list", async ({ page, mockApi }) => {
		await mockApi({ projects: [proj], extensions: [] });
		await setupAuditMocks(page);

		await page.goto(`/extensions/${EXT_ID}/audit`);
		await page.getByTestId("audit-filter-denials").click();

		// Mock returns [] for status=denial.
		await expect(page.getByText("No audit entries match the current filters.")).toBeVisible();
	});

	test("expand-row reveals redacted before/after; no leaked credentials", async ({
		page,
		mockApi,
	}) => {
		await mockApi({ projects: [proj], extensions: [] });
		await setupAuditMocks(page);

		await page.goto(`/extensions/${EXT_ID}/audit`);

		const firstRow = page.getByTestId("audit-row").first();
		await firstRow.click();

		await expect(page.getByTestId("audit-row-detail")).toBeVisible();
		await expect(page.getByTestId("audit-row-detail")).toContainText("[REDACTED]");

		// Sweep the visible page text for fixture-shaped credentials —
		// any "sk-" prefix, "ANTHROPIC", "OPENAI_API_KEY" tokens should
		// be absent. We scope to the visible body.
		const bodyText = await page.evaluate(() => document.body.innerText);
		expect(bodyText).not.toMatch(/sk-[a-zA-Z0-9]{20,}/);
		expect(bodyText).not.toMatch(/ANTHROPIC_API_KEY=[A-Za-z0-9_-]+/);
		expect(bodyText).not.toMatch(/OPENAI_API_KEY=[A-Za-z0-9_-]+/);
	});

	test("granted permissions sidebar shows the snapshot", async ({
		page,
		mockApi,
	}) => {
		await mockApi({
			projects: [proj],
			extensions: [
				{
					id: EXT_ID,
					name: "audit-test-ext",
					version: "1.0.0",
					description: "",
					enabled: true,
					source: "local",
					installPath: "/tmp/x",
					checksumVerified: true,
					consecutiveFailures: 0,
					manifest: {
						author: "tester",
						entrypoint: "index.ts",
						persistent: false,
						tools: [],
						permissions: {},
					},
					grantedPermissions: {
						storage: true,
						network: ["https://api.example.com"],
						grantedAt: { storage: 1, network: 2 },
					},
				} as any,
			],
		});
		await setupAuditMocks(page);

		await page.goto(`/extensions/${EXT_ID}/audit`);
		await expect(page.getByTestId("audit-grants")).toContainText("storage");
		await expect(page.getByTestId("audit-grants")).toContainText("network");
		// Internal `grantedAt` bookkeeping is filtered out of the
		// rendered list.
		await expect(page.getByTestId("audit-grants")).not.toContainText("grantedAt");
	});
});
