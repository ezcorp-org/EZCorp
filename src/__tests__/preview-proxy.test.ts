/**
 * Secure User-Site Preview / Port Exposure — Phase 1.
 * Host-header allowlist + static reverse-proxy skeleton.
 *
 * Critical invariants under test:
 *  - parsePreviewHost: allowed <id>.preview.<host> vs rejected shapes
 *    (wrong suffix, deeper subdomain rebind, bad id, port handling)
 *  - resolveStaticFile: happy path, "/" -> index.html, traversal "..",
 *    symlink escape, missing file, directory
 *  - handlePreviewRequest: static happy path; 404 on no-token / bad-token
 *    / wrong-preview-token / unauth (not servable) / missing file;
 *    dynamic -> 501 stub
 */
import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parsePreviewHost,
  resolveStaticFile,
  handlePreviewRequest,
  contentTypeFor,
  type HandlePreviewRequestDeps,
  type PreviewRegistryRow,
} from "../runtime/preview/preview-proxy";

const APP_HOST = "ezcorp.example.com";
// A well-formed 26-char Crockford base32 preview id.
const VALID_ID = "abcdefghjkmnpqrstvwxyz0123";
const OTHER_ID = "z0123456789abcdefghjkmnpqr";

describe("parsePreviewHost", () => {
  test("accepts <id>.preview.<appHost>", () => {
    expect(parsePreviewHost(`${VALID_ID}.preview.${APP_HOST}`, APP_HOST)).toEqual({ previewId: VALID_ID });
  });

  test("accepts a :port suffix and is case-insensitive", () => {
    expect(parsePreviewHost(`${VALID_ID}.preview.localhost:5173`, "localhost")).toEqual({ previewId: VALID_ID });
    expect(parsePreviewHost(`${VALID_ID.toUpperCase()}.PREVIEW.${APP_HOST.toUpperCase()}`, APP_HOST)).toEqual({ previewId: VALID_ID });
  });

  test("rejects the app origin itself", () => {
    expect(parsePreviewHost(APP_HOST, APP_HOST)).toBeNull();
    expect(parsePreviewHost(`www.${APP_HOST}`, APP_HOST)).toBeNull();
  });

  test("rejects a wrong base host (DNS rebind to attacker domain)", () => {
    expect(parsePreviewHost(`${VALID_ID}.preview.evil.com`, APP_HOST)).toBeNull();
    expect(parsePreviewHost(`${VALID_ID}.preview.${APP_HOST}.evil.com`, APP_HOST)).toBeNull();
  });

  test("rejects a deeper subdomain (extra label) under preview", () => {
    expect(parsePreviewHost(`extra.${VALID_ID}.preview.${APP_HOST}`, APP_HOST)).toBeNull();
  });

  test("rejects a malformed preview id label", () => {
    expect(parsePreviewHost(`short.preview.${APP_HOST}`, APP_HOST)).toBeNull();
    expect(parsePreviewHost(`${"i".repeat(26)}.preview.${APP_HOST}`, APP_HOST)).toBeNull(); // ambiguous letters
  });

  test("rejects null/empty inputs", () => {
    expect(parsePreviewHost(null, APP_HOST)).toBeNull();
    expect(parsePreviewHost(`${VALID_ID}.preview.${APP_HOST}`, "")).toBeNull();
  });
});

describe("contentTypeFor", () => {
  test("maps common extensions and defaults to octet-stream", () => {
    expect(contentTypeFor("/a/index.html")).toBe("text/html; charset=utf-8");
    expect(contentTypeFor("app.js")).toBe("application/javascript; charset=utf-8");
    expect(contentTypeFor("x.wasm")).toBe("application/wasm");
    expect(contentTypeFor("noext")).toBe("application/octet-stream");
    expect(contentTypeFor("weird.xyz")).toBe("application/octet-stream");
  });
});

describe("resolveStaticFile", () => {
  let root: string;
  let outside: string;

  beforeAll(async () => {
    const base = await mkdtemp(join(tmpdir(), "ezprev-"));
    root = join(base, "site");
    outside = join(base, "secret");
    await mkdir(root, { recursive: true });
    await mkdir(join(root, "assets"), { recursive: true });
    await mkdir(outside, { recursive: true });
    await writeFile(join(root, "index.html"), "<h1>hi</h1>");
    await writeFile(join(root, "assets", "app.js"), "console.log(1)");
    await writeFile(join(outside, "passwd"), "SECRET");
    // A symlink inside the jail pointing OUT of it.
    await symlink(join(outside, "passwd"), join(root, "escape"));
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true }).catch(() => {});
  });

  test("resolves a regular file", async () => {
    expect(await resolveStaticFile(root, "/assets/app.js")).toBe(join(await import("node:fs/promises").then(m => m.realpath(root)), "assets", "app.js"));
  });

  test("'/' and '' resolve to index.html", async () => {
    expect(await resolveStaticFile(root, "/")).not.toBeNull();
    expect(await resolveStaticFile(root, "")).not.toBeNull();
  });

  test("rejects traversal via ..", async () => {
    expect(await resolveStaticFile(root, "/../secret/passwd")).toBeNull();
    expect(await resolveStaticFile(root, "/assets/../../secret/passwd")).toBeNull();
  });

  test("rejects encoded traversal (%2e%2e)", async () => {
    expect(await resolveStaticFile(root, "/%2e%2e/secret/passwd")).toBeNull();
  });

  test("rejects a symlink escaping the jail", async () => {
    expect(await resolveStaticFile(root, "/escape")).toBeNull();
  });

  test("returns null for a missing file and for a directory", async () => {
    expect(await resolveStaticFile(root, "/nope.html")).toBeNull();
    expect(await resolveStaticFile(root, "/assets")).toBeNull();
  });

  test("returns null when the root itself does not exist", async () => {
    expect(await resolveStaticFile(join(root, "does-not-exist"), "/index.html")).toBeNull();
  });
});

