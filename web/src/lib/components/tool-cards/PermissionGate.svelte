<script lang="ts">
	import type { ToolCallState } from "$lib/stores.svelte.js";
	import { sendToolPermissionResponse } from "$lib/stores.svelte.js";
	import { getSecurityNote, extractInputSummary } from "./utils.js";
	import { humanizeDuration } from "$lib/utils/relative-time";

	/**
	 * Phase 4 (capability-expiry): the gate now has THREE rendering modes,
	 * picked top-down:
	 *   1. `expiredCapability` set       → "expired — re-approve" branch.
	 *      Fires after the sweep revoked a grant; the next tool-call hit
	 *      surfaces this branch instead of the install-time prompt.
	 *   2. `extensionId` set             → four-scope chooser (Phase 6).
	 *   3. neither set                   → legacy two-button Allow / Deny.
	 *
	 * The `expiredCapability` branch is purely additive — when undefined,
	 * the existing four-scope flow renders unchanged. The "Approve forever
	 * (admin only)" button is gated by the `isAdmin` prop AND defended in
	 * depth by `/api/tool-calls/:id/permission` (which rejects
	 * `scope: "forever"` from non-admin callers).
	 */
	let {
		toolCall,
		expiredCapability,
		isAdmin = false,
	}: {
		toolCall: ToolCallState;
		expiredCapability?: {
			capability: string;
			ageMs: number;
			newTtlMs: number;
		};
		isAdmin?: boolean;
	} = $props();
	let loading = $state(false);

	let securityNote = $derived(getSecurityNote(toolCall.category));

	let inputSummary = $derived(extractInputSummary(toolCall.input) ?? '');

	// Phase 4: expired-capability branch overrides everything else when
	// set — the modal renders re-approve copy, not the install-time
	// chooser, so users can't be confused into thinking this is a fresh
	// grant for a capability they never approved before.
	let isExpiredRequest = $derived(expiredCapability !== undefined);

	// Phase 6: extension-scoped permission request? Routes the modal to
	// the four-scope chooser when extensionId is set. Built-in tool
	// gates (no extensionId) keep the legacy two-button Allow/Deny.
	let isExtensionRequest = $derived(toolCall.extensionId !== undefined && toolCall.extensionId.length > 0);

	// Human-readable description of what's being requested.
	let extensionRequestDescription = $derived.by(() => {
		if (!isExtensionRequest) return '';
		if (toolCall.capabilityKind === 'shell') {
			return 'Execute shell commands';
		}
		if (toolCall.capabilityKind === 'fs.write') {
			return toolCall.capabilityValue
				? `Write to filesystem: ${toolCall.capabilityValue}`
				: 'Write to filesystem';
		}
		return `Use capability ${toolCall.capabilityKind ?? '(unknown)'}`;
	});

	// Phase 4 expired-branch derivations. Hoisted out of the template so
	// the test pattern (read text content) is straightforward.
	let expiredAgeText = $derived(
		expiredCapability ? humanizeDuration(expiredCapability.ageMs) : '',
	);
	let expiredTtlText = $derived(
		expiredCapability ? humanizeDuration(expiredCapability.newTtlMs) : '',
	);
	let extensionDisplayName = $derived(toolCall.extensionId ?? 'extension');

	type Scope = 'session' | 'conversation' | 'project' | 'forever';

	async function handleAllow(scope?: Scope) {
		if (!toolCall.id) return;
		loading = true;
		try {
			// Built-in tool gates ignore the scope arg server-side; only
			// extension-scoped gates honor it.
			await sendToolPermissionResponse(toolCall.id, true, scope);
		} finally {
			loading = false;
		}
	}

	async function handleDeny() {
		if (!toolCall.id) return;
		await sendToolPermissionResponse(toolCall.id, false);
	}

	// Phase 4 — re-approve handlers. The "Approve $newTtl" path posts
	// `{approved: true}` with no scope; the server resolves the actual
	// TTL on approve (mirrors the install-time flow). Admin "forever"
	// adds `scope: "forever"` AND expects the server-side guard to
	// confirm the caller's role.
	async function handleReapproveDefault() {
		if (!toolCall.id) return;
		loading = true;
		try {
			await sendToolPermissionResponse(toolCall.id, true);
		} finally {
			loading = false;
		}
	}

	async function handleReapproveForever() {
		if (!toolCall.id) return;
		loading = true;
		try {
			await sendToolPermissionResponse(toolCall.id, true, 'forever');
		} finally {
			loading = false;
		}
	}

	async function handleReapproveCancel() {
		// Dismissal is non-authoritative per design doc § 3.3 — sweep
		// already revoked, the cancel just defers the next prompt. We
		// still POST `{approved: false}` so the gate resolves and the
		// pending state clears (otherwise the UI would hang on the
		// modal). Subsequent tool calls will re-prompt until the user
		// approves.
		if (!toolCall.id) return;
		await sendToolPermissionResponse(toolCall.id, false);
	}
