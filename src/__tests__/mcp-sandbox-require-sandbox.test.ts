/**
 * EZCORP_MCP_REQUIRE_SANDBOX — fail-closed sandbox enforcement tests.
 *
 * Pre-launch security finding: every fallback point in
 * `buildSandboxedMcpSpec` (netns probe failure, missing bwrap, Stage 2
 * veth/nft setup failure, Stage 1/2 kill-switches) FAILED OPEN — the
 * spawn proceeded at a weaker isolation stage with only a
 * fire-and-forget MCP_NETNS_FALLBACK audit row.
 *
 * Contract under test:
 *   - flag unset / not "1": behavior is EXACTLY the pre-flag fail-open
 *     degrade (spawn proceeds, fallback audit rows fire, no refusal)
 *   - flag === "1": ANY spawn that would degrade below full isolation
 *     (no-ctx prlimit-only leg, netns probe, bwrap probe, Stage 1/2
 *     kill-switches, veth capability probe, seccomp BPF blob missing,
 *     veth slot exhaustion, veth create / bridge-attach runtime
 *     failures) is REFUSED with an operator-actionable error naming
 *     the missing capability + the flag, plus one
 *     MCP_SANDBOX_REQUIRED_REFUSAL audit row
 *   - flag === "1" on a fully capable host: spawn proceeds normally
 *
 * The kernel probes shell out to the host, so `../extensions/mcp-netns`
 * is module-mocked (same pattern as preview-netns.test.ts) to drive
 * every capability branch deterministically on any host. The `ip`
 * runtime commands inside the veth-setup block go through a
 * `spyOn(Bun, "spawnSync")` seam (same pattern as the l5 oauth test's
 * `spyOn(Bun, "spawn")`).
 */

import { test, expect, describe, beforeEach, afterAll, mock, spyOn } from "bun:test";
import { openSync, closeSync } from "node:fs";
import { restoreModuleMocks } from "./helpers/mock-cleanup";

// ── Audit mock — captures rows written by buildSandboxedMcpSpec ────
const auditCalls: Array<{
  userId: string | null;
  action: string;
  metadata: Record<string, unknown> | null;
}> = [];
mock.module("../db/queries/audit-log", () => ({
  insertAuditEntry: async (
    userId: string | null,
    action: string,
    _target?: string,
    metadata?: Record<string, unknown>,
  ): Promise<string> => {
    auditCalls.push({ userId, action, metadata: metadata ?? null });
    return `audit-${auditCalls.length}`;
  },
  listAuditLog: async () => [],
  listAuditForExtension: async () => [],
}));

// ── mcp-netns mock — controllable capability state ─────────────────
// Covers every export consumed by the import graph under test
// (mcp-sandbox: probes + spawn-arg builder + veth allocator;
// registry: releaseVethSlot + initStage2).
const state = {
  netnsAvailable: true,
  netnsReason: undefined as string | undefined,
  bwrapAvailable: true,
  bwrapReason: undefined as string | undefined,
  vethAvailable: true,
  vethReason: undefined as string | undefined,
  slot: 1 as number | null,
  seccompFd: null as number | null,
  releasedSlots: [] as number[],
};

function resetState(): void {
  state.netnsAvailable = true;
  state.netnsReason = undefined;
  state.bwrapAvailable = true;
  state.bwrapReason = undefined;
  state.vethAvailable = true;
  state.vethReason = undefined;
  state.slot = 1;
  state.seccompFd = null;
  state.releasedSlots = [];
}

mock.module("../extensions/mcp-netns", () => ({
  probeNetnsAvailability: () =>
    state.netnsAvailable
      ? { available: true }
      : { available: false, reason: state.netnsReason },
  probeBwrapAvailability: () =>
    state.bwrapAvailable
      ? { available: true }
      : { available: false, reason: state.bwrapReason },
  probeVethCapability: () =>
    state.vethAvailable
      ? { available: true }
      : { available: false, reason: state.vethReason },
  buildNetnsSpawnArgs: (input: {
    origCommand: string;
    origArgs: readonly string[];
    launcherPath: string;
  }) =>
    state.netnsAvailable
      ? {
          command: "unshare",
          args: [
            "-U",
            "-m",
            "--map-root-user",
            "--",
            input.launcherPath,
            input.origCommand,
            ...input.origArgs,
          ],
          wrapped: true,
          bwrapAvailable: state.bwrapAvailable,
          bwrapReason: state.bwrapReason,
          tmpfsKillSwitchActive: process.env.EZCORP_MCP_STAGE1_TMPFS === "0",
          seccompFd: state.seccompFd,
          seccompKillSwitchActive: process.env.EZCORP_MCP_STAGE1_SECCOMP === "0",
        }
      : {
          command: input.origCommand,
          args: [...input.origArgs],
          wrapped: false,
          bwrapAvailable: state.bwrapAvailable,
          bwrapReason: state.bwrapReason,
          tmpfsKillSwitchActive: process.env.EZCORP_MCP_STAGE1_TMPFS === "0",
          seccompFd: state.seccompFd,
          seccompKillSwitchActive: process.env.EZCORP_MCP_STAGE1_SECCOMP === "0",
        },
  getDefaultLauncherPath: () => "/fake/mcp-launcher.sh",
  allocVethSlot: () => state.slot,
  releaseVethSlot: (slot: number) => {
    state.releasedSlots.push(slot);
  },
  computeVethMcpIp: (slot: number) => `10.42.0.${slot * 4 + 2}/30`,
  computeVethBridgeIp: (slot: number) => `10.42.0.${slot * 4 + 1}/30`,
  initStage2: async () => ({ ok: true }),
  isStage2DegradedAtBoot: () => false,
}));

