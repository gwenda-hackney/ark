<script lang="ts">
	import { Card, PageHeader } from "../../ui";
	import PourTargetsForm from "./PourTargetsForm.svelte";
</script>

<div class="page">
	<PageHeader
		title="Configuration"
		subtitle="House targets used by recipe analysis and the dashboard."
	/>

	<div class="stack">
		<Card
			title="Pour cost"
			subtitle="Ingredient cost as a share of selling price, by drink type."
		>
			<PourTargetsForm idPrefix="config-pour" />
		</Card>
	</div>
</div>

<style>
	.page {
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
