<script lang="ts">
	import { onDestroy, onMount, untrack } from "svelte";
	import {
		Button,
		BusyOverlay,
		ConfirmDialog,
		EditorActionBar,
		EditorBackBar,
		Field,
		FormErrors,
		FormSection,
		MoneyField,
		NativeSelect,
		NumberField,
		SidePanel,
		TextArea,
		TextField,
	} from "../ui";
	import { parseNumber } from "../ui/number-input";
	import type { SelectOption } from "../ui/types";
	import { formatGbp } from "../app/money";
	import { INVENTORY_KINDS, skuFromProductUrl, type CatalogSupplier, type InventoryItem, type InventoryKind, type InventorySupplier } from "./types";
	import { UNITS, type MenuSection } from "../menu/types";
	import { kindCostEstimate } from "../menu/cost";
	import { Icon } from "../app/shell";
	import { navigate } from "../app/nav";
	import { getMenu, getSuppliers } from "../app/api";
	import { recipesUsingInventory } from "./inventory-usage";
	import {
		beginLeave,
		clearUnsavedGuard,
		setUnsavedGuard,
		takeBlockedNav,
	} from "../ui/unsaved.svelte";

	let {
		item = $bindable(null as InventoryItem | null),
		busy = false,
		busyLabel = "Working…",
		cleanToken = 0,
		onsave,
		ondelete,
		onback,
	}: {
		item: InventoryItem | null;
		busy?: boolean;
		busyLabel?: string;
		cleanToken?: number;
		onsave: () => void | Promise<void>;
		ondelete: () => void | Promise<void>;
		onback: (opts?: { force?: boolean }) => void;
	} = $props();

	let snapshot = $state("");
	/** Problems from the last Save, by field id. */
	const errors = new FormErrors();
	let deleteOpen = $state(false);
	let discardOpen = $state(false);
	let supplierDrawerOpen = $state(false);
	let supplierEditIndex = $state<number | null>(null);
	let supplierDraft = $state<InventorySupplier>({ name: "" });
	let catalog = $state<CatalogSupplier[]>([]);
	let menuSections = $state<MenuSection[]>([]);

	const kindOptions: SelectOption[] = INVENTORY_KINDS.map((row) => ({
		value: row.value,
		label: row.label,
	}));
	const unitOptions: SelectOption[] = [
		{ value: "", label: "None" },
		...UNITS.map((unit) => ({ value: unit, label: unit })),
	];

	function serialize(row: InventoryItem | null): string {
		if (!row) return "";
		return JSON.stringify({
			name: row.name || "",
			fullName: row.fullName || "",
			kind: row.kind || "other",
			abv: row.abv || "",
			defaultUnit: row.defaultUnit || "",
			estimatedCost: row.estimatedCost ?? null,
			suppliers: row.suppliers || [],
			notes: row.notes || "",
			active: row.active !== false,
			actualQty: row.actualQty ?? null,
			actualUnit: row.actualUnit || "",
		});
	}

	function formatCountedAt(value: string | undefined): string {
		if (!value) return "";
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return value;
		return date.toLocaleString("en-GB", {
			dateStyle: "medium",
			timeStyle: "short",
		});
	}

	const onHandHint = $derived.by(() => {
		const when = formatCountedAt(item?.countedAt);
		const sku = item?.lightspeedSku ? `Lightspeed SKU ${item.lightspeedSku}. ` : "";
		if (when) {
			return `${sku}Last counted ${when}. From a Lightspeed export, or a correction you type here.`;
		}
		return `${sku}From a Lightspeed export, or a count you type here.`;
	});
	const actualUnitOptions = $derived.by((): SelectOption[] => {
		const current = item?.actualUnit || "";
		if (current && !unitOptions.some((row) => row.value === current)) {
			return [...unitOptions, { value: current, label: current }];
		}
		return unitOptions;
	});

	const dirty = $derived(Boolean(snapshot && serialize(item) !== snapshot));
	const itemKey = $derived(String(item?._id || item?.id || "new"));
	const supplierRows = $derived(item?.suppliers || []);
	const supplierDrawerTitle = $derived(
		supplierEditIndex == null ? "Add supplier" : "Edit supplier",
	);

	const usedIn = $derived(
		recipesUsingInventory(menuSections, item?._id || item?.id),
	);
	const catalogId = $derived(String(supplierDraft.supplierId || ""));
	const supplierOptions = $derived.by((): SelectOption[] => {
		const rows: SelectOption[] = catalog.map((row) => ({
			value: String(row.id || row._id || ""),
			label: row.name,
			hint: hostLabel(row.website),
		}));
		const currentId = catalogId;
		const currentName = String(supplierDraft.name || "").trim();
		if (currentId && !rows.some((row) => row.value === currentId)) {
			rows.unshift({
				value: currentId,
				label: currentName || "Supplier",
				hint: "Not in the list",
			});
		} else if (
			!currentId &&
			currentName &&
			!catalog.some(
				(row) => row.name.toLowerCase() === currentName.toLowerCase(),
			)
		) {
			rows.unshift({
				value: `name:${currentName}`,
				label: currentName,
				hint: "Not in the list",
			});
		}
		return [{ value: "", label: "Choose a supplier" }, ...rows];
	});

	async function loadCatalog() {
		try {
			const data = await getSuppliers();
			catalog = data.suppliers || [];
		} catch {
			catalog = [];
		}
	}

	async function loadUsage() {
		try {
			const data = await getMenu();
			menuSections = data.sections || [];
		} catch {
			menuSections = [];
		}
	}

	onMount(() => {
		void loadCatalog();
		void loadUsage();
	});

	$effect(() => {
		const key = itemKey;
		void key;
		snapshot = serialize(untrack(() => item));
		errors.clearAll();
		discardOpen = false;
		deleteOpen = false;
		supplierDrawerOpen = false;
		supplierEditIndex = null;
	});

	$effect(() => {
		const token = cleanToken;
		if (!token) return;
		snapshot = serialize(untrack(() => item));
	});

	$effect(() => {
		if (!dirty || typeof window === "undefined") return;
		const onBeforeUnload = (e: BeforeUnloadEvent) => {
			e.preventDefault();
			e.returnValue = "";
		};
		window.addEventListener("beforeunload", onBeforeUnload);
		return () => window.removeEventListener("beforeunload", onBeforeUnload);
	});

	$effect(() => {
		setUnsavedGuard(dirty, () => {
			discardOpen = true;
		});
	});

	onDestroy(() => clearUnsavedGuard());

	function patch<K extends keyof InventoryItem>(field: K, value: InventoryItem[K]) {
		if (!item) return;
		item = { ...item, [field]: value };
	}

	function supplierList(): InventorySupplier[] {
		return item?.suppliers || [];
	}

	function setSuppliers(next: InventorySupplier[]) {
		patch("suppliers", next);
	}

	function patchSupplierPrice(index: number, raw: string) {
		const list = supplierList();
		const entry = list[index];
		if (!entry) return;
		const trimmed = raw.trim();
		let next: InventorySupplier;
		if (!trimmed) {
			const { price: _drop, ...rest } = entry;
			void _drop;
			next = rest;
		} else {
			const n = Number(trimmed.replace(/[£,\s]/g, ""));
			next = {
				...entry,
				price: Number.isFinite(n) ? n : entry.price,
			};
		}
		setSuppliers(list.map((row, i) => (i === index ? next : row)));
	}

	function hostLabel(url: string | undefined): string {
		if (!url) return "";
		try {
			return new URL(url).hostname.replace(/^www\./i, "");
		} catch {
			return "";
		}
	}

	function catalogIdFor(entry: InventorySupplier): string {
		const id = String(entry.supplierId || "").trim();
		if (id) return id;
		const name = String(entry.name || "").trim().toLowerCase();
		if (!name) return "";
		const hit = catalog.find((row) => row.name.toLowerCase() === name);
		return String(hit?.id || hit?._id || "");
	}

	function openAddSupplier() {
		void loadCatalog();
		supplierEditIndex = null;
		supplierDraft = { name: "", supplierId: "", productUrl: "" };
		supplierDrawerOpen = true;
	}

	function openEditSupplier(index: number) {
		const entry = supplierList()[index];
		if (!entry) return;
		void loadCatalog();
		supplierEditIndex = index;
		const supplierId = catalogIdFor(entry);
		supplierDraft = { ...entry, ...(supplierId ? { supplierId } : {}) };
		supplierDrawerOpen = true;
	}

	function closeSupplierDrawer() {
		supplierDrawerOpen = false;
		supplierEditIndex = null;
	}

	function patchDraft(
		field: "name" | "productUrl" | "sku" | "pack" | "price",
		value: string,
	) {
		if (field === "price") {
			const trimmed = value.trim();
			if (!trimmed) {
				const { price: _drop, ...rest } = supplierDraft;
				void _drop;
				supplierDraft = rest;
				return;
			}
			const n = Number(trimmed.replace(/[£,\s]/g, ""));
			supplierDraft = {
				...supplierDraft,
				price: Number.isFinite(n) ? n : supplierDraft.price,
			};
			return;
		}
		if (field === "productUrl") {
			const sku = supplierDraft.sku || skuFromProductUrl(value);
			supplierDraft = {
				...supplierDraft,
				productUrl: value,
				...(sku ? { sku } : {}),
			};
			return;
		}
		supplierDraft = { ...supplierDraft, [field]: value };
	}

	function applySupplierDraft() {
		const pickedId = String(supplierDraft.supplierId || "").trim();
		const picked = catalog.find(
			(row) => String(row.id || row._id || "") === pickedId,
		);
		const name = picked?.name || String(supplierDraft.name || "").trim();
		const productUrl = String(supplierDraft.productUrl || "").trim();
		if (!name && !productUrl) {
			closeSupplierDrawer();
			return;
		}
		if (!name) {
			return;
		}
		const nextEntry: InventorySupplier = {
			...supplierDraft,
			name,
			...(picked ? { supplierId: String(picked.id || picked._id) } : {}),
			...(productUrl ? { productUrl } : {}),
		};
		const list = supplierList();
		if (supplierEditIndex == null) {
			setSuppliers([...list, nextEntry]);
		} else {
			setSuppliers(
				list.map((entry, i) => (i === supplierEditIndex ? nextEntry : entry)),
			);
		}
		closeSupplierDrawer();
	}

	function onPickSupplier(value: string) {
		if (!value) {
			supplierDraft = { ...supplierDraft, supplierId: "", name: "" };
			return;
		}
		if (value.startsWith("name:")) {
			supplierDraft = {
				...supplierDraft,
				supplierId: "",
				name: value.slice("name:".length),
			};
			return;
		}
		const picked = catalog.find(
			(row) => String(row.id || row._id || "") === value,
		);
		supplierDraft = {
			...supplierDraft,
			supplierId: value,
			name: picked?.name || supplierDraft.name,
		};
	}

	function removeSupplierFromDrawer() {
		if (supplierEditIndex == null) {
			closeSupplierDrawer();
			return;
		}
		setSuppliers(supplierList().filter((_, i) => i !== supplierEditIndex));
		closeSupplierDrawer();
	}

	function discardAndClose() {
		if (dirty) {
			discardOpen = true;
			return;
		}
		onback({ force: true });
	}

	function cancelDiscard() {
		discardOpen = false;
		takeBlockedNav();
	}

	function confirmDiscard() {
		discardOpen = false;
		beginLeave();
		const pending = takeBlockedNav();
		if (pending?.path) {
			navigate(pending.path, { force: true, replace: pending.replace });
			return;
		}
		onback({ force: true });
	}

	function kindLabel(kind: InventoryKind | undefined) {
		return INVENTORY_KINDS.find((row) => row.value === kind)?.label || "Ingredient";
	}

	function estimateHint(kind: InventoryKind | undefined): string {
		const est = kindCostEstimate(kind);
		if (est.variable) {
			return `Used when there's no supplier price. Fresh produce moves around. Blank uses ${formatGbp(est.cost)}.`;
		}
		return `Used when there's no supplier price. Blank uses ${formatGbp(est.cost)}.`;
	}

	function submit() {
		if (busy || !item) return;
		errors.replace({ "inv-name": String(item.name || "").trim() ? "" : "Add a short name." });
		if (errors.count) {
			void errors.reveal();
			return;
		}
		onsave();
	}
