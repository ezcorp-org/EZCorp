/**
 * Coverage for `ScheduleDaemon` + reconciler (Phase 51.5).
 */
import { test, expect, describe, beforeAll, beforeEach, afterAll, mock } from "bun:test";
import { restoreModuleMocks } from "../../__tests__/helpers/mock-cleanup";
import {
  setupTestDb, closeTestDb, mockDbConnection, getTestDb,
} from "../../__tests__/helpers/test-pglite";

mock.module("../../db/queries/settings", () => ({
  async getAllSettings() { return {}; },
  async getSetting() { return undefined; },
  async upsertSetting() {},
  async deleteSetting() { return false; },
  async isListingInstalled() { return false; },
}));

mockDbConnection();

import { reconcileSchedules, _wipeSchedulesForTests } from "../schedule-reconcile";
import { ScheduleDaemon } from "../schedule-daemon";
import { extensionSchedules, extensionScheduleFires, extensions, auditLog } from "../../db/schema";
import { eq } from "drizzle-orm";

let extId: string;
let extId2: string;

async function ensureExtension(name: string): Promise<string> {
  const [row] = await getTestDb().insert(extensions).values({
    name, version: "0.0.1", description: "",
    manifest: { schemaVersion: 2, name, version: "0.0.1", description: "", author: { name: "t" }, permissions: {} } as any,
    source: "test", enabled: true, grantedPermissions: {} as any,
  }).returning({ id: extensions.id });
  return row!.id;
}

beforeAll(async () => {
  await setupTestDb();
  extId = await ensureExtension("sched-ext-1");
  extId2 = await ensureExtension("sched-ext-2");
});

beforeEach(async () => {
  await getTestDb().delete(extensionScheduleFires);
  await _wipeSchedulesForTests(extId);
  await _wipeSchedulesForTests(extId2);
  await getTestDb().delete(auditLog);
});

afterAll(async () => {
  restoreModuleMocks();
  await closeTestDb();
});

describe("reconcileSchedules", () => {
  test("first install adds new rows", async () => {
    const r = await reconcileSchedules(extId, ["0 * * * *", "*/15 * * * *"]);
    expect(r.added).toBe(2);
    const rows = await getTestDb().select().from(extensionSchedules).where(eq(extensionSchedules.extensionId, extId));
    expect(rows.length).toBe(2);
  });

  test("second pass with same crons preserves rows + history", async () => {
    await reconcileSchedules(extId, ["0 * * * *"]);
    const before = await getTestDb().select().from(extensionSchedules).where(eq(extensionSchedules.extensionId, extId));
    const r = await reconcileSchedules(extId, ["0 * * * *"]);
    expect(r.added).toBe(0);
    expect(r.preserved).toBe(1);
    const after = await getTestDb().select().from(extensionSchedules).where(eq(extensionSchedules.extensionId, extId));
    expect(after[0]!.id).toBe(before[0]!.id);
  });

  test("removed crons soft-disabled (not deleted)", async () => {
    await reconcileSchedules(extId, ["0 * * * *", "*/15 * * * *"]);
    await reconcileSchedules(extId, ["0 * * * *"]);
    const rows = await getTestDb().select().from(extensionSchedules).where(eq(extensionSchedules.extensionId, extId));
    expect(rows.length).toBe(2);
    const enabled = rows.filter((r) => r.enabled);
    const disabled = rows.filter((r) => !r.enabled);
    expect(enabled.length).toBe(1);
    expect(disabled.length).toBe(1);
    expect(disabled[0]!.cron).toBe("*/15 * * * *");
  });

  test("invalid crons silently dropped (max 8)", async () => {
    const crons = [
      "0 * * * *",
      "* * * * *",  // sub-5-min — drop
      "@hourly",     // shorthand — drop
      "0 9 * * 1-5",
    ];
    const r = await reconcileSchedules(extId, crons);
    expect(r.added).toBe(2);
  });
});

