/**
 * Phase 48 Wave 4 — chat-page EzContext data shape.
 *
 * The chat page (`/project/[id]/chat/[convId]/+page.svelte`) is one of
 * the largest in the codebase — its full render graph (WS bus, runtime
 * stores, message-window pagination, dock, ...) is out of scope for a
 * focused test of the Ez context payload. We split into two layers:
 *
 *   - Pure-logic tests around `buildChatEzContextData` (truncation,
 *     last-5 selection, title fallback, non-string content).
 *   - A render test against `<EzContext>` driven by the same helper —
 *     verifies the live registry receives the payload the chat page
 *     constructs at runtime.
 *
 * This keeps the must-have artifact (the `<EzContext>` registration
 * with the right data shape) covered without chasing the chat page's
 * async hydration to a green state under jsdom.
 */
import "@testing-library/jest-dom/vitest";
import { render } from "@testing-library/svelte";
import { describe, test, expect, beforeEach, vi } from "vitest";
import EzContext from "$lib/components/ez/EzContext.svelte";
import { readSnapshot, __resetForTests } from "$lib/ez/registry";
import {
	buildChatEzContextData,
	RECENT_MESSAGE_LIMIT,
	RECENT_MESSAGE_CHAR_LIMIT,
	type ChatMessageLike,
} from "$lib/ez/chat-context";

vi.mock("$app/state", () => ({
	page: { route: { id: "/(app)/project/[id]/chat/[convId]" }, params: { id: "p", convId: "c" }, url: { pathname: "/project/p/chat/c", search: "" } },
}));

beforeEach(() => __resetForTests());

function makeMsg(over: Partial<ChatMessageLike> = {}): ChatMessageLike {
	return { id: over.id ?? "m", role: over.role ?? "user", content: over.content ?? "hi" };
}

describe("buildChatEzContextData — pure logic", () => {
	test("returns conversationId, title, and messageCount", () => {
		const data = buildChatEzContextData({
			conversationId: "conv-x",
			conversationTitle: "My Chat",
			messages: [makeMsg(), makeMsg()],
		});
		expect(data.conversationId).toBe("conv-x");
		expect(data.conversationTitle).toBe("My Chat");
		expect(data.messageCount).toBe(2);
	});

	test("conversationTitle defaults to null when null/undefined", () => {
		const a = buildChatEzContextData({ conversationId: "c", messages: [] });
		const b = buildChatEzContextData({ conversationId: "c", conversationTitle: null, messages: [] });
		expect(a.conversationTitle).toBeNull();
		expect(b.conversationTitle).toBeNull();
	});

	test("recentMessages caps at RECENT_MESSAGE_LIMIT and keeps the LAST entries", () => {
		const msgs = Array.from({ length: RECENT_MESSAGE_LIMIT + 3 }, (_, i) =>
			makeMsg({ id: `m${i}`, content: `text${i}` }),
		);
		const data = buildChatEzContextData({ conversationId: "c", messages: msgs });
		expect(data.recentMessages).toHaveLength(RECENT_MESSAGE_LIMIT);
		expect(data.recentMessages[0]?.id).toBe(`m${msgs.length - RECENT_MESSAGE_LIMIT}`);
		expect(data.recentMessages[data.recentMessages.length - 1]?.id).toBe(`m${msgs.length - 1}`);
	});

	test("text is truncated to RECENT_MESSAGE_CHAR_LIMIT with an ellipsis when too long", () => {
		const long = "x".repeat(RECENT_MESSAGE_CHAR_LIMIT + 50);
		const data = buildChatEzContextData({
			conversationId: "c",
			messages: [makeMsg({ content: long })],
		});
		const text = data.recentMessages[0]!.text;
		expect(text.length).toBeLessThanOrEqual(RECENT_MESSAGE_CHAR_LIMIT);
		expect(text.endsWith("…")).toBe(true);
	});

	test("text shorter than the cap is preserved verbatim", () => {
		const data = buildChatEzContextData({
			conversationId: "c",
			messages: [makeMsg({ content: "short" })],
		});
		expect(data.recentMessages[0]?.text).toBe("short");
	});

	test("non-string content (tool-only assistant blocks) becomes empty string", () => {
		const data = buildChatEzContextData({
			conversationId: "c",
			messages: [makeMsg({ id: "m1", role: "assistant", content: [{ type: "tool_use" }] as unknown })],
		});
		expect(data.recentMessages[0]?.text).toBe("");
	});

	test("empty messages list yields zero count and no recent entries", () => {
		const data = buildChatEzContextData({ conversationId: "c", messages: [] });
		expect(data.messageCount).toBe(0);
		expect(data.recentMessages).toEqual([]);
	});
});

describe("EzContext + chat data — registry shape", () => {
	test("rendering <EzContext> with the chat-page payload registers it under the chat route", () => {
		const data = buildChatEzContextData({
			conversationId: "conv-1",
			conversationTitle: "Hello",
			messages: [makeMsg({ id: "m1", role: "user", content: "First message" })],
		});
		render(EzContext, { props: { data, forms: {} } });
		const snap = readSnapshot();
		expect(snap).toHaveLength(1);
		expect(snap[0]?.data).toEqual(data);
		// Chat page registers NO forms — Ez can't fill the chat surface.
		expect(Object.keys(snap[0]?.forms ?? {})).toHaveLength(0);
		expect(snap[0]?.routeId).toBe("/(app)/project/[id]/chat/[convId]");
	});
});
