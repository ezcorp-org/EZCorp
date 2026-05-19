/**
 * Integration coverage for `reopenInstalledAsDraft` — the shared
 * owner-scoped "modify my extension" entry point used by BOTH the
 * in-chat `ezcorp/drafts.reopen` RPC and the web Modify route.
 *
 * Real PGlite (extensions + ez_drafts) + real fs (installed dir →
 * materialized draft dir under a tmp cwd). Mirrors the test-pglite
 * harness from `bundled-grant-reconcile-drafts.test.ts`.
 */

import {
  test,
  expect,
  describe,
  beforeAll,
  afterAll,
  afterEach,
  mock,
} from "bun:test";

mock.module("../db/connection", () => ({
  getDb: () => {
    const pg = getTestPglite();
    if (!pg) throw new Error("Test DB not initialized — call setupTestDb() first");
    const { drizzle } = require("drizzle-orm/pglite");
    const schema = require("../db/schema");
    return drizzle(pg, { schema });
  },
  getPglite: () => getTestPglite(),
  getDbPath: () => ":memory:",
  initDb: async () => {},
  closeDb: async () => {},
}));

import { setupTestDb, closeTestDb, getTestPglite } from "./helpers/test-pglite";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const OWNER = "user-reopen-owner";
const STRANGER = "user-reopen-stranger";

let tmpRoot = "";
let prevCwd = "";

async function seedInstalled(over: Record<string, unknown>) {
  const { createExtension } = await import("../db/queries/extensions");
  const name = over.name as string;
  const installPath = join(tmpRoot, ".ezcorp/extensions", name);
  mkdirSync(installPath, { recursive: true });
  writeFileSync(
    join(installPath, "ezcorp.config.ts"),
    `export default { name: "${name}" };\n`,
  );
  writeFileSync(join(installPath, "index.ts"), "// installed code\n");
  return createExtension({
    name,
    version: "1.0.0",
    description: "x",
    manifest: {
      schemaVersion: 2,
      name,
      version: "1.0.0",
      description: "x",
      author: { name: "t" },
      entrypoint: "index.ts",
      tools: [{ name: "t", description: "d", inputSchema: { type: "object" } }],
    } as never,
    source: `local:${installPath}`,
    installPath,
    enabled: true,
    grantedPermissions: { grantedAt: {} } as never,
    checksumVerified: true,
    consecutiveFailures: 0,
    ...over,
  } as never);
}

describe("reopenInstalledAsDraft", () => {
  beforeAll(async () => {
    tmpRoot = mkdtempSync(join(tmpdir(), "reopen-ext-"));
    prevCwd = process.cwd();
    process.chdir(tmpRoot);
    await setupTestDb();
    const { getDb } = await import("../db/connection");
    const { users } = await import("../db/schema");
    for (const id of [OWNER, STRANGER]) {
      await getDb()
        .insert(users)
        .values({ id, email: `${id}@t.local`, passwordHash: "x", name: id } as never)
        .onConflictDoNothing();
    }
  });
  afterAll(async () => {
    await closeTestDb();
    if (prevCwd) try { process.chdir(prevCwd); } catch { /* */ }
    if (tmpRoot) try { rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* */ }
  });
  afterEach(async () => {
    const { getDb } = await import("../db/connection");
    const { extensions, ezDrafts } = await import("../db/schema");
    await getDb().delete(ezDrafts);
    await getDb().delete(extensions);
  });

  test("owner + modifiable → mints an author draft stamped with modifyOf", async () => {
    const { reopenInstalledAsDraft } = await import("../extensions/reopen-extension");
    const { getDraft } = await import("../db/queries/ez-drafts");
    const ext = await seedInstalled({
      name: "rw-ok",
      creatorUserId: OWNER,
      modifiable: true,
    });

    const { draftId, name } = await reopenInstalledAsDraft("rw-ok", OWNER);
    expect(name).toBe("rw-ok");
    const row = await getDraft(draftId, OWNER);
    expect(row).toBeDefined();
    const payload = row!.payload as Record<string, unknown>;
    expect(payload.mode).toBe("author"); // reuses the existing pipeline
    expect(payload.modifyOf).toBe(ext.id); // sanctioned-modify marker
    expect(payload.type).toBe("tool"); // has tools → verify gate applies
  });

  test("resolvable by id as well as name", async () => {
    const { reopenInstalledAsDraft } = await import("../extensions/reopen-extension");
    const ext = await seedInstalled({
      name: "rw-byid",
      creatorUserId: OWNER,
      modifiable: true,
    });
    const { name } = await reopenInstalledAsDraft(ext.id, OWNER);
    expect(name).toBe("rw-byid");
  });

  test("opaque ReopenError for not-owner / flag-off / bundled", async () => {
    const { reopenInstalledAsDraft, ReopenError } = await import(
      "../extensions/reopen-extension"
    );
    await seedInstalled({ name: "rw-a", creatorUserId: OWNER, modifiable: true });
    await seedInstalled({ name: "rw-b", creatorUserId: OWNER, modifiable: false });
    await seedInstalled({
      name: "rw-c",
      creatorUserId: OWNER,
      modifiable: true,
      isBundled: true,
    });

    for (const [arg, user] of [
      ["rw-a", STRANGER], // not owner
      ["rw-b", OWNER], // flag off
      ["rw-c", OWNER], // bundled
      ["rw-missing", OWNER], // missing
    ] as const) {
      let code = "";
      try {
        await reopenInstalledAsDraft(arg, user);
      } catch (e) {
        code = e instanceof ReopenError ? e.code : `OTHER`;
      }
      expect(code).toBe("NOT_FOUND_OR_NOT_MODIFIABLE");
    }
  });
});
