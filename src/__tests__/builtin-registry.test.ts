import { test, expect, describe } from "bun:test";

import { getBuiltInToolMetadata, getBuiltInCategories, getBuiltInToolsByCategory } from "../runtime/tools/builtin-registry";

describe("builtin-registry", () => {
  test("returns 0 tools (registry is empty after Phase 5 commit 4)", () => {
    // Phase 1 moved the 2 scratchpad tools out of the built-in registry
    // into a bundled extension. Phase 3 commit-5 moved the 12
    // task-tracking tools. Phase 4 commit-5 moved `invoke_agent`.
    // Phase 5 commit 4 moved the last resident, `ask_human`, to the
    // bundled `orchestration` extension. The built-in registry is now
    // empty — the module is retained as an API-shape shell.
    const tools = getBuiltInToolMetadata();
    expect(tools).toHaveLength(0);
  });

  test("scratchpad, task-tracking, invoke_agent, and ask_human are no longer in the built-in registry", () => {
    const tools = getBuiltInToolMetadata();
    expect(tools.some((t) => t.name === "scratchpad_write")).toBe(false);
    expect(tools.some((t) => t.name === "task_plan")).toBe(false);
    expect(tools.some((t) => t.name === "task_list")).toBe(false);
    expect(tools.some((t) => t.name === "invoke_agent")).toBe(false);
    expect(tools.some((t) => t.name === "ask_human")).toBe(false);
    expect(tools.some((t) => (t as { category: string }).category === "scratchpad")).toBe(false);
    expect(tools.some((t) => (t as { category: string }).category === "task-tracking")).toBe(false);
    expect(tools.some((t) => (t as { category: string }).category === "orchestration")).toBe(false);
  });

  test("no categories remain", () => {
    const tools = getBuiltInToolMetadata();
    // Every remaining tool (there are none) has a category — no residual
    // categories sneak through.
    expect(tools.map((t) => t.category)).toEqual([]);
  });

  test("no duplicate names", () => {
    const tools = getBuiltInToolMetadata();
    const names = tools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test("getBuiltInCategories returns empty — no mentionable built-in categories left", () => {
    const categories = getBuiltInCategories();
    const names = categories.map((c) => c.name);
    expect(names).not.toContain("task-tracking");
    expect(names).not.toContain("scratchpad");
    expect(names).not.toContain("orchestration");
    expect(names).toHaveLength(0);
  });

  test("getBuiltInToolsByCategory returns empty arrays for every removed category", () => {
    expect(getBuiltInToolsByCategory("task-tracking")).toHaveLength(0);
    expect(getBuiltInToolsByCategory("scratchpad")).toHaveLength(0);
    expect(getBuiltInToolsByCategory("orchestration")).toHaveLength(0);
  });
});
