<script lang="ts">
	/**
	 * One group of an editor's fields inside the editor's single card: a title
	 * that says what the group is for, an optional line under it, then the
	 * fields. Groups are divided by a rule, not boxed, so the form reads as one
	 * thing. On a wide card the title sits in a column on the left and the
	 * fields flow beside it; narrow, the title sits above.
	 *
	 * Fields flow left to right in cells of at least 16rem (`columns={1}` keeps
	 * one per row). A child with class `span-all` takes the whole row; wrap
	 * small fields (times, prices, ABV) in `<div class="field-row">` so they
	 * sit side by side at their own widths instead of stretching.
	 */
	import type { Snippet } from "svelte";

	let {
		title,
		description,
		id,
		columns = 2,
		actions,
		children,
		class: className = "",
	}: {
		title: string;
		description?: string;
		/** Anchor for the section; the heading's id is `${id}-title`. */
		id?: string;
		columns?: 1 | 2;
		actions?: Snippet;
		children: Snippet;
		class?: string;
	} = $props();

	const uid = `sec-${Math.random().toString(36).slice(2, 9)}`;
	const headingId = $derived(`${id || uid}-title`);
</script>

<section class="form-section {className}" {id} aria-labelledby={headingId}>
	<div class="inner">
	<header class="head">
		<div class="titles">
			<h2 id={headingId}>{title}</h2>
			{#if description}<p class="description">{description}</p>{/if}
		</div>
		{#if actions}<div class="actions">{@render actions()}</div>{/if}
	</header>
	<div class="body" class:two={columns === 2}>
		{@render children()}
	</div>
	</div>
</section>

<style>
	.form-section {
		min-width: 0;
		padding-block: var(--space-6);
		border-top: 1px solid var(--border);
		container-type: inline-size;
		/* Errors scroll into view below the sticky header, not under it. */
		scroll-margin-top: var(--space-4);
	}

	.form-section:first-child {
		padding-top: var(--space-2);
		border-top: 0;
	}

	/* The section is the size container; this inner grid is what it lays out. */
	.inner {
		display: grid;
		gap: var(--space-4);
		min-width: 0;
	}

	.head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-3);
		min-width: 0;
	}

	.titles {
		display: grid;
		gap: var(--space-1);
		min-width: 0;
	}

	h2 {
		margin: 0;
		font-family: var(--font);
		font-size: var(--text-md);
		line-height: var(--leading-md, 1.5rem);
		font-weight: 600;
		color: var(--fg);
	}

	.description {
		margin: 0;
		max-width: 40rem;
		font-size: var(--text-sm);
		color: var(--fg-muted);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		flex-shrink: 0;
	}

	.body {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-4) var(--space-6);
		align-items: start;
		min-width: 0;
	}

	.body > :global(.span-all),
	.body > :global(.field-row) {
		grid-column: 1 / -1;
	}

	/* Small fields side by side, each at its own width. */
	.body :global(.field-row) {
		display: flex;
		flex-wrap: wrap;
		align-items: start;
		gap: var(--space-4) var(--space-5);
		min-width: 0;
	}

	.body :global(.field-row > .field) {
		flex: 0 1 auto;
		width: auto;
		min-width: 0;
	}

	.body :global(.field-row > .field.w-sm) {
		min-width: 9rem;
	}

	.body :global(.field-row > .field.w-xs) {
		min-width: 6rem;
	}

	.body :global(.field-row > .field.w-md) {
		flex: 1 1 12rem;
		max-width: 16rem;
	}

	.body :global(.field-row > .field.w-lg),
	.body :global(.field-row > .field.w-full) {
		flex: 1 1 14rem;
	}

	/* Narrow cards: small fields pair up two to a row instead of one each. */
	@container (max-width: 33.99rem) {
		.body :global(.field-row) {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.body :global(.field-row > .field.w-md),
		.body :global(.field-row > .field.w-lg),
		.body :global(.field-row > .field.w-full) {
			grid-column: 1 / -1;
			max-width: none;
		}

		.body :global(.field-row > .field.w-sm),
		.body :global(.field-row > .field.w-xs) {
			min-width: 0;
		}
	}

	@container (min-width: 34rem) {
		.body.two {
			grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
		}
	}

	/* Wide: the title in a column on the left, the fields beside it. */
	@container (min-width: 52rem) {
		.inner {
			grid-template-columns: 14rem minmax(0, 1fr);
			column-gap: var(--space-8);
		}

		.head {
			flex-direction: column;
			align-items: stretch;
		}

		.actions {
			justify-content: flex-start;
		}
	}

	/* Keep in sync with SHELL_MOBILE_MAX_PX. */
	@media (max-width: 900px) {
		.form-section {
			padding-block: var(--space-5);
		}
	}
</style>
