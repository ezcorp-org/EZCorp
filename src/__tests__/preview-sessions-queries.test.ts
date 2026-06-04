/**
 * Secure User-Site Preview / Port Exposure — Phase 1.
 * Preview registry CRUD + access semantics + lifecycle.
 *
 * Critical invariants under test:
 *  - generatePreviewId is opaque (26 Crockford base32 chars) + unique
 *  - createPreviewSession validates kind-specific fields + stamps expiry
 *  - getServablePreview is the requester-only access gate:
 *      wrong user / expired / revoked / inactive all return undefined
 *  - touchPreview only bumps active, owned rows
 *  - revokePreview is owner-scoped + idempotent
 *  - sweepExpiredPreviews flips only past-due active rows
 *  - reapPreviewsForConversation revokes a conversation's active rows
 *  - countActivePreviewsForUser ignores expired/revoked rows
 */
import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { setupTestDb, closeTestDb, mockDbConnection } from "./helpers/test-pglite";

mockDbConnection();

const { createUser } = await import("../db/queries/users");
const { createProject } = await import("../db/queries/projects");
const { createConversation } = await import("../db/queries/conversations");
const preview = await import("../db/queries/preview-sessions");
const { getDb } = await import("../db/connection");
const { previewSessions } = await import("../db/schema");
const { eq } = await import("drizzle-orm");

let userA: string;
let userB: string;
let convA: string;
let convA2: string;

beforeAll(async () => {
  await setupTestDb();
  const a = await createUser({ email: "prev-a@test.com", passwordHash: "h", name: "A" });
  const b = await createUser({ email: "prev-b@test.com", passwordHash: "h", name: "B" });
  userA = a.id;
  userB = b.id;
  const proj = await createProject({ name: "P", path: "/tmp/p" });
  const c1 = await createConversation(proj.id, { userId: userA });
  const c2 = await createConversation(proj.id, { userId: userA });
  convA = c1.id;
  convA2 = c2.id;
});

afterAll(async () => {
  await closeTestDb();
});

describe("generatePreviewId / isValidPreviewId", () => {
  test("mints a 26-char Crockford base32 id with no ambiguous letters", () => {
    for (let i = 0; i < 200; i++) {
      const id = preview.generatePreviewId();
      expect(id).toHaveLength(26);
      expect(preview.isValidPreviewId(id)).toBe(true);
      // no i, l, o, u (Crockford excludes them)
      expect(/[ilou]/.test(id)).toBe(false);
    }
  });

  test("ids are unique across many draws (no collisions)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i++) seen.add(preview.generatePreviewId());
    expect(seen.size).toBe(5000);
  });

  test("rejects malformed ids", () => {
    expect(preview.isValidPreviewId("")).toBe(false);
    expect(preview.isValidPreviewId("short")).toBe(false);
    expect(preview.isValidPreviewId("A".repeat(26))).toBe(false); // uppercase
    expect(preview.isValidPreviewId("i".repeat(26))).toBe(false); // ambiguous letter
    expect(preview.isValidPreviewId("0".repeat(27))).toBe(false); // too long
    expect(preview.isValidPreviewId("ab.cdefghjkmnpqrstvwxyz123")).toBe(false); // dot
  });
});

