/**
 * Phase 64 Plan 01 — Task 1: next_attempt_after column migration.
 *
 * Covers:
 *   - After migration runs, message_embed_outbox has a nullable
 *     next_attempt_after TIMESTAMPTZ column.
 *   - Column is NULL for freshly inserted rows (no default value).
 *   - Migration is idempotent — running twice does not error
 *     (ALTER TABLE ... ADD COLUMN IF NOT EXISTS).
 */
import { test, expect, describe, beforeEach, afterAll } from "bun:test";
import { sql } from "drizzle-orm";
import { setupTestDb, closeTestDb, getTestDb, mockDbConnection } from "./helpers/test-pglite";

mockDbConnection();

describe("message_embed_outbox.next_attempt_after column migration", () => {
  beforeEach(async () => {
    await setupTestDb();
  });
  afterAll(async () => {
    await closeTestDb();
  });

  test("next_attempt_after column exists and is nullable TIMESTAMPTZ", async () => {
    const db = getTestDb();
    const rows = await db.execute<{
      column_name: string;
      data_type: string;
      is_nullable: string;
    }>(sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'message_embed_outbox'
        AND column_name = 'next_attempt_after'
    `);
    const colRows = (rows as any).rows ?? rows;
    expect(colRows.length).toBe(1);
    const col = colRows[0]!;
    expect(col.column_name).toBe("next_attempt_after");
    // PGlite reports timestamp with time zone as "timestamp with time zone"
    expect(col.data_type).toBe("timestamp with time zone");
    expect(col.is_nullable).toBe("YES");
  });

  test("freshly inserted row has next_attempt_after = NULL (no default)", async () => {
    const db = getTestDb();
    // Insert a minimal row (matches the table's NOT NULL constraints).
    // We need a project + conversation first to satisfy FK constraints.
    await db.execute(sql`
      INSERT INTO projects (id, name, path) VALUES ('p-naa-1', 'p', '/tmp/p-naa-1')
      ON CONFLICT (id) DO NOTHING
    `);
    await db.execute(sql`
      INSERT INTO conversations (id, project_id, title)
      VALUES ('c-naa-1', 'p-naa-1', 'c')
      ON CONFLICT (id) DO NOTHING
    `);
    await db.execute(sql`
      INSERT INTO messages (id, conversation_id, role, content)
      VALUES ('m-naa-1', 'c-naa-1', 'system', 'x')
      ON CONFLICT (id) DO NOTHING
    `);
    await db.execute(sql`
      INSERT INTO message_embed_outbox (message_id, conversation_id)
      VALUES ('m-naa-1', 'c-naa-1')
      ON CONFLICT (message_id) DO NOTHING
    `);

    const rows = await db.execute<{ next_attempt_after: unknown }>(sql`
      SELECT next_attempt_after FROM message_embed_outbox WHERE message_id = 'm-naa-1'
    `);
    const resultRows = (rows as any).rows ?? rows;
    expect(resultRows.length).toBe(1);
    expect(resultRows[0]!.next_attempt_after).toBeNull();
  });

  test("migration is idempotent — running migrate() twice does not throw", async () => {
    // setupTestDb already ran migrate() once. Run it again via the real migrate function.
    const { migrate } = await import("../db/migrate");
    await expect(migrate(getTestDb())).resolves.toBeUndefined();
  });
});
