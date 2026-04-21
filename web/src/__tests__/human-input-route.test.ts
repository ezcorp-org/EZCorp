/**
 * POST /api/orchestrator/human-input
 *
 * Phase 5 commit 4 — the endpoint now reads its `requestId →
 * conversationId` mapping from the host-side shadow registry at
 * `$server/runtime/ask-human-registry` (populated by
 * `src/extensions/task-events-handler.ts`' Phase 5 `orchestrator:human_input`
 * branch) and emits `orchestrator:human_response` with the mapped
 * conversation id so the SSE conversation filter can gate delivery.
 * The legacy built-in ask-human module was deleted in this commit.
 *
 * Assertions:
 *   (1) POST with a known `requestId` emits the new event with the
 *       correct `conversationId` payload field and clears the mapping.
 *   (2) POST with an unknown `requestId` returns `{ ok: true }` but
 *       does NOT emit (late POST — the gate already timed out / aborted
 *       or the server restarted and the in-process map was lost; the
 *       UI already collapsed the optimistic card).
 *   (3) Scope-middleware rejection short-circuits before either the
 *       registry or the bus is touched.
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

// ── Mock the host-side ask-human shadow registry ────────────────────
//
// The route imports `$server/runtime/ask-human-registry` at module load
// time (no dynamic import), so the mock must be registered before the
// handler import below resolves. Bun's mock.module is hoisted into the
// module cache, so the registration wins.

let pendingConvIdByRequestId: Record<string, string | undefined> = {};
const mockGetPendingHumanConversationId = mock(
  (requestId: string) => pendingConvIdByRequestId[requestId],
);
const mockClearPendingHumanInput = mock((requestId: string) => {
  delete pendingConvIdByRequestId[requestId];
});

mock.module("$server/runtime/ask-human-registry", () => ({
  getPendingHumanConversationId: mockGetPendingHumanConversationId,
  clearPendingHumanInput: mockClearPendingHumanInput,
  // registerPendingHumanInput isn't imported by the route but is part
  // of the module surface — provide a stub so any transient import
  // under the same alias doesn't blow up.
  registerPendingHumanInput: mock((_rid: string, _cid: string) => {}),
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
    mockGetPendingHumanConversationId.mockClear();
    mockClearPendingHumanInput.mockClear();
  });

  test("with a live requestId — emits orchestrator:human_response with the mapped conversationId and clears the registry entry", async () => {
    pendingConvIdByRequestId["req-live"] = "conv-A";

    const res = await POST(makeEvent({ requestId: "req-live", response: "blue" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    // We emitted the new event with conversationId on the payload.
    expect(mockBusEmit).toHaveBeenCalledTimes(1);
    const [eventName, payload] = mockBusEmit.mock.calls[0] as [string, any];
    expect(eventName).toBe("orchestrator:human_response");
    expect(payload).toEqual({
      requestId: "req-live",
      response: "blue",
      conversationId: "conv-A",
    });

    // And the registry entry was cleared (self-cleaning map).
    expect(mockClearPendingHumanInput).toHaveBeenCalledTimes(1);
    expect(mockClearPendingHumanInput.mock.calls[0]).toEqual(["req-live"]);
  });

  test("with an unknown requestId (late POST — gate already timed out/aborted) — returns { ok: true } and does NOT emit or clear", async () => {
    // pendingConvIdByRequestId deliberately has no entry for this id.

    const res = await POST(makeEvent({ requestId: "req-gone", response: "stale" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    // Key assertion: no event fires when we have no conversationId to
    // attach — the SSE conversation filter would drop a conversationId-less
    // human_response anyway, so emitting would be pure noise.
    expect(mockBusEmit).not.toHaveBeenCalled();
    // And nothing to clear — the lookup already returned undefined.
    expect(mockClearPendingHumanInput).not.toHaveBeenCalled();
  });

  test("scope-middleware rejection short-circuits before the registry and bus are touched", async () => {
    mockScopeResponse = new Response("forbidden", { status: 403 });

    const res = await POST(makeEvent({ requestId: "req-live", response: "blue" }));

    expect(res.status).toBe(403);
    expect(mockGetPendingHumanConversationId).not.toHaveBeenCalled();
    expect(mockBusEmit).not.toHaveBeenCalled();
    expect(mockClearPendingHumanInput).not.toHaveBeenCalled();
  });
});
