<script lang="ts">
	import { untrack } from "svelte";
	import {
		Button,
		Field,
		NativeSelect,
		Segmented,
		TextArea,
		TextField,
	} from "../../ui";
	import type { SegmentedItem, SelectOption } from "../../ui/types";
	import {
		GLASSWARE,
		ICE_OPTIONS,
		type Ingredient,
		type MenuItem,
		type MenuSection,
	} from "../../lib/types";
	import IngredientsGrid from "./IngredientsGrid.svelte";

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

	let tab = $state("details");
	let ingredients = $state<Ingredient[]>([{}]);
	let syncedKey = $state<string | null>(null);

	const tabs: SegmentedItem[] = [
		{ id: "details", label: "Details" },
		{ id: "recipe", label: "Recipe" },
		{ id: "guest", label: "Guest" },
		{ id: "import", label: "Import" },
	];

	const sectionOptions: SelectOption[] = $derived(
		sections.map((section) => ({
			value: section._id,
			label: section.parentTitle
				? `${section.parentTitle} / ${section.title}`
				: section.title || "Untitled",
		})),
	);

	const glassOptions: SelectOption[] = GLASSWARE.map((g) => ({
		value: g,
		label: g || "—",
	}));

	const iceOptions: SelectOption[] = ICE_OPTIONS.map((g) => ({
		value: g,
		label: g || "—",
	}));

	const itemKey = $derived(
		item?._id || (item ? `draft:${item.name || ""}:${item.sectionId || ""}` : ""),
	);

	$effect(() => {
		const key = itemKey;
		if (!item) {
			syncedKey = null;
			ingredients = [{}];
			return;
		}
		if (key === syncedKey) return;
		syncedKey = key;
		const rows = untrack(() => item?.ingredients);
		ingredients = (rows?.length ? rows : [{}]).map((ing) => ({ ...ing }));
		tab = "details";
	});

	function onIngredientsChange(next: Ingredient[]) {
		ingredients = next;
		if (!item) return;
		item = { ...item, ingredients: next.map((ing) => ({ ...ing })) };
	}

	function patch(field: keyof MenuItem, value: unknown) {
		if (!item) return;
		item = { ...item, [field]: value };
	}

	const photoUrl = $derived(item?.image?.asset?.url);
	const priceLabel = $derived(item?.price ? `£${item.price}` : "");
</script>

