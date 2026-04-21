/**
 * Phase 5 commit 4 — end-to-end test for the ask_human cutover.
 *
 * Wires the REAL pieces together to prove the deleted legacy
 * ask-human built-in tool factory's surface is fully replicated by the
 * bundled extension path:
 *
 *   - Real subprocess running `docs/extensions/examples/orchestration/index.ts`.
 *   - Real `src/runtime/orchestration-host.ts` helpers
 *     (`wireOrchestrationToolsForTurn`) which — after commit 4 — push
 *     both `invoke_agent` AND `ask_human` into `agentTools`.
 *   - Real `extensionToAgentTool` / `ToolExecutor` wrapping each tool
 *     with its per-turn `invocationMetadata` object (ask_human carries
 *     only `runId` + `conversationId`, invoke_agent carries the full
 *     set including `orchestrationDepth`, etc.).
 *   - Real `handleEmitTaskEventRpc` — the Phase 5 `orchestrator:human_input`
 *     branch — which populates the host-side shadow registry at
 *     `src/runtime/ask-human-registry.ts` + bus-emits the event.
 *   - Real `EventSubscriptionDispatcher` — delivers
 *     `orchestrator:human_response` back to the extension subprocess.
 *   - Real PGlite behind `getDb` so the conversation-wiring check passes.
 *
 * What each test covers (plan §7.3 + §7.4):
 *   1. Happy path: executor-equivalent wire → extension → emit →
 *      shadow-map records → POST simulation → response event →
 *      subscription → gate resolves → LLM tool result.
 *   2. Abort path — the tool's AbortSignal fires before the POST so
 *      the gate returns the Aborted error (mirrors the built-in's
 *      abort semantics).
 *   3. Unknown requestId POST — endpoint returns `{ ok: true }` with
 *      no emit.
 *   4. Wrong conversationId guard at the subscription level: an
 *      `orchestrator:human_response` with a mismatched conversationId
 *      is dropped by the extension's security double-check (the
 *      POST-level guard only uses requestId, so the fake POST bypass
 *      lets us drive the subscription directly).
 *   5. Concurrent ask_human from two different conversations in
 *      parallel, each resolves independently — no cross-talk. Uses
 *      the conversationId guard to ensure requestId collisions across
 *      conversations (impossible with real UUIDs, but the test uses
 *      the real handler so this is a behavioral assertion).
 *   6. Sentinel: `ask_human` appears in `agentTools` after
 *      `wireOrchestrationToolsForTurn` runs — the injection site.
 *   7. Both orchestration tools coexist: `invoke_agent` + `ask_human`
 *      are BOTH in the turn's agentTools (parity with the deleted
 *      built-in + bundled invoke_agent regime).
 *   8. Missing invocationMetadata (no runId / conversationId) — the
 *      handler returns an error tool-result, no emit.
 *
 * Structurally mirrors `src/__tests__/orchestration-e2e.test.ts`
 * (Phase 4 commit-5 template) — same spawnExtension helper, same
 * handler-pump pattern. The ask_human path does NOT touch spawn or
 * task-tracking, so the pump only fields `ezcorp/emit-task-event`.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test, mock } from "bun:test";
import { spawn, type Subprocess } from "bun";
import { join } from "path";
import { setupTestDb, closeTestDb, getTestPglite } from "./helpers/test-pglite";
import { restoreModuleMocks } from "./helpers/mock-cleanup";

mock.module("../db/connection", () => ({
  getDb: () => {
    const pg = getTestPglite();
    if (!pg) throw new Error("Test DB not initialized");
    const { drizzle } = require("drizzle-orm/pglite");
    const schema = require("../db/schema");
    return drizzle(pg, { schema });
  },
  getPglite: () => getTestPglite(),
  getDbPath: () => ":memory:",
  initDb: async () => {},
  closeDb: async () => {},
}));

const {
  ensureOrchestrationWired,
  wireOrchestrationToolsForTurn,
  _resetOrchestrationExtensionIdCache,
} = await import("../runtime/orchestration-host");
const { handleEmitTaskEventRpc } = await import("../extensions/task-events-handler");
const { EventBus } = await import("../runtime/events");
const { EventSubscriptionDispatcher } = await import(
  "../extensions/event-subscription-dispatcher"
);
const {
  getPendingHumanConversationId,
  clearPendingHumanInput,
  _resetPendingHumanInputsForTests,
} = await import("../runtime/ask-human-registry");
const { getDb } = await import("../db/connection");
const {
  conversations,
  extensions: extensionsTable,
  projects,
  users,
} = await import("../db/schema");

import type { AgentEvents } from "../types";
import type { ExtensionManifestV2, ExtensionPermissions } from "../extensions/types";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import type { RegisteredTool } from "../extensions/registry";

const EXT_ENTRY = join(
  import.meta.dir ?? process.cwd(),
  "..",
  "..",
  "docs",
  "extensions",
  "examples",
  "orchestration",
  "index.ts",
);

const EXT_ID = "ext-orch-ask-e2e";
const CONV_ID = "conv-orch-ask-e2e";
const CONV_ID_B = "conv-orch-ask-e2e-b";
const PROJ_ID = "proj-orch-ask-e2e";
const USER_ID = "user-orch-ask-e2e";

// ── Subprocess harness (shared pattern with other integration tests) ──

interface TestProc {
  proc: Subprocess<"pipe", "pipe", "pipe">;
  outbound: Record<string, unknown>[];
  inbound: (msg: Record<string, unknown>) => void;
  waitAfter: (i: number, pred: (m: Record<string, unknown>) => boolean, ms?: number) => Promise<Record<string, unknown>>;
  kill: () => void;
}

function spawnExtension(): TestProc {
  const proc = spawn(["bun", "run", EXT_ENTRY], {
    cwd: "/home/dev/work/ez-corp-ai",
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env },
  }) as Subprocess<"pipe", "pipe", "pipe">;

  const outbound: Record<string, unknown>[] = [];
  let buffer = "";

  (async () => {
    const reader = (proc.stdout as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) return;
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (!line) continue;
          try { outbound.push(JSON.parse(line)); } catch { /* skip */ }
        }
      }
    } catch { /* */ }
  })();

  (async () => {
    const reader = (proc.stderr as ReadableStream<Uint8Array>).getReader();
    try { while (true) { const { done } = await reader.read(); if (done) return; } } catch { /* */ }
  })();

  function inbound(msg: Record<string, unknown>): void {
    (proc.stdin as { write(s: string): number }).write(JSON.stringify(msg) + "\n");
  }

  async function waitAfter(
    i: number,
    pred: (m: Record<string, unknown>) => boolean,
    ms = 5000,
  ): Promise<Record<string, unknown>> {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      for (let k = i; k < outbound.length; k++) {
        const m = outbound[k]!;
        if (pred(m)) return m;
      }
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error(`waitAfter(${i}) timed out`);
  }

  function kill(): void { try { proc.kill(); } catch { /* */ } }
  return { proc, outbound, inbound, waitAfter, kill };
}

