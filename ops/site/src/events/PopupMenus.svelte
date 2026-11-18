<script lang="ts">
	/**
	 * A pop-up kitchen's menus (#305), on its own Menus tab: each with its days,
	 * dates and status, and Open menu. Add menu starts one on Menu → Menus
	 * with the pop-up's name, nights and cooking days filled in. Events read
	 * menus only through the menu module's contract (/api/events/:id/menus,
	 * popup-menus.js).
	 */
	import { Badge, Button, FormSection } from "../ui";
	import { Icon } from "../app/shell";
	import { getPopupMenus, type PopupMenu } from "../app/api";
	import { menuPagePath, navigate, newMenuPath } from "../app/nav";

	let { eventId }: { eventId: string } = $props();

	const TONES = { on: "success", coming: "info", ended: "neutral" } as const;

	let menus = $state<PopupMenu[]>([]);
	let loading = $state(true);
	let error = $state("");

	async function load(id: string) {
		try {
			loading = true;
			error = "";
			menus = (await getPopupMenus(id)).menus || [];
		} catch (err) {
			error = err instanceof Error ? err.message : "Couldn't load its menus.";
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (eventId) void load(eventId);
	});
</script>

<FormSection title="Menus" description="What this pop-up serves, and on which days.">
	{#snippet actions()}
		<Button variant="outline" size="sm" type="button" disabled={!eventId} onclick={() => navigate(newMenuPath(eventId))}>
			{#snippet icon()}<Icon name="plus" size={14} />{/snippet}
			Add menu
		</Button>
	{/snippet}
	{#if error}
		<p class="note error">{error}</p>
	{:else if loading && !menus.length}
		<p class="note">Loading its menus…</p>
	{:else if !menus.length}
		<p class="note">No menu yet. Add one and it starts with this pop-up's dates and days.</p>
	{:else}
		<ul class="menus">
			{#each menus as menu (menu.id)}
				<li class="menu">
					<span class="what">
						<span class="name">{menu.name} · {menu.daysLabel}</span>
						<span class="dates">{menu.datesLabel}</span>
					</span>
					<Badge tone={TONES[menu.status]} label={menu.statusLabel} />
					<Button variant="ghost" size="sm" type="button" onclick={() => navigate(menuPagePath(menu.id))}>
						Open menu
						{#snippet trailing()}<Icon name="chevron-right" size={14} />{/snippet}
					</Button>
				</li>
			{/each}
		</ul>
	{/if}
</FormSection>

<style>
	.menus {
		display: grid;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.menu {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--panel-bg);
	}

	.what {
		display: grid;
		flex: 1;
		min-width: 0;
		gap: 0.1rem;
	}

	.name {
		font-weight: 500;
		color: var(--fg);
	}

	.dates {
		font-size: var(--text-xs);
		color: var(--fg-muted);
	}

	.note {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--fg-muted);
	}

	.note.error {
		color: var(--danger);
	}
</style>
