import { defineExtension } from "../../../../src/extensions/sdk/define";

// Static manifest schema for the `invoke_agent` tool. The per-turn
// `agentConfigId` enum is runtime-scoped (derived from the mentioned
// agents on each parent turn) and cannot live in a static manifest, so
// the host's `wireOrchestrationToolsForTurn` helper (commit 4) injects
// it via `extensionToAgentTool`'s `schemaOverride` seam at wire time.
// The manifest schema below is the unconstrained shape — valid on its
// own, tightened per-turn by the host.
const INVOKE_AGENT_SCHEMA = {
  type: "object",
  properties: {
    agentConfigId: {
      type: "string",
      description:
        "The ID of the agent to invoke. Must be one of the agents available for this turn.",
    },
    task: {
      type: "string",
      description: "A clear description of what the agent should do.",
    },
  },
  required: ["agentConfigId", "task"],
} as const;

// Static manifest schema for the `ask_human` tool. Ported from the
// legacy built-in at `src/runtime/tools/ask-human.ts` (Phase 5).
// Schema is static — there is no per-turn narrowing, unlike invoke_agent.
const ASK_HUMAN_SCHEMA = {
  type: "object",
  properties: {
    question: {
      type: "string",
      description: "The question to present to the user.",
    },
  },
  required: ["question"],
} as const;

export default defineExtension({
  schemaVersion: 2,
  name: "orchestration",
  // Phase 5 bump: additive manifest change (new tool + new subscription).
  // Minor bump — no permission widening beyond what Phase 4 already had
  // in the same extension's surface.
  version: "1.1.0",
  description:
    "Multi-agent orchestration primitives. Provides `invoke_agent` for delegating to a sub-agent within a conversation, and `ask_human` for pausing execution to surface a question to the user.",
  author: { name: "EZCorp" },
  entrypoint: "./index.ts",
  persistent: true,
  tools: [
    {
      name: "invoke_agent",
      description:
        "Invoke a specialized agent to handle a task. The agent runs as an independent sub-conversation and returns its response. You can call this tool multiple times in parallel for independent tasks.",
      inputSchema: INVOKE_AGENT_SCHEMA as Record<string, unknown>,
    },
    {
      name: "ask_human",
      description:
        "Pause execution and ask the user a question. The agent will wait for the user's response before continuing. Use this when you need clarification, a decision, or information that only the user can provide.",
      inputSchema: ASK_HUMAN_SCHEMA as Record<string, unknown>,
    },
  ],
  permissions: {
    agentConfig: "read",
    spawnAgents: { maxPerHour: 500, maxConcurrent: 25 },
    // `task:assignment_update` — required by `invoke_agent`'s two-hop
    //   bridge (Phase 4).
    // `orchestrator:human_response` — required by `ask_human`'s gate
    //   resolution (Phase 5). The host's POST endpoint at
    //   `/api/orchestrator/human-input` emits this event on user reply;
    //   the extension's subscription handler resolves the matching
    //   pending-input gate.
    eventSubscriptions: ["task:assignment_update", "orchestrator:human_response"],
  },
});
