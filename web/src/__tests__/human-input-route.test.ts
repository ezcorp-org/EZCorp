/**
 * POST /api/orchestrator/human-input
 *
 * Phase 5 commit 1 — the endpoint now reverse-maps `requestId` →
 * `conversationId` through the still-live built-in ask-human tool's
 * pending-gate accessor, then emits `orchestrator:human_response` with
 * the conversation id so the SSE conversation filter can gate delivery.
 *
 * Assertions:
 *   (1) POST with a known (pending) `requestId` emits the new event
 *       with the correct `conversationId` payload field.
 *   (2) POST with an unknown `requestId` returns `{ ok: true }` but
 *       does NOT emit (timeouts/aborts — late POST after the gate
 *       already resolved; UI already collapsed the optimistic card).
 *
 * The test is a lightweight handler-level test that stubs ask-human's
 * pending-map accessor + getBus() — mirrors the mock pattern in
 * `tasks-assignment-api.test.ts`.
 */
import { test, expect, describe, beforeEach, mock } from "bun:test";

// ── Mock scope middleware (pass-through) ────────────────────────────

let mockScopeResponse: Response | null = null;
mock.module("$lib/server/security/api-keys", () => ({
  requireScope: () => mockScopeResponse,
}));

// ── Mock bus via $lib/server/context ────────────────────────────────

const mockBusEmit = mock((..._args: any[]) => {});
const mockBus = { emit: mockBusEmit };
mock.module("$lib/server/context", () => ({
  getBus: () => mockBus,
}));

// ── Mock ask-human host module ──────────────────────────────────────
//
// The route `await import`s this module at call time (so mocks must
// be installed before the dynamic import resolves — Bun's mock.module
// is hoisted into the module cache so the dynamic import lands on the
// mocked module the first time it is looked up).

const mockResolveHumanInput = mock((_requestId: string, _response: string) => {});
let pendingConvIdByRequestId: Record<string, string | undefined> = {};
const mockGetPendingHumanConversationId = mock(
  (requestId: string) => pendingConvIdByRequestId[requestId],
);

mock.module("$server/runtime/tools/ask-human", () => ({
  resolveHumanInput: mockResolveHumanInput,
  getPendingHumanConversationId: mockGetPendingHumanConversationId,
}));

// ── Import handler AFTER mocks ──────────────────────────────────────

const { POST } = await import(
  "../routes/api/orchestrator/human-input/+server"
);

// ── Helpers ─────────────────────────────────────────────────────────

function makeEvent(body: Record<string, unknown>) {
  return {
    request: new Request("http://localhost/api/orchestrator/human-input", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    locals: {
      user: { id: "user-1", email: "t@t.com", name: "T", role: "member" },
    },
  } as any;
}

// ── Tests ───────────────────────────────────────────────────────────

describe("POST /api/orchestrator/human-input", () => {
  beforeEach(() => {
    mockScopeResponse = null;
    pendingConvIdByRequestId = {};
    mockBusEmit.mockClear();
    mockResolveHumanInput.mockClear();
    mockGetPendingHumanConversationId.mockClear();
  });

  test("with a live requestId — resolves the gate and emits orchestrator:human_response with the correct conversationId", async () => {
    pendingConvIdByRequestId["req-live"] = "conv-A";

    const res = await POST(makeEvent({ requestId: "req-live", response: "blue" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    // Gate resolution happens regardless.
    expect(mockResolveHumanInput).toHaveBeenCalledTimes(1);
    expect(mockResolveHumanInput.mock.calls[0]).toEqual(["req-live", "blue"]);

    // And we emitted the new event with conversationId on the payload.
    expect(mockBusEmit).toHaveBeenCalledTimes(1);
    const [eventName, payload] = mockBusEmit.mock.calls[0] as [string, any];
    expect(eventName).toBe("orchestrator:human_response");
    expect(payload).toEqual({
      requestId: "req-live",
      response: "blue",
      conversationId: "conv-A",
    });
  });

  test("with an unknown requestId (late POST — gate already timed out/aborted) — returns { ok: true } and does NOT emit", async () => {
    // pendingConvIdByRequestId deliberately has no entry for this id.

    const res = await POST(makeEvent({ requestId: "req-gone", response: "stale" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    // resolveHumanInput is still called (it's a no-op at the host side for
    // unknown ids — keeps the endpoint shape simple).
    expect(mockResolveHumanInput).toHaveBeenCalledTimes(1);

    // Key assertion: no event fires when we have no conversationId to
    // attach — the SSE conversation filter would drop a conversationId-less
    // human_response anyway, so emitting would be pure noise.
    expect(mockBusEmit).not.toHaveBeenCalled();
  });

  test("scope-middleware rejection short-circuits before the gate and bus are touched", async () => {
    mockScopeResponse = new Response("forbidden", { status: 403 });

    const res = await POST(makeEvent({ requestId: "req-live", response: "blue" }));

    expect(res.status).toBe(403);
    expect(mockResolveHumanInput).not.toHaveBeenCalled();
    expect(mockBusEmit).not.toHaveBeenCalled();
  });
});
