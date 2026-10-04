<script lang="ts">
	/** Test harness: one Field around a chosen control. */
	import Field from "../Field.svelte";
	import TextField from "../TextField.svelte";
	import TimeField from "../TimeField.svelte";
	import MoneyField from "../MoneyField.svelte";
	import DateField from "../DateField.svelte";

	let {
		control = "text",
		error = "",
		hint = "",
		optional = false,
		required = false,
		width = "full",
	}: {
		control?: "text" | "time" | "money" | "date";
		error?: string;
		hint?: string;
		optional?: boolean;
		required?: boolean;
		width?: "xs" | "sm" | "md" | "lg" | "full";
	} = $props();
</script>

<Field label="Price" for="f-x" {error} {hint} {optional} {required} {width}>
	{#if control === "time"}
		<TimeField id="f-x" value="19:00" />
	{:else if control === "money"}
		<MoneyField id="f-x" value="12.5" />
	{:else if control === "date"}
		<DateField id="f-x" value="2026-10-24" />
	{:else}
		<TextField id="f-x" value="hello" />
	{/if}
</Field>
