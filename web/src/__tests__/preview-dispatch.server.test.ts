/**
 * Server-side tests for the secure-preview SvelteKit glue:
 *   - POST /api/preview/:id/token (app-origin handoff mint)
 *   - matchPreviewOrigin / servePreviewRequest (hostname dispatch + /__open)
 *
 * The pure proxy + token + registry logic is unit-tested under src/.
 * Here we mock the registry + token modules so we exercise the wiring:
 * auth gate, ownership gate, the code -> cookie swap, and the cookie-read
 * serving path — without a DB or live socket.
 */
import { test, expect, describe, vi, beforeEach, afterEach } from "vitest";

// Registry mock.
const getServablePreview = vi.fn();
const touchPreview = vi.fn(async () => undefined);
vi.mock("$server/db/queries/preview-sessions", async () => {
  const actual = await vi.importActual<typeof import("$server/db/queries/preview-sessions")>(
    "$server/db/queries/preview-sessions",
  );
  return {
    ...actual,
    getServablePreview: (...a: any[]) => (getServablePreview as any)(...a),
    touchPreview: (...a: any[]) => (touchPreview as any)(...a),
  };
});

// Token mock — keep code/JWT logic real but observe mintOneTimeCode.
const mintOneTimeCode = vi.fn(() => "the-code");
const redeemOneTimeCode = vi.fn();
const verifyPreviewToken = vi.fn();
const signPreviewToken = vi.fn(async () => "signed.jwt.token");
vi.mock("$server/runtime/preview/preview-token", async () => {
  const actual = await vi.importActual<typeof import("$server/runtime/preview/preview-token")>(
    "$server/runtime/preview/preview-token",
  );
  return {
    ...actual,
    mintOneTimeCode: (...a: any[]) => (mintOneTimeCode as any)(...a),
    redeemOneTimeCode: (...a: any[]) => (redeemOneTimeCode as any)(...a),
    verifyPreviewToken: (...a: any[]) => (verifyPreviewToken as any)(...a),
    signPreviewToken: (...a: any[]) => (signPreviewToken as any)(...a),
  };
});

const { POST } = await import("../routes/api/preview/[id]/token/+server");
const { matchPreviewOrigin, servePreviewRequest } = await import("$lib/server/preview/dispatch");
const { PREVIEW_TOKEN_TTL_SECONDS } = await import("$server/runtime/preview/preview-token");

const VALID_ID = "abcdefghjkmnpqrstvwxyz0123";
const user = { id: "u1", email: "u@x", name: "u", role: "member" as const };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.EZCORP_PREVIEW_APP_HOST = "ezcorp.example.com";
  // FORCE_SECURE_COOKIES is toggled per-test below; make sure it never
  // leaks ACROSS tests/describe blocks (e.g. into matchPreviewOrigin).
  delete process.env.FORCE_SECURE_COOKIES;
});

afterEach(() => {
  delete process.env.FORCE_SECURE_COOKIES;
});

describe("POST /api/preview/:id/token", () => {
  test("401 when unauthenticated", async () => {
    let res: Response | undefined;
    try {
      await POST({ params: { id: VALID_ID }, locals: {} } as any);
    } catch (thrown) {
      res = thrown as Response;
    }
    expect(res?.status).toBe(401);
  });

  test("404 on a malformed id", async () => {
    const res = await POST({ params: { id: "bad" }, locals: { user } } as any);
    expect(res.status).toBe(404);
    expect(mintOneTimeCode).not.toHaveBeenCalled();
  });

  test("404 when the preview isn't servable for this user", async () => {
    getServablePreview.mockResolvedValue(undefined);
    const res = await POST({ params: { id: VALID_ID }, locals: { user } } as any);
    expect(res.status).toBe(404);
    expect(mintOneTimeCode).not.toHaveBeenCalled();
  });

  test("mints a one-time code for the owner's live preview", async () => {
    getServablePreview.mockResolvedValue({ id: VALID_ID, userId: "u1", kind: "static" });
    const res = await POST({ params: { id: VALID_ID }, locals: { user } } as any);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ code: "the-code" });
    expect(mintOneTimeCode).toHaveBeenCalledWith({ previewId: VALID_ID, userId: "u1" });
    expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
  });
});

