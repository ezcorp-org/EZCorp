<script lang="ts">
	import { onMount } from "svelte";
	import { fly } from "svelte/transition";
	import {
		DISMISS_STORAGE_KEY,
		dismissValue,
		shouldShowBanner,
		type VersionInfo,
	} from "./UpdateBanner.helpers";

	let info = $state<VersionInfo | null>(null);
	let dismissed = $state(false);

	onMount(async () => {
		try {
			const res = await fetch("/api/version");
			if (!res.ok) return;
			const data = (await res.json()) as VersionInfo;
			info = data;
			if (!shouldShowBanner(data, sessionStorage)) {
				dismissed = true;
			}
		} catch {
			// Silent — update check is best-effort.
		}
	});

	function dismiss() {
		if (info) {
			const val = dismissValue(info);
			if (val) sessionStorage.setItem(DISMISS_STORAGE_KEY, val);
		}
		dismissed = true;
	}
</script>

{#if info?.updateAvailable && !dismissed}
	<div class="update-toast" role="status" in:fly={{ y: 16, duration: 200 }}>
		<svg
			class="icon"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<circle cx="12" cy="12" r="10" />
			<path d="M12 16V8M8.5 11.5 12 8l3.5 3.5" />
		</svg>
		<div class="body">
			<div class="headline">
				Update available: <strong>{info.latest}</strong>
				<span class="current">(current: {info.current})</span>
			</div>
			{#if info.releaseUrl}
				<a class="release-link" href={info.releaseUrl} target="_blank" rel="noopener noreferrer"
					>Release notes</a
				>
			{/if}
		</div>
		<button type="button" class="close" onclick={dismiss} aria-label="Dismiss">×</button>
	</div>
{/if}

<style>
	.update-toast {
		position: fixed;
		bottom: calc(1rem + env(safe-area-inset-bottom, 0px));
		left: calc(1rem + env(safe-area-inset-left, 0px));
		z-index: 60;
		display: flex;
		align-items: flex-start;
		gap: 0.625rem;
		max-width: min(20rem, calc(100vw - 2rem));
		padding: 0.75rem 0.875rem;
		background: #1f3a5f;
		color: #fff;
		border: 1px solid rgba(255, 255, 255, 0.14);
		border-radius: 0.625rem;
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.32);
		font-size: 0.8125rem;
		line-height: 1.35;
	}
	/* Clear the mobile bottom navigation on small screens. */
	@media (max-width: 768px) {
		.update-toast {
			bottom: calc(4.5rem + env(safe-area-inset-bottom, 0px));
		}
	}
	.icon {
		flex: none;
		width: 1.125rem;
		height: 1.125rem;
		margin-top: 0.05rem;
		opacity: 0.9;
	}
	.body {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		min-width: 0;
	}
	.current {
		opacity: 0.7;
		margin-left: 0.25rem;
	}
	.release-link {
		color: #fff;
		text-decoration: underline;
		width: fit-content;
	}
	.release-link:hover {
		opacity: 0.8;
	}
	.close {
		flex: none;
		align-self: flex-start;
		margin: -0.25rem -0.25rem 0 0.25rem;
		background: transparent;
		border: none;
		color: #fff;
		font-size: 1.25rem;
		cursor: pointer;
		line-height: 1;
		padding: 0 0.25rem;
	}
	.close:hover {
		opacity: 0.7;
	}
</style>
