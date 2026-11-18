<script lang="ts">
	/**
	 * A menu's items on its page (#305), section by section in the order
	 * guests see them, each a link to the item. Items are added and moved on
	 * the Items page (a section, or a print or website placement, puts one here).
	 */
	import { menuItemPath, menuListPath, navigate } from "../app/nav";
	import { sectionPathLabel } from "./menu-sections.js";
	import { formatPrices, type MenuItemGroup } from "./types";

	let { groups }: { groups: MenuItemGroup[] } = $props();

	function open(event: MouseEvent, href: string) {
		if (event.button !== 0) return;
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
		event.preventDefault();
		navigate(href);
	}
</script>

{#if groups.length}
	<div class="groups">
		{#each groups as group (group.sectionId)}
			<section class="group" aria-label={sectionPathLabel(group)}>
				<h3 class="group-name">
					{sectionPathLabel(group)}
					<span class="count tnum">{group.items.length}</span>
				</h3>
				<ul class="items">
					{#each group.items as item (item.id)}
						{@const href = menuItemPath(item.name)}
						{@const price = formatPrices(item)}
						<li>
							<a class="item" {href} onclick={(event) => open(event, href)}>
								<span class="text">
									<span class="name">{item.name}</span>
									{#if item.description}<span class="description">{item.description}</span>{/if}
								</span>
								{#if price}<span class="price tnum">{price}</span>{/if}
							</a>
						</li>
					{/each}
				</ul>
			</section>
		{/each}
	</div>
{:else}
	<p class="muted">
		No items on this menu yet. Put an item in one of its sections on the
		<a href={menuListPath()} onclick={(event) => open(event, menuListPath())}>Items</a> page.
	</p>
{/if}

<style>
	.groups {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 22rem), 1fr));
		gap: var(--space-3);
		align-items: start;
	}

	.group {
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--panel-bg);
		padding: var(--space-3) var(--space-3) var(--space-2);
	}

	.group-name {
		margin: 0 0 var(--space-2);
		padding: 0 var(--space-2);
		font-family: var(--font);
		font-size: var(--text-base);
		font-weight: 600;
		line-height: var(--leading-base);
	}

	.count {
		margin-left: var(--space-2);
		font-size: var(--text-sm);
		font-weight: 400;
		color: var(--fg-muted);
	}

	.items {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
	}

	.item {
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
		padding: var(--space-2);
		border-radius: var(--radius-md);
		color: inherit;
		text-decoration: none;
	}

	.item:hover,
	.item:focus-visible {
		background: var(--surface-3);
	}

	.text {
		flex: 1;
		min-width: 0;
		display: grid;
	}

	.name {
		font-size: var(--text-sm);
		font-weight: 500;
	}

	.description {
		font-size: var(--text-sm);
		color: var(--fg-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.price {
		flex-shrink: 0;
		font-size: var(--text-sm);
		color: var(--fg-muted);
	}

	.muted {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--fg-muted);
	}
</style>
