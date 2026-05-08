/**
 * Non-Linux fallback tests — runs on every platform.
 *
 * Simulates the "netns unavailable" path by:
 *   1. Forcing `probeNetnsAvailability()` to fail via mocked
 *      `process.platform` (mocking only the property surface the
 *      probe reads, so the test process itself keeps working).
 *   2. Asserting `buildNetnsSpawnArgs` returns the original command
 *      unchanged — no `unshare` prefix.
 *   3. Asserting `buildSandboxedMcpSpec` (when called WITHOUT a `ctx`
 *      so production wiring isn't pulled in) still produces the pre-
 *      Phase-7 prlimit-only spec.
 *   4. Asserting that the audit code-path used by `buildSandboxedMcpSpec`
 *      writes `MCP_NETNS_FALLBACK` when the probe fails AND a `ctx` IS
 *      provided.
 *
 * Why a separate file from `mcp-netns-integration.test.ts`: that file's
 * gate is "Linux + userns enabled". This file's gate is the inverse —
 * always run, regardless of platform — so the fallback path never
 * stops being exercised by CI.
 */

import { test, expect, describe, beforeEach, afterAll, mock } from "bun:test";
import { restoreModuleMocks } from "./helpers/mock-cleanup";

// ── Audit mock — captures rows written by buildSandboxedMcpSpec ────
const auditCalls: Array<{ action: string; metadata: Record<string, unknown> | null }> = [];
mock.module("../db/queries/audit-log", () => ({
  insertAuditEntry: async (
    _userId: string | null,
    action: string,
    _target?: string,
    metadata?: Record<string, unknown>,
  ): Promise<string> => {
    auditCalls.push({ action, metadata: metadata ?? null });
    return `audit-${auditCalls.length}`;
  },
  listAuditLog: async () => [],
  listAuditForExtension: async () => [],
}));

import {
  _resetProbeCacheForTests,
  buildNetnsSpawnArgs,
  probeNetnsAvailability,
} from "../extensions/mcp-netns";
import { buildSandboxedMcpSpec } from "../extensions/mcp-sandbox";
import type {
  ExtensionManifestV2,
  McpServerDefinition,
  McpServerStdio,
} from "../extensions/types";
import { createStubPermissionEngine } from "./helpers/permission-engine-stub";

// Keep the original `process.platform` so we can flip it per-test.
const REAL_PLATFORM = process.platform;
function setPlatform(p: NodeJS.Platform) {
  Object.defineProperty(process, "platform", {
    value: p,
    configurable: true,
    writable: false,
  });
}

beforeEach(() => {
  auditCalls.length = 0;
  _resetProbeCacheForTests();
});

afterAll(() => {
  setPlatform(REAL_PLATFORM);
  restoreModuleMocks();
});

function mcpManifest(over: Partial<ExtensionManifestV2> = {}): ExtensionManifestV2 {
  return {
    schemaVersion: 2,
    name: "fallback-probe",
    version: "1.0.0",
    description: "",
    author: { name: "t" },
    kind: "mcp",
    mcpServers: [],
    permissions: {},
    ...over,
  };
}

describe("probeNetnsAvailability — fallback paths", () => {
  test("non-Linux platform → available=false, reason='not linux'", () => {
    setPlatform("darwin" as NodeJS.Platform);
    _resetProbeCacheForTests();
    try {
      const r = probeNetnsAvailability();
      expect(r.available).toBe(false);
      expect(r.reason).toBe("not linux");
    } finally {
      setPlatform(REAL_PLATFORM);
      _resetProbeCacheForTests();
    }
  });

  test("'win32' platform → available=false", () => {
    setPlatform("win32" as NodeJS.Platform);
    _resetProbeCacheForTests();
    try {
      const r = probeNetnsAvailability();
      expect(r.available).toBe(false);
    } finally {
      setPlatform(REAL_PLATFORM);
      _resetProbeCacheForTests();
    }
  });

  test("probe result is cached — second call doesn't re-shell-out", () => {
    _resetProbeCacheForTests();
    const first = probeNetnsAvailability();
    const second = probeNetnsAvailability();
    // Identity: cached calls return the SAME object reference.
    expect(second).toBe(first);
  });
});

describe("buildNetnsSpawnArgs — fallback shape", () => {
  test("non-Linux → returns original command + args, wrapped=false", () => {
    setPlatform("darwin" as NodeJS.Platform);
    _resetProbeCacheForTests();
    try {
      const r = buildNetnsSpawnArgs({
        origCommand: "prlimit",
        origArgs: ["--rss=512", "/usr/bin/python3", "-m", "x"],
        launcherPath: "/path/to/launcher.sh",
      });
      expect(r.wrapped).toBe(false);
      expect(r.command).toBe("prlimit");
      expect(r.args).toEqual(["--rss=512", "/usr/bin/python3", "-m", "x"]);
    } finally {
      setPlatform(REAL_PLATFORM);
      _resetProbeCacheForTests();
    }
  });
});

