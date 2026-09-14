<script lang="ts">
	import {
		Button,
		Card,
		Field,
		NativeSelect,
		TextArea,
		TextField,
	} from "../../ui";
	import type { SelectOption } from "../../ui/types";
	import {
		GLASSWARE,
		ICE_OPTIONS,
		UNITS,
		type Ingredient,
		type MenuItem,
		type MenuSection,
	} from "../../lib/types";

	let {
		item = $bindable(null as MenuItem | null),
		sections,
		saveStatus = "",
		saveKind = "" as "" | "ok" | "error",
		photoStatus = "",
		photoKind = "" as "" | "ok" | "error",
		importStatus = "",
		importKind = "" as "" | "ok" | "error",
		importText = $bindable(""),
		onsave,
		ondelete,
		onphoto,
		onimport,
		onimportfile,
	}: {
		item: MenuItem | null;
		sections: MenuSection[];
		saveStatus?: string;
		saveKind?: "" | "ok" | "error";
		photoStatus?: string;
		photoKind?: "" | "ok" | "error";
		importStatus?: string;
		importKind?: "" | "ok" | "error";
		importText?: string;
		onsave: () => void | Promise<void>;
		ondelete: () => void | Promise<void>;
		onphoto: (file: File) => void | Promise<void>;
		onimport: () => void | Promise<void>;
		onimportfile: (file: File) => void | Promise<void>;
	} = $props();

	const sectionOptions: SelectOption[] = $derived(
		sections.map((section) => ({
			value: section._id,
			label: section.parentTitle
				? `${section.parentTitle} / ${section.title}`
				: section.title || "Untitled",
		})),
	);

	const unitOptions: SelectOption[] = [
		{ value: "", label: "" },
		...UNITS.map((u) => ({ value: u, label: u })),
	];

	const glassOptions: SelectOption[] = GLASSWARE.map((g) => ({
		value: g,
		label: g || "—",
	}));

	const iceOptions: SelectOption[] = ICE_OPTIONS.map((g) => ({
		value: g,
		label: g || "—",
	}));

	let ingredients = $state<Ingredient[]>([{}]);

	$effect(() => {
		const next = item?.ingredients?.length ? [...item.ingredients] : [{}];
		ingredients = next.map((ing) => ({ ...ing }));
	});

	function syncIngredients() {
		if (!item) return;
		item = { ...item, ingredients: ingredients.map((ing) => ({ ...ing })) };
	}

	function addIngredient() {
		ingredients = [...ingredients, {}];
		syncIngredients();
	}

	function removeIngredient(index: number) {
		ingredients = ingredients.filter((_, i) => i !== index);
		if (!ingredients.length) ingredients = [{}];
		syncIngredients();
	}

	function patchIngredient(index: number, patch: Partial<Ingredient>) {
		ingredients = ingredients.map((ing, i) =>
			i === index ? { ...ing, ...patch } : ing,
		);
		syncIngredients();
	}

	function patch(field: keyof MenuItem, value: unknown) {
		if (!item) return;
		item = { ...item, [field]: value };
	}

	const photoUrl = $derived(item?.image?.asset?.url);
</script>

