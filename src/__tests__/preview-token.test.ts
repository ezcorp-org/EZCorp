/**
 * Secure User-Site Preview / Port Exposure — Phase 1.
 * Token / cookie handoff: one-time code -> __ezpreview JWT.
 *
 * Critical invariants under test:
 *  - mint -> redeem returns the claims; second redeem fails (single-use)
 *  - a replayed code never succeeds even within the TTL window
 *  - an expired code fails closed
 *  - signPreviewToken -> verifyPreviewToken round-trips claims
 *  - a wrong-secret signature does not verify
 *  - an expired token does not verify
 *  - a session-shaped JWT (no preview claims) does not verify as a preview token
 */
import { test, expect, describe, beforeEach } from "bun:test";
import {
  mintOneTimeCode,
  redeemOneTimeCode,
  signPreviewToken,
  verifyPreviewToken,
  _resetCodeStoreForTests,
  PREVIEW_COOKIE_NAME,
  ONE_TIME_CODE_TTL_SECONDS,
} from "../runtime/preview/preview-token";
import { signJWT } from "../auth/jwt";

const SECRET = "test-preview-secret-0123456789abcdef";

beforeEach(() => {
  _resetCodeStoreForTests();
});

describe("one-time code", () => {
  test("mint -> redeem returns the claims", () => {
    const code = mintOneTimeCode({ previewId: "p1", userId: "u1" });
    expect(typeof code).toBe("string");
    expect(code.length).toBe(64); // 32 bytes hex
    const claims = redeemOneTimeCode(code);
    expect(claims).toEqual({ previewId: "p1", userId: "u1" });
  });

  test("is single-use: the second redeem returns null (replay defense)", () => {
    const code = mintOneTimeCode({ previewId: "p1", userId: "u1" });
    expect(redeemOneTimeCode(code)).not.toBeNull();
    expect(redeemOneTimeCode(code)).toBeNull();
  });

  test("an unknown code returns null", () => {
    expect(redeemOneTimeCode("deadbeef")).toBeNull();
    expect(redeemOneTimeCode("")).toBeNull();
  });

  test("an expired code fails closed", () => {
    const realNow = Date.now;
    try {
      const base = 1_000_000_000_000;
      Date.now = () => base;
      const code = mintOneTimeCode({ previewId: "p1", userId: "u1" });
      // advance past TTL
      Date.now = () => base + (ONE_TIME_CODE_TTL_SECONDS + 1) * 1000;
      expect(redeemOneTimeCode(code)).toBeNull();
    } finally {
      Date.now = realNow;
    }
  });

  test("each code is distinct", () => {
    const a = mintOneTimeCode({ previewId: "p", userId: "u" });
    const b = mintOneTimeCode({ previewId: "p", userId: "u" });
    expect(a).not.toBe(b);
  });
});

describe("__ezpreview token", () => {
  test("exposes the canonical cookie name", () => {
    expect(PREVIEW_COOKIE_NAME).toBe("__ezpreview");
  });

  test("sign -> verify round-trips the preview claims", async () => {
    const token = await signPreviewToken({ previewId: "pv", userId: "uv" }, SECRET);
    const claims = await verifyPreviewToken(token, SECRET);
    expect(claims).toEqual({ previewId: "pv", userId: "uv" });
  });

  test("does not verify under a different secret", async () => {
    const token = await signPreviewToken({ previewId: "pv", userId: "uv" }, SECRET);
    expect(await verifyPreviewToken(token, "another-secret")).toBeNull();
  });

  test("does not verify an expired token", async () => {
    const token = await signPreviewToken({ previewId: "pv", userId: "uv" }, SECRET, -10);
    expect(await verifyPreviewToken(token, SECRET)).toBeNull();
  });

  test("rejects garbage and empty input", async () => {
    expect(await verifyPreviewToken("", SECRET)).toBeNull();
    expect(await verifyPreviewToken("not.a.jwt", SECRET)).toBeNull();
  });

  test("rejects a session-shaped JWT carrying no preview claims", async () => {
    // A normal session JWT (signJWT with an AuthUser) has no previewId/userId
    // beyond `id`; verifyPreviewToken must reject it.
    const sessionToken = await signJWT(
      { id: "u1", email: "a@b.c", name: "A", role: "member" },
      SECRET,
      3600,
    );
    expect(await verifyPreviewToken(sessionToken, SECRET)).toBeNull();
  });
});
