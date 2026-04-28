import type { Message } from "$lib/api.js";

export type StreamSnapshotEntry = { content: string; thinking: string };
export type StreamSnapshot = Record<string, StreamSnapshotEntry>;

/**
 * Mirror the latest streaming text/thinking for `runId` into a page-local
 * snapshot map. Called inside an effect that watches the live cache values.
 *
 * Why this exists: `run:complete` synchronously calls `stopStreaming` which
 * wipes `store.streamingMessages[runId]` BEFORE the reconcile-after-stream
 * effect fires. Without a snapshot the reconcile sees an empty cache and
 * cannot back-fill an empty assistant row. Returns the same map reference
 * when nothing changed so callers' equality checks don't flip.
 */
export function recordSnapshot(
	snapshot: StreamSnapshot,
	runId: string | null,
	streamingText: string | undefined,
	streamingThinking: string | undefined,
): StreamSnapshot {
	if (!runId) return snapshot;
	if (streamingText === undefined && streamingThinking === undefined) return snapshot;

	const prev = snapshot[runId];
	const next: StreamSnapshotEntry = {
		content: streamingText ?? prev?.content ?? "",
		thinking: streamingThinking ?? prev?.thinking ?? "",
	};
	if (prev && prev.content === next.content && prev.thinking === next.thinking) {
		return snapshot;
	}
	return { ...snapshot, [runId]: next };
}

/** Drop one entry from a snapshot. Same-reference fast path when absent. */
export function clearSnapshot(snapshot: StreamSnapshot, runId: string | null): StreamSnapshot {
	if (!runId || !(runId in snapshot)) return snapshot;
	const { [runId]: _, ...rest } = snapshot;
	return rest;
}

/**
 * Build the cache-shaped maps from a snapshot for a given runId. Used at the
 * call site so we hand `patchAssistantContentFromStream` the same shape it
 * already accepts (no API change to the pure helper).
 */
export function snapshotToMaps(
	snapshot: StreamSnapshot,
	runId: string | null,
): { contentMap: Record<string, string>; thinkingMap: Record<string, string> } {
	if (!runId) return { contentMap: {}, thinkingMap: {} };
	const entry = snapshot[runId];
	if (!entry) return { contentMap: {}, thinkingMap: {} };
	return {
		contentMap: entry.content ? { [runId]: entry.content } : {},
		thinkingMap: entry.thinking ? { [runId]: entry.thinking } : {},
	};
}

export function patchAssistantContentFromStream(
	messages: Message[],
	runId: string | null,
	streamingMessages: Record<string, string>,
	streamingThinking: Record<string, string>,
): Message[] {
	if (!runId) return messages;

	let patched = false;
	const result = messages.map((m) => {
		if (m.runId !== runId || m.role !== "assistant") return m;

		const needsContent = !m.content?.trim() && !!streamingMessages[runId];
		const needsThinking = !m.thinkingContent && !!streamingThinking[runId];

		if (!needsContent && !needsThinking) return m;

		patched = true;
		return {
			...m,
			...(needsContent ? { content: streamingMessages[runId]! } : {}),
			...(needsThinking ? { thinkingContent: streamingThinking[runId]! } : {}),
		};
	});

	return patched ? result : messages;
}
