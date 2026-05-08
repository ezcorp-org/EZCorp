/**
 * Phase 4 — Cross-extension attribution matrix.
 *
 * Locks the confused-deputy gate from `tasks/phase-4-cross-ext-attribution.md`
 * §"NEW src/__tests__/cross-ext-attribution.test.ts" (matrix items a-i).
 *
 * Strategy: drive `handlePiInvoke` end-to-end against a stub registry +
 * a recording stub `PermissionEngine`. The recording stub captures the
 * `AuthorizeContext` of every authorize() call so we can assert the
 * engine SAW the post-intersection `capContext` (or didn't, depending
 * on opt-in).
 *
 * The actual deny/allow decision lives in the engine's subset check
 * (covered by `permission-engine.test.ts`). This file's contract is
 * narrower: assert that `handlePiInvoke` correctly threads
 * `capContext` based on the callee's `acceptsCallerCaps` GRANT.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { ExtensionRegistry } from "../extensions/registry";
import { ToolExecutor } from "../extensions/tool-executor";
import { intersect, grantsToCapabilitySet } from "../extensions/capability-types";
import type { Capability, CapabilitySet } from "../extensions/capability-types";
import type {
  ExtensionManifestV2,
  ExtensionPermissions,
  JsonRpcRequest,
} from "../extensions/types";
import type {
  AuthorizeContext,
  Decision,
  PermissionEngine,
} from "../extensions/permission-engine";
import type { AlwaysAllowScope } from "../extensions/permissions";

// ── Recording engine stub ───────────────────────────────────────────

interface RecordingEngine extends PermissionEngine {
  readonly calls: Array<{ ctx: AuthorizeContext; needed: CapabilitySet }>;
  setMode(m: "allow-all" | "subset-check"): void;
}

/**
 * Two modes:
 *   - "allow-all"    : decision always allow; calls captured.
 *   - "subset-check" : if `ctx.capContext` is set, deny when any cap
 *                      in `needed` is missing from capContext. This
 *                      lets the matrix tests verify that intersection
 *                      really gates downstream calls.
 */
function makeRecordingEngine(): RecordingEngine {
  const calls: Array<{ ctx: AuthorizeContext; needed: CapabilitySet }> = [];
  let mode: "allow-all" | "subset-check" = "allow-all";

  const covers = (g: Capability, n: Capability) =>
    g.kind === n.kind && (g.value === n.value || (g.value === undefined && n.value === undefined));

  const eng: RecordingEngine = {
    calls,
    setMode(m) {
      mode = m;
    },
    async authorize(ctx, needed): Promise<Decision> {
      calls.push({ ctx, needed });
      const auditId = "rec-audit";
      if (mode === "allow-all") return { decision: "allow", auditId };
      // subset-check: only inspect capContext when present
      if (ctx.capContext) {
        for (const n of needed) {
          if (!ctx.capContext.some((g) => covers(g, n))) {
            return {
              decision: "deny",
              reason: `intersection missing ${n.kind}${n.value ? `:${n.value}` : ""}`,
              auditId,
              missing: n,
            };
          }
        }
      }
      return { decision: "allow", auditId };
    },
    async resolvePrompt(
      _id: string,
      _ok: boolean,
      _scope: AlwaysAllowScope,
      _scopeId: string,
    ): Promise<void> {},
    _resetCacheForTests(): void {
      calls.length = 0;
    },
  };
  return eng;
}

// ── Registry / manifest helpers ─────────────────────────────────────

function makeManifest(name: string, deputy: boolean): ExtensionManifestV2 {
  return {
    schemaVersion: 3,
    name,
    version: "1.0.0",
    description: "test",
    author: { name: "tester" },
    permissions: {},
    entrypoint: "./index.ts",
    tools: [
      {
        name: "doStuff",
        description: "does stuff",
        inputSchema: { type: "object" },
      },
    ],
    ...(deputy ? { acceptsCallerCaps: true } : {}),
  };
}

