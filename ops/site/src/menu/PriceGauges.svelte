<script lang="ts">
	/**
	 * Under the price table: each costed price on a bar against the price
	 * that hits the house pour target, with the verdict in words.
	 */
	import { formatGbp } from "../app/money";
	import { formatPourPercent, type RecipePriceAnalysis, type ServePourReading } from "./cost";
	import PriceGauge from "./PriceGauge.svelte";
	import { priceGauge } from "./price-gauge";

	let { price }: { price: RecipePriceAnalysis } = $props();

	const rows = $derived(
		(price.priceRows ?? [])
			.filter((row) => row.serve != null)
			.map((row) => ({
				key: row.index,
				label: [row.name, row.size].filter(Boolean).join(" · ") || `Price ${row.index + 1}`,
				serve: row.serve as ServePourReading,
				gauge: priceGauge(row.serve, price.complete),
			})),
	);

	function factsCopy(serve: ServePourReading): string {
		const parts: string[] = [];
		if (serve.drinkCost != null) {
			parts.push(`Costs ${price.hasEstimates ? "~" : ""}${formatGbp(serve.drinkCost)} to make`);
		}
		if (serve.pourCost != null) {
			parts.push(`pour cost ${formatPourPercent(serve.pourCost)} (target ${formatPourPercent(price.targetPourCost)})`);
		}
		const text = parts.join(", ");
		return text.charAt(0).toUpperCase() + text.slice(1);
	}
</script>

{#if rows.length}
	<ul class="gauges">
		{#each rows as row (row.key)}
			<li class="row">
				<div class="head">
					<span class="serve">{row.label}</span>
					<span class="price tnum">{row.serve.price != null ? formatGbp(row.serve.price) : "No price"}</span>
					<span class="verdict {row.gauge.tone}">
						<strong>{row.gauge.headline}</strong>
						<span class="detail">{row.gauge.detail}</span>
					</span>
				</div>
				<PriceGauge gauge={row.gauge} label={row.label} />
				{#if factsCopy(row.serve)}
					<p class="facts tnum">{factsCopy(row.serve)}</p>
				{/if}
			</li>
		{/each}
	</ul>
{/if}

<style>
	.gauges {
		display: grid;
		margin: 0;
		padding: 0;
		list-style: none;
		min-width: 0;
	}

	.row {
		display: grid;
		gap: var(--space-2);
		min-width: 0;
		padding-block: var(--space-4);
		border-top: 1px solid var(--border);
	}

	.row:first-child {
		border-top: 0;
		padding-top: 0;
	}

	.row:last-child {
		padding-bottom: 0;
	}

	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-1) var(--space-3);
		min-width: 0;
	}

	.serve {
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--fg-muted);
	}

	.price {
		font-size: var(--text-lg);
		font-weight: 600;
		color: var(--fg);
	}

	.verdict {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-1) var(--space-2);
		margin-left: auto;
		font-size: var(--text-sm);
	}

	.verdict strong {
		font-weight: 600;
	}

	.verdict.good strong {
		color: var(--success);
	}

	.verdict.low strong,
	.verdict.loss strong {
		color: var(--danger);
	}

	.verdict.high strong {
		color: var(--warning);
	}

	.verdict.muted strong,
	.detail {
		color: var(--fg-muted);
	}

	.facts {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--fg-subtle);
	}

	@media (max-width: 720px) {
		.verdict {
			margin-left: 0;
			flex-basis: 100%;
		}
	}
</style>
