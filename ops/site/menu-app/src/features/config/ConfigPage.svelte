<script lang="ts">
	import { onMount } from "svelte";
	import { fly } from "svelte/transition";
	import { BusyOverlay, Card, PageHeader } from "../../ui";
	import PourTargetsForm from "./PourTargetsForm.svelte";
	import { pourSettings } from "../../lib/settings.svelte";
	import { getMe, type AuthMe } from "../../lib/api";
	import { easeOut, flyMs } from "../../lib/motion";

	const waited = !pourSettings.loaded;
	let connection = $state<AuthMe | null>(null);

	onMount(() => {
		void getMe()
			.then((row) => {
				connection = row;
			})
			.catch(() => {
				connection = null;
			});
	});

	const baserowHref = $derived(
		connection?.databaseId
			? `https://baserow.io/database/${connection.databaseId}/`
			: "",
	);
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
			{#if connection}
				<Card
					title="Environment"
					subtitle="Which Baserow database this ops session writes to."
				>
					<dl class="env-grid">
						<div>
							<dt>Site</dt>
							<dd>{connection.envLabel}</dd>
						</div>
						<div>
							<dt>Database</dt>
							<dd>
								{#if baserowHref}
									<a href={baserowHref} target="_blank" rel="noreferrer">
										{connection.databaseLabel}
										<span class="mono">({connection.databaseId})</span>
									</a>
								{:else}
									{connection.databaseLabel}
								{/if}
							</dd>
						</div>
						{#if connection.risk}
							<div class="span warn">
								<dt>Warning</dt>
								<dd>
									{#if connection.risk === "nonprod_on_production_db"}
										This non-production session is pointed at the production Ops
										database. Do not edit until BASEROW_OPS_DATABASE_ID is fixed.
									{:else}
										Production is pointed at a non-production Ops database.
										Check BASEROW_OPS_DATABASE_ID.
									{/if}
								</dd>
							</div>
						{/if}
					</dl>
				</Card>
			{/if}

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

	.env-grid {
		display: grid;
		gap: 0.85rem;
		margin: 0;
	}

	.env-grid > div {
		display: grid;
		gap: 0.2rem;
	}

	.env-grid .span {
		padding-top: 0.35rem;
		border-top: 1px solid var(--border);
	}

	.env-grid .warn dd {
		color: var(--warning);
	}

	.env-grid dt {
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--muted-foreground);
	}

	.env-grid dd {
		margin: 0;
		font-size: var(--text);
		font-weight: 500;
		color: var(--foreground);
	}

	.env-grid a {
		color: var(--primary);
		text-decoration: none;
	}

	.env-grid a:hover {
		text-decoration: underline;
	}

	.mono {
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 0.9em;
		font-weight: 500;
		color: var(--muted-foreground);
	}
</style>