function setupTwoExtensions(
  registry: ExtensionRegistry,
  callerGrants: ExtensionPermissions,
  calleeGrants: ExtensionPermissions,
  calleeIsDeputy: boolean,
): void {
  registry.setManifestForTest("caller-id", makeManifest("caller", false));
  registry.setManifestForTest("callee-id", makeManifest("callee", calleeIsDeputy));
  registry.setGrantedPermsForTest("caller-id", callerGrants);
  registry.setGrantedPermsForTest("callee-id", calleeGrants);
  registry.setDepRoutes(new Map([
    ["caller-id", new Map([["callee", "callee-id"]])],
  ]));
  registry.registerToolForTest("callee__doStuff", {
    name: "callee__doStuff",
    originalName: "doStuff",
    description: "does stuff",
    inputSchema: { type: "object" },
    extensionId: "callee-id",
    extensionName: "callee",
  });
}

function makeInvoke(id: number): JsonRpcRequest {
  return {
    jsonrpc: "2.0",
    id,
    method: "ezcorp/invoke",
    params: { tool: "callee__doStuff", arguments: {} },
  };
}

// ── Test setup ──────────────────────────────────────────────────────

let engine: RecordingEngine;
let executor: ToolExecutor;
let registry: ExtensionRegistry;

beforeEach(() => {
  ExtensionRegistry.resetInstance();
  registry = ExtensionRegistry.getInstance();
  engine = makeRecordingEngine();
  executor = new ToolExecutor(registry, engine);
});

afterEach(() => {
  ExtensionRegistry.resetInstance();
});

// ── Matrix items (a) - (b): Default behavior, acceptsCallerCaps absent ──

describe("(a) acceptsCallerCaps absent → no intersection, callee runs with own grants", () => {
  test("PDP receives capContext = undefined (registry-derived grants)", async () => {
    setupTwoExtensions(
      registry,
      { network: ["foo.com"], grantedAt: {} },
      { network: ["foo.com", "bar.com"], grantedAt: {} },
      false, // not a deputy
    );

    await executor.handlePiInvoke("caller-id", makeInvoke(1));

    expect(engine.calls.length).toBe(1);
    expect(engine.calls[0]!.ctx.capContext).toBeUndefined();
    // Pre-Phase-4 contract preserved: PDP falls back to registry grants.
  });
});

describe("(b) Non-deputy callee — runtime value not in callee manifest → engine denies on its own", () => {
  test("PDP still gets capContext=undefined; deny logic happens on registry grants", async () => {
    // The callee's manifest declares no network (matches the "tool needs
    // value not in manifest" sub-case from the spec). The handler does
    // not synthesize capContext → the PDP uses callee's own grants.
    setupTwoExtensions(
      registry,
      { network: ["foo.com"], grantedAt: {} },
      { grantedAt: {} },
      false,
    );

    await executor.handlePiInvoke("caller-id", makeInvoke(2));

    expect(engine.calls[0]!.ctx.capContext).toBeUndefined();
  });
});

// ── Matrix items (c) - (f): Deputy behavior ─────────────────────────

