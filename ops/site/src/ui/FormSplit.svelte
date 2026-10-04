<script lang="ts">
	/**
	 * Two columns of sections side by side on a wide card (the wider one
	 * first), one column when narrow.
	 */
	import type { Snippet } from "svelte";
	import "./form-grid.css";

	let {
		children,
		side,
		class: className = "",
	}: {
		children: Snippet;
		side: Snippet;
		class?: string;
	} = $props();
</script>

<div class="form-split {className}">
	<div class="split-grid">
		<div class="split-main">{@render children()}</div>
		<div class="split-side">{@render side()}</div>
	</div>
</div>
