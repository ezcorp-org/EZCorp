import { logger } from "../../logger";
import type { StreamChatContext } from "./context";
import type { StreamChatHost } from "./host";

const log = logger.child("executor.streamChat.autoSpinUp");

/**
 * Auto-spin-up phase. After {@link setupTools} completes, the
 * orchestration tool-loader may have stashed `_pendingAutoSpinUp` +
 * `_mentionedAgents` on `run` (see setup-tools.ts 2d). If so, we
 * pre-invoke every member's `invoke_agent` tool in parallel so the
 * orchestrator prompt that follows can include their outputs.
 *
 * Then injects the orchestrator prompt (or task-tracking instructions
 * for non-orchestrator runs) onto `ctx.system` and clears the
 * `_*` scratch fields off `run`.
 *
 * Mutates `ctx.system` and `run`'s scratch fields in place.
 */
export async function applyAutoSpinUp(
  ctx: StreamChatContext,
  host: StreamChatHost,
  userMessage: string,
): Promise<void> {
  const { run, controller } = ctx;
  const pendingAutoSpinUp = (run as any)._pendingAutoSpinUp;
  const mentionedAgents = (run as any)._mentionedAgents as Array<{ name: string; id: string; description: string }> | undefined;
  const teamConfig = (run as any)._teamConfig as { name: string; prompt: string; autoSpinUp?: boolean } | undefined;
  let autoSpinUpResults: Array<{ name: string; output: string }> | undefined;

  if (pendingAutoSpinUp && mentionedAgents?.length) {
    const invokeAgentTool = ctx.agentTools.find((t) => t.name === "invoke_agent");
    if (invokeAgentTool) {
      try {
        log.info("Auto-spin-up: pre-invoking all members", { members: mentionedAgents.map((a) => a.name) });
        host.bus.emit("run:status", { runId: run.id, status: "Auto-invoking all team members..." });
        const spinResults = await Promise.allSettled(
          mentionedAgents.map((agent) =>
            invokeAgentTool.execute(crypto.randomUUID(), { agentConfigId: agent.id, task: userMessage }, controller.signal),
          ),
        );
        autoSpinUpResults = [];
        spinResults.forEach((r, i) => {
          const agentName = mentionedAgents[i]?.name ?? "Unknown";
          if (r.status === "fulfilled") {
            autoSpinUpResults!.push({ name: agentName, output: (r.value as any)?.content?.[0]?.text ?? "" });
          } else {
            log.error("Auto-spin-up agent failed", { agentName, error: String(r.reason) });
            autoSpinUpResults!.push({ name: agentName, output: `[Error: ${r.reason?.message ?? "Unknown error"}]` });
          }
        });
        log.info("Auto-spin-up complete", { resultCount: autoSpinUpResults.length });
      } catch (spinErr) {
        log.error("Auto-spin-up failed", { error: String(spinErr), stack: spinErr instanceof Error ? spinErr.stack : undefined });
      }
    }
    delete (run as any)._pendingAutoSpinUp;
  }

  // Inject orchestrator prompt AFTER auto-spin-up (results available for prompt)
  if (mentionedAgents && mentionedAgents.length > 0) {
    const { buildOrchestratorPrompt, buildTeamOrchestratorPrompt } = await import("../orchestrator-prompt");
    const teamToolScopeForPrompt = (run as any)._teamToolScope as import("../../types").TeamToolScope | undefined;
    const orchestratorBlock = teamConfig
      ? buildTeamOrchestratorPrompt(teamConfig.name, teamConfig.prompt, mentionedAgents, autoSpinUpResults, teamToolScopeForPrompt)
      : buildOrchestratorPrompt(mentionedAgents);
    ctx.system = ctx.system ? `${orchestratorBlock}\n\n${ctx.system}` : orchestratorBlock;
    delete (run as any)._mentionedAgents;
    delete (run as any)._teamConfig;
    delete (run as any)._memberOverrides;
    delete (run as any)._subAgentMembers;
    delete (run as any)._teamToolScope;
  } else {
    // Non-orchestrator runs: still inject task tracking instructions so single agents
    // can decompose complex work into visible tasks.
    try {
      const { buildTaskTrackingInstructions } = await import("../orchestrator-prompt");
      const taskBlock = buildTaskTrackingInstructions();
      ctx.system = ctx.system ? `${ctx.system}\n\n${taskBlock}` : taskBlock;
    } catch { /* non-fatal */ }
  }
}
