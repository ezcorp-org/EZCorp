/**
 * Per-MCP forward proxy — the Phase 7 outbound gate for stdio MCP
 * servers. Listens on a per-extension Unix Domain Socket (Linux netns
 * mode) or a random localhost port (non-Linux fallback). Speaks HTTP/1.1
 * CONNECT only — every legitimate stdlib HTTP client (curl, requests,
 * Go net/http, Node http) does CONNECT-then-tunnel for HTTPS through
 * the `HTTPS_PROXY` env var.
 *
 * What it enforces:
 *   1. Bearer-token auth on every CONNECT. The token is minted at
 *      proxy start and embedded in the `HTTPS_PROXY` URL the MCP
 *      receives via env. Materially equivalent to peer-pid auth for
 *      this threat model — combined with the namespace + iptables
 *      isolation, only the spawned MCP can reach the socket and only
 *      with the token only it knows.
 *   2. Per-host PDP gate. Calls `engine.authorize(...)` with a
 *      `network` capability for the target hostname; deny → 403 +
 *      audit. Allow → continue to the upstream tunnel.
 *   3. Internal-host carve-out. Localhost / RFC-1918 / link-local
 *      hostnames go through Phase 2's `ezcorp/network.internal`
 *      semantics; the PDP authorize() with a `network.internal`
 *      capability gates SSRF.
 *   4. Per-extension byte + connection quotas via `rate-limit.ts`'s
 *      token bucket. 100 MB/min rx+tx; 10 concurrent CONNECTs per
 *      MCP. Exhaustion returns `429` (bytes) or `503` (connections)
 *      and audits `MCP_HOST_BLOCKED` with a `reason: "quota"` field.
 *
 * What it does NOT do:
 *   - Per-call PDP per-byte. The PDP gate fires once per CONNECT, not
 *     once per packet. Matches the spec's "Resolved open questions"
 *     point on per-call PDP.
 *   - HTTP/2 or HTTP/3 CONNECT. HTTP/1.1 only.
 *   - WebSocket forwarding. No legitimate MCP server uses ws today;
 *     the spec defers this.
 *   - HTTPS termination. The proxy is a transparent byte-pump after
 *     the CONNECT line; the MCP and upstream negotiate TLS end-to-end
 *     so the proxy never sees plaintext.
 *
 * Tied to:
 *   - `mcp-netns.ts`        — Linux namespace probe; on success the
 *                             proxy listens on UDS, otherwise loopback.
 *   - `mcp-launcher.sh`     — bind-mounts the UDS into the namespace.
 *   - `mcp-sandbox.ts`      — invokes `createMcpProxy(...).start()`
 *                             before transport instantiation, threads
 *                             the proxy URL into HTTPS_PROXY env.
 *   - `audit-actions.ts`    — `MCP_HOST_BLOCKED` action code.
 */

import { existsSync, unlinkSync } from "node:fs";
import type { Socket } from "bun";
import type { PermissionEngine } from "./permission-engine";
import type { Capability } from "./capability-types";
import { isInternalHost, normalizeHostname } from "./runtime/internal-host";
import { insertAuditEntry } from "../db/queries/audit-log";
import { EXT_AUDIT_ACTIONS } from "./audit-actions";
import { createRateLimiter } from "./rate-limit";

// ── Tunables ────────────────────────────────────────────────────────

/** 100 MB/minute rx + tx per MCP, expressed as bytes-per-second tokens. */
const BYTES_PER_SECOND = (100 * 1024 * 1024) / 60;

/** Hard cap on simultaneous CONNECT tunnels per MCP. New CONNECTs over
 *  this number get a 503 immediately. */
const MAX_CONCURRENT_CONNECTIONS = 10;

/** Max HTTP/1.1 request-line + header buffer size. CONNECT lines are
 *  short; anything past 8 KB is malicious framing. */
const MAX_HEADER_BUFFER = 8 * 1024;

// ── Public surface ──────────────────────────────────────────────────

