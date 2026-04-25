// Unit tests for the ask-user bundled extension's `ask_user_question`
// handler + `ask-user:answer` subscription. Mirrors the structure of
// src/__tests__/orchestration-ask-human.test.ts but reflects the
// design difference: no emit step (the host's `tool:start` event
// carries the question via `cardType: "ask-user-question"`), gate
// keyed on `toolCallId` instead of a minted `requestId`.
//
// Coverage target: 100% on docs/extensions/examples/ask-user/index.ts
// per scripts/coverage-thresholds.json. Every branch must be exercised.

import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import {
  tools,
  _setRegisterEventHandlerForTests,
  _setAskUserTimeoutForTests,
  _resetBindingsForTests,
  _internals,
} from "./index";

// ── Test fakes ──────────────────────────────────────────────────────

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
    toolCallId: string | undefined;
    conversationId: string | undefined;
    signal: AbortSignal;
  }> = {},
): { invocationMetadata: Record<string, unknown>; signal?: AbortSignal } {
  const toolCallId =
    "toolCallId" in overrides ? overrides.toolCallId : "tc-test-1";
  const conversationId =
    "conversationId" in overrides ? overrides.conversationId : "conv-test";
  const metadata: Record<string, unknown> = {};
  if (toolCallId !== undefined) metadata.toolCallId = toolCallId;
  if (conversationId !== undefined) metadata.conversationId = conversationId;
  const ctx: { invocationMetadata: Record<string, unknown>; signal?: AbortSignal } = {
    invocationMetadata: metadata,
  };
  if (overrides.signal) ctx.signal = overrides.signal;
  return ctx;
}

beforeEach(() => {
  // Default to the production timeout so tests don't accidentally rely
  // on a shrunk value bleeding across cases.
  _setAskUserTimeoutForTests(5 * 60_000);
  _internals.pendingAskUser.clear();
  // Replace the SDK's registerEventHandler with a no-op so importing
  // the production wiring (gated on import.meta.main) wouldn't open
  // stdin. Tests drive _internals.handleAnswer directly.
  _setRegisterEventHandlerForTests((() => {}) as never);
});

afterEach(() => {
  _resetBindingsForTests();
  _setAskUserTimeoutForTests(5 * 60_000);
  _internals.pendingAskUser.clear();
});

// ── 1. Happy path with options ─────────────────────────────────────

describe("ask_user_question — happy path with options", () => {
  test("subscription resolves gate keyed on toolCallId → tool returns answer text", async () => {
    const invocation = tools.ask_user_question!(
      { question: "Pick one", options: ["A", "B", "C"] },
      makeCtx({ toolCallId: "tc-happy-1" }),
    );

    // Wait for the pending entry to be registered.
    for (let i = 0; i < 20 && !_internals.pendingAskUser.has("tc-happy-1"); i++) {
      await new Promise((r) => setTimeout(r, 1));
    }
    expect(_internals.pendingAskUser.has("tc-happy-1")).toBe(true);

    await _internals.handleAnswer({
      toolCallId: "tc-happy-1",
      conversationId: "conv-test",
      answer: "B",
    });

    const out = await invocation;
    expect(expectText(out)).toBe("B");
    expect(expectIsError(out)).toBe(false);
    expect(_internals.pendingAskUser.size).toBe(0);
  });
});

// ── 2. Happy path free-text ────────────────────────────────────────

describe("ask_user_question — happy path free-text (no options)", () => {
  test("question without options accepts arbitrary answer text", async () => {
    const invocation = tools.ask_user_question!(
      { question: "What's your name?" },
      makeCtx({ toolCallId: "tc-text-1" }),
    );
    for (let i = 0; i < 20 && !_internals.pendingAskUser.has("tc-text-1"); i++) {
      await new Promise((r) => setTimeout(r, 1));
    }

    await _internals.handleAnswer({
      toolCallId: "tc-text-1",
      conversationId: "conv-test",
      answer: "  Alice  ",
    });
    const out = await invocation;
    expect(expectText(out)).toBe("  Alice  ");
    expect(expectIsError(out)).toBe(false);
  });
});

// ── 3. Abort during wait ───────────────────────────────────────────

