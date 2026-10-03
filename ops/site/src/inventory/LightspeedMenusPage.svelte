<script lang="ts">
	import { Icon } from "../app/shell";
	import { onMount } from "svelte";
	import { fly } from "svelte/transition";
	import {
		BusyOverlay,
		Button,
		Card,
		Confirm,
		ConfirmDialog,
		Field,
		PageHeader,
		PageHelp,
		Switch,
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

	const confirm = new Confirm();

	async function onRemove(menu: PosMenu) {
		const ok = await confirm.ask({
			title: `Remove ${menu.name}?`,
			message: "It comes off the list in ops. Drinks stay; they just drop this menu. Lightspeed isn't changed.",
			action: "Remove",
		});
		if (!ok) return;
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
		<Card title="Add menu" class="add-card">
			<form class="add" onsubmit={onAdd}>
				<Field label="Name" for="pos-menu-name" width="lg">
					<TextField id="pos-menu-name" bind:value={name} placeholder="Live menu" />
				</Field>
				<Switch bind:checked={makeDefault} label="Default for new drinks" />
				<div class="actions">
					<Button
						type="submit"
						variant="primary"
						busy={saving}
						disabled={!name.trim()}
						reason={name.trim() ? undefined : "Type a name first"}
					>
						{#snippet icon()}<Icon name="plus" size={16} />{/snippet}
						Add
					</Button>
				</div>
			</form>
			{#if error}
				<p class="error">{error}</p>
			{/if}
		</Card>

		<Card title="Menus" subtitle="{menus.length} in ops" class="menus-card">
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
										{#snippet icon()}<Icon name="save" size={14} />{/snippet}
										Save
									</Button>
									<Button variant="ghost" size="sm" onclick={() => (renameId = "")}>
										{#snippet icon()}<Icon name="close" size={14} />{/snippet}
										Cancel
									</Button>
								{:else}
									<Button
										variant="outline"
										size="sm"
										disabled={busyId === menu.id || menu.isDefault}
										reason={menu.isDefault ? "Already the default" : undefined}
										onclick={() => void onDefault(menu)}
									>
										{#snippet icon()}<Icon name="star" size={14} />{/snippet}
										Make default
									</Button>
									<Button
										variant="ghost"
										size="sm"
										disabled={busyId === menu.id}
										onclick={() => startRename(menu)}
									>
										{#snippet icon()}<Icon name="pen" size={14} />{/snippet}
										Rename
									</Button>
									<Button
										variant="ghost"
										size="sm"
										disabled={busyId === menu.id}
										onclick={() => void onRemove(menu)}
									>
										{#snippet icon()}<Icon name="trash" size={14} />{/snippet}
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

<ConfirmDialog {confirm} />

<style>
	.page {
		position: relative;
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: var(--page-gutter);
	}

	/* The menus list takes the wide column, Add menu the narrow one. */
	.stack {
		display: grid;
		grid-template-columns: minmax(0, 2fr) minmax(18rem, 1fr);
		grid-template-areas: "menus add";
		gap: var(--space-6);
		align-items: start;
	}

	.stack :global(.add-card) {
		grid-area: add;
	}

	.stack :global(.menus-card) {
		grid-area: menus;
	}

	@media (max-width: 1100px) {
		.stack {
			grid-template-columns: minmax(0, 1fr);
			grid-template-areas: "add" "menus";
		}
	}

	.add {
		display: grid;
		gap: var(--space-4);
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
