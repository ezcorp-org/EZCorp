/**
 * Svelte 5 DOM tests for DesignBriefCard.svelte.
 *
 * Mirrors the AskUserQuestionCard test pattern: stubs global `fetch`
 * (which userFetch wraps), renders the card with various ToolCallState
 * shapes, and verifies the rendered DOM + outbound POST body shape.
 *
 * Cases covered:
 *   1. Per-field input by kind: text→textarea, select→<select>,
 *      multi-select→checkbox group.
 *   2. `intro` text renders above the form.
 *   3. Multi-select toggles correctly (click-twice removes the option).
 *   4. Submit POSTs to /api/extensions/claude-design/events/brief-answer.
 *   5. POST body shape: { toolCallId, conversationId, answer: {...} }
 *      with all field values preserved (including multi-select arrays).
 *   6. Required-field empty → submit blocked, no fetch, error visible.
 *   7. status="complete" renders summary parsed from output.content[].text,
 *      not the form.
 *   8. Missing toolCall.id → renders inert error block, no submit.
 */

import { render, fireEvent, cleanup } from "@testing-library/svelte";
import { describe, test, expect, afterEach, vi, beforeEach } from "vitest";
import DesignBriefCard from "./DesignBriefCard.svelte";
import type { ToolCallState } from "$lib/stores.svelte.js";

afterEach(() => cleanup());

let fetchSpy: ReturnType<typeof vi.fn>;
let lastFetchInit: RequestInit | undefined;

