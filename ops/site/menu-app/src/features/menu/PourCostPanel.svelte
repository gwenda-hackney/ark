<script lang="ts">
	/**
	 * Working cost numbers under the recipe: drink cost, menu prices,
	 * and live pour cost per serve, stacked so they can be scanned.
	 */
	import { Button, TextField } from "../../ui";
	import {
		formatPourPercent,
		marginTone,
		serveVerdict,
		type RecipePriceAnalysis,
	} from "../../lib/cost";
	import { formatGbp } from "../../lib/types";
	import { Icon } from "../../shell";
	import PourSettingsDialog from "./PourSettingsDialog.svelte";

	let {
		price,
		priceValue = "",
		priceAltValue = "",
		onprice,
		onpricealt,
	}: {
		price: RecipePriceAnalysis;
		priceValue?: string;
		priceAltValue?: string;
		onprice: (value: string) => void;
		onpricealt: (value: string) => void;
	} = $props();

	let settingsOpen = $state(false);

	const drinkCostLabel = $derived.by(() => {
		if (price.drinkCost == null) return "n/a";
		const amount = formatGbp(price.drinkCost);
		return price.hasEstimates ? `~${amount}` : amount;
	});

	function servePrice(key: "primary" | "alt"): string {
		return key === "alt" ? priceAltValue : priceValue;
	}

	function setServePrice(key: "primary" | "alt", value: string) {
		if (key === "alt") onpricealt(value);
		else onprice(value);
	}

	function pourCopy(serve: RecipePriceAnalysis["serves"][number]): string {
		if (serve.pourCost != null) return formatPourPercent(serve.pourCost);
		if (!price.complete && price.drinkCost == null) return "n/a";
		if (serve.price == null) return "no price";
		return "n/a";
	}
</script>

<section class="panel" aria-label="Cost and pour">
	<div class="section-head">
		<p class="section-title">Cost</p>
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

	<div class="rows">
		<div class="row">
			<span class="label">Drink cost</span>
			<span class="value tnum">{drinkCostLabel}</span>
		</div>
		<div class="row">
			<span class="label">Target pour</span>
			<span class="value tnum">
				{formatPourPercent(price.targetPourCost) || "n/a"}
			</span>
		</div>
	</div>

	{#each price.serves.filter((serve) => serve.key === "alt") as serve (serve.key)}
		{@const tone = marginTone(
			serve.margin,
			serve.pourCost,
			price.targetPourCost,
		)}
		{@const verdict = serveVerdict(serve, price.complete)}
		{@const fieldId = serve.key === "alt" ? "f-price-alt" : "f-price"}
		<div class="serve">
			<div class="row">
				<label class="label" for={fieldId}>{serve.label}</label>
				<div class="price">
					<TextField
						id={fieldId}
						size="sm"
						mono
						align="end"
						inputmode="decimal"
						value={servePrice(serve.key)}
						oninput={(e) =>
							setServePrice(
								serve.key,
								(e.currentTarget as HTMLInputElement).value,
							)}
					/>
				</div>
			</div>
			<div class="row">
				<span class="label">Pour</span>
				<span
					class="value tnum"
					class:up={tone === "up"}
					class:down={tone === "down"}
					class:loss={tone === "loss"}
					class:muted={tone === "muted" || serve.pourCost == null}
				>
					{pourCopy(serve)}
				</span>
			</div>
			{#if verdict && serve.pourCost != null}
				<p
					class="verdict"
					class:ok={verdict.tone === "ok"}
					class:low={verdict.tone === "low"}
					class:loss={verdict.tone === "loss"}
					class:muted={verdict.tone === "muted"}
				>
					{verdict.headline}{#if serve.suggestedPrice != null && verdict.tone !== "ok"}
						{" "}· {formatGbp(serve.suggestedPrice)}{/if}
				</p>
			{/if}
		</div>
	{/each}

	{#if price.hasEstimates}
		<p class="note">Includes estimates</p>
	{/if}
</section>

<PourSettingsDialog open={settingsOpen} onclose={() => (settingsOpen = false)} />

<style>
	.panel {
		display: grid;
		gap: 0.7rem;
		min-width: 0;
		padding: 0.85rem 0.95rem 1rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--sunken);
	}

	.section-head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.section-title {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex: 1 1 auto;
		min-width: 0;
		margin: 0;
		font-size: var(--text-md);
		font-weight: 600;
		letter-spacing: 0.04em;
		line-height: 1.3;
		color: var(--primary);
	}

	.section-title::after {
		content: "";
		flex: 1 1 auto;
		height: 1px;
		min-width: 1.5rem;
		background: var(--border-strong);
	}

	.rows,
	.serve {
		display: grid;
		gap: 0.35rem;
		min-width: 0;
	}

	.serve {
		padding-top: 0.65rem;
		border-top: 1px solid var(--border);
	}

	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.85rem;
		min-height: var(--control-h-sm);
	}

	.price {
		width: 6.5rem;
		flex: 0 0 6.5rem;
	}

	.label {
		min-width: 0;
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--muted-foreground);
	}

	.value {
		font-size: var(--text-md);
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		color: var(--foreground);
		text-align: right;
		white-space: nowrap;
	}

	.value.up {
		color: var(--up);
	}

	.value.down,
	.value.loss {
		color: var(--down);
	}

	.value.muted {
		color: var(--muted-foreground);
		font-weight: 500;
	}

	.verdict {
		margin: 0;
		text-align: right;
		font-size: var(--text-sm);
		line-height: 1.35;
		color: var(--muted-foreground);
	}

	.verdict.ok {
		color: var(--up);
	}

	.verdict.low,
	.verdict.loss {
		color: var(--down);
	}

	.verdict.muted {
		color: var(--muted-foreground);
	}

	.note {
		margin: 0.1rem 0 0;
		font-size: var(--text-xs);
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--muted-foreground);
	}
</style>
