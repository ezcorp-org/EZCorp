<script lang="ts">
	import Tooltip from "./Tooltip.svelte";
	import { computePct, computeTone, tooltipText } from "$lib/context-usage-logic";

	let {
		usedTokens,
		contextWindow,
	}: {
		usedTokens: number | null;
		contextWindow: number | null;
	} = $props();

	let pct = $derived(computePct(usedTokens, contextWindow));
	let tone = $derived(computeTone(pct));
	let tooltip = $derived(tooltipText(usedTokens, contextWindow));
</script>

{#if pct != null}
	<Tooltip position="bottom" text={tooltip}>
		<div
			data-testid="context-usage-indicator"
			data-tone={tone}
			class="flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-medium tabular-nums
				{tone === 'danger' ? 'text-[var(--color-error, #f87171)]' : ''}
				{tone === 'warn' ? 'text-[var(--color-warning, #facc15)]' : ''}
				{tone === 'muted' ? 'text-[var(--color-text-secondary)]' : ''}"
			aria-label="Context used: {Math.round(pct)} percent"
		>
			<div class="relative h-1.5 w-10 overflow-hidden rounded-full bg-[var(--color-surface-tertiary)]">
				<div
					data-testid="context-usage-bar"
					class="absolute inset-y-0 left-0 rounded-full transition-all
						{tone === 'danger' ? 'bg-[var(--color-error, #f87171)]' : ''}
						{tone === 'warn' ? 'bg-[var(--color-warning, #facc15)]' : ''}
						{tone === 'muted' ? 'bg-[var(--color-text-muted)]' : ''}"
					style="width: {pct}%"
				></div>
			</div>
			<span data-testid="context-usage-pct">{Math.round(pct)}%</span>
		</div>
	</Tooltip>
{/if}
