/**
 * Regression test for the blank-turn race in reconcileAfterStream().
 *
 * Bug: when run:complete fires, the page calls fetchAllMessages. If the
 * backend hasn't finished persisting the assistant turn yet, the row comes
 * back with content:"". Pre-fix, the assistant turn rendered blank.
 *
 * Fix: page-local `streamedSnapshot` mirrors the live cache while streaming
 * is active and survives `stopStreaming`'s synchronous wipe. The reconcile
 * uses the snapshot to back-fill empty assistant content.
 *
 * Note on transports: runtime events flow over SSE on `/api/runtime-events`
 * via EventSource. The shared `emitWs` helper at `fixtures/test-base.ts`
 * only emits to the WebSocket stub. We use the same `installFakeTransports`
 * + `__pushSse` pattern as `chat-stream-survives-convo-switch.spec.ts`.
 *
 * Note on routing: `setupApiMocks`'s `routes` override matches by path-prefix
 * with no method awareness — installing the GET-empty stub through it would
 * also clobber the POST that returns `{ userMessage, runId }`. We register
 * a method-aware `page.route` BEFORE `setupApiMocks` so it runs first; non-
 * matching requests fall through to the default handler via `route.fallback()`.
 */

import { test, expect, type Page } from "@playwright/test";
import { setupApiMocks } from "./fixtures/api-mocks.js";
import { makeProject, makeConversation, makeMessage } from "./fixtures/data.js";

async function installFakeTransports(page: Page) {
	await page.addInitScript(() => {
		const esInstances: Array<{ url: string; instance: any }> = [];

		class FakeEventSource {
			static CONNECTING = 0;
			static OPEN = 1;
			static CLOSED = 2;
			readyState = 1;
			url: string;
			onopen: ((e: Event) => void) | null = null;
			onmessage: ((e: MessageEvent) => void) | null = null;
			onerror: ((e: Event) => void) | null = null;
			constructor(url: string) {
				this.url = url;
				esInstances.push({ url, instance: this });
				queueMicrotask(() => {
					this.readyState = 1;
					this.onopen?.(new Event("open"));
				});
			}
			addEventListener() {}
			removeEventListener() {}
			close() {
				this.readyState = 2;
			}
		}

		(window as any).EventSource = FakeEventSource;
		(window as any).__fakeEventSources = esInstances;

		(window as any).__pushSse = (evt: { type: string; data: unknown }) => {
			const list = (window as any).__fakeEventSources as Array<{
				instance: { onmessage: ((e: MessageEvent) => void) | null };
			}>;
			for (const { instance } of list) {
				instance.onmessage?.(
					new MessageEvent("message", { data: JSON.stringify(evt) }),
				);
			}
		};

		const fakeWs = {
			readyState: 1,
			send() {},
			close() {},
			addEventListener() {},
			removeEventListener() {},
		};
		(window as any).WebSocket = function () { return fakeWs; };
		(window as any).WebSocket.CONNECTING = 0;
		(window as any).WebSocket.OPEN = 1;
		(window as any).WebSocket.CLOSING = 2;
		(window as any).WebSocket.CLOSED = 3;
	});
}

async function pushSse(page: Page, event: { type: string; data: unknown }) {
	await page.evaluate((evt) => {
		(window as any).__pushSse?.(evt);
	}, event);
}

test.describe("chat blank turn race — reconcileAfterStream snapshot fallback", () => {
	const proj = makeProject({ id: "proj-race", name: "Race Project" });
	const conv = makeConversation({ id: "conv-race", projectId: "proj-race", title: "Race Chat" });

	test("assistant turn renders streamed text when post-stream fetch returns empty content", async ({
		page,
	}) => {
		await installFakeTransports(page);

		// Track GET-messages calls so the post-stream fetch can return empty
		// content (race) while subsequent fetches return the persisted row.
		let getMessagesCallCount = 0;

		await setupApiMocks(page, {
			projects: [proj],
			conversations: [conv],
			messages: [],
		});

		// Method-aware override registered AFTER setupApiMocks. Playwright tries
		// route handlers in reverse registration order, so this runs FIRST.
		// Falls through to the default handler for non-GET methods.
		await page.route("**/api/conversations/conv-race/messages*", async (route) => {
			const req = route.request();
			if (req.method() !== "GET") return route.fallback();
			const url = new URL(req.url());
			if (url.searchParams.get("withToolCalls") === "true") return route.fallback();

			getMessagesCallCount++;
			if (getMessagesCallCount === 1) {
				return route.fulfill({ json: [] });
			}
			if (getMessagesCallCount === 2) {
				// Post-stream reconcile — DB hasn't persisted the assistant row yet.
				return route.fulfill({
					json: [
						makeMessage({
							id: "msg-user",
							conversationId: "conv-race",
							role: "user",
							content: "Hello",
							runId: null,
						}),
						makeMessage({
							id: "msg-assistant",
							conversationId: "conv-race",
							role: "assistant",
							content: "",
							runId: "run-stream",
							parentMessageId: "msg-user",
						}),
					],
				});
			}
			return route.fulfill({
				json: [
					makeMessage({
						id: "msg-user",
						conversationId: "conv-race",
						role: "user",
						content: "Hello",
						runId: null,
					}),
					makeMessage({
						id: "msg-assistant",
						conversationId: "conv-race",
						role: "assistant",
						content: "streamed answer",
						runId: "run-stream",
						parentMessageId: "msg-user",
					}),
				],
			});
		});

		await page.goto(`/project/proj-race/chat/conv-race`);
		await expect(
			page.getByText("Send a message to start the conversation"),
		).toBeVisible({ timeout: 5000 });

		// Send the message. The default POST handler returns
		// `{ userMessage, runId: "run-stream" }` (api-mocks.ts:369), which the
		// page wires into `startStreaming("run-stream", convId)` and pushes a
		// placeholder assistant message at id `streaming-run-stream`.
		await page.locator("textarea").fill("Hello");
		await page.getByRole("button", { name: "Send message" }).click();
		await expect(page.getByText("Hello")).toBeVisible({ timeout: 5000 });
		// Stop button visibility proves `startStreaming` registered the run.
		await expect(page.getByRole("button", { name: /stop/i })).toBeVisible({
			timeout: 8000,
		});

		// Push tokens via SSE (the actual transport).
		await pushSse(page, {
			type: "run:token",
			data: { runId: "run-stream", token: "streamed " },
		});
		await pushSse(page, {
			type: "run:token",
			data: { runId: "run-stream", token: "answer" },
		});
		await expect(page.getByText("streamed answer")).toBeVisible({ timeout: 5000 });

		// run:complete payload shape per stores.svelte.ts:834: `event.data.run`.
		await pushSse(page, {
			type: "run:complete",
			data: {
				run: {
					id: "run-stream",
					agentName: "test",
					status: "success",
					startedAt: "2026-01-01T00:00:00.000Z",
					logs: [],
					result: { success: true, output: "streamed answer" },
				},
			},
		});

		// Allow the reconcile effect to settle.
		await page.waitForTimeout(500);

		// Streamed text MUST still be visible — pre-fix the empty row from the
		// post-stream fetch would clobber it. The snapshot back-fill keeps it.
		await expect(page.getByText("streamed answer")).toBeVisible({ timeout: 5000 });
	});
});