</script>

<div class="rounded-md border border-amber-500/40 bg-amber-900/10 overflow-hidden" data-testid="permission-gate">
	<div class="px-3 py-2">
		<div class="flex items-center gap-2 mb-2">
			<svg class="h-4 w-4 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
			</svg>
			{#if isExpiredRequest && expiredCapability}
				<!--
					Phase 4 expired branch — title swaps to the re-approve
					copy (design doc § 3.2, locked verbatim):
					  "Re-approve $extensionName: $capability"
				-->
				<span
					class="text-sm font-medium text-[var(--color-text-primary)]"
					data-testid="permission-expired-title"
				>Re-approve {extensionDisplayName}: {expiredCapability.capability}</span>
			{:else}
				<span class="text-sm font-medium text-[var(--color-text-primary)]">{toolCall.toolName}</span>
			{/if}
			{#if (isExtensionRequest || isExpiredRequest) && toolCall.extensionId}
				<span class="rounded-full bg-blue-500/20 px-2 py-0.5 text-[10px] font-medium text-blue-300" data-testid="permission-extension-badge">{toolCall.extensionId}</span>
			{/if}
			{#if toolCall.category}
				<span class="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-300">{toolCall.category}</span>
			{/if}
		</div>

		{#if isExpiredRequest && expiredCapability}
			<!--
				Phase 4 body copy (design doc § 3.2, verbatim contract):
				  "Your permission for $capability expired $age ago.
				   Continue to grant for another $newTtl, or cancel."
			-->
			<p
				class="mb-2 text-sm text-[var(--color-text-primary)]"
				data-testid="permission-expired-body"
			>Your permission for {expiredCapability.capability} expired {expiredAgeText} ago. Continue to grant for another {expiredTtlText}, or cancel.</p>
		{:else if isExtensionRequest}
			<p class="mb-2 text-sm text-[var(--color-text-primary)]" data-testid="permission-extension-description">
				This extension wants to: <span class="font-medium">{extensionRequestDescription}</span>
			</p>
		{/if}

		{#if inputSummary}
			<pre class="mb-2 rounded bg-[var(--color-surface-secondary)] p-2 text-xs text-[var(--color-text-secondary)] whitespace-pre-wrap break-all max-h-32 overflow-y-auto">{inputSummary}</pre>
		{/if}

		{#if securityNote && !isExpiredRequest}
			<p class="mb-3 text-xs text-amber-300/80">{securityNote}</p>
		{/if}

		{#if isExpiredRequest && expiredCapability}
			<!--
				Phase 4 expired-branch buttons (design doc § 3.2 verbatim):
				  • "Approve $newTtl"               — primary, all users
				  • "Approve forever (admin only)"  — admin-gated
				  • "Cancel"                        — closes modal, no POST scope
				The forever button is also defended server-side: the
				`/api/tool-calls/:id/permission` handler rejects
				`scope: "forever"` from non-admin callers (defense in
				depth, even if a tampered DOM bypasses the gate).
			-->
			<div class="flex flex-wrap gap-2" data-testid="permission-expired-actions">
				<button
					onclick={handleReapproveDefault}
					disabled={loading}
					data-testid="permission-expired-approve-default"
					class="rounded px-3 py-1.5 text-xs font-medium bg-green-700 hover:bg-green-600 text-white transition-colors disabled:opacity-50"
				>
					{loading ? 'Working...' : `Approve ${expiredTtlText}`}
				</button>
				{#if isAdmin}
					<button
						onclick={handleReapproveForever}
						disabled={loading}
						data-testid="permission-expired-approve-forever"
						class="rounded px-3 py-1.5 text-xs font-medium bg-blue-700 hover:bg-blue-600 text-white transition-colors disabled:opacity-50"
					>
						Approve forever (admin only)
					</button>
				{/if}
				<button
					onclick={handleReapproveCancel}
					disabled={loading}
					data-testid="permission-expired-cancel"
					class="rounded px-3 py-1.5 text-xs font-medium bg-[var(--color-surface-tertiary)] hover:bg-[var(--color-surface-secondary)] text-[var(--color-text-primary)] transition-colors disabled:opacity-50"
				>
					Cancel
				</button>
			</div>
		{:else if isExtensionRequest}
			<!--
				Phase 6: extension-scoped four-scope chooser. The default
				is "session" (least surprise — expires on conversation
				end / restart) per the spec lock-in. The UI must NOT
				default to "forever".
			-->
			<div class="flex flex-wrap gap-2" data-testid="permission-scope-chooser">
				<button
					onclick={() => handleAllow('session')}
					disabled={loading}
					data-testid="permission-allow-session"
					class="rounded px-3 py-1.5 text-xs font-medium bg-green-600 hover:bg-green-500 text-white transition-colors disabled:opacity-50"
				>
					{loading ? 'Working...' : 'Allow this time'}
				</button>
				<button
					onclick={() => handleAllow('conversation')}
					disabled={loading}
					data-testid="permission-allow-conversation"
					class="rounded px-3 py-1.5 text-xs font-medium bg-green-700 hover:bg-green-600 text-white transition-colors disabled:opacity-50"
				>
					Allow for this conversation
				</button>
				<button
					onclick={() => handleAllow('project')}
					disabled={loading}
					data-testid="permission-allow-project"
					class="rounded px-3 py-1.5 text-xs font-medium bg-green-800 hover:bg-green-700 text-white transition-colors disabled:opacity-50"
				>
					Allow for this project
				</button>
				<button
					onclick={() => handleAllow('forever')}
					disabled={loading}
					data-testid="permission-allow-forever"
					class="rounded px-3 py-1.5 text-xs font-medium bg-blue-700 hover:bg-blue-600 text-white transition-colors disabled:opacity-50"
				>
					Always allow
				</button>
				<button
					onclick={handleDeny}
					disabled={loading}
					data-testid="permission-deny"
					class="rounded px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-500 text-white transition-colors disabled:opacity-50"
				>
					Deny
				</button>
			</div>
		{:else}
			<!-- Built-in tool gate: legacy two-button modal. -->
			<div class="flex gap-2">
				<button
					onclick={() => handleAllow()}
					disabled={loading}
					data-testid="permission-allow"
					class="rounded px-3 py-1.5 text-xs font-medium bg-green-600 hover:bg-green-500 text-white transition-colors disabled:opacity-50"
				>
					{loading ? 'Allowing...' : 'Allow'}
				</button>
				<button
					onclick={handleDeny}
					disabled={loading}
					data-testid="permission-deny"
					class="rounded px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-500 text-white transition-colors disabled:opacity-50"
				>
					Deny
				</button>
			</div>
		{/if}
	</div>
</div>
