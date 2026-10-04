<script lang="ts">
	/** Pounds: £ inside the box, decimal keypad, two places after blur ("12" → "12.00"). */
	import type { ComponentProps } from "svelte";
	import NumberField from "./NumberField.svelte";

	let {
		value = $bindable(""),
		min = 0,
		...rest
	}: Omit<ComponentProps<typeof NumberField>, "prefix" | "unit" | "decimals" | "fixed"> = $props();
</script>

<NumberField
	bind:value
	prefix="£"
	decimals={2}
	fixed
	step={0.5}
	{min}
	noun="an amount in pounds"
	example="12.50"
	placeholder="0.00"
	{...rest}
/>
