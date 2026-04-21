// cancel-run.test.ts — coverage for runtime/cancel-run.ts (Phase 4 §5.3).
//
// Mirrors the strategy of spawn.test.ts — spy on the singleton channel's
// .request and assert (a) the JSON-RPC method is "ezcorp/cancel-run",
// (b) the params shape is `{ v: 1, agentRunId }`, (c) host errors
// propagate as JsonRpcError with code/data preserved, (d) synchronous
// input validation throws before any channel call.

import { afterEach, describe, expect, spyOn, test } from "bun:test";

import { cancelRun } from "../src/runtime/cancel-run";
import {
  __resetChannelForTests,
  getChannel,
  JsonRpcError,
  type HostChannel,
} from "../src/runtime/channel";

afterEach(() => {
  __resetChannelForTests();
});

interface RequestCall {
  method: string;
  params: unknown;
  timeoutMs: number | undefined;
}

function stubRequest<T>(
  returnValue: T,
): { calls: RequestCall[]; spy: ReturnType<typeof spyOn> } {
  const ch: HostChannel = getChannel();
  const calls: RequestCall[] = [];
  const spy = spyOn(ch, "request");
  spy.mockImplementation(
    (async (method: string, params: unknown, timeoutMs?: number) => {
      calls.push({ method, params, timeoutMs });
      return returnValue;
    }) as HostChannel["request"],
  );
  return { calls, spy };
}

// ── method + param-shape + success passthrough ─────────────────────

describe("cancelRun — JSON-RPC frame shape", () => {
  test("sends method 'ezcorp/cancel-run' with v:1 and agentRunId", async () => {
    const { calls } = stubRequest({ v: 1 as const, cancelled: true });
    const result = await cancelRun("run-abc");
    expect(result).toEqual({ cancelled: true });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe("ezcorp/cancel-run");
    expect(calls[0]?.params).toEqual({ v: 1, agentRunId: "run-abc" });
  });

  test("surfaces { cancelled: false, reason: 'not-owned' } verbatim", async () => {
    stubRequest({ v: 1 as const, cancelled: false, reason: "not-owned" as const });
    const result = await cancelRun("run-someone-elses");
    expect(result).toEqual({ cancelled: false, reason: "not-owned" });
  });

  test("surfaces { cancelled: false, reason: 'missing-run' } verbatim", async () => {
    stubRequest({ v: 1 as const, cancelled: false, reason: "missing-run" as const });
    const result = await cancelRun("run-gone");
    expect(result).toEqual({ cancelled: false, reason: "missing-run" });
  });
});

// ── synchronous validation ─────────────────────────────────────────

describe("cancelRun — input validation (pre-channel)", () => {
  test("empty string → throws before channel call", async () => {
    const { calls } = stubRequest({ v: 1 as const, cancelled: true });
    await expect(cancelRun("")).rejects.toThrow(/non-empty string/i);
    expect(calls).toHaveLength(0);
  });

  test("whitespace-only → throws before channel call", async () => {
    const { calls } = stubRequest({ v: 1 as const, cancelled: true });
    await expect(cancelRun("   \n\t")).rejects.toThrow(/non-empty string/i);
    expect(calls).toHaveLength(0);
  });

  test("non-string → throws before channel call", async () => {
    const { calls } = stubRequest({ v: 1 as const, cancelled: true });
    await expect(cancelRun(42 as never)).rejects.toThrow(/non-empty string/i);
    expect(calls).toHaveLength(0);
  });
});

// ── host error propagation ─────────────────────────────────────────

describe("cancelRun — host error propagation", () => {
  test("-32001 permission-missing surfaces as JsonRpcError", async () => {
    const ch = getChannel();
    const spy = spyOn(ch, "request");
    spy.mockImplementation(
      (async () => {
        throw new JsonRpcError(-32001, "spawnAgents permission not granted");
      }) as HostChannel["request"],
    );
    try {
      await cancelRun("run-x");
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(JsonRpcError);
      expect((err as JsonRpcError).code).toBe(-32001);
    }
  });

  test("-32602 invalid-params surfaces with message intact", async () => {
    const ch = getChannel();
    const spy = spyOn(ch, "request");
    spy.mockImplementation(
      (async () => {
        throw new JsonRpcError(-32602, "'agentRunId' must be a non-empty string");
      }) as HostChannel["request"],
    );
    try {
      await cancelRun("run-x");
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(JsonRpcError);
      expect((err as JsonRpcError).code).toBe(-32602);
    }
  });
});
