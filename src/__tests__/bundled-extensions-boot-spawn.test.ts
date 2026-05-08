/**
 * Phase 53 fix-loop coverage — `bootSpawnFlaggedBundledExtensions`.
 *
 * UAT for Phase 53.5 caught two silently-broken event-only extensions:
 *   - memory-extractor (no tools, no manual triggers; `run:complete`
 *     never delivered because subprocess never spawned).
 *   - lessons-distiller (post-Phase-53.3; the legacy host-side listener
 *     was deleted but the bundled handler only fires when the
 *     subprocess happens to be running, which only happened on manual
 *     `!EZ:distill`).
 *
 * The fix: a `bootSpawn: true` flag on `BundledExtension` entries plus
 * a new `bootSpawnFlaggedBundledExtensions` helper that calls
 * `registry.getProcess(extId)` + injected `ensureSubprocessRpcWired`
 * for every flagged entry. This file is the unit-level guard:
 *
 *   1. lessons-distiller is boot-spawned.
 *   2. memory-extractor is boot-spawned.
 *   3. Other bundled extensions WITHOUT `bootSpawn` are NOT spawned
 *      at boot (regression guard — we don't want to suddenly auto-
 *      spawn manual-trigger extensions).
 *   4. A spawn failure for one entry does NOT prevent another flagged
 *      entry from booting (try/catch'd correctly).
 *   5. RPC wiring is invoked alongside spawn (otherwise reverse-RPC
 *      methods like `ezcorp/memory` would error "Method not found"
 *      when memory-extractor's handler runs).
 *   6. A disabled DB row is skipped (operator opt-out is respected).
 *   7. A missing DB row is skipped + logged (degraded but does not
 *      throw — the next boot retries).
 */

import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { restoreModuleMocks } from "./helpers/mock-cleanup";
import type { ExtensionRegistry } from "../extensions/registry";
import type { ExtensionProcess } from "../extensions/subprocess";
import type { ExtensionPermissions } from "../extensions/types";

// ── DB mock — extension store keyed by manifest name ────────────────

interface StoredExtension {
  id: string;
  name: string;
  enabled: boolean;
  manifest?: unknown;
  installPath?: string;
  isBundled?: boolean;
  grantedPermissions?: ExtensionPermissions;
}

let store: Map<string, StoredExtension>;

mock.module("../db/queries/extensions", () => ({
  getExtensionByName: async (name: string) => store.get(name) ?? null,
  updateExtension: async () => null,
  listExtensions: async () => Array.from(store.values()),
}));

afterAll(() => restoreModuleMocks());

beforeEach(() => {
  store = new Map();
});

// ── Lazy import after mocks ─────────────────────────────────────────

const { bootSpawnFlaggedBundledExtensions } = await import("../extensions/bundled");

// ── Registry stub — captures `getProcess` calls ─────────────────────

interface SpawnCall {
  extensionId: string;
}

function makeRegistry(opts: {
  failOn?: Set<string>;
} = {}): {
  spawnCalls: SpawnCall[];
  registry: ExtensionRegistry;
} {
  const spawnCalls: SpawnCall[] = [];
  const registry = {
    async getProcess(extensionId: string): Promise<ExtensionProcess> {
      spawnCalls.push({ extensionId });
      if (opts.failOn?.has(extensionId)) {
        throw new Error(`spawn refused for ${extensionId}`);
      }
      // Minimal ExtensionProcess stub — only `extensionId` is read by
      // the wireRpc callback in production. The dispatcher path uses
      // sendNotification + isRunning, which the run-complete-dispatch
      // integration test exercises separately. Cast through `unknown`
      // because ExtensionProcess has private fields we don't simulate.
      return { extensionId, isRunning: true } as unknown as ExtensionProcess;
    },
  } as unknown as ExtensionRegistry;
  return { spawnCalls, registry };
}

function makeWireRpc() {
  const calls: Array<{ extensionId: string }> = [];
  const fn = async (extensionId: string, _proc: ExtensionProcess) => {
    calls.push({ extensionId });
  };
  return { calls, fn };
}

// ── Tests ───────────────────────────────────────────────────────────

