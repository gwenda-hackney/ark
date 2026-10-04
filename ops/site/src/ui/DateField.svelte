<script lang="ts">
	/**
	 * A date in British order on every device. Native date inputs follow the
	 * browser's language, not the page's, so desktop Chrome set to US English
	 * shows mm/dd/yyyy whatever `lang` says. This is a text field that reads
	 * dd/mm/yyyy (and "24 Oct", "241026", "today"), shows the weekday, and has
	 * a calendar button that opens the device's own picker through a hidden
	 * native input: tapped directly on phones, showPicker() on desktop. Holds
	 * "YYYY-MM-DD" like a native date input.
	 */
	import { getFieldContext, joinIds } from "./field-context";
	import { DATE_ERROR, dateRangeError, formatDateGB, parseDate, weekdayShort } from "./date-input";

	let {
		value = $bindable(""),
		id = undefined,
		size = "md",
		min = "",
		max = "",
		disabled = false,
		placeholder = "dd/mm/yyyy",
		class: className = "",
		"aria-label": ariaLabel = undefined,
		"aria-describedby": describedByProp = undefined,
		oncommit,
	}: {
		value?: string;
		id?: string;
		size?: "md" | "sm";
		/** "YYYY-MM-DD". */
		min?: string;
		max?: string;
		disabled?: boolean;
		placeholder?: string;
		class?: string;
		"aria-label"?: string;
		"aria-describedby"?: string;
		/** After a typed or picked date is accepted. */
		oncommit?: (value: string) => void;
	} = $props();

	const field = getFieldContext();
	let text = $state(formatDateGB(value));
	let error = $state("");
	let inputEl = $state<HTMLInputElement | undefined>();

	const weekday = $derived(weekdayShort(value));
	const describedBy = $derived(joinIds(describedByProp, field?.describedBy));
	const invalid = $derived(Boolean(error) || Boolean(field?.invalid));

	// Outside changes (another event loaded) replace what is shown.
	$effect(() => {
		const next = value;
		if (typeof document === "undefined" || document.activeElement !== inputEl) {
			text = formatDateGB(next);
			error = "";
		}
	});

	$effect(() => {
		field?.setLocalError(error);
	});

	function accept(next: string) {
		error = dateRangeError(next, min, max);
		if (error) return;
		text = formatDateGB(next);
		if (next === value) return;
		value = next;
		oncommit?.(next);
	}

	function commit() {
		const parsed = parseDate(text);
		if (parsed === null) {
			error = DATE_ERROR;
			return;
		}
		accept(parsed);
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === "Enter") {
			// Enter reads the date; it doesn't submit the form half-typed.
			e.preventDefault();
			commit();
		}
		if (e.key === "Escape" && text !== formatDateGB(value)) {
			e.preventDefault();
			e.stopPropagation();
			text = formatDateGB(value);
			error = "";
		}
	}

	function openPicker(e: MouseEvent) {
		const picker = e.currentTarget as HTMLInputElement;
		picker.value = value;
		// Phones open their picker on the tap itself. Desktop browsers only
		// open it from their own icon, so ask for it.
		if (typeof window !== "undefined" && window.matchMedia?.("(pointer: fine)").matches) {
			try {
				picker.showPicker?.();
			} catch {
				/* not allowed here: the tap still focuses it */
			}
		}
	}
</script>

<div class="date {size} {className}" class:invalid class:disabled>
	<input
		bind:this={inputEl}
		bind:value={text}
		{id}
		{placeholder}
		{disabled}
		class="text"
		type="text"
		inputmode="numeric"
		autocomplete="off"
		spellcheck="false"
		aria-label={ariaLabel}
		aria-describedby={describedBy}
		aria-invalid={invalid || undefined}
		oninput={() => (error = "")}
		onblur={commit}
		onkeydown={onKeydown}
	/>
	{#if weekday && !error}
		<span class="weekday" aria-hidden="true">{weekday}</span>
	{/if}
	<span class="cal">
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
			<rect x="3.5" y="5" width="17" height="15" rx="2" />
			<path d="M3.5 10h17M8 3v4M16 3v4" />
		</svg>
		<input
			class="picker"
			type="date"
			tabindex="-1"
			aria-label="Choose from a calendar"
			{disabled}
			min={min || undefined}
			max={max || undefined}
			onclick={openPicker}
			onchange={(e) => {
				const next = (e.currentTarget as HTMLInputElement).value;
				if (next) accept(next);
				inputEl?.focus();
			}}
		/>
	</span>
</div>

<style>
	.date {
		position: relative;
		display: flex;
		align-items: center;
		width: 100%;
		/* dd/mm/yyyy, the weekday and the calendar button always fit. */
		min-width: 10.5rem;
		box-sizing: border-box;
		border: 1px solid var(--input);
		border-radius: var(--radius-md);
		background: var(--sunken);
		transition:
			border-color var(--t-fast) var(--ease-in-out),
			box-shadow var(--t-fast) var(--ease-in-out);
	}

	.date.md {
		height: var(--control-h);
	}

	.date.sm {
		height: var(--control-h-sm);
	}

	.date:hover:not(.disabled) {
		border-color: var(--border-strong);
	}

	.date:focus-within {
		border-color: var(--ring);
		box-shadow: 0 0 0 3px var(--ring-wash);
	}

	.date.invalid {
		border-color: var(--danger);
	}

	.date.disabled {
		background: var(--surface-3);
		color: var(--fg-subtle);
	}

	.text {
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
		font-variant-numeric: tabular-nums;
		font-feature-settings: var(--font-features-num);
	}

	.text::placeholder {
		color: var(--subtle-foreground);
	}

	.text:focus {
		outline: none;
	}

	.weekday {
		flex-shrink: 0;
		color: var(--muted-foreground);
		font-size: var(--text-sm);
	}

	.cal {
		position: relative;
		display: grid;
		place-items: center;
		flex-shrink: 0;
		width: 2rem;
		height: 100%;
		color: var(--muted-foreground);
	}

	.cal:hover {
		color: var(--foreground);
	}

	/* The real date input sits over the icon, invisible, so a tap opens the device picker. */
	.picker {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		margin: 0;
		padding: 0;
		border: 0;
		opacity: 0;
		cursor: pointer;
	}

	.picker::-webkit-calendar-picker-indicator {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		cursor: pointer;
	}

	.picker:disabled {
		cursor: not-allowed;
	}

	@media (pointer: coarse) {
		.cal {
			width: 2.75rem;
		}
	}
</style>
