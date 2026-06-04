import { resolve, sep } from "node:path";
import { realpath, stat } from "node:fs/promises";
import { isValidPreviewId } from "../../db/queries/preview-sessions";

/**
 * Host-header allowlist + static reverse-proxy skeleton for the secure
 * preview origin (Secure User-Site Preview / Port Exposure, Phase 1 —
 * see tasks/preview-port-exposure.md §3.5).
 *
 * Everything here is PURE / dependency-injected so it is fully unit
 * testable without SvelteKit or a live socket. The SvelteKit `handle`
 * hook calls `parsePreviewHost` to decide whether a request is for the
 * preview origin, then `handlePreviewRequest` to serve it.
 *
 * D4 (LOCKED): routing is by wildcard subdomain `<id>.preview.<host>` —
 * a true separate origin. The app-origin's host-only `ezcorp_session`
 * cookie is therefore never sent here; access is via the `__ezpreview`
 * token (preview-token.ts) checked against the registry on EVERY request.
 *
 * DNS-rebind defense: we do NOT trust the subdomain blindly. The Host
 * header must end in `.preview.<appHost>` AND the label must be a
 * well-formed preview id. Anything else is rejected before any DB hit.
 */

/** The fixed infix that marks the preview origin: `<id>.preview.<host>`. */
export const PREVIEW_HOST_INFIX = ".preview.";

export interface ParsedPreviewHost {
  /** The preview id (well-formed; still must exist in the registry). */
  previewId: string;
}

/**
 * Parse a Host header against the configured app host. Returns the
 * preview id when the host is EXACTLY `<id>.preview.<appHost>` and `<id>`
 * is a well-formed preview id; null otherwise (not a preview request, or
 * a DNS-rebind / spoofed Host we must reject).
 *
 * `appHost` is the bare app host WITHOUT scheme/port (e.g. "localhost"
 * or "ezcorp.example.com"). The incoming `host` may carry a `:port`
 * suffix (dev), which we strip before matching. Matching is
 * case-insensitive (DNS labels are).
 */
export function parsePreviewHost(host: string | null, appHost: string): ParsedPreviewHost | null {
  if (!host || !appHost) return null;
  // Strip a port suffix; lower-case for case-insensitive DNS matching.
  const bareHost = host.split(":")[0]!.toLowerCase();
  const bareApp = appHost.split(":")[0]!.toLowerCase();
  const suffix = PREVIEW_HOST_INFIX + bareApp;
  if (!bareHost.endsWith(suffix)) return null;
  const label = bareHost.slice(0, bareHost.length - suffix.length);
  // The label must be a SINGLE preview-id label — no extra dots (which
  // would be a deeper subdomain / a rebind attempt).
  if (label.includes(".")) return null;
  if (!isValidPreviewId(label)) return null;
  return { previewId: label };
}

/**
 * Resolve the absolute on-disk path for a request path under a static
 * preview root, applying the SAME realpath/traversal/symlink-escape
 * guards as `/api/extensions/[name]/data/[...path]`. Returns the file's
 * realpath when it is a regular file safely contained within `root`;
 * null for every failure mode (traversal, symlink escape, missing file,
 * directory) so the caller can answer with one opaque 404.
 *
 * `requestPath` is the URL pathname (e.g. "/", "/assets/app.js"). A
 * trailing "/" or empty path resolves to "index.html".
 */
export async function resolveStaticFile(root: string, requestPath: string): Promise<string | null> {
  // Decode once; reject control bytes + explicit `..` segments early.
  let decoded: string;
  try {
    decoded = decodeURIComponent(requestPath);
  } catch {
    return null;
  }
  // Directory request -> index.html (SPA-friendly default).
  if (decoded === "" || decoded === "/" || decoded.endsWith("/")) {
    decoded = decoded + "index.html";
  }
  const segments = decoded.split("/").filter((s) => s.length > 0);
  if (segments.length === 0) return null;
  for (const seg of segments) {
    if (seg === "..") return null;
        // Reject control bytes (defense-in-depth — browsers encode these).
    // Char-code scan instead of a control-char regex (biome forbids the
    // literal class) — same semantics as the extension-data route.
    for (let i = 0; i < seg.length; i++) {
      const c = seg.charCodeAt(i);
      if (c <= 0x1f || c === 0x7f) return null;
    }
  }

  // Resolve the static root to its realpath first so the prefix check
  // compares canonical paths (defends against the root itself being a
  // symlink).
  let realRoot: string;
  try {
    realRoot = await realpath(root);
  } catch {
    return null;
  }

  const target = resolve(realRoot, ...segments);
  // Lexical containment check BEFORE touching disk.
  if (!target.startsWith(realRoot + sep) && target !== realRoot) return null;

  // realpath the target to catch symlinks that escape the jail
  // (a symlink inside the dir pointing at /etc/passwd resolves out).
  let realTarget: string;
  try {
    realTarget = await realpath(target);
  } catch {
    return null;
  }
  if (!realTarget.startsWith(realRoot + sep) && realTarget !== realRoot) return null;

  let info;
  try {
    info = await stat(realTarget);
  } catch {
    return null;
  }
  if (!info.isFile()) return null;
  return realTarget;
}