{#if !item}
	<p class="empty">Select a drink, or add a new item.</p>
{:else}
	<form
		class="editor"
		onsubmit={(e) => {
			e.preventDefault();
			onsave();
		}}
	>
		<Card title={item.name || "New item"} fill>
			<div class="grid">
					<Field label="Name" for="f-name">
						<TextField
							id="f-name"
							required
							value={item.name || ""}
							oninput={(e) =>
								patch("name", (e.currentTarget as HTMLInputElement).value)}
						/>
					</Field>
					<Field label="Section" for="f-section">
						<NativeSelect
							id="f-section"
							options={sectionOptions}
							value={item.sectionId || item.section?._ref || item.section?._id || ""}
							onchange={(e) =>
								patch("sectionId", (e.currentTarget as HTMLSelectElement).value)}
						/>
					</Field>
					<Field label="Price" for="f-price">
						<TextField
							id="f-price"
							inputmode="decimal"
							placeholder="13"
							value={item.price || ""}
							oninput={(e) =>
								patch("price", (e.currentTarget as HTMLInputElement).value)}
						/>
					</Field>
					<Field label="Type" for="f-notes">
						<TextField
							id="f-notes"
							placeholder="Floral fizz"
							value={item.notes || ""}
							oninput={(e) =>
								patch("notes", (e.currentTarget as HTMLInputElement).value)}
						/>
					</Field>
					<Field label="Glassware" for="f-glass">
						<NativeSelect
							id="f-glass"
							options={glassOptions}
							value={item.glassware || ""}
							onchange={(e) =>
								patch("glassware", (e.currentTarget as HTMLSelectElement).value)}
						/>
					</Field>
					<Field label="Ice" for="f-ice">
						<NativeSelect
							id="f-ice"
							options={iceOptions}
							value={item.ice || ""}
							onchange={(e) =>
								patch("ice", (e.currentTarget as HTMLSelectElement).value)}
						/>
					</Field>
					<Field label="Garnish" for="f-garnish">
						<TextField
							id="f-garnish"
							value={item.garnish || ""}
							oninput={(e) =>
								patch("garnish", (e.currentTarget as HTMLInputElement).value)}
						/>
					</Field>

					<label class="check full">
						<input
							type="checkbox"
							checked={item.signature === true}
							onchange={(e) =>
								patch("signature", (e.currentTarget as HTMLInputElement).checked)}
						/>
						Signature (homepage gallery)
					</label>
					<label class="check full">
						<input
							type="checkbox"
							checked={item.onDigitalMenu !== false}
							onchange={(e) =>
								patch(
									"onDigitalMenu",
									(e.currentTarget as HTMLInputElement).checked,
								)}
						/>
						On digital menu (include when publishing)
					</label>

					<div class="full photo">
						<div class="photo-well">
							{#if photoUrl}
								<img
									src="{photoUrl}?w=400"
									alt={item.image?.alt || item.name || ""}
								/>
							{:else}
								<div class="photo-empty">No photo</div>
							{/if}
						</div>
						<div>
							<Field label="Photo" for="f-photo">
								<input
									id="f-photo"
									type="file"
									accept="image/jpeg,image/png,image/webp,image/gif"
									onchange={(e) => {
										const file = (e.currentTarget as HTMLInputElement).files?.[0];
										if (file) onphoto(file);
										(e.currentTarget as HTMLInputElement).value = "";
									}}
								/>
							</Field>
							{#if photoStatus}
								<p class="status" class:ok={photoKind === "ok"} class:error={photoKind === "error"}>
									{photoStatus}
								</p>
							{/if}
						</div>
					</div>

					<Field label="Guest menu line" for="f-description">
						<TextArea
							id="f-description"
							rows={2}
							value={item.description || ""}
							oninput={(e) =>
								patch(
									"description",
									(e.currentTarget as HTMLTextAreaElement).value,
								)}
						/>
					</Field>
					<label class="check full">
						<input
							type="checkbox"
							checked={item.lockDescription === true}
							onchange={(e) =>
								patch(
									"lockDescription",
									(e.currentTarget as HTMLInputElement).checked,
								)}
						/>
						Lock menu line (do not fill from ingredients)
					</label>

					<div class="full">
						<p class="eyebrow">Ingredients</p>
						<table class="ings">
							<thead>
								<tr>
									<th>Qty</th>
									<th>Unit</th>
									<th>Name</th>
									<th>Note</th>
									<th></th>
								</tr>
							</thead>
							<tbody>
								{#each ingredients as ing, i}
									<tr>
										<td class="qty">
											<TextField
												type="number"
												step="any"
												min="0"
												size="sm"
												value={ing.quantity == null ? "" : String(ing.quantity)}
												oninput={(e) =>
													patchIngredient(i, {
														quantity: (e.currentTarget as HTMLInputElement).value,
													})}
											/>
										</td>
										<td class="unit">
											<NativeSelect
												size="sm"
												options={unitOptions}
												value={ing.unit || ""}
												onchange={(e) =>
													patchIngredient(i, {
														unit: (e.currentTarget as HTMLSelectElement).value,
													})}
											/>
										</td>
										<td>
											<TextField
												size="sm"
												placeholder="Ingredient"
												value={ing.name || ""}
												oninput={(e) =>
													patchIngredient(i, {
														name: (e.currentTarget as HTMLInputElement).value,
													})}
											/>
										</td>
										<td>
											<TextField
												size="sm"
												value={ing.note || ""}
												oninput={(e) =>
													patchIngredient(i, {
														note: (e.currentTarget as HTMLInputElement).value,
													})}
											/>
										</td>
										<td>
											<Button
												variant="outline"
												size="xs"
												type="button"
												onclick={() => removeIngredient(i)}>Remove</Button
											>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
						<div class="row-gap">
							<Button variant="outline" size="sm" type="button" onclick={addIngredient}
								>Add ingredient</Button
							>
						</div>
					</div>

					<Field label="Method" for="f-method">
						<TextArea
							id="f-method"
							rows={4}
							placeholder="Shake hard. Strain. Top with soda."
							value={item.method || ""}
							oninput={(e) =>
								patch("method", (e.currentTarget as HTMLTextAreaElement).value)}
						/>
					</Field>
					<Field label="ABV" for="f-abv">
						<TextField
							id="f-abv"
							value={item.abv || ""}
							oninput={(e) =>
								patch("abv", (e.currentTarget as HTMLInputElement).value)}
						/>
					</Field>
					<Field label="Volume" for="f-volume">
						<TextField
							id="f-volume"
							value={item.volume || ""}
							oninput={(e) =>
								patch("volume", (e.currentTarget as HTMLInputElement).value)}
						/>
					</Field>
					<Field label="Producer" for="f-producer">
						<TextField
							id="f-producer"
							value={item.producer || ""}
							oninput={(e) =>
								patch("producer", (e.currentTarget as HTMLInputElement).value)}
						/>
					</Field>
				</div>

				<div class="actions">
					<Button variant="primary" type="submit">Save</Button>
					<Button variant="destructive" type="button" onclick={ondelete}
						>Remove item</Button
					>
				</div>
				{#if saveStatus}
					<p class="status" class:ok={saveKind === "ok"} class:error={saveKind === "error"}>
						{saveStatus}
					</p>
				{/if}

				<div class="import">
					<p class="eyebrow">Import recipes</p>
					<p class="hint">
						CSV columns: Cocktail, Qty, Unit, Ingredient, Note. Matches existing
						names. Paste from the bar ingredients sheet, or upload CSV.
					</p>
					<TextArea
						rows={4}
						placeholder="Cocktail,Qty,Unit,Ingredient,Note"
						bind:value={importText}
					/>
					<div class="actions">
						<input
							type="file"
							accept=".csv,.tsv,.txt,.pdf,text/csv"
							onchange={(e) => {
								const file = (e.currentTarget as HTMLInputElement).files?.[0];
								if (file) onimportfile(file);
								(e.currentTarget as HTMLInputElement).value = "";
							}}
						/>
						<Button variant="outline" type="button" onclick={onimport}
							>Import into Baserow</Button
						>
					</div>
					{#if importStatus}
						<p
							class="status"
							class:ok={importKind === "ok"}
							class:error={importKind === "error"}
						>
							{importStatus}
						</p>
					{/if}
				</div>
			</Card>
	</form>
{/if}

<style>
	.empty {
		color: var(--muted-foreground);
		padding: 2rem 0;
		font-size: 0.9375rem;
	}

	.editor {
		display: flex;
		flex-direction: column;
		min-height: 0;
		height: 100%;
	}

	.grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--gap-sm) var(--gap);
	}

	.full {
		grid-column: 1 / -1;
	}

	.check {
		display: flex;
		gap: 0.55rem;
		align-items: center;
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--foreground);
	}

	.check input {
		accent-color: var(--primary);
	}

	.photo {
		display: flex;
		gap: var(--gap);
		align-items: flex-start;
	}

	.photo-well img,
	.photo-empty {
		width: 7.5rem;
		height: 9.5rem;
		border-radius: var(--radius-md);
		border: 1px solid var(--border);
		background: var(--sunken);
	}

	.photo-well img {
		object-fit: cover;
	}

	.photo-empty {
		display: flex;
		align-items: center;
		justify-content: center;
		border-style: dashed;
		color: var(--muted-foreground);
		font-size: 0.78rem;
		text-align: center;
		padding: 0.4rem;
	}

	.ings {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.8125rem;
	}

	.ings th {
		text-align: left;
		font-size: 0.6875rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--muted-foreground);
		padding: 0.35rem 0.25rem;
		border-bottom: 1px solid var(--border);
	}

	.ings td {
		padding: 0.25rem;
		vertical-align: middle;
	}

	.ings .qty {
		width: 4.4rem;
	}

	.ings .unit {
		width: 6.4rem;
	}

	.row-gap {
		margin-top: 0.45rem;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-xs);
		align-items: center;
		margin-top: var(--gap);
	}

	.status {
		min-height: 1.2em;
		font-size: 0.8125rem;
		color: var(--muted-foreground);
		margin: 0.6rem 0 0;
	}

	.status.error {
		color: var(--destructive);
	}

	.status.ok {
		color: var(--up);
	}

	.import {
		margin-top: var(--gap-lg);
		padding-top: var(--gap);
		border-top: 1px solid var(--border);
	}

	.hint {
		font-size: 0.8125rem;
		color: var(--muted-foreground);
		margin: 0.35rem 0 0.65rem;
	}

	@media (max-width: 880px) {
		.grid {
			grid-template-columns: 1fr;
		}
	}
</style>
