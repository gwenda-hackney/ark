<script lang="ts">
	import { SearchField } from "../../ui";
	import type { MenuItem, MenuSection } from "../../lib/types";

	let {
		sections,
		selectedId,
		query = $bindable(""),
		onselect,
	}: {
		sections: MenuSection[];
		selectedId: string | null;
		query?: string;
		onselect: (item: MenuItem | null) => void;
	} = $props();

	const chapters = $derived(sections.filter((s) => !s.parentId));

	const childrenByParent = $derived.by(() => {
		const map = new Map<string, MenuSection[]>();
		for (const section of sections) {
			if (!section.parentId) continue;
			const list = map.get(section.parentId) || [];
			list.push(section);
			map.set(section.parentId, list);
		}
		return map;
	});

	const q = $derived(query.trim().toLowerCase());

	function match(item: MenuItem) {
		return !q || String(item.name || "").toLowerCase().includes(q);
	}

	const matchCount = $derived(
		sections.reduce(
			(n, s) => n + (s.items || []).filter(match).length,
			0,
		),
	);
</script>

<aside class="side">
	<div class="search">
		<SearchField bind:value={query} placeholder="Search drinks" ariaLabel="Search drinks" width="100%" count={q ? matchCount : undefined} />
	</div>
	<nav class="nav" aria-label="Drinks">
		{#each chapters as chapter (chapter._id)}
			{@const subs = childrenByParent.get(chapter._id) || []}
			{@const blocks = [
				{ section: chapter, items: (chapter.items || []).filter(match) },
				...subs.map((sub) => ({
					section: sub,
					items: (sub.items || []).filter(match),
				})),
			]}
			{@const bodyEmpty = blocks.every((b) => !b.items.length)}
			{#if !(q && bodyEmpty)}
				<section class="chapter">
					<h2>{chapter.title || "Untitled"}</h2>
					{#each blocks as block (block.section._id)}
						{#if block.items.length || !q}
							{#if block.section._id !== chapter._id}
								<p class="section-title">{block.section.title}</p>
							{/if}
							{#each block.items as item (item._id)}
								<button
									type="button"
									class="item"
									class:on={item._id === selectedId}
									onclick={() => onselect(item)}
								>
									<span class="name">{item.name}</span>
									{#if item.price}
										<small>£{item.price}</small>
									{/if}
								</button>
							{/each}
						{/if}
					{/each}
				</section>
			{/if}
		{/each}
	</nav>
</aside>

<style>
	.side {
		display: flex;
		flex-direction: column;
		min-height: 0;
		height: 100%;
		border-right: 1px solid var(--border);
		background: var(--card);
	}

	.search {
		padding: var(--gap-sm) var(--gap-sm) 0;
	}

	.nav {
		flex: 1;
		min-height: 0;
		overflow: auto;
		padding: var(--gap-sm);
	}

	.chapter {
		margin: 0 0 var(--gap);
	}

	.chapter h2 {
		margin: 0 0 0.4rem;
		font-family: var(--font);
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--primary);
	}

	.section-title {
		margin: 0.45rem 0 0.2rem;
		font-size: 0.75rem;
		color: var(--muted-foreground);
	}

	.item {
		display: block;
		width: 100%;
		text-align: left;
		border: 0;
		border-radius: var(--radius-sm);
		background: transparent;
		padding: 0.45rem 0.55rem;
		color: var(--foreground);
		transition: background-color var(--t-fast) var(--ease-in-out);
	}

	.item:hover {
		background: var(--accent);
	}

	.item.on {
		background: var(--primary-wash);
		color: var(--primary);
	}

	.name {
		display: block;
		font-size: 0.8125rem;
		font-weight: 500;
	}

	small {
		display: block;
		color: var(--muted-foreground);
		font-size: 0.75rem;
	}
</style>
