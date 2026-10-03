<script lang="ts">
	/**
	 * Ops chrome: collapsible icon rail, fixed top bar, one scrolling content pane.
	 * Viewport never scrolls — only `.content` does.
	 */
	import type { Snippet } from "svelte";
	import { onMount } from "svelte";
	import Icon from "./Icon.svelte";
	import SectionTabs from "./SectionTabs.svelte";
	import type { NavRoute } from "./types";
	import type { AuthMe } from "../api";
	import {
		interceptClientNav,
		listen,
		navigate,
		parseShellPath,
		readPath,
		shellCrumbs,
		syncCanonicalUrl,
	} from "../nav";
	import { activeNavOverride, crumbLeaf } from "../../ui/crumbs.svelte";
	import {
		backToMore,
		firstPage,
		hideShellChrome,
		lastPage,
		mobileTabFor,
		mobileTabs,
		MORE_PATH,
		readLastPages,
		rememberPage,
		stripGroups,
		type LastPages,
		type MobileTabId,
	} from "../mobile-nav";
	import { flattenNavRoutes, matchActiveRoute, navGroupContains, visibleRoutes } from "../nav-tree";
	import { startSitePendingPolling, websiteBadge } from "../../website/site-pending.svelte";
	import { startWebsiteJobs } from "../../events/website-jobs.svelte";
	import WebsiteJobsTray from "./WebsiteJobsTray.svelte";
	import AccountMenu from "./AccountMenu.svelte";
	import { SHELL_MOBILE_QUERY, mediaMatches } from "../../ui/viewport.svelte";

	const RAIL_KEY = "ops.rail";
	const GROUP_KEY = "ops.nav.groups";

	let {
		routes,
		brandTitle = "Gwenda",
		brandSubtitle = "Operations",
		path = $bindable("/"),
		me = null,
		children,
	}: {
		routes: NavRoute[];
		/** Checked in main.ts before mount, so the banner and admin items are there on first paint. */
		me?: AuthMe | null;
		brandTitle?: string;
		brandSubtitle?: string;
		path?: string;
		children: Snippet<[{ path: string; active: NavRoute | null }]>;
	} = $props();

	function readRail(): boolean {
		try {
			// Default open; only collapse when the user has closed it.
			return localStorage.getItem(RAIL_KEY) !== "closed";
		} catch {
			return true;
		}
	}

	function readExpandedGroups(): Record<string, boolean> {
		try {
			const raw = localStorage.getItem(GROUP_KEY);
			if (!raw) return { stock: true, menu: true, lightspeed: true };
			const parsed = JSON.parse(raw) as Record<string, boolean>;
			return parsed && typeof parsed === "object"
				? { stock: true, menu: true, lightspeed: true, ...parsed }
				: { stock: true, menu: true, lightspeed: true };
		} catch {
			return { stock: true, menu: true, lightspeed: true };
		}
	}

	/** Expanded by default — labels visible unless the user collapses the rail. */
	let open = $state(readRail());
	let expandedGroups = $state<Record<string, boolean>>(readExpandedGroups());
	/** Last page used per bottom tab, so the bar returns there. */
	let lastPages = $state<LastPages>(readLastPages());
	const phone = mediaMatches(SHELL_MOBILE_QUERY);

	const envDetail = $derived(
		!me
			? ""
			: [
					me.envLabel,
					me.databaseId ? `Baserow DB ${me.databaseId}` : "Baserow DB not reachable",
					me.databaseLabel,
				].join(" · "),
	);
	const envBannerText = $derived(
		!me
			? ""
			: me.risk
				? `${me.envLabel} is using ${me.databaseLabel}. Check this before you edit.`
				: me.siteEnv === "local"
				? `Local · edits go to Baserow DB ${me.databaseId || "?"} (${me.databaseLabel}), not production.`
				: `${me.envLabel} · Baserow DB ${me.databaseId || "?"} (${me.databaseLabel}).`,
	);

	onMount(() => {
		const stopPending = startSitePendingPolling();
		const stopJobs = startWebsiteJobs();
		return () => {
			stopPending();
			stopJobs();
		};
	});

	const shownRoutes = $derived(visibleRoutes(routes, Boolean(me?.isAdmin)));
	const badge = $derived(websiteBadge());

	function badgeTitle(tone: string, count: number): string {
		if (tone === "failed") return "The website didn't update. Open Website for details.";
		if (tone === "updating") return "The website is updating.";
		return count === 1
			? "1 change will appear on the website soon."
			: `${count} changes will appear on the website soon.`;
	}

	const editorChrome = $derived(hideShellChrome(path));
	const printBook = $derived(Boolean(parseShellPath(path).print));
	const showTabs = $derived(phone.matches && !editorChrome);
	const showTopbar = $derived(!printBook && !phone.matches);
	/**
	 * Which copy of ops this is, said once. Desktop: a thin strip on any copy
	 * that is not production. Phones: only when the pairing is risky; the
	 * More page shows the details the rest of the time.
	 */
	const showEnvBanner = $derived(
		!printBook &&
			Boolean(me && (me.risk || (!phone.matches && me.siteEnv !== "production"))),
	);

	const active = $derived(
		(activeNavOverride.id &&
			flattenNavRoutes(routes).find((route) => route.id === activeNavOverride.id)) ||
			matchActiveRoute(routes, path),
	);
	const tabs = $derived(mobileTabs(shownRoutes));
	const currentTab = $derived(mobileTabFor(path, routes));
	/** Phone tab strip for the current tab's pages. Editors keep their own tabs. */
	const strip = $derived(showTabs ? stripGroups(currentTab, shownRoutes) : []);
	const stripLabel = $derived(tabs.find((row) => row.id === currentTab)?.label || "");
	const showBackToMore = $derived(showTabs && backToMore(path, routes));
	/** The strip names the page, so PageHeader can drop its visible title. */
	const titleInStrip = $derived(
		strip.length > 0 && active?.path === (path.split("?")[0] || "/"),
	);

	const mark = $derived(brandTitle.trim().charAt(0).toUpperCase() || "G");

	const crumbs = $derived(
		shellCrumbs(path, {
			homeLabel: brandSubtitle,
			sectionLabel: active?.name || "",
			sectionHref: active?.path || "",
			leaf: crumbLeaf.value,
		}),
	);

	function go(next: string): void {
		navigate(next);
		path = readPath();
	}

	function isModifiedClick(event: MouseEvent): boolean {
		return (
			event.metaKey ||
			event.ctrlKey ||
			event.shiftKey ||
			event.altKey ||
			event.button !== 0
		);
	}

	function onLeafClick(event: MouseEvent, href: string): void {
		if (isModifiedClick(event) || !href) return;
		event.preventDefault();
		go(href);
	}

	function collapsedGroupHref(item: NavRoute): string {
		if (item.id === "lightspeed") return "/lightspeed";
		const child = item.children?.find((row) => row.path);
		return child?.path || "/";
	}

	function isGroupExpanded(id: string): boolean {
		return expandedGroups[id] !== false;
	}

	function persistGroups(): void {
		try {
			localStorage.setItem(GROUP_KEY, JSON.stringify(expandedGroups));
		} catch {
			/* ignore quota / private mode */
		}
	}

	function toggleGroup(id: string): void {
		expandedGroups = {
			...expandedGroups,
			[id]: !isGroupExpanded(id),
		};
		persistGroups();
	}

	function tabHref(id: MobileTabId): string {
		return lastPage(id, shownRoutes, lastPages);
	}

	/** Tapping the tab you are on goes to its first page, then back to the top. */
	function onTab(id: MobileTabId, event: MouseEvent): void {
		if (isModifiedClick(event)) return;
		event.preventDefault();
		if (id !== currentTab) {
			go(tabHref(id));
			return;
		}
		const first = firstPage(id, shownRoutes);
		if ((path.split("?")[0] || "/") !== first) {
			go(first);
			return;
		}
		scrollContentToTop();
	}

	let contentEl = $state<HTMLElement | null>(null);

	/** Pages scroll their own inner pane, so reset whichever one has moved. */
	function scrollContentToTop(): void {
		if (!contentEl) return;
		const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
		for (const el of contentEl.querySelectorAll<HTMLElement>("*")) {
			if (el.scrollTop > 0) el.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
		}
	}

	function toggleRail(): void {
		open = !open;
		try {
			localStorage.setItem(RAIL_KEY, open ? "open" : "closed");
		} catch {
			/* ignore */
		}
	}

	$effect(() => {
		rememberPage(path, routes);
		lastPages = readLastPages();
	});

	/** Apply before paint so print routes do not flash rail / env banner. */
	$effect.pre(() => {
		if (typeof document === "undefined") return;
		document.documentElement.classList.toggle("print-book", printBook);
	});

	$effect(() => {
		if (typeof window === "undefined") return;
		path = syncCanonicalUrl();
		const onChange = () => {
			path = readPath();
		};
		const stop = listen(onChange);
		window.addEventListener("click", interceptClientNav);
		return () => {
			stop();
			window.removeEventListener("click", interceptClientNav);
		};
	});