describe("(c) Deputy callee — caller has 'foo.com', callee has 'foo.com,bar.com', tool needs foo.com → ALLOWED", () => {
  test("intersection contains foo.com; PDP authorizes against the intersection", async () => {
    setupTwoExtensions(
      registry,
      { network: ["foo.com"], grantedAt: {} },
      { network: ["foo.com", "bar.com"], acceptsCallerCaps: true, grantedAt: {} },
      true,
    );

    engine.setMode("subset-check");
    // Mock the inner executeToolCall so it actually invokes the engine
    // path through executeToolCall's authorize call. We don't override
    // executeToolCall here — handlePiInvoke calls it directly. We DO
    // need to short-circuit the subprocess dispatch though; since the
    // tool exists in the registry but no process is wired, the
    // executeToolCall flow will throw on `getProcess`. We can stub
    // executeToolCall to JUST call the engine and return a fake result.
    let observedCtx: AuthorizeContext | null = null;
    executor.executeToolCall = async (toolName, _input, conversationId, _messageId, opts) => {
      const reg = ExtensionRegistry.getInstance();
      const tool = reg.getRegisteredTool(toolName);
      const ctx: AuthorizeContext = {
        extensionId: tool!.extensionId,
        userId: "test-user",
        conversationId,
        toolName: tool!.originalName,
        callerExtensionId: opts?.callerExtensionId,
        ...(opts?.capContext !== undefined ? { capContext: opts.capContext } : {}),
      };
      observedCtx = ctx;
      const decision = await engine.authorize(ctx, [
        { kind: "network", value: "foo.com" },
      ]);
      if (decision.decision === "deny") {
        return {
          content: [{ type: "text" as const, text: decision.reason }],
          isError: true,
        };
      }
      return { content: [{ type: "text" as const, text: "ok" }], isError: false };
    };

    const response = await executor.handlePiInvoke("caller-id", makeInvoke(3));
    expect(response.error).toBeUndefined();
    expect((response.result as any).isError).toBe(false);
    expect(observedCtx).not.toBeNull();
    expect(observedCtx!.capContext).toEqual([
      { kind: "network", value: "foo.com" },
    ]);
  });
});

describe("(d) Deputy — caller has foo.com, callee has foo.com+bar.com, tool needs bar.com → DENIED at intersection", () => {
  test("PDP receives intersection [foo.com]; needed [bar.com] → deny", async () => {
    setupTwoExtensions(
      registry,
      { network: ["foo.com"], grantedAt: {} },
      { network: ["foo.com", "bar.com"], acceptsCallerCaps: true, grantedAt: {} },
      true,
    );

    engine.setMode("subset-check");
    executor.executeToolCall = async (toolName, _input, conversationId, _messageId, opts) => {
      const reg = ExtensionRegistry.getInstance();
      const tool = reg.getRegisteredTool(toolName);
      const decision = await engine.authorize(
        {
          extensionId: tool!.extensionId,
          userId: "test-user",
          conversationId,
          toolName: tool!.originalName,
          callerExtensionId: opts?.callerExtensionId,
          ...(opts?.capContext !== undefined ? { capContext: opts.capContext } : {}),
        },
        [{ kind: "network", value: "bar.com" }],
      );
      if (decision.decision === "deny") {
        return {
          content: [{ type: "text" as const, text: decision.reason }],
          isError: true,
        };
      }
      return { content: [{ type: "text" as const, text: "ok" }], isError: false };
    };

    const response = await executor.handlePiInvoke("caller-id", makeInvoke(4));
    expect((response.result as any).isError).toBe(true);
    expect((response.result as any).content[0].text).toContain("intersection missing network:bar.com");
  });
});

describe("(e) Deputy — tool args supply URL not in callee manifest → DENIED on callee", () => {
  test("intersection cannot widen the callee's own ceiling (evil.com is in neither side)", async () => {
    setupTwoExtensions(
      registry,
      { network: ["foo.com"], grantedAt: {} },
      { network: ["foo.com", "bar.com"], acceptsCallerCaps: true, grantedAt: {} },
      true,
    );

    engine.setMode("subset-check");
    executor.executeToolCall = async (toolName, _input, conversationId, _messageId, opts) => {
      const reg = ExtensionRegistry.getInstance();
      const tool = reg.getRegisteredTool(toolName);
      const decision = await engine.authorize(
        {
          extensionId: tool!.extensionId,
          userId: "test-user",
          conversationId,
          toolName: tool!.originalName,
          callerExtensionId: opts?.callerExtensionId,
          ...(opts?.capContext !== undefined ? { capContext: opts.capContext } : {}),
        },
        [{ kind: "network", value: "evil.com" }],
      );
      if (decision.decision === "deny") {
        return {
          content: [{ type: "text" as const, text: decision.reason }],
          isError: true,
        };
      }
      return { content: [{ type: "text" as const, text: "ok" }], isError: false };
    };

    const response = await executor.handlePiInvoke("caller-id", makeInvoke(5));
    expect((response.result as any).isError).toBe(true);
    expect((response.result as any).content[0].text).toContain("evil.com");
  });
});

