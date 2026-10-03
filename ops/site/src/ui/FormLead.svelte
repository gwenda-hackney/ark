<script lang="ts">
	/**
	 * The top of an editor's form: the identity fields on the 12-column grid
	 * with the photo beside them at the top right. The photo scrolls with the
	 * form. On a narrow card it is one column, and the photo comes straight
	 * after the children marked `lead-first` (the first heading and the name).
	 */
	import type { Snippet } from "svelte";
	import "./form-grid.css";

	let {
		aside,
		children,
		asideWidth = "20rem",
		class: className = "",
	}: {
		/** The photo block. */
		aside: Snippet;
		children: Snippet;
		asideWidth?: string;
		class?: string;
	} = $props();
</script>

<div class="form-lead {className}" style:--form-aside-w={asideWidth}>
	<div class="lead-grid">
		<div class="lead-fields">
			{@render children()}
		</div>
		<div class="lead-aside">
			{@render aside()}
		</div>
	</div>
</div>
