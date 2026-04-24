/**
 * Server-handler unit tests for /api/tool-invoke/+server.ts.
 *
 * The handler pulls in the full runtime (ExtensionRegistry, ToolExecutor,
 * context.ensureInitialized, task-tracking-host). We mock each of those
 * at the module boundary so the test never touches the real runtime.
 * Coverage focuses on the auth/scope gate, the JSON/field validation
 * gate, and the 404 "Tool not found" shape.
 */

import { test, expect, describe, vi, beforeEach } from "vitest";

const registryGetTool = vi.fn();
const registryLoadFromDb = vi.fn(async () => undefined);
vi.mock("$server/extensions/registry", () => ({
  ExtensionRegistry: {
    getInstance: () => ({
      getRegisteredTool: registryGetTool,
      loadFromDb: registryLoadFromDb,
    }),
  },
}));

const executeToolCall = vi.fn();
vi.mock("$server/extensions/tool-executor", () => ({
  ToolExecutor: class {
    executeToolCall = executeToolCall;
  },
}));

vi.mock("$lib/server/context", () => ({
  ensureInitialized: vi.fn(async () => undefined),
  getBus: () => ({
    emit: vi.fn(),
    on: vi.fn(() => () => undefined),
  }),
}));

vi.mock("$server/runtime/task-tracking-host", () => ({
  ensureTaskTrackingWired: vi.fn(async () => undefined),
}));

const { POST } = await import("../routes/api/tool-invoke/+server");

function makeEvent(opts: {
  body?: unknown;
  locals?: Record<string, unknown>;
  bodyRaw?: string;
}) {
  const init: RequestInit = { method: "POST" };
  if (opts.bodyRaw !== undefined) {
    init.body = opts.bodyRaw;
    init.headers = { "content-type": "application/json" };
  } else if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body);
    init.headers = { "content-type": "application/json" };
  }
  return {
    url: new URL("http://localhost/api/tool-invoke"),
    locals: opts.locals ?? {},
    request: new Request("http://localhost/api/tool-invoke", init),
  } as any;
}

const authedUser = { user: { id: "u1", email: "u@x", name: "u", role: "user" } };

async function expectThrown(
  fn: () => Promise<Response> | Response,
  status: number,
): Promise<Response> {
  let res: Response | undefined;
  try {
    res = await fn();
  } catch (thrown) {
    expect(thrown).toBeInstanceOf(Response);
    res = thrown as Response;
  }
  expect(res!.status).toBe(status);
  return res!;
}

describe("POST /api/tool-invoke", () => {
  beforeEach(() => {
    registryGetTool.mockReset();
    registryLoadFromDb.mockClear();
    executeToolCall.mockReset();
  });

  test("rejects 401 when locals.user is missing", async () => {
    await expectThrown(
      () =>
        POST(
          makeEvent({
            body: {
              extensionName: "x",
              toolName: "y",
              input: {},
              conversationId: "c",
              invocationId: "i",
            },
          }),
        ),
      401,
    );
  });

  test("rejects 403 when API-key lacks 'extensions' scope", async () => {
    const res = await POST(
      makeEvent({
        locals: { ...authedUser, apiKeyScopes: ["read"] },
        body: {
          extensionName: "x",
          toolName: "y",
          input: {},
          conversationId: "c",
          invocationId: "i",
        },
      }),
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { required?: string };
    expect(body.required).toBe("extensions");
  });

  test("rejects 400 when body is not valid JSON", async () => {
    const res = await POST(
      makeEvent({ locals: authedUser, bodyRaw: "not-json" }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("Invalid JSON body");
  });

  test("rejects 400 when required fields are missing", async () => {
    const res = await POST(
      makeEvent({
        locals: authedUser,
        body: { extensionName: "x", toolName: "y" }, // missing conversationId, invocationId
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toContain("Missing required fields");
  });

  test("returns 404 when tool is not registered even after reload", async () => {
    registryGetTool.mockReturnValue(undefined);
    const res = await POST(
      makeEvent({
        locals: authedUser,
        body: {
          extensionName: "ext",
          toolName: "missing",
          input: {},
          conversationId: "c1",
          invocationId: "i1",
        },
      }),
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toContain("Tool not found");
    // reload is attempted once when the first lookup misses.
    expect(registryLoadFromDb).toHaveBeenCalledTimes(1);
  });

  test("returns 200 success: true when executeToolCall reports no error", async () => {
    registryGetTool.mockReturnValue({ name: "ext__ok" });
    executeToolCall.mockResolvedValue({
      isError: false,
      content: [{ type: "text", text: "done" }],
    });
    const res = await POST(
      makeEvent({
        locals: authedUser,
        body: {
          extensionName: "ext",
          toolName: "ok",
          input: { a: 1 },
          conversationId: "c1",
          invocationId: "i1",
        },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success?: boolean;
      output?: string;
      toolCallId?: string;
    };
    expect(body.success).toBe(true);
    expect(body.output).toBe("done");
    expect(body.toolCallId).toBe("i1");
  });
});