describe("(f) Deputy — caller has empty caps, callee has foo.com → DENIED (empty intersection)", () => {
  test("intersection is empty array; ANY needed cap denies", async () => {
    setupTwoExtensions(
      registry,
      { grantedAt: {} },
      { network: ["foo.com"], acceptsCallerCaps: true, grantedAt: {} },
      true,
    );

    engine.setMode("subset-check");
    executor.executeToolCall = async (toolName, _input, conversationId, _messageId, opts) => {
      const reg = ExtensionRegistry.getInstance();
      const tool = reg.getRegisteredTool(toolName);
      const decision = await engine.authorize(
        {
          extensionId: tool!.extensionId,
          userId: "test-user",
          conversationId,
          toolName: tool!.originalName,
          callerExtensionId: opts?.callerExtensionId,
          ...(opts?.capContext !== undefined ? { capContext: opts.capContext } : {}),
        },
        [{ kind: "network", value: "foo.com" }],
      );
      if (decision.decision === "deny") {
        return {
          content: [{ type: "text" as const, text: decision.reason }],
          isError: true,
        };
      }
      return { content: [{ type: "text" as const, text: "ok" }], isError: false };
    };

    const response = await executor.handlePiInvoke("caller-id", makeInvoke(6));
    expect((response.result as any).isError).toBe(true);
  });
});

// ── Matrix item (g): depth limit fires regardless of attribution flag ──

describe("(g) Cross-ext call depth limit (10) fires regardless of acceptsCallerCaps", () => {
  test("depth=10 with deputy callee still rejects with -32000", async () => {
    setupTwoExtensions(
      registry,
      { network: ["foo.com"], grantedAt: {} },
      { network: ["foo.com"], acceptsCallerCaps: true, grantedAt: {} },
      true,
    );

    const req: JsonRpcRequest = {
      jsonrpc: "2.0",
      id: 7,
      method: "ezcorp/invoke",
      params: { tool: "callee__doStuff", arguments: {}, _depth: 10 },
    };

    const response = await executor.handlePiInvoke("caller-id", req);
    expect(response.error).toBeDefined();
    expect(response.error!.message).toContain("depth");
    // No PDP authorize call should have been made — depth check is
    // enforced BEFORE the intersection logic.
    expect(engine.calls.length).toBe(0);
  });
});

// ── Matrix item (h): caller=undefined (top-level LLM call, not via invoke) ──

describe("(h) acceptsCallerCaps: true but caller is undefined → behaves as if flag is absent", () => {
  test("Top-level LLM call (no invoke wrapper) does not synthesize capContext", async () => {
    // Direct executeToolCall (no callerExtensionId) — the deputy flag
    // is meaningless here because there is no caller to intersect
    // against. The engine sees capContext=undefined and falls back to
    // registry grants — pre-Phase-4 behavior.
    setupTwoExtensions(
      registry,
      { network: ["foo.com"], grantedAt: {} },
      { network: ["foo.com"], acceptsCallerCaps: true, grantedAt: {} },
      true,
    );

    // Stub the inner work so we don't dispatch to a real subprocess.
    executor.executeToolCall = async (toolName, _input, conversationId, _messageId, opts) => {
      // Simulate the engine call shape that the real path would take.
      const reg = ExtensionRegistry.getInstance();
      const tool = reg.getRegisteredTool(toolName);
      await engine.authorize(
        {
          extensionId: tool!.extensionId,
          userId: "test-user",
          conversationId,
          toolName: tool!.originalName,
          callerExtensionId: opts?.callerExtensionId,
          ...(opts?.capContext !== undefined ? { capContext: opts.capContext } : {}),
        },
        [{ kind: "network", value: "foo.com" }],
      );
      return { content: [{ type: "text" as const, text: "ok" }], isError: false };
    };

    // Call directly — no callerExtensionId, no invoke wrapper
    await executor.executeToolCall(
      "callee__doStuff",
      {},
      "conv-1",
      "msg-1",
      // empty opts = top-level LLM call
    );

    expect(engine.calls.length).toBe(1);
    expect(engine.calls[0]!.ctx.capContext).toBeUndefined();
    expect(engine.calls[0]!.ctx.callerExtensionId).toBeUndefined();
  });
});

