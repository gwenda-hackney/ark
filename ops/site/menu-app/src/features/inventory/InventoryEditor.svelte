<script lang="ts">
	import { onDestroy, untrack } from "svelte";
	import {
		Button,
		BusyOverlay,
		Dialog,
		EditorBackBar,
		Field,
		NativeSelect,
		TextArea,
		TextField,
	} from "../../ui";
	import type { SelectOption } from "../../ui/types";
	import {
		INVENTORY_KINDS,
		UNITS,
		formatGbp,
		skuFromProductUrl,
		type InventoryItem,
		type InventoryKind,
		type InventorySupplier,
	} from "../../lib/types";
	import { kindCostEstimate } from "../../lib/cost";
	import { Icon } from "../../shell";
	import { navigate } from "../../lib/nav";
	import {
		beginLeave,
		clearUnsavedGuard,
		setUnsavedGuard,
		takeBlockedNav,
	} from "../../lib/unsaved.svelte";

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
	let deleteOpen = $state(false);
	let discardOpen = $state(false);

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
		});
	}

	const dirty = $derived(Boolean(snapshot && serialize(item) !== snapshot));
	const itemKey = $derived(String(item?._id || item?.id || "new"));
	const supplierRows = $derived(item?.suppliers || []);

	$effect(() => {
		const key = itemKey;
		void key;
		snapshot = serialize(untrack(() => item));
		discardOpen = false;
		deleteOpen = false;
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

	function updateSupplier(
		index: number,
		field: "name" | "productUrl" | "sku" | "pack" | "price",
		value: string,
	) {
		const next = supplierList().map((entry, i) => {
			if (i !== index) return entry;
			if (field === "price") {
				const trimmed = value.trim();
				if (!trimmed) {
					const { price: _drop, ...rest } = entry;
					void _drop;
					return rest;
				}
				const n = Number(trimmed.replace(/[£,\s]/g, ""));
				return { ...entry, price: Number.isFinite(n) ? n : entry.price };
			}
			if (field === "productUrl") {
				const sku = entry.sku || skuFromProductUrl(value);
				return {
					...entry,
					productUrl: value,
					...(sku ? { sku } : {}),
				};
			}
			return { ...entry, [field]: value };
		});
		setSuppliers(next);
	}

	function addSupplier() {
		setSuppliers([...supplierList(), { name: "", productUrl: "" }]);
	}

	function removeSupplier(index: number) {
		setSuppliers(supplierList().filter((_, i) => i !== index));
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
			return `Stand-in for a ${est.label} when there is no supplier price. Fresh juice and produce move around. House guess if empty: ${formatGbp(est.cost)}.`;
		}
		return `Stand-in for a ${est.label} when there is no supplier price. House guess if empty: ${formatGbp(est.cost)}.`;
	}
</script>

{#if item}
	<form
		class="editor"
		aria-busy={busy || undefined}
		onsubmit={(e) => {
			e.preventDefault();
			if (busy) return;
			onsave();
		}}
	>
		<BusyOverlay active={busy} label={busyLabel} />
		<EditorBackBar label="Inventory" {dirty} onback={discardAndClose} />
		<div class="panel" class:dirty>
			<header class="panel-head">
				<div class="titles">
					<p class="eyebrow">{kindLabel(item.kind)}</p>
					<div class="title-row">
						<input
							class="title-input"
							id="inv-name"
							required
							autocomplete="off"
							placeholder="Short name"
							aria-label="Short name"
							value={item.name || ""}
							oninput={(e) =>
								patch("name", (e.currentTarget as HTMLInputElement).value)}
						/>
					</div>
				</div>
				<div class="head-actions">
					{#if dirty}
						<span class="dirty-pill" aria-live="polite">Unsaved</span>
					{/if}
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

			<div class="body">
				<div class="grid">
					<div class="full">
						<Field
							label="Full name"
							for="inv-full-name"
							tooltip="Bottle name. Specs keep the short name; analysis uses this to match the guest menu line (St-Germain is elderflower liqueur)."
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
					</div>
					<Field label="Kind" for="inv-kind">
						<NativeSelect
							id="inv-kind"
							size="sm"
							options={kindOptions}
							value={item.kind || "other"}
							onchange={(e) =>
								patch("kind", e.currentTarget.value as InventoryKind)}
						/>
					</Field>
					<Field
						label="ABV %"
						for="inv-abv"
						tooltip="Alcohol by volume as printed on the bottle. Used to calculate cocktail strength."
					>
						<TextField
							id="inv-abv"
							size="sm"
							inputmode="decimal"
							placeholder="40"
							value={item.abv || ""}
							oninput={(e) =>
								patch(
									"abv",
									(e.currentTarget as HTMLInputElement).value,
								)}
						/>
					</Field>
					<Field label="Default unit" for="inv-unit">
						<NativeSelect
							id="inv-unit"
							size="sm"
							options={unitOptions}
							value={item.defaultUnit || ""}
							onchange={(e) => patch("defaultUnit", e.currentTarget.value)}
						/>
					</Field>
					<Field
						label="Estimate (£)"
						for="inv-estimate"
						hint={estimateHint(item.kind)}
					>
						<TextField
							id="inv-estimate"
							size="sm"
							mono
							inputmode="decimal"
							placeholder={String(kindCostEstimate(item.kind).cost)}
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
								const n = Number(raw.replace(/[£,\s]/g, ""));
								patch(
									"estimatedCost",
									Number.isFinite(n) ? n : item.estimatedCost,
								);
							}}
						/>
					</Field>
					<div class="full">
						<label class="switch">
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
							<span class="switch-label">Active in recipes</span>
						</label>
					</div>
					<div class="full suppliers">
						<div class="supplier-head">
							<div>
								<p class="supplier-label">Suppliers</p>
								<p class="supplier-help">
									One row per wholesaler. Price is the trade cost for that
									pack (from the LWC list when we have a SKU).
								</p>
							</div>
							<Button
								variant="outline"
								size="sm"
								type="button"
								onclick={addSupplier}
							>
								Add supplier
							</Button>
						</div>
						{#if supplierRows.length === 0}
							<p class="supplier-empty">
								No suppliers yet. Add LWC, Hills Prospect, or whoever you
								buy this from.
							</p>
						{:else}
							<div class="supplier-list">
								{#each supplierRows as entry, index (index)}
									<div class="supplier-card">
										<div class="supplier-row">
											<Field
												label="Supplier"
												for={`inv-supplier-${index}`}
											>
												<TextField
													id={`inv-supplier-${index}`}
													size="sm"
													placeholder="LWC Drinks"
													value={entry.name || ""}
													oninput={(e) =>
														updateSupplier(
															index,
															"name",
															(e.currentTarget as HTMLInputElement).value,
														)}
												/>
											</Field>
											<Field label="SKU" for={`inv-sku-${index}`}>
												<TextField
													id={`inv-sku-${index}`}
													size="sm"
													placeholder="SPA47010"
													value={entry.sku || ""}
													oninput={(e) =>
														updateSupplier(
															index,
															"sku",
															(e.currentTarget as HTMLInputElement).value,
														)}
												/>
											</Field>
											<Field label="Pack" for={`inv-pack-${index}`}>
												<TextField
													id={`inv-pack-${index}`}
													size="sm"
													placeholder="BOTTLE"
													value={entry.pack || ""}
													oninput={(e) =>
														updateSupplier(
															index,
															"pack",
															(e.currentTarget as HTMLInputElement).value,
														)}
												/>
											</Field>
											<Field label="Price" for={`inv-price-${index}`}>
												<TextField
													id={`inv-price-${index}`}
													size="sm"
													inputmode="decimal"
													placeholder="0.00"
													value={
														entry.price == null ? "" : String(entry.price)
													}
													oninput={(e) =>
														updateSupplier(
															index,
															"price",
															(e.currentTarget as HTMLInputElement).value,
														)}
												/>
											</Field>
											<button
												class="supplier-remove"
												type="button"
												aria-label="Remove supplier"
												onclick={() => removeSupplier(index)}
											>
												Remove
											</button>
										</div>
										<div class="supplier-url">
											<Field
												label="Product page"
												for={`inv-url-${index}`}
											>
												<TextField
													id={`inv-url-${index}`}
													size="sm"
													placeholder="https://"
													value={entry.productUrl || ""}
													oninput={(e) =>
														updateSupplier(
															index,
															"productUrl",
															(e.currentTarget as HTMLInputElement).value,
														)}
												/>
											</Field>
											{#if entry.productUrl}
												<a
													class="supplier-open"
													href={entry.productUrl}
													target="_blank"
													rel="noreferrer"
												>
													Open
												</a>
											{/if}
											{#if entry.price != null && entry.pack}
												<p class="supplier-meta">
													{formatGbp(entry.price)} / {entry.pack}
												</p>
											{/if}
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</div>
					<div class="full">
						<Field label="Notes" for="inv-notes">
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
					</div>
				</div>
			</div>

			<footer class="panel-foot">
				{#if item._id || item.id}
					<Button
						class="delete-btn"
						variant="destructive"
						size="sm"
						type="button"
						disabled={busy}
						busy={busy && busyLabel.startsWith("Deleting")}
						onclick={() => (deleteOpen = true)}
					>
						{#snippet icon()}
							<Icon name="x-circle" />
						{/snippet}
						Delete
					</Button>
				{/if}
				<Button
					variant="primary"
					size="sm"
					type="submit"
					disabled={busy}
					busy={busy && busyLabel.startsWith("Saving")}
				>
					{busy && busyLabel.startsWith("Saving") ? "Saving…" : "Save"}
				</Button>
			</footer>
		</div>
	</form>

	<Dialog
		open={discardOpen}
		title="Discard unsaved changes?"
		onclose={cancelDiscard}
	>
		<p class="copy">You have edits that have not been saved. Close without saving?</p>
		{#snippet footer()}
			<Button
				variant="outline"
				size="sm"
				type="button"
				onclick={cancelDiscard}
			>
				Keep editing
			</Button>
			<Button variant="destructive" size="sm" type="button" onclick={confirmDiscard}>
				Discard
			</Button>
		{/snippet}
	</Dialog>

	<Dialog
		open={deleteOpen}
		title="Remove from inventory?"
		onclose={() => (deleteOpen = false)}
	>
		<p class="copy">
			Remove <strong>{item.name || "this ingredient"}</strong> from inventory?
		</p>
		{#snippet footer()}
			<Button
				variant="outline"
				size="sm"
				type="button"
				onclick={() => (deleteOpen = false)}
			>
				Keep
			</Button>
			<Button
				variant="destructive"
				size="sm"
				type="button"
				onclick={() => {
					deleteOpen = false;
					ondelete();
				}}
			>
				Remove
			</Button>
		{/snippet}
	</Dialog>
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
		gap: 0.5rem;
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
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--primary);
	}

	.title-row {
		display: flex;
		min-width: 0;
	}

	.title-input {
		flex: 1;
		width: 100%;
		min-width: 0;
		box-sizing: border-box;
		padding: 0.08em 0.35rem 0.22em;
		margin: 0 -0.35rem;
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--foreground);
		font-family: var(--font-display);
		font-size: clamp(1.45rem, 2.2vw, 1.85rem);
		font-weight: 600;
		letter-spacing: -0.02em;
		line-height: 1.3;
		outline: none;
	}

	.title-input:hover {
		border-color: var(--border);
	}

	.title-input:focus {
		border-color: var(--ring);
		background: var(--sunken);
		box-shadow: 0 0 0 2px var(--ring-wash);
	}

	.head-actions {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-shrink: 0;
	}

	.dirty-pill {
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--primary);
	}

	.body {
		flex: 1;
		min-height: 0;
		overflow: auto;
		padding: 0.9rem var(--card-pad) var(--card-pad);
	}

	.grid {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr;
		gap: 0.7rem 0.85rem;
		align-items: start;
	}

	.full {
		grid-column: 1 / -1;
	}

	.supplier-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		margin-bottom: 0.45rem;
	}

	.supplier-label {
		margin: 0;
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.supplier-empty {
		margin: 0;
		font-size: var(--text-sm);
		line-height: 1.45;
		color: var(--muted-foreground);
	}

	.supplier-help {
		margin: 0.15rem 0 0;
		font-size: var(--text-sm);
		line-height: 1.4;
		color: var(--muted-foreground);
	}

	.supplier-list {
		display: grid;
		gap: 0.75rem;
	}

	.supplier-card {
		display: grid;
		gap: 0.55rem;
		padding: 0.7rem 0.75rem 0.8rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--sunken);
	}

	.supplier-row {
		display: grid;
		grid-template-columns: minmax(8rem, 1.2fr) minmax(6rem, 0.7fr) minmax(5rem, 0.6fr) minmax(5rem, 0.6fr) auto;
		gap: 0.55rem;
		align-items: end;
	}

	.supplier-url {
		display: grid;
		grid-template-columns: 1fr auto auto;
		gap: 0.55rem;
		align-items: end;
	}

	.supplier-open,
	.supplier-meta {
		margin: 0;
		font-size: var(--text-sm);
		white-space: nowrap;
		padding-bottom: 0.45rem;
	}

	.supplier-open {
		color: var(--primary);
		text-decoration: none;
	}

	.supplier-open:hover {
		text-decoration: underline;
	}

	.supplier-meta {
		color: var(--muted-foreground);
	}

	.supplier-remove {
		border: 0;
		background: transparent;
		color: var(--muted-foreground);
		font: inherit;
		font-size: var(--text-sm);
		cursor: pointer;
		padding: 0 0 0.45rem;
		height: var(--control-h-sm);
	}

	.supplier-remove:hover {
		color: var(--destructive);
	}

	.panel-foot {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.5rem;
		padding: 0.55rem var(--card-pad) 0.75rem;
		border-top: 1px solid var(--border);
	}

	.panel-foot :global(.delete-btn) {
		margin-right: auto;
	}

	.copy {
		margin: 0;
		font-size: 0.875rem;
		line-height: 1.45;
	}

	.switch {
		display: inline-flex;
		align-items: center;
		gap: 0.75rem;
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
		font-size: var(--text);
		font-weight: 500;
	}

	@media (max-width: 900px) {
		.editor {
			padding-top: 0;
		}

		.panel {
			height: auto;
		}

		.head-actions :global(.close-btn) {
			display: none;
		}

		.dirty-pill {
			display: none;
		}
	}

	@media (max-width: 880px) {
		.grid {
			grid-template-columns: 1fr;
		}

		.supplier-row,
		.supplier-url {
			grid-template-columns: 1fr;
		}

		.supplier-open,
		.supplier-meta {
			padding-bottom: 0;
		}

		.supplier-remove {
			height: auto;
			padding: 0;
			justify-self: start;
		}

		.panel-foot {
			padding-bottom: max(0.75rem, env(safe-area-inset-bottom, 0px));
		}
	}
</style>
