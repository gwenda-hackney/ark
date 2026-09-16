<script lang="ts">
	/**
	 * Cost under the recipe: drink cost, target, and pour readings per serve.
	 * Alt size (double / half) is opt-in via "Add pour".
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

	const drinkCostLabel = $derived.by(() => {
		if (price.drinkCost == null) return "n/a";
		const amount = formatGbp(price.drinkCost);
		return price.hasEstimates ? `~${amount}` : amount;
	});

	$effect(() => {
		if (hasAlt) draftingAlt = false;
	});

	function pourCopy(serve: ServePourReading | null): string {
		if (!serve) return "n/a";
		if (serve.pourCost != null) return formatPourPercent(serve.pourCost);
		if (!price.complete && price.drinkCost == null) return "n/a";
		if (serve.price == null) return "set price";
		return "n/a";
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

	<div class="summary">
		<div class="row">
			<span class="label">Drink cost</span>
			<span class="value tnum">{drinkCostLabel}</span>
		</div>
		<div class="row">
			<span class="label">Target</span>
			<span class="value tnum muted">
				{formatPourPercent(price.targetPourCost) || "n/a"}
			</span>
		</div>
	</div>

	{#if primary}
		{@const tone = marginTone(
			primary.margin,
			primary.pourCost,
			price.targetPourCost,
		)}
		{@const verdict = serveVerdict(primary, price.complete)}
		<div class="serve">
			<div class="row">
				<label class="label" for="f-cost-price">{primary.label}</label>
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
			</div>
			<div class="row">
				<span class="label">Pour cost</span>
				<span
					class="value tnum"
					class:up={tone === "up"}
					class:down={tone === "down"}
					class:loss={tone === "loss"}
					class:muted={tone === "muted" || primary.pourCost == null}
				>
					{pourCopy(primary)}
				</span>
			</div>
			{#if verdict && primary.pourCost != null}
				<p
					class="verdict"
					class:ok={verdict.tone === "ok"}
					class:low={verdict.tone === "low"}
					class:loss={verdict.tone === "loss"}
					class:muted={verdict.tone === "muted"}
				>
					{verdict.headline} vs target{#if primary.suggestedPrice != null && verdict.tone !== "ok"}
						{" "}· aim {formatGbp(primary.suggestedPrice)}{/if}
				</p>
			{/if}
		</div>
	{/if}

	{#if showAlt && labels.alt}
		{@const tone = alt
			? marginTone(alt.margin, alt.pourCost, price.targetPourCost)
			: "muted"}
		{@const verdict = alt ? serveVerdict(alt, price.complete) : null}
		<div class="serve">
			<div class="row">
				<label class="label" for="f-cost-price-alt">{labels.alt}</label>
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
			</div>
			{#if alt}
				<div class="row">
					<span class="label">Pour cost</span>
					<span
						class="value tnum"
						class:up={tone === "up"}
						class:down={tone === "down"}
						class:loss={tone === "loss"}
						class:muted={tone === "muted" || alt.pourCost == null}
					>
						{pourCopy(alt)}
					</span>
				</div>
				{#if verdict && alt.pourCost != null}
					<p
						class="verdict"
						class:ok={verdict.tone === "ok"}
						class:low={verdict.tone === "low"}
						class:loss={verdict.tone === "loss"}
						class:muted={verdict.tone === "muted"}
					>
						{verdict.headline} vs target{#if alt.suggestedPrice != null && verdict.tone !== "ok"}
							{" "}· aim {formatGbp(alt.suggestedPrice)}{/if}
					</p>
				{/if}
			{:else}
				<p class="hint">Enter a {labels.alt.toLowerCase()} menu price.</p>
			{/if}
		</div>
	{:else if canOfferAlt && labels.alt}
		<div class="add-row">
			<Button variant="ghost" size="xs" type="button" onclick={addAlt}>
				{#snippet icon()}
					<Icon name="plus" size={14} />
				{/snippet}
				Add {labels.alt.toLowerCase()}
			</Button>
		</div>
	{/if}

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

	.summary,
	.serve {
		display: grid;
		gap: 0.3rem;
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

	.price-tools {
		display: inline-flex;
		align-items: center;
		gap: 0.15rem;
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

	.value.muted,
	.muted {
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

	.hint {
		margin: 0;
		font-size: var(--text-sm);
		line-height: 1.4;
		color: var(--muted-foreground);
	}

	.add-row {
		padding-top: 0.35rem;
	}

	.note {
		margin: 0.1rem 0 0;
		font-size: var(--text-xs);
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--muted-foreground);
	}
</style>
