<script lang="ts">
	/** Phone overflow: configuration and sign out. */
	import { fade, fly } from "svelte/transition";
	import Icon from "./Icon.svelte";

	function easeOut(t: number): number {
		return 1 - Math.pow(1 - t, 3.2);
	}

	let {
		open = false,
		path = "/",
		email = "",
		envSummary = "",
		envDetail = "",
		envRisk = false,
		onclose,
	}: {
		open?: boolean;
		path?: string;
		email?: string;
		envSummary?: string;
		envDetail?: string;
		envRisk?: boolean;
		onclose: () => void;
	} = $props();

	const onConfig = $derived(path === "/config" || path.startsWith("/config/"));
	const onMenu = $derived(path === "/menu" || path.startsWith("/menu/"));
	const onSections = $derived(
		path === "/sections" || path.startsWith("/sections/"),
	);
	const onUsers = $derived(path === "/users" || path.startsWith("/users/"));
	const onWeb = $derived(path === "/web" || path.startsWith("/web/"));
	const eventsPath = $derived(path.split("?")[0] ?? "/");
	const onSchedule = $derived(
		eventsPath === "/events/schedule" ||
			eventsPath.startsWith("/events/schedule/") ||
			eventsPath === "/events/nights" ||
			eventsPath.startsWith("/events/nights/") ||
			/\/events\/[^/]+@/.test(eventsPath),
	);
	const onSeries = $derived(
		(eventsPath === "/events" || eventsPath.startsWith("/events/")) && !onSchedule,
	);
</script>

