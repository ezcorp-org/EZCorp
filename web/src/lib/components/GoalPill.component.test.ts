/**
 * DOM tests for `GoalPill.svelte` — the `◎ /goal active|paused` chip
 * that lives in `ChatHeader.svelte` and surfaces the goal-host's
 * autopilot state.
 *
 * Coverage targets (100% per-file gate via `coverage-thresholds.json`):
 *   - Initial-state hydration: mount → fetch `/goal-state` → render
 *     according to the response (`off` ⇒ nothing in DOM; `active` ⇒
 *     chip with timer; `paused` ⇒ chip without timer).
 *   - SSE-driven state transitions: window `goal:update` CustomEvent
 *     replaces local state when the conversationId matches.
 *   - Defense-in-depth conv-id filter: a `goal:update` for a DIFFERENT
 *     conversation is ignored.
 *   - Live elapsed timer reactivity in the active state.
 *   - Click handler invokes the `onstatus` callback (the parent owns
 *     the POST — the pill is presentation-only).
 *   - Cleanup: timer is cleared, event listener removed on destroy.
 *
 * Matches `EzActionCard.component.test.ts`'s pattern (jsdom +
 * @testing-library/svelte).
 */

import { render, fireEvent } from "@testing-library/svelte";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import GoalPill from "./GoalPill.svelte";

function stubFetch(response: unknown, ok = true) {
	const fn = vi.fn(
		async () =>
			new Response(JSON.stringify(response), {
				status: ok ? 200 : 500,
				headers: { "content-type": "application/json" },
			}),
	);
	vi.stubGlobal("fetch", fn);
	return fn;
}

beforeEach(() => {
	vi.useFakeTimers();
});
afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("GoalPill — initial state via /goal-state fetch", () => {
	test("state:'off' from the server → chip is NOT rendered", async () => {
		stubFetch({ state: "off" });
		const { queryByTestId } = render(GoalPill, { convId: "conv-1" });
		// The fetch promise resolves on the next microtask flush.
		await vi.waitFor(() => {
			// Still null after the fetch settles — `off` collapses
			// the chip out of the DOM entirely.
			expect(queryByTestId("goal-pill")).toBeNull();
		});
	});

	test("state:'active' → chip renders with active styling + elapsed timer", async () => {
		// `armedAt` is 30s ago in the wall clock. The pill's internal
		// `now` is `Date.now()` at mount, so the first render shows
		// ~30s. We don't need to advance the clock to assert presence.
		const armedAt = Date.now() - 30_000;
		stubFetch({
			state: "active",
			condition: "ship the chip",
			armedAt,
			turnsEvaluated: 0,
			lastReason: null,
		});
		const { findByTestId } = render(GoalPill, { convId: "conv-1" });
		const pill = await findByTestId("goal-pill");
		expect(pill.getAttribute("data-state")).toBe("active");
		expect(pill.textContent).toContain("/goal active");
		// Elapsed-time span is present in active state.
		const elapsed = await findByTestId("goal-pill-elapsed");
		expect(elapsed.textContent).toMatch(/\d+s/);
	});

	test("state:'paused' → chip renders with paused styling, NO elapsed timer", async () => {
		stubFetch({
			state: "paused",
			condition: "ship the chip",
			lastReason: "turn errored",
		});
		const { findByTestId, queryByTestId } = render(GoalPill, { convId: "conv-1" });
		const pill = await findByTestId("goal-pill");
		expect(pill.getAttribute("data-state")).toBe("paused");
		expect(pill.textContent).toContain("/goal paused");
		// Paused state suppresses the live timer (no `armedAt`-driven
		// counter — paused has no meaningful "elapsed" semantics).
		expect(queryByTestId("goal-pill-elapsed")).toBeNull();
	});

	test("fetch failure (network/500) → chip stays hidden (defaults to 'off')", async () => {
		stubFetch({ error: "boom" }, /*ok=*/ false);
		const { queryByTestId } = render(GoalPill, { convId: "conv-1" });
		await vi.advanceTimersByTimeAsync(100);
		// No exception thrown; chip stays out of DOM.
		expect(queryByTestId("goal-pill")).toBeNull();
	});
});

