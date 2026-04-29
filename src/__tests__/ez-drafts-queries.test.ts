/**
 * Phase 48 Wave 1 — ez_drafts CRUD + expiry sweep.
 *
 * Drafts back the propose_* tool family. Critical invariants:
 *  - createDraft stores the payload + 24h-from-now expiry by default
 *  - getDraft enforces ownership (cross-user reads return undefined)
 *  - getDraft returns undefined once expiresAt has passed
 *  - consumeDraft is idempotent (second call doesn't shift consumedAt)
 *  - sweepExpired GCs only past-due rows
 */
import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { setupTestDb, closeTestDb, mockDbConnection } from "./helpers/test-pglite";

mockDbConnection();

const { createUser } = await import("../db/queries/users");
const drafts = await import("../db/queries/ez-drafts");
const { getDb } = await import("../db/connection");
const { ezDrafts } = await import("../db/schema");
const { eq } = await import("drizzle-orm");

let userA: string;
let userB: string;

beforeAll(async () => {
  await setupTestDb();
  const a = await createUser({ email: "drafts-a@test.com", passwordHash: "h", name: "A" });
  const b = await createUser({ email: "drafts-b@test.com", passwordHash: "h", name: "B" });
  userA = a.id;
  userB = b.id;
});

afterAll(async () => {
  await closeTestDb();
});

describe("ez-drafts queries", () => {
  test("createDraft persists the payload and stamps a 24h expiry", async () => {
    const before = Date.now();
    const row = await drafts.createDraft({
      userId: userA,
      kind: "project",
      payload: { name: "My App", path: "./my-app" },
    });
    const after = Date.now();

    expect(row.id).toBeDefined();
    expect(row.userId).toBe(userA);
    expect(row.kind).toBe("project");
    expect(row.payload).toEqual({ name: "My App", path: "./my-app" });
    expect(row.consumedAt).toBeNull();

    const expiry = row.expiresAt.getTime() - row.createdAt.getTime();
    // ~24h, allow a 1s tolerance for test scheduler jitter.
    expect(expiry).toBeGreaterThan(24 * 60 * 60 * 1000 - 1000);
    expect(expiry).toBeLessThan(24 * 60 * 60 * 1000 + 1000);
    expect(row.createdAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(row.createdAt.getTime()).toBeLessThanOrEqual(after);
  });

  test("createDraft requires userId — empty throws", async () => {
    await expect(
      drafts.createDraft({ userId: "", kind: "agent", payload: {} }),
    ).rejects.toThrow();
  });

  test("getDraft returns the row to its owner", async () => {
    const created = await drafts.createDraft({
      userId: userA,
      kind: "agent",
      payload: { name: "Email Triager" },
    });
    const fetched = await drafts.getDraft(created.id, userA);
    expect(fetched).toBeDefined();
    expect(fetched!.id).toBe(created.id);
    expect(fetched!.payload).toEqual({ name: "Email Triager" });
  });

  test("getDraft refuses cross-user access (returns undefined)", async () => {
    const created = await drafts.createDraft({
      userId: userA,
      kind: "extension",
      payload: { name: "pdf-reader" },
    });
    const stolenAttempt = await drafts.getDraft(created.id, userB);
    expect(stolenAttempt).toBeUndefined();
  });

  test("getDraft returns undefined once expiresAt is in the past", async () => {
    // Create with a tiny TTL (1 ms). The next event-loop tick the row
    // is logically expired.
    const created = await drafts.createDraft({
      userId: userA,
      kind: "project",
      payload: { name: "Soon-stale" },
      ttlMs: 1,
    });
    await new Promise((r) => setTimeout(r, 5));
    const fetched = await drafts.getDraft(created.id, userA);
    expect(fetched).toBeUndefined();
  });

  test("consumeDraft stamps consumedAt and is idempotent on second call", async () => {
    const created = await drafts.createDraft({
      userId: userA,
      kind: "project",
      payload: { name: "Consume me" },
    });
    const first = await drafts.consumeDraft(created.id, userA);
    expect(first).toBeDefined();
    expect(first!.consumedAt).toBeDefined();
    const stamp1 = first!.consumedAt!.getTime();

    // Second call must not advance the timestamp.
    await new Promise((r) => setTimeout(r, 5));
    const second = await drafts.consumeDraft(created.id, userA);
    expect(second!.consumedAt!.getTime()).toBe(stamp1);
  });

  test("consumeDraft refuses cross-user access (returns undefined)", async () => {
    const created = await drafts.createDraft({
      userId: userA,
      kind: "agent",
      payload: { name: "Cross-user attack" },
    });
    const stolen = await drafts.consumeDraft(created.id, userB);
    expect(stolen).toBeUndefined();
    // Verify the row remains unconsumed.
    const fresh = await drafts.getDraft(created.id, userA);
    expect(fresh!.consumedAt).toBeNull();
  });

  test("sweepExpired removes only past-due rows; live rows survive", async () => {
    // Wipe slate clean so prior-test rows don't pollute the count.
    await getDb().delete(ezDrafts).where(eq(ezDrafts.userId, userA));
    await getDb().delete(ezDrafts).where(eq(ezDrafts.userId, userB));

    // Insert: one already-expired (1ms TTL), two still-live (24h default).
    const stale = await drafts.createDraft({
      userId: userA,
      kind: "project",
      payload: { name: "Stale" },
      ttlMs: 1,
    });
    await drafts.createDraft({ userId: userA, kind: "agent", payload: { name: "Live A" } });
    await drafts.createDraft({ userId: userB, kind: "extension", payload: { name: "Live B" } });

    await new Promise((r) => setTimeout(r, 5));
    const removed = await drafts.sweepExpired();
    expect(removed).toBeGreaterThanOrEqual(1);

    // The stale row is gone, the two live rows survive.
    const goneStale = await drafts.getDraft(stale.id, userA);
    expect(goneStale).toBeUndefined();
    const surviving = await drafts.listActiveDraftsForUser(userA);
    expect(surviving.find((r) => r.payload?.name === "Live A")).toBeDefined();
    expect(surviving.find((r) => r.payload?.name === "Stale")).toBeUndefined();
  });
});