describe("ask_user_question — abort during wait", () => {
  test("ctx.signal.abort() → isError + 'Aborted while waiting for user answer'", async () => {
    const controller = new AbortController();
    const invocation = tools.ask_user_question!(
      { question: "Ready?" },
      makeCtx({ toolCallId: "tc-abort-1", signal: controller.signal }),
    );
    for (let i = 0; i < 20 && _internals.pendingAskUser.size === 0; i++) {
      await new Promise((r) => setTimeout(r, 1));
    }
    expect(_internals.pendingAskUser.size).toBe(1);

    controller.abort();
    const out = await invocation;
    expect(expectIsError(out)).toBe(true);
    expect(expectText(out)).toContain("Aborted while waiting for user answer");
    expect(_internals.pendingAskUser.size).toBe(0);
  });
});

// ── 4. Timeout ─────────────────────────────────────────────────────

describe("ask_user_question — timeout", () => {
  test("timeout expires → isError + 'Timed out waiting for user answer'", async () => {
    _setAskUserTimeoutForTests(20);
    const out = await tools.ask_user_question!(
      { question: "Never answered?" },
      makeCtx({ toolCallId: "tc-timeout-1" }),
    );
    expect(expectIsError(out)).toBe(true);
    expect(expectText(out)).toContain("Timed out waiting for user answer");
    expect(_internals.pendingAskUser.size).toBe(0);
  });
});

// ── 5. Unknown toolCallId in subscription ──────────────────────────

describe("ask_user_question — unknown toolCallId is no-op", () => {
  test("subscription event with unknown toolCallId does not throw or mutate", async () => {
    const invocation = tools.ask_user_question!(
      { question: "real?" },
      makeCtx({ toolCallId: "tc-real-1" }),
    );
    for (let i = 0; i < 20 && !_internals.pendingAskUser.has("tc-real-1"); i++) {
      await new Promise((r) => setTimeout(r, 1));
    }
    const sizeBefore = _internals.pendingAskUser.size;

    await _internals.handleAnswer({
      toolCallId: "tc-unknown",
      conversationId: "conv-test",
      answer: "ghost",
    });
    expect(_internals.pendingAskUser.size).toBe(sizeBefore);

    // Clean up.
    await _internals.handleAnswer({
      toolCallId: "tc-real-1",
      conversationId: "conv-test",
      answer: "done",
    });
    const out = await invocation;
    expect(expectText(out)).toBe("done");
  });
});

// ── 6. conversationId mismatch (security) ──────────────────────────

describe("ask_user_question — conversationId mismatch dropped silently", () => {
  test("event with mismatched conversationId does not resolve the gate", async () => {
    const invocation = tools.ask_user_question!(
      { question: "Who's asking?" },
      makeCtx({ toolCallId: "tc-sec-1", conversationId: "conv-test" }),
    );
    for (let i = 0; i < 20 && !_internals.pendingAskUser.has("tc-sec-1"); i++) {
      await new Promise((r) => setTimeout(r, 1));
    }
    const sizeBefore = _internals.pendingAskUser.size;

    await _internals.handleAnswer({
      toolCallId: "tc-sec-1",
      conversationId: "conv-attacker",
      answer: "tampered",
    });
    expect(_internals.pendingAskUser.size).toBe(sizeBefore);

    // Confirm invocation has not resolved.
    const sentinel = Symbol("not-resolved");
    const raceResult = await Promise.race([
      Promise.resolve(invocation).then(() => "resolved" as const),
      Promise.resolve(sentinel),
    ]);
    expect(raceResult).toBe(sentinel);

    // Clean up with matching event.
    await _internals.handleAnswer({
      toolCallId: "tc-sec-1",
      conversationId: "conv-test",
      answer: "legit",
    });
    const out = await invocation;
    expect(expectText(out)).toBe("legit");
  });
});

// ── 7. Cleanup on success ──────────────────────────────────────────