</script>

<div
	class="shell"
	class:open
	class:mobile={phone.matches}
	class:has-tabs={showTabs}
	class:has-topbar={showTopbar}
	class:editor={editorChrome}
	class:title-in-strip={titleInStrip}
>
	<aside class="rail" aria-label="Primary">
		<div class="brand">
			<span class="mark" aria-hidden="true">{mark}</span>
			<span class="brand-text">
				<span class="brand-title">{brandTitle}</span>
				<span class="brand-sub">{brandSubtitle}</span>
			</span>
		</div>

		<nav class="nav scrollbar-fade">
			{#snippet navEntry(item: NavRoute)}
				{#if item.heading && item.children?.length}
					<div class="nav-section">
						{#if open}
							<p class="nav-section-label">{item.name}</p>
						{/if}
						{#each item.children as child (child.id)}
							{@render navEntry(child)}
						{/each}
					</div>
				{:else if item.children?.length}
					{@const inGroup = navGroupContains(item, active)}
					{@const groupHref = collapsedGroupHref(item)}
					{@const groupOpen = isGroupExpanded(item.id)}
					<div class="nav-group" class:expanded={groupOpen}>
						{#if open}
							<button
								type="button"
								class="nav-item group-label"
								class:in={inGroup}
								class:open={groupOpen}
								aria-expanded={groupOpen}
								aria-controls={`nav-group-${item.id}`}
								onclick={() => toggleGroup(item.id)}
							>
								<span class="nav-icon"><Icon name={item.icon} size={19} /></span>
								<span class="nav-label">{item.name}</span>
								<span class="group-chevron" aria-hidden="true">
									<Icon name="chevron-right" size={14} />
								</span>
							</button>
							<div
								class="nav-children"
								id={`nav-group-${item.id}`}
								role="group"
								aria-label={item.name}
								aria-hidden={!groupOpen}
								inert={groupOpen ? undefined : true}
							>
								<div class="nav-children-inner">
									{#each item.children as child (child.id)}
										{#if child.children?.length}
											<p class="nav-sub-label">{child.name}</p>
											{#each child.children as leaf (leaf.id)}
												{@const on = active?.id === leaf.id}
												{@const href = leaf.path || "/"}
												<a
													class="nav-item nested deep"
													class:on
													href={href}
													aria-current={on ? "page" : undefined}
													tabindex={groupOpen ? undefined : -1}
													onclick={(e) => onLeafClick(e, href)}
												>
													<span class="nav-label">{leaf.name}</span>
												</a>
											{/each}
										{:else}
										{@const on = active?.id === child.id}
										{@const href = child.path || "/"}
										<a
											class="nav-item nested"
											class:on
											href={href}
											aria-current={on ? "page" : undefined}
											tabindex={groupOpen ? undefined : -1}
											onclick={(e) => onLeafClick(e, href)}
										>
											<span class="nav-label">{child.name}</span>
										</a>
										{/if}
									{/each}
								</div>
							</div>
						{:else}
							<a
								class="nav-item"
								class:on={inGroup}
								href={groupHref}
								aria-current={inGroup ? "true" : undefined}
								aria-haspopup="true"
								onclick={(e) => onLeafClick(e, groupHref)}
							>
								<span class="nav-icon"><Icon name={item.icon} size={19} /></span>
								<span class="nav-label">{item.name}</span>
							</a>
							<nav class="flyout" aria-label={item.name}>
								<div class="flyout-card">
									{#each item.children as child (child.id)}
										{#if child.children?.length}
											<p class="flyout-label">{child.name}</p>
											{#each child.children as leaf (leaf.id)}
												{@const on = active?.id === leaf.id}
												{@const href = leaf.path || "/"}
												<a
													class="flyout-link"
													href={href}
													aria-current={on ? "page" : undefined}
													onclick={(e) => onLeafClick(e, href)}
												>
													<span class="nav-icon"><Icon name={leaf.icon} size={16} /></span>
													{leaf.name}
												</a>
											{/each}
										{:else}
										{@const on = active?.id === child.id}
										{@const href = child.path || "/"}
										<a
											class="flyout-link"
											href={href}
											aria-current={on ? "page" : undefined}
											onclick={(e) => onLeafClick(e, href)}
										>
											<span class="nav-icon"><Icon name={child.icon} size={16} /></span>
											{child.name}
										</a>
										{/if}
									{/each}
								</div>
							</nav>
						{/if}
					</div>
				{:else}
					{@const on = active?.id === item.id}
					{@const href = item.path || "/"}
					<a
						class="nav-item"
						class:on
						href={href}
						aria-current={on ? "page" : undefined}
						onclick={(e) => onLeafClick(e, href)}
					>
						<span class="nav-icon"><Icon name={item.icon} size={19} /></span>
						<span class="nav-label">{item.name}</span>
						{#if item.badge === "website" && badge}
							<span
								class="nav-badge {badge.tone}"
								title={badgeTitle(badge.tone, badge.count)}
								aria-label={badgeTitle(badge.tone, badge.count)}
							>
								{badge.tone === "failed" ? "!" : badge.count}
							</span>
						{/if}
						<span class="tip" aria-hidden="true">{item.name}</span>
					</a>
				{/if}
			{/snippet}
			{#each shownRoutes as item (item.id)}
				{@render navEntry(item)}
			{/each}
		</nav>

		<div class="rail-foot">
			<button
				type="button"
				class="nav-item"
				aria-label={open ? "Collapse navigation" : "Expand navigation"}
				onclick={toggleRail}
			>
				<span class="nav-icon">
					<Icon name={open ? "chevron-left" : "chevron-right"} size={19} />
				</span>
				<span class="nav-label">Collapse</span>
				<span class="tip" aria-hidden="true">{open ? "Collapse" : "Expand"}</span>
			</button>
		</div>
	</aside>

	<div class="main">
		{#if showTopbar}
			<header class="topbar">
				<nav class="crumbs" aria-label="Breadcrumb">
					<ol>
						{#each crumbs as crumb, index (crumb.label + String(crumb.href || "") + index)}
							<li>
								{#if index > 0}
									<span class="sep" aria-hidden="true">/</span>
								{/if}
								{#if crumb.href}
									<a class="crumb-link" href={crumb.href}>{crumb.label}</a>
								{:else}
									<span class="route" aria-current="page">{crumb.label}</span>
								{/if}
							</li>
						{/each}
					</ol>
				</nav>
				<div class="topbar-end">
					<WebsiteJobsTray />
					<AccountMenu {me} />
				</div>
			</header>
		{:else if !printBook}
			<WebsiteJobsTray floating />
		{/if}

		{#if showEnvBanner}
			<div
				class="env-banner"
				class:risk={Boolean(me?.risk)}
				role="status"
				title={envDetail}
			>
				{envBannerText}
			</div>
		{/if}

		{#if strip.length}
			<SectionTabs
				label={stripLabel}
				groups={strip}
				{active}
				badge={badge ? { ...badge, title: badgeTitle(badge.tone, badge.count) } : null}
				onnavigate={onLeafClick}
			/>
		{:else if showBackToMore}
			<nav class="back-more" aria-label="Back">
				<a href={MORE_PATH} onclick={(e) => onLeafClick(e, MORE_PATH)}>
					<Icon name="chevron-left" size={20} />
					More
				</a>
			</nav>
		{/if}

		<main class="content scrollbar-fade" bind:this={contentEl}>
			{@render children({ path, active })}
		</main>
	</div>

	{#if showTabs}
		<nav class="tabs" aria-label="Primary">
			{#each tabs as item (item.id)}
				{@const on = currentTab === item.id}
				<a
					class="tab"
					class:on
					href={tabHref(item.id)}
					aria-current={on ? "true" : undefined}
					onclick={(e) => onTab(item.id, e)}
				>
					<span class="tab-icon">
						<Icon name={item.icon} size={20} />
						{#if item.badge === "website" && badge}
							<span
								class="tab-badge {badge.tone}"
								aria-label={badgeTitle(badge.tone, badge.count)}
							>
								{badge.tone === "failed" ? "!" : badge.count}
							</span>
						{/if}
					</span>
					<span class="tab-label">{item.label}</span>
				</a>
			{/each}
		</nav>
	{/if}

</div>

<style>
	.shell {
		display: grid;
		grid-template-columns: var(--rail-w) minmax(0, 1fr);
		position: relative;
		height: 100dvh;
		overflow: hidden;
		background: var(--background);
		color: var(--foreground);
		transition: grid-template-columns var(--t-slow) var(--ease);
	}

	.shell.open {
		grid-template-columns: var(--rail-w-open) minmax(0, 1fr);
	}

	.rail {
		display: flex;
		flex-direction: column;
		gap: 0;
		position: relative;
		z-index: 50;
		height: 100dvh;
		padding: 0 var(--space-3) var(--space-4);
		background: var(--card);
		border-right: 1px solid var(--border);
		overflow: hidden;
	}

	.brand {
		display: flex;
		align-items: center;
		flex-shrink: 0;
		gap: 0.625rem;
		height: var(--topbar-h);
		padding: 0 0.25rem;
		margin: 0 -0.75rem 0.875rem;
		padding-left: 1rem;
		padding-right: 1rem;
		border-bottom: 1px solid var(--border);
	}

	.mark {
		display: grid;
		place-items: center;
		width: 2.125rem;
		height: 2.125rem;
		flex-shrink: 0;
		border-radius: var(--radius-md);
		background: var(--brand-mark);
		color: var(--primary-foreground);
		/* The brand G, in the brand serif. */
		font-family: var(--font-display);
		font-size: var(--text-lg);
		font-weight: 600;
		box-shadow: var(--shadow-primary);
	}

	.brand-text {
		display: grid;
		min-width: 0;
		max-width: 0;
		opacity: 0;
		overflow: hidden;
		transition:
			opacity var(--t) var(--ease),
			max-width var(--t) var(--ease);
	}

	.open .brand-text {
		max-width: 12rem;
		opacity: 1;
	}

	.brand-title {
		font-size: var(--text-md);
		font-weight: 600;
		letter-spacing: var(--tracking-2xl);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.brand-sub {
		font-size: var(--text-xs);
		color: var(--muted-foreground);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.nav {
		display: flex;
		flex-direction: column;
		gap: 0.1875rem;
		flex: 1;
		min-height: 0;
		padding-top: 0.25rem;
		overflow-y: auto;
		overflow-x: hidden;
		scrollbar-gutter: stable;
		margin-right: calc(-1 * var(--scrollbar-size));
	}

	.shell:not(.open) .rail,
	.shell:not(.open) .nav {
		overflow: visible;
	}

	.nav-section {
		display: flex;
		flex-direction: column;
		gap: 0.0625rem;
	}

	.open .nav-section {
		margin-top: var(--space-3);
		margin-bottom: var(--space-1);
	}

	.nav-section-label {
		margin: 0.15rem 0 var(--space-1) var(--space-3);
		font-size: var(--text-2xs);
		font-weight: 600;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--subtle-foreground);
	}

	.nav-group {
		position: relative;
		display: flex;
		flex-direction: column;
		flex-shrink: 0;
		gap: 0.0625rem;
	}

	.nav-children {
		display: grid;
		grid-template-rows: 0fr;
		opacity: 0;
		overflow: hidden;
		pointer-events: none;
		transition:
			grid-template-rows var(--t-slow) var(--ease),
			opacity var(--t-slow) var(--ease);
	}

	.nav-group.expanded .nav-children {
		grid-template-rows: 1fr;
		opacity: 1;
		pointer-events: auto;
	}

	.nav-children-inner {
		min-height: 0;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		gap: 0.0625rem;
		padding: 0 0 0.15rem;
	}

	.nav-group.expanded .nav-children-inner {
		min-height: min-content;
	}

	.nav-item.nested {
		height: 2.25rem;
		min-height: 2.25rem;
		padding-left: var(--space-10);
		padding-right: var(--space-3);
		border-radius: var(--radius-sm);
		color: var(--muted-foreground);
		font-size: var(--text-sm);
		font-weight: 400;
	}

	.nav-item.nested.deep {
		height: 2.15rem;
		min-height: 2.15rem;
		padding-left: 3.35rem;
	}

	.nav-sub-label {
		flex-shrink: 0;
		margin: var(--space-1) 0 0.05rem var(--space-2);
		font-size: var(--text-2xs);
		font-weight: 600;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--subtle-foreground);
	}

	.flyout-label {
		flex-shrink: 0;
		margin: var(--space-2) 0 0.1rem var(--space-2);
		font-size: var(--text-2xs);
		font-weight: 600;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--subtle-foreground);
	}

	.nav-item.group-label {
		cursor: pointer;
		color: color-mix(in srgb, var(--foreground) 72%, var(--muted-foreground));
		font-size: var(--text-base);
		font-weight: 500;
		letter-spacing: 0;
		text-transform: none;
	}

	.nav-item.group-label:hover {
		background: var(--accent);
		color: var(--foreground);
	}

	.nav-item.group-label.in {
		color: var(--primary);
		background: none;
	}

	.nav-item.group-label.in:hover {
		color: var(--primary);
		background: var(--accent);
	}

	.nav-item.group-label.in.open {
		color: var(--primary);
	}

	.group-chevron {
		display: grid;
		place-items: center;
		margin-left: auto;
		flex-shrink: 0;
		width: 1.125rem;
		height: 1.125rem;
		color: var(--muted-foreground);
		opacity: 0.85;
		transform: rotate(0deg);
		transition: transform var(--t-slow) var(--ease);
	}

	.nav-item.group-label.open .group-chevron {
		transform: rotate(90deg);
	}

	.nav-item.group-label:hover .group-chevron,
	.nav-item.group-label.open .group-chevron,
	.nav-item.group-label.in .group-chevron {
		color: inherit;
		opacity: 1;
	}

	.shell:not(.open) .group-chevron {
		display: none;
	}

	.flyout {
		position: absolute;
		left: 100%;
		top: 0;
		z-index: 70;
		padding-left: var(--space-2);
		opacity: 0;
		pointer-events: none;
		transform: translate(-0.25rem, 0);
		transition:
			opacity var(--t-fast) var(--ease),
			transform var(--t-fast) var(--ease);
	}

	.nav-group:hover .flyout,
	.nav-group:focus-within .flyout {
		opacity: 1;
		pointer-events: auto;
		transform: translate(0, 0);
	}

	.flyout-card {
		display: grid;
		gap: 0.125rem;
		min-width: 12.75rem;
		padding: var(--space-1);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--popover);
		color: var(--popover-foreground);
		box-shadow: var(--shadow-pop);
	}

	.flyout-link {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-height: 2.35rem;
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius-sm);
		color: var(--popover-foreground);
		font-size: var(--text-sm);
		font-weight: 500;
		text-decoration: none;
	}

	.flyout-link:hover {
		background: var(--accent);
		color: var(--foreground);
	}

	.flyout-link.on {
		background: var(--primary-wash);
		color: var(--primary);
	}

	.flyout-link:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 1px;
	}

	.rail-foot {
		display: flex;
		flex-direction: column;
		flex-shrink: 0;
		gap: 0.1875rem;
		padding-top: var(--space-2);
		border-top: 1px solid var(--border);
	}

	.nav > a.nav-item {
		color: color-mix(in srgb, var(--foreground) 72%, var(--muted-foreground));
	}

	.nav-item {
		position: relative;
		display: flex;
		align-items: center;
		flex-shrink: 0;
		gap: var(--space-3);
		width: 100%;
		height: 2.75rem;
		min-height: 2.75rem;
		padding: 0 var(--space-3);
		border: none;
		border-radius: var(--radius-md);
		background: none;
		color: var(--muted-foreground);
		font: inherit;
		font-size: var(--text-base);
		font-weight: 500;
		text-align: left;
		text-decoration: none;
		cursor: pointer;
		transition:
			background-color var(--t-fast) var(--ease-in-out),
			color var(--t-fast) var(--ease-in-out),
			box-shadow var(--t-fast) var(--ease-in-out);
	}

	.nav-item:hover:not(.on) {
		background: var(--accent);
		color: var(--foreground);
	}

	.nav-item:focus-visible {
		outline: none;
		border-radius: var(--radius-md);
		color: var(--foreground);
		background: var(--accent);
		box-shadow: inset 0 0 0 1px var(--border-strong);
	}

	.nav-item.on {
		background: var(--primary-wash);
		color: var(--primary);
	}

	.nav-item.on:focus-visible {
		color: var(--primary);
		background: var(--primary-wash);
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--primary) 40%, transparent);
	}

	/* Collapsed: circle halo only (no rect wash). Expanded: rect wash only. */
	.shell:not(.open) .nav-item.on {
		background: transparent;
	}

	.nav-item.on::before {
		content: "";
		position: absolute;
		left: 0.0625rem;
		width: 2.5rem;
		height: 2.5rem;
		border-radius: 50%;
		background: var(--glow);
		pointer-events: none;
	}

	.open .nav-item.on::before {
		display: none;
	}

	/* Collapsed rail clips outer rings; keep keyboard focus on the icon halo. */
	.shell:not(.open) .nav-item:focus-visible {
		background: transparent;
		box-shadow: none;
	}

	.shell:not(.open) .nav-item:focus-visible::after {
		content: "";
		position: absolute;
		left: 0.0625rem;
		width: 2.5rem;
		height: 2.5rem;
		border-radius: 50%;
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--primary) 45%, transparent);
		pointer-events: none;
	}

	.nav-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		position: relative;
		flex-shrink: 0;
	}

	.nav-label {
		min-width: 0;
		max-width: 0;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		opacity: 0;
		transition:
			opacity var(--t) var(--ease),
			max-width var(--t) var(--ease);
	}

	.open .nav-label {
		max-width: 12rem;
		opacity: 1;
	}

	/* "Waiting for the website" count on the Website item. */
	.nav-badge {
		display: inline-grid;
		place-items: center;
		flex-shrink: 0;
		min-width: 1.25rem;
		height: 1.25rem;
		margin-left: auto;
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

	/* Collapsed rail: a small count on the icon instead of beside the label. */
	.shell:not(.open) .nav-badge {
		position: absolute;
		top: 0.3rem;
		left: 1.55rem;
		min-width: 1rem;
		height: 1rem;
		padding: 0 var(--space-1);
		font-size: var(--text-2xs);
	}

	.nav-badge.updating {
		background: var(--primary-wash-strong, var(--primary-wash));
		color: var(--primary);
	}

	.nav-badge.failed {
		background: var(--destructive);
		color: var(--danger-foreground);
	}

	.tip {
		position: absolute;
		left: calc(100% + 0.625rem);
		top: 50%;
		z-index: 60;
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--popover);
		color: var(--popover-foreground);
		box-shadow: var(--shadow-pop);
		font-size: var(--text-sm);
		font-weight: 500;
		white-space: nowrap;
		opacity: 0;
		transform: translate(-0.25rem, -50%);
		pointer-events: none;
		transition:
			opacity var(--t-fast) var(--ease),
			transform var(--t-fast) var(--ease);
	}

	.nav-item:hover .tip,
	.nav-item:focus-visible .tip {
		opacity: 1;
		transform: translate(0, -50%);
	}

	.open .tip {
		display: none;
	}

	.main {
		display: grid;
		grid-template-rows: var(--topbar-h) minmax(0, 1fr);
		min-width: 0;
		height: 100dvh;
	}

	.shell:has(.env-banner) .main {
		grid-template-rows: var(--topbar-h) auto minmax(0, 1fr);
	}

	.shell:not(.has-topbar):has(.env-banner) .main {
		grid-template-rows: auto minmax(0, 1fr);
	}

	/* A quiet 24px strip; it only turns amber when the pairing is risky. */
	.env-banner {
		height: 1.5rem;
		padding: 0 var(--page-gutter);
		border-bottom: 1px solid var(--border);
		background: var(--surface-1);
		color: var(--fg-muted);
		font-size: var(--text-2xs);
		font-weight: 500;
		line-height: calc(1.5rem - 1px);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.env-banner::before {
		content: "";
		display: inline-block;
		width: 0.375rem;
		height: 0.375rem;
		margin-right: var(--space-2);
		border-radius: 50%;
		background: var(--info);
		vertical-align: 0.0625rem;
	}

	.env-banner.risk {
		border-bottom-color: var(--warning-border);
		background: color-mix(in srgb, var(--warning) 16%, var(--background));
		color: var(--warning);
		font-weight: 600;
	}

	.env-banner.risk::before {
		background: var(--warning);
	}

	.topbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		padding: 0 var(--page-gutter);
		border-bottom: 1px solid var(--border);
		background: var(--background);
	}

	.topbar-end {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.crumbs {
		min-width: 0;
		font-size: var(--text-base);
	}

	.crumbs ol {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.crumbs li {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
	}

	.crumbs li:last-child {
		flex: 1;
	}

	.crumb-link {
		flex-shrink: 0;
		color: var(--muted-foreground);
		font-weight: 500;
		text-decoration: none;
		white-space: nowrap;
	}

	.crumb-link:hover {
		color: var(--foreground);
	}

	.crumb-link:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
	}

	.sep {
		color: var(--border-strong);
	}

	.route {
		min-width: 0;
		font-weight: 500;
		color: var(--foreground);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.content {
		position: relative;
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
		overflow: hidden;
	}

	.tabs {
		display: none;
	}

	/* Keep in sync with SHELL_MOBILE_MAX_PX. */
	@media (max-width: 900px) {
		:global(:root) {
			--page-gutter: 1rem;
		}

		.shell,
		.shell.open {
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: minmax(0, 1fr);
		}

		.has-tabs {
			grid-template-rows: minmax(0, 1fr) var(--bottom-nav-h);
		}

		.rail {
			display: none;
		}

		/* Banner, tab strip or back link, then the page: a column, not grid rows. */
		.main,
		.shell:has(.env-banner) .main,
		.shell:not(.has-topbar):has(.env-banner) .main {
			display: flex;
			flex-direction: column;
			height: auto;
			min-height: 0;
		}

		/* Editors pad for the notch in their own back bar. */
		.shell:not(.editor) .main {
			padding-top: env(safe-area-inset-top, 0px);
		}

		.content {
			flex: 1;
		}

		.back-more {
			flex-shrink: 0;
			border-bottom: 1px solid var(--border);
			background: var(--background);
		}

		.back-more a {
			display: inline-flex;
			align-items: center;
			gap: 0.1rem;
			min-height: 2.75rem;
			padding: 0 var(--page-gutter) 0 calc(var(--page-gutter) - 0.4rem);
			color: var(--primary);
			font-size: var(--text-base);
			font-weight: 500;
			text-decoration: none;
		}

		.back-more a:focus-visible {
			outline: 2px solid var(--ring);
			outline-offset: -2px;
			border-radius: var(--radius-md);
		}

		.tabs {
			display: grid;
			grid-auto-columns: minmax(0, 1fr);
			grid-auto-flow: column;
			align-items: start;
			height: var(--bottom-nav-h);
			padding: 0.35rem 0.4rem env(safe-area-inset-bottom, 0px);
			border-top: 1px solid var(--border);
			background: var(--card);
		}

		.tab {
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			gap: 0.15rem;
			min-height: 2.75rem;
			padding: 0.2rem var(--space-1);
			border-radius: var(--radius-md);
			color: var(--fg-muted);
			text-decoration: none;
			font-size: var(--text-2xs);
			font-weight: 500;
			letter-spacing: 0.01em;
		}

		.tab.on {
			color: var(--primary);
		}

		.tab:focus-visible {
			outline: 2px solid var(--ring);
			outline-offset: 2px;
		}

		.tab-icon {
			position: relative;
			display: inline-flex;
		}

		.tab-badge {
			position: absolute;
			top: -0.3rem;
			left: calc(100% - 0.45rem);
			display: inline-grid;
			place-items: center;
			min-width: 1rem;
			height: 1rem;
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

		.tab-badge.updating {
			background: var(--primary-wash-strong, var(--primary-wash));
			color: var(--primary);
		}

		.tab-badge.failed {
			background: var(--destructive);
			color: var(--danger-foreground);
		}

		.tab-label {
			line-height: 1;
		}
	}
</style>
