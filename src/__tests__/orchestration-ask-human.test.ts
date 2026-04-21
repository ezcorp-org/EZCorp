// Unit tests for the orchestration bundled extension's `ask_human`
// handler + `orchestrator:human_response` subscription — Phase 5
// commit 2. Ports the 8 cases from src/__tests__/ask-human.test.ts
// against the extension handler surface (not the built-in factory)
// plus 2 new cases: conversationId mismatch (security) + missing
// invocationMetadata.
//
// Pattern mirrors src/__tests__/orchestration-extension.test.ts —
// imports the extension's handler + subscription callback directly
// and injects fake SDK bindings via `_setEmitHumanInputForTests` +
// `_setHumanInputTimeoutForTests`. The extension's `signal` arrives
// through the ctx (not yet part of the SDK's stable surface), which
// tests supply via an AbortController.

import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import {
  tools,
  _setEmitHumanInputForTests,
  _setHumanInputTimeoutForTests,
  _resetBindingsForTests,
  _internals,
} from "../../docs/extensions/examples/orchestration/index";

// ── Test fakes ──────────────────────────────────────────────────────

interface EmitCall {
  runId: string;
  conversationId: string;
  question: string;
  requestId: string;
}

function makeEmitRecorder(
  opts: { throwMessage?: string } = {},
): { fn: (payload: EmitCall) => Promise<void>; calls: EmitCall[] } {
  const calls: EmitCall[] = [];
  const fn = async (payload: EmitCall): Promise<void> => {
    calls.push(payload);
    if (opts.throwMessage) throw new Error(opts.throwMessage);
  };
  return { fn, calls };
}

function expectText(out: unknown): string {
  const o = out as { content?: Array<{ type: string; text: string }> };
  const first = o.content?.[0];
  if (!first || first.type !== "text") throw new Error("tool-result has no text content");
  return first.text;
}

function expectIsError(out: unknown): boolean {
  const o = out as { isError?: boolean };
  return o.isError === true;
}

function makeCtx(
  overrides: Partial<{
    runId: string | undefined;
    conversationId: string | undefined;
    signal: AbortSignal;
  }> = {},
): { invocationMetadata: Record<string, unknown>; signal?: AbortSignal } {
  const runId = "runId" in overrides ? overrides.runId : "run-test";
  const conversationId =
    "conversationId" in overrides ? overrides.conversationId : "conv-test";
  const metadata: Record<string, unknown> = {};
  if (runId !== undefined) metadata.runId = runId;
  if (conversationId !== undefined) metadata.conversationId = conversationId;
  const ctx: { invocationMetadata: Record<string, unknown>; signal?: AbortSignal } = {
    invocationMetadata: metadata,
  };
  if (overrides.signal) ctx.signal = overrides.signal;
  return ctx;
}

beforeEach(() => {
  _setHumanInputTimeoutForTests(5 * 60_000); // default 5 minutes
  _internals.pendingHumanInputs.clear();
});

afterEach(() => {
  _resetBindingsForTests();
  _setHumanInputTimeoutForTests(5 * 60_000);
  _internals.pendingHumanInputs.clear();
});

// ── 1. Happy path ───────────────────────────────────────────────────

describe("orchestration ask_human — happy path", () => {
  test("emit → subscription handler resolves gate → tool returns success text", async () => {
    const { fn, calls } = makeEmitRecorder();
    _setEmitHumanInputForTests(fn);

    const invocation = tools.ask_human!({ question: "What color?" }, makeCtx());

    // Wait for the pending entry to be registered — the handler awaits
    // the emit before opening the gate.
    let requestId: string | undefined;
    for (let i = 0; i < 20 && !requestId; i++) {
      await new Promise((r) => setTimeout(r, 1));
      requestId = Array.from(_internals.pendingHumanInputs.keys())[0];
    }
    expect(requestId).toBeDefined();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.runId).toBe("run-test");
    expect(calls[0]!.conversationId).toBe("conv-test");
    expect(calls[0]!.question).toBe("What color?");
    expect(calls[0]!.requestId).toBe(requestId!);

    // Drive the subscription handler directly.
    await _internals.handleHumanResponse({
      requestId: requestId!,
      response: "blue",
      conversationId: "conv-test",
    });

    const out = await invocation;
    expect(expectText(out)).toBe("blue");
    expect(expectIsError(out)).toBe(false);
    expect(_internals.pendingHumanInputs.size).toBe(0);
  });
});