describe("createPreviewSession", () => {
  test("creates a static preview with a 24h default expiry", async () => {
    const before = Date.now();
    const row = await preview.createPreviewSession({
      userId: userA,
      conversationId: convA,
      kind: "static",
      staticPath: "/srv/.ezcorp/sites/x",
    });
    expect(preview.isValidPreviewId(row.id)).toBe(true);
    expect(row.userId).toBe(userA);
    expect(row.conversationId).toBe(convA);
    expect(row.kind).toBe("static");
    expect(row.staticPath).toBe("/srv/.ezcorp/sites/x");
    expect(row.targetPort).toBeNull();
    expect(row.status).toBe("active");
    expect(row.revokedAt).toBeNull();
    const ttl = row.expiresAt.getTime() - row.createdAt.getTime();
    expect(ttl).toBeGreaterThan(24 * 3600 * 1000 - 1000);
    expect(ttl).toBeLessThan(24 * 3600 * 1000 + 1000);
    expect(row.createdAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  test("creates a dynamic preview with port + netnsId", async () => {
    const row = await preview.createPreviewSession({
      userId: userA,
      conversationId: convA,
      kind: "dynamic",
      targetPort: 5173,
      netnsId: "ns-abc",
    });
    expect(row.kind).toBe("dynamic");
    expect(row.targetPort).toBe(5173);
    expect(row.netnsId).toBe("ns-abc");
    expect(row.staticPath).toBeNull();
  });

  test("rejects missing userId / conversationId", async () => {
    await expect(preview.createPreviewSession({ userId: "", conversationId: convA, kind: "static", staticPath: "/x" })).rejects.toThrow(/userId/);
    await expect(preview.createPreviewSession({ userId: userA, conversationId: "", kind: "static", staticPath: "/x" })).rejects.toThrow(/conversationId/);
  });

  test("rejects static without staticPath and dynamic without a valid port", async () => {
    await expect(preview.createPreviewSession({ userId: userA, conversationId: convA, kind: "static" })).rejects.toThrow(/staticPath/);
    await expect(preview.createPreviewSession({ userId: userA, conversationId: convA, kind: "dynamic" })).rejects.toThrow(/targetPort/);
    await expect(preview.createPreviewSession({ userId: userA, conversationId: convA, kind: "dynamic", targetPort: 0 })).rejects.toThrow(/targetPort/);
  });
});

describe("getServablePreview (requester-only access gate)", () => {
  test("returns the row for the owner when active + unexpired", async () => {
    const row = await preview.createPreviewSession({ userId: userA, conversationId: convA, kind: "static", staticPath: "/x" });
    const got = await preview.getServablePreview(row.id, userA);
    expect(got?.id).toBe(row.id);
  });

  test("returns undefined for a different user (wrong-user)", async () => {
    const row = await preview.createPreviewSession({ userId: userA, conversationId: convA, kind: "static", staticPath: "/x" });
    expect(await preview.getServablePreview(row.id, userB)).toBeUndefined();
  });

  test("returns undefined for a missing id and a malformed id", async () => {
    expect(await preview.getServablePreview(preview.generatePreviewId(), userA)).toBeUndefined();
    expect(await preview.getServablePreview("not-a-valid-id", userA)).toBeUndefined();
  });

  test("returns undefined once expired", async () => {
    const row = await preview.createPreviewSession({ userId: userA, conversationId: convA, kind: "static", staticPath: "/x" });
    // Force expiry into the past.
    await getDb().update(previewSessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(previewSessions.id, row.id));
    expect(await preview.getServablePreview(row.id, userA)).toBeUndefined();
  });

  test("returns undefined once revoked", async () => {
    const row = await preview.createPreviewSession({ userId: userA, conversationId: convA, kind: "static", staticPath: "/x" });
    await preview.revokePreview(row.id, userA);
    expect(await preview.getServablePreview(row.id, userA)).toBeUndefined();
  });
});

describe("touchPreview", () => {
  test("bumps lastSeenAt for an active owned row", async () => {
    const row = await preview.createPreviewSession({ userId: userA, conversationId: convA, kind: "static", staticPath: "/x" });
    expect(row.lastSeenAt).toBeNull();
    const updated = await preview.touchPreview(row.id, userA);
    expect(updated?.lastSeenAt).not.toBeNull();
  });

  test("no-op for wrong user or revoked row", async () => {
    const row = await preview.createPreviewSession({ userId: userA, conversationId: convA, kind: "static", staticPath: "/x" });
    expect(await preview.touchPreview(row.id, userB)).toBeUndefined();
    await preview.revokePreview(row.id, userA);
    expect(await preview.touchPreview(row.id, userA)).toBeUndefined();
  });
});

describe("revokePreview", () => {
  test("is owner-scoped and idempotent", async () => {
    const row = await preview.createPreviewSession({ userId: userA, conversationId: convA, kind: "static", staticPath: "/x" });
    expect(await preview.revokePreview(row.id, userB)).toBeUndefined(); // wrong user
    const r1 = await preview.revokePreview(row.id, userA);
    expect(r1?.status).toBe("revoked");
    expect(r1?.revokedAt).not.toBeNull();
    const r2 = await preview.revokePreview(row.id, userA); // idempotent
    expect(r2?.revokedAt?.getTime()).toBe(r1?.revokedAt?.getTime());
  });

  test("returns undefined for a missing id", async () => {
    expect(await preview.revokePreview(preview.generatePreviewId(), userA)).toBeUndefined();
  });
});

describe("sweepExpiredPreviews", () => {
  test("flips only past-due active rows to expired", async () => {
    const stale = await preview.createPreviewSession({ userId: userB, conversationId: convA, kind: "static", staticPath: "/x" });
    const fresh = await preview.createPreviewSession({ userId: userB, conversationId: convA, kind: "static", staticPath: "/y" });
    await getDb().update(previewSessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(previewSessions.id, stale.id));
    const n = await preview.sweepExpiredPreviews();
    expect(n).toBeGreaterThanOrEqual(1);
    const staleRow = await preview.getPreviewByIdRaw(stale.id);
    const freshRow = await preview.getPreviewByIdRaw(fresh.id);
    expect(staleRow?.status).toBe("expired");
    expect(freshRow?.status).toBe("active");
    // second sweep is a no-op for already-expired rows
    const n2 = await preview.sweepExpiredPreviews();
    expect(n2).toBe(0);
  });
});

describe("reapPreviewsForConversation", () => {
  test("revokes only active rows for the given conversation", async () => {
    const a = await preview.createPreviewSession({ userId: userA, conversationId: convA2, kind: "static", staticPath: "/a" });
    const b = await preview.createPreviewSession({ userId: userA, conversationId: convA2, kind: "static", staticPath: "/b" });
    const other = await preview.createPreviewSession({ userId: userA, conversationId: convA, kind: "static", staticPath: "/c" });
    const n = await preview.reapPreviewsForConversation(convA2);
    expect(n).toBe(2);
    expect((await preview.getPreviewByIdRaw(a.id))?.status).toBe("revoked");
    expect((await preview.getPreviewByIdRaw(b.id))?.status).toBe("revoked");
    expect((await preview.getPreviewByIdRaw(other.id))?.status).toBe("active");
    expect(await preview.reapPreviewsForConversation("")).toBe(0);
  });
});

describe("countActivePreviewsForUser", () => {
  test("counts only active, unexpired rows", async () => {
    const u = (await createUser({ email: "prev-count@test.com", passwordHash: "h", name: "C" })).id;
    expect(await preview.countActivePreviewsForUser(u)).toBe(0);
    const live = await preview.createPreviewSession({ userId: u, conversationId: convA, kind: "static", staticPath: "/a" });
    const exp = await preview.createPreviewSession({ userId: u, conversationId: convA, kind: "static", staticPath: "/b" });
    await getDb().update(previewSessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(previewSessions.id, exp.id));
    expect(await preview.countActivePreviewsForUser(u)).toBe(1);
    await preview.revokePreview(live.id, u);
    expect(await preview.countActivePreviewsForUser(u)).toBe(0);
    expect(await preview.countActivePreviewsForUser("")).toBe(0);
  });
});
