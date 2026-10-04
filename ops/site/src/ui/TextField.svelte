<script lang="ts">
	/**
	 * Recessed input against the card, gold ring on focus. Numbers get
	 * tabular figures and lose the spinner so columns of figures line up.
	 * `numeric` does the same for typed figures; `mono` is for IDs and codes.
	 * `prefix` / `suffix` sit inside the box for units (£, %, ml); `leading`
	 * puts an icon at its start (a lock on a figure worked out for you).
	 * Read-only is muted like disabled but still focusable and copyable.
	 * Inside a Field it picks up the hint or error for screen readers.
	 */
	import type { Snippet } from "svelte";
	import type { HTMLInputAttributes } from "svelte/elements";
	import { getFieldContext, joinIds } from "./field-context";

	let {
		value = $bindable(""),
		size = "md",
		mono = false,
		numeric = false,
		align = "start",
		type = "text",
		prefix = "",
		suffix = "",
		leading,
		invalid = false,
		element = $bindable(),
		class: className = "",
		"aria-describedby": describedByProp,
		"aria-invalid": invalidProp,
		...rest
	}: Omit<HTMLInputAttributes, "size" | "prefix"> & {
		value?: string;
		size?: "md" | "sm";
		mono?: boolean;
		numeric?: boolean;
		align?: "start" | "end";
		/** Unit before the value, such as £. */
		prefix?: string;
		/** Unit after the value, such as % or ml. */
		suffix?: string;
		/** An icon inside the box, before the value. */
		leading?: Snippet;
		/** Danger edge without a Field error (a cell in a table, say). */
		invalid?: boolean;
		element?: HTMLInputElement;
	} = $props();

	const field = getFieldContext();
	const isFile = $derived(type === "file");
	const describedBy = $derived(joinIds(describedByProp as string | undefined, field?.describedBy));
	const ariaInvalid = $derived(
		invalid || field?.invalid || invalidProp === true || invalidProp === "true" ? true : undefined,
	);
	const affixed = $derived(Boolean(prefix || suffix || leading));
</script>

{#if isFile}
	<input
		class="input {size} {className}"
		type="file"
		aria-describedby={describedBy}
		{...rest}
	/>
{:else if affixed}
	<div class="affix-box {size} {className}" class:invalid={ariaInvalid}>
		{#if leading}<span class="affix lead" aria-hidden="true">{@render leading()}</span>{/if}
		{#if prefix}<span class="affix" aria-hidden="true">{prefix}</span>{/if}
		<input
			bind:this={element}
			class="input bare"
			class:mono
			class:numeric
			class:end={align === "end"}
			{type}
			bind:value
			aria-describedby={describedBy}
			aria-invalid={ariaInvalid}
			{...rest}
		/>
		{#if suffix}<span class="affix" aria-hidden="true">{suffix}</span>{/if}
	</div>
{:else}
	<input
		bind:this={element}
		class="input {size} {className}"
		class:mono
		class:numeric
		class:invalid={ariaInvalid}
		class:end={align === "end"}
		{type}
		bind:value
		aria-describedby={describedBy}
		aria-invalid={ariaInvalid}
		{...rest}
	/>
{/if}
<style>
	.input {
		display: block;
		width: 100%;
		min-width: 0;
		box-sizing: border-box;
		margin: 0;
		border: 1px solid var(--input);
		border-radius: var(--radius-md);
		background: var(--sunken);
		color: var(--field-foreground);
		line-height: 1.25;
		transition:
			border-color var(--t-fast) var(--ease-in-out),
			box-shadow var(--t-fast) var(--ease-in-out);
	}

	.md {
		height: var(--control-h);
		padding: 0 var(--space-3);
		font-size: var(--text-base);
	}

	.sm {
		height: var(--control-h-sm);
		padding: 0 var(--space-3);
		font-size: var(--text-base);
	}

	.mono {
		font-family: var(--font-mono);
	}

	.numeric {
		font-variant-numeric: tabular-nums;
		font-feature-settings: var(--font-features-num);
	}

	.end {
		text-align: right;
	}

	.input::placeholder {
		color: var(--subtle-foreground);
	}

	.input:hover:not(:disabled, [readonly]) {
		border-color: var(--border-strong);
	}

	.input:focus {
		outline: none;
		border-color: var(--ring);
		box-shadow: 0 0 0 3px var(--ring-wash);
	}

	.input:disabled {
		background: var(--surface-3);
		color: var(--fg-subtle);
		cursor: not-allowed;
	}

	.input[readonly]:not(:disabled) {
		background: var(--surface-3);
		color: var(--muted-foreground);
	}

	.input.invalid,
	.affix-box.invalid {
		border-color: var(--danger);
	}

	/* Units live inside the box; the input inside loses its own chrome. */
	.affix-box {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		width: 100%;
		min-width: 0;
		box-sizing: border-box;
		padding: 0 var(--space-3);
		border: 1px solid var(--input);
		border-radius: var(--radius-md);
		background: var(--sunken);
		transition:
			border-color var(--t-fast) var(--ease-in-out),
			box-shadow var(--t-fast) var(--ease-in-out);
	}

	.affix-box.md {
		height: var(--control-h);
	}

	.affix-box.sm {
		height: var(--control-h-sm);
	}

	.affix-box:hover:not(:has(:disabled, [readonly])) {
		border-color: var(--border-strong);
	}

	.affix-box:focus-within {
		border-color: var(--ring);
		box-shadow: 0 0 0 3px var(--ring-wash);
	}

	.affix-box:has(:disabled),
	.affix-box:has(.input[readonly]) {
		background: var(--surface-3);
	}

	.input.bare[readonly]:not(:disabled) {
		background: transparent;
	}

	.affix {
		flex-shrink: 0;
		color: var(--muted-foreground);
		font-size: var(--text-base);
		font-variant-numeric: tabular-nums;
		font-feature-settings: var(--font-features-num);
		user-select: none;
	}

	.affix.lead {
		display: inline-flex;
		align-items: center;
	}

	.input.bare {
		flex: 1 1 auto;
		height: 100%;
		padding: 0;
		border: 0;
		background: transparent;
		font-size: var(--text-base);
		box-shadow: none;
	}

	.input.bare:focus {
		box-shadow: none;
	}

	.input[type="number"] {
		font-variant-numeric: tabular-nums;
		font-feature-settings: var(--font-features-num);
		appearance: textfield;
	}

	.input[type="number"]::-webkit-outer-spin-button,
	.input[type="number"]::-webkit-inner-spin-button {
		appearance: none;
		margin: 0;
	}

	.input[type="file"] {
		height: auto;
		min-height: var(--control-h-sm);
		padding: var(--space-2) var(--space-3);
		font-size: var(--text-sm);
		color: var(--muted-foreground);
	}

	.input[type="file"]::file-selector-button {
		margin-right: var(--space-3);
		padding: var(--space-1) var(--space-3);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--foreground);
		font: inherit;
		font-size: var(--text-sm);
		font-weight: 500;
		cursor: pointer;
	}
</style>
