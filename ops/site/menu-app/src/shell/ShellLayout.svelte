<script lang="ts">
	/**
	 * Ops chrome: collapsible icon rail, fixed top bar, one scrolling content pane.
	 * Viewport never scrolls — only `.content` does.
	 */
	import type { Snippet } from "svelte";
	import { onMount } from "svelte";
	import Icon from "./Icon.svelte";
	import MoreSheet from "./MoreSheet.svelte";
	import type { NavRoute } from "./types";
	import { getMe, type AuthMe } from "../lib/api";
	import {
		interceptClientNav,
		listen,
		navigate,
		parseShellPath,
		readPath,
		shellCrumbs,
		syncCanonicalUrl,
	} from "../lib/nav";
	import { crumbLeaf } from "../lib/crumbs.svelte";
	import {
		MOBILE_TABS,
		hideShellChrome,
		isStockListPath,
		mobileTabFor,
		rememberStockPath,
		stockSwitchValue,
		tabHref,
		type MobileTabId,
	} from "../lib/mobile-nav";
	import { matchActiveRoute, navGroupContains } from "../lib/nav-tree";
	import { SHELL_MOBILE_QUERY, mediaMatches } from "../lib/viewport.svelte";

	const RAIL_KEY = "ops.rail";
	const GROUP_KEY = "ops.nav.groups";

	let {
		routes,
		brandTitle = "Gwenda",
		brandSubtitle = "Operations",
		path = $bindable("/"),
		children,
	}: {
		routes: NavRoute[];
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
			if (!raw) return { stock: true, menu: true };
			const parsed = JSON.parse(raw) as Record<string, boolean>;
			return parsed && typeof parsed === "object"
				? { stock: true, menu: true, ...parsed }
				: { stock: true, menu: true };
		} catch {
			return { stock: true, menu: true };
		}
	}

	/** Expanded by default — labels visible unless the user collapses the rail. */
	let open = $state(readRail());
	let expandedGroups = $state<Record<string, boolean>>(readExpandedGroups());
	let moreOpen = $state(false);
	let me = $state<AuthMe | null>(null);
	const phone = mediaMatches(SHELL_MOBILE_QUERY);

	const sessionLabel = $derived(
		me?.email ? me.email : me ? "Local access" : "",
	);
	const sessionMark = $derived(
		(me?.email || "L").trim().charAt(0).toUpperCase() || "?",
	);
	const envLabel = $derived(me?.envLabel || "");
	const envMark = $derived(
		envLabel ? envLabel.trim().charAt(0).toUpperCase() : "",
	);
	const envDetail = $derived(
		!me
			? ""
			: [
					me.envLabel,
					me.databaseId ? `Baserow DB ${me.databaseId}` : "Baserow DB not set",
					me.databaseLabel,
				].join(" · "),
	);
	const envSummary = $derived(
		!me ? "" : me.databaseId ? `${me.envLabel} · ${me.databaseId}` : me.envLabel,
	);
	const envBannerText = $derived(
		!me
			? ""
			: me.risk === "nonprod_on_production_db"
				? `Misconfigured: ${me.envLabel} is pointed at the production Baserow DB (${me.databaseId}). Do not edit.`
				: me.risk === "production_on_nonprod_db"
					? `Misconfigured: Production is pointed at a non-production Baserow DB (${me.databaseId}).`
					: me.siteEnv === "local"
						? `Local · edits go to Baserow DB ${me.databaseId || "?"} (${me.databaseLabel}), not production.`
						: `${me.envLabel} · Baserow DB ${me.databaseId || "?"} (${me.databaseLabel}).`,
	);
	const brandSub = $derived(
		envLabel ? `${brandSubtitle} · ${envLabel}` : brandSubtitle,
	);

	onMount(() => {
		void getMe()
			.then((row) => {
				me = row;
			})
			.catch(() => {
				me = null;
			});
	});

	const editorChrome = $derived(hideShellChrome(path));
	const printBook = $derived(Boolean(parseShellPath(path).print));
	const showTabs = $derived(phone.matches && !editorChrome);
	const showStockSwitch = $derived(phone.matches && isStockListPath(path));
	const showTopbar = $derived(!printBook && (!phone.matches || showStockSwitch));
	const showEnvBanner = $derived(
		!printBook && Boolean(me && (me.siteEnv !== "production" || me.risk)),
	);
	const currentTab = $derived(moreOpen ? "more" : mobileTabFor(path));
	const stockValue = $derived(stockSwitchValue(path));

	const active = $derived(matchActiveRoute(routes, path));

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
		moreOpen = false;
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
		if (item.id === "stock") return tabHref("stock");
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

	function onTab(id: MobileTabId, event: MouseEvent): void {
		if (
			event.metaKey ||
			event.ctrlKey ||
			event.shiftKey ||
			event.altKey ||
			event.button !== 0
		) {
			return;
		}
		event.preventDefault();
		if (id === "more") {
			moreOpen = !moreOpen;
			return;
		}
		go(tabHref(id));
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
		rememberStockPath(path);
		moreOpen = false;
	});

	/** Apply before paint so print routes do not flash rail / env banner. */
	$effect.pre(() => {
		if (typeof document === "undefined") return;
		document.documentElement.classList.toggle("print-book", printBook);
	});

	$effect(() => {
		if (!phone.matches || editorChrome) moreOpen = false;
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
>
	<aside class="rail" aria-label="Primary">
		<div class="brand">
			<span class="mark" aria-hidden="true">{mark}</span>
			<span class="brand-text">
				<span class="brand-title">{brandTitle}</span>
				<span class="brand-sub">{brandSub}</span>
			</span>
		</div>

		<nav class="nav scrollbar-fade">
			{#each routes as item (item.id)}
				{#if item.children?.length}
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
											<span class="nav-icon"><Icon name={child.icon} size={17} /></span>
											<span class="nav-label">{child.name}</span>
										</a>
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
						<span class="tip" aria-hidden="true">{item.name}</span>
					</a>
				{/if}
			{/each}
		</nav>

		<div class="rail-foot">
			{#if envSummary}
				<div
					class="nav-item session env"
					class:risk={Boolean(me?.risk)}
					class:local={me?.siteEnv === "local" && !me?.risk}
					title={envDetail}
				>
					<span class="nav-icon" aria-hidden="true">
						<span class="session-mark">{envMark}</span>
					</span>
					<span class="nav-label session-label">
						<span class="env-line">{envSummary}</span>
						<span class="env-db">{me?.databaseLabel}</span>
					</span>
					<span class="tip" aria-hidden="true">{envDetail}</span>
				</div>
			{/if}
			{#if sessionLabel}
				<div class="nav-item session" title={sessionLabel}>
					<span class="nav-icon" aria-hidden="true">
						<span class="session-mark">{sessionMark}</span>
					</span>
					<span class="nav-label session-label">{sessionLabel}</span>
					<span class="tip" aria-hidden="true">{sessionLabel}</span>
				</div>
			{/if}
			<a class="nav-item" href="/api/auth/logout">
				<span class="nav-icon"><Icon name="logout" size={19} /></span>
				<span class="nav-label">Sign out</span>
				<span class="tip" aria-hidden="true">Sign out</span>
			</a>
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
				{#if showStockSwitch}
					<nav class="stock-switch" aria-label="Stock section">
						<a
							class="stock-link"
							class:on={stockValue === "menu"}
							href="/menu"
							aria-current={stockValue === "menu" ? "page" : undefined}
						>
							Menu items
						</a>
						<a
							class="stock-link"
							class:on={stockValue === "inventory"}
							href="/inventory"
							aria-current={stockValue === "inventory" ? "page" : undefined}
						>
							Inventory
						</a>
					</nav>
				{:else if !phone.matches}
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
				{/if}
			</header>
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

		<main class="content scrollbar-fade">
			{@render children({ path, active })}
		</main>
	</div>

	{#if showTabs}
		<nav class="tabs" aria-label="Primary">
			{#each MOBILE_TABS as item (item.id)}
				{@const on = currentTab === item.id}
				<a
					class="tab"
					class:on
					href={item.id === "more" ? "/config" : tabHref(item.id)}
					aria-current={on && item.id !== "more" ? "page" : undefined}
					aria-expanded={item.id === "more" ? moreOpen : undefined}
					onclick={(e) => onTab(item.id, e)}
				>
					<span class="tab-icon"><Icon name={item.icon} size={20} /></span>
					<span class="tab-label">{item.label}</span>
				</a>
			{/each}
		</nav>
	{/if}

	<MoreSheet
		open={moreOpen}
		{path}
		email={sessionLabel}
		{envSummary}
		{envDetail}
		envRisk={Boolean(me?.risk)}
		onclose={() => (moreOpen = false)}
	/>
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
		padding: 0 0.75rem 1rem;
		background: var(--card);
		border-right: 1px solid var(--border);
		overflow: hidden;
	}

	.brand {
		display: flex;
		align-items: center;
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
		font-family: var(--font-display);
		font-size: 1.05rem;
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
		font-weight: 650;
		letter-spacing: -0.02em;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.brand-sub {
		font-size: var(--text-xs);
		color: var(--muted-foreground);
		white-space: nowrap;
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
	}

	.shell:not(.open) .rail,
	.shell:not(.open) .nav {
		overflow: visible;
	}

	.nav-group {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
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
		gap: 0.125rem;
		padding: 0 0 0.35rem 0.35rem;
	}

	.nav-item.nested {
		height: 2.45rem;
		font-size: var(--text-sm);
	}

	.nav-item.group-label {
		cursor: pointer;
		color: var(--subtle-foreground);
		font-size: var(--text-sm);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
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

	.nav-item.group-label.open {
		color: var(--foreground);
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
		padding-left: 0.5rem;
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
		padding: 0.35rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--popover);
		color: var(--popover-foreground);
		box-shadow: var(--shadow-pop);
	}

	.flyout-link {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		min-height: 2.35rem;
		padding: 0.35rem 0.55rem;
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
		gap: 0.1875rem;
		padding-top: 0.5rem;
		border-top: 1px solid var(--border);
	}

	.nav-item.session {
		cursor: default;
		color: var(--muted-foreground);
	}

	.nav-item.session:hover {
		background: transparent;
		color: var(--muted-foreground);
	}

	.session-label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: var(--text-xs);
		font-weight: 500;
	}

	.nav-item {
		position: relative;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		width: 100%;
		height: 2.75rem;
		padding: 0 0.6875rem;
		border: none;
		border-radius: var(--radius-md);
		background: none;
		color: var(--muted-foreground);
		font: inherit;
		font-size: var(--text);
		font-weight: 500;
		text-align: left;
		text-decoration: none;
		cursor: pointer;
		transition:
			background-color var(--t-fast) var(--ease-in-out),
			color var(--t-fast) var(--ease-in-out),
			box-shadow var(--t-fast) var(--ease-in-out);
	}

	.nav-item:hover:not(.on):not(.session) {
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

	.session-mark {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		box-sizing: border-box;
		width: 1.1875rem;
		height: 1.1875rem;
		border-radius: var(--radius-sm);
		background: color-mix(in srgb, var(--primary) 22%, var(--card));
		color: var(--primary);
		font-size: 0.625rem;
		font-weight: 700;
		letter-spacing: 0;
		line-height: 1;
		text-align: center;
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

	.tip {
		position: absolute;
		left: calc(100% + 0.625rem);
		top: 50%;
		z-index: 60;
		padding: 0.3125rem 0.5625rem;
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

	.env-banner {
		padding: 0.45rem var(--page-gutter);
		border-bottom: 1px solid color-mix(in srgb, var(--primary) 35%, var(--border));
		background: color-mix(in srgb, var(--primary) 16%, var(--background));
		color: var(--primary);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.01em;
		line-height: 1.35;
	}

	.env-banner.risk {
		border-bottom-color: color-mix(in srgb, var(--warning) 45%, var(--border));
		background: color-mix(in srgb, var(--warning) 18%, var(--background));
		color: var(--warning);
	}

	.nav-item.session.env.local .session-mark {
		background: color-mix(in srgb, var(--primary) 28%, var(--card));
		color: var(--primary);
	}

	.nav-item.session.env.risk .session-mark {
		background: color-mix(in srgb, var(--warning) 28%, var(--card));
		color: var(--warning);
	}

	.env-line {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.env-db {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 0.65rem;
		font-weight: 500;
		color: var(--subtle-foreground);
		opacity: 0.9;
	}

	.nav-item.session.env {
		height: auto;
		min-height: 2.75rem;
		padding-top: 0.4rem;
		padding-bottom: 0.4rem;
		align-items: center;
	}

	.topbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--gap);
		padding: 0 var(--page-gutter);
		border-bottom: 1px solid var(--border);
		background: var(--background);
	}

	.crumbs {
		min-width: 0;
		font-size: var(--text);
	}

	.crumbs ol {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 0;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.crumbs li {
		display: flex;
		align-items: center;
		gap: 0.5rem;
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

	.stock-switch {
		display: flex;
		align-items: stretch;
		width: 100%;
		height: 100%;
	}

	.stock-link {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: 1;
		height: 100%;
		padding: 0 0.5rem;
		border-bottom: 2px solid transparent;
		color: var(--muted-foreground);
		font-size: var(--text-md);
		font-weight: 500;
		letter-spacing: -0.01em;
		text-decoration: none;
	}

	.stock-link.on {
		color: var(--foreground);
		font-weight: 600;
		border-bottom-color: var(--primary);
	}

	.stock-link:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: -4px;
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

		.main {
			height: auto;
			min-height: 0;
			grid-template-rows: minmax(0, 1fr);
		}

		.has-topbar .main {
			grid-template-rows: var(--topbar-h) minmax(0, 1fr);
		}

		.shell:has(.env-banner) .main {
			grid-template-rows: auto minmax(0, 1fr);
		}

		.shell.has-topbar:has(.env-banner) .main {
			grid-template-rows: var(--topbar-h) auto minmax(0, 1fr);
		}

		.tabs {
			display: grid;
			grid-template-columns: repeat(3, minmax(0, 1fr));
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
			padding: 0.2rem 0.25rem;
			border-radius: var(--radius-md);
			color: var(--muted-foreground);
			text-decoration: none;
			font-size: 0.6875rem;
			font-weight: 600;
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
			display: inline-flex;
		}

		.tab-label {
			line-height: 1;
		}
	}
</style>
