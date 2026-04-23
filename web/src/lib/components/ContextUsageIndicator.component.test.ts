/**
 * DOM tests for ContextUsageIndicator.svelte. Runs under vitest with the
 * Svelte plugin + jsdom. The pure-logic branches are covered by
 * `context-usage-logic.test.ts`; this file asserts the actual DOM output
 * for each visual state (hidden, muted, warn, danger).
 */

import { render, cleanup } from "@testing-library/svelte";
import { describe, test, expect, afterEach } from "vitest";
import ContextUsageIndicator from "./ContextUsageIndicator.svelte";

afterEach(() => cleanup());

describe("ContextUsageIndicator", () => {
	test("renders nothing when usedTokens is null", () => {
		const { queryByTestId } = render(ContextUsageIndicator, {
			usedTokens: null,
			contextWindow: 200_000,
		});
		expect(queryByTestId("context-usage-indicator")).toBeNull();
	});

	test("renders nothing when contextWindow is null", () => {
		const { queryByTestId } = render(ContextUsageIndicator, {
			usedTokens: 5_000,
			contextWindow: null,
		});
		expect(queryByTestId("context-usage-indicator")).toBeNull();
	});

	test("renders nothing when contextWindow is zero", () => {
		const { queryByTestId } = render(ContextUsageIndicator, {
			usedTokens: 5_000,
			contextWindow: 0,
		});
		expect(queryByTestId("context-usage-indicator")).toBeNull();
	});

	test("renders percent + bar width with muted tone under 70%", () => {
		const { getByTestId } = render(ContextUsageIndicator, {
			usedTokens: 50_000,
			contextWindow: 200_000,
		});
		const pill = getByTestId("context-usage-indicator");
		expect(pill.getAttribute("data-tone")).toBe("muted");
		expect(getByTestId("context-usage-pct").textContent).toBe("25%");
		expect(getByTestId("context-usage-bar").getAttribute("style")).toContain("width: 25");
	});

	test("applies warn tone at 70%", () => {
		const { getByTestId } = render(ContextUsageIndicator, {
			usedTokens: 140_000,
			contextWindow: 200_000,
		});
		expect(getByTestId("context-usage-indicator").getAttribute("data-tone")).toBe("warn");
		expect(getByTestId("context-usage-pct").textContent).toBe("70%");
	});

	test("applies danger tone at 90%", () => {
		const { getByTestId } = render(ContextUsageIndicator, {
			usedTokens: 180_000,
			contextWindow: 200_000,
		});
		expect(getByTestId("context-usage-indicator").getAttribute("data-tone")).toBe("danger");
		expect(getByTestId("context-usage-pct").textContent).toBe("90%");
	});

	test("clamps percent at 100% when overflow", () => {
		const { getByTestId } = render(ContextUsageIndicator, {
			usedTokens: 500_000,
			contextWindow: 200_000,
		});
		expect(getByTestId("context-usage-pct").textContent).toBe("100%");
		expect(getByTestId("context-usage-bar").getAttribute("style")).toContain("width: 100");
	});

	test("aria-label reflects the rounded percentage", () => {
		const { getByTestId } = render(ContextUsageIndicator, {
			usedTokens: 66_666,
			contextWindow: 200_000,
		});
		// 66666/200000 = 33.33% → rounded to 33
		expect(getByTestId("context-usage-indicator").getAttribute("aria-label")).toBe("Context used: 33 percent");
	});
});