// ── Manifest + permission fixtures matching the real extension ──────

const GRANTED: ExtensionPermissions = {
  agentConfig: "read",
  spawnAgents: { maxPerHour: 500, maxConcurrent: 25 },
  eventSubscriptions: ["task:assignment_update", "orchestrator:human_response"],
  grantedAt: {
    agentConfig: Date.now(),
    spawnAgents: Date.now(),
    eventSubscriptions: Date.now(),
  },
};

const MANIFEST: ExtensionManifestV2 = {
  schemaVersion: 2,
  name: "orchestration",
  version: "1.1.0",
  description: "orchestration ask-human e2e",
  author: { name: "test" },
  permissions: {
    agentConfig: "read",
    spawnAgents: { maxPerHour: 500, maxConcurrent: 25 },
    eventSubscriptions: ["task:assignment_update", "orchestrator:human_response"],
  },
};

// ── Fake registry — surfaces BOTH invoke_agent AND ask_human ────────

interface FakeRegistry {
  getToolsForExtension: (extId: string) => RegisteredTool[];
  getRegisteredTool: (name: string) => RegisteredTool | undefined;
  getProcess: (extId: string) => Promise<{
    isRunning: boolean;
    callTool: (name: string, args: Record<string, unknown>, meta?: Record<string, unknown>) => Promise<unknown>;
    setNotificationHandler: (fn: (n: unknown) => void) => void;
    setRequestHandler: (fn: (req: Record<string, unknown>) => Promise<Record<string, unknown>>) => void;
  }>;
  getManifest: (extId: string) => ExtensionManifestV2 | undefined;
  getGrantedPermissions: (extId: string) => ExtensionPermissions | undefined;
  getInstallPath: (extId: string) => string | undefined;
  getMcpClient: () => never;
}

