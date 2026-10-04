<script lang="ts">
	/**
	 * One size's price on a bar: red while it's too cheap for the pour target,
	 * green once it earns enough, amber when it may be too dear. The tick is
	 * the target price; the pin is the menu price.
	 */
	import { formatGbp } from "../app/money";
	import type { PriceGauge } from "./price-gauge";

	let { gauge, label }: { gauge: PriceGauge; label: string } = $props();

	const CAPTIONS = { loss: "Loss", low: "Too cheap", good: "Healthy", high: "May be too dear" } as const;
</script>

<div
	class="gauge"
	role="img"
	aria-label={`${label}: ${gauge.headline}. ${gauge.detail}`}
>
	<div class="above">
		{#if gauge.targetPos != null}
			<span class="target-label tnum" style:left={`${gauge.targetPos}%`}>
				Target {formatGbp(gauge.target)}
			</span>
		{/if}
	</div>
	<div class="track" class:empty={!gauge.zones.length}>
		{#each gauge.zones as zone (zone.tone)}
			<span class="zone {zone.tone}" style:left={`${zone.from}%`} style:width={`${zone.to - zone.from}%`}></span>
		{/each}
		{#if gauge.targetPos != null}
			<span class="tick" style:left={`${gauge.targetPos}%`}></span>
		{/if}
		{#if gauge.pricePos != null}
			<span class="pin {gauge.tone}" style:left={`${gauge.pricePos}%`}></span>
		{/if}
	</div>
	<div class="below" aria-hidden="true">
		{#each gauge.zones as zone (zone.tone)}
			{#if zone.to - zone.from >= (zone.tone === "high" ? 22 : 12)}
				<span class="caption {zone.tone}" style:left={`${zone.from}%`} style:width={`${zone.to - zone.from}%`}>
					{CAPTIONS[zone.tone]}
				</span>
			{/if}
		{/each}
	</div>
</div>

<style>
	.gauge {
		display: grid;
		gap: var(--space-1);
		min-width: 0;
	}

	.above,
	.below {
		position: relative;
		height: 1rem;
		font-size: var(--text-2xs);
		line-height: 1rem;
	}

	.target-label {
		position: absolute;
		transform: translateX(-50%);
		white-space: nowrap;
		color: var(--fg-muted);
		font-weight: 600;
	}

	.track {
		position: relative;
		height: 0.625rem;
		border-radius: var(--radius-pill);
		background: var(--surface-3);
	}

	.zone {
		position: absolute;
		top: 0;
		bottom: 0;
	}

	.zone:first-child {
		border-radius: var(--radius-pill) 0 0 var(--radius-pill);
	}

	.zone:nth-last-child(1 of .zone) {
		border-radius: 0 var(--radius-pill) var(--radius-pill) 0;
	}

	.zone.loss {
		background: color-mix(in srgb, var(--danger) 55%, transparent);
	}

	.zone.low {
		background: color-mix(in srgb, var(--danger) 26%, transparent);
	}

	.zone.good {
		background: color-mix(in srgb, var(--success) 45%, transparent);
	}

	.zone.high {
		background: color-mix(in srgb, var(--warning) 32%, transparent);
	}

	.tick {
		position: absolute;
		top: -0.25rem;
		bottom: -0.25rem;
		width: 2px;
		transform: translateX(-50%);
		background: var(--fg-muted);
	}

	.pin {
		position: absolute;
		top: 50%;
		width: 1.125rem;
		height: 1.125rem;
		transform: translate(-50%, -50%);
		border: 3px solid var(--surface-1);
		border-radius: 50%;
		background: var(--fg);
		box-shadow: 0 0 0 1px var(--border-strong);
	}

	.pin.loss,
	.pin.low {
		background: var(--danger);
	}

	.pin.good {
		background: var(--success);
	}

	.pin.high {
		background: var(--warning);
	}

	.caption {
		position: absolute;
		overflow: hidden;
		text-align: center;
		white-space: nowrap;
		text-overflow: ellipsis;
		color: var(--fg-subtle);
	}
</style>
