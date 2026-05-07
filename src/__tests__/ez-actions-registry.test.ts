/**
 * Tests for the EZ Actions registry shape (`src/runtime/ez-actions/registry.ts`).
 *
 * Coverage targets (per plan §2.4):
 *   - listEzActions returns only public fields (no `handler`)
 *   - getEzAction("distill") returns the action
 *   - getEzAction("nope") returns null
 *
 * Pure-data tests; no DB / mock-module needed. Runs under the
 * project's main `bun test` runner.
 */
import { test, expect, describe } from "bun:test";
import { listEzActions, getEzAction } from "../runtime/ez-actions/registry";

describe("EZ actions registry — listEzActions", () => {
  test("returns at least the v1 `distill` action", () => {
    const actions = listEzActions();
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.some((a) => a.name === "distill")).toBe(true);
  });

  test("entries surface name + description ONLY — no handler leak", () => {
    const actions = listEzActions();
    for (const action of actions) {
      expect(typeof action.name).toBe("string");
      expect(typeof action.description).toBe("string");
      // The internal `handler` function MUST NOT appear on the list
      // shape — `listEzActions` is the wire format the search route
      // returns to the client. We assert on the keys explicitly so a
      // future refactor that widens the type is caught here.
      expect((action as Record<string, unknown>).handler).toBeUndefined();
      expect(Object.keys(action).sort()).toEqual(["description", "name"]);
    }
  });

  test("descriptions are non-empty (popover would render '—' otherwise)", () => {
    const actions = listEzActions();
    for (const action of actions) {
      expect(action.description.length).toBeGreaterThan(0);
    }
  });

  test("names are lowercase + slug-shaped (matches token grammar)", () => {
    const actions = listEzActions();
    for (const action of actions) {
      // mention-logic's MENTION_REGEX accepts `[^\\]]+` for the name,
      // but the popover/inserted token reads cleaner with the same
      // lowercase-kebab discipline used by other kinds.
      expect(action.name).toMatch(/^[a-z][a-z0-9-]*$/);
    }
  });
});

describe("EZ actions registry — getEzAction", () => {
  test("returns the distill action for name='distill'", () => {
    const action = getEzAction("distill");
    expect(action).not.toBeNull();
    expect(action!.name).toBe("distill");
    expect(typeof action!.handler).toBe("function");
  });

  test("returns null for unknown action name", () => {
    expect(getEzAction("nope")).toBeNull();
    expect(getEzAction("")).toBeNull();
    expect(getEzAction("Distill")).toBeNull(); // case-sensitive
  });
});