{#if !item}
	<div class="empty">
		<p class="eyebrow">Editor</p>
		<p>Select a drink from the list, or add a new item.</p>
	</div>
{:else}
	<form
		class="editor"
		onsubmit={(e) => {
			e.preventDefault();
			onsave();
		}}
	>
		<div class="split">
			<aside class="hero">
				{#if photoUrl}
					<img
						class="hero-img"
						src="{photoUrl}?w=1200"
						alt={item.image?.alt || item.name || ""}
					/>
				{:else}
					<div class="hero-empty">
						<p class="eyebrow">Photo</p>
						<p>Add a drink portrait. It leads the page.</p>
					</div>
				{/if}
				<div class="hero-bar">
					<label class="upload">
						<span>{photoUrl ? "Replace photo" : "Upload photo"}</span>
						<input
							type="file"
							accept="image/jpeg,image/png,image/webp,image/gif"
							onchange={(e) => {
								const file = (e.currentTarget as HTMLInputElement).files?.[0];
								if (file) onphoto(file);
								(e.currentTarget as HTMLInputElement).value = "";
							}}
						/>
					</label>
					{#if photoStatus}
						<p
							class="status"
							class:ok={photoKind === "ok"}
							class:error={photoKind === "error"}
						>
							{photoStatus}
						</p>
					{/if}
				</div>
			</aside>

			<div class="panel">
				<header class="panel-head">
					<div class="titles">
						<p class="eyebrow">Recipe</p>
						<h2>{item.name || "New item"}</h2>
						{#if item.notes || priceLabel}
							<p class="sub">
								{[item.notes, priceLabel].filter(Boolean).join(" · ")}
							</p>
						{/if}
					</div>
					<div class="head-actions">
						<Button variant="primary" size="sm" type="submit">Save</Button>
						<Button variant="ghost" size="sm" type="button" onclick={ondelete}
							>Remove</Button
						>
					</div>
				</header>

				<div class="tabs">
					<Segmented
						bind:value={tab}
						items={tabs}
						tone="soft"
						size="sm"
						ariaLabel="Drink sections"
					/>
				</div>

				<div class="tab-body">
					{#if tab === "details"}
						<section class="block">
							<div class="grid">
								<Field label="Name" for="f-name">
									<TextField
										id="f-name"
										size="sm"
										required
										value={item.name || ""}
										oninput={(e) =>
											patch(
												"name",
												(e.currentTarget as HTMLInputElement).value,
											)}
									/>
								</Field>
								<Field label="Section" for="f-section">
									<NativeSelect
										id="f-section"
										size="sm"
										options={sectionOptions}
										value={item.sectionId ||
											item.section?._ref ||
											item.section?._id ||
											""}
										onchange={(e) =>
											patch(
												"sectionId",
												(e.currentTarget as HTMLSelectElement).value,
											)}
									/>
								</Field>
								<Field label="Price" for="f-price">
									<TextField
										id="f-price"
										size="sm"
										inputmode="decimal"
										placeholder="13"
										value={item.price || ""}
										oninput={(e) =>
											patch(
												"price",
												(e.currentTarget as HTMLInputElement).value,
											)}
									/>
								</Field>
								<Field label="Type" for="f-notes">
									<TextField
										id="f-notes"
										size="sm"
										placeholder="Floral fizz"
										value={item.notes || ""}
										oninput={(e) =>
											patch(
												"notes",
												(e.currentTarget as HTMLInputElement).value,
											)}
									/>
								</Field>
								<Field label="Glassware" for="f-glass">
									<NativeSelect
										id="f-glass"
										size="sm"
										options={glassOptions}
										value={item.glassware || ""}
										onchange={(e) =>
											patch(
												"glassware",
												(e.currentTarget as HTMLSelectElement).value,
											)}
									/>
								</Field>
								<Field label="Ice" for="f-ice">
									<NativeSelect
										id="f-ice"
										size="sm"
										options={iceOptions}
										value={item.ice || ""}
										onchange={(e) =>
											patch(
												"ice",
												(e.currentTarget as HTMLSelectElement).value,
											)}
									/>
								</Field>
								<div class="full">
									<Field label="Garnish" for="f-garnish">
										<TextField
											id="f-garnish"
											size="sm"
											value={item.garnish || ""}
											oninput={(e) =>
												patch(
													"garnish",
													(e.currentTarget as HTMLInputElement).value,
												)}
										/>
									</Field>
								</div>
							</div>
							<div class="flag-row">
								<label class="check">
									<input
										type="checkbox"
										checked={item.signature === true}
										onchange={(e) =>
											patch(
												"signature",
												(e.currentTarget as HTMLInputElement).checked,
											)}
									/>
									<span>Signature (homepage gallery)</span>
								</label>
								<label class="check">
									<input
										type="checkbox"
										checked={item.onDigitalMenu !== false}
										onchange={(e) =>
											patch(
												"onDigitalMenu",
												(e.currentTarget as HTMLInputElement).checked,
											)}
									/>
									<span>On digital menu</span>
								</label>
							</div>
						</section>
					{:else if tab === "recipe"}
						<section class="block">
							<IngredientsGrid
								ingredients={ingredients}
								onChange={onIngredientsChange}
							/>
						</section>
						<section class="block">
							<Field label="Method" for="f-method">
								<TextArea
									id="f-method"
									rows={5}
									placeholder="Shake hard. Strain. Top with soda."
									value={item.method || ""}
									oninput={(e) =>
										patch(
											"method",
											(e.currentTarget as HTMLTextAreaElement).value,
										)}
								/>
							</Field>
							<div class="grid three">
								<Field label="ABV" for="f-abv">
									<TextField
										id="f-abv"
										size="sm"
										value={item.abv || ""}
										oninput={(e) =>
											patch(
												"abv",
												(e.currentTarget as HTMLInputElement).value,
											)}
									/>
								</Field>
								<Field label="Volume" for="f-volume">
									<TextField
										id="f-volume"
										size="sm"
										value={item.volume || ""}
										oninput={(e) =>
											patch(
												"volume",
												(e.currentTarget as HTMLInputElement).value,
											)}
									/>
								</Field>
								<Field label="Producer" for="f-producer">
									<TextField
										id="f-producer"
										size="sm"
										value={item.producer || ""}
										oninput={(e) =>
											patch(
												"producer",
												(e.currentTarget as HTMLInputElement).value,
											)}
									/>
								</Field>
							</div>
						</section>
					{:else if tab === "guest"}
						<section class="block">
							<Field
								label="Guest menu line"
								for="f-description"
								hint="Short line guests see on the digital menu."
							>
								<TextArea
									id="f-description"
									rows={4}
									value={item.description || ""}
									oninput={(e) =>
										patch(
											"description",
											(e.currentTarget as HTMLTextAreaElement).value,
										)}
								/>
							</Field>
							<label class="check">
								<input
									type="checkbox"
									checked={item.lockDescription === true}
									onchange={(e) =>
										patch(
											"lockDescription",
											(e.currentTarget as HTMLInputElement).checked,
										)}
								/>
								<span>Lock menu line (do not fill from ingredients)</span>
							</label>
						</section>
					{:else}
						<section class="block">
							<p class="hint">
								CSV columns: Cocktail, Qty, Unit, Ingredient, Note. Matches
								existing drink names in Baserow.
							</p>
							<TextArea
								rows={8}
								placeholder="Cocktail,Qty,Unit,Ingredient,Note"
								bind:value={importText}
							/>
							<div class="actions">
								<TextField
									type="file"
									size="sm"
									accept=".csv,.tsv,.txt,.pdf,text/csv"
									onchange={(e) => {
										const file = (e.currentTarget as HTMLInputElement)
											.files?.[0];
										if (file) onimportfile(file);
										(e.currentTarget as HTMLInputElement).value = "";
									}}
								/>
								<Button
									variant="outline"
									size="sm"
									type="button"
									onclick={onimport}>Import into Baserow</Button
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
						</section>
					{/if}
				</div>

				{#if saveStatus}
					<p
						class="status foot"
						class:ok={saveKind === "ok"}
						class:error={saveKind === "error"}
					>
						{saveStatus}
					</p>
				{/if}
			</div>
		</div>
	</form>
{/if}

<style>
	.empty {
		display: grid;
		gap: 0.35rem;
		place-content: center;
		min-height: 12rem;
		text-align: center;
		color: var(--muted-foreground);
		font-size: 0.875rem;
	}

	.editor {
		display: flex;
		flex-direction: column;
		min-height: 0;
		height: 100%;
	}

	.split {
		display: grid;
		grid-template-columns: minmax(18rem, 40%) minmax(0, 1fr);
		gap: var(--gap);
		min-height: 0;
		height: 100%;
	}

	.hero {
		position: relative;
		display: flex;
		flex-direction: column;
		min-height: 0;
		height: 100%;
		border: 1px solid var(--border);
		border-radius: var(--radius-xl);
		background: var(--sunken);
		overflow: hidden;
		box-shadow: var(--shadow-sm);
	}

	.hero-img {
		flex: 1;
		min-height: 0;
		width: 100%;
		object-fit: cover;
		object-position: center;
		display: block;
		background: #0a0a0a;
	}

	.hero-empty {
		flex: 1;
		display: grid;
		place-content: center;
		gap: 0.4rem;
		padding: var(--gap-lg);
		text-align: center;
		color: var(--muted-foreground);
		background:
			radial-gradient(
				ellipse at 50% 30%,
				var(--primary-wash-strong),
				transparent 55%
			),
			var(--sunken);
	}

	.hero-empty p:last-child {
		max-width: 16rem;
		margin: 0 auto;
		font-size: 0.875rem;
		line-height: 1.45;
	}

	.hero-bar {
		display: flex;
		flex-wrap: wrap;
		gap: 0.55rem;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 0.85rem;
		border-top: 1px solid var(--border);
		background: color-mix(in srgb, var(--card) 88%, transparent);
		backdrop-filter: blur(8px);
	}

	.upload {
		position: relative;
		display: inline-flex;
		align-items: center;
		height: var(--control-h-sm);
		padding: 0 0.9rem;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-pill);
		background: transparent;
		color: var(--foreground);
		font-size: 0.8125rem;
		font-weight: 500;
		cursor: pointer;
		overflow: hidden;
	}

	.upload:hover {
		background: var(--accent);
	}

	.upload input {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
	}

	.panel {
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
		height: 100%;
		border: 1px solid var(--border);
		border-radius: var(--radius-xl);
		background: var(--card);
		box-shadow: var(--shadow-sm);
		overflow: hidden;
	}

	.panel-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--gap);
		padding: var(--card-pad) var(--card-pad) 0.85rem;
		border-bottom: 1px solid var(--border);
	}

	.titles {
		display: grid;
		gap: 0.15rem;
		min-width: 0;
	}

	.titles h2 {
		font-family: var(--font-display);
		font-size: clamp(1.45rem, 2.2vw, 1.85rem);
		font-weight: 600;
		letter-spacing: -0.02em;
		line-height: 1.15;
	}

	.sub {
		margin: 0;
		font-size: 0.8125rem;
		color: var(--muted-foreground);
	}

	.head-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		justify-content: flex-end;
	}

	.tabs {
		padding: 0.75rem var(--card-pad) 0;
	}

	.tab-body {
		flex: 1;
		min-height: 0;
		overflow: auto;
		padding: 0.9rem var(--card-pad) var(--card-pad);
	}

	.block {
		display: grid;
		gap: 0.85rem;
	}

	.block + .block {
		margin-top: 1.15rem;
		padding-top: 1.15rem;
		border-top: 1px solid var(--border);
	}

	.grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.7rem 0.85rem;
		align-items: start;
	}

	.grid.three {
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}

	.full {
		grid-column: 1 / -1;
	}

	.flag-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.85rem 1.25rem;
		padding-top: 0.15rem;
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
		width: 1rem;
		height: 1rem;
		margin: 0;
		accent-color: var(--primary);
		flex-shrink: 0;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-xs);
		align-items: center;
	}

	.hint {
		margin: 0;
		font-size: 0.8125rem;
		color: var(--muted-foreground);
		line-height: 1.45;
	}

	.status {
		min-height: 1.2em;
		font-size: 0.8125rem;
		color: var(--muted-foreground);
		margin: 0;
	}

	.status.foot {
		padding: 0.55rem var(--card-pad) 0.85rem;
		border-top: 1px solid var(--border);
	}

	.status.error {
		color: var(--destructive);
	}

	.status.ok {
		color: var(--up);
	}

	@media (max-width: 1100px) {
		.split {
			grid-template-columns: minmax(14rem, 36%) minmax(0, 1fr);
		}

		.grid.three {
			grid-template-columns: 1fr 1fr;
		}
	}

	@media (max-width: 880px) {
		.split {
			grid-template-columns: 1fr;
			grid-template-rows: minmax(16rem, 40vh) minmax(0, 1fr);
		}

		.hero {
			min-height: 16rem;
		}

		.grid,
		.grid.three {
			grid-template-columns: 1fr;
		}

		.panel-head {
			flex-direction: column;
		}
	}
</style>
