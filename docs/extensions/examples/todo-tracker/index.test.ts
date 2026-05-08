// Phase post-perm-cleanup, task B5 — unit tests for `parseTodoLine`.
//
// `parseTodoLine` is a pure regex/string-parsing function — no fs IO,
// no channel calls. These tests pin the metadata extraction surface
// (priority / tags / deadline) so a future regex tweak can't silently
// drop a recognized field.
//
// Coverage:
//   - bare TODO / FIXME / HACK
//   - priority parsing (case-insensitive value normalize to lowercase)
//   - tags single + multi
//   - deadline (and `due:` alias)
//   - all metadata combined
//   - unmatched line returns null
//   - case-insensitive comment marker
//   - text trimming

import { describe, expect, test } from "bun:test";
import { parseTodoLine } from "./index";

describe("parseTodoLine", () => {
  test("returns null for non-comment lines", () => {
    expect(parseTodoLine("const x = 1;", "src/x.ts", 5)).toBeNull();
    expect(parseTodoLine("// not a todo", "src/x.ts", 5)).toBeNull();
    expect(parseTodoLine("", "src/x.ts", 5)).toBeNull();
  });

  test("parses bare TODO/FIXME/HACK markers", () => {
    const todo = parseTodoLine("// TODO: write docs", "a.ts", 1)!;
    expect(todo).not.toBeNull();
    expect(todo.type).toBe("TODO");
    expect(todo.text).toBe("write docs");
    expect(todo.priority).toBe("");
    expect(todo.tags).toEqual([]);
    expect(todo.deadline).toBe("");
    expect(todo.file).toBe("a.ts");
    expect(todo.line).toBe(1);

    const fixme = parseTodoLine("// FIXME: broken", "b.ts", 2)!;
    expect(fixme.type).toBe("FIXME");
    expect(fixme.text).toBe("broken");

    const hack = parseTodoLine("// HACK: temporary fix", "c.ts", 3)!;
    expect(hack.type).toBe("HACK");
    expect(hack.text).toBe("temporary fix");
  });

  test("normalizes type to uppercase regardless of source casing", () => {
    const todo = parseTodoLine("// todo: lowercase marker", "x.ts", 1)!;
    expect(todo.type).toBe("TODO");

    const fixme = parseTodoLine("// FixMe: mixed case", "x.ts", 2)!;
    expect(fixme.type).toBe("FIXME");
  });

  test("parses priority metadata, lowercased", () => {
    const todo = parseTodoLine(
      "// TODO(priority:HIGH): urgent",
      "x.ts",
      1,
    )!;
    expect(todo.priority).toBe("high");
    expect(todo.text).toBe("urgent");
  });

  test("parses single + multi tags via tags: alias", () => {
    const single = parseTodoLine(
      "// TODO(tags:bug): one tag",
      "x.ts",
      1,
    )!;
    expect(single.tags).toEqual(["bug"]);

    // Multiple tags use `|` as in-value separator (commas are taken
    // by the metadata-pair separator). Mirrors the regex in index.ts.
    const multi = parseTodoLine(
      "// TODO(tags:bug|perf): twin tag",
      "x.ts",
      2,
    )!;
    expect(multi.tags).toEqual(["bug", "perf"]);
  });

  test("accepts both `tag:` and `tags:` keys", () => {
    const tag = parseTodoLine("// TODO(tag:bug): singular key", "x.ts", 1)!;
    expect(tag.tags).toEqual(["bug"]);
  });

  test("parses deadline metadata via deadline + due aliases", () => {
    const dl = parseTodoLine(
      "// TODO(deadline:2026-12-31): due soon",
      "x.ts",
      1,
    )!;
    expect(dl.deadline).toBe("2026-12-31");

    const due = parseTodoLine(
      "// TODO(due:2026-06-15): also due",
      "x.ts",
      2,
    )!;
    expect(due.deadline).toBe("2026-06-15");
  });

  test("parses all metadata fields combined", () => {
    const todo = parseTodoLine(
      "// FIXME(priority:critical, tags:bug|perf, deadline:2026-12-31): kitchen sink",
      "lib/store.ts",
      42,
    )!;
    expect(todo.type).toBe("FIXME");
    expect(todo.priority).toBe("critical");
    expect(todo.tags).toEqual(["bug", "perf"]);
    expect(todo.deadline).toBe("2026-12-31");
    expect(todo.text).toBe("kitchen sink");
    expect(todo.file).toBe("lib/store.ts");
    expect(todo.line).toBe(42);
  });

  test("trims text and tolerates missing colon after marker / metadata", () => {
    const noColon = parseTodoLine("// TODO no colon", "x.ts", 1)!;
    expect(noColon.text).toBe("no colon");

    const colonAfterMeta = parseTodoLine(
      "// TODO(priority:high) no inner colon",
      "x.ts",
      2,
    )!;
    expect(colonAfterMeta.priority).toBe("high");
    expect(colonAfterMeta.text).toBe("no inner colon");
  });

  test("ignores malformed metadata pieces (missing key or value)", () => {
    // `:high` has empty key → skip; `priority:` has empty value → skip.
    const todo = parseTodoLine(
      "// TODO(:orphan, priority:, tags:bug): partial",
      "x.ts",
      1,
    )!;
    expect(todo.priority).toBe("");
    expect(todo.tags).toEqual(["bug"]);
    expect(todo.text).toBe("partial");
  });
});
