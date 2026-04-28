/**
 * claude-design e2e — clarify-brief form-card flow.
 *
 * Mocks a `claude-design__clarify-brief` tool start that carries a
 * fields descriptor array. Asserts the DesignBriefCard renders the
 * select + textarea inputs, refuses to submit while a required field
 * is empty, and on submit POSTs the structured `{toolCallId,
 * conversationId, answer}` body to the generic events route.
 *
 * Mirrors the canvas-dock-knob-change.spec.ts intercept pattern: the
 * route handler is registered BEFORE the catch-all api mock so it
 * wins by Playwright's registration-order rule.
 */
import { test, expect } from "./fixtures/test-base.js";
import { makeProject, makeConversation, makeMessage } from "./fixtures/data.js";

test.describe("claude-design — clarify-brief form-card flow", () => {
	const proj = makeProject({ id: "proj-1", name: "Test Project" });
	const conv = makeConversation({ id: "conv-1", projectId: "proj-1", title: "Test" });
	const userMsg = makeMessage({
		id: "m1",
		conversationId: "conv-1",
		role: "user",
		content: "Make me a marketing page.",
	});
	const assistantMsg = makeMessage({
		id: "m2",
		conversationId: "conv-1",
		role: "assistant",
		content: "Sure",
		parentMessageId: "m1",
		createdAt: "2026-01-01T00:01:00.000Z",
	});

	const TOOL_CALL_ID = "tc-brief-1";

	test("renders form, blocks submit when required missing, POSTs answer body", async ({
		page,
		mockApi,
		emitWs,
	}) => {
		// Intercept BEFORE mockApi registers `**/api/**` catch-all.
		const captured: Array<{ url: string; body: unknown }> = [];
		await page.route(
			"**/api/extensions/claude-design/events/brief-answer",
			async (route) => {
				const reqBody = route.request().postDataJSON();
				captured.push({ url: route.request().url(), body: reqBody });
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({ ok: true }),
				});
			},
		);

		await mockApi({
			projects: [proj],
			conversations: [conv],
			messages: [userMsg, assistantMsg],
		});
		await page.goto(`/project/${proj.id}/chat/${conv.id}`);

		const textarea = page.locator("textarea");
		await textarea.fill("brief");
		await textarea.press("Enter");
		await page.waitForResponse(
			(r) => r.url().includes("/messages") && r.request().method() === "POST",
		);

		// Stream a `tool:start` for clarify-brief — this is a card whose
		// renderer reads `toolCall.input.fields` directly. Unlike dock
		// cards we do NOT need to wait for `tool:complete`; the form
		// renders immediately on start.
		await emitWs({
			type: "tool:start",
			data: {
				conversationId: "conv-1",
				toolName: "claude-design__clarify-brief",
				input: {
					fields: [
						{
							key: "tone",
							label: "Tone",
							kind: "select",
							options: ["modern", "playful"],
							required: true,
						},
						{
							key: "audience",
							label: "Audience",
							kind: "text",
						},
					],
				},
				timestamp: Date.now(),
				cardType: "design-brief",
				invocationId: TOOL_CALL_ID,
			},
		});

		// Card mounts.
		await expect(page.getByTestId("design-brief-card")).toBeVisible({ timeout: 3000 });
		await expect(page.getByTestId("design-brief-form")).toBeVisible();

		// Per-kind input rendering.
		const toneSelect = page.getByTestId("design-brief-select-tone");
		const audienceText = page.getByTestId("design-brief-text-audience");
		await expect(toneSelect).toBeVisible();
		await expect(audienceText).toBeVisible();
		expect(await toneSelect.evaluate((el) => el.tagName)).toBe("SELECT");
		expect(await audienceText.evaluate((el) => el.tagName)).toBe("TEXTAREA");

		// Submit without required `tone` → form blocked, error shown,
		// no fetch fired.
		await page.getByTestId("design-brief-submit").click();
		await expect(page.getByTestId("design-brief-error")).toBeVisible();
		expect(captured.length).toBe(0);

		// Now fill in the required select + the optional text and submit.
		await toneSelect.selectOption("modern");
		await audienceText.fill("developers");
		await page.getByTestId("design-brief-submit").click();

		await expect.poll(() => captured.length, { timeout: 3000 }).toBeGreaterThan(0);
		const sent = captured[0]!;
		expect(sent.url).toContain(
			"/api/extensions/claude-design/events/brief-answer",
		);
		const body = sent.body as {
			toolCallId: string;
			conversationId: string;
			answer: { tone?: string; audience?: string };
		};
		expect(body.toolCallId).toBe(TOOL_CALL_ID);
		expect(body.conversationId).toBe("conv-1");
		expect(body.answer.tone).toBe("modern");
		expect(body.answer.audience).toBe("developers");
	});
});