describe("matchPreviewOrigin", () => {
  test("matches a configured preview host", () => {
    const req = new Request("http://x/", { headers: { host: `${VALID_ID}.preview.ezcorp.example.com` } });
    expect(matchPreviewOrigin(req)).toEqual({ previewId: VALID_ID });
  });

  test("does not match the app origin", () => {
    const req = new Request("http://x/", { headers: { host: "ezcorp.example.com" } });
    expect(matchPreviewOrigin(req)).toBeNull();
  });

  test("disabled when EZCORP_PREVIEW_APP_HOST is unset", () => {
    delete process.env.EZCORP_PREVIEW_APP_HOST;
    const req = new Request("http://x/", { headers: { host: `${VALID_ID}.preview.ezcorp.example.com` } });
    expect(matchPreviewOrigin(req)).toBeNull();
  });
});

describe("servePreviewRequest /__open handoff", () => {
  test("redeems a code and sets a host-only __ezpreview cookie, 302 to /", async () => {
    redeemOneTimeCode.mockReturnValue({ previewId: VALID_ID, userId: "u1" });
    const req = new Request(`http://${VALID_ID}.preview.ezcorp.example.com/__open?c=the-code`);
    const res = await servePreviewRequest(req, { previewId: VALID_ID });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/");
    const setCookie = res.headers.get("Set-Cookie") ?? "";
    expect(setCookie).toContain("__ezpreview=signed.jwt.token");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).not.toContain("Domain="); // host-only
    expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
  });

  test("404 when the code does not redeem", async () => {
    redeemOneTimeCode.mockReturnValue(null);
    const req = new Request(`http://${VALID_ID}.preview.ezcorp.example.com/__open?c=bad`);
    const res = await servePreviewRequest(req, { previewId: VALID_ID });
    expect(res.status).toBe(404);
  });

  test("404 when the code is for a different preview id (cross-preview)", async () => {
    redeemOneTimeCode.mockReturnValue({ previewId: "z0123456789abcdefghjkmnpqr", userId: "u1" });
    const req = new Request(`http://${VALID_ID}.preview.ezcorp.example.com/__open?c=x`);
    const res = await servePreviewRequest(req, { previewId: VALID_ID });
    expect(res.status).toBe(404);
  });

  test("sets `; Secure` + Max-Age=TTL when FORCE_SECURE_COOKIES is on", async () => {
    process.env.FORCE_SECURE_COOKIES = "true";
    redeemOneTimeCode.mockReturnValue({ previewId: VALID_ID, userId: "u1" });
    const req = new Request(`http://${VALID_ID}.preview.ezcorp.example.com/__open?c=the-code`);
    const res = await servePreviewRequest(req, { previewId: VALID_ID });
    expect(res.status).toBe(302);
    const setCookie = res.headers.get("Set-Cookie") ?? "";
    expect(setCookie).toContain("; Secure");
    // Max-Age tracks the token TTL constant (don't hardcode the number).
    expect(setCookie).toContain(`Max-Age=${PREVIEW_TOKEN_TTL_SECONDS}`);
  });

  test("omits `; Secure` when FORCE_SECURE_COOKIES is unset", async () => {
    // (beforeEach already deletes it; assert the negative branch explicitly.)
    redeemOneTimeCode.mockReturnValue({ previewId: VALID_ID, userId: "u1" });
    const req = new Request(`http://${VALID_ID}.preview.ezcorp.example.com/__open?c=the-code`);
    const res = await servePreviewRequest(req, { previewId: VALID_ID });
    expect(res.status).toBe(302);
    const setCookie = res.headers.get("Set-Cookie") ?? "";
    expect(setCookie).not.toContain("; Secure");
    expect(setCookie).toContain(`Max-Age=${PREVIEW_TOKEN_TTL_SECONDS}`);
  });
});

describe("servePreviewRequest serving path", () => {
  test("404 with no cookie token", async () => {
    const req = new Request(`http://${VALID_ID}.preview.ezcorp.example.com/index.html`);
    const res = await servePreviewRequest(req, { previewId: VALID_ID });
    expect(res.status).toBe(404);
    expect(verifyPreviewToken).not.toHaveBeenCalled();
  });

  test("reads the __ezpreview cookie and runs the access check", async () => {
    verifyPreviewToken.mockResolvedValue({ previewId: VALID_ID, userId: "u1" });
    getServablePreview.mockResolvedValue(undefined); // not servable -> 404
    const req = new Request(`http://${VALID_ID}.preview.ezcorp.example.com/index.html`, {
      headers: { cookie: "__ezpreview=sometoken" },
    });
    const res = await servePreviewRequest(req, { previewId: VALID_ID });
    expect(res.status).toBe(404);
    expect(verifyPreviewToken).toHaveBeenCalledWith("sometoken");
  });
});
