/**
 * Behavior tests for the `!EZ:distill` action handler
 * (`src/runtime/ez-actions/distill.ts`).
 *
 * Coverage targets (per plan §2.4 + executor brief):
 *   - success path: existing chat → lesson created → card kind=success
 *     with `ref` linking to the lesson slug
 *   - decline: settings disabled → warning card
 *   - decline: empty conversation → info card
 *   - decline: LLM EMPTY → info card (the desired path)
 *   - decline: LLM malformed JSON → warning card with detail
 *   - decline: slug collision → info card naming the existing slug
 *   - error: ownerId mismatch → error card "not authorized"
 *   - error: conversation not found → error card "not found"
 *
 * Mock setup mirrors `lesson-distiller-pipeline.test.ts` to keep the
 * test patterns consistent across the lessons codepath:
 *   - `mockDbConnection()` swaps the DB to PGlite
 *   - `mock.module("@mariozechner/pi-ai", …)` controls LLM response
 *   - providers/router + providers/credentials stubbed
 *
 * The trigger gate is intentionally NOT exercised here — the manual
 * handler always passes `skipTriggerGate: true` to `runDistillation`,
 * so a low-signal conversation that the auto-listener would silently
 * skip MUST produce a card from this handler. The success path uses
 * a conversation with NO tool calls to prove that.
 */
import { test, expect, describe, beforeAll, beforeEach, afterAll, mock } from "bun:test";
import { restoreModuleMocks } from "./helpers/mock-cleanup";
import { setupTestDb, closeTestDb, mockDbConnection } from "./helpers/test-pglite";

mockDbConnection();

let mockCompleteResponse = "EMPTY";
let mockCompleteShouldThrow = false;
let mockCompleteCallCount = 0;

mock.module("@mariozechner/pi-ai", () => ({
  complete: async () => {
    mockCompleteCallCount += 1;
    if (mockCompleteShouldThrow) {
      throw new Error("simulated LLM API failure");
    }
    return {
      content: [{ type: "text", text: mockCompleteResponse }],
      usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 15, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: "stop",
    };
  },
  stream: async function* () {},
  getModel: () => ({ id: "test", provider: "anthropic", api: "anthropic", name: "test", contextWindow: 100000, maxTokens: 4096, input: ["text"], reasoning: false, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }),
  getModels: () => [],
  getProviders: () => [],
  getEnvApiKey: () => "test-key",
}));

mock.module("../providers/router", () => ({
  resolveModel: async () => ({
    provider: "anthropic",
    model: "claude-haiku-4-5-20250514",
    piModel: { id: "claude-haiku-4-5-20250514", provider: "anthropic", api: "anthropic", name: "Claude Haiku", contextWindow: 200000, maxTokens: 4096, input: ["text"], reasoning: false, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } },
  }),
}));

mock.module("../providers/credentials", () => ({
  getCredential: async () => ({ type: "apikey", token: "test-key" }),
}));

const { distillAction } = await import("../runtime/ez-actions/distill");
const { createProject } = await import("../db/queries/projects");
const { createUser } = await import("../db/queries/users");
const { createConversation, createMessage } = await import("../db/queries/conversations");
const { listVisibleLessons, createLesson } = await import("../db/queries/lessons");
const { upsertSetting, deleteSetting } = await import("../db/queries/settings");
const { lessons: lessonsTable } = await import("../db/schema");
const { getDb } = await import("../db/connection");

let projectId: string;
let userId: string;
let otherUserId: string;
let conversationId: string;
let emptyConversationId: string;

const validLessonJson = JSON.stringify({
  slug: "always-quote-paths",
  title: "Always quote paths",
  body: "Bash filenames with spaces blow up unless quoted.",
  frontmatter: { confidence: "high" },
});

beforeAll(async () => {
  await setupTestDb();
  const project = await createProject({ name: "alpha", path: "/tmp/alpha-ez" });
  projectId = project.id;
  const user = await createUser({ email: "ez-owner@test.com", passwordHash: "h", name: "Owner" });
  userId = user.id;
  const other = await createUser({ email: "ez-other@test.com", passwordHash: "h", name: "Other" });
  otherUserId = other.id;

  // Conversation with messages, owned by `userId`. NO tool calls — we
  // want to prove the trigger gate is bypassed by the manual handler.
  const conv = await createConversation(projectId, { title: "Test conv", userId });
  conversationId = conv.id;
  await createMessage(conversationId, { role: "user", content: "hello, working on TS imports", parentMessageId: undefined });
  await createMessage(conversationId, { role: "assistant", content: "got it, switching to bun", parentMessageId: undefined });

  // Empty conversation — also owned by `userId`, used to exercise the
  // empty_conversation decline path.
  const emptyConv = await createConversation(projectId, { title: "Empty conv", userId });
  emptyConversationId = emptyConv.id;
});

afterAll(async () => {
  restoreModuleMocks();
  await closeTestDb();
});

beforeEach(async () => {
  await getDb().delete(lessonsTable);
  await deleteSetting("global:lessonDistillerEnabled");
  mockCompleteResponse = "EMPTY";
  mockCompleteShouldThrow = false;
  mockCompleteCallCount = 0;
});

describe("distillAction — success path (trigger gate bypassed)", () => {
  test("low-signal conversation produces a lesson when manually invoked", async () => {
    // The conversation has zero tool calls — the auto-listener would
    // silently skip via the trigger gate. The manual handler MUST
    // still call the LLM and persist the lesson.
    mockCompleteResponse = validLessonJson;

    const result = await distillAction.handler({
      conversationId,
      userId,
      projectId,
    });

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.card.title).toBe("Lesson captured");
      expect(result.card.variant).toBe("success");
      expect(result.card.body).toContain("always-quote-paths");
      expect(result.ref).toEqual({ kind: "lesson", slug: "always-quote-paths" });
    }
    // Trigger-gate proof: the LLM was called exactly once.
    expect(mockCompleteCallCount).toBe(1);
    // Lesson persisted.
    const rows = await listVisibleLessons(projectId, userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.slug).toBe("always-quote-paths");
  });
});

