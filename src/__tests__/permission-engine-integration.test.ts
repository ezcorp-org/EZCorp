/**
 * Phase 1 PDP integration: boot the registry, run one tool call
 * end-to-end through `ToolExecutor`, and assert that an `auditLog`
 * row with `action='ext:perm:allowed'` (and non-empty metadata) was
 * written.
 *
 * This is the spec's mandated "smoke test that proves the engine is
 * actually wired into the dispatch path". Smaller-grained PDP unit
 * tests live in `permission-engine.test.ts`.
 */

import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { mockDbConnection, mockRealSettings, setupTestDb, closeTestDb, getTestDb } from "./helpers/test-pglite";
import { restoreModuleMocks } from "./helpers/mock-cleanup";

mockDbConnection();
mockRealSettings();

afterAll(async () => {
  await closeTestDb();
  restoreModuleMocks();
});

import { createPermissionEngine, _resetPermissionEngineForTests } from "../extensions/permission-engine";
import { ToolExecutor } from "../extensions/tool-executor";
import type { ExtensionRegistry } from "../extensions/registry";
import type { ExtensionManifestV2, ToolCallResult } from "../extensions/types";
import { auditLog, users } from "../db/schema";
import { eq } from "drizzle-orm";

const USER_ID = "ext-perm-engine-int-user";
const EXT_ID = "ext-int-1";

// ── Boot harness ────────────────────────────────────────────────────

interface CapturedCall {
  name: string;
  args: Record<string, unknown>;
}

function makeBootedRegistry(captured: CapturedCall[]): ExtensionRegistry {
  // Manifest the booted registry would have after migrateManifestV2ToV3.
  const manifest: ExtensionManifestV2 = {
    schemaVersion: 3,
    name: "scratchpad",
    version: "1.0.0",
    description: "test",
    author: { name: "tester" },
    permissions: { storage: true },
    entrypoint: "./index.ts",
    tools: [
      {
        name: "write_note",
        description: "test",
        inputSchema: { type: "object" },
        capabilities: { storage: true },
      },
    ],
  };
  const fakeProc = {
    callTool: async (name: string, args: Record<string, unknown>): Promise<ToolCallResult> => {
      captured.push({ name, args });
      return { content: [{ type: "text", text: "ok" }], isError: false };
    },
    setNotificationHandler: () => {},
    setRequestHandler: () => {},
  };
  return {
    getRegisteredTool: () => ({
      extensionId: EXT_ID,
      extensionName: "scratchpad",
      originalName: "write_note",
      name: "scratchpad__write_note",
      description: "test",
      inputSchema: { type: "object" },
    }),
    getManifest: () => manifest,
    getGrantedPermissions: () => ({ grantedAt: {}, storage: true }),
    getProcess: async () => fakeProc,
    getMcpClient: async () => {
      throw new Error("not an mcp ext");
    },
  } as unknown as ExtensionRegistry;
}

beforeEach(async () => {
  await setupTestDb();
  await getTestDb()
    .insert(users)
    .values({
      id: USER_ID,
      email: "intuser@example.com",
      passwordHash: "x",
      name: "Int User",
      role: "member",
    })
    .onConflictDoNothing();
  _resetPermissionEngineForTests();
});

// ── End-to-end ──────────────────────────────────────────────────────

describe("PDP integration: ToolExecutor → engine.authorize → auditLog row", () => {
  test("a successful tool call writes a PERM_ALLOWED audit row", async () => {
    const captured: CapturedCall[] = [];
    const registry = makeBootedRegistry(captured);
    const engine = createPermissionEngine({
      registry,
      bus: { emit: () => {}, on: () => () => {} } as unknown as Parameters<typeof createPermissionEngine>[0]["bus"],
      db: { _token: "int-test" },
    });

    const executor = new ToolExecutor(registry, engine);
    executor.setCurrentUserId(USER_ID);

    const result = await executor.executeToolCall(
      "scratchpad__write_note",
      { content: "hello" },
      "conv-int-1",
      "msg-int-1",
    );

    // Subprocess actually got the call (proving the dispatch wasn't
    // short-circuited by a deny).
    expect(result.isError).toBe(false);
    expect(captured).toHaveLength(1);
    expect(captured[0]!.name).toBe("write_note");

    // Exactly one audit row, with the expected metadata shape.
    const rows = await getTestDb()
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "ext:perm:allowed"));
    expect(rows.length).toBeGreaterThanOrEqual(1);
    // Find the row for our extension.
    const ours = rows.find((r) => r.target === EXT_ID);
    expect(ours).toBeDefined();
    if (!ours) throw new Error("missing audit row");
    expect(ours.userId).toBe(USER_ID);
    const meta = ours.metadata as Record<string, unknown>;
    expect(meta.toolName).toBe("write_note");
    expect(meta.conversationId).toBe("conv-int-1");
    expect(typeof meta.auditId).toBe("string");
  });

  test("a denied tool call writes a PERM_DENIED audit row + throws", async () => {
    const registry = {
      getRegisteredTool: () => ({
        extensionId: EXT_ID,
        extensionName: "scratchpad",
        originalName: "write_note",
        name: "scratchpad__write_note",
        description: "test",
        inputSchema: { type: "object" },
      }),
      // Manifest declares network capability the extension wasn't
      // granted — PDP should deny.
      getManifest: () =>
        ({
          schemaVersion: 3,
          name: "scratchpad",
          version: "1.0.0",
          description: "test",
          author: { name: "tester" },
          permissions: {},
          entrypoint: "./index.ts",
          tools: [
            {
              name: "write_note",
              description: "test",
              inputSchema: { type: "object" },
              capabilities: { network: { hosts: ["api.evil.com"] } },
            },
          ],
        }) as unknown as ExtensionManifestV2,
      getGrantedPermissions: () => ({ grantedAt: {} }),
      getProcess: async () => {
        throw new Error("should never reach subprocess");
      },
    } as unknown as ExtensionRegistry;

    const engine = createPermissionEngine({
      registry,
      bus: { emit: () => {}, on: () => () => {} } as unknown as Parameters<typeof createPermissionEngine>[0]["bus"],
      db: { _token: "int-test" },
    });
    const executor = new ToolExecutor(registry, engine);
    executor.setCurrentUserId(USER_ID);

    await expect(
      executor.executeToolCall(
        "scratchpad__write_note",
        {},
        "conv-int-2",
        "msg-int-2",
      ),
    ).rejects.toThrow(/Permission denied/);

    const rows = await getTestDb()
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "ext:perm:denied"));
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});