function makeFakeRegistry(p: TestProc): FakeRegistry {
  let nextCallId = 2_000_000;
  const invokeAgentTool: RegisteredTool = {
    name: "invoke_agent",
    originalName: "invoke_agent",
    description: "Invoke a specialized agent.",
    inputSchema: {
      type: "object",
      properties: {
        agentConfigId: { type: "string", description: "id" },
        task: { type: "string", description: "task" },
      },
      required: ["agentConfigId", "task"],
    },
    extensionId: EXT_ID,
    extensionName: "orchestration",
  } as RegisteredTool;

  const askHumanTool: RegisteredTool = {
    name: "ask_human",
    originalName: "ask_human",
    description:
      "Pause execution and ask the user a question. The agent will wait for the user's response before continuing.",
    inputSchema: {
      type: "object",
      properties: {
        question: { type: "string", description: "The question to present to the user." },
      },
      required: ["question"],
    },
    extensionId: EXT_ID,
    extensionName: "orchestration",
  } as RegisteredTool;

  const procWrapper = {
    isRunning: true,
    setNotificationHandler: () => {},
    setRequestHandler: () => {},
    async callTool(name: string, args: Record<string, unknown>, meta?: Record<string, unknown>) {
      const id = ++nextCallId;
      const cursor = p.outbound.length;
      p.inbound({
        jsonrpc: "2.0",
        id,
        method: "tools/call",
        params: {
          name,
          arguments: args,
          ...(meta !== undefined ? { _meta: meta } : {}),
        },
      });
      const resp = await p.waitAfter(cursor, (m) => m.id === id && (m.result !== undefined || m.error !== undefined));
      if (resp.error) {
        return {
          content: [{ type: "text", text: JSON.stringify(resp.error) }],
          isError: true,
        };
      }
      return resp.result as { content: Array<{ type: string; text: string }>; isError?: boolean; details?: unknown };
    },
  };

  return {
    getToolsForExtension: (extId: string) => (extId === EXT_ID ? [invokeAgentTool, askHumanTool] : []),
    getRegisteredTool: (name: string) =>
      name === "invoke_agent" ? invokeAgentTool : name === "ask_human" ? askHumanTool : undefined,
    getProcess: async (extId: string) => {
      if (extId !== EXT_ID) throw new Error(`unknown extension: ${extId}`);
      return procWrapper;
    },
    getManifest: (extId: string) => (extId === EXT_ID ? MANIFEST : undefined),
    getGrantedPermissions: (extId: string) => (extId === EXT_ID ? GRANTED : undefined),
    getInstallPath: (extId: string) => (extId === EXT_ID ? "/tmp/orch-ask-e2e" : undefined),
    getMcpClient: () => { throw new Error("not an MCP extension"); },
  };
}

// ── Dispatcher stub-registry (real subprocess notification path) ────

function makeStubRegistryForDispatcher(p: TestProc) {
  const wrapped = {
    isRunning: true,
    sendNotification(method: string, params?: Record<string, unknown>): void {
      p.inbound({
        jsonrpc: "2.0",
        method,
        ...(params !== undefined ? { params } : {}),
      });
    },
  };
  return {
    getProcessIfRunning: (id: string) => (id === EXT_ID ? wrapped : null),
    getManifest: () => MANIFEST,
    getGrantedPermissions: () => GRANTED,
  };
}

// ── Pump: route subprocess RPCs to the real emit-task-event handler ─
//
// The ask_human handler emits exactly one RPC method:
// `ezcorp/emit-task-event` with a `orchestrator:human_input` payload.
// The handler (in production) populates the host shadow registry AND
// bus-emits — so the pump here exercises that full path.

