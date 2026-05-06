import { test, expect, describe, beforeEach, afterAll } from "bun:test";
import {
  setupTestDb,
  closeTestDb,
  mockDbConnection,
  getTestDb,
} from "../../../__tests__/helpers/test-pglite";

mockDbConnection();

const {
  getGlobalSettings,
  setGlobalSettings,
  getUserSettings,
  setUserSettings,
  clearUserSettings,
  resolveExtensionSettings,
} = await import("../extension-settings");
const { extensions, users } = await import("../../schema");

import type {
  ExtensionManifestV2,
  SettingsSchema,
} from "../../../extensions/types";

const VOICE_SCHEMA: SettingsSchema = {
  voice: {
    type: "select",
    label: "Voice",
    options: [
      { value: "af_bella", label: "Bella" },
      { value: "am_adam", label: "Adam" },
    ],
    default: "af_bella",
  },
  speed: {
    type: "number",
    label: "Speed",
    min: 0.5,
    max: 2.0,
    default: 1.0,
  },
};

const TWO_FIELD_SCHEMA: SettingsSchema = {
  x: { type: "number", label: "X", default: 1, min: 0, max: 100 },
  y: { type: "text", label: "Y", default: "z" },
};

function buildManifest(
  name: string,
  settings: SettingsSchema | undefined,
): ExtensionManifestV2 {
  return {
    schemaVersion: 2,
    name,
    version: "1.0.0",
    description: `${name} test extension`,
    author: { name: "test" },
    permissions: {},
    settings,
  } as ExtensionManifestV2;
}

async function seedExtension(
  id: string,
  name: string,
  settings: SettingsSchema | undefined,
): Promise<void> {
  await getTestDb()
    .insert(extensions)
    .values({
      id,
      name,
      version: "1.0.0",
      description: `${name} test`,
      manifest: buildManifest(name, settings),
      source: `test:${id}`,
      installPath: `/tmp/${id}`,
      enabled: true,
      grantedPermissions: { grantedAt: {} } as never,
    } as never);
}

async function updateExtensionSettings(
  id: string,
  name: string,
  settings: SettingsSchema | undefined,
): Promise<void> {
  const { eq } = await import("drizzle-orm");
  await getTestDb()
    .update(extensions)
    .set({ manifest: buildManifest(name, settings) })
    .where(eq(extensions.id, id));
}

async function seedUser(id: string, email: string): Promise<void> {
  await getTestDb()
    .insert(users)
    .values({
      id,
      email,
      passwordHash: "x",
      name: email,
      role: "member",
      status: "active",
    } as never);
}