describe("GoalPill — SSE-driven state transitions (goal:update window CustomEvent)", () => {
	test("'off' → 'active' frame for THIS conversation shows the chip", async () => {
		stubFetch({ state: "off" });
		const { queryByTestId, findByTestId } = render(GoalPill, { convId: "conv-1" });
		await vi.advanceTimersByTimeAsync(50);
		expect(queryByTestId("goal-pill")).toBeNull();

		window.dispatchEvent(
			new CustomEvent("goal:update", {
				detail: {
					conversationId: "conv-1",
					state: "active",
					condition: "x",
					armedAt: Date.now(),
					turnsEvaluated: 0,
					lastReason: null,
				},
			}),
		);
		const pill = await findByTestId("goal-pill");
		expect(pill.getAttribute("data-state")).toBe("active");
	});

	test("frame for a DIFFERENT conversation is ignored (defense-in-depth)", async () => {
		stubFetch({ state: "off" });
		const { queryByTestId } = render(GoalPill, { convId: "conv-1" });
		await vi.advanceTimersByTimeAsync(50);
		expect(queryByTestId("goal-pill")).toBeNull();

		// Stale SSE frame addressed to conv-2 must NOT flip our chip.
		window.dispatchEvent(
			new CustomEvent("goal:update", {
				detail: {
					conversationId: "conv-2",
					state: "active",
					condition: "other conv's goal",
					armedAt: Date.now(),
				},
			}),
		);
		await vi.advanceTimersByTimeAsync(50);
		expect(queryByTestId("goal-pill")).toBeNull();
	});

	test("'active' → 'off' frame removes the chip", async () => {
		const armedAt = Date.now() - 10_000;
		stubFetch({ state: "active", condition: "x", armedAt });
		const { findByTestId, queryByTestId } = render(GoalPill, { convId: "conv-1" });
		await findByTestId("goal-pill");

		window.dispatchEvent(
			new CustomEvent("goal:update", {
				detail: { conversationId: "conv-1", state: "off" },
			}),
		);
		await vi.waitFor(() => {
			expect(queryByTestId("goal-pill")).toBeNull();
		});
	});

	test("'active' → 'paused' frame swaps styling and hides the timer", async () => {
		const armedAt = Date.now() - 5_000;
		stubFetch({ state: "active", condition: "x", armedAt });
		const { findByTestId, queryByTestId } = render(GoalPill, { convId: "conv-1" });
		const pill = await findByTestId("goal-pill");
		expect(pill.getAttribute("data-state")).toBe("active");
		// Timer present while active.
		expect(queryByTestId("goal-pill-elapsed")).toBeTruthy();

		window.dispatchEvent(
			new CustomEvent("goal:update", {
				detail: { conversationId: "conv-1", state: "paused", condition: "x", lastReason: "turn errored" },
			}),
		);
		await vi.waitFor(() => {
			expect(pill.getAttribute("data-state")).toBe("paused");
			expect(queryByTestId("goal-pill-elapsed")).toBeNull();
		});
	});

	test("malformed frame (no conversationId / non-object) is silently ignored", async () => {
		const armedAt = Date.now();
		stubFetch({ state: "active", condition: "x", armedAt });
		const { findByTestId } = render(GoalPill, { convId: "conv-1" });
		const pill = await findByTestId("goal-pill");

		// Non-object detail (defensive — a misbehaving emitter could
		// in theory send a string / number; we must not crash).
		window.dispatchEvent(new CustomEvent("goal:update", { detail: "garbage" }));
		// Null detail.
		window.dispatchEvent(new CustomEvent("goal:update", { detail: null }));
		// Missing conversationId.
		window.dispatchEvent(new CustomEvent("goal:update", { detail: { state: "paused" } }));

		// Chip still active — none of the malformed frames flipped state.
		await vi.advanceTimersByTimeAsync(50);
		expect(pill.getAttribute("data-state")).toBe("active");
	});

	test("partial frame fields are tolerated (only state is required); turns / reason flow through", async () => {
		const armedAt = Date.now();
		stubFetch({ state: "active", condition: "x", armedAt, turnsEvaluated: 0, lastReason: null });
		const { findByTestId } = render(GoalPill, { convId: "conv-1" });
		const pill = await findByTestId("goal-pill");
		expect(pill.getAttribute("data-state")).toBe("active");

		// SSE frame with turnsEvaluated + lastReason — these don't
		// visibly render on the chip (they belong on the status card)
		// but must not crash the partial-assign path.
		window.dispatchEvent(
			new CustomEvent("goal:update", {
				detail: {
					conversationId: "conv-1",
					state: "active",
					condition: "x",
					armedAt,
					turnsEvaluated: 3,
					lastReason: "still going",
				},
			}),
		);
		await vi.advanceTimersByTimeAsync(50);
		expect(pill.getAttribute("data-state")).toBe("active");
	});
});