// ── 2. Abort during wait ────────────────────────────────────────────

describe("orchestration ask_human — abort during wait", () => {
  test("ctx.signal.abort() → isError + 'Aborted while waiting for human input'", async () => {
    const { fn } = makeEmitRecorder();
    _setEmitHumanInputForTests(fn);
    const controller = new AbortController();

    const invocation = tools.ask_human!(
      { question: "Ready?" },
      makeCtx({ signal: controller.signal }),
    );

    // Wait for gate to open.
    for (let i = 0; i < 20 && _internals.pendingHumanInputs.size === 0; i++) {
      await new Promise((r) => setTimeout(r, 1));
    }
    expect(_internals.pendingHumanInputs.size).toBe(1);

    controller.abort();
    const out = await invocation;
    expect(expectIsError(out)).toBe(true);
    expect(expectText(out)).toContain("Aborted while waiting for human input");
    // Gate cleaned up.
    expect(_internals.pendingHumanInputs.size).toBe(0);
  });
});

// ── 3. Timeout at 5 minutes ─────────────────────────────────────────

describe("orchestration ask_human — timeout", () => {
  test("timeout expires → isError + 'Timed out waiting for human input'; pending map cleaned", async () => {
    _setHumanInputTimeoutForTests(20); // 20ms for the test
    const { fn } = makeEmitRecorder();
    _setEmitHumanInputForTests(fn);

    const out = await tools.ask_human!({ question: "Never answered?" }, makeCtx());
    expect(expectIsError(out)).toBe(true);
    expect(expectText(out)).toContain("Timed out waiting for human input");
    expect(_internals.pendingHumanInputs.size).toBe(0);
  });
});

// ── 4. Unknown requestId in subscription handler ────────────────────

describe("orchestration ask_human — unknown requestId subscription", () => {
  test("subscription event with unknown requestId is a no-op (no throw, no mutation)", async () => {
    const { fn } = makeEmitRecorder();
    _setEmitHumanInputForTests(fn);

    // Seed a real pending gate to ensure the map is non-empty.
    const invocation = tools.ask_human!({ question: "real?" }, makeCtx());
    let realId: string | undefined;
    for (let i = 0; i < 20 && !realId; i++) {
      await new Promise((r) => setTimeout(r, 1));
      realId = Array.from(_internals.pendingHumanInputs.keys())[0];
    }
    expect(realId).toBeDefined();
    const sizeBefore = _internals.pendingHumanInputs.size;

    // Deliver a stranger's requestId — must NOT throw, must NOT mutate.
    await _internals.handleHumanResponse({
      requestId: "unknown-request-id",
      response: "nope",
      conversationId: "conv-test",
    });
    expect(_internals.pendingHumanInputs.size).toBe(sizeBefore);

    // Clean up.
    await _internals.handleHumanResponse({
      requestId: realId!,
      response: "done",
      conversationId: "conv-test",
    });
    await invocation;
  });
});

// ── 5. conversationId mismatch (SECURITY — new) ─────────────────────

describe("orchestration ask_human — conversationId mismatch drops event", () => {
  test("event with different conversationId than the gate's is silently dropped; gate stays open", async () => {
    const { fn } = makeEmitRecorder();
    _setEmitHumanInputForTests(fn);

    // Open a gate for conv-test.
    const invocation = tools.ask_human!(
      { question: "Whose conv?" },
      makeCtx({ conversationId: "conv-test" }),
    );
    let requestId: string | undefined;
    for (let i = 0; i < 20 && !requestId; i++) {
      await new Promise((r) => setTimeout(r, 1));
      requestId = Array.from(_internals.pendingHumanInputs.keys())[0];
    }
    expect(requestId).toBeDefined();
    const sizeBefore = _internals.pendingHumanInputs.size;

    // Deliver a response with a mismatched conversationId — must NOT
    // resolve the gate, must NOT remove the entry.
    await _internals.handleHumanResponse({
      requestId: requestId!,
      response: "attacker-controlled",
      conversationId: "conv-attacker",
    });
    expect(_internals.pendingHumanInputs.size).toBe(sizeBefore);

    // Race against a microtask sentinel — invocation promise did NOT
    // resolve.
    const sentinel = Symbol("not-resolved");
    const raceResult = await Promise.race([
      Promise.resolve(invocation).then(() => "resolved" as const),
      Promise.resolve(sentinel),
    ]);
    expect(raceResult).toBe(sentinel);

    // Clean up with a real matching event.
    await _internals.handleHumanResponse({
      requestId: requestId!,
      response: "legit",
      conversationId: "conv-test",
    });
    const out = await invocation;
    expect(expectText(out)).toBe("legit");
  });
});