import {
  buildSandboxedMcpSpec,
  _setConntrackOverridesForTests,
} from "../extensions/mcp-sandbox";
import { EXT_AUDIT_ACTIONS } from "../extensions/audit-actions";
import type {
  ExtensionManifestV2,
  McpServerDefinition,
  McpServerStdio,
} from "../extensions/types";
import { createStubPermissionEngine } from "./helpers/permission-engine-stub";

const REFUSAL_ACTION = EXT_AUDIT_ACTIONS.MCP_SANDBOX_REQUIRED_REFUSAL;

// ── Env hygiene — save / restore everything the gate reads ─────────
const ENV_KEYS = [
  "EZCORP_MCP_REQUIRE_SANDBOX",
  "EZCORP_MCP_STAGE1_TMPFS",
  "EZCORP_MCP_STAGE1_SECCOMP",
  "EZCORP_MCP_STAGE2_VETH",
] as const;
const savedEnv: Record<string, string | undefined> = {};
for (const k of ENV_KEYS) savedEnv[k] = process.env[k];

beforeEach(() => {
  auditCalls.length = 0;
  resetState();
  for (const k of ENV_KEYS) delete process.env[k];
  // Skip the conntrack pressure pre-check deterministically.
  _setConntrackOverridesForTests({ exists: () => false });
});

afterAll(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  _setConntrackOverridesForTests(null);
  restoreModuleMocks();
});

function mcpManifest(): ExtensionManifestV2 {
  return {
    schemaVersion: 2,
    name: "require-sandbox-probe",
    version: "1.0.0",
    description: "",
    author: { name: "t" },
    kind: "mcp",
    mcpServers: [],
    permissions: {},
  };
}

function stdioSpec(): McpServerDefinition {
  return {
    transport: "stdio",
    name: "p",
    command: "/usr/bin/python3",
    args: ["-m", "my_mcp_server"],
  };
}

function makeCtx() {
  return {
    engine: createStubPermissionEngine("allow-all"),
    conversationId: null,
    userId: "user-rs-1",
  };
}

function build(extensionId: string, withCtx = true) {
  return buildSandboxedMcpSpec(
    stdioSpec(),
    mcpManifest(),
    { grantedAt: {} },
    extensionId,
    withCtx ? makeCtx() : undefined,
  );
}

function refusalRows() {
  return auditCalls.filter((c) => c.action === REFUSAL_ACTION);
}

/** Fake the `ip ...` invocations inside the veth-setup block; every
 *  other Bun.spawnSync call falls through to the real implementation. */
function fakeIpSpawnSync(
  decide: (cmd: string[]) => { success: boolean; exitCode: number; stderr?: string },
) {
  const real = Bun.spawnSync.bind(Bun);
  return spyOn(Bun, "spawnSync").mockImplementation(((
    ...args: Parameters<typeof Bun.spawnSync>
  ) => {
    const opts = args[0] as { cmd?: string[] };
    if (Array.isArray(opts?.cmd) && opts.cmd[0] === "ip") {
      const r = decide(opts.cmd);
      return {
        success: r.success,
        exitCode: r.exitCode,
        stderr: new TextEncoder().encode(r.stderr ?? ""),
        stdout: new Uint8Array(),
      } as unknown as ReturnType<typeof Bun.spawnSync>;
    }
    return real(...args);
  }) as typeof Bun.spawnSync);
}