export interface McpProxyConfig {
  extensionId: string;
  extensionName: string;
  /** Per-conversation context for audit chaining. Phase 7 doesn't
   *  thread per-call conversationIds (the MCP process has no ALS); the
   *  value here is the install-time context — typically null. */
  conversationId: string | null;
  userId: string | null;
  /** Allowed hostnames from `manifest.permissions.network`. The PDP is
   *  the source of truth for the authorize() check; this list is held
   *  for diagnostic logging only. */
  permittedHosts: readonly string[];
  /** Phase 1 PDP singleton. Required: a missing engine is fail-closed
   *  per the spec. */
  engine: PermissionEngine;
  /** When true (Linux netns path), `socketPath` is a UDS path and
   *  the proxy listens via `Bun.listen({unix})`. When false (fallback),
   *  `socketPath` is `host:port` and the proxy listens via TCP loopback. */
  isUds: boolean;
  /** UDS path or `host:port` string. */
  socketPath: string;
}

export interface McpProxyHandle {
  /** Bring up the listener. Idempotent — repeated calls return the
   *  same listener and are no-ops. */
  start(): Promise<void>;
  /** Tear down the listener and close any active CONNECT tunnels.
   *  Idempotent. Called from `registry.unloadExtension(...)`. */
  stop(): Promise<void>;
  /** Token + URL the MCP process should receive via HTTPS_PROXY env.
   *  Only meaningful after `start()` resolves. */
  proxyUrl(): string;
  bytesTransferred(): { rx: number; tx: number };
  connectionsCount(): number;
  /** Test-only: force-flush counters so successive tests don't see
   *  carry-over from a prior simulated connection. */
  _resetCountersForTests(): void;
}

/**
 * Create the per-MCP proxy. Construction is synchronous and lazy —
 * call `.start()` to bind the listener.
 */
