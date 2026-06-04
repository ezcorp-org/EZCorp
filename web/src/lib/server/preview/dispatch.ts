import {
  parsePreviewHost,
  handlePreviewRequest,
  type ParsedPreviewHost,
} from "$server/runtime/preview/preview-proxy";
import {
  verifyPreviewToken,
  redeemOneTimeCode,
  signPreviewToken,
  PREVIEW_COOKIE_NAME,
  PREVIEW_TOKEN_TTL_SECONDS,
} from "$server/runtime/preview/preview-token";
import {
  getServablePreview,
  touchPreview,
} from "$server/db/queries/preview-sessions";

// ── Preview-origin dispatch glue (SvelteKit side) ──────────────────────
//
// Wires the pure proxy module (`preview-proxy.ts`) to real deps:
//   - token verify (preview-token.ts)
//   - registry access check (preview-sessions.ts)
//   - streamed file reads
// and handles the `/__open?c=<code>` cookie-swap handoff.
//
// Called FIRST in hooks.server.ts's `handle`, before payload/rate/auth:
// preview-origin requests must NOT be routed into the app's auth flow
// (the app origin's ezcorp_session is not sent here by design — D4).

/**
 * The bare app host (no scheme/port) that owns the `*.preview.<host>`
 * wildcard. Read once from `EZCORP_PREVIEW_APP_HOST`; when unset the
 * preview origin is DISABLED (parse returns null for every host) so a
 * misconfigured deploy never accidentally serves untrusted content on
 * an unexpected origin. Operators set this to e.g. `localhost` (dev,
 * `*.localhost` auto-resolves) or `ezcorp.example.com` (prod, behind a
 * wildcard TLS cert — see docs/preview-hosting.md).
 */
function appHost(): string | null {
  const h = process.env.EZCORP_PREVIEW_APP_HOST;
  return h && h.trim().length > 0 ? h.trim() : null;
}

/**
 * If the request's Host header is a preview origin, returns the parsed
 * id; otherwise null (the caller falls through to normal app routing).
 */
export function matchPreviewOrigin(request: Request): ParsedPreviewHost | null {
  const host = appHost();
  if (!host) return null;
  return parsePreviewHost(request.headers.get("host"), host);
}

/**
 * Serve a request that has already been matched to the preview origin.
 * Handles `/__open` (code -> cookie swap) and otherwise delegates to the
 * static/dynamic handler.
 */
export async function servePreviewRequest(
  request: Request,
  parsed: ParsedPreviewHost,
): Promise<Response> {
  const url = new URL(request.url);
  const previewId = parsed.previewId;

  // ── /__open?c=<code> — one-time code -> host-only cookie swap ──
  if (url.pathname === "/__open") {
    const code = url.searchParams.get("c") ?? "";
    const claims = redeemOneTimeCode(code);
    // The code must redeem AND be for THIS subdomain's preview id.
    if (!claims || claims.previewId !== previewId) {
      return new Response("Not found", {
        status: 404,
        headers: { "Referrer-Policy": "no-referrer", "Cache-Control": "private, no-store" },
      });
    }
    const token = await signPreviewToken({ previewId, userId: claims.userId });
    // Host-only cookie (NO Domain=) on the subdomain — never sent to the
    // app origin or sibling preview origins. httpOnly so served JS can't
    // read it; SameSite=Lax; secure when the deployment forces it.
    const secure = process.env.FORCE_SECURE_COOKIES === "true";
    const cookie =
      `${PREVIEW_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; ` +
      `Max-Age=${PREVIEW_TOKEN_TTL_SECONDS}` +
      (secure ? "; Secure" : "");
    return new Response(null, {
      status: 302,
      headers: {
        Location: "/",
        "Set-Cookie": cookie,
        "Referrer-Policy": "no-referrer",
        "Cache-Control": "private, no-store",
      },
    });
  }

  // ── Everything else — token + registry gated serving ──
  const cookieToken = readCookie(request, PREVIEW_COOKIE_NAME);
  return handlePreviewRequest(
    { previewId, requestPath: url.pathname, cookieToken },
    {
      verifyToken: (t) => verifyPreviewToken(t),
      getServable: (id, userId) => getServablePreview(id, userId),
      touch: (id, userId) => touchPreview(id, userId).catch(() => undefined),
      readFile: async (abs) => {
        // Stream straight off disk via Bun.file (project convention — no
        // node:fs createReadStream / Readable.toWeb bridge). `.size`
        // backs Content-Length; `.stream()` is a WHATWG ReadableStream
        // that `new Response(...)` accepts directly.
        const file = Bun.file(abs);
        return { body: file.stream() as unknown as BodyInit, size: file.size };
      },
    },
  );
}

/** Minimal Cookie header parser — returns the named cookie value or null. */
function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const k = part.slice(0, eq).trim();
    if (k === name) return part.slice(eq + 1).trim();
  }
  return null;
}