// ── Matrix item (i): chained deputies — A → B → C ──

describe("(i) Chained deputies (A → B → C, all deputies) — FULL-CHAIN intersection (M1 spec lock-in)", () => {
  test("A=[foo,bar] → B=[foo,bar] → C=[foo] all deputies → C sees intersect(intersect(A,B),C) = [foo]", async () => {
    // Phase 4 §M1 — spec lock-in
    // (tasks/phase-4-cross-ext-attribution.md:331):
    //   "chained deputies multiply intersections — A → B → C with
    //    acceptsCallerCaps: true everywhere → C sees
    //    intersect(intersect(A,B), C)"
    //
    // This is verified by simulating the runtime ALS context. The
    // production wrapping happens inside `executeToolCall`, but our
    // tests stub executeToolCall — so we manually call
    // `withRuntimeToolContext` to mirror what the real path does at
    // the inner dispatch site.
    const { withRuntimeToolContext } = await import(
      "../extensions/runtime-tool-context"
    );

    registry.setManifestForTest("a-id", makeManifest("a", false));
    registry.setManifestForTest("b-id", makeManifest("b", true));
    registry.setManifestForTest("c-id", makeManifest("c", true));

    registry.setGrantedPermsForTest("a-id", {
      network: ["foo.com", "bar.com"],
      grantedAt: {},
    });
    registry.setGrantedPermsForTest("b-id", {
      network: ["foo.com", "bar.com"],
      acceptsCallerCaps: true,
      grantedAt: {},
    });
    registry.setGrantedPermsForTest("c-id", {
      network: ["foo.com"],
      acceptsCallerCaps: true,
      grantedAt: {},
    });

    registry.setDepRoutes(new Map([
      ["a-id", new Map([["b", "b-id"]])],
      ["b-id", new Map([["c", "c-id"]])],
    ]));
    registry.registerToolForTest("b__doStuff", {
      name: "b__doStuff",
      originalName: "doStuff",
      description: "b tool",
      inputSchema: { type: "object" },
      extensionId: "b-id",
      extensionName: "b",
    });
    registry.registerToolForTest("c__doStuff", {
      name: "c__doStuff",
      originalName: "doStuff",
      description: "c tool",
      inputSchema: { type: "object" },
      extensionId: "c-id",
      extensionName: "c",
    });

    let observedAtoB: CapabilitySet | undefined;
    let observedBtoC: CapabilitySet | undefined;
    executor.executeToolCall = async (toolName, _input, _cid, _mid, opts) => {
      if (toolName === "b__doStuff") {
        observedAtoB = opts?.capContext;
      } else if (toolName === "c__doStuff") {
        observedBtoC = opts?.capContext;
      }
      return { content: [{ type: "text" as const, text: "ok" }], isError: false };
    };

    // A → B (top-level — no upstream context)
    await executor.handlePiInvoke("a-id", {
      jsonrpc: "2.0",
      id: 9,
      method: "ezcorp/invoke",
      params: { tool: "b__doStuff", arguments: {} },
    });

    // A → B step: intersect(A's foo+bar, B's foo+bar) = [foo, bar]
    const expectedAtoB = intersect(
      grantsToCapabilitySet({
        network: ["foo.com", "bar.com"],
        grantedAt: {},
      }),
      grantsToCapabilitySet({
        network: ["foo.com", "bar.com"],
        acceptsCallerCaps: true,
        grantedAt: {},
      }),
    );
    expect(observedAtoB).toEqual(expectedAtoB);

    // B → C: simulate the production path where the inner dispatch
    // for B's tool runs with `capContext = expectedAtoB` set in the
    // runtime ALS scope. The next handlePiInvoke (B calling C) then
    // reads it as the caller's effective set.
    await withRuntimeToolContext(
      { currentCapContext: expectedAtoB },
      async () => {
        await executor.handlePiInvoke("b-id", {
          jsonrpc: "2.0",
          id: 10,
          method: "ezcorp/invoke",
          params: { tool: "c__doStuff", arguments: {} },
        });
      },
    );

    // B → C step under FULL-CHAIN semantics:
    //   capContext = intersect(intersect(A,B), C)
    //              = intersect([foo,bar], [foo])
    //              = [foo]
    // Without the M1 fix this would have been intersect(B's installed
    // [foo,bar], C's [foo]) = [foo] — same result here, but the
    // attack-scenario test below shows the cases that diverge.
    expect(observedBtoC).toEqual([{ kind: "network", value: "foo.com" }]);
  });

  test("ATTACK: A=[] → B=[evil] → C=[evil] all deputies → A→B step denies → B→C never widens (M1 critical)", async () => {
    // Without M1: B→C step would compute intersect(B's installed
    // [evil], C's [evil]) = [evil] → C reaches evil even though A
    // authorized nothing. With M1: B→C step reads upstream capContext
    // = intersect([], [evil]) = []. So intersect([], [evil]) = [],
    // and evil never reaches C.
    //
    // This is the spec-locked safety property: a no-cap caller
    // CANNOT laundry-launder a chain into having any caps.
    const { withRuntimeToolContext } = await import(
      "../extensions/runtime-tool-context"
    );

    registry.setManifestForTest("a-id", makeManifest("a", false));
    registry.setManifestForTest("b-id", makeManifest("b", true));
    registry.setManifestForTest("c-id", makeManifest("c", true));

    registry.setGrantedPermsForTest("a-id", { grantedAt: {} }); // EMPTY
    registry.setGrantedPermsForTest("b-id", {
      network: ["evil.com"],
      acceptsCallerCaps: true,
      grantedAt: {},
    });
    registry.setGrantedPermsForTest("c-id", {
      network: ["evil.com"],
      acceptsCallerCaps: true,
      grantedAt: {},
    });

    registry.setDepRoutes(new Map([
      ["a-id", new Map([["b", "b-id"]])],
      ["b-id", new Map([["c", "c-id"]])],
    ]));
    registry.registerToolForTest("b__doStuff", {
      name: "b__doStuff",
      originalName: "doStuff",
      description: "b tool",
      inputSchema: { type: "object" },
      extensionId: "b-id",
      extensionName: "b",
    });
    registry.registerToolForTest("c__doStuff", {
      name: "c__doStuff",
      originalName: "doStuff",
      description: "c tool",
      inputSchema: { type: "object" },
      extensionId: "c-id",
      extensionName: "c",
    });

    let observedAtoB: CapabilitySet | undefined;
    let observedBtoC: CapabilitySet | undefined;
    executor.executeToolCall = async (toolName, _input, _cid, _mid, opts) => {
      if (toolName === "b__doStuff") {
        observedAtoB = opts?.capContext;
      } else if (toolName === "c__doStuff") {
        observedBtoC = opts?.capContext;
      }
      return { content: [{ type: "text" as const, text: "ok" }], isError: false };
    };

    // A → B: A has empty caps, B is deputy. capContext = intersect([], [evil]) = []
    await executor.handlePiInvoke("a-id", {
      jsonrpc: "2.0",
      id: 11,
      method: "ezcorp/invoke",
      params: { tool: "b__doStuff", arguments: {} },
    });
    expect(observedAtoB).toEqual([]); // empty intersection

    // B → C: under M1, the upstream capContext is the empty set.
    // The fix reads getRuntimeToolContext()?.currentCapContext = []
    // as the caller's effective set, NOT B's installed [evil].
    // intersect([], [evil]) = [] → C sees empty caps.
    await withRuntimeToolContext(
      { currentCapContext: observedAtoB ?? [] },
      async () => {
        await executor.handlePiInvoke("b-id", {
          jsonrpc: "2.0",
          id: 12,
          method: "ezcorp/invoke",
          params: { tool: "c__doStuff", arguments: {} },
        });
      },
    );
    // M1 critical: C must NOT see [evil]. The empty upstream context
    // narrows the chain.
    expect(observedBtoC).toEqual([]);
    expect(observedBtoC).not.toContainEqual({ kind: "network", value: "evil.com" });
  });

  test("Top-level invoke (no upstream context) falls back to caller's installed grants — back-compat", async () => {
    // Without ANY surrounding withRuntimeToolContext scope, the
    // upstream check returns undefined and handlePiInvoke uses the
    // immediate caller's installed grants — preserving pre-M1 behavior
    // for top-level cross-ext calls (which can't be a chain by def).
    registry.setManifestForTest("a-id", makeManifest("a", false));
    registry.setManifestForTest("b-id", makeManifest("b", true));
    registry.setGrantedPermsForTest("a-id", {
      network: ["foo.com"],
      grantedAt: {},
    });
    registry.setGrantedPermsForTest("b-id", {
      network: ["foo.com", "bar.com"],
      acceptsCallerCaps: true,
      grantedAt: {},
    });
    registry.setDepRoutes(new Map([
      ["a-id", new Map([["b", "b-id"]])],
    ]));
    registry.registerToolForTest("b__doStuff", {
      name: "b__doStuff",
      originalName: "doStuff",
      description: "b tool",
      inputSchema: { type: "object" },
      extensionId: "b-id",
      extensionName: "b",
    });

    let observed: CapabilitySet | undefined;
    executor.executeToolCall = async (_tn, _in, _cid, _mid, opts) => {
      observed = opts?.capContext;
      return { content: [{ type: "text" as const, text: "ok" }], isError: false };
    };

    await executor.handlePiInvoke("a-id", {
      jsonrpc: "2.0",
      id: 13,
      method: "ezcorp/invoke",
      params: { tool: "b__doStuff", arguments: {} },
    });

    // Top-level: capContext = intersect(A's INSTALLED [foo], B's [foo,bar]) = [foo]
    expect(observed).toEqual([{ kind: "network", value: "foo.com" }]);
  });
});

