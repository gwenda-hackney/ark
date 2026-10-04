<script lang="ts">
	/**
	 * Suppliers as cards. Adding or editing one opens a dialog; the card's
	 * own actions open the website or delete it.
	 */
	import { onMount } from "svelte";
	import { fly } from "svelte/transition";
	import { Icon } from "../app/shell";
	import {
		Badge,
		BusyOverlay,
		Button,
		Dialog,
		EmptyState,
		Confirm,
		ConfirmDialog,
		Field,
		FormErrors,
		PageHeader,
		Skeleton,
		TextArea,
		TextField,
	} from "../ui";
	import {
		createSupplier,
		deleteSupplier,
		getSuppliers,
		updateSupplier,
	} from "../app/api";
	import { toast } from "../ui/toast.svelte";
	import { easeOut, flyMs } from "../ui/motion";
	import type { CatalogSupplier } from "./types";
	import {
		SupplierDialog,
		hostLabel,
		sortSuppliers,
		supplierId,
		usageLabel,
	} from "./suppliers.svelte";

	let suppliers = $state<CatalogSupplier[]>([]);
	let loading = $state(true);
	let saving = $state(false);
	let loadError = $state("");
	let error = $state("");
	let busyId = $state("");
	const dialog = new SupplierDialog();
	const confirm = new Confirm();
	const errors = new FormErrors();

	async function reload() {
		loading = true;
		loadError = "";
		try {
			const data = await getSuppliers();
			suppliers = data.suppliers || [];
		} catch (err) {
			loadError = err instanceof Error ? err.message : "Could not load suppliers.";
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		void reload();
	});

	function openAdd() {
		error = "";
		errors.clearAll();
		dialog.add();
	}

	function openEdit(row: CatalogSupplier) {
		error = "";
		errors.clearAll();
		dialog.edit(row);
	}

	function closeDialog() {
		if (saving) return;
		dialog.close();
	}

	async function onSave(event: Event) {
		event.preventDefault();
		errors.replace(dialog.errors());
		if (errors.count) {
			void errors.reveal();
			return;
		}
		saving = true;
		error = "";
		const body = dialog.body();
		const editingId = dialog.editingId;
		try {
			if (editingId) {
				const data = await updateSupplier(editingId, body);
				suppliers = sortSuppliers(
					suppliers.map((row) => (supplierId(row) === editingId ? data.supplier : row)),
				);
				toast.ok("Supplier saved.");
			} else {
				const data = await createSupplier(body);
				suppliers = sortSuppliers([...suppliers, data.supplier]);
				toast.ok("Supplier added.");
			}
			saving = false;
			dialog.close();
		} catch (err) {
			error = err instanceof Error ? err.message : "Could not save supplier.";
		} finally {
			saving = false;
		}
	}

	async function onRemove(row: CatalogSupplier) {
		const id = supplierId(row);
		if (!id) return;
		const label = row.name || "this supplier";
		const used = row.itemCount || 0;
		if (used) {
			toast.error(
				used === 1
					? `${label} is used on 1 inventory item. Remove that link first.`
					: `${label} is used on ${used} inventory items. Remove those links first.`,
			);
			return;
		}
		const ok = await confirm.ask({
			title: `Delete ${label}?`,
			message: "It goes from the supplier list. No inventory item uses it. This can't be undone.",
			action: "Delete",
		});
		if (!ok) return;
		busyId = id;
		try {
			await deleteSupplier(id);
			suppliers = suppliers.filter((item) => supplierId(item) !== id);
			toast.ok("Supplier deleted.");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Could not delete supplier.");
		} finally {
			busyId = "";
		}
	}
</script>

