<script lang="ts">
	/**
	 * Analysis tab: issues first, then overview numbers, detail, and AI.
	 * Each row lays its sections side by side once the tab is wide enough.
	 */
	import { Button, HelpTip } from "../ui";
		import { formatAbv } from "./abv";
	import {
		formatMl,
		type AnalyzeNote,
		type KindMl,
		type KindMlKey,
		type RecipeAnalysis,
		type RecipeFlag,
	} from "./analyze";
	import {
		formatPourPercent,
		marginTone,
		serveVerdict,
		type ServePourReading,
	} from "./cost";
	import { formatGbp } from "../app/money";
	import { hasRecipe } from "./types";
	import { Icon } from "../app/shell";
	import InventoryLink from "./cells/InventoryLink.svelte";

	let {
		analysis,
		note = null,
		stale = false,
		busy = false,
		error = "",
		disabled = false,
		canAnalyze = false,
		onanalyze,
	}: {
		analysis: RecipeAnalysis | null;
		note?: AnalyzeNote | null;
		stale?: boolean;
		busy?: boolean;
		error?: string;
		disabled?: boolean;
		canAnalyze?: boolean;
		onanalyze: () => void;
	} = $props();

	const KIND_LABELS: Record<KindMlKey, string> = {
		liquor: "Spirit",
		liqueur: "Liqueur",
		wine: "Wine",
		beer: "Beer",
		syrup: "Sweet",
		juice: "Citrus",
		bitter: "Bitters",
		mixer: "Mixer",
		garnish: "Garnish",
		other: "Other",
		unknown: "Unlinked",
	};

	function abvLabel(value: number | null | undefined): string {
		return value == null ? "" : formatAbv(value);
	}

	/** "61%" of house cocktails sit below this one; blank when there's nothing to compare. */
	function shareBelow(value: number | null, n: number): string {
		return value == null || n < 2 ? "" : `${value}%`;
	}

	function kindRows(kindMl: KindMl, volumeMl: number | null) {
		const total = volumeMl && volumeMl > 0 ? volumeMl : 0;
		return (Object.keys(KIND_LABELS) as KindMlKey[])
			.map((key) => ({
				key,
				label: KIND_LABELS[key],
				ml: kindMl[key],
				share: total > 0 ? kindMl[key] / total : 0,
			}))
			.filter((row) => row.ml > 0);
	}

	function lineQty(line: RecipeAnalysis["price"]["lines"][number]): string {
		if (line.ml != null) return `${formatMl(line.ml)} ml`;
		if (line.quantity != null && line.unit) {
			return `${line.quantity} ${line.unit}`;
		}
		if (line.quantity != null) return String(line.quantity);
		return "";
	}

	const isCocktail = $derived(hasRecipe(analysis?.price.drinkType));
	const kinds = $derived(
		analysis ? kindRows(analysis.kindMl, analysis.volumeMl) : [],
	);
	const methodMissing = $derived(analysis?.dilution.method === "unknown");
	const price = $derived(analysis?.price);
	const serves = $derived(price?.serves || []);
	const pricedLines = $derived(
		(price?.lines || []).filter((line) => !line.missing && line.cost != null),
	);

	/** Single work queue from analyzer flags, critical first. */
	const issues = $derived.by(() => {
		return (analysis?.flags || []).slice().sort((a, b) => {
			const rank = { critical: 0, warning: 1, note: 2 } as const;
			return rank[a.severity] - rank[b.severity];
		});
	});

	const showBalance = $derived(
		isCocktail && analysis?.volumeMl != null && !!analysis?.ratio,
	);
	const showHouse = $derived(isCocktail && (analysis?.peers.n ?? 0) >= 2);
	const showDetail = $derived(showBalance || showHouse || pricedLines.length > 0);

	/** Why Analyse is unavailable; while it runs, the spinner says so. */
	const analyzeReason = $derived(
		!canAnalyze
			? isCocktail
				? "Add recipe volumes or stock costs first"
				: "Link stock on Build and set a price first"
			: disabled && !busy
				? "Wait for the current save to finish"
				: undefined,
	);

	function serveTone(serve: ServePourReading) {
		return marginTone(serve.margin, serve.pourCost, price?.targetPourCost);
	}

	function flagClass(flag: RecipeFlag): string {
		const parts = ["issue", flag.severity];
		if (flag.kind === "missing") parts.push("gap");
		return parts.join(" ");
	}

	function flagLinkIndex(flag: RecipeFlag): number {
		if (!flag.href || !flag.linkText) return -1;
		return flag.message.indexOf(flag.linkText);
	}
