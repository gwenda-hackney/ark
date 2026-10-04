<script lang="ts">
	/**
	 * Text field with a list: type anything, or open the list (chevron, arrow
	 * down) and pick. Typing narrows the list. Looks like NativeSelect.
	 */
	import { onMount, tick } from "svelte";
	import type { SelectOption } from "./types";
	import { getFieldContext } from "./field-context";

	let {
		value = $bindable(""),
		options = [],
		size = "md",
		id = undefined,
		placeholder = "",
		emptyText = "Nothing to pick yet",
		disabled = false,
		class: className = "",
		onpick,
	}: {
		value?: string;
		/** `label` is what goes in the field when picked. */
		options?: SelectOption[];
		size?: "md" | "sm";
		id?: string;
		placeholder?: string;
		/** Shown in the open list when there are no options at all. */
		emptyText?: string;
		disabled?: boolean;
		class?: string;
		onpick?: (option: SelectOption) => void;
	} = $props();

	const field = getFieldContext();
	let open = $state(false);
	/** Narrow the list by what was typed; off when opened from the chevron. */
	let filtering = $state(false);
	let activeIndex = $state(-1);
	let wrapEl = $state<HTMLDivElement | undefined>();
	let inputEl = $state<HTMLInputElement | undefined>();
	let menuEl = $state<HTMLDivElement | undefined>();
	let menuStyle = $state("");

	const shown = $derived.by(() => {
		const needle = value.trim().toLowerCase();
		const usable = options.filter((opt) => !opt.disabled);
		if (!filtering || !needle) return usable;
		return usable.filter((opt) => opt.label.toLowerCase().includes(needle));
	});

	function placeMenu() {
		const box = wrapEl;
		if (!box) return;
		const rect = box.getBoundingClientRect();
		const gap = 6;
		const maxH = Math.min(280, window.innerHeight - 24);
		const spaceBelow = window.innerHeight - rect.bottom - gap - 12;
		const spaceAbove = rect.top - gap - 12;
		const openUp = spaceBelow < 160 && spaceAbove > spaceBelow;
		const height = Math.min(maxH, openUp ? spaceAbove : spaceBelow);
		const top = openUp ? Math.max(12, rect.top - gap - height) : rect.bottom + gap;
		menuStyle = [
			`top:${Math.round(top)}px`,
			`left:${Math.round(rect.left)}px`,
			`width:${Math.round(rect.width)}px`,
			`max-height:${Math.round(height)}px`,
		].join(";");
	}

	async function setOpen(next: boolean, { filter = false } = {}) {
		if (disabled) return;
		open = next;
		filtering = filter;
		activeIndex = -1;
		if (!next) return;
		await tick();
		placeMenu();
	}

	function pick(opt: SelectOption) {
		value = opt.label;
		onpick?.(opt);
		void setOpen(false);
		inputEl?.focus();
	}

	function scrollActive() {
		menuEl?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
	}

	function onInput() {
		if (!open || !filtering) void setOpen(true, { filter: true });
		else activeIndex = -1;
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === "ArrowDown" || e.key === "ArrowUp") {
			e.preventDefault();
			if (!open) {
				void setOpen(true);
				return;
			}
			if (!shown.length) return;
			const delta = e.key === "ArrowDown" ? 1 : -1;
			activeIndex = activeIndex < 0 ? (delta > 0 ? 0 : shown.length - 1) : (activeIndex + delta + shown.length) % shown.length;
			void tick().then(scrollActive);
			return;
		}
		if (e.key === "Enter" && open && activeIndex >= 0 && shown[activeIndex]) {
			e.preventDefault();
			pick(shown[activeIndex]);
			return;
		}
		if (e.key === "Escape" && open) {
			e.preventDefault();
			void setOpen(false);
			return;
		}
		if (e.key === "Tab") void setOpen(false);
	}

	onMount(() => {
		const onPointer = (e: PointerEvent) => {
			if (!open) return;
			const t = e.target as Node | null;
			if (wrapEl?.contains(t) || menuEl?.contains(t)) return;
			void setOpen(false);
		};
		const onReposition = () => {
			if (open) placeMenu();
		};
		window.addEventListener("pointerdown", onPointer, true);
		window.addEventListener("resize", onReposition);
		window.addEventListener("scroll", onReposition, true);
		return () => {
			window.removeEventListener("pointerdown", onPointer, true);
			window.removeEventListener("resize", onReposition);
			window.removeEventListener("scroll", onReposition, true);
		};
	});
</script>