describe("ScheduleDaemon — claim-before-dispatch", () => {
  test("tick claims due rows, advances next_fire_at, writes fire history", async () => {
    // Schedule a row whose next_fire_at is already in the past.
    const past = new Date(Date.now() - 60_000);
    const [sched] = await getTestDb().insert(extensionSchedules).values({
      extensionId: extId, cron: "0 * * * *",
      nextFireAt: past, enabled: true,
    }).returning();

    const daemon = new ScheduleDaemon({ wakeIntervalMs: 60_000 });
    const result = await daemon.tick();
    expect(result.claimed).toBe(1);

    // next_fire_at advanced.
    const [advanced] = await getTestDb().select().from(extensionSchedules).where(eq(extensionSchedules.id, sched!.id));
    expect(advanced!.nextFireAt.getTime()).toBeGreaterThan(past.getTime());

    // Fire row written.
    const fires = await getTestDb().select().from(extensionScheduleFires).where(eq(extensionScheduleFires.scheduleId, sched!.id));
    expect(fires.length).toBe(1);
    expect(fires[0]!.status).toBe("ok");
    daemon.stop();
  });

  test("tick is idempotent for not-yet-due schedules", async () => {
    const future = new Date(Date.now() + 60 * 60_000);
    await getTestDb().insert(extensionSchedules).values({
      extensionId: extId, cron: "0 * * * *",
      nextFireAt: future, enabled: true,
    });
    const daemon = new ScheduleDaemon();
    const result = await daemon.tick();
    expect(result.claimed).toBe(0);
    daemon.stop();
  });

  test("disabled schedules never fire", async () => {
    const past = new Date(Date.now() - 60_000);
    await getTestDb().insert(extensionSchedules).values({
      extensionId: extId, cron: "0 * * * *",
      nextFireAt: past, enabled: false,
    });
    const daemon = new ScheduleDaemon();
    const result = await daemon.tick();
    expect(result.claimed).toBe(0);
    daemon.stop();
  });

  test("registry-less mode marks fires as 'ok' (test-only)", async () => {
    const past = new Date(Date.now() - 60_000);
    await getTestDb().insert(extensionSchedules).values({
      extensionId: extId, cron: "0 * * * *",
      nextFireAt: past, enabled: true,
    });
    const daemon = new ScheduleDaemon();
    await daemon.tick();
    const fires = await getTestDb().select().from(extensionScheduleFires);
    expect(fires.every((f) => f.status === "ok")).toBe(true);
    daemon.stop();
  });
});

describe("ScheduleDaemon — error path", () => {
  test("subprocess sendNotification failure → fire status 'error', consecutiveErrors increments", async () => {
    const past = new Date(Date.now() - 60_000);
    await getTestDb().insert(extensionSchedules).values({
      extensionId: extId, cron: "0 * * * *",
      nextFireAt: past, enabled: true,
    });
    const daemon = new ScheduleDaemon({
      registry: {
        getProcessIfRunning() {
          return {
            isRunning: true,
            sendNotification() {
              throw new Error("subprocess kaput");
            },
          } as any;
        },
      },
    });
    await daemon.tick();
    const sched = await getTestDb().select().from(extensionSchedules).where(eq(extensionSchedules.extensionId, extId));
    expect(sched[0]!.consecutiveErrors).toBe(1);
    expect(sched[0]!.lastFireStatus).toBe("error");
    daemon.stop();
  });

  test("5 consecutive errors → schedule auto-disabled + audit row", async () => {
    // Manually seed a schedule with 4 errors.
    const past = new Date(Date.now() - 60_000);
    const [sched] = await getTestDb().insert(extensionSchedules).values({
      extensionId: extId, cron: "0 * * * *",
      nextFireAt: past, enabled: true, consecutiveErrors: 4,
    }).returning();
    const daemon = new ScheduleDaemon({
      registry: {
        getProcessIfRunning() {
          return {
            isRunning: true,
            sendNotification() { throw new Error("boom"); },
          } as any;
        },
      },
    });
    await daemon.tick();
    const advanced = await getTestDb().select().from(extensionSchedules).where(eq(extensionSchedules.id, sched!.id));
    expect(advanced[0]!.enabled).toBe(false);
    expect(advanced[0]!.consecutiveErrors).toBe(5);

    const audits = await getTestDb().select().from(auditLog).where(eq(auditLog.action, "ext:sdk-schedule-disabled"));
    expect(audits.length).toBe(1);
    daemon.stop();
  });
});
