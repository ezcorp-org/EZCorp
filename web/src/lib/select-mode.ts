/**
 * Pure-logic helpers for chat-window Select Mode.
 *
 * The chat page binds a Svelte-reactive `Set<string>` of selected message ids
 * and surfaces toggle / clear / has operations via these helpers. Extracting
 * them here (rather than inlining in `+page.svelte`) lets `bun test` cover the
 * selection mechanics without needing a Svelte runtime.
 */

export interface SelectionState {
	selectedIds: Set<string>;
}

/** Immutably returns a fresh Set with `id` toggled. Callers reassign the
 *  returned set so Svelte's `$state` sees a new reference and re-renders. */
export function toggleSelection(selectedIds: Set<string>, id: string): Set<string> {
	const next = new Set(selectedIds);
	if (next.has(id)) {
		next.delete(id);
	} else {
		next.add(id);
	}
	return next;
}

export function clearSelection(): Set<string> {
	return new Set<string>();
}

export function isSelected(selectedIds: Set<string>, id: string): boolean {
	return selectedIds.has(id);
}

export function selectionSize(selectedIds: Set<string>): number {
	return selectedIds.size;
}

/** Order-preserving export of selected ids in the supplied reference order.
 *  The chat page feeds the ordered message list so the resulting array
 *  matches the displayed chronology — server-side order is still enforced
 *  by `cloneTurnsIntoNewConversation`, but surfacing them correctly here
 *  keeps the client send payload predictable for tests. */
export function orderedSelection(selectedIds: Set<string>, orderedIds: string[]): string[] {
	return orderedIds.filter((id) => selectedIds.has(id));
}
