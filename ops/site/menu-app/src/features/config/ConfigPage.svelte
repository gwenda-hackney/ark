<script lang="ts">
	import { fly } from "svelte/transition";
	import { BusyOverlay, Card, PageHeader } from "../../ui";
	import PourTargetsForm from "./PourTargetsForm.svelte";
	import { pourSettings } from "../../lib/settings.svelte";
	import { easeOut, flyMs } from "../../lib/motion";

	const waited = !pourSettings.loaded;
</script>

<div class="page scrollbar-fade">
	<PageHeader
		title="Configuration"
		subtitle="House targets used by recipe analysis and the dashboard."
	/>

	{#if pourSettings.loaded}
		<div
			class="stack"
			in:fly={{ y: waited ? 10 : 0, duration: waited ? flyMs : 0, easing: easeOut }}
		>
			<Card
				title="Pour cost"
				subtitle="Ingredient cost as a share of selling price, by drink type."
			>
				<PourTargetsForm idPrefix="config-pour" />
			</Card>
		</div>
	{/if}
	<BusyOverlay active={!pourSettings.loaded} label="Loading…" />
</div>

<style>
	.page {
		position: relative;
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: var(--page-gutter);
	}

	.stack {
		display: grid;
		gap: var(--gap-lg);
		max-width: 36rem;
		align-content: start;
	}
</style>
