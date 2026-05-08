/**
 * Phase 53.4 Stage 1 — memory-extractor settings migration test.
 *
 * Covers the three input shapes in
 * `src/extensions/migrations/memory-extractor-enabled.ts`:
 *
 *   1. Fresh install (no `global:memoryEnabled` set)
 *      → no per-user write, defaults preserved.
 *   2. Pre-existing `global:memoryEnabled = false`
 *      → migrates each user's `extension_settings_user.values.enabled`
 *        to `false`.
 *   3. Rerun with the sentinel already present
 *      → no-op (skip path).
 *
 * Plus the v1.3-deferred branch:
 *   4. Pre-existing `global:compactionIntervalHours != 6`
 *      → no-op on the cron, warning logged. (We only assert the
 *        migration completes without throwing — the log is not
 *        easily asserted from inside the test, but the code path is
 *        exercised.)
 */
import { test, expect, describe, beforeAll, beforeEach, afterAll } from "bun:test";
import { setupTestDb, closeTestDb, mockDbConnection } from "./helpers/test-pglite";

mockDbConnection();

const { migrateMemoryExtractorEnabledSetting } = await import(
  "../extensions/migrations/memory-extractor-enabled"
);
const { createUser } = await import("../db/queries/users");
const { upsertSetting, deleteSetting, getSetting } = await import(
  "../db/queries/settings"
);
const {
  getUserSettings,
  setUserSettings,
} = await import("../db/queries/extension-settings");
const { createExtension } = await import("../db/queries/extensions");

let extensionId: string;
let userIdA: string;
let userIdB: string;

beforeAll(async () => {
  await setupTestDb();
  const a = await createUser({ email: "a@test.com", passwordHash: "h", name: "A" });
  const b = await createUser({ email: "b@test.com", passwordHash: "h", name: "B" });
  userIdA = a.id;
  userIdB = b.id;
  // Seed a "memory-extractor" extension row so per-user writes have a
  // foreign-key target. The manifest carries the settings schema the
  // setUserSettings helper clamps against.
  const ext = await createExtension({
    name: "memory-extractor",
    version: "1.0.0",
    source: "test",
    manifest: {
      schemaVersion: 2,
      name: "memory-extractor",
      version: "1.0.0",
      description: "test",
      author: { name: "t" },
      entrypoint: "x",
      tools: [],
      permissions: {},
      settings: {
        enabled: { type: "boolean", label: "Enabled", default: true },
        compaction_enabled: {
          type: "boolean",
          label: "Run 6-hour compaction sweep",
          default: true,
        },
      },
    } as never,
  });
  extensionId = ext.id;
});

afterAll(async () => {
  await closeTestDb();
});

beforeEach(async () => {
  // Fresh slate per test: clear sentinel, legacy settings, and per-user
  // values for the extension.
  await deleteSetting("global:memoryEnabled");
  await deleteSetting("global:memoryEnabled.migrated_at");
  await deleteSetting("global:compactionIntervalHours");
  for (const u of [userIdA, userIdB]) {
    await setUserSettings(u, extensionId, {});
  }
});

describe("migrateMemoryExtractorEnabledSetting — fresh install", () => {
  test("no legacy setting → no per-user write; sentinel still writes", async () => {
    await migrateMemoryExtractorEnabledSetting(extensionId);

    // Both users have empty per-extension settings (default branch).
    const a = await getUserSettings(userIdA, extensionId);
    const b = await getUserSettings(userIdB, extensionId);
    expect(a.enabled).toBeUndefined();
    expect(b.enabled).toBeUndefined();

    // Sentinel got stamped so the next run is a no-op.
    const sentinel = await getSetting("global:memoryEnabled.migrated_at");
    expect(typeof sentinel).toBe("string");
    expect(Number.isNaN(Date.parse(sentinel as string))).toBe(false);
  });
});

describe("migrateMemoryExtractorEnabledSetting — disable pre-existing", () => {
  test("legacy=false → every user gets enabled=false written", async () => {
    await upsertSetting("global:memoryEnabled", false);

    await migrateMemoryExtractorEnabledSetting(extensionId);

    const a = await getUserSettings(userIdA, extensionId);
    const b = await getUserSettings(userIdB, extensionId);
    expect(a.enabled).toBe(false);
    expect(b.enabled).toBe(false);

    // Sentinel stamped.
    const sentinel = await getSetting("global:memoryEnabled.migrated_at");
    expect(typeof sentinel).toBe("string");
  });

  test("legacy=true → no per-user write (schema default already true)", async () => {
    await upsertSetting("global:memoryEnabled", true);

    await migrateMemoryExtractorEnabledSetting(extensionId);

    const a = await getUserSettings(userIdA, extensionId);
    expect(a.enabled).toBeUndefined();

    // Sentinel still written so subsequent boots skip.
    const sentinel = await getSetting("global:memoryEnabled.migrated_at");
    expect(typeof sentinel).toBe("string");
  });
});

describe("migrateMemoryExtractorEnabledSetting — idempotency", () => {
  test("rerun with sentinel present is a no-op", async () => {
    await upsertSetting("global:memoryEnabled", false);
    await migrateMemoryExtractorEnabledSetting(extensionId);

    const a1 = await getUserSettings(userIdA, extensionId);
    expect(a1.enabled).toBe(false);

    // Manually flip user A back to enabled=true. A second migration run
    // MUST NOT clobber that value (sentinel skip).
    await setUserSettings(userIdA, extensionId, { enabled: true });
    await migrateMemoryExtractorEnabledSetting(extensionId);

    const a2 = await getUserSettings(userIdA, extensionId);
    expect(a2.enabled).toBe(true);
  });
});

describe("migrateMemoryExtractorEnabledSetting — compaction-interval deferral", () => {
  test("legacy compactionIntervalHours=12 → no error, no per-user write needed for cron", async () => {
    // Spec-locked v1.3 behavior: custom intervals are deferred to v1.4.
    // The migration should log a warning and complete without throwing.
    await upsertSetting("global:compactionIntervalHours", 12);

    await migrateMemoryExtractorEnabledSetting(extensionId);

    // The migration should still write the sentinel even with a
    // non-default interval present (the interval branch is informational
    // only, not gated on the sentinel).
    const sentinel = await getSetting("global:memoryEnabled.migrated_at");
    expect(typeof sentinel).toBe("string");
  });

  test("legacy compactionIntervalHours=6 (default) → migrates silently", async () => {
    await upsertSetting("global:compactionIntervalHours", 6);
    await upsertSetting("global:memoryEnabled", true);

    await migrateMemoryExtractorEnabledSetting(extensionId);

    const sentinel = await getSetting("global:memoryEnabled.migrated_at");
    expect(typeof sentinel).toBe("string");
  });
});
