/**
 * Playwright e2e — substack-engagement review-queue card, viewed from
 * the chat UI.
 *
 * What this proves end-to-end through the user-facing surface:
 *   1. The assistant calls `open_review_queue`; the tool result carries
 *      `cardType: "substack-review"` + a pending/approved queue payload.
 *      `getCardComponentName("substack-review")` routes it to
 *      `SubstackReviewCard.svelte`, which renders one row per draft.
 *   2. The user edits a draft body, clicks "Approve & Send" → the card
 *      POSTs `edit_item` → `approve_item` → `send_approved` to
 *      `/api/tool-invoke` (mocked) → the row flips to `sent`.
 *   3. The Reject path: two-click inline confirm → `reject_item`.
 *   4. A pacing-blocked note-comment: `send_approved` returns
 *      `{deferred:1}` → the row STAYS approved + the deferred notice shows.
 *
 * Transport note (project gotcha): runtime events flow over SSE on
 * `/api/runtime-events`; we drive the tool card via `emitSse`, NOT
 * `emitWs`, mirroring openai-image-gen-edit-prior.spec.ts. The
 * extension subprocess never runs in CI — `/api/tool-invoke` is mocked
 * at the browser fetch boundary, which is exactly the surface the card
 * actually calls. The extension's own tool logic (approve/send/pacing)
 * is covered by the bun unit/integration suite under
 * docs/extensions/examples/substack-engagement/tests.
 */

import { test, expect } from "./fixtures/test-base.js";
import { makeProject, makeConversation } from "./fixtures/data.js";

const EXT = "substack-engagement";

const proj = makeProject({ id: "proj-sub", name: "Substack Project" });
const conv = makeConversation({
	id: "conv-sub",
	projectId: "proj-sub",
	model: "claude-sonnet-4-6",
	provider: "anthropic",
});

function reviewPayload(
	pending: Array<Record<string, unknown>>,
	approved: Array<Record<string, unknown>> = [],
) {
	return JSON.stringify({
		cardType: "substack-review",
		pending,
		approved,
		counts: { pending: pending.length, approved: approved.length },
	});
}

// Mock /api/tool-invoke and record every call. `sendResult` shapes the
// send_approved JSON output (sent vs deferred).
async function mockToolInvoke(
	page: import("@playwright/test").Page,
	opts: { sendOutput?: string; failSend?: boolean } = {},
) {
	const calls: Array<{ toolName: string; input: Record<string, unknown> }> = [];
	await page.route("**/api/tool-invoke", async (route) => {
		const body = route.request().postDataJSON() as {
			toolName: string;
			input: Record<string, unknown>;
		};
		calls.push({ toolName: body.toolName, input: body.input });
		if (body.toolName === "send_approved" && opts.failSend) {
			return route.fulfill({
				status: 200,
				json: { success: false, error: "401 expired token" },
			});
		}
		const output =
			body.toolName === "send_approved"
				? (opts.sendOutput ?? JSON.stringify({ sent: 1, deferred: 0 }))
				: "{}";
		return route.fulfill({ status: 200, json: { success: true, output } });
	});
	return { calls };
}

async function navigateAndOpenCard(
	page: import("@playwright/test").Page,
	mockApi: (o: unknown) => Promise<void>,
	emitSse: (e: { type: string; data: unknown }) => Promise<void>,
	payload: string,
) {
	await mockApi({
		projects: [proj],
		conversations: [conv],
		messages: [],
		routes: { "active-run": () => ({ runId: null }) },
	});
	await page.goto(`/project/${proj.id}/chat/${conv.id}`);
	await expect(page.getByText("Send a message to start the conversation")).toBeVisible({
		timeout: 8000,
	});
	await page.addStyleTag({ content: ".ez-button { display: none !important; }" });
	await page.waitForLoadState("networkidle");

	const textarea = page.locator("textarea").first();
	await expect(textarea).toBeEnabled({ timeout: 10_000 });
	await textarea.fill("show my review queue");
	await Promise.all([
		page.waitForResponse(
			(r) =>
				r.url().includes(`/conversations/${conv.id}/messages`) &&
				r.request().method() === "POST",
		),
		page.getByRole("button", { name: "Send message" }).click(),
	]);
	await expect(page.getByRole("button", { name: /stop/i })).toBeVisible({ timeout: 8000 });

	const invocationId = "inv-open-review";
	await emitSse({
		type: "tool:start",
		data: {
			conversationId: conv.id,
			toolName: "open_review_queue",
			extensionId: EXT,
			invocationId,
			input: {},
			cardType: "substack-review",
			timestamp: Date.now(),
		},
	});
	await emitSse({
		type: "tool:complete",
		data: {
			conversationId: conv.id,
			toolName: "open_review_queue",
			extensionId: EXT,
			invocationId,
			output: payload,
			cardType: "substack-review",
			duration: 50,
			success: true,
		},
	});
}

