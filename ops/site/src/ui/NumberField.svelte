<script lang="ts">
	/**
	 * A figure with its unit: decimal keypad on phones, unit inside the box,
	 * arrows step it, and on blur it is tidied ("1,5" → "1.5") and checked
	 * against min/max. A problem is said under the Field, not only in red.
	 * Holds a string, like the forms it feeds.
	 */
	import type { HTMLInputAttributes } from "svelte/elements";
	import TextField from "./TextField.svelte";
	import { getFieldContext } from "./field-context";
	import { formatNumber, numberError, parseNumber } from "./number-input";

	let {
		value = $bindable(""),
		unit = "",
		prefix = "",
		min = undefined,
		max = undefined,
		step = 1,
		decimals = 2,
		/** Always show `decimals` places after blur (money). */
		fixed = false,
		integer = false,
		noun = undefined,
		example = undefined,
		size = "md",
		oncommit,
		onblur,
		onkeydown,
		oninput,
		...rest
	}: Omit<HTMLInputAttributes, "size" | "prefix" | "value" | "min" | "max" | "step"> & {
		value?: string;
		/** After the value: %, ml, cl. */
		unit?: string;
		/** Before the value: £. */
		prefix?: string;
		min?: number;
		max?: number;
		/** Arrow keys move by this much. */
		step?: number;
		decimals?: number;
		fixed?: boolean;
		integer?: boolean;
		/** For the message: "a percentage", "a price". */
		noun?: string;
		example?: string;
		size?: "md" | "sm";
		/** On blur, with the tidied value (only when it reads as a number or is blank). */
		oncommit?: (value: string) => void;
	} = $props();

	const field = getFieldContext();
	let error = $state("");

	$effect(() => {
		field?.setLocalError(error);
	});

	function tidy(raw: string): string {
		const n = parseNumber(raw);
		if (n === "" || n === null) return raw.trim();
		return formatNumber(n, { decimals: integer ? 0 : decimals, fixed });
	}

	function check(raw: string) {
		error = numberError(raw, { min, max, integer, noun, example });
	}

	function commit(e: FocusEvent & { currentTarget: EventTarget & HTMLInputElement }) {
		const next = tidy(e.currentTarget.value);
		check(next);
		if (!error && next !== value) value = next;
		if (!error) oncommit?.(next);
		onblur?.(e);
	}

	function stepBy(e: KeyboardEvent & { currentTarget: EventTarget & HTMLInputElement }) {
		onkeydown?.(e);
		if (e.defaultPrevented || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
		const n = parseNumber(e.currentTarget.value);
		if (n === null) return;
		e.preventDefault();
		let next = (n === "" ? (min ?? 0) : n) + (e.key === "ArrowUp" ? step : -step);
		if (min != null) next = Math.max(min, next);
		if (max != null) next = Math.min(max, next);
		// Through the DOM so bind:value and any oninput both see the new figure.
		e.currentTarget.value = formatNumber(next, { decimals: integer ? 0 : decimals, fixed });
		e.currentTarget.dispatchEvent(new Event("input", { bubbles: true }));
	}
</script>

<TextField
	bind:value
	{size}
	{prefix}
	suffix={unit}
	numeric
	invalid={Boolean(error) && !field}
	inputmode={integer ? "numeric" : "decimal"}
	autocomplete="off"
	onblur={commit}
	onkeydown={stepBy}
	oninput={(e) => {
		if (error) error = "";
		oninput?.(e);
	}}
	{...rest}
	type="text"
/>