describe("ask_user_question — cleanup on success", () => {
  test("timeout cleared and entry removed on resolve", async () => {
    const invocation = tools.ask_user_question!(
      { question: "ok?" },
      makeCtx({ toolCallId: "tc-clean-1" }),
    );
    for (let i = 0; i < 20 && !_internals.pendingAskUser.has("tc-clean-1"); i++) {
      await new Promise((r) => setTimeout(r, 1));
    }
    expect(_internals.pendingAskUser.has("tc-clean-1")).toBe(true);

    await _internals.handleAnswer({
      toolCallId: "tc-clean-1",
      conversationId: "conv-test",
      answer: "yes",
    });
    const out = await invocation;
    expect(expectIsError(out)).toBe(false);
    expect(_internals.pendingAskUser.has("tc-clean-1")).toBe(false);
  });
});

// ── 8. Cleanup on abort (listener removed) ────────────────────────

describe("ask_user_question — cleanup on abort removes listener", () => {
  test("removeEventListener is called exactly once after abort fires", async () => {
    const controller = new AbortController();
    let addCount = 0;
    let removeCount = 0;
    const rawSignal = controller.signal;
    const wrapped: AbortSignal = Object.create(rawSignal, {
      addEventListener: {
        value: (
          type: string,
          listener: EventListenerOrEventListenerObject,
          options?: AddEventListenerOptions | boolean,
        ) => {
          addCount++;
          return rawSignal.addEventListener(type, listener, options);
        },
      },
      removeEventListener: {
        value: (
          type: string,
          listener: EventListenerOrEventListenerObject,
          options?: EventListenerOptions | boolean,
        ) => {
          removeCount++;
          return rawSignal.removeEventListener(type, listener, options);
        },
      },
    }) as AbortSignal;

    const invocation = tools.ask_user_question!(
      { question: "q?" },
      makeCtx({ toolCallId: "tc-abort-cleanup", signal: wrapped }),
    );
    for (let i = 0; i < 20 && _internals.pendingAskUser.size === 0; i++) {
      await new Promise((r) => setTimeout(r, 1));
    }
    expect(_internals.pendingAskUser.size).toBe(1);
    expect(addCount).toBe(1);

    controller.abort();
    await invocation;

    expect(removeCount).toBe(1);
    expect(_internals.pendingAskUser.size).toBe(0);
  });
});

// ── 9. Cleanup on timeout (listener removed) ──────────────────────

describe("ask_user_question — cleanup on timeout removes listener", () => {
  test("timeout path also detaches the abort listener via finally", async () => {
    _setAskUserTimeoutForTests(15);
    const controller = new AbortController();
    let removeCount = 0;
    const rawSignal = controller.signal;
    const wrapped: AbortSignal = Object.create(rawSignal, {
      addEventListener: {
        value: (
          type: string,
          listener: EventListenerOrEventListenerObject,
          options?: AddEventListenerOptions | boolean,
        ) => rawSignal.addEventListener(type, listener, options),
      },
      removeEventListener: {
        value: (
          type: string,
          listener: EventListenerOrEventListenerObject,
          options?: EventListenerOptions | boolean,
        ) => {
          removeCount++;
          return rawSignal.removeEventListener(type, listener, options);
        },
      },
    }) as AbortSignal;

    const out = await tools.ask_user_question!(
      { question: "q?" },
      makeCtx({ toolCallId: "tc-tcleanup", signal: wrapped }),
    );
    expect(expectIsError(out)).toBe(true);
    expect(expectText(out)).toContain("Timed out");
    expect(removeCount).toBe(1);
    expect(_internals.pendingAskUser.size).toBe(0);
  });
});

// ── 10. Concurrent calls ──────────────────────────────────────────

describe("ask_user_question — concurrent calls don't cross-talk", () => {
  test("two in-flight invocations each resolve from their own toolCallId", async () => {
    const p1 = tools.ask_user_question!(
      { question: "Q1?" },
      makeCtx({ toolCallId: "tc-c1", conversationId: "conv-a" }),
    );
    const p2 = tools.ask_user_question!(
      { question: "Q2?" },
      makeCtx({ toolCallId: "tc-c2", conversationId: "conv-b" }),
    );

    for (let i = 0; i < 40 && _internals.pendingAskUser.size < 2; i++) {
      await new Promise((r) => setTimeout(r, 1));
    }
    expect(_internals.pendingAskUser.size).toBe(2);

    await _internals.handleAnswer({
      toolCallId: "tc-c1",
      conversationId: "conv-a",
      answer: "answer-a",
    });
    await _internals.handleAnswer({
      toolCallId: "tc-c2",
      conversationId: "conv-b",
      answer: "answer-b",
    });

    expect(expectText(await p1)).toBe("answer-a");
    expect(expectText(await p2)).toBe("answer-b");
    expect(_internals.pendingAskUser.size).toBe(0);
  });
});

