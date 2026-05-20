/**
 * Server-handler unit tests for GET /api/conversations/[id]/goal-state.
 *
 * Covers:
 *   - auth (401 / scope error)
 *   - ownership 404 (no leak of conversation existence)
 *   - "no goal" branch (`state:"off"`)
 *   - active branch with in-memory record (full snapshot — armedAt,
 *     turnsEvaluated, lastReason)
 *   - active branch WITHOUT in-memory record (boot-sweep raced /
 *     conv post-boot — falls back to persisted lastReason mirror)
 *   - paused branch (in-memory record's `status === "paused"`)
 *
 * Mocks the goal-host accessor + the persisted-goal reader at the
 * import boundary (same vi.mock pattern as
 * `api-conversations-id-team-messages.server.test.ts`).
 */

import { test, expect, describe, vi, beforeEach } from "vitest";

// ── Module mocks ────────────────────────────────────────────────────

const getConversation = vi.fn();
vi.mock("$server/db/queries/conversations", () => ({
  getConversation,
}));

const readPersistedGoal = vi.fn();
vi.mock("$server/runtime/goal-host", () => ({
  readPersistedGoal,
}));

const getRecord = vi.fn();
// `getGoalHost()` returns `GoalHost | null` in production
// (context.ts:352). The mock uses an explicit return-type annotation
// of `unknown` so individual tests can replace it with `null` via
// `mockReturnValueOnce(null)` to exercise the "host not yet
// initialized" branch.
const getGoalHost = vi.fn<() => unknown>(() => ({ getRecord }));
vi.mock("$lib/server/context", () => ({
  getGoalHost,
}));

// `resolveRootConversationForOwnership` is the auth gate; we delegate
// to it via a thin wrapper rather than reimplement walks here.
const resolveRootConversationForOwnership = vi.fn();
vi.mock("$lib/server/conversation-ownership", () => ({
  resolveRootConversationForOwnership,
}));

// ── Import-under-test (after mocks are wired) ────────────────────────

const { GET } = await import(
  "../routes/api/conversations/[id]/goal-state/+server.ts"
);

const user = { id: "u1", email: "u@x", name: "u", role: "user" };

function makeEvent(opts: { locals?: Record<string, unknown>; id?: string } = {}) {
  return {
    url: new URL(`http://localhost/api/conversations/${opts.id ?? "c1"}/goal-state`),
    locals: opts.locals ?? {},
    params: { id: opts.id ?? "c1" },
    request: new Request(
      `http://localhost/api/conversations/${opts.id ?? "c1"}/goal-state`,
    ),
  } as unknown as Parameters<typeof GET>[0];
}

beforeEach(() => {
  getConversation.mockReset();
  readPersistedGoal.mockReset();
  resolveRootConversationForOwnership.mockReset();
  getRecord.mockReset();
  getGoalHost.mockClear();
  // Default: scope check passes via the locals shape. The handler
  // calls requireScope/requireAuth from `locals` — both succeed when
  // `locals.user` is present.
});

describe("GET /api/conversations/[id]/goal-state — auth gate", () => {
  test("rejects 401 when unauthenticated (no user on locals)", async () => {
    let res: Response | undefined;
    try {
      await GET(makeEvent({ locals: {} }));
      expect.fail("should have thrown");
    } catch (thrown) {
      expect(thrown).toBeInstanceOf(Response);
      res = thrown as Response;
    }
    expect(res!.status).toBe(401);
  });

  test("returns 404 when ownership resolution fails (non-owner / missing conv)", async () => {
    resolveRootConversationForOwnership.mockResolvedValue(null);
    const res = await GET(makeEvent({ locals: { user } }));
    expect(res.status).toBe(404);
    // Body is the shape errorJson returns — pinned so we don't
    // accidentally leak the conversation's existence.
    const body = await res.json();
    expect(body.error).toBe("Not found");
  });
});

