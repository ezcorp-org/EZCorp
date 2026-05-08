import { defineExtension } from "../../../extensions/sdk/define";

// Phase 53.6 — fixture for `bundled-boot-spawn-real-process.test.ts`.
//
// Mirrors the shape of a real event-only bundled extension
// (lessons-distiller / memory-extractor): no LLM-callable tools, only
// a `run:complete` event subscription, `persistent: true`. The fixture
// ships beside the test rather than reusing the bundled extensions so
// the regression test stays decoupled from production extension code
// (a refactor of lessons-distiller's index.ts shouldn't break this
// boot-spawn invariant test).

export default defineExtension({
  schemaVersion: 2,
  name: "test-event-only",
  version: "1.0.0",
  description: "Test fixture: event-only extension for boot-spawn regression test",
  author: { name: "Test" },
  entrypoint: "./entrypoint.ts",
  persistent: true,
  tools: [],
  permissions: {
    eventSubscriptions: ["run:complete"],
  },
});
