<script lang="ts">
	/**
	 * Phase 4 (capability-expiry) — small re-approve prompt component.
	 *
	 * The modal copy is the design doc § 3.2 contract — the SAME verbatim
	 * strings render on the in-chat PermissionGate's expired branch AND
	 * on the settings page banner's click-to-reapprove inline modal.
	 * Factoring out this component keeps the copy in one place (no
	 * paraphrase drift between the two surfaces).
	 *
	 * Pure presentation: callbacks (`onApproveDefault`, `onApproveForever`,
	 * `onCancel`) are wired by the parent. The component does NOT issue
	 * any network requests — chat-side parents POST
	 * /api/tool-calls/:id/permission; settings-side parents POST
	 * /api/extensions/:id/reapprove.
	 *
	 * The "Approve forever (admin only)" button is gated by the `isAdmin`
	 * prop. Both server endpoints (tool-permission, reapprove) ALSO gate
	 * scope=forever, defense in depth.
	 */
	import { humanizeDuration } from "$lib/utils/relative-time";

	let {
		extensionName,
		capability,
		ageMs,
		newTtlMs,
		isAdmin = false,
		loading = false,
		onApproveDefault,
		onApproveForever,
		onCancel,
	}: {
		extensionName: string;
		capability: string;
		ageMs: number;
		newTtlMs: number;
		isAdmin?: boolean;
		loading?: boolean;
		onApproveDefault: () => void;
		onApproveForever: () => void;
		onCancel: () => void;
	} = $props();

	let ageText = $derived(humanizeDuration(ageMs));
	let ttlText = $derived(humanizeDuration(newTtlMs));
</script>

<!--
	Title and body strings below MUST stay verbatim per design doc § 3.2.
	Do NOT paraphrase. The component test reads exact substrings against
	these copy contracts.
-->
<div
	class="rounded-md border border-amber-500/40 bg-amber-900/10 p-3"
	data-testid="expired-reapprove-modal"
>
	<div class="mb-2 flex items-center gap-2">
		<svg
			class="h-4 w-4 shrink-0 text-amber-400"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			stroke-width="2"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
			/>
		</svg>
		<span
			class="text-sm font-medium text-[var(--color-text-primary)]"
			data-testid="expired-reapprove-title"
		>Re-approve {extensionName}: {capability}</span>
	</div>
	<p
		class="mb-3 text-sm text-[var(--color-text-primary)]"
		data-testid="expired-reapprove-body"
	>Your permission for {capability} expired {ageText} ago. Continue to grant for another {ttlText}, or cancel.</p>
	<div class="flex flex-wrap gap-2" data-testid="expired-reapprove-actions">
		<button
			type="button"
			onclick={onApproveDefault}
			disabled={loading}
			data-testid="expired-reapprove-approve-default"
			class="rounded px-3 py-1.5 text-xs font-medium bg-green-700 hover:bg-green-600 text-white transition-colors disabled:opacity-50"
		>
			{loading ? 'Working...' : `Approve ${ttlText}`}
		</button>
		{#if isAdmin}
			<button
				type="button"
				onclick={onApproveForever}
				disabled={loading}
				data-testid="expired-reapprove-approve-forever"
				class="rounded px-3 py-1.5 text-xs font-medium bg-blue-700 hover:bg-blue-600 text-white transition-colors disabled:opacity-50"
			>
				Approve forever (admin only)
			</button>
		{/if}
		<button
			type="button"
			onclick={onCancel}
			disabled={loading}
			data-testid="expired-reapprove-cancel"
			class="rounded px-3 py-1.5 text-xs font-medium bg-[var(--color-surface-tertiary)] hover:bg-[var(--color-surface-secondary)] text-[var(--color-text-primary)] transition-colors disabled:opacity-50"
		>
			Cancel
		</button>
	</div>
</div>
