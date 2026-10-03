<script lang="ts">
	import { onMount } from "svelte";
	import { fly } from "svelte/transition";
	import {
		BusyOverlay,
		Button,
		Card,
		PageHeader,
		PageHelp,
		TextField,
	} from "../ui";
	import {
		createPosMenu,
		deletePosMenu,
		getMenu,
		updatePosMenu,
	} from "../app/api";
	import { toast } from "../ui/toast.svelte";
	import { easeOut, flyMs } from "../ui/motion";
	import { collectMenuItems } from "./lightspeed-stock.js";
	import type { MenuItem, PosMenu } from "../menu/types";
	import { MENUS_HELP } from "./lightspeed-help";

	let menus = $state<PosMenu[]>([]);
	let items = $state<MenuItem[]>([]);
	let loading = $state(true);
	let saving = $state(false);
	let error = $state("");
	let name = $state("");
	let makeDefault = $state(false);
	let busyId = $state("");
	let renameId = $state("");
	let renameValue = $state("");

	const counts = $derived(countByMenu(items));

	onMount(() => {
		void reload();
	});

	function countByMenu(rows: MenuItem[]) {
		const map = new Map<string, number>();
		for (const item of rows) {
			for (const menu of item.posMenus || []) {
				const id = String(menu.id);
				map.set(id, (map.get(id) || 0) + 1);
			}
		}
		return map;
	}

	async function reload() {
		loading = true;
		error = "";
		try {
			const data = await getMenu();
			menus = data.posMenus || [];
			items = collectMenuItems(data.sections || []) as MenuItem[];
		} catch (err) {
			error = err instanceof Error ? err.message : "Could not load POS menus.";
		} finally {
			loading = false;
		}
	}

	async function onAdd(event: Event) {
		event.preventDefault();
		saving = true;
		error = "";
		try {
			const data = await createPosMenu({
				name: name.trim(),
				isDefault: makeDefault,
			});
			const next = data.posMenu;
			menus = next.isDefault
				? [next, ...menus.map((row) => ({ ...row, isDefault: false }))]
				: [...menus, next];
			name = "";
			makeDefault = false;
			toast.ok("Menu added.");
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Could not add that menu.";
			error = message;
			toast.error(message);
		} finally {
			saving = false;
		}
	}

	async function onDefault(menu: PosMenu) {
		if (menu.isDefault) return;
		busyId = menu.id;
		try {
			const data = await updatePosMenu(menu.id, { isDefault: true });
			menus = menus.map((row) => ({
				...row,
				isDefault: row.id === data.posMenu.id,
			}));
			toast.ok(`${data.posMenu.name} is the default for new drinks.`);
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Could not set the default.",
			);
		} finally {
			busyId = "";
		}
	}

	function startRename(menu: PosMenu) {
		renameId = menu.id;
		renameValue = menu.name;
	}

	async function saveRename(menu: PosMenu) {
		const next = renameValue.trim();
		if (!next || next === menu.name) {
			renameId = "";
			return;
		}
		busyId = menu.id;
		try {
			const data = await updatePosMenu(menu.id, { name: next });
			menus = menus.map((row) =>
				row.id === data.posMenu.id ? { ...row, name: data.posMenu.name } : row,
			);
			renameId = "";
			toast.ok("Menu renamed.");
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Could not rename that menu.",
			);
		} finally {
			busyId = "";
		}
	}

	async function onRemove(menu: PosMenu) {
		if (!window.confirm(`Remove ${menu.name} from ops? Drinks stay; they just drop this menu.`)) {
			return;
		}
		busyId = menu.id;
		try {
			await deletePosMenu(menu.id);
			const leftover = menus.filter((row) => row.id !== menu.id);
			if (menu.isDefault && leftover[0] && !leftover[0].isDefault) {
				leftover[0] = { ...leftover[0], isDefault: true };
			}
			menus = leftover;
			toast.ok("Menu removed.");
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Could not remove that menu.",
			);
		} finally {
			busyId = "";
		}
	}
</script>

