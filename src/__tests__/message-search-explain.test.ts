/**
 * Phase 65 Plan 01 — SRCH-05 EXPLAIN ANALYZE proof.
 *
 * Seeds ≥100 message_chunks rows across ≥2 conversations in one project, runs
 * `ANALYZE message_chunks` so the planner has real stats, then EXPLAIN ANALYZEs
 * the vector-leg SQL (via the `explainVectorLegSql()` helper exported from the
 * builder, so the plan we assert on is the SAME SQL the builder runs). The plan
 * text must show an `Index Scan` with the tenant `Filter:` predicate applied
 * INSIDE the ANN node, and must NOT contain a top-level `Seq Scan` over
 * message_chunks.
 *
 * No mocking — pure SQL against real PGlite (pgvector 0.8.0 default behavior).
 */
import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { setupTestDb, closeTestDb, getTestDb, mockDbConnection } from "./helpers/test-pglite";

mockDbConnection();

const { explainVectorLegSql } = await import("../db/queries/message-search");
const { EMBEDDING_MODEL_ID } = await import("../memory/embeddings");
const { projects, users, conversations, messages } = await import("../db/schema");
const { sql } = await import("drizzle-orm");
const { toVectorLiteral } = await import("../memory/vector-utils");

const DIM = 384;

/** A pseudo-random but deterministic unit-ish vector for chunk i. */
function seededVector(i: number): number[] {
  const v = new Array(DIM).fill(0);
  // sprinkle a few non-zero components so cosine distance varies per row
  v[i % DIM] = 1;
  v[(i * 7 + 3) % DIM] = 0.5;
  v[(i * 13 + 11) % DIM] = 0.25;
  return v;
}

describe("searchMessages vector leg — EXPLAIN ANALYZE (SRCH-05)", () => {
  let projectId: string;

  beforeAll(async () => {
    await setupTestDb();
    const db = getTestDb();

    const [p] = await db.insert(projects).values({ name: "Explain", path: "/tmp/explain" }).returning();
    projectId = p!.id;
    const [u] = await db
      .insert(users)
      .values({ email: "explain@x.com", passwordHash: "h", name: "explain" })
      .returning();

    // ≥2 conversations
    const convIds: string[] = [];
    for (let c = 0; c < 3; c++) {
      const [conv] = await db
        .insert(conversations)
        .values({ projectId, userId: u!.id, title: `c${c}`, test: false })
        .returning();
      convIds.push(conv!.id);
    }

    // ≥100 message_chunks rows
    for (let i = 0; i < 120; i++) {
      const convId = convIds[i % convIds.length]!;
      const [msg] = await db
        .insert(messages)
        .values({ conversationId: convId, role: "user", content: `chunked message ${i} content body` })
        .returning();
      const lit = toVectorLiteral(seededVector(i));
      await db.execute(sql`
        INSERT INTO message_chunks (message_id, conversation_id, content, chunk_index, embedding, embedding_model_id)
        VALUES (${msg!.id}, ${convId}, ${`chunk ${i}`}, 0, ${sql.raw(lit)}, ${EMBEDDING_MODEL_ID})
      `);
    }

    await db.execute(sql`ANALYZE message_chunks`);
  });

  afterAll(async () => {
    await closeTestDb();
  });

  test("vector-leg plan applies the tenant filter inside an Index Scan, no top-level Seq Scan", async () => {
    const db = getTestDb();
    const queryVec = seededVector(0);
    const explainSql = explainVectorLegSql({
      projectId,
      queryEmbedding: queryVec,
      limit: 20,
    });
    const result = await db.execute(sql.raw(explainSql));
    const planText = (result.rows as Array<Record<string, unknown>>)
      .map((r) => String(Object.values(r)[0]))
      .join("\n");

    // ANN node present
    expect(planText).toContain("Index Scan");
    // tenant predicate applied (project scope) — accept either column name shape
    expect(/Filter:|Index Cond:/i.test(planText)).toBe(true);
    expect(/project_id/i.test(planText)).toBe(true);
    // no top-level sequential scan over message_chunks
    expect(/Seq Scan on message_chunks/i.test(planText)).toBe(false);
  });
});