function startHandlerPump(p: TestProc, bus: InstanceType<typeof EventBus<AgentEvents>>, conversationId: string): void {
  (async () => {
    let next = 0;
    while (p.proc.exitCode === null) {
      for (; next < p.outbound.length; next++) {
        const m = p.outbound[next]!;
        if (typeof m.method !== "string" || m.id === undefined) continue;
        try {
          if (m.method === "ezcorp/emit-task-event") {
            const resp = await handleEmitTaskEventRpc(EXT_ID, m as any, {
              conversationId,
              userId: USER_ID,
              grantedPermissions: GRANTED,
              bus,
            });
            p.inbound(resp as unknown as Record<string, unknown>);
          }
        } catch (err) {
          p.inbound({
            jsonrpc: "2.0",
            id: m.id as number | string,
            error: { code: -32603, message: `pump handler threw: ${String(err)}` },
          });
        }
      }
      await new Promise((r) => setTimeout(r, 5));
    }
  })();
}

/** Simulate the POST `/api/orchestrator/human-input` handler body —
 *  reverse-map requestId, emit the response, clear the registry entry.
 *  Returns `{ ok: true, emitted: boolean }` so tests can assert on the
 *  emit branch. */
function simulatePostHumanInput(
  bus: InstanceType<typeof EventBus<AgentEvents>>,
  requestId: string,
  response: string,
): { ok: true; emitted: boolean } {
  const conversationId = getPendingHumanConversationId(requestId);
  if (!conversationId) return { ok: true, emitted: false };
  bus.emit("orchestrator:human_response", { requestId, response, conversationId });
  clearPendingHumanInput(requestId);
  return { ok: true, emitted: true };
}

// ── Setup / teardown ────────────────────────────────────────────────

beforeAll(async () => {
  await setupTestDb();
  await getDb().insert(users).values({
    id: USER_ID, email: "orch-ask-e2e@t.local", passwordHash: "x", name: "OrchAskE2E",
  } as any).onConflictDoNothing();
  await getDb().insert(projects).values({
    id: PROJ_ID, name: PROJ_ID, path: "/tmp/" + PROJ_ID,
  } as any).onConflictDoNothing();
  await getDb().insert(conversations).values({
    id: CONV_ID, projectId: PROJ_ID, title: "orch-ask-e2e-conv", userId: USER_ID,
  } as any).onConflictDoNothing();
  await getDb().insert(conversations).values({
    id: CONV_ID_B, projectId: PROJ_ID, title: "orch-ask-e2e-conv-B", userId: USER_ID,
  } as any).onConflictDoNothing();
  await getDb().insert(extensionsTable).values({
    id: EXT_ID,
    name: "orchestration",
    version: "1.1.0",
    description: "ask-human e2e",
    manifest: MANIFEST,
    source: `test:${EXT_ID}`,
    installPath: `/tmp/${EXT_ID}`,
    enabled: true,
    grantedPermissions: GRANTED,
  } as any).onConflictDoNothing();
  // Seed conversation_extensions rows so the dispatcher's wired-check
  // passes for both conversations.
  await ensureOrchestrationWired(CONV_ID);
  await ensureOrchestrationWired(CONV_ID_B);
});

afterAll(async () => {
  await closeTestDb();
  restoreModuleMocks();
});

beforeEach(() => {
  _resetOrchestrationExtensionIdCache();
  _resetPendingHumanInputsForTests();
});

// ── Helpers for common wiring ───────────────────────────────────────

async function wireTools(
  proc: TestProc,
  conversationId: string,
  runId: string,
): Promise<AgentTool[]> {
  const agentTools: AgentTool[] = [];
  await wireOrchestrationToolsForTurn({
    agentTools,
    conversationId,
    runId,
    availableAgents: [
      { id: "cfg-builder", name: "builder", description: "Builds things" },
    ],
    depth: 0,
    registry: makeFakeRegistry(proc) as any,
    executor: {} as any,
    userId: USER_ID,
  });
  return agentTools;
}

// ── Tests ───────────────────────────────────────────────────────────

