<script lang="ts">
	import { untrack } from "svelte";
	import Field from "../Field.svelte";
	import { provideHelp } from "../help.svelte";

	let { provide = true, help }: { provide?: boolean; help?: string } = $props();

	if (untrack(() => provide)) provideHelp("Test", [{ title: "Price", body: "What guests pay." }]);
</script>

<Field label="Price" for="f-x" {help}><input id="f-x" /></Field>