</script>

{#snippet flagCopy(flag: RecipeFlag)}
	{@const linkAt = flagLinkIndex(flag)}
	{#if flag.href && linkAt >= 0 && flag.linkText}
		<span>
			{flag.message.slice(0, linkAt)}<InventoryLink
				text={flag.linkText}
				href={flag.href}
				inline
			/>{flag.message.slice(linkAt + flag.linkText.length)}
		</span>
	{:else if flag.href}
		<InventoryLink text={flag.message} href={flag.href} inline />
	{:else}
		<span>{flag.message}</span>
	{/if}
{/snippet}

{#if analysis}
	<div class="analysis">
		<div class="page">
			<section class="block issues-block" aria-label="Issues">
				<p class="section-title">Issues</p>
				{#if issues.length}
					<ul class="issues">
						{#each issues as flag (flag.id)}
							<li class={flagClass(flag)}>
								{#if flag.severity === "critical" || flag.kind === "missing" || flag.severity === "warning"}
									<span class="gap-icon" aria-hidden="true">
										<Icon name="alert" size={18} />
									</span>
								{/if}
								{@render flagCopy(flag)}
							</li>
						{/each}
					</ul>
				{:else}
					<p class="muted ok-line">Nothing to fix on this drink.</p>
				{/if}
			</section>

			<section class="block" aria-label="Overview">
				<p class="section-title"><span>Overview</span><HelpTip label="Overview" topic="Analysis" /></p>
				<div class="row overview">
					{#if analysis.volumeMl != null}
						<div class="group">
							<div class="stats" aria-label="Spec">
								<div class="stat">
									<p class="stat-value">{formatMl(analysis.volumeMl)} ml</p>
									<p class="stat-label">Spec</p>
								</div>
								<div class="stat">
									<p class="stat-value">{abvLabel(analysis.specAbv) || "n/a"}</p>
									<p class="stat-label">ABV</p>
								</div>
								<div class="stat">
									<p class="stat-value">
										{analysis.ukUnits != null ? formatMl(analysis.ukUnits) : "n/a"}
									</p>
									<p class="stat-label">UK units</p>
								</div>
							</div>

							{#if isCocktail && !methodMissing && analysis.inGlassMl != null}
								<p class="body soft">
									About {formatMl(analysis.inGlassMl)} ml{#if analysis.inGlassAbv != null}
										{" "}at {abvLabel(analysis.inGlassAbv)}{/if}
									after a {analysis.dilution.method}
									({analysis.dilution.confidence} confidence).
									{#if analysis.glassware.name && analysis.glassware.capacityMl}
										{" "}{analysis.glassware.name}
										· {formatMl(analysis.glassware.capacityMl)} ml glass{#if analysis.glassware.fill != null}
											{" "}· {Math.round(analysis.glassware.fill * 100)}% full{/if}.
									{/if}
								</p>
							{/if}
						</div>
					{/if}

					{#if price}
						<div class="group">
							<div class="stats" aria-label="Price">
								<div class="stat">
									<p class="stat-value">
										{price.drinkCost != null
											? `${price.hasEstimates ? "~" : ""}${formatGbp(price.drinkCost)}`
											: "n/a"}
									</p>
									<p class="stat-label">Drink cost</p>
								</div>
								<div class="stat">
									<p class="stat-value">
										{price.complete && price.targetPrice != null
											? formatGbp(price.targetPrice)
											: "n/a"}
									</p>
									<p class="stat-label">
										Target · {formatPourPercent(price.targetPourCost)}
									</p>
								</div>
								<div class="stat">
									<p class="stat-value">
										{price.actualPrice != null
											? formatGbp(price.actualPrice)
											: "n/a"}
									</p>
									<p class="stat-label">{serves[0]?.label || "Menu price"}</p>
								</div>
							</div>
							{#if !(price.drinkCost != null && price.complete && serves.some((s) => s.pourCost != null)) && !price.lines.length}
								<p class="muted">
									{isCocktail
										? "Add recipe lines on Build to cost this drink."
										: "Link stock on Build to cost this drink."}
								</p>
							{/if}
						</div>

						{#if price.drinkCost != null && price.complete && serves.some((s) => s.pourCost != null)}
							<div class="group">
								<div class="stats" aria-label="Pour cost by serve">
									{#each serves as serve (serve.key)}
										{#if serve.pourCost != null}
											{@const tone = serveTone(serve)}
											{@const verdict = serveVerdict(serve, price.complete)}
											<div class="stat">
												<p
													class="stat-value"
													class:up={tone === "up"}
													class:down={tone === "down"}
													class:loss={tone === "loss"}
												>
													{formatPourPercent(serve.pourCost)}
												</p>
												<p class="stat-label">{serve.label} pour</p>
												{#if verdict}
													<p
														class="serve-verdict"
														class:ok={verdict.tone === "ok"}
														class:low={verdict.tone === "low"}
														class:loss={verdict.tone === "loss"}
														class:muted={verdict.tone === "muted"}
													>
														{verdict.headline} vs target
														{#if serve.suggestedPrice != null && verdict.tone !== "ok"}
															{" "}· aim {formatGbp(serve.suggestedPrice)}
														{/if}
													</p>
												{/if}
											</div>
										{/if}
									{/each}
								</div>
							</div>
						{/if}
					{/if}
				</div>
			</section>

			{#if showDetail}
				<div class="row detail">
					{#if showBalance && analysis.ratio}
						<section class="block" aria-label="Balance">
							<p class="section-title"><span>Balance</span><HelpTip label="Balance" topic="Balance" /></p>
							<div class="ratio">
								<div>
									<p class="stat-value sm">{formatMl(analysis.ratio.spirit)}</p>
									<p class="stat-label">Spirit</p>
								</div>
								<div>
									<p class="stat-value sm">{formatMl(analysis.ratio.citrus)}</p>
									<p class="stat-label">Citrus</p>
								</div>
								<div>
									<p class="stat-value sm">{formatMl(analysis.ratio.sweet)}</p>
									<p class="stat-label">Sweet</p>
								</div>
							</div>
							{#if kinds.length}
								<ul class="kinds">
									{#each kinds as row (row.key)}
										<li>
											<span class="kind-label">{row.label}</span>
											<span class="kind-bar" aria-hidden="true">
												<span style:width={`${Math.max(row.share * 100, 3)}%`}
												></span>
											</span>
											<span class="kind-ml">{formatMl(row.ml)} ml</span>
										</li>
									{/each}
								</ul>
							{/if}
						</section>
					{/if}

					{#if showHouse && analysis.peers}
						<section class="block" aria-label="House">
							<p class="section-title"><span>House</span><HelpTip label="House" topic="House" /></p>
							<p class="body soft">
								{#if shareBelow(analysis.peers.volumePercentile, analysis.peers.n)}
									Bigger than {shareBelow(analysis.peers.volumePercentile, analysis.peers.n)} of the {analysis.peers.n} house cocktails.
								{/if}
								{#if shareBelow(analysis.peers.abvPercentile, analysis.peers.n)}
									{" "}Stronger than {shareBelow(analysis.peers.abvPercentile, analysis.peers.n)}.
								{/if}
							</p>
							{#if analysis.peers.nearest.length}
								<ul class="table peers">
									{#each analysis.peers.nearest.slice(0, 5) as peer (peer.name)}
										<li>
											<span class="peer-name">{peer.name}</span>
											<span class="num">
												{#if peer.volumeMl != null}{formatMl(peer.volumeMl)} ml{/if}
											</span>
											<span class="num">
												{#if peer.specAbv != null}{abvLabel(peer.specAbv)}{/if}
											</span>
										</li>
									{/each}
								</ul>
							{/if}
						</section>
					{/if}

					{#if pricedLines.length}
						<section class="block" aria-label={isCocktail ? "Ingredient costs" : "Serve cost"}>
							<p class="section-title">
								{isCocktail ? "Ingredient costs" : "Serve cost"}
							</p>
							<ul class="table work">
								{#each pricedLines as line, i (`ok-${line.name}-${i}`)}
									<li>
										<div class="work-name">
											{#if line.href}
												<InventoryLink
													text={line.name}
													href={line.href}
													inline
												/>
											{:else}
												<span>{line.name}</span>
											{/if}
											<p class="work-meta">
												{#if lineQty(line)}{lineQty(line)}{/if}
												{#if line.packPrice != null && line.packMl != null}
													{" "}· {formatGbp(line.packPrice)} / {formatMl(line.packMl)} ml
													{#if line.assumedSize}
														{" "}(assumed bottle)
													{/if}
												{/if}
											</p>
										</div>
										<span class="num work-cost">
											{line.cost != null ? formatGbp(line.cost) : "n/a"}
										</span>
									</li>
								{/each}
							</ul>
						</section>
					{/if}
				</div>
			{/if}

			<section class="block note-block" aria-label="AI reading">
				<div class="section-head">
					<p class="section-title"><span>AI reading</span><HelpTip label="AI reading" topic="AI reading" /></p>
					<Button
						variant="primary"
						size="sm"
						type="button"
						disabled={disabled || busy || !canAnalyze}
						reason={analyzeReason}
						{busy}
						onclick={onanalyze}
					>
						{#snippet icon()}
							<Icon name="pen" size={15} />
						{/snippet}
						{busy ? "Analysing…" : "Analyse"}
					</Button>
				</div>
				{#if error}
					<p class="error">{error}</p>
				{/if}
				{#if note}
					<div class="note" class:stale>
						{#if stale}
							<p class="stale-label">Spec changed since this reading.</p>
						{/if}
						{#if note.summary}
							<p class="summary">{note.summary}</p>
						{/if}
						{#if note.concerns.length || note.questions.length}
							<div class="row note-groups">
								{#if note.concerns.length}
									<div class="note-group">
										<p class="stat-label">Concerns</p>
										<ul class="points">
											{#each note.concerns as row, i (`c-${i}-${row}`)}
												<li>{row}</li>
											{/each}
										</ul>
									</div>
								{/if}
								{#if note.questions.length}
									<div class="note-group">
										<p class="stat-label">Questions</p>
										<ul class="points questions">
											{#each note.questions as row, i (`q-${i}-${row}`)}
												<li>{row}</li>
											{/each}
										</ul>
									</div>
								{/if}
							</div>
						{/if}
					</div>
				{:else}
					<p class="muted">
						{#if !canAnalyze}
							{isCocktail
								? "Add recipe volumes or stock costs before asking for a reading."
								: "Link stock on Build and set a price before asking for a reading."}
						{:else}
							No reading yet.
						{/if}
					</p>
				{/if}
			</section>
		</div>
	</div>
{:else}
	<p class="muted">Open a drink to analyse it.</p>
{/if}

<style>
	/*
	 * Layout follows the space the editor gives the tab, not the window:
	 * one column when narrow; at 60rem the sections sit side by side on an
	 * even grid (Overview groups, then Balance · House · Costs, then the AI
	 * note's groups), each column taking an equal share so none is left
	 * narrow beside a blank. Sections stay on the card surface, separated
	 * by the title hairlines and space.
	 */
	.analysis {
		container-type: inline-size;
	}

	.page {
		display: grid;
		gap: var(--space-8);
		padding-bottom: var(--space-2);
	}

	.block {
		display: grid;
		align-content: start;
		gap: var(--space-3);
		min-width: 0;
	}

	/* Rows of equal columns; stacked until there is room. */
	.row {
		display: grid;
		gap: var(--space-6);
	}

	.row.overview {
		gap: var(--space-5);
	}

	.group {
		display: grid;
		align-content: start;
		gap: var(--space-3);
		min-width: 0;
	}

	.row.overview > .group + .group {
		padding-top: var(--space-5);
		border-top: 1px solid var(--border);
	}

	.stats {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: var(--space-3) var(--space-4);
	}

	.stats:has(> .stat:only-child) {
		grid-template-columns: minmax(0, 1fr);
	}

	.stats:has(> .stat:nth-child(2):last-child) {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	/* Same three columns as the Overview stats, so the numbers line up. */
	.ratio {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: var(--space-3) var(--space-4);
		padding-bottom: var(--space-1);
	}

	.stat {
		min-width: 0;
	}

	.serve-verdict {
		margin: var(--space-1) 0 0;
		font-size: var(--text-sm);
		line-height: 1.35;
		color: var(--fg-muted);
	}

	.serve-verdict.ok {
		color: var(--up);
	}

	.serve-verdict.low,
	.serve-verdict.loss {
		color: var(--down);
	}

	.serve-verdict.muted {
		color: var(--fg-muted);
	}

	.stat-value {
		margin: 0;
		font-size: var(--text-lg);
		font-weight: 600;
		letter-spacing: var(--tracking-lg);
		line-height: var(--leading-lg);
		color: var(--fg);
		font-variant-numeric: tabular-nums;
		font-feature-settings: var(--font-features-num);
		white-space: nowrap;
	}

	.stat-value.sm {
		font-size: var(--text-lg);
		letter-spacing: var(--tracking-lg);
		line-height: var(--leading-lg);
	}

	.stat-value.up,
	.stat-value.ok {
		color: var(--up);
	}

	.stat-value.down,
	.stat-value.low,
	.stat-value.loss {
		color: var(--down);
	}

	.stat-label {
		margin: 0.2rem 0 0;
		font-size: var(--text-2xs);
		font-weight: 600;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--fg-muted);
	}

	.section-title {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin: 0;
		font-size: var(--text-md);
		font-weight: 600;
		line-height: 1.3;
		color: var(--fg);
	}

	/* The ? sits right after the title, before the rule. */
	.section-title :global(.help-tip) {
		margin-left: calc(var(--space-1) - var(--space-3));
	}

	.section-title::after {
		content: "";
		flex: 1 1 auto;
		height: 1px;
		min-width: 1.5rem;
		background: var(--border-strong);
	}

	.section-head {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.section-head .section-title {
		flex: 1;
		min-width: 0;
	}

	/* Issues flow into columns of readable width, critical first. */
	.issues {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 26rem), 1fr));
		gap: var(--space-2) var(--space-8);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.issue {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		margin: 0;
		font-size: var(--text-base);
		line-height: 1.45;
		color: var(--fg-muted);
	}

	.issue.critical {
		color: var(--destructive);
		font-weight: 600;
	}

	.issue.warning,
	.issue.gap {
		color: var(--fg);
	}

	.gap-icon {
		display: flex;
		flex: none;
		margin-top: 0.05rem;
		color: var(--warning);
	}

	.issue.critical .gap-icon,
	.issue.warning .gap-icon {
		color: var(--destructive);
	}

	.body {
		margin: 0;
		font-size: var(--text-base);
		line-height: 1.5;
		color: var(--fg);
		max-width: 65ch;
	}

	.body.soft {
		color: var(--fg-muted);
	}

	.muted {
		margin: 0;
		font-size: var(--text-base);
		line-height: 1.5;
		color: var(--fg-muted);
		max-width: 65ch;
	}

	.ok-line {
		color: var(--up);
	}

	/* Balance bars: label, bar, ml, in one tight row. */
	.kinds {
		display: grid;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.kinds li {
		display: grid;
		grid-template-columns: 4.5rem minmax(0, 1fr) 4rem;
		align-items: center;
		gap: var(--space-3);
		font-size: var(--text-sm);
	}

	.kind-label {
		color: var(--fg);
	}

	.kind-ml {
		text-align: right;
		color: var(--fg-muted);
		font-variant-numeric: tabular-nums;
		font-feature-settings: var(--font-features-num);
		white-space: nowrap;
	}

	.kind-bar {
		display: block;
		height: 0.375rem;
		border-radius: var(--radius-pill);
		background: var(--muted);
		overflow: hidden;
	}

	.kind-bar span {
		display: block;
		height: 100%;
		background: var(--primary);
		border-radius: inherit;
	}

	/* House and costs read as small tables with hairline rows. */
	.table {
		display: grid;
		margin: 0;
		padding: 0;
		list-style: none;
		border-top: 1px solid var(--border);
	}

	.table li {
		display: grid;
		align-items: baseline;
		gap: var(--space-4);
		padding-block: var(--space-2);
		border-bottom: 1px solid var(--border);
		font-size: var(--text-base);
		color: var(--fg);
	}

	.peers li {
		grid-template-columns: minmax(0, 1fr) 4.5rem 4rem;
	}

	.peer-name {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.num {
		text-align: right;
		color: var(--fg-muted);
		font-size: var(--text-sm);
		font-variant-numeric: tabular-nums;
		font-feature-settings: var(--font-features-num);
		white-space: nowrap;
	}

	.work li {
		grid-template-columns: minmax(0, 1fr) auto;
	}

	.work-name {
		display: grid;
		gap: 0.15rem;
		min-width: 0;
	}

	.work-cost {
		color: var(--fg);
		font-size: var(--text-base);
	}

	.work-meta {
		margin: 0;
		font-size: var(--text-sm);
		line-height: 1.4;
		color: var(--fg-muted);
	}

	.error {
		margin: 0;
		font-size: var(--text-base);
		line-height: 1.45;
		color: var(--destructive);
	}

	.note {
		display: grid;
		gap: var(--space-4);
	}

	.note.stale {
		opacity: 0.72;
	}

	.stale-label {
		margin: 0;
		font-size: var(--text-2xs);
		font-weight: 600;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--fg-muted);
	}

	.summary {
		margin: 0;
		max-width: 75ch;
		font-size: var(--text-md);
		line-height: 1.55;
		color: var(--fg);
	}

	.note-group {
		display: grid;
		align-content: start;
		gap: var(--space-1);
		min-width: 0;
	}

	.points {
		display: grid;
		gap: var(--space-1);
		margin: 0;
		padding-left: var(--space-4);
		list-style: disc;
		color: var(--fg);
		font-size: var(--text-base);
		line-height: 1.5;
		max-width: 75ch;
	}

	.points.questions {
		color: var(--fg-muted);
	}

	/* Wide: each row's sections share it equally, on one baseline. The
	   Overview stays as rows (spec, price, pour) at every width. */
	@container (min-width: 60rem) {
		.row:not(.overview) {
			grid-auto-flow: column;
			grid-auto-columns: minmax(0, 1fr);
			gap: var(--space-10);
		}

		/* Fixed columns, so each row's numbers line up under the one above. */
		.row.overview .stats,
		.row.overview .stats:has(> .stat:only-child),
		.row.overview .stats:has(> .stat:nth-child(2):last-child) {
			grid-template-columns: repeat(3, minmax(0, 12rem));
		}

		.row.overview .serve-verdict {
			white-space: nowrap;
		}

		.stat-value {
			font-size: var(--text-xl);
			letter-spacing: var(--tracking-xl);
			line-height: var(--leading-xl);
		}

		.stat-value.sm {
			font-size: var(--text-lg);
			letter-spacing: var(--tracking-lg);
			line-height: var(--leading-lg);
		}

		/* A costs table alone in its row splits into columns, not one long line. */
		.detail > :only-child .table {
			grid-template-columns: repeat(auto-fill, minmax(22rem, 1fr));
			column-gap: var(--space-10);
		}
	}
</style>