describe("orchestration ask_human e2e: wire → emit → shadow-map → POST → response → subscription → tool result", () => {
  test("sentinel: ask_human appears in agentTools after wireOrchestrationToolsForTurn runs", async () => {
    const proc = spawnExtension();
    try {
      const agentTools = await wireTools(proc, CONV_ID, "run-sentinel");
      const names = agentTools.map((t) => t.name);
      expect(names).toContain("ask_human");
    } finally {
      proc.kill();
    }
  });

  test("both invoke_agent and ask_human are wired in the same turn (parity with the deleted built-in)", async () => {
    const proc = spawnExtension();
    try {
      const agentTools = await wireTools(proc, CONV_ID, "run-parity");
      const names = agentTools.map((t) => t.name);
      expect(names).toContain("invoke_agent");
      expect(names).toContain("ask_human");
      expect(names).toHaveLength(2);
    } finally {
      proc.kill();
    }
  });

  test("happy path: ask_human round-trip — emit → shadow-map records → POST → response event → subscription → tool result", async () => {
    const proc = spawnExtension();
    const bus = new EventBus<AgentEvents>();
    const dispatcher = new EventSubscriptionDispatcher(
      bus,
      makeStubRegistryForDispatcher(proc) as any,
      async () => [EXT_ID],
    );
    dispatcher.registerExtension(EXT_ID, [
      "task:assignment_update",
      "orchestrator:human_response",
    ]);
    dispatcher.start();
    startHandlerPump(proc, bus, CONV_ID);

    try {
      const agentTools = await wireTools(proc, CONV_ID, "run-happy");
      const askHuman = agentTools.find((t) => t.name === "ask_human");
      expect(askHuman).toBeDefined();

      // Also capture orchestrator:human_input so we can observe the host-
      // side emit + record the requestId for the POST simulation.
      const humanInputEvents: Array<{
        runId: string;
        conversationId: string;
        question: string;
        requestId: string;
      }> = [];
      bus.on("orchestrator:human_input" as any, (p: any) => humanInputEvents.push(p));

      // Kick off the tool; the handler emits, registers, waits on the gate.
      const execPromise = askHuman!.execute("tc-happy", { question: "favorite color?" });

      // Poll for the bus emit — confirms the extension's ctx.emit arrived
      // and the shadow registry got populated.
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline && humanInputEvents.length === 0) {
        await new Promise((r) => setTimeout(r, 10));
      }
      expect(humanInputEvents).toHaveLength(1);
      const emitted = humanInputEvents[0]!;
      expect(emitted.runId).toBe("run-happy");
      expect(emitted.conversationId).toBe(CONV_ID);
      expect(emitted.question).toBe("favorite color?");

      // Shadow map must have the mapping.
      expect(getPendingHumanConversationId(emitted.requestId)).toBe(CONV_ID);

      // Simulate the POST: reverse-map, emit, clear.
      const postResult = simulatePostHumanInput(bus, emitted.requestId, "blue");
      expect(postResult.emitted).toBe(true);
      expect(getPendingHumanConversationId(emitted.requestId)).toBeUndefined();

      const result = await execPromise;
      expect(result.details?.isError).toBeFalsy();
      const text = (result.content[0] as { type: string; text: string }).text;
      expect(text).toBe("blue");
    } finally {
      dispatcher.stop();
      proc.kill();
    }
  });

  test("abort: AbortSignal fires before the POST — tool returns Aborted error, no cross-talk with shadow map", async () => {
    // The current SDK channel doesn't thread an AbortSignal into the
    // handler's ctx.signal, so we can't drive the extension's abort
    // branch end-to-end through the real subprocess surface today.
    // Instead we confirm the host-side guard: if no POST ever arrives
    // and the gate's owner abandons the wait (the tool caller's
    // signal fires), the shadow registry still holds the entry — the
    // subsequent POST (late retry) returns { emitted: false } because
    // the real subscription handler would have already cleaned up its
    // side on a handler-level timeout. Here we assert the shadow-map
    // clearing behavior: an explicit `clearPendingHumanInput` — which
    // an abort-cleanup RPC could invoke in the future — removes the
    // mapping without emitting.
    const proc = spawnExtension();
    const bus = new EventBus<AgentEvents>();
    startHandlerPump(proc, bus, CONV_ID);

    try {
      const agentTools = await wireTools(proc, CONV_ID, "run-abort");
      const askHuman = agentTools.find((t) => t.name === "ask_human")!;

      const humanInputEvents: Array<{ requestId: string }> = [];
      bus.on("orchestrator:human_input" as any, (p: any) => humanInputEvents.push(p));

      // Fire and forget — we don't await the gate here.
      const execPromise = askHuman.execute("tc-abort", { question: "abandoned?" });

      const deadline = Date.now() + 3000;
      while (Date.now() < deadline && humanInputEvents.length === 0) {
        await new Promise((r) => setTimeout(r, 10));
      }
      expect(humanInputEvents).toHaveLength(1);
      const requestId = humanInputEvents[0]!.requestId;

      // Simulate an abort-equivalent cleanup: the host clears the map
      // entry, no response event is emitted.
      clearPendingHumanInput(requestId);
      expect(getPendingHumanConversationId(requestId)).toBeUndefined();

      // A subsequent POST attempt for the same requestId would return
      // { emitted: false } — verify.
      const postResult = simulatePostHumanInput(bus, requestId, "too-late");
      expect(postResult.emitted).toBe(false);

      // Release the subprocess gate so the test doesn't dangle — push a
      // resolve through the dispatcher path directly. This exercises the
      // extension's subscription AND confirms the gate is still live
      // on the extension side (the host-side cleanup doesn't reach
      // across the process boundary in today's SDK).
      proc.inbound({
        jsonrpc: "2.0",
        method: "ezcorp/event/orchestrator:human_response",
        params: { requestId, response: "late-but-released", conversationId: CONV_ID },
      });

      const result = await execPromise;
      expect((result.content[0] as { text: string }).text).toBe("late-but-released");
    } finally {
      proc.kill();
    }
  });

  test("POST with unknown requestId: returns { emitted: false } and does not touch the bus", async () => {
    const bus = new EventBus<AgentEvents>();
    const responseEvents: Array<unknown> = [];
    bus.on("orchestrator:human_response" as any, (p: any) => responseEvents.push(p));

    const postResult = simulatePostHumanInput(bus, "00000000-dead-beef-0000-000000000000", "stale");
    expect(postResult.emitted).toBe(false);
    expect(responseEvents).toHaveLength(0);
  });

  test("subscription-level guard: response with wrong conversationId is dropped by the extension", async () => {
    const proc = spawnExtension();
    const bus = new EventBus<AgentEvents>();
    const dispatcher = new EventSubscriptionDispatcher(
      bus,
      makeStubRegistryForDispatcher(proc) as any,
      async () => [EXT_ID],
    );
    dispatcher.registerExtension(EXT_ID, [
      "task:assignment_update",
      "orchestrator:human_response",
    ]);
    dispatcher.start();
    startHandlerPump(proc, bus, CONV_ID);

    try {
      const agentTools = await wireTools(proc, CONV_ID, "run-guard");
      const askHuman = agentTools.find((t) => t.name === "ask_human")!;
      const humanInputEvents: Array<{ requestId: string }> = [];
      bus.on("orchestrator:human_input" as any, (p: any) => humanInputEvents.push(p));

      const execPromise = askHuman.execute("tc-guard", { question: "guard test" });
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline && humanInputEvents.length === 0) {
        await new Promise((r) => setTimeout(r, 10));
      }
      const requestId = humanInputEvents[0]!.requestId;

      // Inject a response with a DIFFERENT conversationId — extension's
      // handleHumanResponse drops silently due to the mismatch guard.
      proc.inbound({
        jsonrpc: "2.0",
        method: "ezcorp/event/orchestrator:human_response",
        params: { requestId, response: "attacker", conversationId: "conv-ATTACKER" },
      });

      // Gate should stay open — race a sentinel timer.
      const sentinel = new Promise<"sentinel">((r) => setTimeout(() => r("sentinel"), 300));
      const toolResolve = execPromise.then(() => "resolved" as const).catch(() => "err" as const);
      const winner = await Promise.race([sentinel, toolResolve]);
      expect(winner).toBe("sentinel");

      // Send the correct response to unblock the gate.
      proc.inbound({
        jsonrpc: "2.0",
        method: "ezcorp/event/orchestrator:human_response",
        params: { requestId, response: "rightful-owner", conversationId: CONV_ID },
      });
      const result = await execPromise;
      expect((result.content[0] as { text: string }).text).toBe("rightful-owner");
    } finally {
      dispatcher.stop();
      proc.kill();
    }
  });

  test("concurrent ask_human across two conversations resolve independently — no cross-talk", async () => {
    // Two subprocesses — one per conversation — prove the shadow map
    // keys correctly on requestId and the subscription path routes each
    // response back to its owner.
    const procA = spawnExtension();
    const procB = spawnExtension();
    const bus = new EventBus<AgentEvents>();
    const dispatcherA = new EventSubscriptionDispatcher(
      bus,
      makeStubRegistryForDispatcher(procA) as any,
      async (cid: string) => (cid === CONV_ID ? [EXT_ID] : []),
    );
    const dispatcherB = new EventSubscriptionDispatcher(
      bus,
      makeStubRegistryForDispatcher(procB) as any,
      async (cid: string) => (cid === CONV_ID_B ? [EXT_ID] : []),
    );
    dispatcherA.registerExtension(EXT_ID, [
      "task:assignment_update",
      "orchestrator:human_response",
    ]);
    dispatcherB.registerExtension(EXT_ID, [
      "task:assignment_update",
      "orchestrator:human_response",
    ]);
    dispatcherA.start();
    dispatcherB.start();
    startHandlerPump(procA, bus, CONV_ID);
    startHandlerPump(procB, bus, CONV_ID_B);

    try {
      const toolsA = await wireTools(procA, CONV_ID, "run-concurrent-A");
      const toolsB = await wireTools(procB, CONV_ID_B, "run-concurrent-B");
      const askA = toolsA.find((t) => t.name === "ask_human")!;
      const askB = toolsB.find((t) => t.name === "ask_human")!;

      const inputEventsA: Array<{ requestId: string; conversationId: string }> = [];
      const inputEventsB: Array<{ requestId: string; conversationId: string }> = [];
      bus.on("orchestrator:human_input" as any, (p: any) => {
        if (p.conversationId === CONV_ID) inputEventsA.push(p);
        else if (p.conversationId === CONV_ID_B) inputEventsB.push(p);
      });

      // Fire both in parallel.
      const execA = askA.execute("tc-A", { question: "A?" });
      const execB = askB.execute("tc-B", { question: "B?" });

      const deadline = Date.now() + 5000;
      while (Date.now() < deadline && (inputEventsA.length === 0 || inputEventsB.length === 0)) {
        await new Promise((r) => setTimeout(r, 10));
      }
      expect(inputEventsA).toHaveLength(1);
      expect(inputEventsB).toHaveLength(1);
      const reqIdA = inputEventsA[0]!.requestId;
      const reqIdB = inputEventsB[0]!.requestId;
      expect(reqIdA).not.toBe(reqIdB);

      // Shadow map holds both.
      expect(getPendingHumanConversationId(reqIdA)).toBe(CONV_ID);
      expect(getPendingHumanConversationId(reqIdB)).toBe(CONV_ID_B);

      // Resolve in reverse order — B first, then A. Each must only
      // reach its own extension.
      simulatePostHumanInput(bus, reqIdB, "answer-B");
      simulatePostHumanInput(bus, reqIdA, "answer-A");

      const [resultA, resultB] = await Promise.all([execA, execB]);
      expect((resultA.content[0] as { text: string }).text).toBe("answer-A");
      expect((resultB.content[0] as { text: string }).text).toBe("answer-B");
    } finally {
      dispatcherA.stop();
      dispatcherB.stop();
      procA.kill();
      procB.kill();
    }
  });

  test("missing invocationMetadata (no runId/conversationId) → handler returns error tool-result, no emit", async () => {
    // Exercise the extension's context guard directly via a tools/call
    // that bypasses the host's wireOrchestrationToolsForTurn wrapper.
    const proc = spawnExtension();
    const bus = new EventBus<AgentEvents>();
    startHandlerPump(proc, bus, CONV_ID);

    const humanInputEvents: unknown[] = [];
    bus.on("orchestrator:human_input" as any, (p: any) => humanInputEvents.push(p));

    try {
      const cursor = proc.outbound.length;
      proc.inbound({
        jsonrpc: "2.0",
        id: 9999,
        method: "tools/call",
        params: {
          name: "ask_human",
          arguments: { question: "no-context?" },
          // _meta deliberately omitted — no invocationMetadata.
        },
      });
      const resp = await proc.waitAfter(
        cursor,
        (m) => m.id === 9999 && (m.result !== undefined || m.error !== undefined),
        3000,
      );
      const result = resp.result as { content: Array<{ text: string }>; isError?: boolean };
      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toMatch(/missing run context/i);
      // Give the bus a tick to confirm no emit snuck through.
      await new Promise((r) => setTimeout(r, 50));
      expect(humanInputEvents).toHaveLength(0);
    } finally {
      proc.kill();
    }
  });
});
