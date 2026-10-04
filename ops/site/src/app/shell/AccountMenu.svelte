<script lang="ts">
	/**
	 * Who's signed in, top right of the desktop shell. Opens a small menu with
	 * the account, which copy of ops this is, and Sign out. Escape or a click
	 * outside closes it. Phones have the same on the More page.
	 */
	import { tick } from "svelte";
	import Icon from "./Icon.svelte";
	import type { AuthMe } from "../api";

	let { me }: { me: AuthMe | null } = $props();

	let open = $state(false);
	let root = $state<HTMLDivElement | undefined>();
	let trigger = $state<HTMLButtonElement | undefined>();
	let menu = $state<HTMLDivElement | undefined>();

	const account = $derived(me?.email || "Local access");
	const mark = $derived((me?.email || "L").trim().charAt(0).toUpperCase() || "?");
	const how = $derived(
		me?.email ? "Signed in with Google" : me ? "Signed in with the local password" : "",
	);

	async function toggle() {
		open = !open;
		if (open) {
			await tick();
			menu?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
		}
	}

	function close(focusTrigger = false) {
		open = false;
		if (focusTrigger) trigger?.focus();
	}

	function onWindowPointer(event: PointerEvent) {
		if (open && root && !root.contains(event.target as Node)) close();
	}

	function onKey(event: KeyboardEvent) {
		if (open && event.key === "Escape") {
			event.preventDefault();
			close(true);
		}
	}
</script>

<svelte:window onpointerdown={onWindowPointer} onkeydown={onKey} />

<div class="account" bind:this={root}>
	<button
		type="button"
		class="trigger"
		bind:this={trigger}
		aria-haspopup="menu"
		aria-expanded={open}
		aria-label="Account: {account}"
		title={account}
		onclick={toggle}
	>
		<span class="avatar" aria-hidden="true">{mark}</span>
		<Icon name="chevron-down" size={14} />
	</button>

	{#if open}
		<div class="menu" role="menu" aria-label="Account" bind:this={menu}>
			<div class="who">
				<span class="avatar big" aria-hidden="true">{mark}</span>
				<span class="who-text">
					<span class="email">{account}</span>
					{#if how}<span class="meta">{how}</span>{/if}
				</span>
			</div>
			{#if me?.envLabel}
				<p class="env" class:risk={Boolean(me.risk)}>
					{me.envLabel}{#if me.databaseLabel} · {me.databaseLabel}{/if}
				</p>
			{/if}
			<div class="sep" role="separator"></div>
			<a class="item" role="menuitem" href="/api/auth/logout">
				<Icon name="logout" size={16} />
				Sign out
			</a>
		</div>
	{/if}
</div>

<style>
	.account {
		position: relative;
		flex-shrink: 0;
	}

	.trigger {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		height: 2rem;
		padding: 0 var(--space-1) 0 0.1875rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		background: transparent;
		color: var(--fg-muted);
		cursor: pointer;
	}

	.trigger:hover,
	.trigger[aria-expanded="true"] {
		border-color: var(--border-strong);
		background: var(--surface-2);
		color: var(--fg);
	}

	.trigger:focus-visible,
	.item:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
	}

	.avatar {
		display: inline-grid;
		place-items: center;
		width: 1.5rem;
		height: 1.5rem;
		border-radius: 50%;
		background: var(--primary-wash-strong);
		color: var(--primary);
		font-size: var(--text-xs);
		font-weight: 600;
	}

	.avatar.big {
		width: 2.25rem;
		height: 2.25rem;
		font-size: var(--text-base);
	}

	.menu {
		position: absolute;
		z-index: 60;
		top: calc(100% + 6px);
		right: 0;
		width: 17rem;
		padding: var(--space-2);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-lg);
		background: var(--surface-2);
		box-shadow: var(--shadow-pop);
	}

	.who {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2);
	}

	.who-text {
		display: grid;
		min-width: 0;
	}

	.email {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: var(--text-base);
		font-weight: 500;
		color: var(--fg);
	}

	.meta {
		font-size: var(--text-xs);
		color: var(--fg-muted);
	}

	.env {
		margin: 0;
		padding: 0 var(--space-2) var(--space-2);
		font-size: var(--text-xs);
		color: var(--fg-subtle);
	}

	.env.risk {
		color: var(--warning);
	}

	.sep {
		height: 1px;
		margin: 0 calc(var(--space-2) * -1) var(--space-2);
		background: var(--border);
	}

	.item {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		height: 2.25rem;
		padding: 0 var(--space-2);
		border-radius: var(--radius-md);
		color: var(--fg);
		font-size: var(--text-base);
		text-decoration: none;
	}

	.item:hover {
		background: var(--surface-3);
	}
</style>
