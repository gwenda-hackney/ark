<script lang="ts">
	/**
	 * Phone sheet for one bottom tab. Lists the rail sections it is given, so it
	 * always matches the side nav. More also shows the signed-in account.
	 */
	import { fade, fly } from "svelte/transition";
	import Icon from "./Icon.svelte";
	import type { NavRoute } from "./types";

	function easeOut(t: number): number {
		return 1 - Math.pow(1 - t, 3.2);
	}

	type Group = { id: string; name: string; rows: NavRoute[] };

	let {
		open = false,
		label = "More",
		sections = [],
		active = null,
		account = false,
		badge = null,
		email = "",
		envSummary = "",
		envDetail = "",
		envRisk = false,
		onnavigate,
		onclose,
	}: {
		open?: boolean;
		label?: string;
		sections?: NavRoute[];
		active?: NavRoute | null;
		/** Show the environment, signed-in email and Sign out. */
		account?: boolean;
		/** Website count, shown on the row with `badge: "website"`. */
		badge?: { tone: string; count: number; title: string } | null;
		email?: string;
		envSummary?: string;
		envDetail?: string;
		envRisk?: boolean;
		onnavigate: (event: MouseEvent, href: string) => void;
		onclose: () => void;
	} = $props();

	/** Sub-groups (Menu, Stock…) get their own heading; loose pages sit under the section name. */
	const groups = $derived.by(() => {
		const out: Group[] = [];
		for (const section of sections) {
			const loose: NavRoute[] = [];
			const nested: Group[] = [];
			for (const child of section.children || [section]) {
				if (child.children?.length) {
					nested.push({ id: child.id, name: child.name, rows: child.children });
				} else if (child.path) {
					loose.push(child);
				}
			}
			if (loose.length) out.push({ id: section.id, name: section.name, rows: loose });
			out.push(...nested);
		}
		return out;
	});
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
			aria-label={label}
			in:fly={{ y: 28, duration: 280, easing: easeOut }}
			out:fly={{ y: 20, duration: 180, easing: easeOut }}
		>
			<div class="grab" aria-hidden="true"></div>
			<nav class="links scrollbar-fade" aria-label={label}>
				{#each groups as group (group.id)}
					<p class="heading">{group.name}</p>
					{#each group.rows as row (row.id)}
						{@const on = active?.id === row.id}
						{@const href = row.path || "/"}
						<a
							class="row"
							class:on
							{href}
							aria-current={on ? "page" : undefined}
							onclick={(e) => onnavigate(e, href)}
						>
							<span class="icon"><Icon name={row.icon} size={18} /></span>
							<span class="copy">
								<span class="label">{row.name}</span>
								{#if row.hint}
									<span class="hint">{row.hint}</span>
								{/if}
							</span>
							{#if row.badge === "website" && badge}
								<span class="badge {badge.tone}" title={badge.title} aria-label={badge.title}>
									{badge.tone === "failed" ? "!" : badge.count}
								</span>
							{/if}
						</a>
					{/each}
				{/each}
			</nav>
			{#if account}
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
			{/if}
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
		max-height: calc(100dvh - var(--bottom-nav-h) - 5rem);
		overflow-y: auto;
		overscroll-behavior: contain;
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

	.badge {
		display: inline-grid;
		place-items: center;
		min-width: 1.35rem;
		height: 1.35rem;
		margin-left: auto;
		padding: 0 0.4rem;
		border-radius: var(--radius-pill);
		background: var(--primary);
		color: var(--primary-foreground);
		font-size: var(--text-xs);
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		line-height: 1;
	}

	.badge.updating {
		background: var(--primary-wash-strong, var(--primary-wash));
		color: var(--primary);
	}

	.badge.failed {
		background: var(--destructive);
		color: var(--destructive-foreground, #fff);
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