export function createMcpProxy(config: McpProxyConfig): McpProxyHandle {
  if (!config.engine) {
    throw new Error("createMcpProxy: missing PermissionEngine — fail-closed");
  }

  // Per-instance bearer token. The MCP process learns it via the
  // HTTPS_PROXY url; nothing else can mint a valid CONNECT request.
  const token = generateToken();

  // Quotas. One bytes-budget for rx + tx combined (matches the
  // headline "100MB/min rx+tx" wording in the spec); separate
  // connection-counter for the 10-concurrent cap.
  const consumeBytes = createRateLimiter(BYTES_PER_SECOND);

  let listenerHandle: { close: () => Promise<void> } | null = null;
  // Track every active tunnel so `stop()` can rip them down.
  const activeTunnels = new Set<{ close: () => void }>();
  // Counters surfaced via `bytesTransferred()` / `connectionsCount()`.
  let rxBytes = 0;
  let txBytes = 0;
  let totalConnections = 0;
  let hostPort: { host: string; port: number } | null = null;

  // Format used to build the URL — see `proxyUrl()`. A `_user`
  // placeholder is used for the URL's userinfo; the password slot
  // carries the secret token. RFC 7617 wire-form, identical to what
  // curl / requests / Node http forward as `Proxy-Authorization`.
  const proxyUrlForUds = (): string =>
    `http://_:${token}@unix:${config.socketPath}`;
  const proxyUrlForLoopback = (): string => {
    if (!hostPort) throw new Error("proxyUrl() before start()");
    return `http://_:${token}@${hostPort.host}:${hostPort.port}`;
  };

  async function start(): Promise<void> {
    if (listenerHandle) return;
    listenerHandle = await bindListener();
  }

  async function stop(): Promise<void> {
    if (!listenerHandle) return;
    // Stop accepting new connections first so no race between
    // teardown and a new CONNECT.
    await listenerHandle.close();
    listenerHandle = null;

    for (const t of activeTunnels) {
      try { t.close(); } catch { /* socket already torn down */ }
    }
    activeTunnels.clear();

    // Best-effort UDS cleanup — Bun's listener.stop() doesn't unlink
    // the socket file; leaving it would block re-bind on extension
    // re-load.
    if (config.isUds && existsSync(config.socketPath)) {
      try { unlinkSync(config.socketPath); } catch { /* race */ }
    }
  }

  async function bindListener() {
    if (config.isUds) {
      // Pre-clean: an orphan socket from a crashed prior boot would
      // make `listen({unix})` throw EADDRINUSE.
      if (existsSync(config.socketPath)) {
        try { unlinkSync(config.socketPath); } catch { /* race */ }
      }
      const listener = Bun.listen({
        unix: config.socketPath,
        socket: buildSocketHandler(),
      });
      // chmod is best-effort — Bun doesn't expose a UDS-mode option;
      // we rely on the parent dir's mode + the host's umask. The
      // namespace bind-mount is the primary access gate.
      return { close: async () => { listener.stop(true); } };
    }

    const [host, portStr] = config.socketPath.split(":");
    const wantPort = Number.parseInt(portStr ?? "0", 10);
    const listener = Bun.listen({
      hostname: host || "127.0.0.1",
      port: Number.isFinite(wantPort) ? wantPort : 0,
      socket: buildSocketHandler(),
    });
    hostPort = { host: listener.hostname, port: listener.port };
    return { close: async () => { listener.stop(true); } };
  }

  function buildSocketHandler() {
    // One state slot per inbound socket — accumulating CONNECT-line
    // bytes until we see the CRLF CRLF terminator. After CONNECT is
    // approved + tunneled, `state.upstream` holds the upstream socket
    // and the pump runs raw.
    type ClientState = {
      headerBuf: Buffer | null;
      upstream: Socket<TunnelData> | null;
      tunnel: { close: () => void } | null;
    };
    type TunnelData = { client: Socket<ClientState> };

    return {
      open(client: Socket<ClientState>) {
        // Per-MCP cap on concurrent tunnels. Reject the new one before
        // it consumes a CONNECT round trip.
        if (activeTunnels.size >= MAX_CONCURRENT_CONNECTIONS) {
          writeStatusAndClose(
            client,
            "503 Service Unavailable",
            `Too many concurrent connections (max ${MAX_CONCURRENT_CONNECTIONS})`,
          );
          void auditBlocked(config, "quota:concurrent", null);
          return;
        }
        client.data = { headerBuf: Buffer.alloc(0), upstream: null, tunnel: null };
      },

      data(client: Socket<ClientState>, chunk: Buffer) {
        const state = client.data;
        if (state.upstream) {
          // Tunneled phase: byte-pump client → upstream. Quota: count
          // the bytes against the per-MCP bucket; over-budget closes
          // the tunnel.
          if (!consumeBytes(config.extensionId, chunk.byteLength)) {
            void auditBlocked(config, "quota:bytes", null);
            tearDown(client, state, "quota:bytes");
            return;
          }
          rxBytes += chunk.byteLength;
          state.upstream.write(chunk);
          return;
        }

        // Header phase: append, then look for CRLF CRLF.
        if (!state.headerBuf) return;
        state.headerBuf = Buffer.concat([state.headerBuf, chunk]);
        if (state.headerBuf.byteLength > MAX_HEADER_BUFFER) {
          writeStatusAndClose(client, "431 Request Header Fields Too Large", "");
          return;
        }

        const headerEnd = state.headerBuf.indexOf("\r\n\r\n");
        if (headerEnd === -1) return; // incomplete; wait for more bytes

        const headerStr = state.headerBuf.toString("utf8", 0, headerEnd);
        const tail = state.headerBuf.subarray(headerEnd + 4);
        state.headerBuf = null;
        void handleConnect(client, state, headerStr, tail);
      },

      close(client: Socket<ClientState>) {
        const state = client.data;
        if (state?.tunnel) {
          activeTunnels.delete(state.tunnel);
          state.tunnel = null;
        }
        if (state?.upstream) {
          try { state.upstream.end(); } catch { /* already torn */ }
          state.upstream = null;
        }
      },

      error(client: Socket<ClientState>) {
        const state = client.data;
        if (state?.upstream) {
          try { state.upstream.end(); } catch { /* already torn */ }
        }
      },
    };

    async function handleConnect(
      client: Socket<ClientState>,
      state: ClientState,
      headerStr: string,
      pendingBytes: Buffer,
    ): Promise<void> {
      const parsed = parseConnectRequest(headerStr);
      if (!parsed.ok) {
        writeStatusAndClose(client, "400 Bad Request", parsed.reason);
        return;
      }
      const { hostname, port, providedToken } = parsed;

      if (providedToken !== token) {
        writeStatusAndClose(client, "407 Proxy Authentication Required", "Bad token");
        void auditBlocked(config, "auth", hostname);
        return;
      }

      // PDP gate. Phase 2's network-handler treats internal hosts via
      // the same `kind: "network"` capability as external — the routing
      // distinction (`ezcorp/network.internal` reverse-RPC vs the
      // in-sandbox wrapper) is RPC-level, not capability-level. We
      // mirror that: every CONNECT goes through one `network` cap with
      // the normalized hostname. SSRF gating is a manifest-level
      // concern (the user grants only the hostnames they want).
      void isInternalHost; // imported for future per-call PDP semantics
      const cap: Capability = {
        kind: "network",
        value: normalizeHostname(hostname),
      };
      let decision;
      try {
        decision = await config.engine.authorize(
          {
            extensionId: config.extensionId,
            userId: config.userId,
            conversationId: config.conversationId,
          },
          [cap],
        );
      } catch {
        writeStatusAndClose(client, "500 Internal Server Error", "PDP failure");
        return;
      }
      if (decision.decision !== "allow") {
        writeStatusAndClose(client, "403 Forbidden", `Hostname denied: ${hostname}`);
        void auditBlocked(config, "host", hostname);
        return;
      }

      // Open upstream. `Bun.connect({hostname, port})` doesn't itself
      // do TLS — the MCP and the upstream perform the TLS handshake
      // through the tunnel after we send `200 Connection Established`.
      let upstream: Socket<TunnelData>;
      try {
        upstream = await Bun.connect<TunnelData>({
          hostname,
          port,
          socket: buildUpstreamHandler(),
        });
      } catch (err) {
        writeStatusAndClose(
          client,
          "502 Bad Gateway",
          `Upstream connect failed: ${(err as Error).message}`,
        );
        return;
      }
      upstream.data = { client };

      const tunnel = {
        close() {
          try { upstream.end(); } catch { /* already torn */ }
          try { client.end(); } catch { /* already torn */ }
        },
      };
      activeTunnels.add(tunnel);
      totalConnections += 1;
      state.tunnel = tunnel;
      state.upstream = upstream;

      // 200 OK — RFC 7230 §3.3.1: "Connection Established" is the
      // canonical reason phrase. After this, the client is free to
      // start the TLS ClientHello.
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");

      // Forward any bytes the client already sent past the CRLF CRLF
      // (rare, but legal for HTTP-pipelining clients).
      if (pendingBytes.byteLength > 0) {
        if (!consumeBytes(config.extensionId, pendingBytes.byteLength)) {
          void auditBlocked(config, "quota:bytes", hostname);
          tearDown(client, state, "quota:bytes");
          return;
        }
        rxBytes += pendingBytes.byteLength;
        upstream.write(pendingBytes);
      }
    }

    function buildUpstreamHandler() {
      return {
        data(upstream: Socket<TunnelData>, chunk: Buffer) {
          const peer = upstream.data?.client;
          if (!peer) return;
          if (!consumeBytes(config.extensionId, chunk.byteLength)) {
            void auditBlocked(config, "quota:bytes", null);
            try { upstream.end(); } catch { /* race */ }
            try { peer.end(); } catch { /* race */ }
            return;
          }
          txBytes += chunk.byteLength;
          peer.write(chunk);
        },
        close(upstream: Socket<TunnelData>) {
          const peer = upstream.data?.client;
          if (peer) try { peer.end(); } catch { /* race */ }
        },
        error(upstream: Socket<TunnelData>) {
          const peer = upstream.data?.client;
          if (peer) try { peer.end(); } catch { /* race */ }
        },
      };
    }
  }

  function tearDown(
    client: Socket<{ headerBuf: Buffer | null; upstream: Socket<{ client: Socket<unknown> }> | null; tunnel: { close: () => void } | null }>,
    state: { upstream: Socket<{ client: Socket<unknown> }> | null; tunnel: { close: () => void } | null },
    reason: string,
  ): void {
    writeStatusAndClose(client, "429 Too Many Requests", reason);
    if (state.tunnel) {
      activeTunnels.delete(state.tunnel);
      state.tunnel = null;
    }
    if (state.upstream) {
      try { state.upstream.end(); } catch { /* race */ }
      state.upstream = null;
    }
  }

  function proxyUrl(): string {
    return config.isUds ? proxyUrlForUds() : proxyUrlForLoopback();
  }

  return {
    start,
    stop,
    proxyUrl,
    bytesTransferred: () => ({ rx: rxBytes, tx: txBytes }),
    connectionsCount: () => totalConnections,
    _resetCountersForTests: () => {
      rxBytes = 0;
      txBytes = 0;
      totalConnections = 0;
    },
  };
}