// ── 6. Cleanup on success ───────────────────────────────────────────

describe("orchestration ask_human — cleanup on success", () => {
  test("success path: timeout cleared + gate entry removed", async () => {
    const { fn } = makeEmitRecorder();
    _setEmitHumanInputForTests(fn);

    const invocation = tools.ask_human!({ question: "q?" }, makeCtx());
    let requestId: string | undefined;
    for (let i = 0; i < 20 && !requestId; i++) {
      await new Promise((r) => setTimeout(r, 1));
      requestId = Array.from(_internals.pendingHumanInputs.keys())[0];
    }
    expect(requestId).toBeDefined();
    const pendingBefore = _internals.pendingHumanInputs.get(requestId!);
    expect(pendingBefore).toBeDefined();

    await _internals.handleHumanResponse({
      requestId: requestId!,
      response: "yes",
      conversationId: "conv-test",
    });

    const out = await invocation;
    expect(expectIsError(out)).toBe(false);
    expect(_internals.pendingHumanInputs.size).toBe(0);
    // The pending entry was deleted (i.e. is no longer in the map).
    expect(_internals.pendingHumanInputs.has(requestId!)).toBe(false);
  });
});

// ── 7. Cleanup on abort ─────────────────────────────────────────────

describe("orchestration ask_human — cleanup on abort", () => {
  test("abort path: timeout cleared + abort listener detached exactly once", async () => {
    const { fn } = makeEmitRecorder();
    _setEmitHumanInputForTests(fn);
    const controller = new AbortController();

    // Spy on addEventListener / removeEventListener counts by wrapping
    // the native signal. AbortSignal methods are not easily mockable
    // without an intermediary; use an EventTarget-backed wrapper.
    let addCount = 0;
    let removeCount = 0;
    const rawSignal = controller.signal;
    const wrapped: AbortSignal = Object.create(rawSignal, {
      addEventListener: {
        value: (type: string, listener: EventListenerOrEventListenerObject, options?: AddEventListenerOptions | boolean) => {
          addCount++;
          return rawSignal.addEventListener(type, listener, options);
        },
      },
      removeEventListener: {
        value: (type: string, listener: EventListenerOrEventListenerObject, options?: EventListenerOptions | boolean) => {
          removeCount++;
          return rawSignal.removeEventListener(type, listener, options);
        },
      },
    }) as AbortSignal;

    const invocation = tools.ask_human!(
      { question: "q?" },
      makeCtx({ signal: wrapped }),
    );
    for (let i = 0; i < 20 && _internals.pendingHumanInputs.size === 0; i++) {
      await new Promise((r) => setTimeout(r, 1));
    }
    expect(_internals.pendingHumanInputs.size).toBe(1);
    expect(addCount).toBe(1);

    controller.abort();
    await invocation;

    // Listener was detached exactly once (in the finally block) — even
    // though the abort already fired, the finally still calls
    // removeEventListener, which is a no-op but must happen.
    expect(removeCount).toBe(1);
    expect(_internals.pendingHumanInputs.size).toBe(0);
  });
});

// ── 8. Cleanup on timeout ───────────────────────────────────────────

