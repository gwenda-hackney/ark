<script lang="ts">
	/**
	 * Phone More tab: settings pages, the environment this copy of ops talks to,
	 * and the signed-in account. Desktop has all of this in the rail, so /more
	 * sends desktop visitors home.
	 */
	import { onMount } from "svelte";
	import Icon from "./Icon.svelte";
	import { PageHeader } from "../../ui";
	import { getMe, type AuthMe } from "../api";
	import { navigate } from "../nav";
	import { NAV_ROUTES } from "../nav-routes";
	import { visibleRoutes } from "../nav-tree";
	import { groupPages } from "../mobile-nav";
	import { SHELL_MOBILE_QUERY, mediaMatches } from "../../ui/viewport.svelte";

	let me = $state<AuthMe | null>(null);
	const phone = mediaMatches(SHELL_MOBILE_QUERY);

	const rows = $derived(
		groupPages("more", visibleRoutes(NAV_ROUTES, Boolean(me?.isAdmin))).flatMap((row) => row.pages),
	);
	const envSummary = $derived(
		!me ? "" : me.databaseId ? `${me.envLabel} · Baserow DB ${me.databaseId}` : me.envLabel,
	);
	const envNote = $derived(
		!me
			? ""
			: me.risk
				? "Check which Baserow database this copy uses before you edit."
				: me.siteEnv === "production"
					? `Edits go to ${me.databaseLabel}.`
					: `Edits go to ${me.databaseLabel}, not production.`,
	);

	onMount(() => {
		void getMe()
			.then((row) => (me = row))
			.catch(() => (me = null));
	});

	$effect(() => {
		if (!phone.matches) navigate("/", { replace: true });
	});

	function open(event: MouseEvent, href: string): void {
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
		event.preventDefault();
		navigate(href);
	}
</script>

<div class="page scrollbar-fade">
	<PageHeader title="More" />

	<section class="block" aria-labelledby="more-settings">
		<h2 id="more-settings" class="heading">Settings</h2>
		<nav class="card list" aria-labelledby="more-settings">
			{#each rows as row (row.id)}
				<a class="row" href={row.path} onclick={(e) => open(e, row.path || "/")}>
					<span class="icon"><Icon name={row.icon} size={18} /></span>
					<span class="copy">
						<span class="label">{row.name}</span>
						{#if row.hint}<span class="hint">{row.hint}</span>{/if}
					</span>
					<span class="chevron" aria-hidden="true"><Icon name="chevron-right" size={16} /></span>
				</a>
			{/each}
		</nav>
	</section>

	{#if envSummary}
		<section class="block" aria-labelledby="more-env">
			<h2 id="more-env" class="heading">Environment</h2>
			<div class="card env" class:risk={Boolean(me?.risk)}>
				<p class="label">{envSummary}</p>
				<p class="hint">{envNote}</p>
			</div>
		</section>
	{/if}

	<section class="block" aria-labelledby="more-account">
		<h2 id="more-account" class="heading">Account</h2>
		<div class="card account">
			{#if me}
				<p class="label">{me.email || "Local access"}</p>
				<p class="hint">{me.email ? "Signed in" : "Signed in with the local password"}</p>
			{/if}
			<a class="signout" href="/api/auth/logout">
				<Icon name="logout" size={18} />
				Sign out
			</a>
		</div>
	</section>
</div>

<style>
	.page {
		position: relative;
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: var(--page-gutter);
		padding-bottom: var(--space-8);
	}

	.block {
		display: grid;
		gap: var(--space-2);
		margin-bottom: var(--space-6);
	}

	.heading {
		margin: 0 var(--space-1);
		font-size: var(--text-2xs);
		line-height: var(--leading-2xs);
		font-weight: 600;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--muted-foreground);
	}

	.card {
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--panel-bg);
	}

	.list {
		display: grid;
		overflow: hidden;
	}

	.row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-height: 3.5rem;
		padding: var(--space-2) var(--space-4);
		color: var(--foreground);
		text-decoration: none;
	}

	.row + .row {
		border-top: 1px solid var(--border);
	}

	.row:hover {
		background: var(--accent);
	}

	.row:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: -2px;
		border-radius: var(--radius-lg);
	}

	.icon {
		display: inline-flex;
		flex-shrink: 0;
		color: var(--muted-foreground);
	}

	.copy {
		display: grid;
		flex: 1;
		min-width: 0;
		gap: 0.125rem;
	}

	.label {
		margin: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: var(--text-base);
		font-weight: 500;
	}

	.hint {
		margin: 0;
		font-size: var(--text-sm);
		line-height: var(--leading-sm);
		color: var(--muted-foreground);
	}

	.chevron {
		display: inline-flex;
		flex-shrink: 0;
		color: var(--subtle-foreground);
	}

	.env,
	.account {
		display: grid;
		gap: var(--space-1);
		padding: var(--space-4);
	}

	.env .label {
		color: var(--primary);
	}

	.env.risk {
		border-color: color-mix(in srgb, var(--warning) 35%, var(--border));
	}

	.env.risk .label {
		color: var(--warning);
	}

	.signout {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		min-height: 2.75rem;
		margin-top: var(--space-3);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		color: var(--foreground);
		font-size: var(--text-base);
		font-weight: 500;
		text-decoration: none;
	}

	.signout:hover {
		background: var(--accent);
	}

	.signout:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
	}
</style>