<div class="page scrollbar-fade">
	<PageHeader
		title="Suppliers"
		subtitle="Wholesalers you buy from. Inventory items pick from this list, then store SKU, pack, and price on the product."
	>
		{#snippet actions()}
			<Button type="button" onclick={openAdd}>
				{#snippet icon()}
					<Icon name="plus" size={16} />
				{/snippet}
				Add supplier
			</Button>
		{/snippet}
	</PageHeader>

	{#if loadError}
		<EmptyState tone="error" title="Could not load suppliers" text={loadError}>
			{#snippet action()}
				<Button variant="outline" size="sm" onclick={() => void reload()}>{#snippet icon()}<Icon name="refresh" size={14} />{/snippet}Try again</Button>
			{/snippet}
		</EmptyState>
	{:else if loading && suppliers.length === 0}
		<Skeleton rows={4} label="Loading suppliers…" />
	{:else if suppliers.length === 0}
		<EmptyState icon="suppliers" title="No suppliers yet" text="Add the wholesalers you buy from, then pick one on an inventory item.">
			{#snippet action()}
				<Button size="sm" onclick={openAdd}>{#snippet icon()}<Icon name="plus" size={14} />{/snippet}Add supplier</Button>
			{/snippet}
		</EmptyState>
	{:else}
		<p class="count">{suppliers.length} on the books</p>
		<ul class="grid" in:fly={{ y: 10, duration: flyMs, easing: easeOut }}>
			{#each suppliers as row (supplierId(row))}
				{@const id = supplierId(row)}
				<li class="card">
					<button type="button" class="open-edit" onclick={() => openEdit(row)}>
						<span class="name">{row.name}</span>
						<span class="host">{row.website ? hostLabel(row.website) : "No website"}</span>
						{#if row.notes}
							<span class="notes">{row.notes}</span>
						{/if}
					</button>
					<div class="foot">
						<Badge
							tone={row.itemCount ? "neutral" : "warning"}
							label={usageLabel(row.itemCount)}
							title={row.itemCount ? undefined : "No inventory item uses this supplier yet"}
						/>
						<div class="card-actions">
							{#if row.website}
								<a class="web" href={row.website} target="_blank" rel="noreferrer">
									Website
									<Icon name="external-link" size={14} />
								</a>
							{/if}
							<Button
								variant="ghost"
								size="sm"
								disabled={busyId === id}
								onclick={() => onRemove(row)}
								aria-label="Delete {row.name}"
							>
								{#snippet icon()}
									<Icon name="trash" size={16} />
								{/snippet}
							</Button>
						</div>
					</div>
				</li>
			{/each}
		</ul>
	{/if}

	<BusyOverlay active={loading && suppliers.length > 0} label="Loading…" />
</div>

<Dialog open={dialog.open} title={dialog.title} onclose={closeDialog}>
	<form id="supplier-form" class="form" novalidate onsubmit={onSave}>
		<Field label="Name" for="supplier-name" required error={errors.get("supplier-name")}>
			<TextField
				id="supplier-name"
				bind:value={dialog.name}
				placeholder="LWC Drinks"
				oninput={() => errors.clear("supplier-name")}
			/>
		</Field>
		<Field label="Website" for="supplier-website" optional>
			<TextField
				id="supplier-website"
				type="url"
				inputmode="url"
				spellcheck="false"
				bind:value={dialog.website}
				placeholder="https://www.lwc-drinks.co.uk"
				autocomplete="url"
			/>
		</Field>
		<Field
			label="Notes"
			for="supplier-notes"
			optional
			hint="Account number, delivery day, who to call."
		>
			<TextArea id="supplier-notes" rows={3} bind:value={dialog.notes} />
		</Field>
		{#if dialog.editingId}
			<p class="aside">Product SKU, pack and price stay on each inventory item.</p>
		{/if}
		{#if error}
			<p class="error">{error}</p>
		{/if}
	</form>
	{#snippet footer()}
		<Button variant="ghost" type="button" disabled={saving} onclick={closeDialog}>{#snippet icon()}<Icon name="close" size={16} />{/snippet}Cancel</Button>
		<Button type="submit" form="supplier-form" variant="primary" busy={saving}>
			{#snippet icon()}<Icon name="save" size={16} />{/snippet}
			{dialog.submitLabel}
		</Button>
	{/snippet}
</Dialog>

<ConfirmDialog {confirm} />

<style>
	.page {
		position: relative;
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: var(--page-gutter);
	}

	.count {
		margin: 0 0 var(--space-3);
		font-size: var(--text-sm);
		color: var(--fg-muted);
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 17rem), 1fr));
		gap: var(--space-3);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.card {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface-1);
		transition:
			background-color var(--t-fast) var(--ease-in-out),
			border-color var(--t-fast) var(--ease-in-out);
	}

	.card:hover {
		background: var(--surface-3);
		border-color: var(--border-strong);
	}

	.open-edit {
		display: grid;
		gap: var(--space-1);
		flex: 1;
		align-content: start;
		min-width: 0;
		margin: 0;
		padding: var(--space-4) var(--space-4) var(--space-2);
		border: 0;
		border-radius: var(--radius-lg) var(--radius-lg) 0 0;
		background: none;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.open-edit:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: -2px;
	}

	.name {
		font-size: var(--text-md);
		line-height: var(--leading-md);
		font-weight: 500;
		color: var(--fg);
		overflow-wrap: anywhere;
	}

	.host {
		font-size: var(--text-sm);
		color: var(--fg-muted);
		overflow-wrap: anywhere;
	}

	.notes {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		margin-top: var(--space-1);
		font-size: var(--text-sm);
		line-height: var(--leading-sm);
		color: var(--fg-muted);
	}

	.foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
	}

	.card-actions {
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}

	.web {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		min-height: var(--button-h-sm);
		padding: 0 var(--space-2);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		color: var(--fg-muted);
		text-decoration: none;
	}

	.web:hover {
		background: var(--surface-3);
		color: var(--fg);
	}

	.web:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
	}

	.form {
		display: grid;
		gap: var(--space-4);
	}

	.aside {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--fg-muted);
	}

	.error {
		margin: 0;
		color: var(--danger);
		font-size: var(--text-sm);
	}

	@media (max-width: 900px) {
		.grid {
			gap: var(--space-2);
		}

		.open-edit {
			padding: var(--space-3) var(--space-3) var(--space-1);
		}

		.name {
			font-size: var(--text-base);
			line-height: var(--leading-base);
		}

		.foot {
			padding-left: var(--space-3);
		}
	}
</style>
