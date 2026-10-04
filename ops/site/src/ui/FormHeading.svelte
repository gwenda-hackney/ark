<script lang="ts">
	/**
	 * The small heading above a group of fields: a title, an optional quiet
	 * line beside it, and actions at the end of the row. `ruled` draws the
	 * thin rule that starts a new group part-way down a form. `tooltip` puts
	 * the quiet ? beside the title, for a group whose purpose isn't obvious.
	 */
	import type { Snippet } from "svelte";
	import Tip from "./Tip.svelte";
	import "./form-grid.css";

	let {
		title,
		description,
		tooltip,
		id,
		ruled = false,
		actions,
		class: className = "",
	}: {
		title: string;
		description?: string;
		/** Help for the ? beside the title. */
		tooltip?: string;
		/** The h2's id, for aria-labelledby. */
		id?: string;
		ruled?: boolean;
		actions?: Snippet;
		class?: string;
	} = $props();
</script>

<header class="form-heading {className}" class:ruled>
	<h2 {id}>{title}{#if tooltip}<Tip label={title} {tooltip} />{/if}</h2>
	{#if description}<p class="description">{description}</p>{/if}
	{#if actions}<div class="actions">{@render actions()}</div>{/if}
</header>
