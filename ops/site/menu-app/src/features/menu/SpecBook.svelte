<script lang="ts">
	import { onMount } from "svelte";
	import { Button, Segmented } from "../../ui";
	import type { SegmentedItem } from "../../ui/types";
	import {
		DRINK_TYPES,
		drinkTypeLabel,
		formatPrices,
		hasRecipe,
		normalizeDrinkType,
		type DrinkType,
		type Ingredient,
		type InventoryItem,
		type MenuItem,
	} from "../../lib/types";
	import { computeRecipeAbv, formatAbv } from "../../lib/abv";
	import { inventoryItemPath } from "../../lib/nav";
	import InventoryLink from "./cells/InventoryLink.svelte";

	type TypeFilter = "all" | DrinkType;

	let {
		items,
		inventory = [],
		onclose,
	}: {
		items: MenuItem[];
		inventory?: InventoryItem[];
		onclose: () => void;
	} = $props();

	let typeFilter = $state<TypeFilter>("cocktail");
	let scroller: HTMLElement | undefined = $state();

	function setFilter(id: string) {
		if (
			id === "all" ||
			id === "cocktail" ||
			id === "pour" ||
			id === "beer" ||
			id === "packaged"
		) {
			typeFilter = id;
		}
	}

	function formatQty(ing: Ingredient) {
		const qty =
			ing.quantity == null || ing.quantity === "" ? "" : String(ing.quantity);
		return [qty, ing.unit].filter(Boolean).join(" ");
	}

	function imageSrc(url: string | undefined): string {
		if (!url) return "";
		try {
			const parsed = new URL(url, location.origin);
			if (parsed.hostname.includes("cdn.sanity.io")) {
				parsed.searchParams.set("w", "1600");
				parsed.searchParams.set("fit", "max");
				parsed.searchParams.set("auto", "format");
				return parsed.toString();
			}
		} catch {
			/* keep original */
		}
		return url;
	}

	function sectionLabel(item: MenuItem): string {
		return item.section?.parentTitle
			? `${item.section.parentTitle} · ${item.section.title}`
			: item.section?.title || "";
	}

	function lines(item: MenuItem): Ingredient[] {
		return (item.ingredients || []).filter(
			(ing) => String(ing.name || "").trim() || ing.quantity,
		);
	}

	const catalogById = $derived.by(() => {
		const map = new Map<string, InventoryItem>();
		for (const item of inventory) {
			const id = String(item._id || item.id || "").trim();
			if (id) map.set(id, item);
		}
		return map;
	});

	function stockHref(ing: Ingredient): string | undefined {
		const invId = ing.inventoryId != null ? String(ing.inventoryId).trim() : "";
		if (!invId) return undefined;
		const stock = catalogById.get(invId);
		const path = inventoryItemPath(String(stock?.name || ing.name || "").trim());
		return path.startsWith("/inventory/") ? path : undefined;
	}

	function abvLabel(item: MenuItem): string {
		const stored = item.abv?.trim();
		if (stored) return stored.includes("%") ? stored : `${stored}%`;
		if (!hasRecipe(item.drinkType)) return "";
		const computed = computeRecipeAbv(item.ingredients);
		return computed == null ? "" : formatAbv(computed);
	}

	function bookTitle(filter: TypeFilter): string {
		switch (filter) {
			case "cocktail":
				return "Cocktails";
			case "pour":
				return "Pours";
			case "beer":
				return "Beer";
			case "packaged":
				return "Packaged";
			default:
				return "Spec book";
		}
	}

	const named = $derived(
		items.filter((item) => String(item.name || "").trim()),
	);

	const counts = $derived.by(() => {
		const byType: Record<DrinkType, number> = {
			cocktail: 0,
			pour: 0,
			beer: 0,
			packaged: 0,
		};
		for (const item of named) {
			byType[normalizeDrinkType(item.drinkType)] += 1;
		}
		return { all: named.length, ...byType };
	});

	const filterItems: SegmentedItem[] = $derived([
		{ id: "all", label: "All", count: counts.all },
		...DRINK_TYPES.map((row) => ({
			id: row.value,
			label: row.label,
			count: counts[row.value],
		})),
	]);

	const drinks = $derived(
		named.filter((item) =>
			typeFilter === "all"
				? true
				: normalizeDrinkType(item.drinkType) === typeFilter,
		),
	);

	$effect(() => {
		typeFilter;
		scroller?.scrollTo(0, 0);
	});

	onMount(() => {
		document.documentElement.classList.add("print-book");
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				onclose();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => {
			document.documentElement.classList.remove("print-book");
			window.removeEventListener("keydown", onKey);
		};
	});
