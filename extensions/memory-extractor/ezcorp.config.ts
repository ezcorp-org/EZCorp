// Memory-extractor — bundled extension manifest (Phase 53.4 Stage 1).
//
// Ports the legacy host-side memory pipeline (src/memory/extraction.ts +
// src/memory/compaction.ts) onto the SDK capability surfaces. Each
// completed chat run triggers an LLM-driven fact extraction; the
// resulting memories flow through `ctx.memory.write` (audited,
// host-side dedup applied before insert). A 6-hour cron schedule
// triggers compaction via `ctx.invoke("runtime.memory.compact", …)`,
// which delegates to the host's existing decay-and-merge pipeline.
//
// Stage 1 ships alongside the legacy implementation; the parity test
// at `src/__tests__/memory-extractor-port-parity.test.ts` proves both
// pipelines produce identical memory rows (same dedup, same provenance
// classes) before Stage 2 deletes the legacy code.
//
// CROSS-EXTENSION VISIBILITY (`permissions.memory.selfOnly = false`):
// This is the ONLY bundled extension granted `selfOnly: false`. The
// extractor MUST be able to dedup against memories authored by the
// host's pre-existing pipeline (and any future first-party extension
// extracting memories) — without cross-extension visibility, every
// extension would re-extract the same fact and the memory table would
// fill with near-duplicates. User-installed extensions default to
// `selfOnly: true`; this exception is an explicit decision documented
// in tasks/v1.3-phase-53-bundled-extension-ports.md (53.4.1) and
// reviewed at install time via the bundled-trust audit.
//
// `permissions.llm` mirrors `EXTRACTION_MODELS` from the legacy file
// (claude-haiku-4-5-20250514, gpt-4o-mini, gemini-2.0-flash-lite) plus
// Ollama parity with the lessons-distiller (added in Phase 53.1).

import { defineExtension } from "../../src/extensions/sdk/define";

export default defineExtension({
  schemaVersion: 2,
  name: "memory-extractor",
  version: "1.0.0",
  description:
    "Extracts durable facts from completed chat runs (preferences, biographical, technical, decisions/goals) and runs a 6-hour compaction sweep.",
  author: { name: "EZCorp" },
  entrypoint: "./index.ts",
  persistent: false,

  permissions: {
    llm: {
      providers: ["google", "openai", "anthropic", "ollama"],
      maxCallsPerHour: 30,
      maxCallsPerDay: 200,
      // Memory extraction asks the LLM for an array of facts which can
      // be longer than a single lesson; bump from 1024 → 2048 to match
      // the legacy `extractMemories` call shape.
      maxTokensPerCall: 2048,
      allowedModels: {
        google: ["gemini-2.0-flash-lite"],
        openai: ["gpt-4o-mini"],
        anthropic: ["claude-haiku-4-5-20250514"],
        // Mirror the lessons-distiller's Ollama defaults; user-installed
        // models are reachable via the `model` text override.
        ollama: ["gemma4:e2b", "gemma4:latest", "qwen3.6:35b"],
      },
    },
    memory: {
      access: "write",
      categories: ["preferences", "biographical", "technical", "decisions_goals"],
      maxWritesPerDay: 100,
      // INTENTIONAL — see file-leading comment. The only bundled
      // extension allowed cross-extension memory visibility for dedup.
      selfOnly: false,
    },
    eventSubscriptions: ["run:complete"],
    schedule: {
      crons: ["0 */6 * * *"],
      maxRunsPerDay: 4,
      missedRunPolicy: "fire-once",
      purpose: "memory compaction sweep",
    },
    storage: true,
  },

  // Tools array intentionally empty — this extension is purely
  // event/cron driven. Compaction is invoked by the schedule daemon;
  // extraction by the run:complete event subscription. There is no
  // user-callable manual entry point in v1.3 (deferred to v1.4).
  tools: [],

  settings: {
    enabled: {
      type: "boolean",
      label: "Enabled",
      description: "Auto-extract memories when a chat run completes.",
      default: true,
    },
    provider: {
      type: "select",
      label: "Model provider",
      description:
        "Which provider to call for the extraction LLM. Falls back to Google if no preference.",
      options: [
        { value: "google", label: "Google" },
        { value: "openai", label: "OpenAI" },
        { value: "anthropic", label: "Anthropic" },
        { value: "ollama", label: "Ollama (local)" },
      ],
      default: "google",
    },
    model: {
      type: "text",
      label: "Model id (override)",
      description:
        "Leave blank to use the provider default (gemini-2.0-flash-lite / gpt-4o-mini / claude-haiku-4-5 / gemma4:e2b for Ollama).",
      default: "",
    },
    compaction_enabled: {
      type: "boolean",
      label: "Run 6-hour compaction sweep",
      description:
        "Periodically merge similar memories. Disable to skip the cron-driven sweep without disabling extraction.",
      default: true,
    },
  },
});
