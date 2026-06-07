<script lang="ts">
	import { onMount } from "svelte";

	// Per-extension tool subset selector. Renders one section per attached
	// extension with a checklist of its tools. The data model (see
	// modes.extensionTools / src/runtime/executor.ts) treats a key that is
	// absent or maps to an empty array as "all tools" (the default, which also
	// auto-includes tools added to the extension later). Selecting a strict
	// subset persists that subset; checking every tool collapses back to the
	// "all tools" default (key removed).
	interface ToolInfo { name: string; description?: string | null }
	interface ExtInfo { id: string; name: string; tools: ToolInfo[] }

	let {
		extensionIds = [],
		value = {},
		onchange,
		readonly = false,
	}: {
		extensionIds?: string[];
		value?: Record<string, string[]>;
		onchange?: (map: Record<string, string[]>) => void;
		readonly?: boolean;
	} = $props();

	let extData = $state<Record<string, ExtInfo>>({});
	let loaded = $state(false);

	onMount(async () => {
		try {
			const res = await fetch("/api/extensions");
			if (res.ok) {
				const data = await res.json();
				const list: unknown[] = Array.isArray(data)
					? data
					: Array.isArray(data?.extensions) ? data.extensions : [];
				const map: Record<string, ExtInfo> = {};
				for (const e of list as Array<{ id: string; name?: string; manifest?: { tools?: ToolInfo[] } }>) {
					map[e.id] = {
						id: e.id,
						name: e.name ?? e.id,
						tools: Array.isArray(e.manifest?.tools) ? e.manifest!.tools! : [],
					};
				}
				extData = map;
			}
		} catch { /* non-fatal */ }
		finally { loaded = true; }
	});

	// Extensions that are attached AND resolved (in attachment order).
	let sections = $derived(
		extensionIds.map((id) => extData[id]).filter((e): e is ExtInfo => Boolean(e)),
	);

	function toolNames(ext: ExtInfo): string[] {
		return ext.tools.map((t) => t.name);
	}

	function isAllTools(extId: string): boolean {
		const subset = value[extId];
		return !subset || subset.length === 0;
	}

	function isChecked(ext: ExtInfo, toolName: string): boolean {
		if (isAllTools(ext.id)) return true;
		return value[ext.id]!.includes(toolName);
	}

	function selectedLabel(ext: ExtInfo): string {
		if (isAllTools(ext.id)) return "All tools";
		return value[ext.id]!.join(", ");
	}

	function toggleTool(ext: ExtInfo, toolName: string) {
		if (readonly) return;
		const all = toolNames(ext);
		const current = new Set(isAllTools(ext.id) ? all : value[ext.id]!);
		if (current.has(toolName)) current.delete(toolName);
		else current.add(toolName);
		// Preserve manifest order; drop anything no longer present.
		const next = all.filter((t) => current.has(t));
		const map = { ...value };
		// All-checked or none-checked both collapse to the "all tools" default
		// (key removed) — an empty selection is meaningless for an attached
		// extension; remove the extension itself to grant zero tools.
		if (next.length === 0 || next.length === all.length) delete map[ext.id];
		else map[ext.id] = next;
		onchange?.(map);
	}

	function selectAll(ext: ExtInfo) {
		if (readonly) return;
		const map = { ...value };
		delete map[ext.id];
		onchange?.(map);
	}
</script>

{#if loaded && sections.length > 0}
	<div class="space-y-2" data-testid="extension-tool-selector">
		{#each sections as ext (ext.id)}
			<div class="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-tertiary)] p-2">
				<div class="mb-1 flex items-center justify-between">
					<span class="text-xs font-medium text-[var(--color-text-primary)]">{ext.name}</span>
					{#if readonly}
						<span class="text-xs text-[var(--color-text-muted)]">{selectedLabel(ext)}</span>
					{:else if !isAllTools(ext.id) && ext.tools.length > 0}
						<button
							type="button"
							class="text-xs text-[var(--color-accent)] hover:underline"
							onclick={() => selectAll(ext)}
							data-testid={`select-all-${ext.id}`}
						>
							Select all
						</button>
					{:else}
						<span class="text-xs text-[var(--color-text-muted)]">All tools</span>
					{/if}
				</div>
				{#if ext.tools.length === 0}
					<p class="text-xs italic text-[var(--color-text-muted)]">No tools exposed.</p>
				{:else if readonly}
					<!-- Readonly: chips already summarized above; nothing interactive. -->
				{:else}
					<div class="flex flex-col gap-1">
						{#each ext.tools as tool (tool.name)}
							{@const checked = isChecked(ext, tool.name)}
							<label class="flex cursor-pointer items-start gap-2 text-xs text-[var(--color-text-secondary)]">
								<input
									type="checkbox"
									class="mt-0.5"
									{checked}
									onchange={() => toggleTool(ext, tool.name)}
									data-testid={`tool-${ext.id}-${tool.name}`}
								/>
								<span class="min-w-0 flex-1">
									<span class="font-mono text-[var(--color-text-primary)]">{tool.name}</span>
									{#if tool.description}
										<span class="block truncate text-[var(--color-text-muted)]">{tool.description}</span>
									{/if}
								</span>
							</label>
						{/each}
					</div>
				{/if}
			</div>
		{/each}
	</div>
{/if}