describe("distillAction — decline paths (cards rendered, no error)", () => {
  test("settings disabled → warning card, no LLM call", async () => {
    await upsertSetting("global:lessonDistillerEnabled", false);
    mockCompleteResponse = validLessonJson;

    const result = await distillAction.handler({
      conversationId,
      userId,
      projectId,
    });

    expect(result.kind).toBe("decline");
    if (result.kind === "decline") {
      expect(result.card.title).toBe("Distiller is disabled");
      expect(result.card.variant).toBe("warning");
      expect(result.card.body).toMatch(/disabled|settings/i);
    }
    expect(mockCompleteCallCount).toBe(0);
    expect((await listVisibleLessons(projectId, userId))).toHaveLength(0);
  });

  test("empty conversation → info card", async () => {
    mockCompleteResponse = validLessonJson;

    const result = await distillAction.handler({
      conversationId: emptyConversationId,
      userId,
      projectId,
    });

    expect(result.kind).toBe("decline");
    if (result.kind === "decline") {
      expect(result.card.title).toBe("Not enough context");
      expect(result.card.variant).toBe("info");
    }
    // No LLM call when there are no messages to feed it.
    expect(mockCompleteCallCount).toBe(0);
  });

  test("LLM returns EMPTY → info card 'Distiller declined'", async () => {
    mockCompleteResponse = "EMPTY";

    const result = await distillAction.handler({
      conversationId,
      userId,
      projectId,
    });

    expect(result.kind).toBe("decline");
    if (result.kind === "decline") {
      expect(result.card.title).toBe("Distiller declined");
      expect(result.card.variant).toBe("info");
      expect(result.card.body).toMatch(/no reusable insight/i);
    }
    expect(mockCompleteCallCount).toBe(1);
    expect((await listVisibleLessons(projectId, userId))).toHaveLength(0);
  });

  test("LLM returns 'null' → info card (model declined)", async () => {
    mockCompleteResponse = "null";

    const result = await distillAction.handler({
      conversationId,
      userId,
      projectId,
    });

    expect(result.kind).toBe("decline");
    if (result.kind === "decline") {
      expect(result.card.title).toBe("Distiller declined");
    }
  });

  test("LLM returns malformed JSON → warning card with detail", async () => {
    mockCompleteResponse = "not valid json at all {{{";

    const result = await distillAction.handler({
      conversationId,
      userId,
      projectId,
    });

    expect(result.kind).toBe("decline");
    if (result.kind === "decline") {
      expect(result.card.title).toBe("Distiller declined");
      expect(result.card.variant).toBe("warning");
      // Detail should reference the parse error in some form.
      expect(result.card.body.length).toBeGreaterThan("Distiller declined".length);
    }
  });

  test("LLM returns object missing required fields → warning card", async () => {
    mockCompleteResponse = JSON.stringify({ slug: "x" }); // no title/body

    const result = await distillAction.handler({
      conversationId,
      userId,
      projectId,
    });

    expect(result.kind).toBe("decline");
    if (result.kind === "decline") {
      expect(result.card.variant).toBe("warning");
      expect(result.card.body).toMatch(/missing required fields/i);
    }
  });

  test("slug collision against existing user-scoped lesson → info card", async () => {
    // Pre-seed a lesson with the slug the LLM is about to produce.
    await createLesson({
      projectId,
      ownerId: userId,
      visibility: "user",
      slug: "always-quote-paths",
      title: "Pre-existing",
      body: "Already-captured body",
    });

    mockCompleteResponse = validLessonJson;

    const result = await distillAction.handler({
      conversationId,
      userId,
      projectId,
    });

    expect(result.kind).toBe("decline");
    if (result.kind === "decline") {
      expect(result.card.title).toBe("Already captured");
      expect(result.card.variant).toBe("info");
      expect(result.card.body).toContain("always-quote-paths");
    }
    // The pre-seeded row stayed authoritative (no overwrite).
    const rows = await listVisibleLessons(projectId, userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toBe("Pre-existing");
  });
});

describe("distillAction — error paths", () => {
  test("conversation not found → error card", async () => {
    const result = await distillAction.handler({
      conversationId: "ghost-conv-id-does-not-exist",
      userId,
      projectId,
    });

    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.card.title).toBe("Conversation not found");
      expect(result.card.variant).toBe("error");
    }
  });

  test("ownerId mismatch → error card 'not authorized'", async () => {
    // The conversation belongs to `userId`; we invoke as `otherUserId`.
    const result = await distillAction.handler({
      conversationId,
      userId: otherUserId,
      projectId,
    });

    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.card.title).toBe("Not authorized");
      expect(result.card.variant).toBe("error");
    }
    // No LLM call (auth check fails before the pipeline runs).
    expect(mockCompleteCallCount).toBe(0);
  });

  test("LLM throws → error card 'Distiller failed'", async () => {
    mockCompleteShouldThrow = true;

    const result = await distillAction.handler({
      conversationId,
      userId,
      projectId,
    });

    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.card.title).toBe("Distiller failed");
      expect(result.card.variant).toBe("error");
      expect(result.card.body).toContain("simulated LLM API failure");
    }
  });
});

describe("distillAction — public shape", () => {
  test("name + description match the registry contract", () => {
    expect(distillAction.name).toBe("distill");
    expect(distillAction.description.length).toBeGreaterThan(0);
    expect(distillAction.description).toMatch(/distill/i);
  });
});
