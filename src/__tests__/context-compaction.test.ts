/**
 * Unit tests for per-model history compaction
 * (`src/runtime/stream-chat/context-compaction.ts`). Pure module — no
 * DB, no mocks. Covers token estimation, turn-block splitting, budget
 * math, the strategy registry, the `trim`/`none` built-ins, and the
 * `makeCompactionTransform` wiring (incl. a custom strategy).
 */
import { test, expect, describe } from "bun:test";
import {
  DEFAULTS,
  estimateMessageTokens,
  estimateTokens,
  splitTurnBlocks,
  computeResponseReserve,
  computeInputBudget,
  registerCompactionStrategy,
  getCompactionStrategy,
  listCompactionStrategies,
  isCompactionMarker,
  makeCompactionTransform,
  type CompactionContext,
  type CompactionStrategy,
} from "../runtime/stream-chat/context-compaction";

// ── Fixtures ─────────────────────────────────────────────────────────

type Msg = any;

const userMsg = (text: string): Msg => ({ role: "user", content: text, timestamp: 1 });
const userImg = (n: number): Msg => ({
  role: "user",
  content: Array.from({ length: n }, () => ({ type: "image", data: "x", mimeType: "image/png" })),
  timestamp: 1,
});
const asstText = (text: string): Msg => ({
  role: "assistant",
  content: [{ type: "text", text }],
  api: "x", provider: "x", model: "x", usage: {}, stopReason: "stop", timestamp: 1,
});
const asstToolCall = (id: string, name: string, args: object): Msg => ({
  role: "assistant",
  content: [{ type: "toolCall", id, name, arguments: args }],
  api: "x", provider: "x", model: "x", usage: {}, stopReason: "toolUse", timestamp: 1,
});
const toolResult = (id: string, text: string): Msg => ({
  role: "toolResult",
  toolCallId: id,
  toolName: "t",
  content: [{ type: "text", text }],
  isError: false,
  timestamp: 1,
});

const fakeModel = (contextWindow: number, maxTokens: number): any => ({
  id: "test-model",
  contextWindow,
  maxTokens,
});

const mkCtx = (budget: number, cfg = DEFAULTS): CompactionContext => ({
  model: fakeModel(1, 1),
  budget,
  cfg,
  estimateTokens: (m) => estimateTokens(m, cfg),
  splitTurnBlocks,
});

// ── Token estimation ─────────────────────────────────────────────────

describe("estimateTokens", () => {
  test("user string: overhead + ceil(chars/cpt)", () => {
    expect(estimateMessageTokens(userMsg("hello"))).toBe(4 + Math.ceil(5 / 4));
  });

  test("images charged a flat per-image cost", () => {
    expect(estimateMessageTokens(userImg(2))).toBe(4 + 2 * DEFAULTS.imageTokens);
  });

  test("assistant toolCall counts name + serialized arguments", () => {
    const m = asstToolCall("c1", "search", { q: "abc" });
    const chars = "search".length + JSON.stringify({ q: "abc" }).length;
    expect(estimateMessageTokens(m)).toBe(4 + Math.ceil(chars / 4));
  });

  test("toolResult counts toolName + content text", () => {
    const m = toolResult("c1", "result-body");
    const chars = "t".length + "result-body".length;
    expect(estimateMessageTokens(m)).toBe(4 + Math.ceil(chars / 4));
  });

  test("non-LLM custom messages contribute zero", () => {
    expect(estimateMessageTokens({ role: "capability-event", foo: 1 } as Msg)).toBe(0);
    expect(estimateMessageTokens({ kind: "ui-only" } as Msg)).toBe(0);
  });

  test("monotonic in text length", () => {
    expect(estimateMessageTokens(userMsg("a".repeat(400)))).toBeGreaterThan(
      estimateMessageTokens(userMsg("a".repeat(40))),
    );
  });

  test("sums across messages", () => {
    const msgs = [userMsg("aaaa"), asstText("bbbb")];
    expect(estimateTokens(msgs)).toBe(
      estimateMessageTokens(msgs[0]) + estimateMessageTokens(msgs[1]),
    );
  });
});

// ── Turn blocks ──────────────────────────────────────────────────────

