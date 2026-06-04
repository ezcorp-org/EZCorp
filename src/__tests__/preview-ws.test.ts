import { test, expect, describe } from "bun:test";
import {
  isWebSocketUpgrade,
  decideWebSocketUpgrade,
  type DecideWebSocketUpgradeDeps,
} from "../runtime/preview/preview-ws";
import type { PreviewRegistryRow } from "../runtime/preview/preview-proxy";

const VALID_ID = "abcdefghjkmnpqrstvwxyz0123";

function hdr(map: Record<string, string>) {
  const h = new Headers(map);
  return { headers: { get: (n: string) => h.get(n) } };
}

describe("isWebSocketUpgrade", () => {
  test("true for Upgrade: websocket + Connection: Upgrade", () => {
    expect(isWebSocketUpgrade(hdr({ Upgrade: "websocket", Connection: "Upgrade" }))).toBe(true);
  });

  test("true with a multi-value Connection header (keep-alive, Upgrade)", () => {
    expect(isWebSocketUpgrade(hdr({ Upgrade: "WebSocket", Connection: "keep-alive, Upgrade" }))).toBe(true);
  });

  test("false when not a websocket upgrade", () => {
    expect(isWebSocketUpgrade(hdr({}))).toBe(false);
    expect(isWebSocketUpgrade(hdr({ Upgrade: "h2c", Connection: "Upgrade" }))).toBe(false);
    expect(isWebSocketUpgrade(hdr({ Upgrade: "websocket" }))).toBe(false); // no Connection
  });
});

describe("decideWebSocketUpgrade — same access gates as HTTP + port pin", () => {
  const dynRow: PreviewRegistryRow = {
    id: VALID_ID, userId: "u1", kind: "dynamic", staticPath: null, targetPort: 5173,
  };

  function deps(over: Partial<DecideWebSocketUpgradeDeps> = {}): DecideWebSocketUpgradeDeps {
    return {
      isValidPreviewId: (id) => id === VALID_ID,
      verifyToken: async (t) => (t === "good" ? { previewId: VALID_ID, userId: "u1" } : null),
      getServable: async (id, userId) => (id === VALID_ID && userId === "u1" ? dynRow : undefined),
      ...over,
    };
  }

  test("accepts + pins ws://127.0.0.1:<port> with path + search preserved", async () => {
    const d = await decideWebSocketUpgrade(
      { previewId: VALID_ID, requestPath: "/__vite_hmr", search: "?token=x", cookieToken: "good" },
      deps(),
    );
    expect(d).toEqual({ accept: true, port: 5173, upstreamUrl: "ws://127.0.0.1:5173/__vite_hmr?token=x" });
  });

  test("rejects a malformed id", async () => {
    const d = await decideWebSocketUpgrade(
      { previewId: "bad", requestPath: "/", cookieToken: "good" },
      deps(),
    );
    expect(d.accept).toBe(false);
  });

  test("rejects when no token", async () => {
    const d = await decideWebSocketUpgrade({ previewId: VALID_ID, requestPath: "/", cookieToken: null }, deps());
    expect(d.accept).toBe(false);
  });

  test("rejects an invalid token", async () => {
    const d = await decideWebSocketUpgrade({ previewId: VALID_ID, requestPath: "/", cookieToken: "bad" }, deps());
    expect(d.accept).toBe(false);
  });

  test("rejects a token minted for a different preview", async () => {
    const d = await decideWebSocketUpgrade(
      { previewId: VALID_ID, requestPath: "/", cookieToken: "good" },
      deps({ verifyToken: async () => ({ previewId: "other", userId: "u1" }) }),
    );
    expect(d.accept).toBe(false);
  });

  test("rejects when the row is not servable (wrong user / revoked)", async () => {
    const d = await decideWebSocketUpgrade(
      { previewId: VALID_ID, requestPath: "/", cookieToken: "good" },
      deps({ getServable: async () => undefined }),
    );
    expect(d.accept).toBe(false);
  });

  test("rejects a static row (only dynamic upgrades)", async () => {
    const staticRow: PreviewRegistryRow = { ...dynRow, kind: "static", targetPort: null, staticPath: "/x" };
    const d = await decideWebSocketUpgrade(
      { previewId: VALID_ID, requestPath: "/", cookieToken: "good" },
      deps({ getServable: async () => staticRow }),
    );
    expect(d.accept).toBe(false);
  });

  test("rejects a dynamic row with no target port", async () => {
    const d = await decideWebSocketUpgrade(
      { previewId: VALID_ID, requestPath: "/", cookieToken: "good" },
      deps({ getServable: async () => ({ ...dynRow, targetPort: 0 }) }),
    );
    expect(d.accept).toBe(false);
  });
});
