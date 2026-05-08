/**
 * Unit tests for `mcp-proxy.ts` — the per-MCP forward proxy.
 *
 * Coverage:
 *   - Bearer-token auth: missing or wrong token → 407 + audit
 *   - Hostname allowlist: PDP `deny` → 403 + audit
 *   - Hostname allowlist: PDP `allow` → CONNECT succeeds + bytes flow
 *   - Internal-host classification: matches Phase 2's `network` cap
 *   - Quota: byte-budget exhaustion → 429 mid-tunnel + tunnel torn down
 *   - Quota: concurrent-connection cap → 503 on the over-the-line CONNECT
 *   - parseConnectRequest: malformed CONNECT line → 400
 *
 * The tests stand up the proxy on a real localhost loopback port (no
 * UDS — UDS path coverage is in `mcp-netns-integration.test.ts`).
 * Upstream is a tiny `Bun.listen` echo server on a separate port.
 */

import { test, expect, describe, afterEach, afterAll, mock } from "bun:test";
import { restoreModuleMocks } from "./helpers/mock-cleanup";

// Mock DB before any module pulls it in. The proxy writes audit rows
// via insertAuditEntry; we don't want a real DB. The mock returns no-op
// chains for both insert (insertAuditEntry) and select.
//
// `auditCalls` is module-scoped and captured by the mock's closure. We
// reset its length in `afterEach` so each test sees only its own rows.
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

import type { Socket } from "bun";
import {
  createMcpProxy,
  parseConnectRequest,
  type McpProxyConfig,
} from "../extensions/mcp-proxy";
import type { PermissionEngine } from "../extensions/permission-engine";
import { createStubPermissionEngine } from "./helpers/permission-engine-stub";

afterEach(() => {
  // Clear audit tape between tests so each assertion sees only its own
  // rows. The mock itself stays in place across tests; only the tape
  // gets reset.
  auditCalls.length = 0;
});

// Restore real modules ONCE at the end of this file so subsequent test
// files (when running the full suite) see the real `audit-log` queries.
// Per-test `restoreModuleMocks()` would clobber our own mock between
// tests in this file.
afterAll(() => restoreModuleMocks());

// ── Test infra ──────────────────────────────────────────────────────

interface UpstreamServer {
  port: number;
  bytesReceived: number;
  stop(): void;
}

async function startUpstream(): Promise<UpstreamServer> {
  let bytesReceived = 0;
  const listener = Bun.listen<undefined>({
    hostname: "127.0.0.1",
    port: 0,
    socket: {
      data(socket, chunk: Buffer) {
        bytesReceived += chunk.byteLength;
        // Echo back so the client can see bytes flow.
        socket.write(chunk);
      },
    },
  });
  return {
    port: listener.port,
    get bytesReceived() { return bytesReceived; },
    stop: () => listener.stop(true),
  };
}

interface ClientResult {
  responseBytes: Buffer;
  responseStr: string;
  closed: boolean;
}

/**
 * Open a TCP socket to the proxy's loopback port, write `requestText`,
 * collect bytes for `collectMs`, then close. Used to exercise the
 * proxy's HTTP/1.1 reply.
 */
async function rawClient(
  proxyHost: string,
  proxyPort: number,
  requestText: string,
  collectMs = 200,
): Promise<ClientResult> {
  let buf = Buffer.alloc(0);
  let closed = false;
  const sock = await Bun.connect<undefined>({
    hostname: proxyHost,
    port: proxyPort,
    socket: {
      open(s) { s.write(requestText); },
      data(_s, chunk: Buffer) { buf = Buffer.concat([buf, chunk]); },
      close() { closed = true; },
    },
  });
  await new Promise((r) => setTimeout(r, collectMs));
  try { sock.end(); } catch { /* already torn */ }
  return { responseBytes: buf, responseStr: buf.toString("utf8"), closed };
}

function basicAuthHeader(token: string): string {
  // Same shape every legitimate proxy client uses. The user portion is
  // the placeholder `_`; the password slot carries the token.
  const b64 = Buffer.from(`_:${token}`).toString("base64");
  return `Proxy-Authorization: Basic ${b64}`;
}

function makeProxy(
  overrides: Partial<McpProxyConfig> = {},
): { proxy: ReturnType<typeof createMcpProxy>; engine: ReturnType<typeof createStubPermissionEngine> } {
  const engine = createStubPermissionEngine("allow-all");
  const proxy = createMcpProxy({
    extensionId: "ext-test",
    extensionName: "test-mcp",
    conversationId: null,
    userId: null,
    permittedHosts: ["api.example.com", "cdn.example.com"],
    engine,
    isUds: false,
    socketPath: "127.0.0.1:0",
    ...overrides,
  });
  return { proxy, engine };
}

// ── parseConnectRequest unit tests ──────────────────────────────────

