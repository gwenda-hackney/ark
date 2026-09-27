<script lang="ts">
	/**
	 * Time input that replaces the browser's two-column spinner: type it any
	 * way ("7pm", "1930", "19.30") or pick from one list in quarter hours.
	 * The list runs from the morning round to the small hours, so a late
	 * finish sits after the evening. Holds "HH:MM" like a native time input.
	 */
	import { onMount, tick } from "svelte";
	import { nearestIndex, parseTime, timeOptions } from "./time-input";

	let {
		value = $bindable(""),
		size = "md",
		id = undefined,
		placeholder = "e.g. 7pm",
		disabled = false,
		/** Where the list opens when the field is empty. */
		suggest = "19:00",
		class: className = "",
		...rest
	}: {
		value?: string;
		size?: "md" | "sm";
		id?: string;
		placeholder?: string;
		disabled?: boolean;
		suggest?: string;
		class?: string;
		"aria-label"?: string;
	} = $props();

	const options = timeOptions(15, 6);
	const listId = `time-${Math.random().toString(36).slice(2, 9)}`;

	let text = $state(value);
	let open = $state(false);
	let activeIndex = $state(-1);
	let invalid = $state(false);
	let wrapEl = $state<HTMLDivElement | undefined>();
	let inputEl = $state<HTMLInputElement | undefined>();
	let menuEl = $state<HTMLDivElement | undefined>();
	let menuStyle = $state("");

	// Outside changes (loading another event) replace what is shown.
	$effect(() => {
		const next = value;
		if (document.activeElement !== inputEl) {
			text = next;
			invalid = false;
		}
	});

	function placeMenu() {
		const box = wrapEl;
		if (!box) return;
		const rect = box.getBoundingClientRect();
		const gap = 6;
		const maxH = Math.min(260, window.innerHeight - 24);
		const spaceBelow = window.innerHeight - rect.bottom - gap - 12;
		const spaceAbove = rect.top - gap - 12;
		const openUp = spaceBelow < 160 && spaceAbove > spaceBelow;
		const height = Math.min(maxH, openUp ? spaceAbove : spaceBelow);
		const top = openUp ? Math.max(12, rect.top - gap - height) : rect.bottom + gap;
		menuStyle = [
			`top:${Math.round(top)}px`,
			`left:${Math.round(rect.left)}px`,
			`min-width:${Math.round(rect.width)}px`,
			`max-height:${Math.round(height)}px`,
		].join(";");
	}

	function scrollActive(block: ScrollLogicalPosition = "nearest") {
		menuEl?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block });
	}

	async function setOpen(next: boolean) {
		if (disabled) return;
		open = next;
		if (!next) return;
		const parsed = parseTime(text);
		activeIndex = nearestIndex(options, parsed || value || suggest);
		await tick();
		placeMenu();
		scrollActive("center");
	}

	function commit() {
		const parsed = parseTime(text);
		if (parsed === null) {
			invalid = true;
			return;
		}
		invalid = false;
		value = parsed;
		text = parsed;
	}

	function pick(time: string) {
		value = time;
		text = time;
		invalid = false;
		void setOpen(false);
		inputEl?.focus();
	}

	function onInput() {
		invalid = false;
		const parsed = parseTime(text);
		if (!open) {
			void setOpen(true);
			return;
		}
		if (parsed) {
			activeIndex = nearestIndex(options, parsed);
			void tick().then(() => scrollActive("center"));
		}
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === "ArrowDown" || e.key === "ArrowUp") {
			e.preventDefault();
			if (!open) {
				void setOpen(true);
				return;
			}
			const delta = e.key === "ArrowDown" ? 1 : -1;
			activeIndex = activeIndex < 0 ? 0 : (activeIndex + delta + options.length) % options.length;
			text = options[activeIndex];
			void tick().then(() => scrollActive());
			return;
		}
		if (e.key === "Enter") {
			e.preventDefault();
			const parsed = parseTime(text);
			if (parsed === null && open && activeIndex >= 0) pick(options[activeIndex]);
			else {
				commit();
				void setOpen(false);
			}
			return;
		}
		if (e.key === "Escape" && open) {
			e.preventDefault();
			text = value;
			invalid = false;
			void setOpen(false);
			return;
		}
		if (e.key === "Tab") void setOpen(false);
	}

	function onBlur(e: FocusEvent) {
		const to = e.relatedTarget as Node | null;
		if (to && menuEl?.contains(to)) return;
		commit();
	}

	onMount(() => {
		const onPointer = (e: PointerEvent) => {
			if (!open) return;
			const t = e.target as Node | null;
			if (wrapEl?.contains(t) || menuEl?.contains(t)) return;
			void setOpen(false);
		};
		const onReposition = (e: Event) => {
			if (!open || (e.target instanceof Node && menuEl?.contains(e.target))) return;
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

<div bind:this={wrapEl} class="wrap {size} {className}" class:open class:disabled class:invalid>
	<input
		bind:this={inputEl}
		bind:value={text}
		{id}
		{placeholder}
		{disabled}
		class="field"
		type="text"
		inputmode="text"
		autocomplete="off"
		spellcheck="false"
		role="combobox"
		aria-expanded={open}
		aria-controls={listId}
		aria-autocomplete="list"
		aria-invalid={invalid}
		aria-activedescendant={open && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
		onclick={() => {
			if (!open) void setOpen(true);
		}}
		oninput={onInput}
		onkeydown={onKeydown}
		onblur={onBlur}
		{...rest}
	/>
	<button
		type="button"
		class="toggle"
		tabindex="-1"
		{disabled}
		aria-label={open ? "Close times" : "Show times"}
		onclick={() => {
			void setOpen(!open);
			inputEl?.focus();
		}}
	>
		<svg
			width="15"
			height="15"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<circle cx="12" cy="12" r="9" />
			<path d="M12 7v5l3 2" />
		</svg>
	</button>

	{#if open}
		<div bind:this={menuEl} class="menu scrollbar-fade" style={menuStyle} role="listbox" id={listId}>
			{#each options as time, index (time)}
				<button
					type="button"
					class="option"
					class:hour={time.endsWith(":00")}
					class:active={index === activeIndex}
					class:selected={time === value}
					id="{listId}-{index}"
					data-index={index}
					role="option"
					aria-selected={time === value}
					tabindex="-1"
					onmousedown={(e) => e.preventDefault()}
					onclick={() => pick(time)}
					onmouseenter={() => (activeIndex = index)}
				>
					{time}
				</button>
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

	.wrap.invalid {
		border-color: var(--destructive, #d9534f);
	}

	.wrap.disabled {
		opacity: 0.5;
	}

	.field {
		flex: 1 1 auto;
		min-width: 0;
		height: 100%;
		box-sizing: border-box;
		margin: 0;
		padding: 0 0.25rem 0 0.75rem;
		border: 0;
		background: transparent;
		color: var(--foreground);
		font: inherit;
		font-size: var(--text);
		font-variant-numeric: tabular-nums;
		line-height: 1.25;
	}

	.sm .field {
		padding-left: 0.6875rem;
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
		padding: 0 0.6rem;
		border: 0;
		background: transparent;
		color: var(--muted-foreground);
		cursor: pointer;
	}

	.toggle:disabled {
		cursor: not-allowed;
	}

	.open .toggle {
		color: var(--foreground);
	}

	.menu {
		position: fixed;
		z-index: 80;
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		padding: 0.35rem;
		overflow: auto;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		background: var(--card);
		box-shadow: var(--shadow);
		box-sizing: border-box;
	}

	.option {
		width: 100%;
		margin: 0;
		padding: 0.45rem 0.65rem;
		border: 0;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--muted-foreground);
		font-size: var(--text);
		font-variant-numeric: tabular-nums;
		line-height: 1.3;
		text-align: left;
		cursor: pointer;
	}

	.option.hour {
		color: var(--foreground);
		font-weight: 500;
	}

	.option:hover,
	.option.active {
		background: var(--accent);
		color: var(--foreground);
	}

	.option.selected {
		background: var(--primary-wash);
		color: var(--foreground);
	}

	.option.selected.active,
	.option.selected:hover {
		background: var(--primary-wash-strong);
	}

	.option:focus {
		outline: none;
	}
</style>