describe("orchestration ask_human — cleanup on timeout", () => {
  test("timeout path: abort listener removed", async () => {
    _setHumanInputTimeoutForTests(20);
    const { fn } = makeEmitRecorder();
    _setEmitHumanInputForTests(fn);
    const controller = new AbortController();

    let removeCount = 0;
    const rawSignal = controller.signal;
    const wrapped: AbortSignal = Object.create(rawSignal, {
      addEventListener: {
        value: (type: string, listener: EventListenerOrEventListenerObject, options?: AddEventListenerOptions | boolean) => {
          return rawSignal.addEventListener(type, listener, options);
        },
      },
      removeEventListener: {
        value: (type: string, listener: EventListenerOrEventListenerObject, options?: EventListenerOptions | boolean) => {
          removeCount++;
          return rawSignal.removeEventListener(type, listener, options);
        },
      },
    }) as AbortSignal;

    const out = await tools.ask_human!(
      { question: "q?" },
      makeCtx({ signal: wrapped }),
    );
    expect(expectIsError(out)).toBe(true);
    expect(expectText(out)).toContain("Timed out");
    expect(removeCount).toBe(1);
    expect(_internals.pendingHumanInputs.size).toBe(0);
  });
});

// ── 9. Concurrent ask_human calls ──────────────────────────────────

describe("orchestration ask_human — concurrent calls", () => {
  test("two in-flight invocations each resolve from their own event (no cross-talk)", async () => {
    const { fn, calls } = makeEmitRecorder();
    _setEmitHumanInputForTests(fn);

    const p1 = tools.ask_human!({ question: "Q1?" }, makeCtx({ conversationId: "conv-a" }));
    const p2 = tools.ask_human!({ question: "Q2?" }, makeCtx({ conversationId: "conv-b" }));

    let ids: string[] = [];
    for (let i = 0; i < 40 && ids.length < 2; i++) {
      await new Promise((r) => setTimeout(r, 1));
      ids = Array.from(_internals.pendingHumanInputs.keys());
    }
    expect(ids).toHaveLength(2);
    expect(calls).toHaveLength(2);

    // Find which request belongs to which conversation.
    const entries = ids.map((id) => ({
      id,
      pending: _internals.pendingHumanInputs.get(id)!,
    }));
    const a = entries.find((e) => e.pending.conversationId === "conv-a");
    const b = entries.find((e) => e.pending.conversationId === "conv-b");
    expect(a).toBeDefined();
    expect(b).toBeDefined();

    await _internals.handleHumanResponse({
      requestId: a!.id,
      response: "answer-a",
      conversationId: "conv-a",
    });
    await _internals.handleHumanResponse({
      requestId: b!.id,
      response: "answer-b",
      conversationId: "conv-b",
    });

    const out1 = await p1;
    const out2 = await p2;
    expect(expectText(out1)).toBe("answer-a");
    expect(expectText(out2)).toBe("answer-b");
    expect(_internals.pendingHumanInputs.size).toBe(0);
  });
});

// ── 10. Missing runId / conversationId in invocationMetadata ───────

describe("orchestration ask_human — missing invocationMetadata", () => {
  test("missing runId → error, no emit", async () => {
    const { fn, calls } = makeEmitRecorder();
    _setEmitHumanInputForTests(fn);

    const out = await tools.ask_human!(
      { question: "q?" },
      makeCtx({ runId: undefined }),
    );
    expect(expectIsError(out)).toBe(true);
    expect(expectText(out)).toContain("missing run context");
    expect(calls).toHaveLength(0);
    expect(_internals.pendingHumanInputs.size).toBe(0);
  });

  test("missing conversationId → error, no emit", async () => {
    const { fn, calls } = makeEmitRecorder();
    _setEmitHumanInputForTests(fn);

    const out = await tools.ask_human!(
      { question: "q?" },
      makeCtx({ conversationId: undefined }),
    );
    expect(expectIsError(out)).toBe(true);
    expect(expectText(out)).toContain("missing run context");
    expect(calls).toHaveLength(0);
    expect(_internals.pendingHumanInputs.size).toBe(0);
  });

  test("emit throws → error surfaced to tool, no lingering pending entry", async () => {
    const { fn } = makeEmitRecorder({ throwMessage: "emit boom" });
    _setEmitHumanInputForTests(fn);

    const out = await tools.ask_human!({ question: "q?" }, makeCtx());
    expect(expectIsError(out)).toBe(true);
    expect(expectText(out)).toContain("emit boom");
    expect(_internals.pendingHumanInputs.size).toBe(0);
  });
});
