<script lang="ts">
	/**
	 * Phone tab strip: the pages of the current bottom tab, along the top of
	 * the content pane. Links, not a tablist: each tab is a page with its own URL.
	 */
	import type { PageGroup } from "../mobile-nav";
	import type { NavRoute } from "./types";

	let {
		label,
		groups,
		active = null,
		badge = null,
		onnavigate,
	}: {
		/** Bottom tab name, for the landmark ("Service pages"). */
		label: string;
		groups: PageGroup[];
		active?: NavRoute | null;
		/** Website count, shown on the page with `badge: "website"`. */
		badge?: { tone: string; count: number; title: string } | null;
		onnavigate: (event: MouseEvent, href: string) => void;
	} = $props();

	let list = $state<HTMLElement | null>(null);

	/** Keep the current tab in view, centred where there is room. */
	$effect(() => {
		void active?.id;
		void groups;
		const el = list;
		if (!el) return;
		const current = el.querySelector<HTMLElement>('[aria-current="page"]');
		if (!current) return;
		const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
		const left = current.offsetLeft - (el.clientWidth - current.offsetWidth) / 2;
		el.scrollTo({ left: Math.max(0, left), behavior: reduce ? "auto" : "smooth" });
	});
</script>

<nav class="section-tabs" aria-label={`${label} pages`}>
	<ul bind:this={list}>
		{#each groups as group, index (group.id)}
			{#if index > 0}
				<li class="divider" aria-hidden="true"></li>
			{/if}
			{#each group.pages as page (page.id)}
				{@const on = active?.id === page.id}
				{@const href = page.path || "/"}
				<li>
					<a
						class="tab"
						class:on
						{href}
						aria-current={on ? "page" : undefined}
						onclick={(e) => onnavigate(e, href)}
					>
						{page.short || page.name}
						{#if page.badge === "website" && badge}
							<span class="badge pill-text {badge.tone}" title={badge.title} aria-label={badge.title}>
								{badge.tone === "failed" ? "!" : badge.count}
							</span>
						{/if}
					</a>
				</li>
			{/each}
		{/each}
	</ul>
</nav>

<style>
	.section-tabs {
		flex-shrink: 0;
		position: relative;
		z-index: 5;
		border-bottom: 1px solid var(--border);
		background: var(--background);
	}

	ul {
		display: flex;
		align-items: stretch;
		gap: var(--space-1);
		height: 2.75rem;
		margin: 0;
		padding: 0 var(--page-gutter);
		list-style: none;
		overflow-x: auto;
		overscroll-behavior-x: contain;
		scroll-snap-type: x proximity;
		scroll-padding-inline: var(--page-gutter);
		scrollbar-width: none;
	}

	ul::-webkit-scrollbar {
		display: none;
	}

	li {
		display: flex;
		flex-shrink: 0;
		scroll-snap-align: start;
	}

	.divider {
		align-self: center;
		width: 1px;
		height: 1rem;
		margin: 0 var(--space-1);
		background: var(--border-strong);
	}

	.tab {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: 0 var(--space-2);
		color: var(--muted-foreground);
		font-size: var(--text-base);
		font-weight: 500;
		white-space: nowrap;
		text-decoration: none;
	}

	.tab:hover {
		color: var(--foreground);
	}

	.tab.on {
		color: var(--foreground);
		font-weight: 600;
	}

	.tab.on::after {
		content: "";
		position: absolute;
		left: var(--space-2);
		right: var(--space-2);
		bottom: 0;
		height: 2px;
		border-radius: 1px;
		background: var(--primary);
	}

	.tab:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: -2px;
		border-radius: var(--radius-md);
	}

	.badge {
		display: inline-grid;
		place-items: center;
		min-width: 1.125rem;
		height: 1.125rem;
		padding: 0 var(--space-1);
		border-radius: var(--radius-pill);
		background: var(--primary);
		color: var(--primary-foreground);
		font-size: var(--text-2xs);
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		font-feature-settings: var(--font-features-num);
		line-height: 1;
	}

	.badge.updating {
		background: var(--primary-wash-strong, var(--primary-wash));
		color: var(--primary);
	}

	.badge.failed {
		background: var(--destructive);
		color: var(--danger-foreground);
	}
</style>
