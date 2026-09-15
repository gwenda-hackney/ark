<script lang="ts">
	/**
	 * Editable ingredients as a compact datagrid: header strip, row rules,
	 * flush controls, trading-like density (≈38px rows).
	 */
	import { Button, NativeSelect, TextField } from "../../ui";
	import type { SelectOption } from "../../ui/types";
	import { UNITS, type Ingredient } from "../../lib/types";

	let {
		ingredients = [],
		onChange,
	}: {
		ingredients?: Ingredient[];
		onChange: (next: Ingredient[]) => void;
	} = $props();

	const unitOptions: SelectOption[] = [
		{ value: "", label: "" },
		...UNITS.map((u) => ({ value: u, label: u })),
	];

	function patch(index: number, next: Partial<Ingredient>) {
		onChange(
			ingredients.map((ing, i) => (i === index ? { ...ing, ...next } : ing)),
		);
	}

	function addRow() {
		onChange([...ingredients, {}]);
	}

	function removeRow(index: number) {
		const next = ingredients.filter((_, i) => i !== index);
		onChange(next.length ? next : [{}]);
	}
</script>

<div class="grid-wrap">
	<div class="toolbar">
		<p class="meta">{ingredients.length} line{ingredients.length === 1 ? "" : "s"}</p>
		<Button variant="outline" size="xs" type="button" onclick={addRow}>Add line</Button>
	</div>

	<div class="grid" role="grid" aria-label="Ingredients">
		<div class="row head" role="row">
			<div class="cell qty" role="columnheader">Qty</div>
			<div class="cell unit" role="columnheader">Unit</div>
			<div class="cell name" role="columnheader">Ingredient</div>
			<div class="cell note" role="columnheader">Note</div>
			<div class="cell act" role="columnheader"><span class="sr-only">Actions</span></div>
		</div>

		{#each ingredients as ing, i}
			<div class="row" role="row">
				<div class="cell qty" role="gridcell">
					<TextField
						type="number"
						step="any"
						min="0"
						size="sm"
						mono
						aria-label="Quantity"
						value={ing.quantity == null ? "" : String(ing.quantity)}
						oninput={(e) =>
							patch(i, {
								quantity: (e.currentTarget as HTMLInputElement).value,
							})}
					/>
				</div>
				<div class="cell unit" role="gridcell">
					<NativeSelect
						size="sm"
						aria-label="Unit"
						options={unitOptions}
						value={ing.unit || ""}
						onchange={(e) =>
							patch(i, {
								unit: (e.currentTarget as HTMLSelectElement).value,
							})}
					/>
				</div>
				<div class="cell name" role="gridcell">
					<TextField
						size="sm"
						placeholder="Ingredient"
						aria-label="Ingredient name"
						value={ing.name || ""}
						oninput={(e) =>
							patch(i, {
								name: (e.currentTarget as HTMLInputElement).value,
							})}
					/>
				</div>
				<div class="cell note" role="gridcell">
					<TextField
						size="sm"
						placeholder="Optional"
						aria-label="Note"
						value={ing.note || ""}
						oninput={(e) =>
							patch(i, {
								note: (e.currentTarget as HTMLInputElement).value,
							})}
					/>
				</div>
				<div class="cell act" role="gridcell">
					<Button
						variant="ghost"
						size="xs"
						type="button"
						aria-label="Remove line"
						onclick={() => removeRow(i)}>×</Button
					>
				</div>
			</div>
		{/each}
	</div>
</div>

<style>
	.grid-wrap {
		display: grid;
		gap: 0.55rem;
	}

	.toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--gap);
	}

	.meta {
		margin: 0;
		font-size: 0.75rem;
		color: var(--muted-foreground);
	}

	.grid {
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		overflow: hidden;
		background: var(--card);
	}

	.row {
		display: grid;
		grid-template-columns: 4.75rem 6.75rem minmax(8rem, 1.4fr) minmax(6rem, 1fr) 2.5rem;
		align-items: stretch;
		min-height: 2.375rem;
		border-bottom: 1px solid var(--border);
	}

	.row:last-child {
		border-bottom: 0;
	}

	.row.head {
		min-height: 2.25rem;
		background: var(--sunken);
	}

	.row:not(.head):hover {
		background: var(--accent);
	}

	.cell {
		display: flex;
		align-items: center;
		min-width: 0;
		padding: 0.2rem 0.3rem;
		border-right: 1px solid var(--border);
	}

	.cell:last-child {
		border-right: 0;
	}

	.row.head .cell {
		padding: 0 0.55rem;
		font-size: 0.625rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--muted-foreground);
	}

	.act {
		justify-content: center;
		padding: 0;
	}

	/* Flush controls into the grid cells */
	.cell :global(.input),
	.cell :global(select.input) {
		border-color: transparent;
		background: transparent;
		border-radius: var(--radius-sm);
		box-shadow: none;
	}

	.cell :global(.input:hover),
	.cell :global(select.input:hover) {
		border-color: var(--border);
		background: var(--sunken);
	}

	.cell :global(.input:focus),
	.cell :global(select.input:focus) {
		border-color: var(--ring);
		background: var(--sunken);
		box-shadow: 0 0 0 2px var(--ring-wash);
	}

	.cell :global(select.input) {
		background-position: right 0.4rem center;
		padding-right: 1.5rem;
	}

	@media (max-width: 880px) {
		.row,
		.row.head {
			grid-template-columns: 1fr 1fr;
		}

		.row.head {
			display: none;
		}

		.cell {
			border-right: 0;
			border-bottom: 1px solid var(--border);
		}

		.row {
			border-bottom: 1px solid var(--border-strong);
			padding: 0.25rem 0;
		}
	}
</style>