// ─────────────────────────────────────────────────────────────────────
describe("flag off — existing fail-open behavior preserved", () => {
  test("netns unavailable → spawn proceeds with prlimit fallback + MCP_NETNS_FALLBACK, no refusal", async () => {
    state.netnsAvailable = false;
    state.netnsReason = "not linux";
    const { spec, proxyHandle } = await build("ext-rs-off-1");
    const wrapped = spec as McpServerStdio;

    expect(wrapped.command).toBe("prlimit");
    expect(wrapped.env?.HTTPS_PROXY).toBeDefined();
    const fallback = auditCalls.find(
      (c) => c.action === EXT_AUDIT_ACTIONS.MCP_NETNS_FALLBACK,
    );
    expect(fallback).toBeDefined();
    expect(fallback?.metadata?.reason).toBe("not linux");
    expect(refusalRows()).toHaveLength(0);

    await proxyHandle?.stop();
  });

  test("bwrap unavailable → spawn proceeds at Stage 1 + 'bubblewrap unavailable' fallback row, no refusal", async () => {
    state.bwrapAvailable = false;
    state.bwrapReason = "missing binary: bwrap";
    state.vethAvailable = false; // keep the real `ip` commands out of the path
    const { spec, proxyHandle } = await build("ext-rs-off-2");
    const wrapped = spec as McpServerStdio;

    expect(wrapped.command).toBe("unshare");
    const bwrapRow = auditCalls.find(
      (c) =>
        c.action === EXT_AUDIT_ACTIONS.MCP_NETNS_FALLBACK &&
        c.metadata?.reason === "bubblewrap unavailable",
    );
    expect(bwrapRow).toBeDefined();
    expect(bwrapRow?.metadata?.bwrapReason).toBe("missing binary: bwrap");
    expect(refusalRows()).toHaveLength(0);

    await proxyHandle?.stop();
  });

  test("flag set to a non-'1' value behaves as off (degraded spawn proceeds)", async () => {
    process.env.EZCORP_MCP_REQUIRE_SANDBOX = "0";
    state.netnsAvailable = false;
    state.netnsReason = "unshare probe exited 1";
    const { spec, proxyHandle } = await build("ext-rs-off-3");

    expect((spec as McpServerStdio).command).toBe("prlimit");
    expect(refusalRows()).toHaveLength(0);

    await proxyHandle?.stop();
  });
});