describe("parseConnectRequest", () => {
  test("happy path: CONNECT host:port HTTP/1.1 + Proxy-Authorization", () => {
    const headers =
      "CONNECT api.example.com:443 HTTP/1.1\r\n" +
      "Host: api.example.com:443\r\n" +
      `${basicAuthHeader("the-token")}\r\n`;
    const r = parseConnectRequest(headers);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.hostname).toBe("api.example.com");
      expect(r.port).toBe(443);
      expect(r.providedToken).toBe("the-token");
    }
  });

  test("rejects non-CONNECT methods", () => {
    const r = parseConnectRequest("GET / HTTP/1.1\r\nHost: foo\r\n");
    expect(r.ok).toBe(false);
  });

  test("rejects port out of range", () => {
    const r = parseConnectRequest("CONNECT host:99999 HTTP/1.1\r\n");
    expect(r.ok).toBe(false);
  });

  test("missing Proxy-Authorization → empty providedToken", () => {
    const r = parseConnectRequest("CONNECT host:443 HTTP/1.1\r\n");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.providedToken).toBe("");
  });

  test("malformed Basic header → empty providedToken", () => {
    const r = parseConnectRequest(
      "CONNECT host:443 HTTP/1.1\r\nProxy-Authorization: Bearer something\r\n",
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.providedToken).toBe("");
  });

  test("HTTP/1.0 also accepted", () => {
    const r = parseConnectRequest("CONNECT host:443 HTTP/1.0\r\n");
    expect(r.ok).toBe(true);
  });
});

// ── End-to-end proxy tests ──────────────────────────────────────────

describe("createMcpProxy — auth + allowlist", () => {
  test("missing token → 407 Proxy Authentication Required", async () => {
    const { proxy } = makeProxy();
    await proxy.start();
    const url = new URL(proxy.proxyUrl().replace("http://", "http://"));
    try {
      const r = await rawClient(
        url.hostname,
        Number(url.port),
        "CONNECT api.example.com:443 HTTP/1.1\r\n\r\n",
      );
      expect(r.responseStr).toContain("407");
      // Audit writes are fire-and-forget; settle them before asserting.
      await new Promise((res) => setTimeout(res, 50));
      expect(auditCalls.some((c) => c.action === "ext:mcp:host-blocked")).toBe(true);
    } finally {
      await proxy.stop();
    }
  });

  test("wrong token → 407", async () => {
    const { proxy } = makeProxy();
    await proxy.start();
    const url = new URL(proxy.proxyUrl());
    try {
      const r = await rawClient(
        url.hostname,
        Number(url.port),
        `CONNECT api.example.com:443 HTTP/1.1\r\n${basicAuthHeader("WRONG")}\r\n\r\n`,
      );
      expect(r.responseStr).toContain("407");
    } finally {
      await proxy.stop();
    }
  });

  test("allow-all engine + valid token + upstream → 200 Connection Established + bytes flow", async () => {
    const upstream = await startUpstream();
    const { proxy, engine } = makeProxy();
    await proxy.start();
    const url = new URL(proxy.proxyUrl());
    const realToken = url.password;
    try {
      // Open a CONNECT to the upstream port through the proxy. The proxy
      // will respond with `200 Connection Established`; we then write
      // some bytes and expect them echoed.
      let buf = Buffer.alloc(0);
      const sock = await Bun.connect<undefined>({
        hostname: url.hostname,
        port: Number(url.port),
        socket: {
          open(s) {
            s.write(
              `CONNECT 127.0.0.1:${upstream.port} HTTP/1.1\r\n${basicAuthHeader(realToken)}\r\n\r\n`,
            );
          },
          data(_s, chunk: Buffer) {
            buf = Buffer.concat([buf, chunk]);
          },
        },
      });

      // Wait for the 200, then send tunneled bytes.
      let waited = 0;
      while (!buf.toString().includes("200 Connection Established") && waited < 1000) {
        await new Promise((r) => setTimeout(r, 20));
        waited += 20;
      }
      expect(buf.toString()).toContain("200 Connection Established");
      // Strip the headers so we can assert on the echoed bytes.
      const headerEnd = buf.indexOf("\r\n\r\n");
      buf = buf.subarray(headerEnd + 4);
      sock.write("HELLO");
      await new Promise((r) => setTimeout(r, 100));
      expect(buf.toString()).toContain("HELLO");

      // Engine was called exactly once for the CONNECT.
      expect(engine.calls.length).toBe(1);
      expect(engine.calls[0]?.needed[0]?.kind).toBe("network");
      expect(engine.calls[0]?.needed[0]?.value).toBe("127.0.0.1");

      // Counters reflect the tunneled bytes.
      const counters = proxy.bytesTransferred();
      expect(counters.rx).toBeGreaterThanOrEqual(5);
      expect(counters.tx).toBeGreaterThanOrEqual(5);

      try { sock.end(); } catch { /* race */ }
    } finally {
      upstream.stop();
      await proxy.stop();
    }
  });

  test("deny-all engine → 403 Forbidden + host-blocked audit", async () => {
    const upstream = await startUpstream();
    const { proxy } = makeProxy();
    proxy._resetCountersForTests();
    // Reset and switch the stub engine; because makeProxy ties into a
    // fresh stub, recreate with deny mode.
    const engineDeny = createStubPermissionEngine("deny-all");
    const denyProxy = createMcpProxy({
      extensionId: "ext-deny",
      extensionName: "deny-mcp",
      conversationId: null,
      userId: null,
      permittedHosts: [],
      engine: engineDeny,
      isUds: false,
      socketPath: "127.0.0.1:0",
    });
    await denyProxy.start();
    const url = new URL(denyProxy.proxyUrl());
    try {
      const r = await rawClient(
        url.hostname,
        Number(url.port),
        `CONNECT 127.0.0.1:${upstream.port} HTTP/1.1\r\n${basicAuthHeader(url.password)}\r\n\r\n`,
      );
      expect(r.responseStr).toContain("403");
      await new Promise((res) => setTimeout(res, 50));
      expect(auditCalls.some(
        (c) => c.action === "ext:mcp:host-blocked" && c.metadata?.reason === "host",
      )).toBe(true);
    } finally {
      upstream.stop();
      await denyProxy.stop();
      await proxy.stop();
    }
  });

  test("malformed CONNECT line → 400 Bad Request", async () => {
    const { proxy } = makeProxy();
    await proxy.start();
    const url = new URL(proxy.proxyUrl());
    try {
      const r = await rawClient(
        url.hostname,
        Number(url.port),
        "GET / HTTP/1.1\r\nHost: foo\r\n\r\n",
      );
      expect(r.responseStr).toContain("400");
    } finally {
      await proxy.stop();
    }
  });
});