const CONTENT_TYPE_BY_EXT: Readonly<Record<string, string>> = Object.freeze({
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "application/javascript; charset=utf-8",
  mjs: "application/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  pdf: "application/pdf",
  txt: "text/plain; charset=utf-8",
  map: "application/json; charset=utf-8",
  wasm: "application/wasm",
});

export function contentTypeFor(filePath: string): string {
  const dot = filePath.lastIndexOf(".");
  if (dot < 0) return "application/octet-stream";
  const ext = filePath.slice(dot + 1).toLowerCase();
  return CONTENT_TYPE_BY_EXT[ext] ?? "application/octet-stream";
}

export interface PreviewRegistryRow {
  id: string;
  userId: string | null;
  kind: "static" | "dynamic";
  staticPath: string | null;
  targetPort: number | null;
}

export interface PreviewTokenClaims {
  previewId: string;
  userId: string;
}

export interface HandlePreviewRequestDeps {
  /** Verify the `__ezpreview` cookie value into claims, or null. */
  verifyToken: (token: string) => Promise<PreviewTokenClaims | null>;
  /** The access-layer requester-only registry lookup: returns the row
   *  only when owned + active + unexpired + unrevoked. */
  getServable: (id: string, userId: string) => Promise<PreviewRegistryRow | undefined>;
  /** Read a resolved static file into a Response body. Injected so the
   *  pure handler can be tested without real I/O. `body` is anything
   *  `new Response(...)` accepts (a stream, a Uint8Array, a string). */
  readFile: (absPath: string) => Promise<{ body: BodyInit; size: number }>;
  /** Bump last-seen on a served request (best-effort, fire-and-forget). */
  touch?: (id: string, userId: string) => Promise<unknown>;
}

/**
 * Common security headers for every preview response. `no-referrer`
 * prevents the one-time `?c=` (and any in-site URL) from leaking via
 * Referer. `nosniff` + `private,no-store` mirror the extension-data
 * route. We deliberately do NOT send the app origin's CSP — the served
 * site is untrusted user content on a separate origin.
 */
function baseHeaders(): Headers {
  return new Headers({
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "private, no-store",
  });
}

function notFound(): Response {
  // Single opaque status for every failure mode (missing id, wrong user,
  // traversal, missing file) so the surface gives nothing away.
  const headers = baseHeaders();
  return new Response("Not found", { status: 404, headers });
}

/**
 * Serve a request for the preview origin. The caller has already parsed
 * the Host header into `previewId` via `parsePreviewHost`. This function
 * enforces the access layer (token + registry), then serves the STATIC
 * branch end-to-end. The DYNAMIC branch is a Phase-3 stub that returns
 * 501 — wiring netns passthrough is explicitly out of scope here.
 */
export async function handlePreviewRequest(
  opts: {
    previewId: string;
    requestPath: string;
    cookieToken: string | null;
  },
  deps: HandlePreviewRequestDeps,
): Promise<Response> {
  const { previewId, requestPath, cookieToken } = opts;

  if (!isValidPreviewId(previewId)) return notFound();
  if (!cookieToken) return notFound();

  const claims = await deps.verifyToken(cookieToken);
  if (!claims) return notFound();
  // The cookie must be FOR this preview id (a token minted for preview A
  // must not unlock preview B).
  if (claims.previewId !== previewId) return notFound();

  const row = await deps.getServable(previewId, claims.userId);
  if (!row || row.userId !== claims.userId) return notFound();

  // Best-effort liveness bump.
  if (deps.touch) void deps.touch(previewId, claims.userId);

  if (row.kind === "dynamic") {
    // ── Phase 3 STUB — dynamic netns passthrough is NOT wired yet. ──
    // Wiring connects into the per-conversation netns and fetch-proxies
    // to row.targetPort with redirect-pinning, WS/HMR + Origin
    // validation, and response-header sanitation (see §3.5). Returning
    // 501 here keeps the access layer + routing live for dynamic rows
    // without exposing an un-hardened passthrough.
    const headers = baseHeaders();
    return new Response("Dynamic previews are not available yet.", { status: 501, headers });
  }

  // ── STATIC branch (Phase 1, end-to-end) ──
  if (!row.staticPath) return notFound();
  const abs = await resolveStaticFile(row.staticPath, requestPath);
  if (!abs) return notFound();

  let file: { body: BodyInit; size: number };
  try {
    file = await deps.readFile(abs);
  } catch {
    return notFound();
  }

  const headers = baseHeaders();
  headers.set("Content-Type", contentTypeFor(abs));
  headers.set("Content-Length", String(file.size));
  return new Response(file.body as unknown as BodyInit, { status: 200, headers });
}
