<script lang="ts">
	/**
	 * Pour cost on the Pricing tab: each size's price (set on Build) on a bar
	 * against the price that hits the house pour target.
	 */
	import { Button } from "../ui";
	import { formatPourPercent, type ServePourReading, type RecipePriceAnalysis } from "./cost";
	import { formatGbp } from "../app/money";
	import { hasRecipe, priceLabels } from "./types";
	import { Icon } from "../app/shell";
	import PourSettingsDialog from "./PourSettingsDialog.svelte";
	import PriceGauge from "./PriceGauge.svelte";
	import { priceGauge } from "./price-gauge";

	let {
		price,
		priceValue = "",
		priceAltValue = "",
	}: {
		price: RecipePriceAnalysis;
		priceValue?: string;
		priceAltValue?: string;
	} = $props();

	let settingsOpen = $state(false);

	const labels = $derived(priceLabels(price.drinkType));
	const hasAlt = $derived(String(priceAltValue || "").trim() !== "");
	const rows = $derived(
		price.serves
			.filter((s) => s.key === "primary" || (hasAlt && labels.alt))
			.map((serve) => ({
				serve,
				label: serve.key === "alt" ? labels.alt || serve.label : serve.label,
				priceLabel: priceCopy(serve.key === "alt" ? priceAltValue : priceValue),
				gauge: priceGauge(serve, price.complete),
			})),
	);
	const hasRecipeCost = $derived(price.drinkCost != null || (price.lines || []).length > 0);

	function priceCopy(value: string): string {
		const raw = String(value || "").trim();
		if (!raw) return "No price";
		const n = Number(raw);
		if (Number.isFinite(n)) return formatGbp(n);
		return raw.startsWith("£") ? raw : `£${raw}`;
	}

	function factsCopy(serve: ServePourReading): string {
		const parts: string[] = [];
		if (serve.drinkCost != null) {
			const amount = formatGbp(serve.drinkCost);
			parts.push(`Costs ${price.hasEstimates ? "~" : ""}${amount} to make`);
		}
		if (serve.pourCost != null) {
			parts.push(`pour cost ${formatPourPercent(serve.pourCost)} (target ${formatPourPercent(price.targetPourCost)})`);
		}
		const text = parts.join(", ");
		return text.charAt(0).toUpperCase() + text.slice(1);
	}
</script>

<section class="cost" aria-label="Pour cost">
	<div class="section-head">
		<p class="section-title">Pour cost</p>
		{#if price.hasEstimates}
			<p class="note">Includes estimates</p>
		{/if}
		<Button
			variant="ghost"
			size="xs"
			type="button"
			aria-label="Pour cost settings"
			title="Pour targets"
			onclick={() => (settingsOpen = true)}
		>
			{#snippet icon()}
				<Icon name="settings" size={14} />
			{/snippet}
		</Button>
	</div>

	{#if !hasRecipeCost}
		<p class="empty">
			{hasRecipe(price.drinkType)
				? "Add ingredients on Build to cost this drink."
				: "Link stock on Build to cost this drink."}
		</p>
	{:else}
		<ul class="pours">
			{#each rows as row (row.serve.key)}
				<li class="pour">
					<div class="pour-head">
						<span class="serve">{row.label}</span>
						<span class="price-readout tnum" title="Prices are set on Build">{row.priceLabel}</span>
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
</section>

<PourSettingsDialog open={settingsOpen} onclose={() => (settingsOpen = false)} />

<style>
	.cost {
		display: grid;
		gap: var(--space-2);
		min-width: 0;
	}

	.section-head {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.section-title {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		flex: 0 1 auto;
		min-width: 0;
		margin: 0;
		font-size: var(--text-md);
		font-weight: 600;
		line-height: 1.3;
		color: var(--foreground);
	}

	.section-title::after {
		content: none;
	}

	.note {
		flex: 1 1 auto;
		min-width: 0;
		margin: 0;
		font-size: var(--text-xs);
		line-height: 1.2;
		color: var(--muted-foreground);
		white-space: nowrap;
	}

	.section-head :global(button) {
		flex: 0 0 auto;
		margin-left: auto;
	}

	.empty {
		margin: 0.15rem 0 0;
		font-size: var(--text-sm);
		line-height: 1.45;
		color: var(--muted-foreground);
	}

	.pours {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		min-width: 0;
	}

	.pour {
		display: grid;
		gap: var(--space-2);
		min-width: 0;
		padding-block: var(--space-4);
		border-top: 1px solid var(--border);
	}

	.pour:first-child {
		border-top: 0;
		padding-top: var(--space-2);
	}

	.pour-head {
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

	.price-readout {
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

	.verdict.muted strong {
		color: var(--fg-muted);
	}

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