{#if open}
	<div class="root" role="presentation">
		<button
			type="button"
			class="backdrop"
			aria-label="Close menu"
			onclick={onclose}
			transition:fade={{ duration: 180, easing: easeOut }}
		></button>
		<div
			class="sheet"
			role="dialog"
			aria-modal="true"
			aria-label="More"
			in:fly={{ y: 28, duration: 280, easing: easeOut }}
			out:fly={{ y: 20, duration: 180, easing: easeOut }}
		>
			<div class="grab" aria-hidden="true"></div>
			<nav class="links">
				<p class="heading">Lightspeed</p>
				<a class="row" href="/lightspeed">
					<span class="icon"><Icon name="lightspeed" size={18} /></span>
					<span class="copy">
						<span class="label">Reconcile</span>
						<span class="hint">Match a Lightspeed item list</span>
					</span>
				</a>
				<a class="row" href="/lightspeed/export">
					<span class="icon"><Icon name="upload" size={18} /></span>
					<span class="copy">
						<span class="label">Export</span>
						<span class="hint">Item import for Lightspeed</span>
					</span>
				</a>
				<p class="heading">Menu</p>
				<a
					class="row"
					class:on={onMenu}
					href="/menu"
					aria-current={onMenu ? "page" : undefined}
				>
					<span class="icon"><Icon name="recipes" size={18} /></span>
					<span class="copy">
						<span class="label">Menu items</span>
						<span class="hint">Drinks on the guest menu</span>
					</span>
				</a>
				<a
					class="row"
					class:on={onSections}
					href="/sections"
					aria-current={onSections ? "page" : undefined}
				>
					<span class="icon"><Icon name="list" size={18} /></span>
					<span class="copy">
						<span class="label">Sections</span>
						<span class="hint">Guest menu chapters and groups</span>
					</span>
				</a>
				<p class="heading">Events</p>
				<a
					class="row"
					class:on={onSeries}
					href="/events"
					aria-current={onSeries ? "page" : undefined}
				>
					<span class="icon"><Icon name="list" size={18} /></span>
					<span class="copy">
						<span class="label">Series</span>
						<span class="hint">Residencies and their defaults</span>
					</span>
				</a>
				<a
					class="row"
					class:on={onSchedule}
					href="/events/schedule"
					aria-current={onSchedule ? "page" : undefined}
				>
					<span class="icon"><Icon name="events" size={18} /></span>
					<span class="copy">
						<span class="label">Schedule</span>
						<span class="hint">Upcoming nights</span>
					</span>
				</a>
				<p class="heading">Website</p>
				<a
					class="row"
					class:on={onWeb}
					href="/web"
					aria-current={onWeb ? "page" : undefined}
				>
					<span class="icon"><Icon name="web" size={18} /></span>
					<span class="copy">
						<span class="label">Web</span>
						<span class="hint">Staging, production, and promote</span>
					</span>
				</a>
				<p class="heading">Ops</p>
				<a
					class="row"
					class:on={onUsers}
					href="/users"
					aria-current={onUsers ? "page" : undefined}
				>
					<span class="icon"><Icon name="users" size={18} /></span>
					<span class="copy">
						<span class="label">Users</span>
						<span class="hint">Who may sign in</span>
					</span>
				</a>
				<a
					class="row"
					class:on={onConfig}
					href="/config"
					aria-current={onConfig ? "page" : undefined}
				>
					<span class="icon"><Icon name="settings" size={18} /></span>
					<span class="copy">
						<span class="label">Configuration</span>
						<span class="hint">Pour cost targets</span>
					</span>
				</a>
			</nav>
			{#if envSummary}
				<div
					class="row session env"
					class:risk={envRisk}
					title={envDetail || envSummary}
				>
					<span class="icon"><Icon name="settings" size={18} /></span>
					<span class="copy">
						<span class="label">{envSummary}</span>
						<span class="hint"
							>{envRisk ? "Check Baserow target" : "Connected environment"}</span
						>
					</span>
				</div>
			{/if}
			{#if email}
				<div class="row session" title={email}>
					<span class="icon"><Icon name="users" size={18} /></span>
					<span class="copy">
						<span class="label">{email}</span>
						<span class="hint">Signed in</span>
					</span>
				</div>
			{/if}
			<a class="row signout" href="/api/auth/logout">
				<span class="icon"><Icon name="logout" size={18} /></span>
				<span class="copy">
					<span class="label">Sign out</span>
				</span>
			</a>
		</div>
	</div>
{/if}

<style>
	.root {
		position: fixed;
		inset: 0;
		z-index: 80;
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		pointer-events: none;
	}

	.backdrop {
		position: absolute;
		inset: 0;
		pointer-events: auto;
		border: 0;
		padding: 0;
		margin: 0;
		background: color-mix(in srgb, #0d0d0d 55%, transparent);
		cursor: pointer;
	}

	.sheet {
		position: relative;
		pointer-events: auto;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		margin: 0 var(--gap-sm);
		margin-bottom: calc(var(--bottom-nav-h) + 0.35rem);
		padding: 0.5rem 0.5rem 0.65rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-xl);
		background: var(--card);
		box-shadow: var(--shadow);
	}

	.grab {
		width: 2.25rem;
		height: 0.25rem;
		margin: 0.15rem auto 0.35rem;
		border-radius: var(--radius-pill);
		background: var(--border-strong);
	}

	.links {
		display: grid;
		gap: 0.125rem;
	}

	.heading {
		margin: 0.15rem 0.7rem 0.2rem;
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--muted-foreground);
	}

	.heading:not(:first-child) {
		margin-top: 0.65rem;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		min-height: 3.15rem;
		padding: 0.45rem 0.7rem;
		border-radius: var(--radius-md);
		color: var(--foreground);
		text-decoration: none;
	}

	.row:hover {
		background: var(--accent);
	}

	.row.on {
		background: var(--primary-wash);
		color: var(--primary);
	}

	.row:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
	}

	.icon {
		display: inline-flex;
		flex-shrink: 0;
		color: inherit;
	}

	.copy {
		display: grid;
		min-width: 0;
		gap: 0.05rem;
	}

	.label {
		font-size: var(--text);
		font-weight: 600;
	}

	.hint {
		font-size: var(--text-xs);
		color: var(--muted-foreground);
	}

	.row.on .hint {
		color: color-mix(in srgb, var(--primary) 70%, var(--muted-foreground));
	}

	.session {
		margin-top: 0.25rem;
		border-top: 1px solid var(--border);
		color: var(--muted-foreground);
		cursor: default;
	}

	.session:hover {
		background: transparent;
	}

	.session .label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-weight: 500;
	}

	.session.env {
		color: var(--primary);
	}

	.session.env.risk {
		color: var(--warning);
	}

	.session.env + .session {
		margin-top: 0;
		border-top: none;
	}

	.signout {
		color: var(--muted-foreground);
	}

	.signout:first-child {
		margin-top: 0.25rem;
		border-top: 1px solid var(--border);
	}
</style>
