import { test, expect, describe } from "bun:test";
import {
	computePct,
	computeTone,
	fmtTokens,
	tooltipText,
	pickLastTurnInputTokens,
	type MessageLike,
} from "$lib/context-usage-logic";

// ── computePct ──────────────────────────────────────────────────────────────

describe("computePct", () => {
	test("returns null when usedTokens is null", () => {
		expect(computePct(null, 200_000)).toBeNull();
	});

	test("returns null when usedTokens is undefined", () => {
		expect(computePct(undefined, 200_000)).toBeNull();
	});

	test("returns null when contextWindow is null", () => {
		expect(computePct(1_000, null)).toBeNull();
	});

	test("returns null when contextWindow is zero", () => {
		expect(computePct(1_000, 0)).toBeNull();
	});

	test("returns null when contextWindow is negative", () => {
		expect(computePct(1_000, -5)).toBeNull();
	});

	test("returns null when inputs are non-finite", () => {
		expect(computePct(Number.NaN, 1_000)).toBeNull();
		expect(computePct(1_000, Number.POSITIVE_INFINITY)).toBeNull();
	});

	test("computes percentage correctly", () => {
		expect(computePct(50_000, 200_000)).toBe(25);
	});

	test("clamps above 100%", () => {
		expect(computePct(500_000, 200_000)).toBe(100);
	});

	test("clamps below 0%", () => {
		expect(computePct(-10, 200_000)).toBe(0);
	});

	test("supports fractional percentages", () => {
		expect(computePct(1, 3)).toBeCloseTo(33.333, 2);
	});
});

// ── computeTone ─────────────────────────────────────────────────────────────

describe("computeTone", () => {
	test("null → muted", () => {
		expect(computeTone(null)).toBe("muted");
	});

	test("0% → muted", () => {
		expect(computeTone(0)).toBe("muted");
	});

	test("just under warn threshold → muted", () => {
		expect(computeTone(69.9)).toBe("muted");
	});

	test("at warn threshold → warn", () => {
		expect(computeTone(70)).toBe("warn");
	});

	test("between warn and danger → warn", () => {
		expect(computeTone(85)).toBe("warn");
	});

	test("just under danger threshold → warn", () => {
		expect(computeTone(89.9)).toBe("warn");
	});

	test("at danger threshold → danger", () => {
		expect(computeTone(90)).toBe("danger");
	});

	test("100% → danger", () => {
		expect(computeTone(100)).toBe("danger");
	});
});

// ── fmtTokens ───────────────────────────────────────────────────────────────

describe("fmtTokens", () => {
	test("small numbers are integers", () => {
		expect(fmtTokens(0)).toBe("0");
		expect(fmtTokens(42)).toBe("42");
		expect(fmtTokens(999)).toBe("999");
	});

	test("thousands show one decimal below 10k", () => {
		expect(fmtTokens(1_000)).toBe("1.0k");
		expect(fmtTokens(1_234)).toBe("1.2k");
		expect(fmtTokens(9_876)).toBe("9.9k");
	});

	test("tens of thousands show no decimal", () => {
		expect(fmtTokens(10_000)).toBe("10k");
		expect(fmtTokens(12_345)).toBe("12k");
		expect(fmtTokens(200_000)).toBe("200k");
	});

	test("millions show one decimal", () => {
		expect(fmtTokens(1_000_000)).toBe("1.0M");
		expect(fmtTokens(1_234_567)).toBe("1.2M");
	});

	test("non-finite input falls back to 0", () => {
		expect(fmtTokens(Number.NaN)).toBe("0");
	});
});

// ── tooltipText ─────────────────────────────────────────────────────────────

describe("tooltipText", () => {
	test("returns placeholder when tokens are unknown", () => {
		expect(tooltipText(null, 200_000)).toBe("Context usage — appears after the first assistant response");
		expect(tooltipText(1_000, null)).toBe("Context usage — appears after the first assistant response");
	});

	test("formats used / window / percent", () => {
		expect(tooltipText(50_000, 200_000)).toBe("50k / 200k tokens used (25%)");
	});

	test("rounds percentage to nearest whole", () => {
		// 1/3 → 33.33…%
		expect(tooltipText(1_000, 3_000)).toBe("1.0k / 3.0k tokens used (33%)");
	});
});

// ── pickLastTurnInputTokens ─────────────────────────────────────────────────

describe("pickLastTurnInputTokens", () => {
	test("empty → null", () => {
		expect(pickLastTurnInputTokens([])).toBeNull();
	});

	test("user-only messages → null", () => {
		const msgs: MessageLike[] = [
			{ role: "user", usage: null },
			{ role: "user", usage: { inputTokens: 42 } },
		];
		expect(pickLastTurnInputTokens(msgs)).toBeNull();
	});

	test("system messages are ignored", () => {
		const msgs: MessageLike[] = [{ role: "system", usage: { inputTokens: 99 } }];
		expect(pickLastTurnInputTokens(msgs)).toBeNull();
	});

	test("returns inputTokens from the latest assistant message", () => {
		const msgs: MessageLike[] = [
			{ role: "user" },
			{ role: "assistant", usage: { inputTokens: 1_000 } },
			{ role: "user" },
			{ role: "assistant", usage: { inputTokens: 3_500 } },
		];
		expect(pickLastTurnInputTokens(msgs)).toBe(3_500);
	});

	test("skips assistant messages with missing usage", () => {
		const msgs: MessageLike[] = [
			{ role: "assistant", usage: { inputTokens: 1_000 } },
			{ role: "assistant", usage: null },
		];
		expect(pickLastTurnInputTokens(msgs)).toBe(1_000);
	});

	test("skips assistant messages with zero inputTokens (streaming placeholder)", () => {
		const msgs: MessageLike[] = [
			{ role: "assistant", usage: { inputTokens: 2_000 } },
			{ role: "user" },
			{ role: "assistant", usage: { inputTokens: 0 } },
		];
		expect(pickLastTurnInputTokens(msgs)).toBe(2_000);
	});

	test("skips non-numeric inputTokens", () => {
		const msgs: MessageLike[] = [
			{ role: "assistant", usage: { inputTokens: 5_000 } },
			{ role: "assistant", usage: { inputTokens: null as unknown as number } },
		];
		expect(pickLastTurnInputTokens(msgs)).toBe(5_000);
	});

	test("handles undefined usage entirely", () => {
		const msgs: MessageLike[] = [
			{ role: "assistant" },
			{ role: "assistant", usage: { inputTokens: 7_000 } },
		];
		expect(pickLastTurnInputTokens(msgs)).toBe(7_000);
	});

	test("all-null usage on all assistant messages → null", () => {
		const msgs: MessageLike[] = [
			{ role: "assistant", usage: null },
			{ role: "assistant", usage: { inputTokens: undefined } },
		];
		expect(pickLastTurnInputTokens(msgs)).toBeNull();
	});
});
