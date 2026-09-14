<script lang="ts">
	import { Button } from "../../ui";
	import type { Ingredient, MenuItem } from "../../lib/types";

	let {
		items,
		onclose,
	}: {
		items: MenuItem[];
		onclose: () => void;
	} = $props();

	function formatQty(ing: Ingredient) {
		const qty =
			ing.quantity == null || ing.quantity === "" ? "" : String(ing.quantity);
		return [qty, ing.unit].filter(Boolean).join(" ");
	}

	const drinks = $derived(
		items.filter(
			(item) =>
				(item.ingredients && item.ingredients.length) ||
				item.method ||
				item.image?.asset?.url,
		),
	);
</script>

<div class="book">
	<div class="toolbar no-print">
		<Button variant="outline" onclick={onclose}>Back to editor</Button>
		<Button variant="primary" onclick={() => window.print()}>Print</Button>
	</div>

	<section class="cover">
		<p>Gwenda</p>
		<h1>Spec book</h1>
	</section>

	{#if !drinks.length}
		<p class="recipe-page">No recipes yet.</p>
	{:else}
		{#each drinks as item (item._id || item.name)}
			{@const sec = item.section?.parentTitle
				? `${item.section.parentTitle} · ${item.section.title}`
				: item.section?.title || ""}
			<article class="recipe-page">
				<div class="recipe-hero">
					<div>
						<p class="sec">{sec}</p>
						<h2>{item.name}</h2>
						<p class="meta">
							{[item.notes, item.price ? `£${item.price}` : ""]
								.filter(Boolean)
								.join(" · ")}
						</p>
						{#if item.ingredients?.length}
							<table>
								<tbody>
									{#each item.ingredients as ing}
										<tr>
											<td class="qty">{formatQty(ing)}</td>
											<td>
												{ing.name || ""}{#if ing.note}&nbsp;<em>{ing.note}</em>{/if}
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						{/if}
						{#if item.method}
							<p class="method">{item.method}</p>
						{/if}
						<div class="recipe-foot">
							{#if item.glassware}<span>Glass {item.glassware}</span>{/if}
							{#if item.ice}<span>Ice {item.ice}</span>{/if}
							{#if item.garnish}<span>Garnish {item.garnish}</span>{/if}
						</div>
					</div>
					{#if item.image?.asset?.url}
						<img src="{item.image.asset.url}?w=700" alt={item.name || ""} />
					{/if}
				</div>
			</article>
		{/each}
	{/if}
</div>

<style>
	.book {
		min-height: 100dvh;
		background: var(--book-bg);
		color: var(--book-ink);
		font-family: var(--font-display);
	}

	.toolbar {
		display: flex;
		gap: var(--gap-xs);
		padding: var(--gap);
		font-family: var(--font);
	}

	.cover {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		padding: 2.5rem 1.6rem;
		break-after: page;
	}

	.cover p {
		margin: 0;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		font-family: var(--font);
		font-size: 0.75rem;
		color: var(--primary);
	}

	.cover h1 {
		margin: 0.4rem 0 0;
		font-size: 3.4rem;
		font-weight: 600;
	}

	.recipe-page {
		max-width: 42rem;
		margin: 0 auto;
		padding: 1.6rem 1.4rem 2rem;
		min-height: 100vh;
		border-bottom: 1px solid var(--border-strong);
	}

	.sec {
		margin: 0;
		font-family: var(--font);
		font-size: 0.68rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--primary);
	}

	.recipe-page h2 {
		margin: 0.25rem 0 0.2rem;
		font-size: 2.1rem;
		font-weight: 600;
	}

	.meta {
		margin: 0 0 1rem;
		color: var(--book-muted);
		font-style: italic;
	}

	.recipe-hero {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 1rem;
		align-items: start;
	}

	.recipe-hero img {
		width: 9.5rem;
		height: 12rem;
		object-fit: cover;
		border-radius: var(--radius-md);
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-family: var(--font);
		font-size: 0.92rem;
	}

	td {
		padding: 0.28rem 0;
		border-bottom: 1px solid var(--border);
	}

	.qty {
		width: 5.5rem;
		color: var(--primary);
	}

	.method {
		white-space: pre-wrap;
		font-family: var(--font);
		font-size: 0.92rem;
		color: var(--book-ink);
	}

	.recipe-foot {
		margin-top: 1.1rem;
		font-family: var(--font);
		font-size: 0.82rem;
		color: var(--book-muted);
		display: flex;
		gap: 1.2rem;
		flex-wrap: wrap;
	}

	@media print {
		.toolbar {
			display: none !important;
		}
		.recipe-page {
			break-after: page;
		}
	}
</style>