describe("splitTurnBlocks", () => {
  test("splits at each user boundary; tool loop stays in its turn", () => {
    const msgs = [
      userMsg("u1"),
      asstToolCall("c1", "t", {}),
      toolResult("c1", "r1"),
      asstText("a1"),
      userMsg("u2"),
      asstText("a2"),
    ];
    const blocks = splitTurnBlocks(msgs);
    expect(blocks.length).toBe(2);
    expect(blocks[0].length).toBe(4);
    expect(blocks[1].length).toBe(2);
    // Last block is the active turn.
    expect(blocks[blocks.length - 1][0]).toBe(msgs[4]);
  });

  test("leading non-user messages form their own first block", () => {
    const msgs = [asstText("preamble"), userMsg("u1")];
    const blocks = splitTurnBlocks(msgs);
    expect(blocks.length).toBe(2);
    expect(blocks[0]).toEqual([msgs[0]]);
  });

  test("empty input → no blocks", () => {
    expect(splitTurnBlocks([])).toEqual([]);
  });
});

// ── Budget math ──────────────────────────────────────────────────────

describe("computeResponseReserve", () => {
  test("clamps Codex 128k down to the cap", () => {
    expect(computeResponseReserve({ maxTokens: 128_000 })).toBe(DEFAULTS.responseReserveCap);
  });
  test("clamps tiny maxTokens up to the floor", () => {
    expect(computeResponseReserve({ maxTokens: 500 })).toBe(DEFAULTS.responseReserveFloor);
  });
  test("passes through a mid-range value", () => {
    expect(computeResponseReserve({ maxTokens: 8_000 })).toBe(8_000);
  });
  test("missing/zero maxTokens falls back to the cap", () => {
    expect(computeResponseReserve({ maxTokens: 0 })).toBe(DEFAULTS.responseReserveCap);
  });
});

describe("computeInputBudget", () => {
  test("Codex 272k/128k → 234240", () => {
    const budget = computeInputBudget({ contextWindow: 272_000, maxTokens: 128_000 });
    // 272000 - 16000 - ceil(272000 * 0.08)=21760
    expect(budget).toBe(272_000 - 16_000 - 21_760);
  });
  test("never negative for a tiny window", () => {
    expect(computeInputBudget({ contextWindow: 1_000, maxTokens: 500 })).toBeGreaterThanOrEqual(1);
  });
  test("missing contextWindow falls back to 128k baseline", () => {
    const budget = computeInputBudget({ contextWindow: 0, maxTokens: 8_000 });
    expect(budget).toBe(128_000 - 8_000 - Math.ceil(128_000 * 0.08));
  });
});

// ── Registry ─────────────────────────────────────────────────────────

describe("strategy registry", () => {
  test("built-ins registered", () => {
    expect(listCompactionStrategies()).toEqual(expect.arrayContaining(["trim", "none"]));
    expect(getCompactionStrategy("trim").name).toBe("trim");
    expect(getCompactionStrategy("none").name).toBe("none");
  });

  test("unknown name falls back to trim", () => {
    expect(getCompactionStrategy("does-not-exist").name).toBe("trim");
  });

  test("register + retrieve a custom strategy", () => {
    const custom: CompactionStrategy = {
      name: "unit-custom",
      async compact(messages) {
        return { messages, droppedCount: 0, droppedTokens: 0, strategy: "unit-custom" };
      },
    };
    registerCompactionStrategy(custom);
    expect(getCompactionStrategy("unit-custom")).toBe(custom);
  });

  test("none strategy is an exact passthrough", async () => {
    const msgs = [userMsg("a"), asstText("b")];
    const res = await getCompactionStrategy("none").compact(msgs, mkCtx(0));
    expect(res.messages).toBe(msgs);
    expect(res.droppedCount).toBe(0);
  });
});

// ── TrimStrategy ─────────────────────────────────────────────────────

