<script lang="ts">
	/**
	 * Pour cost on the Cost tab. Primary sell price is edited in the drink
	 * header; this panel shows metrics and edits the optional alt serve.
	 */
	import { Button, MoneyField } from "../ui";
	import {
		altCostFactor,
		formatPourPercent,
		marginTone,
		serveVerdict,
		snapGbp,
		type RecipePriceAnalysis,
		type ServePourReading,
	} from "./cost";
	import { formatGbp } from "../app/money";
	import { hasRecipe, priceLabels } from "./types";
	import { Icon } from "../app/shell";
	import PourSettingsDialog from "./PourSettingsDialog.svelte";

	let {
		price,
		priceValue = "",
		priceAltValue = "",
		onpricealt,
	}: {
		price: RecipePriceAnalysis;
		priceValue?: string;
		priceAltValue?: string;
		onpricealt: (value: string) => void;
	} = $props();

	let settingsOpen = $state(false);
	/** Local draft so Add pour can open an empty field before a price is saved. */
	let draftingAlt = $state(false);

	const labels = $derived(priceLabels(price.drinkType));
	const canOfferAlt = $derived(
		!!labels.alt && altCostFactor(price.drinkType) != null,
	);
	const hasAlt = $derived(String(priceAltValue || "").trim() !== "");
	const showAlt = $derived(hasAlt || draftingAlt);
	const primary = $derived(price.serves.find((s) => s.key === "primary") ?? null);
	const alt = $derived(price.serves.find((s) => s.key === "alt") ?? null);
	const primaryPriceLabel = $derived.by(() => {
		const raw = String(priceValue || "").trim();
		if (!raw) return "Set price in the header";
		const n = Number(raw);
		if (Number.isFinite(n)) return formatGbp(n);
		return raw.startsWith("£") ? raw : `£${raw}`;
	});
	const hasRecipeCost = $derived(
		price.drinkCost != null || (price.lines || []).length > 0,
	);

	$effect(() => {
		if (hasAlt) draftingAlt = false;
	});

	function costCopy(serve: ServePourReading | null): string {
		if (!serve || serve.drinkCost == null) return "n/a";
		const amount = formatGbp(serve.drinkCost);
		return price.hasEstimates ? `~${amount}` : amount;
	}

	function actualCopy(serve: ServePourReading | null): string {
		if (!serve) return "n/a";
		if (serve.pourCost != null) return formatPourPercent(serve.pourCost);
		if (serve.price == null) return "set price";
		return "n/a";
	}

	function overUnderCopy(serve: ServePourReading | null): string {
		if (!serve) return "n/a";
		const verdict = serveVerdict(serve, price.complete);
		return verdict?.headline || "n/a";
	}

	function overUnderTone(serve: ServePourReading | null): string {
		if (!serve) return "muted";
		const verdict = serveVerdict(serve, price.complete);
		if (!verdict) return "muted";
		if (verdict.tone === "ok") return "up";
		if (verdict.tone === "high" || verdict.tone === "low") return "down";
		if (verdict.tone === "loss") return "loss";
		return "muted";
	}

	function pourTone(serve: ServePourReading | null) {
		if (!serve) return "muted";
		return marginTone(serve.margin, serve.pourCost, price.targetPourCost);
	}

	function addAlt() {
		const factor = altCostFactor(price.drinkType);
		if (
			factor != null &&
			price.drinkCost != null &&
			price.complete &&
			price.targetPourCost > 0
		) {
			const suggested = snapGbp(
				(price.drinkCost * factor) / (price.targetPourCost / 100),
			);
			onpricealt(String(suggested));
			return;
		}
		draftingAlt = true;
		onpricealt("");
	}

	function removeAlt() {
		draftingAlt = false;
		onpricealt("");
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
			{#if primary}
				{@const actualTone = pourTone(primary)}
				{@const deltaTone = overUnderTone(primary)}
				<li class="pour">
					<div class="pour-line">
						<span class="serve">{primary.label}</span>
						<p class="price-readout tnum" title="Edit sell price in the header">
							{primaryPriceLabel}
						</p>
						<div
							class="metrics"
							role="group"
							aria-label={`${primary.label} pour metrics`}
						>
							<div class="metric">
								<span class="k">Cost</span>
								<span class="v tnum">{costCopy(primary)}</span>
							</div>
							<div class="metric">
								<span class="k">Target</span>
								<span class="v tnum muted">
									{formatPourPercent(price.targetPourCost) || "n/a"}
								</span>
							</div>
							<div class="metric">
								<span class="k">Actual</span>
								<span
									class="v tnum"
									class:up={actualTone === "up"}
									class:down={actualTone === "down"}
									class:loss={actualTone === "loss"}
									class:muted={actualTone === "muted" ||
										primary.pourCost == null}
								>
									{actualCopy(primary)}
								</span>
							</div>
							<div class="metric">
								<span class="k">Over/under</span>
								<span
									class="v tnum"
									class:up={deltaTone === "up"}
									class:down={deltaTone === "down"}
									class:loss={deltaTone === "loss"}
									class:muted={deltaTone === "muted"}
								>
									{overUnderCopy(primary)}
								</span>
							</div>
						</div>
					</div>
				</li>
			{/if}

			{#if showAlt && labels.alt}
				{@const actualTone = pourTone(alt)}
				{@const deltaTone = overUnderTone(alt)}
				<li class="pour">
					<div class="pour-line">
						<label class="serve" for="f-cost-price-alt">{labels.alt}</label>
						<div class="price-tools">
							<div class="price">
								<MoneyField
									id="f-cost-price-alt"
									size="sm"
									align="end"
									value={priceAltValue}
									oninput={(e) =>
										onpricealt(
											(e.currentTarget as HTMLInputElement).value,
										)}
								/>
							</div>
							<Button
								variant="ghost"
								size="xs"
								type="button"
								aria-label={`Remove ${labels.alt.toLowerCase()} price`}
								title={`Remove ${labels.alt.toLowerCase()}`}
								onclick={removeAlt}
							>
								{#snippet icon()}
									<Icon name="close" size={14} />
								{/snippet}
							</Button>
						</div>
						<div
							class="metrics"
							role="group"
							aria-label={`${labels.alt} pour metrics`}
						>
							<div class="metric">
								<span class="k">Cost</span>
								<span class="v tnum">{costCopy(alt)}</span>
							</div>
							<div class="metric">
								<span class="k">Target</span>
								<span class="v tnum muted">
									{formatPourPercent(price.targetPourCost) || "n/a"}
								</span>
							</div>
							<div class="metric">
								<span class="k">Actual</span>
								<span
									class="v tnum"
									class:up={actualTone === "up"}
									class:down={actualTone === "down"}
									class:loss={actualTone === "loss"}
									class:muted={actualTone === "muted" || !alt?.pourCost}
								>
									{actualCopy(alt)}
								</span>
							</div>
							<div class="metric">
								<span class="k">Over/under</span>
								<span
									class="v tnum"
									class:up={deltaTone === "up"}
									class:down={deltaTone === "down"}
									class:loss={deltaTone === "loss"}
									class:muted={deltaTone === "muted"}
								>
									{overUnderCopy(alt)}
								</span>
							</div>
						</div>
					</div>
				</li>
			{:else if canOfferAlt && labels.alt}
				<li class="add">
					<Button variant="ghost" size="xs" type="button" onclick={addAlt}>
						{#snippet icon()}
							<Icon name="plus" size={14} />
						{/snippet}
						Add {labels.alt.toLowerCase()}
					</Button>
				</li>
			{/if}
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
		font-size: var(--text-base);
		font-weight: 600;
		line-height: 1.25rem;
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
		gap: var(--space-2);
		min-width: 0;
	}

	.pour {
		min-width: 0;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: transparent;
	}

	.pour-line {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
		min-width: 0;
	}

	.serve {
		flex: 0 0 auto;
		min-width: 4.5rem;
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--foreground);
	}

	.price,
	.price-tools {
		flex: 0 0 auto;
	}

	.price-tools {
		display: flex;
		align-items: center;
		gap: 0.2rem;
	}

	.price-readout {
		flex: 0 0 auto;
		min-width: 4.5rem;
		margin: 0;
		font-size: var(--text-sm);
		font-weight: 600;
		line-height: 1.2;
		text-align: end;
		color: var(--foreground);
		font-variant-numeric: tabular-nums;
		font-feature-settings: var(--font-features-num);
	}

	.price :global(input) {
		width: 5.5rem;
	}

	.metrics {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: flex-end;
		gap: var(--space-2) var(--space-4);
		flex: 1 1 auto;
		min-width: 0;
	}

	.metric {
		display: grid;
		gap: 0.1rem;
		justify-items: end;
		min-width: 3.5rem;
	}

	.k {
		font-size: var(--text-2xs);
		letter-spacing: var(--tracking-label);
		color: var(--muted-foreground);
		font-weight: 600;
		text-transform: uppercase;
	}

	.v {
		font-size: var(--text-sm);
		font-weight: 600;
		line-height: 1.2;
		color: var(--foreground);
	}

	.v.up {
		color: var(--up);
	}

	.v.down,
	.v.loss {
		color: var(--down);
	}

	.v.muted,
	.muted {
		color: var(--muted-foreground);
		font-weight: 500;
	}

	.add {
		padding: var(--space-1) var(--space-2);
	}

	@media (max-width: 720px) {
		.metrics {
			justify-content: flex-start;
			flex: 1 1 100%;
		}

		.metric {
			justify-items: start;
		}

		.price-readout {
			text-align: start;
		}
	}
</style>