// ── 11. Input validation ──────────────────────────────────────────

describe("ask_user_question — input validation", () => {
  test("missing question → error, no gate opened", async () => {
    const out = await tools.ask_user_question!({}, makeCtx());
    expect(expectIsError(out)).toBe(true);
    expect(expectText(out)).toContain("'question' is required");
    expect(_internals.pendingAskUser.size).toBe(0);
  });

  test("empty question → error, no gate opened", async () => {
    const out = await tools.ask_user_question!({ question: "   " }, makeCtx());
    expect(expectIsError(out)).toBe(true);
    expect(expectText(out)).toContain("'question' is required");
    expect(_internals.pendingAskUser.size).toBe(0);
  });

  test("non-string question → error, no gate opened", async () => {
    const out = await tools.ask_user_question!({ question: 42 }, makeCtx());
    expect(expectIsError(out)).toBe(true);
    expect(expectText(out)).toContain("'question' is required");
    expect(_internals.pendingAskUser.size).toBe(0);
  });

  test("non-array options → error", async () => {
    const out = await tools.ask_user_question!(
      { question: "q?", options: "nope" },
      makeCtx(),
    );
    expect(expectIsError(out)).toBe(true);
    expect(expectText(out)).toContain("'options', if provided, must be an array of strings");
    expect(_internals.pendingAskUser.size).toBe(0);
  });

  test("options containing non-string → error", async () => {
    const out = await tools.ask_user_question!(
      { question: "q?", options: ["A", 7, "C"] },
      makeCtx(),
    );
    expect(expectIsError(out)).toBe(true);
    expect(expectText(out)).toContain("'options', if provided, must be an array of strings");
    expect(_internals.pendingAskUser.size).toBe(0);
  });
});

// ── 12. Missing context fields ────────────────────────────────────

describe("ask_user_question — missing invocationMetadata", () => {
  test("missing toolCallId → error", async () => {
    const out = await tools.ask_user_question!(
      { question: "q?" },
      makeCtx({ toolCallId: undefined }),
    );
    expect(expectIsError(out)).toBe(true);
    expect(expectText(out)).toContain("missing tool-call context");
    expect(_internals.pendingAskUser.size).toBe(0);
  });

  test("missing conversationId → error", async () => {
    const out = await tools.ask_user_question!(
      { question: "q?" },
      makeCtx({ conversationId: undefined }),
    );
    expect(expectIsError(out)).toBe(true);
    expect(expectText(out)).toContain("missing tool-call context");
    expect(_internals.pendingAskUser.size).toBe(0);
  });

  test("ctx altogether missing → error (covers `?? {}` fallback)", async () => {
    const out = await tools.ask_user_question!({ question: "q?" });
    expect(expectIsError(out)).toBe(true);
    expect(expectText(out)).toContain("missing tool-call context");
    expect(_internals.pendingAskUser.size).toBe(0);
  });

  test("ctx without invocationMetadata → error", async () => {
    const out = await tools.ask_user_question!({ question: "q?" }, {} as never);
    expect(expectIsError(out)).toBe(true);
    expect(expectText(out)).toContain("missing tool-call context");
    expect(_internals.pendingAskUser.size).toBe(0);
  });
});

// ── 13. No-signal path (covers `signal?.addEventListener` undef branch) ─

describe("ask_user_question — no AbortSignal supplied", () => {
  test("happy path resolves without ctx.signal", async () => {
    const invocation = tools.ask_user_question!(
      { question: "no signal?" },
      // makeCtx omits signal by default.
      makeCtx({ toolCallId: "tc-nosig" }),
    );
    for (let i = 0; i < 20 && !_internals.pendingAskUser.has("tc-nosig"); i++) {
      await new Promise((r) => setTimeout(r, 1));
    }
    await _internals.handleAnswer({
      toolCallId: "tc-nosig",
      conversationId: "conv-test",
      answer: "fine",
    });
    expect(expectText(await invocation)).toBe("fine");
  });
});
