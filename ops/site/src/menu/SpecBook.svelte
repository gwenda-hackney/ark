<script lang="ts">
	import { onMount } from "svelte";
	import { Button, Segmented } from "../ui";
	import type { SegmentedItem } from "../ui/types";
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
	} from "../app/types";
	import { computeRecipeAbv, formatAbv } from "./abv";
	import { inventoryItemPath } from "../app/nav";
	import { formatMethodHtml } from "./format-method";
	import InventoryLink from "./cells/InventoryLink.svelte";

	type TypeFilter = "all" | DrinkType;

	let {
		items,
		inventory = [],
		filter = "cocktail",
		single = false,
		onfilter,
		onclose,
	}: {
		items: MenuItem[];
		inventory?: InventoryItem[];
		filter?: TypeFilter;
		/** One drink only — hide type filter. */
		single?: boolean;
		onfilter?: (next: TypeFilter) => void;
		onclose: () => void;
	} = $props();

	const typeFilter = $derived.by((): TypeFilter => {
		if (single) return "all";
		const raw = String(filter || "").trim();
		if (
			raw === "all" ||
			raw === "cocktail" ||
			raw === "pour" ||
			raw === "beer" ||
			raw === "packaged" ||
			raw === "postmix"
		) {
			return raw;
		}
		return "cocktail";
	});
	let scroller: HTMLElement | undefined = $state();

	function setFilter(id: string) {
		if (single) return;
		if (
			id === "all" ||
			id === "cocktail" ||
			id === "pour" ||
			id === "beer" ||
			id === "packaged" ||
			id === "postmix"
		) {
			onfilter?.(id);
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
			case "postmix":
				return "Postmix";
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
			postmix: 0,
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
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				onclose();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => {
			window.removeEventListener("keydown", onKey);
		};
	});
</script>