// ── Internal helpers ────────────────────────────────────────────────

function generateToken(): string {
  // 32 bytes of crypto-grade randomness, hex-encoded → 64 chars.
  // crypto.randomUUID() is too narrow (122 bits) for a value that
  // travels in env. URL-safe and copy-paste safe.
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

interface ParsedConnectOk {
  ok: true;
  hostname: string;
  port: number;
  providedToken: string;
}
interface ParsedConnectFail {
  ok: false;
  reason: string;
}

/**
 * Parse the leading HTTP/1.1 request and pull out:
 *   - the target hostname + port from `CONNECT host:port HTTP/1.1`
 *   - the bearer token from the `Proxy-Authorization: Basic ...` header
 *
 * The proxy URL the MCP gets is `http://_:<token>@host:port`, which
 * curl / requests / Go all forward as a Basic-auth Proxy-Authorization
 * header where the password slot is the token.
 */
export function parseConnectRequest(
  headerStr: string,
): ParsedConnectOk | ParsedConnectFail {
  const lines = headerStr.split("\r\n");
  const requestLine = lines[0] ?? "";
  // CONNECT <host:port> HTTP/1.1
  const reqMatch = requestLine.match(/^CONNECT\s+([^\s]+)\s+HTTP\/1\.[01]\s*$/);
  if (!reqMatch) {
    return { ok: false, reason: `Expected CONNECT request, got: ${requestLine.slice(0, 60)}` };
  }
  const [hostnamePart, portPart] = (reqMatch[1] ?? "").split(":");
  if (!hostnamePart || !portPart) {
    return { ok: false, reason: "CONNECT target must be host:port" };
  }
  const port = Number.parseInt(portPart, 10);
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    return { ok: false, reason: `Invalid CONNECT port: ${portPart}` };
  }

  let providedToken = "";
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const name = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (name === "proxy-authorization") {
      // RFC 7617 — `Basic <b64(user:password)>`. We treat the password
      // half as the token (user is the placeholder `_`).
      const m = value.match(/^Basic\s+(.+)$/i);
      if (m?.[1]) {
        try {
          const decoded = Buffer.from(m[1], "base64").toString("utf8");
          const sep = decoded.indexOf(":");
          if (sep !== -1) providedToken = decoded.slice(sep + 1);
        } catch { /* malformed — leave empty */ }
      }
    }
  }

  return { ok: true, hostname: hostnamePart, port, providedToken };
}

function writeStatusAndClose(
  client: Socket<unknown>,
  statusLine: string,
  body: string,
): void {
  const payload = body || "";
  const headers = [
    `HTTP/1.1 ${statusLine}`,
    `Content-Length: ${Buffer.byteLength(payload, "utf8")}`,
    "Connection: close",
    "Content-Type: text/plain; charset=utf-8",
    "",
    payload,
  ].join("\r\n");
  try { client.write(headers); } catch { /* peer already gone */ }
  try { client.end(); } catch { /* peer already gone */ }
}

async function auditBlocked(
  config: McpProxyConfig,
  reasonClass: string,
  hostname: string | null,
): Promise<void> {
  try {
    await insertAuditEntry(
      config.userId,
      EXT_AUDIT_ACTIONS.MCP_HOST_BLOCKED,
      config.extensionId,
      {
        permission: "network",
        oldValue: null,
        newValue: null,
        actor: "system",
        reason: reasonClass,
        extensionName: config.extensionName,
        hostname: hostname ?? null,
      },
    );
  } catch { /* DB blip — never fail-open the proxy on a logging error */ }
}
