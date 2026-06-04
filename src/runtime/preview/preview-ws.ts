/**
 * preview-ws.ts — WebSocket / HMR upgrade gating for the dynamic preview
 * passthrough (Secure User-Site Preview / Port Exposure, Phase 3a — see
 * tasks/preview-port-exposure.md §3.5 "Dynamic" + "Phase 3 REDESIGN").
 *
 * Vite + Bun dev servers push HMR over a WebSocket, so a dynamic preview
 * MUST relay WS upgrades to the pinned dev port — otherwise the page loads
 * but live-reload (and any app WS) is dead.
 *
 * The Bun WebSocket upgrade is decided at the SERVER level (Bun.serve's
 * `upgrade()` / the svelte-adapter-bun `websocket` hook), BEFORE the
 * SvelteKit `handle` hook runs. That server-level bridge (client socket ↔
 * upstream `new WebSocket("ws://127.0.0.1:<port>")`) is the integration
 * seam documented in the SUMMARY. THIS module is the pure, fully-testable
 * core it calls into:
 *
 *   - `isWebSocketUpgrade(request)` — detect an upgrade request.
 *   - `decideWebSocketUpgrade({...})` — run the SAME access gates as the
 *     HTTP path (preview-origin host, valid id, token present + verified,
 *     row owned/active, dynamic kind) and resolve the pinned upstream URL.
 *
 * It returns a decision the server-level bridge acts on, so the gating is
 * unit-tested without a live socket. Keeping it here (next to the HTTP
 * passthrough) makes the two paths share one access model — no drift.
 *
 * TODO(Phase 3b): CSWSH Origin validation (reject cross-site upgrade
 * Origins) + token re-check on the upgrade frame + per-preview rate limits.
 * Phase 3a does the access gate + port pin; the Origin allowlist is 3b.
 */

import type { PreviewRegistryRow, PreviewTokenClaims } from "./preview-proxy";

/**
 * Is this request a WebSocket upgrade? Per RFC 6455: `Upgrade: websocket`
 * (case-insensitive) + a `Connection` header that includes `upgrade`.
 */
export function isWebSocketUpgrade(request: {
  headers: { get(name: string): string | null };
}): boolean {
  const upgrade = request.headers.get("upgrade")?.toLowerCase() ?? "";
  if (upgrade !== "websocket") return false;
  const connection = request.headers.get("connection")?.toLowerCase() ?? "";
  return connection.split(",").some((p) => p.trim() === "upgrade");
}

export type WebSocketUpgradeDecision =
  | {
      /** Accept the upgrade and bridge to this loopback upstream. */
      accept: true;
      /** The pinned upstream WS URL: `ws://127.0.0.1:<port><path><search>`. */
      upstreamUrl: string;
      port: number;
    }
  | {
      accept: false;
      /** Opaque rejection reason (logged, not surfaced verbatim). */
      reason: string;
    };

export interface DecideWebSocketUpgradeInput {
  previewId: string;
  /** The request path (URL pathname) being upgraded. */
  requestPath: string;
  /** The URL search string (e.g. "?token=..."), preserved on the upstream. */
  search?: string;
  /** The `__ezpreview` cookie value (null when absent). */
  cookieToken: string | null;
}

export interface DecideWebSocketUpgradeDeps {
  verifyToken: (token: string) => Promise<PreviewTokenClaims | null>;
  getServable: (id: string, userId: string) => Promise<PreviewRegistryRow | undefined>;
  isValidPreviewId: (id: string) => boolean;
}

/**
 * Decide whether to accept a WS upgrade for a preview, applying the SAME
 * requester-only access gates as the HTTP passthrough:
 *   - well-formed preview id,
 *   - a present + verifiable `__ezpreview` token whose previewId matches,
 *   - an owned/active/unexpired DYNAMIC row with a positive targetPort.
 *
 * On success returns the pinned `ws://127.0.0.1:<port>` upstream URL (SSRF
 * defense — loopback + exact port, never the request's own host). Every
 * failure collapses to `{accept:false}` with an opaque reason so the
 * surface gives nothing away (mirrors the HTTP 404).
 */
export async function decideWebSocketUpgrade(
  input: DecideWebSocketUpgradeInput,
  deps: DecideWebSocketUpgradeDeps,
): Promise<WebSocketUpgradeDecision> {
  const { previewId, requestPath, cookieToken } = input;

  if (!deps.isValidPreviewId(previewId)) return { accept: false, reason: "bad id" };
  if (!cookieToken) return { accept: false, reason: "no token" };

  const claims = await deps.verifyToken(cookieToken);
  if (!claims) return { accept: false, reason: "token invalid" };
  if (claims.previewId !== previewId) return { accept: false, reason: "token/id mismatch" };

  const row = await deps.getServable(previewId, claims.userId);
  if (!row || row.userId !== claims.userId) return { accept: false, reason: "not servable" };
  if (row.kind !== "dynamic") return { accept: false, reason: "not dynamic" };
  if (!Number.isInteger(row.targetPort) || (row.targetPort ?? 0) <= 0) {
    return { accept: false, reason: "no target port" };
  }

  const port = row.targetPort as number;
  const search = input.search ?? "";
  return {
    accept: true,
    port,
    upstreamUrl: `ws://127.0.0.1:${port}${requestPath}${search}`,
  };
}