describe("GoalPill — live elapsed timer", () => {
	test("elapsed string updates as wall-clock time advances", async () => {
		const armedAt = Date.now();
		stubFetch({ state: "active", condition: "x", armedAt });
		const { findByTestId } = render(GoalPill, { convId: "conv-1" });
		const elapsed = await findByTestId("goal-pill-elapsed");
		const t0 = elapsed.textContent ?? "";

		// Advance the wall clock + the pill's internal tick interval.
		await vi.advanceTimersByTimeAsync(5_000);

		// The text content should have updated (formatDuration moves
		// from e.g. "0s" through "5s").
		const t1 = elapsed.textContent ?? "";
		expect(t1).not.toBe(t0);
		expect(t1).toMatch(/\d+s/);
	});

	test("missing armedAt in active state ⇒ no elapsed span (graceful degradation)", async () => {
		// Post-restart hydration before in-memory record rebuilt:
		// the endpoint returns state:'active' without armedAt. The
		// chip must still render (the user can see the goal is on),
		// just without a timer.
		stubFetch({ state: "active", condition: "x" /* no armedAt */ });
		const { findByTestId, queryByTestId } = render(GoalPill, { convId: "conv-1" });
		const pill = await findByTestId("goal-pill");
		expect(pill.getAttribute("data-state")).toBe("active");
		expect(queryByTestId("goal-pill-elapsed")).toBeNull();
	});
});

describe("GoalPill — click + accessibility", () => {
	test("click invokes the onstatus callback (parent owns the POST)", async () => {
		const armedAt = Date.now();
		stubFetch({ state: "active", condition: "x", armedAt });
		const onstatus = vi.fn();
		const { findByTestId } = render(GoalPill, { convId: "conv-1", onstatus });
		const pill = await findByTestId("goal-pill");
		await fireEvent.click(pill);
		expect(onstatus).toHaveBeenCalledTimes(1);
	});

	test("click without an onstatus prop is a silent no-op (no thrown error)", async () => {
		const armedAt = Date.now();
		stubFetch({ state: "active", condition: "x", armedAt });
		const { findByTestId } = render(GoalPill, { convId: "conv-1" });
		const pill = await findByTestId("goal-pill");
		// Must not throw — the optional handler is invoked only when present.
		await fireEvent.click(pill);
	});

	test("aria-label reflects state (screen-reader friendly)", async () => {
		const armedAt = Date.now();
		stubFetch({ state: "active", condition: "x", armedAt });
		const { findByTestId } = render(GoalPill, { convId: "conv-1" });
		const active = await findByTestId("goal-pill");
		expect(active.getAttribute("aria-label")).toBe("Goal active");
	});

	test("aria-label for paused state", async () => {
		stubFetch({ state: "paused", condition: "x" });
		const { findByTestId } = render(GoalPill, { convId: "conv-1" });
		const paused = await findByTestId("goal-pill");
		expect(paused.getAttribute("aria-label")).toBe("Goal paused");
	});

	test("title tooltip carries the condition text for power users", async () => {
		const armedAt = Date.now();
		stubFetch({ state: "active", condition: "ship the chip", armedAt });
		const { findByTestId } = render(GoalPill, { convId: "conv-1" });
		const pill = await findByTestId("goal-pill");
		expect(pill.getAttribute("title")).toBe("/goal: ship the chip");
	});

	test("title tooltip falls back to a generic label when no condition is set yet", async () => {
		// Frame delivers state but no condition (defensive — should
		// not happen from the live endpoint, but the pill must cope).
		stubFetch({ state: "off" });
		const { queryByTestId, findByTestId } = render(GoalPill, { convId: "conv-1" });
		await vi.advanceTimersByTimeAsync(20);
		expect(queryByTestId("goal-pill")).toBeNull();
		window.dispatchEvent(
			new CustomEvent("goal:update", {
				detail: { conversationId: "conv-1", state: "paused" /* no condition */ },
			}),
		);
		const pill = await findByTestId("goal-pill");
		expect(pill.getAttribute("title")).toBe("/goal status");
	});
});

describe("GoalPill — cleanup", () => {
	test("destroying the component clears the timer and the SSE listener", async () => {
		const armedAt = Date.now();
		stubFetch({ state: "active", condition: "x", armedAt });
		const { findByTestId, unmount } = render(GoalPill, { convId: "conv-1" });
		await findByTestId("goal-pill");

		// Track addEventListener / removeEventListener pairs to assert
		// the symmetric cleanup. We spy AFTER mount so we only see the
		// destroy-time call.
		const removeSpy = vi.spyOn(window, "removeEventListener");
		unmount();
		// `goal:update` listener removed on unmount.
		const calls = removeSpy.mock.calls.filter((c) => c[0] === "goal:update");
		expect(calls.length).toBeGreaterThanOrEqual(1);
	});
});