// ── Confused-deputy integration test (mandate from coverage section) ──

describe("CONFUSED-DEPUTY integration — A no-network → B (deputy with network) is gated by intersection", () => {
  test("A has no network, B has api.foo.com+api.evil.com (deputy) → A→B with URL=api.evil.com → DENY", async () => {
    setupTwoExtensions(
      registry,
      { grantedAt: {} }, // A: empty caps
      {
        network: ["api.foo.com", "api.evil.com"],
        acceptsCallerCaps: true,
        grantedAt: {},
      },
      true,
    );
    engine.setMode("subset-check");
    executor.executeToolCall = async (toolName, args, conversationId, _mid, opts) => {
      const reg = ExtensionRegistry.getInstance();
      const tool = reg.getRegisteredTool(toolName);
      const url = (args as { url?: string }).url ?? "api.evil.com";
      const decision = await engine.authorize(
        {
          extensionId: tool!.extensionId,
          userId: "test-user",
          conversationId,
          toolName: tool!.originalName,
          callerExtensionId: opts?.callerExtensionId,
          ...(opts?.capContext !== undefined ? { capContext: opts.capContext } : {}),
        },
        [{ kind: "network", value: url }],
      );
      if (decision.decision === "deny") {
        return {
          content: [{ type: "text" as const, text: decision.reason }],
          isError: true,
        };
      }
      return { content: [{ type: "text" as const, text: "ok" }], isError: false };
    };

    const r = await executor.handlePiInvoke("caller-id", {
      jsonrpc: "2.0",
      id: 100,
      method: "ezcorp/invoke",
      params: { tool: "callee__doStuff", arguments: { url: "api.evil.com" } },
    });
    expect((r.result as any).isError).toBe(true);
    expect((r.result as any).content[0].text).toContain("intersection missing network:api.evil.com");

    // N3 — audit row assertion. The recording engine captures every
    // authorize call; we inspect what would have been written to
    // auditLog as a denial (the production engine writes a
    // `ext:perm:denied` row with metadata.reason matching this
    // shape — see permission-engine.ts writeAuditRow).
    expect(engine.calls.length).toBeGreaterThanOrEqual(1);
    const denyCall = engine.calls.find(
      (c) => c.ctx.capContext !== undefined &&
        c.needed.some((n) => n.kind === "network" && n.value === "api.evil.com"),
    );
    expect(denyCall).toBeDefined();
    // The intersection (capContext) should be EMPTY (caller has no
    // network grants) — that's why the deny fires. The audit row's
    // ctx.capContext is the same as what the engine saw.
    expect(denyCall?.ctx.capContext).toEqual([]);
    expect(denyCall?.ctx.callerExtensionId).toBe("caller-id");
  });

  test("A still has no network, B same → URL=api.foo.com → DENY (A's intersection with B is empty)", async () => {
    setupTwoExtensions(
      registry,
      { grantedAt: {} }, // A still empty
      {
        network: ["api.foo.com", "api.evil.com"],
        acceptsCallerCaps: true,
        grantedAt: {},
      },
      true,
    );
    engine.setMode("subset-check");
    executor.executeToolCall = async (toolName, args, conversationId, _mid, opts) => {
      const reg = ExtensionRegistry.getInstance();
      const tool = reg.getRegisteredTool(toolName);
      const url = (args as { url?: string }).url ?? "api.foo.com";
      const decision = await engine.authorize(
        {
          extensionId: tool!.extensionId,
          userId: "test-user",
          conversationId,
          toolName: tool!.originalName,
          callerExtensionId: opts?.callerExtensionId,
          ...(opts?.capContext !== undefined ? { capContext: opts.capContext } : {}),
        },
        [{ kind: "network", value: url }],
      );
      if (decision.decision === "deny") {
        return { content: [{ type: "text" as const, text: decision.reason }], isError: true };
      }
      return { content: [{ type: "text" as const, text: "ok" }], isError: false };
    };

    const r = await executor.handlePiInvoke("caller-id", {
      jsonrpc: "2.0",
      id: 101,
      method: "ezcorp/invoke",
      params: { tool: "callee__doStuff", arguments: { url: "api.foo.com" } },
    });
    expect((r.result as any).isError).toBe(true);
  });

  test("A=api.foo.com, B same deputy → URL=api.foo.com → ALLOWED (intersection contains it)", async () => {
    setupTwoExtensions(
      registry,
      { network: ["api.foo.com"], grantedAt: {} }, // A now has the host
      {
        network: ["api.foo.com", "api.evil.com"],
        acceptsCallerCaps: true,
        grantedAt: {},
      },
      true,
    );
    engine.setMode("subset-check");
    executor.executeToolCall = async (toolName, args, conversationId, _mid, opts) => {
      const reg = ExtensionRegistry.getInstance();
      const tool = reg.getRegisteredTool(toolName);
      const url = (args as { url?: string }).url ?? "api.foo.com";
      const decision = await engine.authorize(
        {
          extensionId: tool!.extensionId,
          userId: "test-user",
          conversationId,
          toolName: tool!.originalName,
          callerExtensionId: opts?.callerExtensionId,
          ...(opts?.capContext !== undefined ? { capContext: opts.capContext } : {}),
        },
        [{ kind: "network", value: url }],
      );
      if (decision.decision === "deny") {
        return { content: [{ type: "text" as const, text: decision.reason }], isError: true };
      }
      return { content: [{ type: "text" as const, text: "ok" }], isError: false };
    };

    const r = await executor.handlePiInvoke("caller-id", {
      jsonrpc: "2.0",
      id: 102,
      method: "ezcorp/invoke",
      params: { tool: "callee__doStuff", arguments: { url: "api.foo.com" } },
    });
    expect(r.error).toBeUndefined();
    expect((r.result as any).isError).toBe(false);
  });
});
