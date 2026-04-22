import { describe, test, expect } from "bun:test";
import {
	toggleSelection,
	clearSelection,
	isSelected,
	selectionSize,
	orderedSelection,
} from "../select-mode.js";

describe("select-mode helpers", () => {
	test("toggleSelection returns a fresh Set with the id added when absent", () => {
		const initial = new Set<string>(["a"]);
		const next = toggleSelection(initial, "b");
		expect(next).not.toBe(initial); // new reference for Svelte reactivity
		expect(next.has("a")).toBe(true);
		expect(next.has("b")).toBe(true);
		// initial is untouched
		expect(initial.has("b")).toBe(false);
	});

	test("toggleSelection removes the id when already present", () => {
		const next = toggleSelection(new Set(["a", "b"]), "a");
		expect(next.has("a")).toBe(false);
		expect(next.has("b")).toBe(true);
	});

	test("clearSelection returns an empty Set", () => {
		const cleared = clearSelection();
		expect(cleared.size).toBe(0);
	});

	test("isSelected and selectionSize reflect the set contents", () => {
		const s = new Set(["a", "c"]);
		expect(isSelected(s, "a")).toBe(true);
		expect(isSelected(s, "b")).toBe(false);
		expect(selectionSize(s)).toBe(2);
	});

	test("orderedSelection preserves reference order and filters unselected ids", () => {
		const sel = new Set(["m-3", "m-1"]);
		const order = ["m-1", "m-2", "m-3", "m-4"];
		expect(orderedSelection(sel, order)).toEqual(["m-1", "m-3"]);
	});

	test("orderedSelection drops ids absent from the reference order", () => {
		const sel = new Set(["m-1", "stray"]);
		expect(orderedSelection(sel, ["m-1", "m-2"])).toEqual(["m-1"]);
	});

	test("toggleSelection on an empty set adds the id", () => {
		const next = toggleSelection(new Set(), "x");
		expect(Array.from(next)).toEqual(["x"]);
	});

	test("toggling the same id twice returns the original membership", () => {
		const start = new Set<string>(["a"]);
		const after = toggleSelection(toggleSelection(start, "b"), "b");
		expect(Array.from(after).sort()).toEqual(["a"]);
	});
});