</script>

<div class="book scrollbar-fade" bind:this={scroller}>
	<div class="toolbar no-print">
		<Button variant="outline" onclick={onclose}>Back to menu</Button>
		<Segmented
			value={typeFilter}
			items={filterItems}
			tone="soft"
			size="sm"
			ariaLabel="Filter by drink type"
			onChange={setFilter}
		/>
		<p class="tally">
			{bookTitle(typeFilter)}
			·
			{drinks.length}
			{drinks.length === 1 ? "page" : "pages"}
		</p>
		<Button variant="primary" onclick={() => window.print()}>Print</Button>
	</div>

	<div class="pages">
		{#if !drinks.length}
			<p class="empty">
				No {typeFilter === "all" ? "items" : bookTitle(typeFilter).toLowerCase()} to
				print.
			</p>
		{:else}
			{#each drinks as item (item._id || item.name)}
				{@const cocktail = hasRecipe(item.drinkType)}
				{@const photo = imageSrc(item.image?.asset?.url)}
				{@const sec = sectionLabel(item)}
				{@const price = formatPrices(item)}
				{@const ings = lines(item)}
				{@const abv = abvLabel(item)}
				<article class="recipe-page">
					<header class="mast">
						<p class="kicker">
							{[drinkTypeLabel(item.drinkType), sec].filter(Boolean).join(" · ")}
						</p>
						<h2>{item.name}</h2>
						{#if item.notes || price}
							<p class="lede">
								{[item.notes, price].filter(Boolean).join(" · ")}
							</p>
						{/if}
						{#if !cocktail && item.producer}
							<p class="producer">{item.producer}</p>
						{/if}
					</header>

					{#if photo}
						<figure class="photo">
							<img
								src={photo}
								alt={item.image?.alt || item.name || ""}
								loading="eager"
							/>
						</figure>
					{/if}

					<div class="copy">
						{#if cocktail}
							{#if ings.length}
								<table>
									<tbody>
										{#each ings as ing}
											{@const href = stockHref(ing)}
											<tr>
												<td class="qty">{formatQty(ing)}</td>
												<td>
													<InventoryLink
														text={ing.name || ""}
														href={href || ""}
														inline
													/>{#if ing.note}&nbsp;<em>{ing.note}</em
													>{/if}
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							{:else if item.description}
								<div class="method-block">
									<p class="label">Ingredients</p>
									<p class="method">{item.description}</p>
								</div>
							{:else}
								<p class="missing">No ingredients on file.</p>
							{/if}

							{#if item.method}
								<div class="method-block">
									<p class="label">Method</p>
									<p class="method">{item.method}</p>
								</div>
							{/if}
						{:else if ings.length}
							<table>
								<tbody>
									{#each ings as ing}
										{@const href = stockHref(ing)}
										<tr>
											<td class="qty">{formatQty(ing)}</td>
											<td>
												<InventoryLink
													text={ing.name || ""}
													href={href || ""}
													inline
												/>{#if ing.note}&nbsp;<em>{ing.note}</em
												>{/if}
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						{:else if item.description}
							<p class="method">{item.description}</p>
						{/if}

						{#if item.glassware || item.ice || item.garnish || abv || item.volume}
							<div class="foot">
								{#if item.glassware || item.ice || item.garnish}
									<div class="build">
										{#if item.glassware}<span>Glass {item.glassware}</span>{/if}
										{#if item.ice}<span>Ice {item.ice}</span>{/if}
										{#if item.garnish}<span>Garnish {item.garnish}</span>{/if}
									</div>
								{/if}
								{#if abv || item.volume}
									<div class="facts">
										{#if abv}<span>{abv} ABV</span>{/if}
										{#if item.volume}<span>{item.volume}</span>{/if}
									</div>
								{/if}
							</div>
						{/if}
					</div>
				</article>
			{/each}
		{/if}
	</div>
</div>

<style>
	.book {
		min-height: 100dvh;
		background: var(--background);
		color: var(--foreground);
		font-family: var(--font-display);
		-webkit-print-color-adjust: exact;
		print-color-adjust: exact;
	}

	.toolbar {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-sm);
		align-items: center;
		padding: var(--gap) var(--page-gutter);
		font-family: var(--font);
		border-bottom: 1px solid var(--border);
		background: var(--background);
		position: sticky;
		top: 0;
		z-index: 2;
	}

	.tally {
		margin: 0;
		margin-left: auto;
		font-size: 0.75rem;
		color: var(--muted-foreground);
	}

	.pages {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.5rem;
		padding: 1.5rem var(--page-gutter) 2.5rem;
	}

	.empty {
		margin: 4rem 0;
		font-family: var(--font);
		color: var(--muted-foreground);
	}

	.recipe-page {
		width: 210mm;
		height: 297mm;
		min-height: 297mm;
		max-height: 297mm;
		flex-shrink: 0;
		padding: 16mm;
		background: var(--book-bg);
		color: var(--book-ink);
		border: 1px solid var(--book-rule);
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		overflow: hidden;
	}

	.mast {
		flex: 0 0 auto;
	}

	.photo {
		margin: 0;
		flex: 0 0 auto;
		align-self: stretch;
		width: 100%;
		max-height: 130mm;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.photo img {
		display: block;
		max-width: 100%;
		max-height: 130mm;
		width: auto;
		height: auto;
		object-fit: contain;
		object-position: center;
	}

	.copy {
		flex: 1 1 auto;
		min-width: 0;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}

	.kicker {
		margin: 0;
		font-family: var(--font);
		font-size: 0.68rem;
		font-weight: 600;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--book-accent);
	}

	.mast h2 {
		margin: 0.25rem 0 0;
		font-size: 26pt;
		font-weight: 600;
		letter-spacing: -0.02em;
		line-height: 1.05;
		color: var(--book-ink);
	}

	.lede,
	.producer {
		margin: 0.35rem 0 0;
		color: var(--book-muted);
		font-style: italic;
		font-size: 1.05rem;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-family: var(--font);
		font-size: 0.95rem;
	}

	td {
		padding: 0.32rem 0;
		border-bottom: 1px solid var(--book-rule);
		vertical-align: baseline;
	}

	.qty {
		width: 5.6rem;
		padding-right: 0.85rem;
		color: var(--book-accent);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
		text-align: right;
	}

	td :global(.inv-link) {
		font-weight: 500;
	}

	td :global(.inv-link:hover) {
		color: var(--book-accent);
	}

	.missing {
		margin: 0.4rem 0 0;
		font-family: var(--font);
		font-size: 0.9rem;
		color: var(--book-muted);
	}

	.method-block {
		margin-top: 1.15rem;
	}

	.copy > :first-child {
		margin-top: 0;
	}

	.label {
		margin: 0 0 0.35rem;
		font-family: var(--font);
		font-size: 0.68rem;
		font-weight: 600;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--book-accent);
	}

	.method {
		margin: 0;
		white-space: pre-wrap;
		font-family: var(--font);
		font-size: 0.95rem;
		line-height: 1.5;
		color: var(--book-ink);
	}

	.foot {
		margin-top: auto;
		padding-top: 1.15rem;
		display: grid;
		gap: 0.45rem;
	}

	.build,
	.facts {
		font-family: var(--font);
		font-size: 0.82rem;
		color: var(--book-muted);
		display: flex;
		gap: 1.1rem;
		flex-wrap: wrap;
	}

	@media screen {
		.book {
			position: fixed;
			inset: 0;
			z-index: 80;
			overflow: auto;
		}

		.pages {
			overflow-x: auto;
		}

		.recipe-page {
			box-shadow: var(--shadow);
		}
	}

	@media print {
		.book {
			background: var(--book-bg);
			color: var(--book-ink);
		}

		.toolbar {
			display: none !important;
		}

		.pages {
			gap: 0;
			padding: 0;
			align-items: stretch;
			width: 210mm;
		}

		.recipe-page {
			width: 210mm;
			height: 297mm;
			min-height: 297mm;
			max-height: 297mm;
			padding: 16mm;
			border: 0;
			overflow: hidden;
			box-shadow: none;
			break-inside: avoid;
			page-break-inside: avoid;
		}

		.recipe-page:not(:last-child) {
			break-after: page;
			page-break-after: always;
		}

		td :global(.inv-link) {
			color: inherit;
			text-decoration: none;
		}
	}
</style>