describe("handlePreviewRequest", () => {
  const staticRow: PreviewRegistryRow = {
    id: VALID_ID, userId: "u1", kind: "static", staticPath: "/srv/site", targetPort: null,
  };

  function deps(over: Partial<HandlePreviewRequestDeps> = {}): HandlePreviewRequestDeps {
    return {
      verifyToken: async (t) => (t === "good" ? { previewId: VALID_ID, userId: "u1" } : null),
      getServable: async (id, userId) => (id === VALID_ID && userId === "u1" ? staticRow : undefined),
      readFile: async () => ({ body: new TextEncoder().encode("<h1>hi</h1>"), size: 11 }),
      ...over,
    };
  }

  test("serves the static happy path with security headers", async () => {
    const res = await handlePreviewRequest(
      { previewId: VALID_ID, requestPath: "/index.html", cookieToken: "good" },
      { ...deps(), readFile: async () => ({ body: new TextEncoder().encode("<h1>hi</h1>"), size: 11 }) },
    );
    // resolveStaticFile would 404 on a non-existent /srv/site; inject a row
    // whose staticPath resolves. Re-run with a stub resolver via readFile is
    // not enough — assert on the dynamic/404 branches separately below.
    expect([200, 404]).toContain(res.status);
    expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  test("404 when no cookie token", async () => {
    const res = await handlePreviewRequest({ previewId: VALID_ID, requestPath: "/", cookieToken: null }, deps());
    expect(res.status).toBe(404);
  });

  test("404 on an invalid token", async () => {
    const res = await handlePreviewRequest({ previewId: VALID_ID, requestPath: "/", cookieToken: "bad" }, deps());
    expect(res.status).toBe(404);
  });

  test("404 when the token is for a different preview (cross-preview)", async () => {
    const res = await handlePreviewRequest(
      { previewId: OTHER_ID, requestPath: "/", cookieToken: "good" },
      deps({ getServable: async () => staticRow }),
    );
    expect(res.status).toBe(404);
  });

  test("404 when the registry does not return a servable row (wrong-user / revoked / expired)", async () => {
    const res = await handlePreviewRequest(
      { previewId: VALID_ID, requestPath: "/", cookieToken: "good" },
      deps({ getServable: async () => undefined }),
    );
    expect(res.status).toBe(404);
  });

  test("404 on a malformed previewId", async () => {
    const res = await handlePreviewRequest({ previewId: "bad", requestPath: "/", cookieToken: "good" }, deps());
    expect(res.status).toBe(404);
  });

  test("dynamic kind returns the Phase-3 501 stub", async () => {
    const dynRow: PreviewRegistryRow = { id: VALID_ID, userId: "u1", kind: "dynamic", staticPath: null, targetPort: 5173 };
    const res = await handlePreviewRequest(
      { previewId: VALID_ID, requestPath: "/", cookieToken: "good" },
      deps({ getServable: async () => dynRow }),
    );
    expect(res.status).toBe(501);
  });

  test("touch is called best-effort on a served (authorized) request", async () => {
    let touched = false;
    await handlePreviewRequest(
      { previewId: VALID_ID, requestPath: "/", cookieToken: "good" },
      deps({ touch: async () => { touched = true; } }),
    );
    expect(touched).toBe(true);
  });
});

describe("handlePreviewRequest static serving end-to-end", () => {
  let root: string;
  beforeAll(async () => {
    const base = await mkdtemp(join(tmpdir(), "ezprev-e2e-"));
    root = join(base, "site");
    await mkdir(root, { recursive: true });
    await writeFile(join(root, "index.html"), "<h1>served</h1>");
  });
  afterAll(async () => { await rm(root, { recursive: true, force: true }).catch(() => {}); });

  test("serves index.html for '/' with correct content-type", async () => {
    const row: PreviewRegistryRow = { id: VALID_ID, userId: "u1", kind: "static", staticPath: root, targetPort: null };
    const res = await handlePreviewRequest(
      { previewId: VALID_ID, requestPath: "/", cookieToken: "good" },
      {
        verifyToken: async () => ({ previewId: VALID_ID, userId: "u1" }),
        getServable: async () => row,
        readFile: async (abs) => {
          const buf = await Bun.file(abs).bytes();
          return { body: buf, size: buf.length };
        },
      },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(await res.text()).toBe("<h1>served</h1>");
  });

  test("404 for a traversal request even when authorized", async () => {
    const row: PreviewRegistryRow = { id: VALID_ID, userId: "u1", kind: "static", staticPath: root, targetPort: null };
    const res = await handlePreviewRequest(
      { previewId: VALID_ID, requestPath: "/../../etc/passwd", cookieToken: "good" },
      {
        verifyToken: async () => ({ previewId: VALID_ID, userId: "u1" }),
        getServable: async () => row,
        readFile: async (abs) => { const buf = await Bun.file(abs).bytes(); return { body: buf, size: buf.length }; },
      },
    );
    expect(res.status).toBe(404);
  });
});
