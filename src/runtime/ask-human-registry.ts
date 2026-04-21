/**
 * Host-side shadow of the orchestration extension's pending human-input map.
 *
 * Phase 5 commit 4 replaces the built-in ask-human module that used to own
 * the `requestId → conversationId` mapping. After the cutover, the
 * orchestration extension's subprocess owns the pending gates — but the
 * SvelteKit POST endpoint at `/api/orchestrator/human-input` still needs
 * to know which `conversationId` a given `requestId` belongs to so the
 * `orchestrator:human_response` event it emits carries the right
 * conversation id for the SSE conversation filter.
 *
 * Populated from `src/extensions/task-events-handler.ts`' Phase 5
 * `orchestrator:human_input` branch: whenever the extension emits the
 * event via `ezcorp/emit-task-event`, the host recorded `requestId →
 * conversationId` here. The POST endpoint reads and clears the entry
 * when the user replies, keeping the map self-cleaning.
 *
 * Stale entries (extension timeout / abort / server restart) are a
 * non-issue: the POST endpoint tolerates a missing entry by returning
 * `{ ok: true }` without emitting — the UI has already collapsed the
 * card optimistically, and the subscription handler would drop any
 * response anyway if the gate timed out on its side.
 */

const pendingConvByRequestId = new Map<string, string>();

/** Record that a human-input request is pending for a given conversation. */
export function registerPendingHumanInput(
  requestId: string,
  conversationId: string,
): void {
  pendingConvByRequestId.set(requestId, conversationId);
}

/** Read the `conversationId` tied to a pending human-input request. */
export function getPendingHumanConversationId(
  requestId: string,
): string | undefined {
  return pendingConvByRequestId.get(requestId);
}

/** Clear the entry — called by the POST endpoint after emit. */
export function clearPendingHumanInput(requestId: string): void {
  pendingConvByRequestId.delete(requestId);
}

/** Test-only: wipe the map between tests. */
export function _resetPendingHumanInputsForTests(): void {
  pendingConvByRequestId.clear();
}
