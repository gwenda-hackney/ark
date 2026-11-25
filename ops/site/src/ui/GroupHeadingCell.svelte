<script lang="ts">
	/**
	 * A heading row in a table (one table, grouped: menu sections, email
	 * groups, enquiry forms): its name in gold, a note above or beside it, and
	 * how many. DataGrid gives these rows their gold bar.
	 */
	import Badge from "./Badge.svelte";

	let {
		title = "",
		subtitle,
		note,
		count = 0,
	}: {
		title?: string;
		/** A small label above the name (a menu's chapter). */
		subtitle?: string;
		/** A line beside the name, saying what the group is. */
		note?: string;
		count?: number;
	} = $props();
</script>

<div class="group grid-group-heading">
	{#if subtitle}
		<p class="chapter">{subtitle}</p>
	{/if}
	<div class="row">
		<h3>{title}</h3>
		<Badge label={String(count)} title="{count} item{count === 1 ? '' : 's'}" />
		{#if note}<p class="note">{note}</p>{/if}
	</div>
</div>

<style>
	.group {
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 0.1rem;
		width: 100%;
		height: 100%;
		padding: 0 var(--page-gutter);
		box-sizing: border-box;
	}

	.chapter {
		margin: 0;
		font-size: var(--text-2xs);
		font-weight: 600;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--muted-foreground);
		line-height: 1.2;
	}

	.row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-width: 0;
	}

	.note {
		margin: 0;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--muted-foreground);
		font-size: var(--text-sm);
	}

	h3 {
		margin: 0;
		font-size: var(--text-sm);
		line-height: var(--leading-sm);
		font-weight: 600;
		color: var(--primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
