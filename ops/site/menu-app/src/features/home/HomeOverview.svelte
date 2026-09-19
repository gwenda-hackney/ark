<script lang="ts">
	import { onMount } from "svelte";
	import { fly } from "svelte/transition";
	import { BusyOverlay, Card, PageHeader } from "../../ui";
	import Icon from "../../shell/Icon.svelte";
	import { easeOut, flyMs } from "../../lib/motion";
	import * as api from "../../lib/api";
	import {
		clampPercent,
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
	} from "../../lib/dashboard";
	import { formatPourPercent } from "../../lib/cost";
	import { loginNext } from "../../lib/nav";
	import { pourSettings } from "../../lib/settings.svelte";
	import { INVENTORY_KINDS } from "../../lib/types";
	import type { InventoryItem, MenuSection } from "../../lib/types";

	let sections = $state<MenuSection[]>([]);
	let inventory = $state<InventoryItem[]>([]);
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

	function kindLabel(kind: string): string {
		return INVENTORY_KINDS.find((row) => row.value === kind)?.label || kind;
	}

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

	onMount(() => {
		Promise.all([api.getMenu(), api.getInventory(false)])
			.then(([menuData, inventoryData]) => {
				sections = menuData.sections || [];
				inventory = inventoryData.items || [];
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
		subtitle="Critical issues, warnings, gross margin, and stock that still sits on estimates."
	/>

	{#if loadError}
		<p class="error">{loadError}</p>
	{:else if ready && summary}
		<div
			class="ready"
			in:fly={{ y: 10, duration: flyMs, easing: easeOut }}
		>
		<div class="stats">
			<div class="stat heat-{recipeTone}">
				<p class="kicker">Recipe issues</p>
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
					<div
						class="meter"
						aria-hidden="true"
						title="{summary.recipesWithIssues} of {summary.recipeCount} drinks have issues"
					>
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
					<p class="hint">
						{#if summary.recipeCount === 0}
							No drinks on the menu yet.
						{:else if summary.recipesWithIssues === 0}
							None of {summary.recipeCount}
							{summary.recipeCount === 1 ? "drink has" : "drinks have"} an issue.
						{:else}
							{summary.recipesWithIssues} of {summary.recipeCount}
							{summary.recipeCount === 1 ? "drink needs" : "drinks need"} a look.
						{/if}
					</p>
			</div>

			<div class="stat {summary.avgGrossMargin != null ? `heat-${gmHeat}` : ''}">
				<p class="kicker">Gross margin</p>
				{#if summary.avgGrossMargin == null || summary.avgTargetMargin == null}
					<p class="value tnum muted">n/a</p>
					<p class="hint">
						Need a complete cost and a menu price to read margin.
					</p>
				{:else}
					{@const delta = summary.marginVsTarget}
					{@const tone = gmValueTone(summary.avgGrossMargin, delta)}
					<p class="value tnum {tone}">{formatPourPercent(summary.avgGrossMargin)}</p>
					<div
						class="meter target-meter"
						title="House target {formatPourPercent(summary.avgTargetMargin)}"
					>
						<span
							class="fill {tone}"
							style:width="{clampPercent(summary.avgGrossMargin)}%"
						></span>
						<span
							class="mark"
							style:left="{clampPercent(summary.avgTargetMargin)}%"
						></span>
					</div>
					<p class="hint {tone}">
						{#if delta == null}
							House target {formatPourPercent(summary.avgTargetMargin)}.
						{:else}
							{gmVerdict(delta, summary.avgTargetMargin)}.
						{/if}
						{summary.recipesPriced}
						{summary.recipesPriced === 1 ? "drink" : "drinks"} priced.
					</p>
				{/if}
			</div>

			<div class="stat">
				<p class="kicker">Pour cost</p>
				{#if summary.recipesPriced === 0}
					<p class="value tnum muted">n/a</p>
					<p class="hint">No drinks have a complete pour-cost reading yet.</p>
				{:else}
					<p
						class="value tnum"
						class:down={summary.overTarget > 0}
						class:up={summary.overTarget === 0}
					>
						{summary.overTarget}
					</p>
					<p class="hint">
						{summary.overTarget} over target · {summary.onTarget} on · {summary.underTarget} under.
					</p>
				{/if}
			</div>

			<div class="stat">
				<p class="kicker">Estimated stock</p>
					<p
						class="value tnum"
						class:down={summary.inventoryEstimated > 0}
						class:up={summary.inventoryEstimated === 0 && summary.inventoryCount > 0}
					>
						{summary.inventoryEstimated}
					</p>
					<p class="hint">
						{#if summary.inventoryCount === 0}
							No inventory items yet.
						{:else if summary.inventoryEstimated === 0}
							All {summary.inventoryCount} items have a trade price.
						{:else}
							{summary.inventoryEstimated} of {summary.inventoryCount} items have no trade price.
							{#if summary.inventoryItemEstimates}
								{" "}{summary.inventoryItemEstimates} carry a stand-in pack cost.
							{/if}
						{/if}
					</p>
			</div>
		</div>

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
								{summary.flaggedRecipes.length - 8} more on Recipes.
							</p>
						{/if}
					{:else}
						<p class="empty">No recipe issues. Open a drink to read the full spec analysis.</p>
					{/if}
				{#snippet footer()}
					<a class="go" href="/menu">
						Recipes
						<Icon name="chevron-right" size={16} />
					</a>
				{/snippet}
			</Card>

			<Card
				fill
				class="heat-{marginTone}"
				title="Margin outliers"
				subtitle="Drinks over the house pour-cost target. Negative margin is a drink sold below cost."
			>
					<div class="pair">
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
						<div
							class="fig"
							class:loss={summary.lowestMargin != null && summary.lowestMargin < 0}
							class:down={summary.lowestMargin != null &&
								summary.lowestMargin >= 0 &&
								summary.overTarget > 0}
							class:up={summary.lowestMargin != null &&
								summary.overTarget === 0 &&
								summary.lowestMargin >= 0}
						>
							<p class="value tnum">
								{summary.lowestMargin == null
									? "n/a"
									: formatPourPercent(summary.lowestMargin)}
							</p>
							<p class="fig-label">Lowest margin</p>
						</div>
					</div>
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

			<Card
				fill
				title="Estimated inventory"
				subtitle="Active stock with no supplier trade price. Recipe costs for these lines are stand-ins."
			>
				{#if summary.estimatedStock.length}
					<ul class="list scrollbar-fade">
						{#each summary.estimatedStock.slice(0, 10) as row (row.id)}
							<li>
								<div class="row-top">
									<a class="name" href={row.href}>{row.name}</a>
									<span class="meta">
										{kindLabel(row.kind)}
										{#if row.hasItemEstimate}
											{" "}· item estimate
										{:else}
											{" "}· kind estimate
										{/if}
									</span>
								</div>
							</li>
						{/each}
					</ul>
					{#if summary.estimatedStock.length > 10}
						<p class="more">
							{summary.estimatedStock.length - 10} more on Inventory.
						</p>
					{/if}
				{:else}
					<p class="empty">Every active item has a trade price.</p>
				{/if}
				{#snippet footer()}
					<a class="go" href="/inventory">
						Inventory
						<Icon name="chevron-right" size={16} />
					</a>
				{/snippet}
			</Card>
		</div>
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

	.error {
		margin: 0;
		color: var(--destructive);
	}

	.stats {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: var(--gap);
		margin-bottom: var(--gap-lg);
	}

	.stat {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		height: 12.5rem;
		padding: var(--card-pad);
		border: 1px solid var(--border);
		border-radius: var(--radius-xl);
		background: var(--card);
		box-shadow: var(--shadow-sm);
	}

	.stat.heat-ok {
		border-color: color-mix(in srgb, var(--up) 32%, var(--border));
		background: linear-gradient(
			165deg,
			color-mix(in srgb, var(--up) 14%, transparent),
			var(--card) 72%
		);
	}

	.stat.heat-caution {
		border-color: color-mix(in srgb, var(--primary) 38%, var(--border));
		background: linear-gradient(165deg, var(--primary-wash), var(--card) 72%);
	}

	.stat.heat-mild,
	.stat.heat-bad,
	.stat.heat-severe {
		border-color: color-mix(in srgb, var(--down) 28%, var(--border));
	}

	.stat.heat-bad,
	.stat.heat-severe {
		background: linear-gradient(165deg, var(--destructive-wash), var(--card) 70%);
	}

	.stat.heat-severe {
		border-color: color-mix(in srgb, var(--down) 55%, transparent);
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

	.mark {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 2px;
		margin-left: -1px;
		background: var(--foreground);
		box-shadow: 0 0 0 1px var(--card);
		pointer-events: none;
	}

	.target-meter {
		height: 0.55rem;
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

	.panels :global(.card.heat-caution) {
		border-color: color-mix(in srgb, var(--primary) 38%, var(--border));
		background: linear-gradient(165deg, var(--primary-wash), var(--card) 58%);
	}

	.panels :global(.card.heat-bad),
	.panels :global(.card.heat-severe) {
		border-color: color-mix(in srgb, var(--down) 40%, var(--border));
		background: linear-gradient(165deg, var(--destructive-wash), var(--card) 58%);
	}

	.panels :global(.card.heat-severe) {
		border-color: color-mix(in srgb, var(--down) 58%, transparent);
	}

	.panels :global(.card:last-child) {
		grid-column: 1 / -1;
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

	@media (max-width: 1100px) {
		.stats {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 720px) {
		.stats,
		.panels {
			grid-template-columns: 1fr;
		}

		.panels :global(.card:last-child) {
			grid-column: auto;
		}
	}
</style>