describe("bootSpawnFlaggedBundledExtensions", () => {
  test("spawns lessons-distiller when its DB row is enabled", async () => {
    // Populate BOTH flagged rows so the test isolates "lessons-distiller
    // got spawned" from the orthogonal "memory-extractor row missing"
    // signal. Each row is checked independently in the helper.
    store.set("lessons-distiller", {
      id: "ext-lessons",
      name: "lessons-distiller",
      enabled: true,
    });
    store.set("memory-extractor", {
      id: "ext-memory",
      name: "memory-extractor",
      enabled: true,
    });

    const { spawnCalls, registry } = makeRegistry();
    const { calls: wireCalls, fn: wireRpc } = makeWireRpc();

    const result = await bootSpawnFlaggedBundledExtensions(registry, wireRpc);

    expect(spawnCalls.map((c) => c.extensionId)).toContain("ext-lessons");
    expect(wireCalls.map((c) => c.extensionId)).toContain("ext-lessons");
    expect(result.spawned).toContain("lessons-distiller");
    expect(result.failed).toEqual([]);
  });

  test("spawns memory-extractor when its DB row is enabled", async () => {
    store.set("lessons-distiller", {
      id: "ext-lessons",
      name: "lessons-distiller",
      enabled: true,
    });
    store.set("memory-extractor", {
      id: "ext-memory",
      name: "memory-extractor",
      enabled: true,
    });

    const { spawnCalls, registry } = makeRegistry();
    const { calls: wireCalls, fn: wireRpc } = makeWireRpc();

    const result = await bootSpawnFlaggedBundledExtensions(registry, wireRpc);

    expect(spawnCalls.map((c) => c.extensionId)).toContain("ext-memory");
    expect(wireCalls.map((c) => c.extensionId)).toContain("ext-memory");
    expect(result.spawned).toContain("memory-extractor");
    expect(result.failed).toEqual([]);
  });

  test("spawns BOTH flagged extensions when both rows exist", async () => {
    store.set("lessons-distiller", {
      id: "ext-lessons",
      name: "lessons-distiller",
      enabled: true,
    });
    store.set("memory-extractor", {
      id: "ext-memory",
      name: "memory-extractor",
      enabled: true,
    });

    const { spawnCalls, registry } = makeRegistry();
    const { fn: wireRpc } = makeWireRpc();

    const result = await bootSpawnFlaggedBundledExtensions(registry, wireRpc);

    const ids = spawnCalls.map((c) => c.extensionId).sort();
    expect(ids).toEqual(["ext-lessons", "ext-memory"]);
    expect(result.spawned.sort()).toEqual([
      "lessons-distiller",
      "memory-extractor",
    ]);
  });

  test("does NOT spawn bundled extensions WITHOUT bootSpawn (regression guard)", async () => {
    // Populate every bundled extension's DB row, including the
    // manual-trigger / on-mention-wired ones that MUST stay lazy.
    const allBundled = [
      "lessons-distiller",
      "memory-extractor",
      "scratchpad",
      "task-tracking",
      "orchestration",
      "ask-user",
      "project-analyzer",
      "markdown-utils",
      "code-review-delegator",
      "github-stats",
      "multi-agent-orchestrator",
      "research-agent",
      "file-refactor",
      "log-analyzer",
      "todo-tracker",
      "task-stack",
      "ai-kit",
      "web-search",
      "openai-image-gen-2",
      "property-intelligence-agent",
      "claude-design",
      "excel",
      "kokoro-tts",
    ];
    for (const name of allBundled) {
      store.set(name, { id: `ext-${name}`, name, enabled: true });
    }

    const { spawnCalls, registry } = makeRegistry();
    const { fn: wireRpc } = makeWireRpc();

    const result = await bootSpawnFlaggedBundledExtensions(registry, wireRpc);

    // Only the two flagged extensions should have been spawned.
    const spawnedIds = spawnCalls.map((c) => c.extensionId).sort();
    expect(spawnedIds).toEqual(["ext-lessons-distiller", "ext-memory-extractor"]);
    expect(result.spawned.sort()).toEqual([
      "lessons-distiller",
      "memory-extractor",
    ]);
    // Specifically: scratchpad / task-tracking / orchestration / ai-kit
    // must NOT be in the spawn list. They have explicit manual triggers
    // or wire-on-first-use semantics; auto-spawning them at boot would
    // change behaviour for every install.
    for (const lazyName of ["scratchpad", "task-tracking", "orchestration", "ai-kit"]) {
      expect(result.spawned).not.toContain(lazyName);
    }
  });

  test("a spawn failure for one entry does not block others", async () => {
    store.set("lessons-distiller", {
      id: "ext-lessons",
      name: "lessons-distiller",
      enabled: true,
    });
    store.set("memory-extractor", {
      id: "ext-memory",
      name: "memory-extractor",
      enabled: true,
    });

    const { spawnCalls, registry } = makeRegistry({
      failOn: new Set(["ext-lessons"]),
    });
    const { calls: wireCalls, fn: wireRpc } = makeWireRpc();

    const result = await bootSpawnFlaggedBundledExtensions(registry, wireRpc);

    // Both spawns were attempted; one failed.
    expect(spawnCalls.map((c) => c.extensionId).sort()).toEqual([
      "ext-lessons",
      "ext-memory",
    ]);
    // RPC wiring only ran for the surviving spawn.
    expect(wireCalls).toEqual([{ extensionId: "ext-memory" }]);
    expect(result.spawned).toEqual(["memory-extractor"]);
    expect(result.failed).toEqual(["lessons-distiller"]);
  });

  test("disabled DB row is skipped (no spawn, no failure)", async () => {
    store.set("lessons-distiller", {
      id: "ext-lessons",
      name: "lessons-distiller",
      enabled: false, // operator-disabled
    });
    store.set("memory-extractor", {
      id: "ext-memory",
      name: "memory-extractor",
      enabled: true,
    });

    const { spawnCalls, registry } = makeRegistry();
    const { fn: wireRpc } = makeWireRpc();

    const result = await bootSpawnFlaggedBundledExtensions(registry, wireRpc);

    expect(spawnCalls.map((c) => c.extensionId)).toEqual(["ext-memory"]);
    expect(result.spawned).toEqual(["memory-extractor"]);
    // Disabled is not a failure — operator opt-out is respected.
    // Only the missing/spawn-error paths populate `failed[]`. A
    // disabled row produces no entry on either list.
    expect(result.failed).toEqual([]);
    expect(result.spawned).not.toContain("lessons-distiller");
  });

  test("missing DB row is recorded in failed[] (install must have failed earlier)", async () => {
    // Neither flagged extension has a DB row — `ensureBundledExtensions`
    // must have errored on install. Boot-spawn degrades gracefully.
    const { spawnCalls, registry } = makeRegistry();
    const { fn: wireRpc } = makeWireRpc();

    const result = await bootSpawnFlaggedBundledExtensions(registry, wireRpc);

    expect(spawnCalls).toEqual([]);
    expect(result.spawned).toEqual([]);
    expect(result.failed.sort()).toEqual([
      "lessons-distiller",
      "memory-extractor",
    ]);
  });

  test("RPC wiring is invoked AFTER spawn for each successful entry", async () => {
    // Asserts the ordering invariant: getProcess must complete before
    // ensureSubprocessRpcWired runs (the latter receives the proc handle
    // returned by the former).
    store.set("lessons-distiller", {
      id: "ext-lessons",
      name: "lessons-distiller",
      enabled: true,
    });

    const order: string[] = [];
    const registry = {
      async getProcess(extensionId: string): Promise<ExtensionProcess> {
        order.push(`spawn:${extensionId}`);
        return { extensionId, isRunning: true } as unknown as ExtensionProcess;
      },
    } as unknown as ExtensionRegistry;
    const wireRpc = async (extensionId: string, _proc: ExtensionProcess) => {
      order.push(`wire:${extensionId}`);
    };

    await bootSpawnFlaggedBundledExtensions(registry, wireRpc);

    expect(order).toEqual(["spawn:ext-lessons", "wire:ext-lessons"]);
  });
});
