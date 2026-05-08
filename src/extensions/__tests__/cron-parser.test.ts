/**
 * Coverage for `cron.ts` (Phase 51.5.3).
 */
import { test, expect, describe } from "bun:test";
import { validateCron, parseCron } from "../cron";

describe("validateCron", () => {
  test("accepts valid 5-field expressions", () => {
    expect(validateCron("0 * * * *").ok).toBe(true);
    expect(validateCron("*/5 * * * *").ok).toBe(true);
    expect(validateCron("0 9-17 * * 1-5").ok).toBe(true);
  });

  test("rejects sub-5-min interval", () => {
    expect(validateCron("* * * * *")).toEqual({ ok: false, reason: "min-5-min-interval-required" });
    expect(validateCron("*/1 * * * *")).toEqual({ ok: false, reason: "min-5-min-interval-required" });
    expect(validateCron("*/4 * * * *")).toEqual({ ok: false, reason: "min-5-min-interval-required" });
  });

  test("rejects @-shorthand expressions", () => {
    const r = validateCron("@hourly");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("shorthand");
  });

  test("rejects expressions with wrong field count", () => {
    expect(validateCron("0 0").ok).toBe(false);
    expect(validateCron("0 0 0 0 0 0").ok).toBe(false);
  });

  test("rejects empty / non-string", () => {
    expect(validateCron("").ok).toBe(false);
    expect(validateCron("   ").ok).toBe(false);
  });

  test("rejects malformed range syntax via Bun.cron.parse", () => {
    // The literal regex permits 5 fields, so this must reach Bun.cron.parse.
    const r = validateCron("99 * * * *");
    expect(r.ok).toBe(false);
  });
});

describe("parseCron.next", () => {
  test("returns a Date strictly after `from`", () => {
    const cron = parseCron("0 * * * *"); // every hour
    const from = new Date("2026-05-08T10:30:00Z");
    const n = cron.next(from);
    expect(n.getTime()).toBeGreaterThan(from.getTime());
  });

  test("throws for invalid expression", () => {
    expect(() => parseCron("* * * * *")).toThrow();
  });
});
