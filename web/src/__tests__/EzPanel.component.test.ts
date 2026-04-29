/**
 * Phase 48 Wave 3 — DOM tests for EzPanel.
 *
 * Post-W4 refactor: EzPanel now uses the same building blocks as the
 * regular chat page — the literal `ChatInput` component (with
 * `lockedMode={ modeSlug: 'ez', label: 'Ez' }` to collapse the model /
 * mode / thinking pickers and the attachment button into a single
 * static "Ez" chip) and `ChatMessage` for rendering. The panel
 * composes them into the slide-in drawer chrome and wires up the same
 * SSE consumption pattern via `startStreaming` and the
 * `ez:turn_saved` / `ez:client-tool` window events that
 * `stores.svelte.ts` re-dispatches.
 *
 * Covers:
 *   - panel renders only when the panel-open store is set
 *   - mount triggers `getOrCreateEzConversation` and renders fetched
 *     messages via `ChatMessage`
 *   - the composer is the locked `ChatInput`: the placeholder is the
 *     Ez prompt, no Model / Mode / Thinking pickers render, and a
 *     locked-mode chip is shown in their place
 *   - clicking the close button closes the panel
 *   - sending a message calls `sendMessage` with content + an
 *     `ezContext` payload synthesized from $page + the registry, then
 *     registers the runId with the global streaming store via
 *     `startStreaming`
 *   - an `ez:client-tool` window event is dispatched onto the global
 *     bus (by `stores.svelte.ts`) and EzPanel routes it through the
 *     client-tool dispatcher, POSTing the result back to
 *     `/api/conversations/[id]/tool-results`
 */
import "@testing-library/jest-dom/vitest";
import { render, fireEvent, waitFor } from "@testing-library/svelte";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

// Mock $app/state BEFORE importing the panel so the panel sees our page.
vi.mock("$app/state", () => ({
	page: {
		route: { id: "/(app)/agents/new" },
		params: { id: "abc" },
		url: { pathname: "/agents/new", search: "" },
	},
}));

// `vi.mock` factory bodies are hoisted above all imports, so they can't
// reference top-level test variables. `vi.hoisted` lets us declare the
// shared mock state inside the same hoisted region. All `vi.mock`
// factories below close over `mocks.*`.
const mocks = vi.hoisted(() => ({
	sendMessageMock: vi.fn(),
	fetchAllMessagesMock: vi.fn(),
	searchMentionsMock: vi.fn().mockResolvedValue([]),
	getOrCreateMock: vi.fn(),
	startStreamingMock: vi.fn().mockReturnValue(true),
	stopStreamingMock: vi.fn(),
	fakeStore: { streamingMessages: {}, streamingStatus: {} } as Record<string, unknown>,
}));

vi.mock("$lib/api.js", () => ({
	sendMessage: (...args: unknown[]) => mocks.sendMessageMock(...args),
	fetchAllMessages: (...args: unknown[]) => mocks.fetchAllMessagesMock(...args),
	searchMentions: (...args: unknown[]) => mocks.searchMentionsMock(...args),
}));
// `$lib/api` (without `.js`) is also referenced via PanelChatInput's
// `import { searchMentions } from "$lib/api"` — alias both spellings so
// the import resolves to the same mock under vitest's vite transform.
vi.mock("$lib/api", () => ({
	sendMessage: (...args: unknown[]) => mocks.sendMessageMock(...args),
	fetchAllMessages: (...args: unknown[]) => mocks.fetchAllMessagesMock(...args),
	searchMentions: (...args: unknown[]) => mocks.searchMentionsMock(...args),
}));

vi.mock("$lib/ez/api.js", () => ({
	getOrCreateEzConversation: () => mocks.getOrCreateMock(),
	getDraft: vi.fn(),
	consumeDraft: vi.fn(),
}));

// Stub the global runtime store imports we depend on (`startStreaming`,
// `stopStreaming`, `store`). The real implementations spin up an SSE
// client on import via `initStores`, which we don't want under jsdom —
// the panel only reads two slots (`streamingMessages`, `streamingStatus`)
// keyed by runId, and calls `startStreaming` / `stopStreaming` to register
// the active run.
vi.mock("$lib/stores.svelte.js", () => ({
	store: mocks.fakeStore,
	startStreaming: (...args: unknown[]) => mocks.startStreamingMock(...args),
	stopStreaming: (...args: unknown[]) => mocks.stopStreamingMock(...args),
}));

// `ChatMessage` pulls in `$lib/stores.svelte.js` *types* but doesn't
// access the running module at module-eval. Other transitive imports
// (MarkdownRenderer, ToolCallCard, ...) do touch DOM; those are fine
// under jsdom.