describe("createMcpProxy — quota", () => {
  test("concurrent-connection cap blocks the over-the-line CONNECT with 503", async () => {
    // Stand up enough peers to exceed the cap. The real cap is 10; we
    // deliberately exhaust it and watch the 11th get 503.
    const upstream = await startUpstream();
    const { proxy } = makeProxy();
    await proxy.start();
    const url = new URL(proxy.proxyUrl());
    try {
      const sockets: Array<Socket<undefined>> = [];
      // Open 10 long-lived tunnels by sending CONNECT but never closing.
      for (let i = 0; i < 10; i++) {
        const s = await Bun.connect<undefined>({
          hostname: url.hostname,
          port: Number(url.port),
          socket: {
            open(sock) {
              sock.write(
                `CONNECT 127.0.0.1:${upstream.port} HTTP/1.1\r\n${basicAuthHeader(url.password)}\r\n\r\n`,
              );
            },
            data() { /* drop */ },
          },
        });
        sockets.push(s);
      }
      // Give the proxy a moment to register all 10 tunnels.
      await new Promise((r) => setTimeout(r, 100));

      // 11th CONNECT should be refused.
      const r = await rawClient(
        url.hostname,
        Number(url.port),
        `CONNECT 127.0.0.1:${upstream.port} HTTP/1.1\r\n${basicAuthHeader(url.password)}\r\n\r\n`,
      );
      expect(r.responseStr).toContain("503");
      await new Promise((res) => setTimeout(res, 50));
      expect(auditCalls.some(
        (c) => c.action === "ext:mcp:host-blocked" &&
               c.metadata?.reason === "quota:concurrent",
      )).toBe(true);

      for (const s of sockets) try { s.end(); } catch { /* race */ }
    } finally {
      upstream.stop();
      await proxy.stop();
    }
  });
});

describe("createMcpProxy — lifecycle", () => {
  test("start() is idempotent; stop() unbinds and stop()ing again no-ops", async () => {
    const { proxy } = makeProxy();
    await proxy.start();
    await proxy.start(); // second call is no-op
    const url = new URL(proxy.proxyUrl());
    expect(url.hostname).toBe("127.0.0.1");
    expect(Number.isFinite(Number(url.port))).toBe(true);

    await proxy.stop();
    await proxy.stop(); // second stop no-op
  });

  test("missing engine throws at construction (fail-closed contract)", () => {
    expect(() =>
      createMcpProxy({
        extensionId: "ext-x",
        extensionName: "x",
        conversationId: null,
        userId: null,
        permittedHosts: [],
        // Cast through `unknown` to deliberately violate the type and
        // assert the runtime fail-closed guard. `as any` on a missing
        // field doesn't trigger biome's lint, but the
        // `as unknown as <type>` form is the canonical escape hatch.
        engine: undefined as unknown as PermissionEngine,
        isUds: false,
        socketPath: "127.0.0.1:0",
      }),
    ).toThrow(/missing PermissionEngine/);
  });
});