<div bind:this={wrapEl} class="wrap {size} {className}" class:open class:disabled>
	<input
		bind:this={inputEl}
		bind:value
		{id}
		{placeholder}
		{disabled}
		class="field"
		type="text"
		autocomplete="off"
		role="combobox"
		aria-expanded={open}
		aria-controls={id ? `${id}-list` : undefined}
		aria-autocomplete="list"
		aria-describedby={field?.describedBy}
		aria-invalid={field?.invalid || undefined}
		aria-activedescendant={open && activeIndex >= 0 ? `${id || "combo"}-opt-${activeIndex}` : undefined}
		oninput={onInput}
		onkeydown={onKeydown}
	/>
	<button
		type="button"
		class="toggle"
		tabindex="-1"
		{disabled}
		aria-label={open ? "Close list" : "Show list"}
		onclick={() => {
			void setOpen(!open);
			inputEl?.focus();
		}}
	>
		<svg
			class="chevron"
			width="14"
			height="14"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path d="m6 9 6 6 6-6" />
		</svg>
	</button>

	{#if open && (shown.length || !options.length)}
		<div bind:this={menuEl} class="menu scrollbar-fade" style={menuStyle} role="listbox" id={id ? `${id}-list` : undefined}>
			{#each shown as opt, index (opt.value)}
				<button
					type="button"
					class="option"
					class:active={index === activeIndex}
					class:selected={opt.label === value}
					id="{id || "combo"}-opt-{index}"
					data-index={index}
					role="option"
					aria-selected={opt.label === value}
					tabindex="-1"
					onclick={() => pick(opt)}
					onmouseenter={() => (activeIndex = index)}
				>
					<span class="option-label">{opt.label}</span>
					{#if opt.hint}
						<span class="option-hint">{opt.hint}</span>
					{/if}
				</button>
			{:else}
				<p class="empty">{emptyText}</p>
			{/each}
		</div>
	{/if}
</div>

<style>
	.wrap {
		position: relative;
		display: flex;
		align-items: center;
		width: 100%;
		min-width: 0;
		box-sizing: border-box;
		border: 1px solid var(--input);
		border-radius: var(--radius-md);
		background: var(--sunken);
		transition:
			border-color var(--t-fast) var(--ease-in-out),
			box-shadow var(--t-fast) var(--ease-in-out);
	}

	.wrap.md {
		height: var(--control-h);
	}

	.wrap.sm {
		height: var(--control-h-sm);
	}

	.wrap:hover:not(.disabled) {
		border-color: var(--border-strong);
	}

	.wrap:focus-within {
		border-color: var(--ring);
		box-shadow: 0 0 0 3px var(--ring-wash);
	}

	.wrap.disabled {
		background: var(--surface-3);
		color: var(--fg-subtle);
	}

	.field {
		flex: 1 1 auto;
		min-width: 0;
		height: 100%;
		box-sizing: border-box;
		margin: 0;
		padding: 0 var(--space-1) 0 var(--space-3);
		border: 0;
		background: transparent;
		color: var(--foreground);
		font: inherit;
		font-size: var(--text-base);
		line-height: 1.25;
	}

	.sm .field {
		padding-left: var(--space-3);
	}

	.field::placeholder {
		color: var(--subtle-foreground);
	}

	.field:focus {
		outline: none;
	}

	.toggle {
		display: grid;
		place-items: center;
		flex: 0 0 auto;
		height: 100%;
		margin: 0;
		padding: 0 var(--space-2);
		border: 0;
		background: transparent;
		color: var(--muted-foreground);
		cursor: pointer;
	}

	.toggle:disabled {
		cursor: not-allowed;
	}

	.chevron {
		transition: transform var(--t-fast) var(--ease);
	}

	.open .chevron {
		transform: rotate(180deg);
	}

	.menu {
		position: fixed;
		z-index: 80;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		padding: var(--space-1);
		overflow: auto;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		background: var(--card);
		box-shadow: var(--shadow);
		box-sizing: border-box;
	}

	.option {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		width: 100%;
		margin: 0;
		padding: var(--space-2) var(--space-3);
		border: 0;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--foreground);
		font-size: var(--text-base);
		line-height: 1.3;
		text-align: left;
		cursor: pointer;
	}

	.option:hover,
	.option.active {
		background: var(--accent);
	}

	.option.selected {
		background: var(--primary-wash);
	}

	.option.selected.active,
	.option.selected:hover {
		background: var(--primary-wash-strong);
	}

	.option:focus {
		outline: none;
	}

	.option-label {
		min-width: 0;
	}

	.option-hint {
		flex-shrink: 0;
		font-size: var(--text-xs);
		color: var(--muted-foreground);
	}

	.empty {
		margin: 0;
		padding: var(--space-2) var(--space-3);
		color: var(--muted-foreground);
		font-size: var(--text-sm);
	}
</style>