beforeEach(() => {
	lastFetchInit = undefined;
	fetchSpy = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
		lastFetchInit = init;
		return new Response("{}", {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	});
	vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

type Field = {
	key: string;
	label: string;
	kind: "text" | "select" | "multi-select";
	options?: string[];
	placeholder?: string;
	required?: boolean;
};

function makeRunningCall(
	overrides: Partial<ToolCallState> & {
		input?: { fields?: Field[]; intro?: string };
	} = {},
): ToolCallState {
	const fields: Field[] = overrides.input?.fields ?? [
		{ key: "tone", label: "Tone", kind: "select", options: ["modern", "playful"] },
		{ key: "audience", label: "Audience", kind: "text", placeholder: "Who?" },
		{
			key: "sections",
			label: "Sections",
			kind: "multi-select",
			options: ["hero", "features", "pricing"],
		},
	];
	return {
		id: "tc-brief-1",
		toolName: "clarify-brief",
		status: "running",
		input: { fields, intro: overrides.input?.intro },
		startedAt: Date.now(),
		...overrides,
	} as ToolCallState;
}

describe("DesignBriefCard", () => {
	test("renders text→textarea, select→<select>, multi-select→checkbox group", () => {
		const { getByTestId } = render(DesignBriefCard, {
			toolCall: makeRunningCall(),
			conversationId: "conv-1",
		});
		// select kind → <select>
		const sel = getByTestId("design-brief-select-tone") as HTMLSelectElement;
		expect(sel.tagName).toBe("SELECT");
		// text kind → <textarea>
		const ta = getByTestId("design-brief-text-audience") as HTMLTextAreaElement;
		expect(ta.tagName).toBe("TEXTAREA");
		// multi-select kind → group of checkboxes
		const group = getByTestId("design-brief-multi-sections");
		const checkboxes = group.querySelectorAll('input[type="checkbox"]');
		expect(checkboxes.length).toBe(3);
	});

	test("intro text renders above the form when provided", () => {
		const { getByTestId } = render(DesignBriefCard, {
			toolCall: makeRunningCall({
				input: {
					fields: [{ key: "tone", label: "Tone", kind: "text" }],
					intro: "Tell me about your brand.",
				},
			}),
			conversationId: "conv-1",
		});
		const intro = getByTestId("design-brief-intro");
		expect(intro.textContent?.trim()).toBe("Tell me about your brand.");
	});

	test("multi-select toggles on click; clicking twice removes the option", async () => {
		const { getByTestId } = render(DesignBriefCard, {
			toolCall: makeRunningCall(),
			conversationId: "conv-1",
		});
		const group = getByTestId("design-brief-multi-sections");
		const boxes = Array.from(
			group.querySelectorAll('input[type="checkbox"]'),
		) as HTMLInputElement[];
		const heroBox = boxes[0]!;
		expect(heroBox.checked).toBe(false);
		await fireEvent.click(heroBox);
		expect(heroBox.checked).toBe(true);
		// Click again → removed.
		await fireEvent.click(heroBox);
		expect(heroBox.checked).toBe(false);
	});

	test("submit POSTs to /api/extensions/claude-design/events/brief-answer", async () => {
		const { getByTestId } = render(DesignBriefCard, {
			toolCall: makeRunningCall({
				input: {
					fields: [{ key: "tone", label: "Tone", kind: "text" }],
				},
			}),
			conversationId: "conv-1",
		});
		const ta = getByTestId("design-brief-text-tone") as HTMLTextAreaElement;
		await fireEvent.input(ta, { target: { value: "modern" } });
		await fireEvent.click(getByTestId("design-brief-submit"));

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		const [url] = fetchSpy.mock.calls[0]!;
		expect(String(url)).toBe(
			"/api/extensions/claude-design/events/brief-answer",
		);
	});

	test("POST body shape: { toolCallId, conversationId, answer: {...} } with all field values", async () => {
		const { getByTestId } = render(DesignBriefCard, {
			toolCall: makeRunningCall(),
			conversationId: "conv-42",
		});
		// Fill text, select, and toggle two multi-select options.
		const ta = getByTestId("design-brief-text-audience") as HTMLTextAreaElement;
		await fireEvent.input(ta, { target: { value: "developers" } });
		const sel = getByTestId("design-brief-select-tone") as HTMLSelectElement;
		await fireEvent.change(sel, { target: { value: "modern" } });
		const group = getByTestId("design-brief-multi-sections");
		const boxes = Array.from(
			group.querySelectorAll('input[type="checkbox"]'),
		) as HTMLInputElement[];
		await fireEvent.click(boxes[0]!); // hero
		await fireEvent.click(boxes[2]!); // pricing

		await fireEvent.click(getByTestId("design-brief-submit"));

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		const body = JSON.parse(String(lastFetchInit?.body));
		expect(body.toolCallId).toBe("tc-brief-1");
		expect(body.conversationId).toBe("conv-42");
		expect(body.answer.tone).toBe("modern");
		expect(body.answer.audience).toBe("developers");
		expect(body.answer.sections).toEqual(["hero", "pricing"]);
	});

	test("required-field empty → submit blocked, no fetch, error visible", async () => {
		const { getByTestId, findByTestId } = render(DesignBriefCard, {
			toolCall: makeRunningCall({
				input: {
					fields: [
						{ key: "tone", label: "Tone", kind: "text", required: true },
					],
				},
			}),
			conversationId: "conv-1",
		});
		await fireEvent.click(getByTestId("design-brief-submit"));
		expect(fetchSpy).not.toHaveBeenCalled();
		const err = await findByTestId("design-brief-error");
		expect(err.textContent).toContain("Tone");
	});

	test('status="complete" renders summary (parsed from output.content[].text), not the form', () => {
		const completed = makeRunningCall({
			status: "complete",
			output: {
				content: [
					{
						type: "text",
						text: JSON.stringify({
							tone: "modern",
							sections: ["hero", "features"],
						}),
					},
				],
			},
		});
		const { getByTestId, queryByTestId } = render(DesignBriefCard, {
			toolCall: completed,
			conversationId: "conv-1",
		});
		const summary = getByTestId("design-brief-summary");
		expect(summary).toBeInTheDocument();
		expect(summary.textContent).toContain("modern");
		expect(summary.textContent).toContain("hero, features");
		// Form should not be rendered.
		expect(queryByTestId("design-brief-form")).toBeNull();
	});

	test("missing toolCall.id renders inert error block and no submit affordance", () => {
		const noId = makeRunningCall({ id: undefined });
		const { getByTestId, queryByTestId } = render(DesignBriefCard, {
			toolCall: noId,
			conversationId: "conv-1",
		});
		expect(getByTestId("design-brief-missing-id")).toBeInTheDocument();
		// Submit button still exists in the form but is disabled.
		const submit = queryByTestId("design-brief-submit") as HTMLButtonElement | null;
		if (submit) {
			expect(submit).toBeDisabled();
		}
	});
});

describe("validation: DesignBriefCard — required reset, double-submit, intro display", () => {
	test("required-field error clears on the next submit attempt (after the user fills in the value)", async () => {
		const { getByTestId, queryByTestId, findByTestId } = render(DesignBriefCard, {
			toolCall: makeRunningCall({
				input: {
					fields: [{ key: "tone", label: "Tone", kind: "text", required: true }],
				},
			}),
			conversationId: "conv-1",
		});
		// Empty submit → error banner visible, no fetch.
		await fireEvent.click(getByTestId("design-brief-submit"));
		expect(fetchSpy).not.toHaveBeenCalled();
		const err = await findByTestId("design-brief-error");
		expect(err.textContent).toContain("Tone");
		// User clicks Retry to leave the error state, then types a value
		// and re-submits — the error must be gone and fetch must fire.
		await fireEvent.click(getByTestId("design-brief-retry"));
		expect(queryByTestId("design-brief-error")).toBeNull();
		const ta = getByTestId("design-brief-text-tone") as HTMLTextAreaElement;
		await fireEvent.input(ta, { target: { value: "modern" } });
		await fireEvent.click(getByTestId("design-brief-submit"));
		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});

	test("multiple submits while phase=sending do not re-fire the fetch", async () => {
		// Stub fetch to return a pending promise — phase stays 'sending'
		// until we resolve it. Repeated clicks should produce ONE call.
		let resolveOne: ((res: Response) => void) | undefined;
		fetchSpy.mockImplementation(async (_url: RequestInfo | URL, init?: RequestInit) => {
			lastFetchInit = init;
			return new Promise<Response>((resolve) => {
				resolveOne = resolve;
			});
		});
		const { getByTestId } = render(DesignBriefCard, {
			toolCall: makeRunningCall({
				input: {
					fields: [{ key: "tone", label: "Tone", kind: "text" }],
				},
			}),
			conversationId: "conv-1",
		});
		const ta = getByTestId("design-brief-text-tone") as HTMLTextAreaElement;
		await fireEvent.input(ta, { target: { value: "modern" } });
		const submit = getByTestId("design-brief-submit") as HTMLButtonElement;
		await fireEvent.click(submit);
		// Now phase=sending, button is disabled. Click multiple times.
		await fireEvent.click(submit);
		await fireEvent.click(submit);
		await fireEvent.click(submit);
		// Still exactly one outbound call. The button's `disabled` attr
		// is the contract that prevents double-submission.
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(submit.disabled).toBe(true);
		// Resolve so the test doesn't dangle a pending promise.
		resolveOne?.(new Response("{}", { status: 200 }));
	});

	test("status display: shows the intro text when present and 'awaiting answer' status pill", () => {
		const { getByTestId, container } = render(DesignBriefCard, {
			toolCall: makeRunningCall({
				input: {
					fields: [{ key: "x", label: "X", kind: "text" }],
					intro: "Tell me about your brand and audience.",
				},
			}),
			conversationId: "conv-1",
		});
		expect(getByTestId("design-brief-intro").textContent?.trim()).toBe(
			"Tell me about your brand and audience.",
		);
		// The header status pill shows 'awaiting answer' while running.
		expect(container.textContent ?? "").toContain("awaiting answer");
	});
});
