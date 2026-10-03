<script lang="ts">
	/**
	 * Styled select. Native option menus cannot be themed, so this is a
	 * button + listbox that matches TextField.
	 */
	import { onMount, tick } from "svelte";
	import type { SelectOption } from "./types";

	let {
		value = $bindable(""),
		options = [],
		size = "md",
		id = undefined,
		disabled = false,
		class: className = "",
		"aria-label": ariaLabel = undefined,
		onchange,
	}: {
		value?: string;
		options?: SelectOption[];
		size?: "md" | "sm";
		id?: string;
		disabled?: boolean;
		class?: string;
		"aria-label"?: string;
		onchange?: (e: { currentTarget: { value: string } }) => void;
	} = $props();

	let open = $state(false);
	let triggerEl = $state<HTMLButtonElement | undefined>();
	let menuEl = $state<HTMLDivElement | undefined>();
	let menuStyle = $state("");
	let activeIndex = $state(-1);

	const selected = $derived(
		options.find((opt) => opt.value === value) || null,
	);
	const label = $derived(selected?.label || "Select…");
	const enabledOptions = $derived(
		options
			.map((opt, index) => ({ opt, index }))
			.filter(({ opt }) => !opt.disabled),
	);

	function emit(next: string) {
		value = next;
		onchange?.({ currentTarget: { value: next } });
	}

	function placeMenu() {
		const trigger = triggerEl;
		if (!trigger) return;
		const rect = trigger.getBoundingClientRect();
		const gap = 6;
		const maxH = Math.min(280, window.innerHeight - 24);
		const spaceBelow = window.innerHeight - rect.bottom - gap - 12;
		const spaceAbove = rect.top - gap - 12;
		const openUp = spaceBelow < 160 && spaceAbove > spaceBelow;
		const height = Math.min(maxH, openUp ? spaceAbove : spaceBelow);
		const top = openUp
			? Math.max(12, rect.top - gap - height)
			: rect.bottom + gap;
		menuStyle = [
			`top:${Math.round(top)}px`,
			`left:${Math.round(rect.left)}px`,
			`width:${Math.round(rect.width)}px`,
			`max-height:${Math.round(height)}px`,
		].join(";");
	}

	async function setOpen(next: boolean) {
		if (disabled) return;
		open = next;
		if (!next) {
			activeIndex = -1;
			return;
		}
		const selectedIdx = options.findIndex((opt) => opt.value === value);
		activeIndex = selectedIdx >= 0 ? selectedIdx : enabledOptions[0]?.index ?? -1;
		await tick();
		placeMenu();
		menuEl?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.focus();
	}

	function choose(opt: SelectOption) {
		if (opt.disabled) return;
		emit(opt.value);
		void setOpen(false);
		triggerEl?.focus();
	}

	function onTriggerKeydown(e: KeyboardEvent) {
		if (disabled) return;
		if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			void setOpen(true);
		}
	}

	function onMenuKeydown(e: KeyboardEvent) {
		if (e.key === "Escape") {
			e.preventDefault();
			void setOpen(false);
			triggerEl?.focus();
			return;
		}
		if (e.key === "ArrowDown" || e.key === "ArrowUp") {
			e.preventDefault();
			const list = enabledOptions;
			if (!list.length) return;
			const current = list.findIndex(({ index }) => index === activeIndex);
			const delta = e.key === "ArrowDown" ? 1 : -1;
			const next =
				list[
					current < 0
						? 0
						: (current + delta + list.length) % list.length
				];
			activeIndex = next.index;
			menuEl
				?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
				?.focus();
			return;
		}
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			const opt = options[activeIndex];
			if (opt) choose(opt);
		}
	}

	onMount(() => {
		const onPointer = (e: PointerEvent) => {
			if (!open) return;
			const t = e.target as Node | null;
			if (triggerEl?.contains(t) || menuEl?.contains(t)) return;
			void setOpen(false);
		};
		const onReposition = () => {
			if (!open) return;
			placeMenu();
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

<div class="wrap {className}" class:open>
	<button
		bind:this={triggerEl}
		type="button"
		class="trigger {size}"
		{id}
		{disabled}
		aria-label={ariaLabel}
		aria-haspopup="listbox"
		aria-expanded={open}
		onclick={() => void setOpen(!open)}
		onkeydown={onTriggerKeydown}
	>
		<span class="label">{label}</span>
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

	{#if open}
		<div
			bind:this={menuEl}
			class="menu scrollbar-fade"
			style={menuStyle}
			role="listbox"
			tabindex="-1"
			aria-activedescendant={activeIndex >= 0 ? `${id || "sel"}-opt-${activeIndex}` : undefined}
			onkeydown={onMenuKeydown}
		>
			{#each options as opt, index (opt.value)}
				<button
					type="button"
					class="option"
					class:selected={opt.value === value}
					class:active={index === activeIndex}
					id="{id || "sel"}-opt-{index}"
					data-index={index}
					role="option"
					aria-selected={opt.value === value}
					disabled={opt.disabled}
					onclick={() => choose(opt)}
					onmouseenter={() => (activeIndex = index)}
				>
					<span class="option-label">{opt.label || "—"}</span>
					{#if opt.hint}
						<span class="option-hint">{opt.hint}</span>
					{/if}
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.wrap {
		position: relative;
		width: 100%;
		min-width: 0;
	}

	.trigger {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		width: 100%;
		min-width: 0;
		box-sizing: border-box;
		margin: 0;
		border: 1px solid var(--input);
		border-radius: var(--radius-md);
		background: var(--sunken);
		color: var(--foreground);
		line-height: 1.25;
		text-align: left;
		cursor: pointer;
		transition:
			border-color var(--t-fast) var(--ease-in-out),
			box-shadow var(--t-fast) var(--ease-in-out);
	}

	.md {
		height: var(--control-h);
		padding: 0 var(--space-3) 0 var(--space-3);
		font-size: var(--text-base);
	}

	.sm {
		height: var(--control-h-sm);
		padding: 0 var(--space-2) 0 var(--space-3);
		font-size: var(--text-base);
	}

	.label {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.chevron {
		flex-shrink: 0;
		color: var(--muted-foreground);
		transition: transform var(--t-fast) var(--ease);
	}

	.open .chevron {
		transform: rotate(180deg);
	}

	.trigger:hover:not(:disabled) {
		border-color: var(--border-strong);
	}

	.trigger:focus {
		outline: none;
		border-color: var(--ring);
		box-shadow: 0 0 0 3px var(--ring-wash);
	}

	.trigger:disabled {
		opacity: 0.5;
		cursor: not-allowed;
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

	.option:hover:not(:disabled),
	.option.active:not(:disabled) {
		background: var(--accent);
	}

	.option.selected {
		background: var(--primary-wash);
		color: var(--foreground);
	}

	.option.selected.active,
	.option.selected:hover:not(:disabled) {
		background: var(--primary-wash-strong);
	}

	.option:disabled {
		opacity: 0.4;
		cursor: not-allowed;
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
</style>