describe("GET /api/conversations/[id]/goal-state — projection branches", () => {
  beforeEach(() => {
    resolveRootConversationForOwnership.mockResolvedValue({
      conv: { id: "c1", userId: user.id, projectId: "p1" },
      root: { id: "c1", userId: user.id },
    });
  });

  test("no metadata.goal → state:'off' (chip hidden)", async () => {
    readPersistedGoal.mockResolvedValue(undefined);
    const res = await GET(makeEvent({ locals: { user } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ state: "off" });
  });

  test("active goal WITH in-memory record → full snapshot (armedAt + turnsEvaluated + reason)", async () => {
    readPersistedGoal.mockResolvedValue({
      condition: "ship the chip",
      lastReason: "stale persisted reason",
      createdAt: "2026-05-20T00:00:00.000Z",
    });
    const armedAt = 1_700_000_000_000;
    getRecord.mockReturnValue({
      conversationId: "c1",
      armedAt,
      turnsEvaluated: 3,
      tokenAccumSinceArmed: 0,
      evaluatorFailureCount: 0,
      lastReason: "evaluator: keep going",
      status: "active",
      inFlightRunId: null,
    });

    const res = await GET(makeEvent({ locals: { user } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.state).toBe("active");
    expect(body.condition).toBe("ship the chip");
    expect(body.armedAt).toBe(armedAt);
    expect(body.turnsEvaluated).toBe(3);
    // In-memory reason wins over persisted mirror (live state preferred).
    expect(body.lastReason).toBe("evaluator: keep going");
  });

  test("paused goal WITH in-memory record → state:'paused'", async () => {
    readPersistedGoal.mockResolvedValue({
      condition: "x",
      lastReason: null,
      createdAt: "2026-05-20T00:00:00.000Z",
    });
    getRecord.mockReturnValue({
      conversationId: "c1",
      armedAt: 1_700_000_000_000,
      turnsEvaluated: 1,
      tokenAccumSinceArmed: 0,
      evaluatorFailureCount: 0,
      lastReason: "turn errored",
      status: "paused",
      inFlightRunId: null,
    });

    const res = await GET(makeEvent({ locals: { user } }));
    const body = await res.json();
    expect(body.state).toBe("paused");
    expect(body.lastReason).toBe("turn errored");
  });

  test("active goal WITHOUT in-memory record (boot race) → state:'active' with persisted-mirror reason + no armedAt", async () => {
    // This branch covers the FR-13a/b transient window: `metadata.goal`
    // present, boot sweep not yet completed for this conversation. We
    // surface the persisted condition + lastReason mirror so the chip
    // renders immediately; the timer span is hidden (no armedAt) and
    // the next user-message POST rebuilds the record via FR-13b.
    readPersistedGoal.mockResolvedValue({
      condition: "x",
      lastReason: "mirror from before restart",
      createdAt: "2026-05-20T00:00:00.000Z",
    });
    getRecord.mockReturnValue(undefined);

    const res = await GET(makeEvent({ locals: { user } }));
    const body = await res.json();
    expect(body.state).toBe("active");
    expect(body.condition).toBe("x");
    expect(body.armedAt).toBeUndefined();
    expect(body.turnsEvaluated).toBeUndefined();
    expect(body.lastReason).toBe("mirror from before restart");
  });

  test("goal-host singleton not yet initialized → still returns active (graceful degradation)", async () => {
    // Edge: getGoalHost() returns null when ensureInitialized hasn't
    // completed. The endpoint must NOT crash — it falls back to the
    // "no in-memory record" branch.
    getGoalHost.mockReturnValueOnce(null);
    readPersistedGoal.mockResolvedValue({
      condition: "x",
      lastReason: null,
      createdAt: "2026-05-20T00:00:00.000Z",
    });
    const res = await GET(makeEvent({ locals: { user } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.state).toBe("active");
    expect(body.condition).toBe("x");
    expect(body.armedAt).toBeUndefined();
  });
});
