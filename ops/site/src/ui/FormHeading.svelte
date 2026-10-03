<script lang="ts">
	/**
	 * The small heading above a group of fields: a title, an optional quiet
	 * line beside it, and actions at the end of the row. `ruled` draws the
	 * thin rule that starts a new group part-way down a form.
	 */
	import type { Snippet } from "svelte";
	import "./form-grid.css";

	let {
		title,
		description,
		id,
		ruled = false,
		actions,
		class: className = "",
	}: {
		title: string;
		description?: string;
		/** The h2's id, for aria-labelledby. */
		id?: string;
		ruled?: boolean;
		actions?: Snippet;
		class?: string;
	} = $props();
</script>

<header class="form-heading {className}" class:ruled>
	<h2 {id}>{title}</h2>
	{#if description}<p class="description">{description}</p>{/if}
	{#if actions}<div class="actions">{@render actions()}</div>{/if}
</header>