</script>

{#if item}
	<form
		class="editor"
		novalidate
		aria-busy={busy || undefined}
		onsubmit={(e) => {
			e.preventDefault();
			submit();
		}}
	>
		<BusyOverlay active={busy} label={busyLabel} />
		<EditorBackBar label="Inventory" onback={discardAndClose} />
		<div class="panel" class:dirty>
			<header class="panel-head">
				<div class="titles">
					<p class="eyebrow">{kindLabel(item.kind)}</p>
					<h1 class="title-text" class:placeholder={!item.name?.trim()}>
						{item.name?.trim() || "New item"}
					</h1>
				</div>
				<div class="head-actions">
					<label
						class="switch compact"
						title="Shown when picking ingredients for recipes"
					>
						<input
							type="checkbox"
							checked={item.active !== false}
							onchange={(e) =>
								patch(
									"active",
									(e.currentTarget as HTMLInputElement).checked,
								)}
						/>
						<span class="switch-ui"></span>
						<span class="switch-label">Active</span>
					</label>
					<Button
						class="close-btn"
						variant="ghost"
						size="sm"
						type="button"
						aria-label={dirty ? "Close with unsaved changes" : "Close"}
						title={dirty ? "Close (unsaved)" : "Close"}
						onclick={discardAndClose}
					>
						{#snippet icon()}
							<Icon name="close" size={16} />
						{/snippet}
					</Button>
				</div>
			</header>

			<div class="body scrollbar-fade">
				<div class="board">
					<div class="col-main">
						<FormSection title="Item">
							<Field
								class="span-all"
								label="Short name"
								for="inv-name"
								width="lg"
								error={errors.get("inv-name")}
								hint="What recipes and specs call it."
							>
								<TextField
									id="inv-name"
									size="sm"
									autocomplete="off"
									placeholder="St-Germain"
									value={item.name || ""}
									oninput={(e) => {
										errors.clear("inv-name");
										patch("name", (e.currentTarget as HTMLInputElement).value);
									}}
								/>
							</Field>
							<Field
								class="span-all"
								label="Full name"
								width="lg"
								for="inv-full-name"
								optional
								hint="The bottle's full name. Specs keep the short name; analysis uses this to match the menu line."
							>
								<TextField
									id="inv-full-name"
									size="sm"
									placeholder="St-Germain elderflower liqueur"
									value={item.fullName || ""}
									oninput={(e) =>
										patch(
											"fullName",
											(e.currentTarget as HTMLInputElement).value,
										)}
								/>
							</Field>
							<div class="field-row">
								<Field label="Kind" for="inv-kind" width="md">
									<NativeSelect
										id="inv-kind"
										size="sm"
										options={kindOptions}
										value={item.kind || "other"}
										onchange={(e) =>
											patch("kind", e.currentTarget.value as InventoryKind)}
									/>
								</Field>
								<Field label="ABV" for="inv-abv" width="sm" optional>
									<NumberField
										id="inv-abv"
										size="sm"
										unit="%"
										min={0}
										max={100}
										step={0.5}
										decimals={1}
										noun="a percentage"
										placeholder="40"
										value={String(item.abv || "").replace(/\s*%\s*$/, "")}
										oninput={(e) =>
											patch(
												"abv",
												(e.currentTarget as HTMLInputElement).value,
											)}
									/>
								</Field>
								<Field label="Default unit" for="inv-unit" width="sm">
									<NativeSelect
										id="inv-unit"
										size="sm"
										options={unitOptions}
										value={item.defaultUnit || ""}
										onchange={(e) => patch("defaultUnit", e.currentTarget.value)}
									/>
								</Field>
							</div>
						</FormSection>

						<FormSection title="Cost and stock" description="An estimate prices recipes until a supplier price is set.">
							<div class="field-row">
								<Field
									label="Estimated cost"
									width="sm"
									for="inv-estimate"
									optional
									hint={estimateHint(item.kind)}
								>
									<MoneyField
										id="inv-estimate"
										size="sm"
										placeholder={kindCostEstimate(item.kind).cost.toFixed(2)}
										value={
											item.estimatedCost != null
												? String(item.estimatedCost)
												: ""
										}
										oninput={(e) => {
											const raw = (e.currentTarget as HTMLInputElement).value.trim();
											if (!raw) {
												patch("estimatedCost", undefined);
												return;
											}
											const n = parseNumber(raw);
											patch(
												"estimatedCost",
												typeof n === "number" ? n : item?.estimatedCost,
											);
										}}
									/>
								</Field>
							</div>
							<div class="field-row">
								<Field
									label="On hand"
									width="sm"
									for="inv-on-hand"
									optional
									hint={onHandHint}
								>
									<NumberField
										id="inv-on-hand"
										size="sm"
										min={0}
										decimals={2}
										noun="a quantity"
										placeholder="0"
										value={item.actualQty != null ? String(item.actualQty) : ""}
										oninput={(e) => {
											if (!item) return;
											const raw = (e.currentTarget as HTMLInputElement).value.trim();
											if (!raw) {
												patch("actualQty", undefined);
												return;
											}
											const n = parseNumber(raw);
											if (typeof n !== "number") {
												patch("actualQty", item.actualQty);
												return;
											}
											if (!item.actualUnit && item.defaultUnit) {
												item = {
													...item,
													actualQty: n,
													actualUnit: item.defaultUnit,
												};
												return;
											}
											patch("actualQty", n);
										}}
									/>
								</Field>
								<Field label="Counted in" for="inv-on-hand-unit" width="sm">
									<NativeSelect
										id="inv-on-hand-unit"
										size="sm"
										options={actualUnitOptions}
										value={item.actualUnit || ""}
										onchange={(e) => patch("actualUnit", e.currentTarget.value)}
									/>
								</Field>
							</div>
						</FormSection>

						<FormSection title="Suppliers" columns={1} description="Where it's bought and what it costs. Prices here cost the recipes.">
							{#snippet actions()}
								<Button variant="outline" size="sm" type="button" onclick={openAddSupplier}>
									{#snippet icon()}
										<Icon name="plus" size={15} />
									{/snippet}
									Add supplier
								</Button>
							{/snippet}
							{#if supplierRows.length === 0}
								<p class="muted">
									No suppliers on this item yet. Add one from the catalog.
								</p>
							{:else}
								<div class="supplier-table-wrap">
									<table class="supplier-table">
										<thead>
											<tr>
												<th scope="col">Supplier</th>
												<th scope="col">SKU</th>
												<th scope="col">Pack</th>
												<th scope="col" class="num">Price</th>
												<th scope="col" class="icon-col">
													<span class="sr-only">Product page</span>
												</th>
												<th scope="col" class="icon-col">
													<span class="sr-only">Details</span>
												</th>
											</tr>
										</thead>
										<tbody>
											{#each supplierRows as entry, index (entry._id || `${entry.name}-${entry.sku}-${index}`)}
												<tr>
													<td class="name-cell">{entry.name || "Untitled"}</td>
													<td class="mono">{entry.sku || ""}</td>
													<td>{entry.pack || ""}</td>
													<td class="price-cell">
														<MoneyField
															class="price-input"
															size="sm"
															align="end"
															aria-label="Price for {entry.name || 'supplier'}"
															value={
																entry.price != null ? String(entry.price) : ""
															}
															oninput={(e) =>
																patchSupplierPrice(
																	index,
																	(e.currentTarget as HTMLInputElement).value,
																)}
														/>
													</td>
													<td class="icon-col">
														{#if entry.productUrl}
															<a
																class="icon-btn"
																href={entry.productUrl}
																target="_blank"
																rel="noreferrer"
																aria-label="Product page"
																title="Product page"
															>
																<Icon name="external-link" size={15} />
															</a>
														{/if}
													</td>
													<td class="icon-col">
														<Button
															variant="ghost"
															size="xs"
															type="button"
															aria-label="Supplier details"
															title="Details"
															onclick={() => openEditSupplier(index)}
														>
															{#snippet icon()}
																<Icon name="pen" size={14} />
															{/snippet}
														</Button>
													</td>
												</tr>
											{/each}
										</tbody>
									</table>
								</div>
							{/if}
						</FormSection>
					</div>

					<div class="col-side">
						<FormSection title="Used in" columns={1}>
							{#if usedIn.length === 0}
								<p class="muted">
									{item.active === false
										? "Not used in any recipe. Hidden from the ingredient picker."
										: "Not used in any recipe yet."}
								</p>
							{:else}
								<div class="used-in">
									{#each usedIn as drink (drink.id)}
										<a href={drink.href}>{drink.name}</a>
									{/each}
								</div>
								{#if item.active === false}
									<p class="muted">Hidden from the ingredient picker.</p>
								{/if}
							{/if}
						</FormSection>

						<FormSection title="Notes" columns={1}>
							<Field label="For the team" for="inv-notes" optional hint="Where it lives, who to ask, anything odd about it.">
								<TextArea
									id="inv-notes"
									rows={3}
									value={item.notes || ""}
									oninput={(e) =>
										patch(
											"notes",
											(e.currentTarget as HTMLTextAreaElement).value,
										)}
								/>
							</Field>
						</FormSection>
					</div>
				</div>
			</div>

			<EditorActionBar
				saveLabel="Save item"
				saving={busy && busyLabel.startsWith("Saving")}
				disabled={busy}
				{dirty}
				errorCount={errors.count}
				onerrors={() => void errors.reveal()}
				overflow={item._id || item.id
					? [{ label: "Delete item", tone: "destructive", disabled: busy, onselect: () => (deleteOpen = true) }]
					: []}
			/>
		</div>
	</form>

	<ConfirmDialog
		open={discardOpen}
		title="Discard unsaved changes?"
		message="You have edits that haven't been saved. They will be lost."
		action="Discard"
		cancelLabel="Keep editing"
		oncancel={cancelDiscard}
		onconfirm={confirmDiscard}
	/>

	<ConfirmDialog
		open={deleteOpen}
		title={`Delete ${item.name || "this item"}?`}
		message="It goes from inventory and the ingredient picker. This can't be undone."
		action="Delete"
		oncancel={() => (deleteOpen = false)}
		onconfirm={() => {
			deleteOpen = false;
			ondelete();
		}}
	/>

	<SidePanel
		open={supplierDrawerOpen}
		ariaLabel={supplierDrawerTitle}
		width="min(28rem, 100%)"
		onclose={closeSupplierDrawer}
	>
		<div class="drawer">
			<header class="drawer-head">
				<div>
					<p class="drawer-eyebrow">Supplier</p>
					<h2>{supplierDrawerTitle}</h2>
				</div>
				<Button
					variant="ghost"
					size="sm"
					type="button"
					aria-label="Close"
					onclick={closeSupplierDrawer}
				>
					{#snippet icon()}
						<Icon name="close" size={16} />
					{/snippet}
				</Button>
			</header>
			<div class="drawer-body scrollbar-fade">
				<div class="drawer-grid">
					<Field label="Supplier" for="drawer-supplier">
						<NativeSelect
							id="drawer-supplier"
							size="sm"
							options={supplierOptions}
							value={catalogId ||
								(supplierDraft.name && !catalogId
									? `name:${supplierDraft.name}`
									: "")}
							onchange={(e) => onPickSupplier(e.currentTarget.value)}
						/>
					</Field>
					<p class="drawer-manage">
						<a href="/suppliers">Manage suppliers</a>
					</p>
					<div class="drawer-row">
						<Field label="SKU" for="drawer-sku" optional>
							<TextField
								id="drawer-sku"
								size="sm"
								mono
								spellcheck="false"
								placeholder="SPA47010"
								value={supplierDraft.sku || ""}
								oninput={(e) =>
									patchDraft(
										"sku",
										(e.currentTarget as HTMLInputElement).value,
									)}
							/>
						</Field>
						<Field label="Pack" for="drawer-pack" optional>
							<TextField
								id="drawer-pack"
								size="sm"
								placeholder="BOTTLE"
								value={supplierDraft.pack || ""}
								oninput={(e) =>
									patchDraft(
										"pack",
										(e.currentTarget as HTMLInputElement).value,
									)}
							/>
						</Field>
						<Field label="Price" for="drawer-price" optional>
							<MoneyField
								id="drawer-price"
								size="sm"
								value={
									supplierDraft.price == null
										? ""
										: String(supplierDraft.price)
								}
								oninput={(e) =>
									patchDraft(
										"price",
										(e.currentTarget as HTMLInputElement).value,
									)}
							/>
						</Field>
					</div>
					<Field label="Product page" for="drawer-url" optional>
						<TextField
							id="drawer-url"
							size="sm"
							type="url"
							inputmode="url"
							spellcheck="false"
							placeholder="https://"
							value={supplierDraft.productUrl || ""}
							oninput={(e) =>
								patchDraft(
									"productUrl",
									(e.currentTarget as HTMLInputElement).value,
								)}
						/>
					</Field>
					{#if supplierDraft.productUrl}
						<a
							class="drawer-open"
							href={supplierDraft.productUrl}
							target="_blank"
							rel="noreferrer"
						>
							Open product page
						</a>
					{/if}
				</div>
			</div>
			<footer class="drawer-foot">
				{#if supplierEditIndex != null}
					<Button
						class="drawer-remove"
						variant="destructive"
						size="sm"
						type="button"
						onclick={removeSupplierFromDrawer}
					>
						Remove
					</Button>
				{/if}
				<Button
					variant="outline"
					size="sm"
					type="button"
					onclick={closeSupplierDrawer}
				>
					Cancel
				</Button>
				<Button
					variant="primary"
					size="sm"
					type="button"
					onclick={applySupplierDraft}
				>
					Done
				</Button>
			</footer>
		</div>
	</SidePanel>
{/if}

<style>
	.editor {
		position: relative;
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
		padding: 0.75rem var(--page-gutter) 0.85rem;
	}

	.panel {
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
		flex: 1;
		height: 100%;
		border: 1px solid var(--border);
		border-radius: var(--radius-xl);
		background: var(--card);
		box-shadow: var(--shadow-sm);
		overflow: hidden;
	}

	.panel.dirty {
		border-color: var(--border-strong);
	}

	.panel-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-2);
		padding: 0.75rem var(--card-pad) 0.65rem;
		border-bottom: 1px solid var(--border);
	}

	.titles {
		display: grid;
		gap: 0.15rem;
		min-width: 0;
		flex: 1;
	}

	.eyebrow {
		margin: 0;
		font-size: var(--text-2xs);
		font-weight: 600;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--muted-foreground);
	}

	.title-text {
		margin: 0;
		min-width: 0;
		color: var(--foreground);
		font-family: var(--font-display);
		font-size: var(--text-2xl);
		font-weight: 600;
		letter-spacing: var(--tracking-2xl);
		line-height: 1.3;
		overflow-wrap: anywhere;
	}

	.title-text.placeholder {
		color: var(--muted-foreground);
	}

	.head-actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-shrink: 0;
	}

	/* Section cards sit on the page colour, so each group reads as one block. */
	.body {
		flex: 1;
		min-height: 0;
		overflow: auto;
		padding: var(--space-4) var(--card-pad) var(--card-pad);
		background: var(--sunken);
		container-type: inline-size;
		container-name: inventory-detail;
	}

	.board,
	.col-main,
	.col-side {
		display: grid;
		gap: var(--space-4);
		align-content: start;
		min-width: 0;
	}

	@container inventory-detail (min-width: 56rem) {
		.board {
			grid-template-columns: minmax(0, 1fr) minmax(16rem, 22rem);
			gap: var(--space-5);
			align-items: start;
		}
	}

	.muted {
		margin: 0;
		font-size: var(--text-sm);
		line-height: 1.45;
		color: var(--muted-foreground);
	}

	.supplier-table-wrap {
		overflow-x: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--sunken);
	}

	.supplier-table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--text-sm);
	}

	.supplier-table th,
	.supplier-table td {
		padding: var(--space-2) var(--space-3);
		text-align: left;
		border-bottom: 1px solid var(--border);
		vertical-align: middle;
	}

	.supplier-table th {
		font-size: var(--text-2xs);
		font-weight: 600;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--muted-foreground);
		background: color-mix(in srgb, var(--card) 70%, transparent);
	}

	.supplier-table tbody tr:last-child td {
		border-bottom: 0;
	}

	.supplier-table .mono {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
	}

	.name-cell {
		font-weight: 500;
	}

	.price-cell {
		width: 6.5rem;
		text-align: right;
	}

	.supplier-table th.num {
		text-align: right;
	}

	.supplier-table :global(.price-input) {
		height: 2rem;
		padding: 0 var(--space-2);
		background: var(--card);
	}

	.icon-col {
		width: 2.25rem;
		padding-left: 0.2rem;
		padding-right: var(--space-1);
		text-align: center;
	}

	.icon-btn {
		display: inline-grid;
		place-content: center;
		width: 1.85rem;
		height: 1.85rem;
		color: var(--muted-foreground);
	}

	.icon-btn:hover {
		color: var(--foreground);
	}

	.used-in {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.used-in a {
		display: inline-flex;
		align-items: center;
		max-width: 100%;
		padding: var(--space-1) var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		background: var(--sunken);
		color: var(--foreground);
		font-size: var(--text-sm);
		line-height: 1.3;
		text-decoration: none;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.used-in a:hover {
		border-color: var(--primary);
		color: var(--primary);
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

	.drawer {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
	}

	.drawer-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-4) var(--space-4) var(--space-3);
		border-bottom: 1px solid var(--border);
	}

	.drawer-eyebrow {
		margin: 0 0 0.15rem;
		font-size: var(--text-2xs);
		font-weight: 600;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--muted-foreground);
	}

	.drawer-head h2 {
		margin: 0;
		font-size: var(--text-md);
		font-weight: 600;
		letter-spacing: var(--tracking-lg);
	}

	.drawer-body {
		flex: 1;
		min-height: 0;
		overflow: auto;
		padding: var(--space-4);
	}

	.drawer-grid {
		display: grid;
		gap: var(--space-3);
	}

	.drawer-manage {
		margin: -0.45rem 0 0;
		font-size: var(--text-sm);
	}

	.drawer-manage a {
		color: var(--muted-foreground);
		text-decoration: none;
	}

	.drawer-manage a:hover {
		color: var(--foreground);
	}

	.drawer-row {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr;
		gap: var(--space-3);
	}

	.drawer-open {
		font-size: var(--text-sm);
		color: var(--primary);
		text-decoration: none;
	}

	.drawer-open:hover {
		text-decoration: underline;
	}

	.drawer-foot {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-4);
		border-top: 1px solid var(--border);
	}

	.drawer-foot :global(.drawer-remove) {
		margin-right: auto;
	}


	.switch {
		display: inline-flex;
		align-items: center;
		gap: var(--space-3);
		min-height: var(--control-h-sm);
		cursor: pointer;
		user-select: none;
	}

	.switch input {
		position: absolute;
		opacity: 0;
		width: 1px;
		height: 1px;
	}

	.switch-ui {
		position: relative;
		width: 2.5rem;
		height: 1.4rem;
		flex-shrink: 0;
		border-radius: var(--radius-pill);
		background: var(--muted);
		border: 1px solid var(--border-strong);
	}

	.switch-ui::after {
		content: "";
		position: absolute;
		top: 0.15rem;
		left: 0.15rem;
		width: 1rem;
		height: 1rem;
		border-radius: 50%;
		background: var(--foreground);
		transition: transform var(--t-fast) var(--ease);
	}

	.switch input:checked + .switch-ui {
		background: var(--primary);
		border-color: var(--primary);
	}

	.switch input:checked + .switch-ui::after {
		transform: translateX(1.05rem);
		background: var(--primary-foreground);
	}

	.switch-label {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--muted-foreground);
	}

	.switch.compact {
		gap: var(--space-2);
		flex-shrink: 0;
	}

	.switch.compact .switch-ui {
		width: 2.15rem;
		height: 1.25rem;
	}

	.switch.compact .switch-ui::after {
		width: 0.85rem;
		height: 0.85rem;
	}

	.switch.compact input:checked + .switch-ui::after {
		transform: translateX(0.9rem);
	}

	@media (max-width: 900px) {
		.editor {
			padding: 0;
		}

		.panel {
			height: auto;
			border-radius: 0;
			border-left: none;
			border-right: none;
		}

		.head-actions :global(.close-btn) {
			display: none;
		}

	}

	@media (max-width: 880px) {
		.drawer-row {
			grid-template-columns: 1fr;
		}

	}
</style>
