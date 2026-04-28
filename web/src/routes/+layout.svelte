<script lang="ts">
	import "../app.css";
	import { onMount } from "svelte";
	import UpdateBanner from "$lib/components/UpdateBanner.svelte";

	let { children } = $props();

	onMount(() => {
		const splash = document.getElementById('splash');
		if (splash) {
			splash.style.opacity = '0';
			setTimeout(() => splash.remove(), 300);
		}

		// SvelteKit's client-side runtime re-sets document.title from each
		// route's <svelte:head> after hydration and on navigation, which
		// strips the SSR-applied "DEV " prefix from hooks.server.ts.
		// Re-apply it whenever the title changes.
		if (document.documentElement.dataset.devIndicator === '1') {
			const ensurePrefix = () => {
				if (!document.title.startsWith('DEV ')) {
					document.title = 'DEV ' + document.title;
				}
			};
			ensurePrefix();
			const observer = new MutationObserver(ensurePrefix);
			observer.observe(document.head, { childList: true, characterData: true, subtree: true });
			return () => observer.disconnect();
		}
	});
</script>

<UpdateBanner />
{@render children()}
