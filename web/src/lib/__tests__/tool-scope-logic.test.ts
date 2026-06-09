/**
 * Unit tests for tool-scope-logic.ts — the shared per-extension tool-subset
 * logic. Pure functions, no DOM; runs under bun:test. Gated at 100%.
 */
import { test, expect, describe } from "bun:test";
import {
	isAllTools,
	isToolChecked,
	selectedLabel,
	toggleTool,
	selectAllTools,
	pruneDetached,
	type ToolScopeMap,
} from "../tool-scope-logic";

const ALL = ["summarize", "tldr", "translate"];

describe("isAllTools", () => {
	test("true when extension absent from map", () => {
		expect(isAllTools({}, "ext-1")).toBe(true);
	});
	test("true when subset is empty array", () => {
		expect(isAllTools({ "ext-1": [] }, "ext-1")).toBe(true);
	});
	test("false when a strict subset is present", () => {
		expect(isAllTools({ "ext-1": ["summarize"] }, "ext-1")).toBe(false);
	});
});

describe("isToolChecked", () => {
	test("all tools checked when extension in 'all' mode", () => {
		expect(isToolChecked({}, "ext-1", "summarize")).toBe(true);
		expect(isToolChecked({}, "ext-1", "tldr")).toBe(true);
	});
	test("only subset members checked when narrowed", () => {
		const map = { "ext-1": ["summarize"] };
		expect(isToolChecked(map, "ext-1", "summarize")).toBe(true);
		expect(isToolChecked(map, "ext-1", "tldr")).toBe(false);
	});
});

describe("selectedLabel", () => {
	test("'All tools' when in default state", () => {
		expect(selectedLabel({}, "ext-1")).toBe("All tools");
		expect(selectedLabel({ "ext-1": [] }, "ext-1")).toBe("All tools");
	});
	test("comma-joined subset (in stored order) when narrowed", () => {
		expect(selectedLabel({ "ext-1": ["tldr", "summarize"] }, "ext-1")).toBe("tldr, summarize");
	});
});

describe("toggleTool", () => {
	test("unchecking one tool from 'all' yields the remaining subset (manifest order)", () => {
		const next = toggleTool({}, "ext-1", "tldr", ALL);
		expect(next).toEqual({ "ext-1": ["summarize", "translate"] });
	});

	test("re-checking back to the full set collapses to 'all' (key removed)", () => {
		// Start with everything-but-tldr, then toggle tldr back on.
		const start: ToolScopeMap = { "ext-1": ["summarize", "translate"] };
		const next = toggleTool(start, "ext-1", "tldr", ALL);
		expect(next).toEqual({});
	});

	test("unchecking the last remaining tool collapses to 'all' (key removed)", () => {
		const start: ToolScopeMap = { "ext-1": ["summarize"] };
		const next = toggleTool(start, "ext-1", "summarize", ALL);
		expect(next).toEqual({});
	});

	test("checking a tool while in a subset adds it (manifest order preserved)", () => {
		const start: ToolScopeMap = { "ext-1": ["translate"] };
		const next = toggleTool(start, "ext-1", "summarize", ALL);
		// summarize precedes translate in manifest order.
		expect(next).toEqual({ "ext-1": ["summarize", "translate"] });
	});

	test("does not mutate the input map", () => {
		const start: ToolScopeMap = { "ext-1": ["summarize"] };
		const snapshot = JSON.parse(JSON.stringify(start));
		toggleTool(start, "ext-1", "tldr", ALL);
		expect(start).toEqual(snapshot);
	});

	test("drops stale subset names no longer in the manifest", () => {
		// "removed" is no longer in ALL — toggling another tool prunes it.
		const start: ToolScopeMap = { "ext-1": ["summarize", "removed"] };
		const next = toggleTool(start, "ext-1", "tldr", ALL);
		expect(next).toEqual({ "ext-1": ["summarize", "tldr"] });
	});

	test("preserves other extensions' keys untouched", () => {
		const start: ToolScopeMap = { "ext-1": ["summarize"], "ext-2": ["x"] };
		const next = toggleTool(start, "ext-1", "summarize", ALL);
		expect(next).toEqual({ "ext-2": ["x"] });
	});
});

describe("selectAllTools", () => {
	test("removes the extension's key, returns a new map", () => {
		const start: ToolScopeMap = { "ext-1": ["summarize"], "ext-2": ["x"] };
		const next = selectAllTools(start, "ext-1");
		expect(next).toEqual({ "ext-2": ["x"] });
		expect(start).toEqual({ "ext-1": ["summarize"], "ext-2": ["x"] });
	});
	test("no-op (clone) when extension already in 'all' mode", () => {
		const start: ToolScopeMap = { "ext-2": ["x"] };
		const next = selectAllTools(start, "ext-1");
		expect(next).toEqual({ "ext-2": ["x"] });
		expect(next).not.toBe(start);
	});
});

describe("pruneDetached", () => {
	test("keeps only subset keys whose extension is still attached", () => {
		const start: ToolScopeMap = { a: ["s"], b: ["t"], c: ["u"] };
		expect(pruneDetached(start, ["a", "c"])).toEqual({ a: ["s"], c: ["u"] });
	});
	test("an attached extension with no subset is not added", () => {
		const start: ToolScopeMap = { a: ["s"] };
		expect(pruneDetached(start, ["a", "b"])).toEqual({ a: ["s"] });
	});
	test("returns a new empty map when nothing matches", () => {
		const start: ToolScopeMap = { a: ["s"] };
		const next = pruneDetached(start, ["z"]);
		expect(next).toEqual({});
		expect(next).not.toBe(start);
	});
});