describe("trim strategy", () => {
  const trim = getCompactionStrategy("trim");

  test("drops oldest turns, keeps the active turn, inserts one marker", async () => {
    const turns = Array.from({ length: 10 }, (_, i) => userMsg("x".repeat(400) + i));
    const res = await trim.compact(turns, mkCtx(300));

    expect(isCompactionMarker(res.messages[0])).toBe(true);
    expect(res.messages.filter(isCompactionMarker).length).toBe(1);
    // Active (last) turn preserved by identity.
    expect(res.messages[res.messages.length - 1]).toBe(turns[turns.length - 1]);
    expect(res.droppedCount).toBeGreaterThan(0);
    expect(res.droppedCount).toBe(10 - (res.messages.length - 1));
    expect(estimateTokens(res.messages)).toBeLessThanOrEqual(300);
  });

  test("no-op when already within budget", async () => {
    const msgs = [userMsg("a"), asstText("b")];
    const res = await trim.compact(msgs, mkCtx(10_000));
    expect(res.messages).toBe(msgs);
    expect(res.droppedCount).toBe(0);
  });

  test("preserves toolCall/toolResult pairing in survivors", async () => {
    const msgs: Msg[] = [];
    for (let i = 0; i < 8; i++) {
      msgs.push(userMsg("u".repeat(200) + i));
      msgs.push(asstToolCall(`call-${i}`, "search", { q: "z".repeat(200) }));
      msgs.push(toolResult(`call-${i}`, "r".repeat(200)));
      msgs.push(asstText("done" + i));
    }
    const res = await trim.compact(msgs, mkCtx(800));

    const callIds = new Set<string>();
    for (const m of res.messages) {
      if (m.role === "assistant") {
        for (const p of m.content) if (p.type === "toolCall") callIds.add(p.id);
      }
    }
    for (const m of res.messages) {
      if (m.role === "toolResult") {
        expect(callIds.has(m.toolCallId)).toBe(true);
      }
    }
    expect(estimateTokens(res.messages)).toBeLessThanOrEqual(800);
  });

  test("degenerate single oversized turn → tool-result truncated, user prompt intact", async () => {
    const msgs = [userMsg("short question"), toolResult("c1", "BIG".repeat(5_000))];
    const res = await trim.compact(msgs, mkCtx(50));

    expect(res.droppedCount).toBe(0);
    expect(res.droppedTokens).toBeGreaterThan(0);
    const user = res.messages.find((m: any) => m.role === "user") as any;
    expect(user.content).toBe("short question");
    const tr = res.messages.find((m: any) => m.role === "toolResult") as any;
    expect(tr.content[0].text).toContain("truncated to fit context");
  });

  test("does not accumulate markers across passes", async () => {
    const turns = Array.from({ length: 8 }, (_, i) => userMsg("y".repeat(400) + i));
    const first = await trim.compact(turns, mkCtx(300));
    const second = await trim.compact(first.messages, mkCtx(300));
    expect(second.messages.filter(isCompactionMarker).length).toBe(1);
  });
});

// ── makeCompactionTransform ──────────────────────────────────────────

describe("makeCompactionTransform", () => {
  test("returns the same array untouched when under budget", async () => {
    const transform = makeCompactionTransform(fakeModel(272_000, 128_000));
    const msgs = [userMsg("hello"), asstText("hi")];
    expect(await transform(msgs)).toBe(msgs);
  });

  test("trims a long history below the computed budget", async () => {
    const transform = makeCompactionTransform(fakeModel(1_000, 1_000), {
      safetyFraction: 0,
      responseReserveFloor: 0,
      responseReserveCap: 0,
    });
    const turns = Array.from({ length: 30 }, (_, i) => userMsg("z".repeat(400) + i));
    const out = await transform(turns);
    expect(out.length).toBeLessThan(turns.length);
    expect(isCompactionMarker(out[0])).toBe(true);
    expect(estimateTokens(out)).toBeLessThanOrEqual(1_000);
  });

  test("honors a custom strategy selected via config", async () => {
    const sentinel = userMsg("SENTINEL");
    registerCompactionStrategy({
      name: "xform-test",
      async compact() {
        return { messages: [sentinel], droppedCount: 99, droppedTokens: 1, strategy: "xform-test" };
      },
    });
    const transform = makeCompactionTransform(fakeModel(10, 0), {
      strategy: "xform-test",
      safetyFraction: 0,
      responseReserveFloor: 0,
      responseReserveCap: 0,
    });
    const out = await transform([userMsg("a".repeat(10_000))]);
    expect(out).toEqual([sentinel]);
  });

  test("strategy 'none' leaves an over-budget history unchanged", async () => {
    const transform = makeCompactionTransform(fakeModel(10, 0), {
      strategy: "none",
      safetyFraction: 0,
      responseReserveFloor: 0,
      responseReserveCap: 0,
    });
    const msgs = [userMsg("a".repeat(10_000)), asstText("b".repeat(10_000))];
    expect(await transform(msgs)).toBe(msgs);
  });
});
