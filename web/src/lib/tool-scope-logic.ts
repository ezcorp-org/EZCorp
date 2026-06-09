/**
 * Pure logic for per-extension tool-subset scoping. No UI dependencies —
 * fully testable. Shared by every surface that lets a user narrow which of
 * an extension's tools are granted: `ExtensionToolSelector.svelte` (mode /
 * agent forms), `ExtensionAttachPicker.svelte` (inline per-card scoping),
 * and the chat composer's per-conversation Tools popover
 * (`ChatInput.svelte`).
 *
 * Data model (see `modes.extensionTools` / `agent_configs.extensionTools` /
 * `conversations.extensionTools` in `src/db/schema.ts`, consumed by
 * `src/runtime/executor.ts`): a map of `extensionId -> string[]` of tool
 * names. A key that is **absent**, or maps to an **empty array**, means
 * "all tools" — the default, which also auto-includes tools added to the
 * extension later. Selecting a strict subset persists that subset; checking
 * every tool (or unchecking the last one) collapses back to the "all tools"
 * default by removing the key.
 *
 * The single source of truth for the toggle/collapse rule lives here so the
 * three consuming surfaces cannot drift.
 */

export type ToolScopeMap = Record<string, string[]>;

/**
 * Is this extension currently granting *all* of its tools? True when the
 * extension has no key in the map, or its subset is empty.
 */
export function isAllTools(map: ToolScopeMap, extId: string): boolean {
	const subset = map[extId];
	return !subset || subset.length === 0;
}

/**
 * Is a specific tool checked for this extension? When the extension is in
 * "all tools" mode every tool reads as checked; otherwise only tools present
 * in the subset are checked.
 */
export function isToolChecked(map: ToolScopeMap, extId: string, toolName: string): boolean {
	if (isAllTools(map, extId)) return true;
	return map[extId]!.includes(toolName);
}

/**
 * Human-readable summary of the current selection for an extension. Used by
 * the readonly view-mode summaries. `"All tools"` when in the default state,
 * otherwise the comma-joined subset (in stored order).
 */
export function selectedLabel(map: ToolScopeMap, extId: string): string {
	if (isAllTools(map, extId)) return "All tools";
	return map[extId]!.join(", ");
}

/**
 * Toggle a single tool for an extension, returning a NEW map (never mutates
 * the input). `allToolNames` is the extension's full manifest tool list, in
 * manifest order — the returned subset preserves that order and drops any
 * stale names no longer in the manifest.
 *
 * Collapse rule: if the resulting subset is empty (the last tool was
 * unchecked) OR contains every manifest tool (all checked), the extension's
 * key is removed entirely — both states mean "all tools". An empty selection
 * is meaningless for an attached extension; to grant zero tools, detach the
 * extension instead.
 */
export function toggleTool(
	map: ToolScopeMap,
	extId: string,
	toolName: string,
	allToolNames: string[],
): ToolScopeMap {
	// Current effective selection: the full set when in "all" mode, else the
	// stored subset.
	const current = new Set(isAllTools(map, extId) ? allToolNames : map[extId]!);
	if (current.has(toolName)) current.delete(toolName);
	else current.add(toolName);
	// Preserve manifest order; drop anything no longer present in the manifest.
	const next = allToolNames.filter((t) => current.has(t));
	const result: ToolScopeMap = { ...map };
	if (next.length === 0 || next.length === allToolNames.length) {
		delete result[extId];
	} else {
		result[extId] = next;
	}
	return result;
}

/**
 * Reset an extension back to the "all tools" default by removing its key.
 * Returns a NEW map. Used by the "Select all" affordance.
 */
export function selectAllTools(map: ToolScopeMap, extId: string): ToolScopeMap {
	const result: ToolScopeMap = { ...map };
	delete result[extId];
	return result;
}

/**
 * Prune subset keys for extensions that are no longer attached, so a
 * persisted map never carries stale keys. Returns a NEW map containing only
 * keys whose extension id is in `attachedIds` (and which had a non-empty
 * subset to begin with).
 */
export function pruneDetached(map: ToolScopeMap, attachedIds: string[]): ToolScopeMap {
	const kept: ToolScopeMap = {};
	for (const id of attachedIds) {
		if (map[id]) kept[id] = map[id];
	}
	return kept;
}
