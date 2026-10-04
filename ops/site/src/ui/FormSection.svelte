<script lang="ts">
	/**
	 * One group of an editor's fields inside the editor's single card: a small
	 * heading, then the fields on a 12-column grid. Groups are divided by a
	 * thin rule, not boxed, so the form reads as one thing.
	 *
	 * A child takes the whole row unless it has `span-2` … `span-9` (twelfths
	 * of the row). On a narrow card small fields pair up and the rest stack.
	 * `form-stack` stacks a few fields in one cell beside a taller neighbour.
	 */
	import type { Snippet } from "svelte";
	import FormHeading from "./FormHeading.svelte";
	import "./form-grid.css";

	let {
		title,
		description,
		help,
		id,
		actions,
		children,
		class: className = "",
	}: {
		title: string;
		description?: string;
		/** Help drawer topic (its title) for the ? beside the title. */
		help?: string;
		/** Anchor for the section; the heading's id is `${id}-title`. */
		id?: string;
		actions?: Snippet;
		children: Snippet;
		class?: string;
	} = $props();

	const uid = `sec-${Math.random().toString(36).slice(2, 9)}`;
	const headingId = $derived(`${id || uid}-title`);
</script>

<section class="form-section {className}" {id} aria-labelledby={headingId}>
	<FormHeading {title} {description} {help} id={headingId} {actions} />
	<div class="form-cols">
		{@render children()}
	</div>
</section>