// ─────────────────────────────────────────────────────────────────────
describe("flag on — degraded host is refused", () => {
  beforeEach(() => {
    process.env.EZCORP_MCP_REQUIRE_SANDBOX = "1";
  });

  test("ctx omitted (prlimit-only back-compat leg) → refused", async () => {
    await expect(build("ext-rs-noctx", false)).rejects.toThrow(
      /EZCORP_MCP_REQUIRE_SANDBOX=1.*PermissionEngine ctx/,
    );
    const rows = refusalRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.userId).toBeNull();
    expect(rows[0]?.metadata?.requiredCapability).toContain("PermissionEngine");
  });

  test("netns unavailable → refused naming unshare + the flag; no fallback row", async () => {
    state.netnsAvailable = false;
    state.netnsReason = "kernel.unprivileged_userns_clone=0";
    await expect(build("ext-rs-netns")).rejects.toThrow(
      /EZCORP_MCP_REQUIRE_SANDBOX=1.*user\+mount namespace isolation \(unshare\).*kernel\.unprivileged_userns_clone=0/,
    );
    const rows = refusalRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.metadata?.reason).toBe("kernel.unprivileged_userns_clone=0");
    expect(rows[0]?.metadata?.extensionName).toBe("require-sandbox-probe");
    // Refusal short-circuits BEFORE the netns audit row + proxy start.
    expect(
      auditCalls.find((c) => c.action === EXT_AUDIT_ACTIONS.MCP_NETNS_FALLBACK),
    ).toBeUndefined();
  });

  test("bwrap unavailable → refused naming bubblewrap", async () => {
    state.bwrapAvailable = false;
    state.bwrapReason = "missing binary: bwrap";
    await expect(build("ext-rs-bwrap")).rejects.toThrow(
      /bubblewrap tmpfs sandbox \(bwrap\).*missing binary: bwrap/,
    );
    expect(refusalRows()[0]?.metadata?.reason).toBe("missing binary: bwrap");
  });

  test("veth capability unavailable → refused naming Stage 2 / CAP_NET_ADMIN", async () => {
    state.vethAvailable = false;
    state.vethReason = "stage2 degraded at boot";
    await expect(build("ext-rs-vethcap")).rejects.toThrow(
      /Stage 2 veth network isolation \(ip\/nft\/CAP_NET_ADMIN\).*stage2 degraded at boot/,
    );
    expect(refusalRows()[0]?.metadata?.reason).toBe("stage2 degraded at boot");
  });

  const KILL_SWITCHES: Array<{ env: string; capability: RegExp }> = [
    { env: "EZCORP_MCP_STAGE1_TMPFS", capability: /bubblewrap tmpfs sandbox/ },
    { env: "EZCORP_MCP_STAGE1_SECCOMP", capability: /seccomp BPF syscall filter/ },
    { env: "EZCORP_MCP_STAGE2_VETH", capability: /Stage 2 veth network isolation/ },
  ];
  for (const ks of KILL_SWITCHES) {
    test(`${ks.env}=0 kill-switch contradicts the flag → refused`, async () => {
      process.env[ks.env] = "0";
      await expect(build(`ext-rs-${ks.env}`)).rejects.toThrow(ks.capability);
      const rows = refusalRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.metadata?.reason).toBe(`kill-switch active: ${ks.env}=0`);
    });
  }

  test("seccomp BPF blob missing (seccompFd null) → refused after proxy teardown", async () => {
    state.seccompFd = null; // dev host: mcp-seccomp.bpf absent
    await expect(build("ext-rs-seccomp-blob")).rejects.toThrow(
      /seccomp BPF syscall filter.*mcp-seccomp\.bpf absent or unreadable/,
    );
    const rows = refusalRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.metadata?.requiredCapability).toBe("seccomp BPF syscall filter");
  });

  test("veth slot exhausted → refused; opened seccomp FD is closed", async () => {
    state.slot = null;
    const fd = openSync("/dev/null", "r");
    state.seccompFd = fd;
    try {
      await expect(build("ext-rs-slot")).rejects.toThrow(
        /Stage 2 veth network isolation.*veth slot exhausted \(60 concurrent MCP cap\)/,
      );
      // The fail-closed teardown closed the FD — closing again must fail.
      expect(() => closeSync(fd)).toThrow();
    } finally {
      try {
        closeSync(fd);
      } catch {
        /* already closed by the guard — expected */
      }
    }
    expect(refusalRows()[0]?.metadata?.reason).toBe(
      "veth slot exhausted (60 concurrent MCP cap)",
    );
  });

  test("veth pair create fails at runtime → refused with the ip stderr", async () => {
    const fd = openSync("/dev/null", "r");
    state.seccompFd = fd;
    const spy = fakeIpSpawnSync(() => ({
      success: false,
      exitCode: 2,
      stderr: "RTNETLINK answers: Operation not permitted",
    }));
    try {
      await expect(build("ext-rs-veth-create")).rejects.toThrow(
        /veth pair create failed: RTNETLINK answers: Operation not permitted/,
      );
    } finally {
      spy.mockRestore();
      try {
        closeSync(fd);
      } catch {
        /* already closed by the guard — expected */
      }
    }
    expect(state.releasedSlots).toEqual([1]);
    expect(refusalRows()).toHaveLength(1);
  });

  test("bridge attach fails at runtime → refused naming the bridge", async () => {
    const fd = openSync("/dev/null", "r");
    state.seccompFd = fd;
    const spy = fakeIpSpawnSync((cmd) =>
      cmd.includes("master")
        ? { success: false, exitCode: 1, stderr: "Cannot find device br-ezcorp-mcp" }
        : { success: true, exitCode: 0 },
    );
    try {
      await expect(build("ext-rs-veth-attach")).rejects.toThrow(
        /veth bridge attach\/up failed \(br-ezcorp-mcp missing or down\)/,
      );
    } finally {
      spy.mockRestore();
      try {
        closeSync(fd);
      } catch {
        /* already closed by the guard — expected */
      }
    }
    expect(state.releasedSlots).toEqual([1]);
    expect(refusalRows()).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────
describe("flag on — fully capable host spawns normally", () => {
  test("all isolation legs available → spec built, no refusal row", async () => {
    process.env.EZCORP_MCP_REQUIRE_SANDBOX = "1";
    const fd = openSync("/dev/null", "r");
    state.seccompFd = fd;
    const spy = fakeIpSpawnSync(() => ({ success: true, exitCode: 0 }));
    try {
      const { spec, proxyHandle } = await build("ext-rs-full");
      const wrapped = spec as McpServerStdio;

      expect(wrapped.command).toBe("unshare");
      expect(wrapped.env?.EZCORP_MCP_BWRAP_ENABLED).toBe("1");
      expect(wrapped.env?.EZCORP_MCP_BWRAP_SECCOMP_FD).toBe("3");
      expect(wrapped.env?.EZCORP_MCP_STAGE2_VETH_ENABLED).toBe("1");
      expect(wrapped.seccompFd).toBe(fd);
      expect(wrapped._internal_vethSetup).not.toBeNull();

      expect(refusalRows()).toHaveLength(0);
      expect(
        auditCalls.find((c) => c.action === EXT_AUDIT_ACTIONS.MCP_NETNS_CREATED),
      ).toBeDefined();
      expect(
        auditCalls.find((c) => c.action === EXT_AUDIT_ACTIONS.MCP_VETH_CREATED),
      ).toBeDefined();

      await proxyHandle?.stop();
    } finally {
      spy.mockRestore();
      try {
        closeSync(fd);
      } catch {
        /* attached FDs stay open until the spawn caller closes them */
      }
    }
  });
});
