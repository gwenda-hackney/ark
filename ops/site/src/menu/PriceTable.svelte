<script lang="ts">
	/**
	 * The Pricing tab's price table: one row per size the drink sells in,
	 * each with its name, size, price, till SKU and what it costs to pour
	 * against the house target. The first row is the main price.
	 */
	import { Button, MoneyField, TextField } from "../ui";
	import { Icon } from "../app/shell";
	import { formatGbp } from "../app/money";
	import { formatPourPercent, marginTone, type PriceRowReading, type RecipePriceAnalysis } from "./cost";
	import { priceFieldId } from "./item-validate";
	import type { PriceRow } from "./prices.js";

	let {
		rows,
		price,
		error = () => "",
		onchange,
	}: {
		rows: PriceRow[];
		/** Recipe cost for the Pour column; null when nothing can be costed yet. */
		price: RecipePriceAnalysis | null;
		/** The message for a field id (f-price-0, f-price-name-1). */
		error?: (id: string) => string;
		/** `field` names the edit so typing in one cell is one undo step. */
		onchange: (next: PriceRow[], field: string) => void;
	} = $props();

	const readings = $derived(price?.priceRows ?? []);

	function reading(index: number): PriceRowReading | null {
		return readings[index] ?? null;
	}

	function update(index: number, key: keyof PriceRow, value: string) {
		const current = rows[index];
		if (!current || (current[key] || "") === value) return;
		const next = rows.map((row, i) => (i === index ? { ...row, [key]: value } : row));
		onchange(next, `prices:${key}:${index}`);
	}

	function move(index: number, by: -1 | 1) {
		const to = index + by;
		if (to < 0 || to >= rows.length) return;
		const next = [...rows];
		[next[index], next[to]] = [next[to], next[index]];
		onchange(next, "prices:order");
	}

	function remove(index: number) {
		if (index === 0) return;
		onchange(
			rows.filter((_, i) => i !== index),
			"prices:remove",
		);
	}

	function costText(row: PriceRowReading | null): string {
		const cost = row?.serve?.drinkCost;
		if (cost == null) return "";
		const amount = formatGbp(cost);
		return price?.hasEstimates ? `~${amount}` : amount;
	}

	function pourText(row: PriceRowReading | null): string {
		const serve = row?.serve;
		if (!serve || serve.drinkCost == null) return "n/a";
		if (serve.pourCost != null) return formatPourPercent(serve.pourCost);
		return "No price";
	}

	function pourTone(row: PriceRowReading | null): string {
		const serve = row?.serve;
		if (!serve || serve.pourCost == null) return "muted";
		return marginTone(serve.margin, serve.pourCost, price?.targetPourCost);
	}

	function suggested(row: PriceRowReading | null): string {
		const value = row?.serve?.suggestedPrice;
		return value == null ? "" : value.toFixed(2);
	}

	function label(row: PriceRow, index: number): string {
		return row.name?.trim() || (index === 0 ? "main price" : `price ${index + 1}`);
	}
</script>