<div class="page scrollbar-fade">
	<PageHeader
		title="POS menus"
	>
		{#snippet actions()}
			<PageHelp title="POS menus" topics={MENUS_HELP} />
		{/snippet}
	</PageHeader>

	<div class="stack">
		<Card
			title="Add menu"
		>
			<form class="add" onsubmit={onAdd}>
				<label class="field">
					<span class="label">Name</span>
					<TextField bind:value={name} placeholder="Live menu" required />
				</label>
				<label class="default">
					<input type="checkbox" bind:checked={makeDefault} />
					Default for new drinks
				</label>
				<div class="actions">
					<Button type="submit" variant="primary" busy={saving} disabled={!name.trim()}>
						Add
					</Button>
				</div>
			</form>
			{#if error}
				<p class="error">{error}</p>
			{/if}
		</Card>

		<Card title="Menus" subtitle="{menus.length} in ops">
			{#if !loading && menus.length === 0}
				<p class="muted">No POS menus yet.</p>
			{:else if !loading}
				<ul class="list" in:fly={{ y: 10, duration: flyMs, easing: easeOut }}>
					{#each menus as menu (menu.id)}
						<li class="row">
							<div class="copy">
								{#if renameId === menu.id}
									<TextField
										size="sm"
										bind:value={renameValue}
										onkeydown={(event: KeyboardEvent) => {
											if (event.key === "Enter") {
												event.preventDefault();
												void saveRename(menu);
											}
											if (event.key === "Escape") renameId = "";
										}}
									/>
								{:else}
									<span class="name">{menu.name}</span>
								{/if}
								<span class="meta">
									{counts.get(menu.id) || 0}
									{(counts.get(menu.id) || 0) === 1 ? "drink" : "drinks"}
									{#if menu.isDefault}
										· Default
									{/if}
								</span>
							</div>
							<div class="row-actions">
								{#if renameId === menu.id}
									<Button
										variant="primary"
										size="sm"
										busy={busyId === menu.id}
										onclick={() => void saveRename(menu)}
									>
										Save
									</Button>
									<Button variant="ghost" size="sm" onclick={() => (renameId = "")}>
										Cancel
									</Button>
								{:else}
									{#if !menu.isDefault}
										<Button
											variant="outline"
											size="sm"
											disabled={busyId === menu.id}
											onclick={() => void onDefault(menu)}
										>
											Make default
										</Button>
									{/if}
									<Button
										variant="ghost"
										size="sm"
										disabled={busyId === menu.id}
										onclick={() => startRename(menu)}
									>
										Rename
									</Button>
									<Button
										variant="ghost"
										size="sm"
										disabled={busyId === menu.id}
										onclick={() => void onRemove(menu)}
									>
										Remove
									</Button>
								{/if}
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</Card>
	</div>

	<BusyOverlay active={loading} label="Loading POS menus…" />
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
		gap: var(--space-6);
		max-width: 40rem;
		align-content: start;
	}

	.add {
		display: grid;
		gap: var(--space-4);
	}

	.field,
	.default {
		display: grid;
		gap: var(--space-1);
	}

	.label {
		font-size: var(--text-sm);
		color: var(--muted-foreground);
	}

	.default {
		grid-template-columns: auto 1fr;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-sm);
	}

	.actions {
		display: flex;
		justify-content: flex-end;
	}

	.error {
		margin: 0;
		color: var(--danger);
		font-size: var(--text-sm);
	}

	.muted {
		margin: 0;
		color: var(--muted-foreground);
		font-size: var(--text-sm);
	}

	.list {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: 0.15rem;
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-3) 0;
		border-bottom: 1px solid var(--border);
	}

	.row:last-child {
		border-bottom: 0;
	}

	.copy {
		display: grid;
		gap: 0.15rem;
		min-width: 0;
		flex: 1 1 10rem;
	}

	.name {
		font-size: var(--text-base);
	}

	.meta {
		font-size: var(--text-xs);
		color: var(--muted-foreground);
	}

	.row-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}
</style>
