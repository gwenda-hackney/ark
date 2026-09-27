<script lang="ts">
	import { onMount } from "svelte";
	import { fly } from "svelte/transition";
	import { BusyOverlay, Card, PageHeader } from "../ui";
	import Icon from "../app/shell/Icon.svelte";
	import { easeOut, flyMs } from "../ui/motion";
	import * as api from "../app/api";
	import type { WebStatus } from "../app/api";
	import {
		issueHeat,
		marginAgainstTargetHeat,
		marginHeat,
		menuItemsFromSections,
		missMagnitude,
		ON_TARGET_BAND,
		pourDelta as pourCostDelta,
		summarizeDashboard,
		type DashboardSummary,
		type FlaggedRecipe,
		type Heat,
	} from "./dashboard";
	import { formatPourPercent } from "../menu/cost";
	import { loginNext } from "../app/nav";
	import { pourSettings } from "../config/settings.svelte";
	import type { InventoryItem } from "../inventory/types";
	import type { MenuSection } from "../menu/types";
	import {
		buildSyncMetrics,
		formatWhen,
		healthLabel,
		healthTone,
	} from "../website/web-metrics";

	let sections = $state<MenuSection[]>([]);
	let inventory = $state<InventoryItem[]>([]);
	let webStatus = $state<WebStatus | null>(null);
	let loaded = $state(false);
	let loadError = $state("");

	const ready = $derived(loaded && pourSettings.loaded && !loadError);
	const summary = $derived.by((): DashboardSummary | null => {
		if (!ready) return null;
		return summarizeDashboard(
			menuItemsFromSections(sections),
			inventory,
			pourSettings.targets,
		);
	});

	function signedPercent(value: number | null | undefined): string {
		if (value == null) return "";
		const text = formatPourPercent(value);
		return value > 0 ? `+${text}` : text;
	}

	function share(part: number, total: number): number {
		if (!total) return 0;
		return Math.round((part / total) * 1000) / 10;
	}

	function rowFill(row: FlaggedRecipe): number {
		return missMagnitude(pourCostDelta(row.pourCost, row.targetPourCost), row.margin);
	}

	function rowTone(row: FlaggedRecipe): "up" | "down" | "loss" {
		if (row.margin != null && row.margin < 0) return "loss";
		const delta = pourCostDelta(row.pourCost, row.targetPourCost);
		if (delta != null && delta > 0) return "down";
		return "up";
	}

	function issueWeight(row: FlaggedRecipe): number {
		return row.critical * 2 + row.warning;
	}

	const recipeTone = $derived.by((): Heat | "caution" => {
		if (!summary) return "ok";
		if (summary.recipesWithCritical > 0) {
			return issueHeat(summary.recipesWithCritical, summary.recipeCount);
		}
		if (summary.recipesWithWarning > 0) return "caution";
		return "ok";
	});

	const marginTone = $derived.by((): Heat => {
		if (!summary) return "ok";
		return marginHeat(summary.overTarget, summary.recipesAtLoss, summary.recipesPriced);
	});

	const gmHeat = $derived.by((): Heat => {
		if (!summary) return "ok";
		return marginAgainstTargetHeat(summary.marginVsTarget, summary.avgGrossMargin);
	});

	function gmValueTone(
		margin: number | null,
		delta: number | null,
	): "up" | "down" | "loss" | "muted" {
		if (margin == null) return "muted";
		if (margin < 0) return "loss";
		if (delta == null) return "muted";
		if (delta < -ON_TARGET_BAND) return "down";
		return "up";
	}

	function gmVerdict(delta: number, target: number): string {
		const targetText = formatPourPercent(target);
		if (Math.abs(delta) <= ON_TARGET_BAND) return `On the ${targetText} house target`;
		if (delta > 0) return `${formatPourPercent(delta)} above the ${targetText} house target`;
		return `${formatPourPercent(Math.abs(delta))} under the ${targetText} house target`;
	}

	const issueMaxWeight = $derived(
		summary
			? Math.max(1, ...summary.flaggedRecipes.slice(0, 8).map(issueWeight))
			: 1,
	);

	const previewEnv = $derived(webStatus?.environments.preview ?? null);
	const productionEnv = $derived(webStatus?.environments.production ?? null);
	const syncMetrics = $derived(
		previewEnv && productionEnv
			? buildSyncMetrics(previewEnv, productionEnv)
			: [],
	);

	const prodHealth = $derived(productionEnv?.health ?? null);
	const prodHealthTone = $derived(healthTone(productionEnv));
	const prodHealthLabel = $derived(healthLabel(productionEnv));

	onMount(() => {
		Promise.all([api.getMenu(), api.getInventory(false), api.getWebStatus().catch(() => null)])
			.then(([menuData, inventoryData, web]) => {
				sections = menuData.sections || [];
				inventory = inventoryData.items || [];
				webStatus = web;
				loadError = "";
			})
			.catch((err) => {
				const message =
					err instanceof Error ? err.message : "Failed to load dashboard.";
				if (message.startsWith("auth:")) {
					window.location.href = `/api/auth/login?next=${encodeURIComponent(loginNext("/"))}`;
					return;
				}
				loadError = message;
			})
			.finally(() => {
				loaded = true;
			});
	});