<div class="book scrollbar-fade" bind:this={scroller}>
	<div class="toolbar no-print">
		<Button variant="outline" onclick={onclose}>
			{single ? "Back to drink" : "Back to menu"}
		</Button>
		{#if !single}
			<Segmented
				value={typeFilter}
				items={filterItems}
				tone="soft"
				size="sm"
				ariaLabel="Filter by drink type"
				onChange={setFilter}
			/>
		{/if}
		<p class="tally">
			{#if single}
				{drinks[0]?.name || "Recipe"}
				· 1 page
			{:else}
				{bookTitle(typeFilter)}
				·
				{drinks.length}
				{drinks.length === 1 ? "page" : "pages"}
			{/if}
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
				{@const methodHtml = formatMethodHtml(item.method)}
				{@const spec = [abv ? `${abv} ABV` : "", item.volume || ""]
					.filter(Boolean)
					.join(" · ")}
				<article class="recipe-page">
					<header class="mast">
						<p class="kicker">
							{[drinkTypeLabel(item.drinkType), sec].filter(Boolean).join(" · ")}
						</p>
						<div class="mast-row">
							<div class="mast-main">
								<h2>{item.name}</h2>
								{#if item.notes}
									<p class="lede">{item.notes}</p>
								{/if}
								{#if !cocktail && item.producer}
									<p class="producer">{item.producer}</p>
								{/if}
							</div>
							{#if price || spec}
								<div class="mast-side">
									{#if price}
										<p class="price tnum">{price}</p>
									{/if}
									{#if spec}
										<p class="spec tnum">{spec}</p>
									{/if}
								</div>
							{/if}
						</div>
					</header>

					<div class="body" class:has-photo={Boolean(photo)}>
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
									<div class="spec-list build">
										{#each ings as ing}
											{@const href = stockHref(ing)}
											<div class="spec-row">
												<span class="spec-label">{formatQty(ing)}</span>
												<span class="spec-value">
													<InventoryLink
														text={ing.name || ""}
														href={href || ""}
														inline
													/>{#if ing.note}&nbsp;<em>{ing.note}</em>{/if}
												</span>
											</div>
										{/each}
									</div>
								{:else if item.description}
									<div class="method">{@html formatMethodHtml(item.description)}</div>
								{:else}
									<p class="missing">No ingredients on file.</p>
								{/if}
							{:else if ings.length}
								<div class="spec-list build">
									{#each ings as ing}
										{@const href = stockHref(ing)}
										<div class="spec-row">
											<span class="spec-label">{formatQty(ing)}</span>
											<span class="spec-value">
												<InventoryLink
													text={ing.name || ""}
													href={href || ""}
													inline
												/>{#if ing.note}&nbsp;<em>{ing.note}</em>{/if}
											</span>
										</div>
									{/each}
								</div>
							{:else if item.description}
								<div class="method">{@html formatMethodHtml(item.description)}</div>
							{/if}

							{#if item.glassware || item.ice || item.garnish}
								<div class="spec-list serve">
									{#if item.glassware}
										<div class="spec-row">
											<span class="spec-label">Glass</span>
											<span class="spec-value">{item.glassware}</span>
										</div>
									{/if}
									{#if item.ice}
										<div class="spec-row">
											<span class="spec-label">Ice</span>
											<span class="spec-value">{item.ice}</span>
										</div>
									{/if}
									{#if item.garnish}
										<div class="spec-row">
											<span class="spec-label">Garnish</span>
											<span class="spec-value">{item.garnish}</span>
										</div>
									{/if}
								</div>
							{/if}
						</div>

						{#if cocktail && methodHtml}
							<div class="method-block span">
								<div class="method">{@html methodHtml}</div>
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
		--spec-qty: 4.75rem;
		--spec-gap: 0.75rem;
		--spec-label: 0.68rem;
		--spec-body: 0.9rem;
		--spec-track: 0.14em;
		width: 210mm;
		height: 297mm;
		min-height: 297mm;
		max-height: 297mm;
		flex-shrink: 0;
		padding: 14mm;
		background: var(--book-bg);
		color: var(--book-ink);
		border: 1px solid var(--book-rule);
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
		overflow: hidden;
		font-family: var(--font);
	}

	.mast {
		flex: 0 0 auto;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid var(--book-accent);
	}

	.body {
		flex: 1 1 auto;
		min-height: 0;
		min-width: 0;
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		grid-template-rows: auto minmax(0, 1fr);
		gap: 0.75rem 1rem;
		align-items: start;
		align-content: start;
	}

	.body.has-photo {
		grid-template-columns: minmax(0, 78mm) minmax(0, 1fr);
	}

	.body.has-photo .photo {
		grid-column: 1;
		grid-row: 1;
	}

	.body.has-photo .copy {
		grid-column: 2;
		grid-row: 1;
	}

	.span {
		grid-column: 1 / -1;
		grid-row: 2;
		min-height: 0;
	}

	.photo {
		margin: 0;
		width: 100%;
		max-height: 110mm;
		overflow: hidden;
		text-align: center;
	}

	.photo img {
		display: block;
		margin: 0 auto;
		max-width: 100%;
		max-height: 110mm;
		width: 100%;
		height: auto;
		object-fit: contain;
		object-position: top center;
	}

	.copy {
		min-width: 0;
		min-height: 0;
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
	}

	.kicker {
		margin: 0 0 0.4rem;
		font-family: var(--font);
		font-size: var(--spec-label);
		font-weight: 600;
		letter-spacing: var(--spec-track);
		text-transform: uppercase;
		color: var(--book-accent);
	}

	.mast-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		column-gap: 1.25rem;
		align-items: start;
	}

	.mast-main {
		min-width: 0;
	}

	.mast h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 32pt;
		font-weight: 600;
		letter-spacing: -0.02em;
		line-height: 1.05;
		color: var(--book-ink);
	}

	.lede,
	.producer {
		margin: 0.4rem 0 0;
		font-family: var(--font);
		font-style: italic;
		font-size: var(--spec-body);
		font-weight: 400;
		line-height: 1.35;
		color: var(--book-muted);
	}

	.mast-side {
		display: grid;
		gap: 0.3rem;
		justify-items: end;
		text-align: right;
		padding-top: 0.2rem;
	}

	.price,
	.spec {
		margin: 0;
		font-family: var(--font);
		font-style: normal;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
		line-height: 1.2;
	}

	.price {
		font-size: 1.15rem;
		font-weight: 600;
		color: var(--book-ink);
	}

	.spec {
		font-size: var(--spec-body);
		font-weight: 400;
		color: var(--book-muted);
	}

	.spec-list {
		display: flex;
		flex-direction: column;
		gap: 0.18rem;
		font-family: var(--font);
		font-size: var(--spec-body);
		font-weight: 400;
		line-height: 1.35;
	}

	.spec-row {
		display: grid;
		grid-template-columns: var(--spec-qty) minmax(0, 1fr);
		column-gap: var(--spec-gap);
		align-items: baseline;
	}

	.spec-label {
		color: var(--book-accent);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.spec-value {
		color: var(--book-ink);
		min-width: 0;
	}

	.spec-value :global(.inv-link),
	.spec-value :global(.inv-text) {
		font-weight: inherit;
		color: inherit;
		text-decoration: none;
	}

	.spec-value :global(.inv-link:hover) {
		color: var(--book-accent);
	}

	.spec-value em {
		font-style: italic;
		color: var(--book-muted);
	}

	.missing {
		margin: 0;
		font-family: var(--font);
		font-size: var(--spec-body);
		font-weight: 400;
		color: var(--book-muted);
	}

	.method-block.span {
		margin: 0;
		padding: 0;
		border: 0;
		min-height: 0;
		overflow: auto;
	}

	.copy > :first-child {
		margin-top: 0;
	}

	.method {
		margin: 0;
		font-family: var(--font);
		font-size: var(--spec-body);
		font-weight: 400;
		line-height: 1.45;
		color: var(--book-ink);
	}

	.method :global(p) {
		margin: 0 0 0.55rem;
	}

	.method :global(p:last-child) {
		margin-bottom: 0;
	}

	.method :global(h1),
	.method :global(h2),
	.method :global(h3) {
		margin: 0.65rem 0 0.3rem;
		font-family: var(--font);
		font-weight: 600;
		letter-spacing: 0.02em;
		line-height: 1.25;
		color: var(--book-ink);
	}

	.method :global(h1:first-child),
	.method :global(h2:first-child),
	.method :global(h3:first-child) {
		margin-top: 0;
	}

	.method :global(h1) {
		font-size: 1.05em;
	}

	.method :global(h2) {
		font-size: 1em;
	}

	.method :global(h3) {
		font-size: 0.95em;
		color: var(--book-muted);
	}

	.method :global(ul),
	.method :global(ol) {
		margin: 0 0 0.55rem;
		padding-left: 1.35rem;
	}

	.method :global(ul > li) {
		list-style: disc;
		list-style-position: outside;
		margin: 0.15rem 0;
	}

	.method :global(ol > li) {
		list-style: decimal;
		list-style-position: outside;
		margin: 0.15rem 0;
	}

	.method :global(li::marker) {
		color: var(--book-accent);
	}

	.serve {
		margin: 0.85rem 0 0;
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
		@page {
			size: A4;
			margin: 0;
		}

		.book {
			background: var(--book-bg);
			color: var(--book-ink);
			position: static;
			overflow: visible;
		}

		.toolbar {
			display: none !important;
		}

		.pages {
			display: block;
			gap: 0;
			padding: 0;
			width: 210mm;
		}

		.recipe-page {
			display: flex;
			flex-direction: column;
			width: 210mm;
			height: 297mm;
			max-height: 297mm;
			min-height: 297mm;
			padding: 14mm;
			gap: 0.65rem;
			border: 0;
			overflow: hidden;
			box-shadow: none;
			break-inside: avoid;
			page-break-inside: avoid;
			break-after: page;
			page-break-after: always;
			--spec-body: 0.8rem;
			--spec-label: 0.62rem;
		}

		.recipe-page:last-child {
			break-after: auto;
			page-break-after: auto;
		}

		.mast {
			display: block;
			flex: 0 0 auto;
			margin-bottom: 0;
			padding-bottom: 0.7rem;
		}

		/*
		 * Do not use flex-grow on .body. Chrome treats a flex:1 child as needing
		 * a full page, so the mast alone lands on page 1 and the build on page 2.
		 */
		.body {
			display: grid;
			flex: 1 1 auto;
			min-height: 0;
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: auto minmax(0, 1fr);
			gap: 0.65rem 0.9rem;
			align-items: start;
			align-content: start;
			width: 100%;
		}

		.body.has-photo {
			grid-template-columns: minmax(0, 72mm) minmax(0, 1fr);
		}

		.body.has-photo .photo {
			grid-column: 1;
			grid-row: 1;
		}

		.body.has-photo .copy {
			grid-column: 2;
			grid-row: 1;
		}

		.span {
			grid-column: 1 / -1;
			grid-row: 2;
			min-height: 0;
			overflow: hidden;
		}

		.photo {
			max-height: 90mm;
			margin: 0;
			overflow: hidden;
		}

		.photo img {
			max-height: 90mm;
			width: 100%;
			height: auto;
			object-fit: contain;
			object-position: top center;
		}

		.mast h2 {
			font-size: 28pt;
		}

		.price {
			font-size: 1.05rem;
		}

		.copy {
			display: flex;
			flex-direction: column;
			gap: 0.45rem;
			min-height: 0;
		}

		.method-block.span {
			margin: 0;
			padding: 0;
		}

		.method {
			line-height: 1.3;
		}

		.serve {
			margin-top: 0.65rem;
		}

		.spec-list {
			gap: 0.12rem;
		}
	}
</style>