describe("extension-settings CRUD", () => {
  beforeEach(async () => {
    await setupTestDb();
  });
  afterAll(async () => await closeTestDb());

  test("getGlobalSettings returns {} when no row exists", async () => {
    await seedExtension("ext-1", "kokoro", VOICE_SCHEMA);
    expect(await getGlobalSettings("ext-1")).toEqual({});
  });

  test("getUserSettings returns {} when no row exists", async () => {
    await seedExtension("ext-1", "kokoro", VOICE_SCHEMA);
    await seedUser("user-1", "u1@test");
    expect(await getUserSettings("user-1", "ext-1")).toEqual({});
  });

  test("round-trip global: set then get returns the clamped shape", async () => {
    await seedExtension("ext-1", "kokoro", VOICE_SCHEMA);
    await seedUser("admin-1", "a@test");
    await setGlobalSettings(
      "ext-1",
      { voice: "am_adam", speed: 1.5 },
      "admin-1",
    );
    expect(await getGlobalSettings("ext-1")).toEqual({
      voice: "am_adam",
      speed: 1.5,
    });
  });

  test("setGlobalSettings is idempotent on the primary key", async () => {
    await seedExtension("ext-1", "kokoro", VOICE_SCHEMA);
    await seedUser("admin-1", "a@test");
    await setGlobalSettings("ext-1", { voice: "af_bella" }, "admin-1");
    await setGlobalSettings("ext-1", { voice: "am_adam" }, "admin-1");
    expect(await getGlobalSettings("ext-1")).toEqual({ voice: "am_adam" });
  });

  test("setGlobalSettings clamps unknown keys before persisting", async () => {
    await seedExtension("ext-1", "kokoro", VOICE_SCHEMA);
    await seedUser("admin-1", "a@test");
    await setGlobalSettings(
      "ext-1",
      { voice: "af_bella", mystery: "drop me", evil: 999 },
      "admin-1",
    );
    expect(await getGlobalSettings("ext-1")).toEqual({ voice: "af_bella" });
  });

  test("setGlobalSettings drops invalid values", async () => {
    await seedExtension("ext-1", "kokoro", VOICE_SCHEMA);
    await seedUser("admin-1", "a@test");
    await setGlobalSettings(
      "ext-1",
      { voice: "not-a-voice", speed: 999 },
      "admin-1",
    );
    expect(await getGlobalSettings("ext-1")).toEqual({});
  });

  test("setGlobalSettings accepts null actorUserId", async () => {
    await seedExtension("ext-1", "kokoro", VOICE_SCHEMA);
    await setGlobalSettings("ext-1", { voice: "af_bella" }, null);
    expect(await getGlobalSettings("ext-1")).toEqual({ voice: "af_bella" });
  });

  test("round-trip user: set then get returns the clamped shape", async () => {
    await seedExtension("ext-1", "kokoro", VOICE_SCHEMA);
    await seedUser("user-1", "u1@test");
    await setUserSettings("user-1", "ext-1", { voice: "am_adam", speed: 0.75 });
    expect(await getUserSettings("user-1", "ext-1")).toEqual({
      voice: "am_adam",
      speed: 0.75,
    });
  });

  test("setUserSettings is idempotent on the composite primary key", async () => {
    await seedExtension("ext-1", "kokoro", VOICE_SCHEMA);
    await seedUser("user-1", "u1@test");
    await setUserSettings("user-1", "ext-1", { voice: "af_bella" });
    await setUserSettings("user-1", "ext-1", { voice: "am_adam" });
    expect(await getUserSettings("user-1", "ext-1")).toEqual({
      voice: "am_adam",
    });
  });

  test("setUserSettings clamps unknown keys before persisting", async () => {
    await seedExtension("ext-1", "kokoro", VOICE_SCHEMA);
    await seedUser("user-1", "u1@test");
    await setUserSettings("user-1", "ext-1", {
      voice: "am_adam",
      mystery: "drop",
      bad: { nested: true },
    });
    expect(await getUserSettings("user-1", "ext-1")).toEqual({
      voice: "am_adam",
    });
  });

  test("clearUserSettings removes the row", async () => {
    await seedExtension("ext-1", "kokoro", VOICE_SCHEMA);
    await seedUser("user-1", "u1@test");
    await setUserSettings("user-1", "ext-1", { voice: "am_adam" });
    await clearUserSettings("user-1", "ext-1");
    expect(await getUserSettings("user-1", "ext-1")).toEqual({});
  });

  test("clearUserSettings is a no-op when no row exists", async () => {
    await seedExtension("ext-1", "kokoro", VOICE_SCHEMA);
    await seedUser("user-1", "u1@test");
    await clearUserSettings("user-1", "ext-1");
    expect(await getUserSettings("user-1", "ext-1")).toEqual({});
  });

  test("user settings of one user do not leak to another", async () => {
    await seedExtension("ext-1", "kokoro", VOICE_SCHEMA);
    await seedUser("user-1", "u1@test");
    await seedUser("user-2", "u2@test");
    await setUserSettings("user-1", "ext-1", { voice: "am_adam" });
    expect(await getUserSettings("user-2", "ext-1")).toEqual({});
  });

  // ── resolveExtensionSettings ──────────────────────────────────────

  test("resolves declared < global < user", async () => {
    await seedExtension("ext-2", "two", TWO_FIELD_SCHEMA);
    await seedUser("admin-1", "a@test");
    await seedUser("user-1", "u@test");
    await setGlobalSettings("ext-2", { x: 2 }, "admin-1");
    await setUserSettings("user-1", "ext-2", { y: "u" });
    expect(await resolveExtensionSettings("ext-2", "user-1")).toEqual({
      x: 2,
      y: "u",
    });
    await setUserSettings("user-1", "ext-2", { x: 3 });
    expect(await resolveExtensionSettings("ext-2", "user-1")).toEqual({
      x: 3,
      y: "z",
    });
  });

  test("with null userId, falls back to declared < global only", async () => {
    await seedExtension("ext-2", "two", TWO_FIELD_SCHEMA);
    await seedUser("admin-1", "a@test");
    await setGlobalSettings("ext-2", { x: 2 }, "admin-1");
    expect(await resolveExtensionSettings("ext-2", null)).toEqual({
      x: 2,
      y: "z",
    });
  });

  test("returns {} for an extension with no `settings` block", async () => {
    await seedExtension("ext-noset", "noset", undefined);
    await seedUser("user-1", "u@test");
    expect(await resolveExtensionSettings("ext-noset", "user-1")).toEqual({});
    expect(await resolveExtensionSettings("ext-noset", null)).toEqual({});
  });

  test("returns {} when the extension does not exist", async () => {
    expect(await resolveExtensionSettings("nope", null)).toEqual({});
  });

  test("returns just declared defaults when no rows persisted", async () => {
    await seedExtension("ext-2", "two", TWO_FIELD_SCHEMA);
    await seedUser("user-1", "u@test");
    expect(await resolveExtensionSettings("ext-2", "user-1")).toEqual({
      x: 1,
      y: "z",
    });
  });

  test("drops keys removed from the schema after the row was written", async () => {
    await seedExtension("ext-2", "two", TWO_FIELD_SCHEMA);
    await seedUser("admin-1", "a@test");
    await seedUser("user-1", "u@test");
    await setGlobalSettings("ext-2", { x: 50, y: "global" }, "admin-1");
    await setUserSettings("user-1", "ext-2", { x: 75, y: "user" });
    // Simulate a manifest update that demotes `y` out of the schema.
    const SHRUNK: SettingsSchema = {
      x: { type: "number", label: "X", default: 1, min: 0, max: 100 },
    };
    await updateExtensionSettings("ext-2", "two", SHRUNK);
    expect(await resolveExtensionSettings("ext-2", "user-1")).toEqual({ x: 75 });
  });
});
