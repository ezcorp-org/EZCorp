/**
 * ws-bridge.ts — the LIVE client↔upstream WebSocket bridge for dynamic
 * preview HMR (Secure User-Site Preview / Port Exposure, Phase 3b,
 * deliverable 2). Vite + Bun dev servers push HMR over a WebSocket; without
 * relaying it the page loads but live-reload is dead.
 *
 * The pure access gate + Origin/CSWSH check + port pin live in
 * `$server/runtime/preview/preview-ws.ts` (`decideWebSocketUpgrade`,
 * `isWebSocketUpgrade`). THIS module is the svelte-adapter-bun integration
 * seam: it runs that gate, then (on accept) hands `Bun.serve().upgrade()` the
 * pinned `ws://127.0.0.1:<port>` upstream URL as socket `data`, and the
 * exported `previewWebSocketHandler` opens an upstream `WebSocket` and relays
 * frames both ways.
 *
 * Live-path notes (documented seam):
 *   - This only runs in the svelte-adapter-bun PROD/Docker server, where
 *     `event.platform.server` exists. Under `vite dev` there is no Bun server
 *     to `.upgrade()`, so the bridge is inert in dev (the proxy still serves
 *     HTTP; HMR-through-preview is a Docker-verified path). The DECISION logic
 *     is fully unit-tested regardless.
 *   - The upstream is pinned to loopback + the exact registered port by the
 *     decision (SSRF defense); this module never derives a host from the
 *     request.
 */

import {
  isWebSocketUpgrade,
  decideWebSocketUpgrade,
} from "$server/runtime/preview/preview-ws";
import { verifyPreviewToken, PREVIEW_COOKIE_NAME } from "$server/runtime/preview/preview-token";
import { getServablePreview, isValidPreviewId } from "$server/db/queries/preview-sessions";

/** Socket context attached at upgrade time, read by the open handler. */
export interface PreviewWsData {
  __preview: true;
  upstreamUrl: string;
  previewId: string;
}

/** Minimal Cookie header parser — returns the named cookie value or null. */
function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

/**
 * Attempt to bridge a WS upgrade for a preview origin. Returns:
 *   - a `Response` (101 on accept handing off to Bun, or a rejection status)
 *     when this request IS a preview WS upgrade we handled, OR
 *   - null when it is NOT a WS upgrade (the caller falls through to the HTTP
 *     passthrough).
 *
 * `server`/`rawRequest` come from `event.platform` (svelte-adapter-bun). When
 * they are absent (vite dev), an upgrade request can't be bridged — we return
 * a 426 so the client sees a clean "upgrade unavailable" rather than a hang.
 */
export async function tryBridgePreviewWebSocket(
  request: Request,
  previewId: string,
  appHost: string | null,
  platform: { server?: { upgrade(req: unknown, opts?: { data?: unknown }): boolean }; request?: unknown } | undefined,
): Promise<Response | null> {
  if (!isWebSocketUpgrade(request)) return null;

  const url = new URL(request.url);
  const cookieToken = readCookie(request.headers.get("cookie"), PREVIEW_COOKIE_NAME);
  const decision = await decideWebSocketUpgrade(
    {
      previewId,
      requestPath: url.pathname,
      search: url.search,
      cookieToken,
      origin: request.headers.get("origin"),
      appHost,
    },
    {
      verifyToken: (t) => verifyPreviewToken(t),
      getServable: (id, userId) => getServablePreview(id, userId),
      isValidPreviewId,
    },
  );

  if (!decision.accept) {
    // Opaque 403 — same surface as the HTTP 404 (gives nothing away).
    return new Response("Forbidden", {
      status: 403,
      headers: { "Referrer-Policy": "no-referrer", "Cache-Control": "private, no-store" },
    });
  }

  // Hand off to the Bun server. Without a live Bun server (vite dev) we can't
  // upgrade — answer 426 Upgrade Required rather than hang the client.
  if (!platform?.server || platform.request === undefined) {
    return new Response("WebSocket bridge unavailable in this environment", { status: 426 });
  }

  const data: PreviewWsData = {
    __preview: true,
    upstreamUrl: decision.upstreamUrl,
    previewId,
  };
  const ok = platform.server.upgrade(platform.request, { data });
  if (!ok) {
    return new Response("WebSocket upgrade failed", { status: 400 });
  }
  // Bun has taken over the socket; SvelteKit just needs a 101 sentinel.
  return new Response(null, { status: 101 });
}

/**
 * Bun WebSocketHandler that bridges an accepted preview client socket to its
 * pinned loopback upstream. Each client socket lazily opens an upstream
 * `WebSocket(upstreamUrl)`; frames relay both directions; either side closing
 * tears down the other. Only sockets carrying our `__preview` data are
 * handled — any other websocket (the app has none today, but defensively) is
 * left untouched (closed) so this handler can be the single adapter export.
 */
export function createPreviewWebSocketHandler() {
  // Per-client upstream + a small outbound buffer for frames that arrive
  // before the upstream finishes connecting.
  const upstreams = new WeakMap<object, { ws: WebSocket; ready: boolean; queue: (string | ArrayBufferLike)[] }>();

  return {
    open(ws: { data?: unknown; close(code?: number, reason?: string): void; send(msg: string | ArrayBufferLike): void }) {
      const data = ws.data as PreviewWsData | undefined;
      if (!data || data.__preview !== true) {
        ws.close(1008, "not a preview socket");
        return;
      }
      const state = { ws: undefined as unknown as WebSocket, ready: false, queue: [] as (string | ArrayBufferLike)[] };
      const upstream = new WebSocket(data.upstreamUrl);
      // Bun's WebSocket supports binary; relay both text + binary.
      (upstream as unknown as { binaryType: string }).binaryType = "arraybuffer";
      state.ws = upstream;
      upstreams.set(ws, state);

      upstream.addEventListener("open", () => {
        state.ready = true;
        for (const frame of state.queue) upstream.send(frame as never);
        state.queue.length = 0;
      });
      upstream.addEventListener("message", (ev: MessageEvent) => {
        ws.send(ev.data as string | ArrayBufferLike);
      });
      upstream.addEventListener("close", () => {
        ws.close(1000, "upstream closed");
      });
      upstream.addEventListener("error", () => {
        ws.close(1011, "upstream error");
      });
    },

    message(ws: { data?: unknown }, message: string | ArrayBufferLike) {
      const state = upstreams.get(ws as object);
      if (!state) return;
      if (state.ready) state.ws.send(message as never);
      else state.queue.push(message);
    },

    close(ws: { data?: unknown }) {
      const state = upstreams.get(ws as object);
      if (state) {
        try {
          state.ws.close();
        } catch {
          // already closed
        }
        upstreams.delete(ws as object);
      }
    },
  };
}
