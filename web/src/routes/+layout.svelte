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
	});
</script>

<UpdateBanner />
{@render children()}