</script>

<div class="dash scrollbar-fade">
	<PageHeader
		title="Dashboard"
		subtitle="Stock that needs a look, then how the website is syncing and whether it is up."
	/>

	{#if loadError}
		<p class="error">{loadError}</p>
	{:else if ready && summary}
		<div
			class="ready"
			in:fly={{ y: 10, duration: flyMs, easing: easeOut }}
		>
		<section class="section" aria-labelledby="dash-stock">
			<h2 class="section-kicker" id="dash-stock">Stock</h2>
		<div class="panels">
			<Card
				fill
				class="heat-{recipeTone}"
				title="Flagged recipes"
				subtitle="Critical serve problems first, then warnings from spec analysis and missing data."
			>
					<div class="pair">
						<div
							class="fig"
							class:down={summary.recipesWithCritical > 0}
							class:up={summary.recipesWithCritical === 0 && summary.recipesWithWarning === 0}
						>
							<p class="value tnum">{summary.recipesWithCritical}</p>
							<p class="fig-label">Critical</p>
						</div>
						<div
							class="fig"
							class:warn={summary.recipesWithWarning > 0}
							class:up={summary.recipesWithWarning === 0 && summary.recipesWithCritical === 0}
						>
							<p class="value tnum">{summary.recipesWithWarning}</p>
							<p class="fig-label">Warnings</p>
						</div>
					</div>
					<div class="meter" aria-hidden="true">
						<span
							class="fill down"
							style:width="{share(summary.recipesWithCritical, summary.recipeCount)}%"
						></span>
						<span
							class="fill warn"
							style:width="{share(
								Math.max(0, summary.recipesWithIssues - summary.recipesWithCritical),
								summary.recipeCount,
							)}%"
						></span>
					</div>
					{#if summary.flaggedRecipes.length}
						<ul class="list scrollbar-fade">
							{#each summary.flaggedRecipes.slice(0, 8) as row (row.id)}
								<li>
									<div class="row-top">
										<a class="name" href={row.href}>{row.name}</a>
										<span class="counts">
											{#if row.critical}
												<span class="count down">
													<span class="count-n tnum">{row.critical}</span>
													crit
												</span>
											{/if}
											{#if row.warning}
												<span class="count warn">
													<span class="count-n tnum">{row.warning}</span>
													warn
												</span>
											{/if}
										</span>
									</div>
									<div class="meter" aria-hidden="true">
										<span
											class="fill down"
											style:width="{share(row.critical * 2, issueMaxWeight)}%"
										></span>
										<span
											class="fill warn"
											style:width="{share(row.warning, issueMaxWeight)}%"
										></span>
									</div>
								</li>
							{/each}
						</ul>
						{#if summary.flaggedRecipes.length > 8}
							<p class="more">
								{summary.flaggedRecipes.length - 8} more on Menu items.
							</p>
						{/if}
					{:else}
						<p class="empty">No recipe issues. Open a drink to read the full spec analysis.</p>
					{/if}
				{#snippet footer()}
					<a class="go" href="/menu">
						Menu items
						<Icon name="chevron-right" size={16} />
					</a>
				{/snippet}
			</Card>

			<Card
				fill
				class={summary.avgGrossMargin != null ? `heat-${gmHeat}` : `heat-${marginTone}`}
				title="Margin"
				subtitle="Average gross margin against the house target, then drinks that miss it."
			>
					<div class="pair">
						<div class="fig {gmValueTone(summary.avgGrossMargin, summary.marginVsTarget)}">
							<p class="value tnum">
								{summary.avgGrossMargin == null
									? "n/a"
									: formatPourPercent(summary.avgGrossMargin)}
							</p>
							<p class="fig-label">Gross margin</p>
						</div>
						<div
							class="fig"
							class:down={summary.overTarget > 0}
							class:up={summary.overTarget === 0 && summary.recipesPriced > 0}
						>
							<p class="value tnum">
								{summary.recipesPriced ? summary.overTarget : "n/a"}
							</p>
							<p class="fig-label">Over target</p>
						</div>
					</div>
					{#if summary.avgGrossMargin != null && summary.avgTargetMargin != null}
						{@const delta = summary.marginVsTarget}
						{@const tone = gmValueTone(summary.avgGrossMargin, delta)}
						<p class="hint {tone}">
							{#if delta == null}
								House target {formatPourPercent(summary.avgTargetMargin)}.
							{:else}
								{gmVerdict(delta, summary.avgTargetMargin)}.
							{/if}
							{summary.overTarget} over · {summary.onTarget} on · {summary.underTarget} under.
						</p>
					{/if}
					<div
						class="meter"
						aria-hidden="true"
						title="{summary.overTarget} of {summary.recipesPriced} priced drinks miss the house target"
					>
						<span
							class="fill"
							class:down={summary.recipesAtLoss === 0}
							class:loss={summary.recipesAtLoss > 0}
							style:width="{share(summary.overTarget, summary.recipesPriced)}%"
						></span>
					</div>
					{#if summary.pourOutliers.length}
						<ul class="list scrollbar-fade">
							{#each summary.pourOutliers.slice(0, 8) as row (row.id)}
								{@const tone = rowTone(row)}
								{@const delta = pourCostDelta(row.pourCost, row.targetPourCost)}
								<li>
									<div class="row-top">
										<a class="name" href={row.href}>{row.name}</a>
										<span class="figure tnum {tone}">
											{formatPourPercent(row.margin)}
											{#if row.margin != null && row.margin < 0}
												<span class="badge">below cost</span>
											{:else if delta != null}
												<span class="delta">{signedPercent(delta)} over</span>
											{/if}
										</span>
									</div>
									<div class="meter" aria-hidden="true">
										<span class="fill {tone}" style:width="{rowFill(row) * 100}%"></span>
									</div>
								</li>
							{/each}
						</ul>
					{:else}
						<p class="empty">
							{#if summary.recipesPriced === 0}
								Cost recipes and set menu prices to see gross margin.
							{:else}
								Priced drinks sit on the house target.
							{/if}
						</p>
					{/if}
				{#snippet footer()}
					<a class="go" href="/config">
						Pour targets
						<Icon name="chevron-right" size={16} />
					</a>
				{/snippet}
			</Card>
		</div>
		</section>

		<section class="section" aria-labelledby="dash-web">
			<h2 class="section-kicker" id="dash-web">Web</h2>
			<div class="panels web">
				<Card
					fill
					title="Sync"
					subtitle="Preview against production."
				>
					{#if !webStatus || !previewEnv || !productionEnv}
						<p class="empty">Website status did not load.</p>
					{:else}
						<div class="metrics">
							{#each syncMetrics as metric (metric.label)}
								<div class="metric" title={metric.title}>
									<p class="metric-label">{metric.label}</p>
									<p class="metric-value tnum {metric.tone}">{metric.value}</p>
								</div>
							{/each}
						</div>
					{/if}
					{#snippet footer()}
						<a class="go" href="/web">
							Web
							<Icon name="chevron-right" size={16} />
						</a>
					{/snippet}
				</Card>

				<Card
					fill
					title="Health"
					subtitle="Production only."
				>
					{#if !productionEnv}
						<p class="empty">Website status did not load.</p>
					{:else}
						<p class="health-mark {prodHealthTone}">{prodHealthLabel}</p>
						<p class="health-site">
							{#if productionEnv.siteUrl}
								<a href={productionEnv.siteUrl} target="_blank" rel="noreferrer">
									{productionEnv.siteUrl.replace(/^https:\/\//, "")}
								</a>
							{:else}
								gwenda.co.uk
							{/if}
						</p>
						<p class="hint">
							Last check {formatWhen(prodHealth?.lastCheckedAt)}.
							{#if prodHealth?.consecutiveFails}
								{" "}{prodHealth.consecutiveFails} failed
								{prodHealth.consecutiveFails === 1 ? "check" : "checks"} in a row.
							{/if}
						</p>
						{#if prodHealth?.lastError}
							<p class="hint down">{prodHealth.lastError}</p>
						{/if}
					{/if}
					{#snippet footer()}
						<a class="go" href="/web">
							Web
							<Icon name="chevron-right" size={16} />
						</a>
					{/snippet}
				</Card>
			</div>
		</section>
		</div>
	{/if}
	<BusyOverlay active={!ready && !loadError} label="Loading…" />
</div>

<style>
	.dash {
		position: relative;
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: var(--page-gutter);
	}

	.ready {
		display: flex;
		flex-direction: column;
		min-height: 0;
	}

	.section + .section {
		margin-top: var(--gap-lg);
	}

	.section-kicker {
		margin: 0 0 var(--gap);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--muted-foreground);
	}

	.error {
		margin: 0;
		color: var(--destructive);
	}

	.pair {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--gap-sm);
		min-width: 0;
		flex-shrink: 0;
	}

	.fig-label {
		margin: 0.15rem 0 0;
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--muted-foreground);
	}

	.fig.warn .value {
		color: var(--primary);
	}

	.meter {
		position: relative;
		display: flex;
		flex-shrink: 0;
		height: 0.4rem;
		border-radius: var(--radius-pill);
		background: color-mix(in srgb, var(--foreground) 8%, transparent);
		overflow: hidden;
	}

	.fill {
		display: block;
		height: 100%;
		min-width: 0;
	}

	.fill.down,
	.fill.loss {
		background: var(--down);
	}

	.fill.warn {
		background: var(--primary);
	}

	.fill.up {
		background: var(--up);
	}

	.fill.loss {
		box-shadow: inset 0 0 0 999px color-mix(in srgb, var(--down) 18%, transparent);
	}

	.kicker {
		margin: 0;
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--muted-foreground);
	}

	.value {
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(1.75rem, 3vw, 2.25rem);
		font-weight: 600;
		letter-spacing: -0.03em;
		line-height: 1.1;
	}

	.hint,
	.empty,
	.more {
		margin: 0;
		font-size: var(--text-sm);
		line-height: 1.5;
		color: var(--muted-foreground);
	}

	.hint {
		margin-top: auto;
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.hint.up {
		color: var(--up);
	}

	.hint.down,
	.hint.loss {
		color: var(--down);
	}

	.panels {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		grid-auto-rows: 28rem;
		gap: var(--gap);
	}

	.panels :global(.card) {
		height: 100%;
		min-height: 0;
	}

	.panels.web {
		grid-auto-rows: auto;
	}

	.metrics {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: var(--gap);
	}

	.metric-label {
		margin: 0;
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--muted-foreground);
	}

	.metric-value {
		margin: 0.35rem 0 0;
		font-family: var(--font-display);
		font-size: clamp(1.35rem, 2.2vw, 1.85rem);
		font-weight: 600;
		letter-spacing: -0.03em;
		line-height: 1.15;
		overflow-wrap: anywhere;
	}

	.metric-value.up {
		color: var(--up);
	}

	.metric-value.gold {
		color: var(--primary);
	}

	.metric-value.down {
		color: var(--down);
	}

	.metric-value.muted {
		color: var(--muted-foreground);
	}

	.metric-value.warn {
		color: var(--primary);
	}

	.metric-value.up {
		color: var(--up);
	}

	.metric-value.down {
		color: var(--down);
	}

	.metric-value.muted {
		color: var(--muted-foreground);
	}

	.health-mark {
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(2.5rem, 4vw, 3.4rem);
		font-weight: 600;
		letter-spacing: -0.04em;
		line-height: 1;
	}

	.health-site {
		margin: 0.45rem 0 0;
		font-size: var(--text);
	}

	.health-site a {
		color: inherit;
		text-decoration: none;
	}

	.health-site a:hover {
		color: var(--primary);
	}

	.panels :global(.card.heat-ok) {
		border-color: color-mix(in srgb, var(--up) 32%, var(--border));
		background: linear-gradient(
			165deg,
			color-mix(in srgb, var(--up) 14%, transparent),
			var(--card) 72%
		);
	}

	.panels :global(.card.heat-bad),
	.panels :global(.card.heat-severe) {
		border-color: color-mix(in srgb, var(--down) 40%, var(--border));
		background: linear-gradient(165deg, var(--destructive-wash), var(--card) 58%);
	}

	.panels :global(.card.heat-severe) {
		border-color: color-mix(in srgb, var(--down) 58%, transparent);
	}

	.panels :global(.subtitle) {
		min-height: calc(var(--text-sm) * 1.5 * 2);
	}

	.panels :global(.body.fill) {
		overflow: hidden;
	}

	.list {
		list-style: none;
		margin: 0.75rem 0 0;
		padding: 0;
		display: grid;
		gap: 0.65rem;
		align-content: start;
		flex: 1;
		min-height: 0;
		overflow-y: auto;
	}

	.list li {
		display: grid;
		gap: 0.3rem;
		min-width: 0;
	}

	.row-top {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.75rem;
		min-width: 0;
	}

	.figure {
		display: inline-flex;
		align-items: baseline;
		gap: 0.4rem;
		flex-shrink: 0;
		font-family: var(--font-display);
		font-size: 1.05rem;
		font-weight: 600;
		letter-spacing: -0.02em;
	}

	.delta,
	.badge {
		font-family: var(--font);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		opacity: 0.9;
	}

	.counts {
		display: inline-flex;
		gap: 0.6rem;
		flex-shrink: 0;
	}

	.count {
		display: inline-flex;
		align-items: baseline;
		gap: 0.22rem;
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--muted-foreground);
	}

	.count-n {
		font-family: var(--font-display);
		font-size: 1.05rem;
		font-weight: 600;
		letter-spacing: -0.02em;
	}

	.count.down,
	.count.down .count-n {
		color: var(--down);
	}

	.count.warn,
	.count.warn .count-n {
		color: var(--primary);
	}

	.warn {
		color: var(--primary);
	}

	.name {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: var(--text);
		font-weight: 500;
		color: inherit;
		text-decoration: none;
	}

	.name:hover {
		color: var(--primary);
	}

	.name:focus-visible,
	.go:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 3px;
	}

	.meta {
		flex-shrink: 0;
		font-size: var(--text-xs);
		color: var(--muted-foreground);
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}

	.empty,
	.more {
		margin-top: 0.75rem;
		flex-shrink: 0;
	}

	.go {
		display: inline-flex;
		align-items: center;
		gap: 0.125rem;
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--primary);
		text-decoration: none;
	}

	@media (max-width: 720px) {
		.panels,
		.metrics {
			grid-template-columns: 1fr;
		}
	}
</style>
