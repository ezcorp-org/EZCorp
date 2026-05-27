// ── start() — production wiring (channel-free) ──────────────────
//
// `start()` (index.ts) is the dispatcher entrypoint extracted out of the
// `import.meta.main` guard precisely so it can be exercised WITHOUT
// opening stdin. It binds the 9 production seams (queue + voice +
// cursor + sequence + pacing + notes stores, the LLM, draft config,
// pacing config), registers the tool dispatcher, wires the `*/15` cron
// to `runScheduledScan`, and starts the host channel.
//
// We `mock.module("@ezcorp/sdk/runtime", …)` BEFORE importing `start`
// so `getChannel`/`Storage`/`Llm`/`Schedule`/`createToolDispatcher` are
// inert spies — no stdin, no child process, no real channel. We keep
// every OTHER runtime export real (the lib modules import `toolError`,
// `toolResult`, `Storage`, etc. transitively) so only the wiring
// surface is stubbed.

import { test, expect, describe, mock } from "bun:test";
import * as realRuntime from "@ezcorp/sdk/runtime";

// ── Spies that record what start() binds ────────────────────────

// Each `new Storage(scope)` records its scope so we can assert the
// global×3 / user×3 split the wiring promises. The instance is a working
// in-memory store (get/set/delete) so the cron handler the test fires can
// run the real scans cleanly — no channel, no swallowed-error log noise.
const storageScopes: string[] = [];
class FakeStorage {
  scope: string;
  private map = new Map<string, unknown>();
  constructor(scope: string) {
    this.scope = scope;
    storageScopes.push(scope);
  }
  async get<T>(key: string): Promise<{ value: T | null; exists: boolean }> {
    return this.map.has(key)
      ? { value: this.map.get(key) as T, exists: true }
      : { value: null, exists: false };
  }
  async set<T>(key: string, value: T): Promise<{ ok: true; sizeBytes: number }> {
    this.map.set(key, value);
    return { ok: true, sizeBytes: 0 };
  }
  async delete(key: string): Promise<{ deleted: boolean }> {
    const had = this.map.has(key);
    this.map.delete(key);
    return { deleted: had };
  }
}

let llmConstructed = 0;
class FakeLlm {
  constructor() {
    llmConstructed++;
  }
}

// Schedule records every `on(pattern, handler)` registration.
const scheduleOns: Array<{ pattern: string; handler: () => unknown }> = [];
class FakeSchedule {
  on(pattern: string, handler: () => unknown): void {
    scheduleOns.push({ pattern, handler });
  }
}

let channelStarted = 0;
const fakeChannel = {
  start() {
    channelStarted++;
  },
};
const getChannelSpy = mock(() => fakeChannel);

let dispatcherToolsArg: Record<string, unknown> | null = null;
const createToolDispatcherSpy = mock((tools: Record<string, unknown>) => {
  dispatcherToolsArg = tools;
  return { tools };
});

// Mock BEFORE the dynamic import below resolves `../index`.
mock.module("@ezcorp/sdk/runtime", () => ({
  ...realRuntime,
  getChannel: getChannelSpy,
  Storage: FakeStorage,
  Llm: FakeLlm,
  Schedule: FakeSchedule,
  createToolDispatcher: createToolDispatcherSpy,
}));

describe("start() — production wiring", () => {
  test("binds all 9 seams, registers the dispatcher + cron, starts the channel", async () => {
    const { start, tools, runScheduledScan } = await import("../index");

    start();

    // ── Channel: obtained once, started once (last). ──────────────
    expect(getChannelSpy).toHaveBeenCalledTimes(1);
    expect(channelStarted).toBe(1);

    // ── Stores: 3 ownerless ("global") + 3 user-scoped, matching the
    //    real scopes (queue/cursor/pacing = global; voice/sequence/
    //    notes = user). ──────────────────────────────────────────
    const globals = storageScopes.filter((s) => s === "global");
    const users = storageScopes.filter((s) => s === "user");
    expect(globals).toHaveLength(3);
    expect(users).toHaveLength(3);
    // No other scope was ever constructed.
    expect(storageScopes.every((s) => s === "global" || s === "user")).toBe(true);

    // ── LLM bound exactly once. ───────────────────────────────────
    expect(llmConstructed).toBe(1);

    // ── Tool dispatcher wired with the exported tools map. ────────
    expect(createToolDispatcherSpy).toHaveBeenCalledTimes(1);
    expect(dispatcherToolsArg).toBe(tools);

    // ── Cron: exactly the `*/15 * * * *` handler is registered. ──
    expect(scheduleOns).toHaveLength(1);
    expect(scheduleOns[0]?.pattern).toBe("*/15 * * * *");
    expect(typeof scheduleOns[0]?.handler).toBe("function");

    // The registered handler delegates to runScheduledScan. The FakeStorage
    // seams are working in-memory stores and the cron passes no creds, so
    // each scan soft-fails to MISSING_CREDENTIALS (a tool error, not a
    // throw) — the handler resolves cleanly with no swallowed-error noise.
    expect(typeof runScheduledScan).toBe("function");
    expect(await scheduleOns[0]!.handler()).toBeUndefined();
  });
});
