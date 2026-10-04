<script lang="ts">
	import type { PosMenu } from "./types";

	let {
		menus = [],
		value = [],
		onchange,
	}: {
		menus?: PosMenu[];
		value?: PosMenu[];
		onchange: (next: PosMenu[]) => void;
	} = $props();

	const selectedIds = $derived(new Set((value || []).map((row) => String(row.id))));

	function toggle(menu: PosMenu) {
		const id = String(menu.id);
		const next = selectedIds.has(id)
			? (value || []).filter((row) => String(row.id) !== id)
			: [...(value || []), menu];
		onchange(next);
	}
</script>

{#if !menus.length}
	<p class="hint">
		Add menus on Lightspeed · Menus. New drinks pick the default (Fall 2026).
	</p>
{:else}
	<div class="chips" role="group" aria-label="POS menus">
		{#each menus as menu (menu.id)}
			<button
				type="button"
				class="chip"
				class:on={selectedIds.has(String(menu.id))}
				aria-pressed={selectedIds.has(String(menu.id))}
				onclick={() => toggle(menu)}
			>
				{menu.name}
				{#if menu.isDefault}
					<span class="hint-inline">Default</span>
				{/if}
			</button>
		{/each}
	</div>
{/if}

<style>
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		margin: 0;
		padding: var(--space-1) var(--space-3);
		border: 1px solid var(--input);
		border-radius: var(--radius-pill);
		background: var(--sunken);
		color: var(--muted-foreground);
		font-size: var(--text-sm);
		line-height: 1.2;
		cursor: pointer;
	}

	.chip:hover {
		border-color: var(--border-strong);
		color: var(--foreground);
	}

	.chip.on {
		border-color: var(--ring);
		background: var(--primary-wash);
		color: var(--foreground);
	}

	.hint-inline {
		font-size: var(--text-xs);
		color: var(--muted-foreground);
	}

	.hint {
		margin: var(--space-2) 0 0;
		font-size: var(--text-xs);
		color: var(--muted-foreground);
	}
</style>