<div class="wrap">
	<table class="price-table">
		<thead>
			<tr>
				<th scope="col" class="c-name">Name</th>
				<th scope="col" class="c-size">Size</th>
				<th scope="col" class="c-price">Price</th>
				<th scope="col" class="c-sku">Till SKU</th>
				<th scope="col" class="c-pour">Pour</th>
				<th scope="col" class="c-actions"><span class="sr-only">Order and remove</span></th>
			</tr>
		</thead>
		<tbody>
			{#each rows as row, index}
				{@const read = reading(index)}
				{@const nameId = priceFieldId("name", index)}
				{@const priceId = priceFieldId("price", index)}
				{@const nameError = error(nameId)}
				{@const priceError = error(priceId)}
				{@const tone = pourTone(read)}
				<tr>
					<td class="c-name">
						<span class="cell-label" aria-hidden="true">Name</span>
						<TextField
							id={nameId}
							size="sm"
							autocomplete="off"
							value={row.name || ""}
							placeholder={index === 0 ? "Single" : "Double"}
							aria-label={`Name of ${label(row, index)}`}
							invalid={Boolean(nameError)}
							aria-describedby={nameError ? `${nameId}-error` : undefined}
							oninput={(e) => update(index, "name", (e.currentTarget as HTMLInputElement).value)}
						/>
						{#if nameError}<p class="cell-error" id={`${nameId}-error`}>{nameError}</p>{/if}
					</td>
					<td class="c-size">
						<span class="cell-label" aria-hidden="true">Size</span>
						<TextField
							id={priceFieldId("size", index)}
							size="sm"
							autocomplete="off"
							value={row.size || ""}
							placeholder="e.g. 25 ml"
							aria-label={`Size of ${label(row, index)}`}
							oninput={(e) => update(index, "size", (e.currentTarget as HTMLInputElement).value)}
						/>
					</td>
					<td class="c-price">
						<span class="cell-label" aria-hidden="true">Price</span>
						<MoneyField
							id={priceId}
							size="sm"
							value={row.price || ""}
							placeholder={suggested(read) || "0.00"}
							title={suggested(read) ? `£${suggested(read)} meets the pour target` : undefined}
							aria-label={`Price of ${label(row, index)}`}
							invalid={Boolean(priceError)}
							aria-describedby={priceError ? `${priceId}-error` : undefined}
							oninput={(e) => update(index, "price", (e.currentTarget as HTMLInputElement).value)}
							oncommit={(next) => update(index, "price", next)}
						/>
						{#if priceError}<p class="cell-error" id={`${priceId}-error`}>{priceError}</p>{/if}
					</td>
					<td class="c-sku">
						<span class="cell-label" aria-hidden="true">Till SKU</span>
						<TextField
							id={priceFieldId("sku", index)}
							size="sm"
							mono
							autocomplete="off"
							spellcheck={false}
							value={row.sku || ""}
							aria-label={`Till SKU for ${label(row, index)}`}
							oninput={(e) => update(index, "sku", (e.currentTarget as HTMLInputElement).value)}
						/>
					</td>
					<td class="c-pour">
						<span class="cell-label" aria-hidden="true">Pour</span>
						<span class="pour tnum">
							<span
								class="pct"
								class:up={tone === "up"}
								class:down={tone === "down"}
								class:loss={tone === "loss"}
								class:muted={tone === "muted"}
								title={read?.serve
									? "Pour cost from what it costs to make and its price"
									: "Give it a size in ml to cost it"}
							>
								{pourText(read)}
							</span>
							{#if costText(read)}
								<span class="cost">{costText(read)}</span>
							{/if}
						</span>
					</td>
					<td class="c-actions">
						<div class="row-actions">
							<Button
								variant="ghost"
								size="xs"
								type="button"
								aria-label={`Move ${label(row, index)} up`}
								disabled={index === 0}
								reason="Already first"
								onclick={() => move(index, -1)}
							>
								{#snippet icon()}<Icon name="chevron-up" size={14} />{/snippet}
							</Button>
							<Button
								variant="ghost"
								size="xs"
								type="button"
								aria-label={`Move ${label(row, index)} down`}
								disabled={index === rows.length - 1}
								reason="Already last"
								onclick={() => move(index, 1)}
							>
								{#snippet icon()}<Icon name="chevron-down" size={14} />{/snippet}
							</Button>
							<Button
								variant="ghost"
								size="xs"
								type="button"
								aria-label={`Remove ${label(row, index)}`}
								disabled={index === 0}
								reason="A drink needs one price"
								onclick={() => remove(index)}
							>
								{#snippet icon()}<Icon name="trash" size={14} />{/snippet}
							</Button>
						</div>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	/* On the card's own surface; rows carry their own hairlines (as MenuPlacementsTable). */
	.wrap {
		container-type: inline-size;
		border-top: 1px solid var(--border);
		min-width: 0;
	}

	.price-table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--text-sm);
	}

	.price-table th,
	.price-table td {
		padding: var(--space-2) var(--space-3);
		text-align: left;
		border-bottom: 1px solid var(--border);
		vertical-align: top;
	}

	.price-table th {
		font-size: var(--text-2xs);
		font-weight: 600;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--muted-foreground);
		background: color-mix(in srgb, var(--card) 70%, transparent);
		vertical-align: middle;
	}

	.price-table tbody tr:last-child td {
		border-bottom: 0;
	}

	.c-name {
		width: 24%;
	}

	.c-size {
		width: 16%;
	}

	.c-price {
		width: 9.5rem;
	}

	.c-sku {
		width: 16%;
	}

	.c-pour {
		width: 9rem;
	}

	th.c-pour,
	td.c-pour {
		text-align: right;
	}

	.c-actions {
		width: 1%;
		padding-left: var(--space-1);
		padding-right: var(--space-1);
		white-space: nowrap;
	}

	.row-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.125rem;
		min-height: var(--control-h-sm, 2rem);
		align-items: center;
	}

	.pour {
		display: inline-flex;
		align-items: baseline;
		justify-content: flex-end;
		gap: var(--space-2);
		min-height: var(--control-h-sm, 2rem);
		line-height: var(--control-h-sm, 2rem);
		white-space: nowrap;
	}

	.pct {
		font-weight: 600;
		color: var(--foreground);
	}

	.pct.up {
		color: var(--up);
	}

	.pct.down,
	.pct.loss {
		color: var(--down);
	}

	.pct.muted {
		color: var(--muted-foreground);
		font-weight: 500;
	}

	.cost {
		font-size: var(--text-xs);
		color: var(--muted-foreground);
	}

	.cell-error {
		display: flex;
		margin: var(--space-1) 0 0;
		font-size: var(--text-xs);
		line-height: 1.35;
		color: var(--destructive);
	}

	/* Column headers label the cells on a wide card; each cell says its own on a narrow one. */
	.cell-label {
		display: none;
	}

	@container (max-width: 640px) {
		.price-table thead {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip: rect(0, 0, 0, 0);
		}

		.price-table,
		.price-table tbody {
			display: block;
		}

		.price-table tr {
			display: grid;
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
			gap: var(--space-3);
			padding: var(--space-3) 0;
			border-bottom: 1px solid var(--border);
		}

		.price-table tbody tr:last-child {
			border-bottom: 0;
		}

		.price-table td {
			display: grid;
			gap: var(--space-1);
			align-content: start;
			width: auto;
			padding: 0;
			border: 0;
			text-align: left;
		}

		td.c-name {
			grid-column: 1 / -1;
		}

		td.c-pour {
			text-align: left;
		}

		.pour {
			justify-content: flex-start;
		}

		td.c-actions {
			grid-column: 1 / -1;
		}

		.cell-label {
			display: block;
			font-size: var(--text-sm);
			font-weight: 500;
			color: var(--muted-foreground);
		}

		.row-actions {
			justify-content: flex-end;
		}
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
</style>