// Stub `connectionState` (used by ChatInput, not PanelChatInput, but
// imported via shared paths) — provide a minimal subscribe surface so
// any incidental subscription resolves cleanly.
vi.mock("$lib/stores/connection", () => ({
	connectionState: {
		subscribe: (fn: (s: { state: string; attempt: number; maxAttempts: number }) => void) => {
			fn({ state: "connected", attempt: 0, maxAttempts: 10 });
			return () => {};
		},
		set: () => {},
	},
}));

// Stub the toast helper so the api wrapper's lazy import in tests
// doesn't try to resolve the real $lib/toast on a 429 path.
vi.mock("$lib/toast.svelte", () => ({ addToast: vi.fn() }));
vi.mock("$lib/toast.svelte.js", () => ({ addToast: vi.fn() }));

import EzPanel from "$lib/components/ez/EzPanel.svelte";
import { ezPanelState, openEzPanel, closeEzPanel } from "$lib/ez/panel-store.svelte.js";
import { __resetForTests, registerContext } from "$lib/ez/registry";

beforeEach(() => {
	__resetForTests();
	closeEzPanel();
	// jsdom doesn't ship IntersectionObserver; PanelChatInput's
	// scroll-to-bottom effect calls it when both sentinel + container
	// refs are bound. Provide a no-op stub so the effect doesn't throw.
	if (typeof (globalThis as unknown as { IntersectionObserver?: unknown }).IntersectionObserver === "undefined") {
		(globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class {
			observe() {}
			unobserve() {}
			disconnect() {}
		};
	}
	mocks.sendMessageMock.mockReset().mockResolvedValue({ userMessage: { id: "u1", content: "hi", role: "user" }, runId: "r1" });
	mocks.fetchAllMessagesMock.mockReset().mockResolvedValue([]);
	mocks.startStreamingMock.mockReset().mockReturnValue(true);
	mocks.stopStreamingMock.mockReset();
	mocks.fakeStore.streamingMessages = {};
	mocks.fakeStore.streamingStatus = {};
	mocks.getOrCreateMock.mockReset().mockResolvedValue({
		conversationId: "ez-conv-1",
		kind: "ez" as const,
		modeId: "mode-ez",
		title: null,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	});
});

afterEach(() => {
	closeEzPanel();
});

describe("EzPanel — render gating", () => {
	test("renders nothing when the panel store is closed", () => {
		const { queryByTestId } = render(EzPanel);
		expect(queryByTestId("ez-panel")).toBeNull();
	});

	test("renders the panel when the store is open", async () => {
		openEzPanel();
		const { findByTestId } = render(EzPanel);
		expect(await findByTestId("ez-panel")).toBeInTheDocument();
	});
});

describe("EzPanel — conversation bootstrap", () => {
	test("fetches the Ez conversation on first open and lists messages", async () => {
		mocks.fetchAllMessagesMock.mockResolvedValue([
			{ id: "m1", role: "user", content: "hello there", conversationId: "ez-conv-1", excluded: false, createdAt: "", thinkingContent: null, model: null, provider: null, usage: null, runId: null, parentMessageId: null },
			{ id: "m2", role: "assistant", content: "hi! how can I help?", conversationId: "ez-conv-1", excluded: false, createdAt: "", thinkingContent: null, model: null, provider: null, usage: null, runId: null, parentMessageId: null },
		]);
		openEzPanel();
		const { findAllByTestId } = render(EzPanel);

		await waitFor(() => {
			expect(mocks.getOrCreateMock).toHaveBeenCalled();
			expect(mocks.fetchAllMessagesMock).toHaveBeenCalledWith("ez-conv-1");
		});

		const msgs = await findAllByTestId("ez-message");
		expect(msgs).toHaveLength(2);
		expect(msgs[0]).toHaveAttribute("data-role", "user");
		expect(msgs[0]).toHaveTextContent(/hello there/);
		expect(msgs[1]).toHaveAttribute("data-role", "assistant");
	});
});

describe("EzPanel — composer", () => {
	test("composer is the locked ChatInput — no model/mode/thinking pickers, single Ez chip", async () => {
		openEzPanel();
		const { findByPlaceholderText, queryByText, findByTestId } = render(EzPanel);
		// ChatInput exposes its textarea via the placeholder we pass in —
		// no `data-testid="ez-panel-input"`. The Ez surface is locked via
		// `lockedMode={ modeSlug: 'ez', label: 'Ez' }`, which collapses
		// the toolbar pickers into one static chip.
		expect(await findByPlaceholderText(/Ask Ez to do something/i)).toBeInTheDocument();
		// Picker `<span class="toolbar-label">` captions ("Model" /
		// "Mode" / "Thinking") must NOT render in locked mode.
		expect(queryByText(/^Model$/)).toBeNull();
		expect(queryByText(/^Mode$/)).toBeNull();
		expect(queryByText(/^Thinking$/)).toBeNull();
		// The locked chip stands in for them.
		const chip = await findByTestId("chat-input-locked-mode");
		expect(chip).toHaveTextContent(/^Ez$/);
		expect(chip).toHaveAttribute("data-mode-slug", "ez");
	});

	test("Send posts content + ezContext to api.sendMessage and starts streaming", async () => {
		// Register a page-level context entry so the serializer captures
		// some payload — verifies the wire shape end-to-end.
		registerContext({
			routeId: "/(app)/agents/new",
			data: { existingAgentNames: ["Foo"] },
			forms: { "agent-new": { schema: { name: "string" }, fill: () => {} } },
		});

		openEzPanel();
		const { findByPlaceholderText, findByLabelText } = render(EzPanel);

		// Wait until the conversation resolved and composer is enabled.
		await waitFor(() => expect(mocks.getOrCreateMock).toHaveBeenCalled());

		const input = await findByPlaceholderText(/Ask Ez to do something/i) as HTMLTextAreaElement;
		await waitFor(() => expect(input.disabled).toBe(false));
		await fireEvent.input(input, { target: { value: "summarize this" } });

		const sendBtn = await findByLabelText("Send message") as HTMLButtonElement;
		await waitFor(() => expect(sendBtn.disabled).toBe(false));
		await fireEvent.click(sendBtn);

		await waitFor(() => expect(mocks.sendMessageMock).toHaveBeenCalledTimes(1));
		const [convId, payload] = mocks.sendMessageMock.mock.calls[0]!;
		expect(convId).toBe("ez-conv-1");
		expect(payload.content).toBe("summarize this");
		expect(payload.ezContext).toBeDefined();
		expect(payload.ezContext.route.url).toBe("/agents/new");
		expect(payload.ezContext.data).toEqual({ existingAgentNames: ["Foo"] });
		expect(payload.ezContext.formIds).toEqual(["agent-new"]);

		// Ez follows the same SSE consumption pattern as the chat page —
		// once `sendMessage` returns a runId, the panel registers it with
		// the global streaming store. `run:token` / `run:status` events
		// then accumulate into `store.streamingMessages[runId]`.
		await waitFor(() => expect(mocks.startStreamingMock).toHaveBeenCalledWith("r1", "ez-conv-1"));
	});
});

describe("EzPanel — client-tool dispatch", () => {
	test("an ez:client-tool window event invokes the dispatcher and POSTs the result", async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
		// Spy on global fetch so we can assert the tool-results POST.
		// Cast through `unknown` because the vitest mock type has the
		// same call signature as `fetch` but omits the static helpers
		// (`preconnect`, etc.) that the upstream typedef requires.
		const originalFetch = globalThis.fetch;
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		openEzPanel();
		const { findByTestId } = render(EzPanel);
		await findByTestId("ez-panel");
		await waitFor(() => expect(mocks.getOrCreateMock).toHaveBeenCalled());

		// Dispatch the same window event `stores.svelte.ts` re-dispatches
		// for `ez:client-tool` bus messages. The panel's onMount listener
		// should pick this up and route through the dispatcher.
		// `navigate_to` with a same-origin path resolves cleanly without
		// needing a registered form handler.
		window.dispatchEvent(
			new CustomEvent("ez:client-tool", {
				detail: {
					conversationId: "ez-conv-1",
					toolCallId: "tc-1",
					toolName: "navigate_to",
					input: { path: "/agents/new" },
				},
			}),
		);

		await waitFor(() => {
			const calls = fetchMock.mock.calls;
			const toolResultsCall = calls.find((c) =>
				typeof c[0] === "string" && c[0].includes("/tool-results"),
			);
			expect(toolResultsCall).toBeDefined();
		});

		const toolResultsCall = fetchMock.mock.calls.find((c) =>
			typeof c[0] === "string" && c[0].includes("/tool-results"),
		)!;
		expect(toolResultsCall[0]).toBe(
			"/api/conversations/ez-conv-1/tool-results",
		);
		const body = JSON.parse((toolResultsCall[1] as RequestInit).body as string);
		expect(body.toolCallId).toBe("tc-1");
		expect(body.result.ok).toBe(true);
		expect(body.result.toolName).toBe("navigate_to");

		globalThis.fetch = originalFetch;
	});
});

describe("EzPanel — close button", () => {
	test("clicking close hides the panel via the store", async () => {
		openEzPanel();
		const { findByTestId, queryByTestId } = render(EzPanel);
		const close = await findByTestId("ez-panel-close");
		await fireEvent.click(close);
		expect(ezPanelState.open).toBe(false);
		await waitFor(() => expect(queryByTestId("ez-panel")).toBeNull());
	});
});
