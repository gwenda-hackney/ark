<script lang="ts">
	/**
	 * "⋯" menu for actions that shouldn't sit next to Save: Delete, Reload,
	 * Print. Opens above or below, whichever has room. Arrow keys move,
	 * Escape closes and gives focus back. With `text` it is a labelled button
	 * instead ("+ Add placement ▾"), for adding one of a few kinds of row.
	 */
	import { Icon } from "../app/shell";
	import { onMount, tick } from "svelte";
	import { portal } from "./portal";
	import type { OverflowItem } from "./types";

	let {
		items,
		label = "More actions",
		disabled = false,
		text = "",
		icon = "",
		reason = "",
	}: {
		items: OverflowItem[];
		label?: string;
		disabled?: boolean;
		/** Visible button text; without it the trigger is the "⋯" icon. */
		text?: string;
		icon?: string;
		/** Why it's disabled, as the tooltip. */
		reason?: string;
	} = $props();

	const menuId = `menu-${Math.random().toString(36).slice(2, 9)}`;
	let open = $state(false);
	let triggerEl = $state<HTMLButtonElement | undefined>();
	let menuEl = $state<HTMLDivElement | undefined>();
	let menuStyle = $state("");

	function place() {
		const rect = triggerEl?.getBoundingClientRect();
		if (!rect) return;
		const gap = 6;
		const below = window.innerHeight - rect.bottom;
		const up = below < 200 && rect.top > below;
		const right = Math.max(12, window.innerWidth - rect.right);
		menuStyle = up
			? `bottom:${Math.round(window.innerHeight - rect.top + gap)}px;right:${Math.round(right)}px`
			: `top:${Math.round(rect.bottom + gap)}px;right:${Math.round(right)}px`;
	}

	function itemsEls() {
		return [...(menuEl?.querySelectorAll<HTMLButtonElement>("[role=menuitem]:not(:disabled)") || [])];
	}

	async function setOpen(next: boolean, focusTrigger = false) {
		if (disabled && next) return;
		open = next;
		if (!next) {
			if (focusTrigger) triggerEl?.focus();
			return;
		}
		await tick();
		place();
		itemsEls()[0]?.focus();
	}

	function choose(item: OverflowItem) {
		if (item.disabled) return;
		void setOpen(false, true);
		item.onselect();
	}

	function onMenuKeydown(e: KeyboardEvent) {
		const els = itemsEls();
		const at = els.indexOf(document.activeElement as HTMLButtonElement);
		if (e.key === "Escape") {
			e.preventDefault();
			e.stopPropagation();
			void setOpen(false, true);
		} else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
			e.preventDefault();
			const delta = e.key === "ArrowDown" ? 1 : -1;
			els[(at + delta + els.length) % els.length]?.focus();
		} else if (e.key === "Tab") {
			void setOpen(false);
		}
	}

	onMount(() => {
		const onPointer = (e: PointerEvent) => {
			if (!open) return;
			const t = e.target as Node | null;
			if (triggerEl?.contains(t) || menuEl?.contains(t)) return;
			void setOpen(false);
		};
		const onMove = () => open && place();
		window.addEventListener("pointerdown", onPointer, true);
		window.addEventListener("resize", onMove);
		window.addEventListener("scroll", onMove, true);
		return () => {
			window.removeEventListener("pointerdown", onPointer, true);
			window.removeEventListener("resize", onMove);
			window.removeEventListener("scroll", onMove, true);
		};
	});
</script>

<button
	bind:this={triggerEl}
	type="button"
	class="trigger"
	class:labelled={Boolean(text)}
	aria-label={text ? undefined : label}
	title={disabled && reason ? reason : text ? undefined : label}
	aria-haspopup="menu"
	aria-expanded={open}
	aria-controls={open ? menuId : undefined}
	{disabled}
	onclick={() => void setOpen(!open)}
	onkeydown={(e) => {
		if (e.key === "ArrowDown" || e.key === "ArrowUp") {
			e.preventDefault();
			void setOpen(true);
		}
	}}
>
	{#if text}
		{#if icon}<Icon name={icon} size={14} />{/if}
		<span>{text}</span>
		<Icon name="chevron-down" size={14} />
	{:else}
		<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
			<circle cx="5" cy="12" r="1.8" />
			<circle cx="12" cy="12" r="1.8" />
			<circle cx="19" cy="12" r="1.8" />
		</svg>
	{/if}
</button>

{#if open}
	<!-- svelte-ignore a11y_interactive_supports_focus -->
	<div
		bind:this={menuEl}
		id={menuId}
		class="menu"
		role="menu"
		use:portal
		aria-label={label}
		style={menuStyle}
		onkeydown={onMenuKeydown}
	>
		{#each items as item (item.label)}
			<button
				type="button"
				role="menuitem"
				class="item"
				class:destructive={item.tone === "destructive"}
				disabled={item.disabled}
				title={item.disabled ? item.reason : undefined}
				onclick={() => choose(item)}
			>
				{item.label}
				{#if item.disabled && item.reason}
					<span class="item-reason">{item.reason}</span>
				{/if}
			</button>
		{/each}
	</div>
{/if}

<style>
	.trigger {
		display: inline-grid;
		place-items: center;
		width: var(--control-h-sm);
		height: var(--control-h-sm);
		margin: 0;
		padding: 0;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--muted-foreground);
		cursor: pointer;
	}

	/* Labelled: the same shape as an outline button of the small size. */
	.trigger.labelled {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		width: auto;
		height: var(--button-h-sm, var(--control-h-sm));
		padding: 0 var(--space-3);
		color: var(--fg);
		font: inherit;
		font-size: var(--text-sm);
		font-weight: 500;
		white-space: nowrap;
	}

	.trigger:hover:not(:disabled),
	.trigger[aria-expanded="true"] {
		background: var(--surface-3);
		color: var(--foreground);
	}

	.trigger:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
	}

	.trigger:disabled {
		background: var(--surface-3);
		color: var(--fg-subtle);
		cursor: not-allowed;
	}

	.menu {
		position: fixed;
		z-index: 120;
		display: grid;
		min-width: 11rem;
		padding: var(--space-1);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-lg);
		background: var(--surface-2);
		box-shadow: var(--shadow-pop);
	}

	.item {
		display: flex;
		align-items: center;
		min-height: 2.25rem;
		margin: 0;
		padding: 0 var(--space-3);
		border: 0;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--foreground);
		font: inherit;
		font-size: var(--text-base);
		text-align: left;
		cursor: pointer;
	}

	.item:hover:not(:disabled),
	.item:focus-visible {
		outline: none;
		background: var(--surface-3);
	}

	.item.destructive {
		color: var(--danger);
	}

	.item.destructive:hover:not(:disabled),
	.item.destructive:focus-visible {
		background: var(--danger-wash);
	}

	.item:disabled {
		color: var(--fg-subtle);
		cursor: not-allowed;
	}

	.item:has(.item-reason) {
		flex-direction: column;
		align-items: flex-start;
		justify-content: center;
		padding-block: var(--space-1);
	}

	.item-reason {
		display: block;
		font-size: var(--text-xs);
		line-height: var(--leading-xs);
		color: var(--fg-subtle);
	}

	@media (max-width: 900px) {
		.trigger {
			width: 2.75rem;
			height: 2.75rem;
		}

		.item {
			min-height: 2.75rem;
		}
	}
</style>
