<script lang="ts">
	import { onMount } from "svelte";
	import { fly } from "svelte/transition";
	import { Icon } from "../app/shell";
	import {
		BusyOverlay,
		Button,
		Card,
		Field,
		PageHeader,
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

	let suppliers = $state<CatalogSupplier[]>([]);
	let loading = $state(true);
	let saving = $state(false);
	let error = $state("");
	let editingId = $state("");
	let name = $state("");
	let website = $state("");
	let notes = $state("");
	let busyId = $state("");

	const formTitle = $derived(editingId ? "Edit supplier" : "Add supplier");

	function resetForm() {
		editingId = "";
		name = "";
		website = "";
		notes = "";
	}

	async function reload() {
		loading = true;
		error = "";
		try {
			const data = await getSuppliers();
			suppliers = data.suppliers || [];
		} catch (err) {
			error = err instanceof Error ? err.message : "Could not load suppliers.";
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		void reload();
	});

	function startEdit(row: CatalogSupplier) {
		editingId = String(row.id || row._id || "");
		name = row.name || "";
		website = row.website || "";
		notes = row.notes || "";
		error = "";
	}

	async function onSave(event: Event) {
		event.preventDefault();
		saving = true;
		error = "";
		const body = {
			name: name.trim(),
			website: website.trim(),
			notes: notes.trim(),
		};
		try {
			if (editingId) {
				const data = await updateSupplier(editingId, body);
				suppliers = suppliers
					.map((row) => (String(row.id) === editingId ? data.supplier : row))
					.sort((a, b) =>
						String(a.name).localeCompare(String(b.name), undefined, {
							sensitivity: "base",
						}),
					);
				toast.ok("Supplier saved.");
			} else {
				const data = await createSupplier(body);
				suppliers = [...suppliers, data.supplier].sort((a, b) =>
					String(a.name).localeCompare(String(b.name), undefined, {
						sensitivity: "base",
					}),
				);
				toast.ok("Supplier added.");
			}
			resetForm();
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Could not save supplier.";
			error = message;
			toast.error(message);
		} finally {
			saving = false;
		}
	}

	async function onRemove(row: CatalogSupplier) {
		const id = String(row.id || row._id || "");
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
		if (!window.confirm(`Remove ${label} from suppliers?`)) return;
		busyId = id;
		try {
			await deleteSupplier(id);
			suppliers = suppliers.filter((item) => String(item.id) !== id);
			if (editingId === id) resetForm();
			toast.ok("Supplier removed.");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Could not remove supplier.");
		} finally {
			busyId = "";
		}
	}

	function hostLabel(url: string | undefined): string {
		if (!url) return "";
		try {
			return new URL(url).hostname.replace(/^www\./i, "");
		} catch {
			return url;
		}
	}
</script>

<div class="page scrollbar-fade">
	<PageHeader
		title="Suppliers"
		subtitle="Wholesalers you buy from. Inventory items pick from this list, then store SKU, pack, and price on the product."
	/>

	<div class="stack">
		<Card
			title={formTitle}
			subtitle={editingId
				? "Name and website belong to the supplier. Product SKU stays on the inventory item."
				: "Add LWC, Hills Prospect, or whoever you buy from."}
		>
			<form class="add" onsubmit={onSave}>
				<Field label="Name" for="supplier-name">
					<TextField
						id="supplier-name"
						bind:value={name}
						placeholder="LWC Drinks"
						required
					/>
				</Field>
				<Field label="Website" for="supplier-website">
					<TextField
						id="supplier-website"
						bind:value={website}
						placeholder="https://www.lwc-drinks.co.uk"
						autocomplete="url"
					/>
				</Field>
				<Field label="Notes" for="supplier-notes">
					<TextArea
						id="supplier-notes"
						rows={2}
						bind:value={notes}
						placeholder="Account number, delivery day, who to call."
					/>
				</Field>
				<div class="actions">
					{#if editingId}
						<Button variant="ghost" type="button" onclick={resetForm}>
							Cancel
						</Button>
					{/if}
					<Button type="submit" variant="primary" busy={saving}>
						{editingId ? "Save" : "Add"}
					</Button>
				</div>
			</form>
			{#if error}
				<p class="error">{error}</p>
			{/if}
		</Card>

		<Card title="List" subtitle="{suppliers.length} on the books">
			{#if !loading && suppliers.length === 0}
				<p class="muted">No suppliers yet. Add one above.</p>
			{:else if !loading}
				<ul class="list" in:fly={{ y: 10, duration: flyMs, easing: easeOut }}>
					{#each suppliers as row (row.id)}
						<li class="row" class:on={String(row.id) === editingId}>
							<button
								type="button"
								class="copy"
								onclick={() => startEdit(row)}
							>
								<span class="name">{row.name}</span>
								<span class="meta">
									{#if row.website}
										{hostLabel(row.website)}
									{:else}
										No website
									{/if}
									<span class="dot">·</span>
									{row.itemCount || 0}
									{(row.itemCount || 0) === 1 ? "item" : "items"}
								</span>
								{#if row.notes}
									<span class="notes">{row.notes}</span>
								{/if}
							</button>
							<div class="row-actions">
								{#if row.website}
									<a
										class="open"
										href={row.website}
										target="_blank"
										rel="noreferrer"
									>
										Open
									</a>
								{/if}
								<Button
									variant="ghost"
									size="sm"
									disabled={busyId === String(row.id)}
									onclick={() => onRemove(row)}
									aria-label="Remove {row.name}"
								>
									{#snippet icon()}
										<Icon name="trash" size={16} />
									{/snippet}
								</Button>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</Card>
	</div>

	<BusyOverlay active={loading} label="Loading…" />
</div>

<style>
	.page {
		position: relative;
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: var(--page-gutter);
	}

	.stack {
		display: grid;
		gap: var(--gap-lg);
		max-width: 44rem;
		align-content: start;
	}

	.add {
		display: grid;
		gap: var(--gap-md);
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.4rem;
	}

	.error {
		margin: var(--gap-sm) 0 0;
		color: var(--destructive, #c97a7a);
		font-size: var(--text-sm);
	}

	.muted {
		margin: 0;
		color: var(--muted-foreground);
		font-size: var(--text-sm);
	}

	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.15rem;
	}

	.row {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.45rem 0.2rem;
		border-bottom: 1px solid var(--border);
	}

	.row:last-child {
		border-bottom: 0;
	}

	.row.on .name {
		color: var(--primary);
	}

	.copy {
		display: grid;
		gap: 0.12rem;
		min-width: 0;
		margin: 0;
		padding: 0.2rem 0;
		border: 0;
		background: none;
		color: inherit;
		text-align: left;
		cursor: pointer;
	}

	.name {
		font-weight: 600;
		overflow-wrap: anywhere;
	}

	.meta,
	.notes {
		font-size: var(--text-sm);
		color: var(--muted-foreground);
	}

	.notes {
		overflow-wrap: anywhere;
	}

	.dot {
		margin: 0 0.15rem;
	}

	.row-actions {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		flex-shrink: 0;
		padding-top: 0.15rem;
	}

	.open {
		font-size: var(--text-sm);
		color: var(--muted-foreground);
		text-decoration: none;
	}

	.open:hover {
		color: var(--foreground);
	}
</style>
