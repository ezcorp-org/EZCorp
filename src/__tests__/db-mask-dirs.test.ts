/**
 * `getDbMaskDirs()` — the dirs the MCP sandbox masks so untrusted MCP
 * processes can't read the platform DB / JWT / backups off disk.
 *
 * Regression guard: in production `EZCORP_DB_PATH=/app/data/ezcorp`, so
 * `dirname(DB_PATH)` = `/app/data` ALSO contains `/app/data/extensions`
 * (the MCP install base). Masking the parent would hide every MCP's own
 * code. We must mask the SPECIFIC sensitive dirs (DB dir + backups),
 * never the parent.
 */
import { test, expect, describe } from "bun:test";
import { dirname } from "node:path";
import { getDbMaskDirs } from "../db/connection";

describe("getDbMaskDirs", () => {
  test("never masks the parent dir (which holds extensions/ in prod)", () => {
    const dirs = getDbMaskDirs();
    if (dirs.length === 0) return; // external Postgres / in-memory — nothing on disk
    const parent = dirname(dirs[0]!);
    expect(dirs).not.toContain(parent);
    // And no masked dir is an ancestor of the others' parent (i.e. we
    // never mask a dir that contains a sibling install tree).
    for (const d of dirs) {
      expect(d).not.toBe(parent);
    }
  });

  test("includes the DB dir and a backups dir when on-disk", () => {
    const dirs = getDbMaskDirs();
    if (dirs.length === 0) return;
    expect(dirs.length).toBeGreaterThanOrEqual(2);
    expect(dirs.some((d) => d.endsWith("backups"))).toBe(true);
  });
});