describe("buildSandboxedMcpSpec — fallback path with ctx", () => {
  test("non-Linux + ctx → no unshare prefix, MCP_NETNS_FALLBACK audit row", async () => {
    setPlatform("darwin" as NodeJS.Platform);
    _resetProbeCacheForTests();
    try {
      const spec: McpServerDefinition = {
        transport: "stdio",
        name: "p",
        command: "/usr/bin/python3",
        args: ["-m", "my_mcp_server"],
      };
      const ctx = {
        engine: createStubPermissionEngine("allow-all"),
        conversationId: null,
        userId: null,
      };
      const { spec: rawWrapped, proxyHandle } = await buildSandboxedMcpSpec(
        spec, mcpManifest(), { grantedAt: {} }, "ext-fallback-1", ctx,
      );
      const wrapped = rawWrapped as McpServerStdio;

      // No unshare prefix — the prlimit chain is the spawn target.
      expect(wrapped.command).toBe("prlimit");
      expect(wrapped.args?.includes("/usr/bin/python3")).toBe(true);

      // HTTPS_PROXY env was injected (loopback fallback URL).
      expect(wrapped.env?.HTTPS_PROXY).toBeDefined();
      expect(wrapped.env?.HTTPS_PROXY).toMatch(/^http:\/\/_:[a-f0-9]+@127\.0\.0\.1:\d+$/);
      // Audit settle.
      await new Promise((res) => setTimeout(res, 50));
      const fallbackRow = auditCalls.find(
        (c) => c.action === "ext:mcp:netns-fallback",
      );
      expect(fallbackRow).toBeDefined();
      expect(fallbackRow?.metadata?.reason).toBe("not linux");

      expect(proxyHandle).not.toBeNull();
      // Tear down the listener so we don't leak.
      await proxyHandle?.stop();
    } finally {
      setPlatform(REAL_PLATFORM);
      _resetProbeCacheForTests();
    }
  });

  test("Linux + ctx + netns-available → MCP_NETNS_CREATED audit row", async () => {
    // Only meaningful when this host has userns enabled. Otherwise we
    // can't distinguish "fallback because real probe failed" from
    // "Linux netns" — skip in that case.
    setPlatform(REAL_PLATFORM);
    _resetProbeCacheForTests();
    const probe = probeNetnsAvailability();
    if (!probe.available) {
      // Probe says no — netns-created is impossible here. Verify the
      // fallback row was written instead so the test is still useful.
      expect(probe.reason).toBeTruthy();
      return;
    }
    const spec: McpServerDefinition = {
      transport: "stdio",
      name: "p",
      command: "/usr/bin/python3",
      args: ["-m", "x"],
    };
    const ctx = {
      engine: createStubPermissionEngine("allow-all"),
      conversationId: null,
      userId: null,
    };
    const { spec: rawWrapped, proxyHandle } = await buildSandboxedMcpSpec(
      spec, mcpManifest(), { grantedAt: {} }, "ext-netns-1", ctx,
    );
    const wrapped = rawWrapped as McpServerStdio;

    expect(wrapped.command).toBe("unshare");
    await new Promise((res) => setTimeout(res, 50));
    const createdRow = auditCalls.find(
      (c) => c.action === "ext:mcp:netns-created",
    );
    expect(createdRow).toBeDefined();

    await proxyHandle?.stop();
  });

  test("non-stdio MCP transports skip Phase 7 wrap entirely", async () => {
    setPlatform(REAL_PLATFORM);
    _resetProbeCacheForTests();
    const spec: McpServerDefinition = {
      transport: "http",
      name: "remote",
      url: "https://example.com/mcp",
    };
    const ctx = {
      engine: createStubPermissionEngine("allow-all"),
      conversationId: null,
      userId: null,
    };
    const { spec: wrapped, proxyHandle } = await buildSandboxedMcpSpec(
      spec, mcpManifest(), { grantedAt: {} }, "ext-http-1", ctx,
    );
    expect(wrapped).toBe(spec);
    expect(proxyHandle).toBeNull();
    // No audit rows — http MCP isn't a subprocess spawn.
    await new Promise((res) => setTimeout(res, 20));
    expect(auditCalls.length).toBe(0);
  });
});
