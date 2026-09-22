<script lang="ts">
	/**
	 * Pour list under the recipe. Each pour is one line:
	 * price · cost · target · actual · over/under.
	 * Extra sizes (double / half) are opt-in via a list row.
	 */
	import { Button, TextField } from "../../ui";
	import {
		altCostFactor,
		formatPourPercent,
		marginTone,
		serveVerdict,
		snapGbp,
		type RecipePriceAnalysis,
		type ServePourReading,
	} from "../../lib/cost";
	import { formatGbp, priceLabels } from "../../lib/types";
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

	<ul class="pours">
		{#if primary}
			{@const actualTone = pourTone(primary)}
			{@const deltaTone = overUnderTone(primary)}
			<li class="pour">
				<div class="pour-line">
					<label class="serve" for="f-cost-price">{primary.label}</label>
					<div class="price">
						<TextField
							id="f-cost-price"
							size="sm"
							mono
							align="end"
							inputmode="decimal"
							value={priceValue}
							oninput={(e) =>
								onprice((e.currentTarget as HTMLInputElement).value)}
						/>
					</div>
					<div class="metrics" role="group" aria-label={`${primary.label} pour metrics`}>
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
								class:muted={actualTone === "muted" || primary.pourCost == null}
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
							<TextField
								id="f-cost-price-alt"
								size="sm"
								mono
								align="end"
								inputmode="decimal"
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
					<div class="metrics" role="group" aria-label={`${labels.alt} pour metrics`}>
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
</section>

<PourSettingsDialog open={settingsOpen} onclose={() => (settingsOpen = false)} />

<style>
	.cost {
		display: grid;
		gap: 0.55rem;
		min-width: 0;
		margin-top: 0.85rem;
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
		flex: 0 1 auto;
		min-width: 0;
		margin: 0;
		font-family: var(--font-display);
		font-size: var(--text-md);
		font-weight: 600;
		letter-spacing: 0.04em;
		line-height: 1.3;
		color: var(--primary);
	}

	.section-title::after {
		content: none;
	}

	.note {
		flex: 1 1 auto;
		min-width: 0;
		margin: 0;
		font-size: var(--text-xs);
		letter-spacing: 0.04em;
		line-height: 1.2;
		color: var(--muted-foreground);
		white-space: nowrap;
	}

	.section-head :global(button) {
		flex: 0 0 auto;
		margin-left: auto;
	}

	.pours {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0;
		min-width: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--card);
		overflow: hidden;
	}

	.pour,
	.add {
		min-width: 0;
	}

	.pour + .pour,
	.pour + .add,
	.add + .pour {
		border-top: 1px solid var(--border);
	}

	.pour-line {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.55rem 0.85rem;
		min-width: 0;
		padding: 0.55rem 0.7rem;
	}

	.serve {
		flex: 0 0 auto;
		min-width: 3.5rem;
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--foreground);
	}

	.price-tools {
		display: inline-flex;
		align-items: center;
		gap: 0.1rem;
		flex: 0 0 auto;
	}

	.price {
		width: 5.5rem;
		flex: 0 0 5.5rem;
	}

	.metrics {
		display: flex;
		flex: 1 1 16rem;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: flex-end;
		gap: 0.65rem 1.1rem;
		min-width: 0;
	}

	.metric {
		display: grid;
		gap: 0.12rem;
		justify-items: end;
		min-width: 0;
	}

	.k {
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--muted-foreground);
		white-space: nowrap;
	}

	.v {
		font-size: var(--text-sm);
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		color: var(--foreground);
		white-space: nowrap;
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
		padding: 0.35rem 0.45rem;
	}

	@media (max-width: 720px) {
		.metrics {
			justify-content: flex-start;
			flex: 1 1 100%;
		}

		.metric {
			justify-items: start;
		}
	}
</style>