test.describe("substack-engagement — review-queue card", () => {
	test("edit + Approve & Send flips the row to sent through /api/tool-invoke", async ({
		page,
		mockApi,
		emitSse,
	}) => {
		const { calls } = await mockToolInvoke(page, {
			sendOutput: JSON.stringify({ sent: 1, deferred: 0 }),
		});
		await navigateAndOpenCard(
			page,
			mockApi,
			emitSse,
			reviewPayload([
				{
					id: "q-1",
					kind: "reply",
					status: "pending",
					target_ref: "c-1",
					context: "loved this piece",
					draft_body: "thanks! what part resonated?",
					due_at: null,
				},
			]),
		);

		const card = page.getByTestId("substack-review-card");
		await expect(card).toBeVisible({ timeout: 8000 });
		const row = page.getByTestId("review-row").first();
		await expect(row).toHaveAttribute("data-status", "pending");
		await expect(page.getByTestId("review-context")).toContainText("loved this piece");

		// Edit the draft body.
		const body = page.getByTestId("review-body").first();
		await body.fill("thanks — what hooked you most?");

		// Approve & Send.
		await page.getByTestId("review-approve-send").first().click();

		// Row flips to sent; the wired tool calls fired in order.
		await expect(row).toHaveAttribute("data-status", "sent", { timeout: 8000 });
		const names = calls.map((c) => c.toolName);
		expect(names).toEqual(["edit_item", "approve_item", "send_approved"]);
		expect(calls[0]?.input.draft_body).toBe("thanks — what hooked you most?");
		expect(calls[2]?.input).toEqual({ id: "q-1" });
	});

	test("Reject requires two clicks then calls reject_item", async ({
		page,
		mockApi,
		emitSse,
	}) => {
		const { calls } = await mockToolInvoke(page);
		await navigateAndOpenCard(
			page,
			mockApi,
			emitSse,
			reviewPayload([
				{
					id: "q-2",
					kind: "welcome-dm",
					status: "pending",
					target_ref: "s-1",
					context: "New subscriber: Ada",
					draft_body: "welcome aboard!",
					due_at: null,
				},
			]),
		);

		const reject = page.getByTestId("review-reject").first();
		await expect(reject).toContainText("Reject");

		// First click arms the confirm; no tool call yet.
		await reject.click();
		await expect(reject).toContainText("Confirm?");
		expect(calls.some((c) => c.toolName === "reject_item")).toBe(false);

		// Second click rejects.
		await reject.click();
		await expect(page.getByTestId("review-row").first()).toHaveAttribute(
			"data-status",
			"rejected",
			{ timeout: 8000 },
		);
		expect(calls.find((c) => c.toolName === "reject_item")?.input).toEqual({ id: "q-2" });
	});

	test("a pacing-blocked note-comment stays approved + shows the deferred notice", async ({
		page,
		mockApi,
		emitSse,
	}) => {
		await mockToolInvoke(page, {
			sendOutput: JSON.stringify({ sent: 0, deferred: 1 }),
		});
		await navigateAndOpenCard(
			page,
			mockApi,
			emitSse,
			reviewPayload([
				{
					id: "q-3",
					kind: "note-comment",
					status: "pending",
					target_ref: "n-1",
					context: "interesting note about pacing",
					draft_body: "great point — have you tried X?",
					due_at: null,
				},
			]),
		);

		await page.getByTestId("review-approve-send").first().click();

		// Deferred → row stays approved (NOT sent) + notice surfaces.
		await expect(page.getByTestId("review-action-error")).toContainText("deferred", {
			timeout: 8000,
		});
		await expect(page.getByTestId("review-row").first()).toHaveAttribute(
			"data-status",
			"approved",
		);
	});

	test("a send failure surfaces the error + marks the row failed", async ({
		page,
		mockApi,
		emitSse,
	}) => {
		await mockToolInvoke(page, { failSend: true });
		await navigateAndOpenCard(
			page,
			mockApi,
			emitSse,
			reviewPayload([
				{
					id: "q-4",
					kind: "reply",
					status: "pending",
					target_ref: "c-9",
					context: "nice",
					draft_body: "thank you!",
					due_at: null,
				},
			]),
		);

		await page.getByTestId("review-approve-send").first().click();
		await expect(page.getByTestId("review-action-error")).toContainText("401 expired", {
			timeout: 8000,
		});
		await expect(page.getByTestId("review-row").first()).toHaveAttribute(
			"data-status",
			"failed",
		);
	});

	test("empty queue renders the empty state", async ({ page, mockApi, emitSse }) => {
		await mockToolInvoke(page);
		await navigateAndOpenCard(page, mockApi, emitSse, reviewPayload([]));
		await expect(page.getByTestId("review-empty")).toBeVisible({ timeout: 8000 });
	});
});
