/**
 * Metadata for remaining built-in tools.
 *
 * After Phase 5 the built-in registry is empty; every tool lives in a
 * bundled extension. File retained for API shape; delete in a follow-up
 * soak cycle. Phase 1 moved `scratchpad`, Phase 3 commit-5 moved
 * `task-tracking`, Phase 4 commit-5 moved `invoke_agent`, and Phase 5
 * commit 4 moved `ask_human` — the `src/runtime/tools/` directory now
 * has zero residents.
 *
 * The `/api/tools` endpoint, the mention-search API, and the
 * tool-invoke APIs still call into `getBuiltInToolMetadata()` and
 * `getBuiltInCategories()` — those receive an empty list, and every
 * downstream caller handles that case naturally. When the soak window
 * closes, delete this module and remove the call sites.
 */

export type BuiltInCategory = string;

export interface BuiltInToolMeta {
  name: string;
  description: string;
  category: BuiltInCategory;
  inputSchema?: Record<string, unknown>;
  /** Whether this tool's category is mentionable in chat via @. Defaults to true. */
  mentionable?: boolean;
}

/** Build the full tool list. Empty after Phase 5 commit 4. */
function buildToolList(): BuiltInToolMeta[] {
  return [];
}

let _cachedTools: BuiltInToolMeta[] | undefined;
function getTools(): BuiltInToolMeta[] {
  if (!_cachedTools) _cachedTools = buildToolList();
  return _cachedTools;
}

export function getBuiltInToolMetadata(): BuiltInToolMeta[] {
  return getTools();
}

/** Category descriptions for mention search results. */
const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  // Empty after Phase 5 — every mentionable category now lives in an
  // installed extension and is surfaced through the normal extensions
  // path at web/src/routes/api/mentions/search/+server.ts.
};

/** Get mentionable built-in categories for the mention search API. */
export function getBuiltInCategories(): Array<{ name: string; description: string }> {
  const seen = new Set<string>();
  const categories: Array<{ name: string; description: string }> = [];
  for (const t of getTools()) {
    if (t.mentionable === false || seen.has(t.category)) continue;
    seen.add(t.category);
    categories.push({ name: t.category, description: CATEGORY_DESCRIPTIONS[t.category] ?? t.category });
  }
  return categories;
}

/** Get tool definitions (with schemas) for a built-in category. */
export function getBuiltInToolsByCategory(_category: string): Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> {
  return getTools()
    .filter(t => t.category === _category && t.inputSchema)
    .map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema! }));
}
