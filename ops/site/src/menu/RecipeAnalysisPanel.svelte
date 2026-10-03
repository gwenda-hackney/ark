<script lang="ts">
	/**
	 * Analysis tab: issues first, then overview numbers, detail, and AI.
	 */
	import { Button } from "../ui";
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

	function percentileLabel(value: number | null, n: number): string {
		if (value == null || n < 2) return "";
		const ordinal =
			value % 10 === 1 && value !== 11
				? "st"
				: value % 10 === 2 && value !== 12
					? "nd"
					: value % 10 === 3 && value !== 13
						? "rd"
						: "th";
		return `${value}${ordinal} of ${n}`;
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
	<div class="page">
		<section class="block" aria-label="Issues">
			<p class="section-title">Issues</p>
			{#if issues.length}
				<ul class="issues">
					{#each issues as flag (flag.id)}
						<li class={flagClass(flag)}>
							{#if flag.severity === "critical" || flag.kind === "missing" || flag.severity === "warning"}
								<span class="gap-icon" aria-hidden="true">
									<Icon name="alert" size={16} />
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
			<p class="section-title">Overview</p>
			{#if analysis.volumeMl != null}
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
			{/if}

			{#if isCocktail && analysis.volumeMl != null}
				{#if !methodMissing && analysis.inGlassMl != null}
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
			{/if}

			{#if price}
				<div
					class="stats"
					class:spaced={analysis.volumeMl != null}
					aria-label="Price"
				>
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

				{#if price.drinkCost != null && price.complete && serves.some((s) => s.pourCost != null)}
					<div
						class="stats reading"
						class:pair={serves.filter((s) => s.pourCost != null).length > 1}
						aria-label="Pour cost by serve"
					>
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
				{:else if !price.lines.length}
					<p class="muted">
						{isCocktail
							? "Add recipe lines on Build to cost this drink."
							: "Link stock on Build to cost this drink."}
					</p>
				{/if}
			{/if}
		</section>

		{#if showDetail}
			<section class="block" aria-label="Detail">
				<p class="section-title">Detail</p>

				{#if showBalance && analysis.ratio}
					<p class="stat-label">Balance</p>
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
				{/if}

				{#if showHouse && analysis.peers}
					<p class="stat-label house-label">House</p>
					<p class="body soft">
						{#if percentileLabel(analysis.peers.volumePercentile, analysis.peers.n)}
							Volume {percentileLabel(analysis.peers.volumePercentile, analysis.peers.n)} house cocktails.
						{/if}
						{#if percentileLabel(analysis.peers.abvPercentile, analysis.peers.n)}
							{" "}ABV {percentileLabel(analysis.peers.abvPercentile, analysis.peers.n)}.
						{/if}
					</p>
					{#if analysis.peers.nearest.length}
						<ul class="peers">
							{#each analysis.peers.nearest.slice(0, 5) as peer (peer.name)}
								<li>
									<span>{peer.name}</span>
									<span class="peer-meta">
										{#if peer.volumeMl != null}{formatMl(peer.volumeMl)} ml{/if}
										{#if peer.specAbv != null}
											{" "}· {abvLabel(peer.specAbv)}{/if}
									</span>
								</li>
							{/each}
						</ul>
					{/if}
				{/if}

				{#if pricedLines.length}
					<p class="stat-label house-label">
						{isCocktail ? "Ingredient costs" : "Serve cost"}
					</p>
					<ul class="work">
						{#each pricedLines as line, i (`ok-${line.name}-${i}`)}
							<li>
								<div class="work-head">
									{#if line.href}
										<InventoryLink
											text={line.name}
											href={line.href}
											inline
										/>
									{:else}
										<span>{line.name}</span>
									{/if}
									<span class="work-cost">
										{line.cost != null ? formatGbp(line.cost) : "n/a"}
									</span>
								</div>
								<p class="work-meta">
									{#if lineQty(line)}{lineQty(line)}{/if}
									{#if line.packPrice != null && line.packMl != null}
										{" "}· {formatGbp(line.packPrice)} / {formatMl(line.packMl)} ml
										{#if line.assumedSize}
											{" "}(assumed bottle)
										{/if}
									{/if}
								</p>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		{/if}

		<section class="block note-block">
			<div class="section-head">
				<p class="section-title">AI reading</p>
				<Button
					variant="primary"
					size="sm"
					type="button"
					disabled={disabled || busy || !canAnalyze}
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
			{:else}
				<p class="muted">
					{#if !canAnalyze}
						{isCocktail
							? "Add recipe volumes or stock costs before asking for a reading."
							: "Link stock on Build and set a price before asking for a reading."}
					{:else}
						A short note on this drink, separate from the numbers above. It will not invent volumes or ABV.
					{/if}
				</p>
			{/if}
		</section>
	</div>
{:else}
	<p class="muted">Open a drink to analyse it.</p>
{/if}

<style>
	.page {
		display: grid;
		gap: var(--space-6);
		padding-bottom: var(--space-2);
	}

	.stats,
	.ratio {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: var(--space-3) var(--space-4);
	}

	.stats.spaced {
		padding-top: var(--space-3);
		margin-top: 0.15rem;
		border-top: 1px solid var(--border);
	}

	.stats.reading {
		padding-top: var(--space-3);
		border-top: 1px solid var(--border);
	}

	.stats.reading.pair {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.serve-verdict {
		margin: var(--space-1) 0 0;
		font-size: var(--text-sm);
		line-height: 1.35;
		color: var(--muted-foreground);
	}

	.serve-verdict.ok {
		color: var(--up);
	}

	.serve-verdict.low,
	.serve-verdict.loss {
		color: var(--down);
	}

	.serve-verdict.muted {
		color: var(--muted-foreground);
	}

	.stat-value {
		margin: 0;
		font-size: var(--text-xl);
		font-weight: 600;
		letter-spacing: var(--tracking-xl);
		line-height: var(--leading-xl);
		color: var(--foreground);
		font-variant-numeric: tabular-nums;
		font-feature-settings: var(--font-features-num);
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

	.stat-value.loss {
		font-weight: 600;
	}

	.stat-label {
		margin: 0.2rem 0 0;
		font-size: var(--text-2xs);
		font-weight: 600;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--muted-foreground);
	}

	.house-label {
		margin-top: var(--space-3);
	}

	.block {
		display: grid;
		gap: var(--space-2);
	}

	.section-title {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin: 0;
		font-size: var(--text-md);
		font-weight: 600;
		line-height: 1.3;
		color: var(--foreground);
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

	.issues {
		display: grid;
		gap: var(--space-2);
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
		color: var(--muted-foreground);
	}

	.issue.critical {
		color: var(--destructive);
		font-weight: 600;
	}

	.issue.warning,
	.issue.gap {
		color: var(--foreground);
	}

	.gap-icon {
		display: flex;
		flex: none;
		margin-top: 0.12rem;
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
		color: var(--foreground);
	}

	.body.soft {
		color: var(--muted-foreground);
	}

	.muted {
		margin: 0;
		font-size: var(--text-base);
		line-height: 1.5;
		color: var(--muted-foreground);
	}

	.ok-line {
		color: var(--up);
	}

	.kinds,
	.peers,
	.points {
		display: grid;
		gap: var(--space-1);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.kinds li,
	.peers li {
		display: grid;
		grid-template-columns: 5.5rem minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-sm);
	}

	.peers li {
		grid-template-columns: minmax(0, 1fr) auto;
	}

	.work {
		display: grid;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.work li {
		display: grid;
		gap: 0.15rem;
	}

	.work-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-3);
		font-size: var(--text-base);
		color: var(--foreground);
	}

	.work-cost {
		font-variant-numeric: tabular-nums;
		font-feature-settings: var(--font-features-num);
		white-space: nowrap;
	}

	.work-meta {
		margin: 0;
		font-size: var(--text-sm);
		line-height: 1.4;
		color: var(--muted-foreground);
	}

	.kind-label,
	.peers li span:first-child {
		color: var(--foreground);
	}

	.kind-ml,
	.peer-meta {
		color: var(--muted-foreground);
		font-variant-numeric: tabular-nums;
		font-feature-settings: var(--font-features-num);
		white-space: nowrap;
	}

	.kind-bar {
		display: block;
		height: 0.35rem;
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

	.error {
		margin: 0;
		font-size: var(--text-base);
		line-height: 1.45;
		color: var(--destructive);
	}

	.note-block .note {
		display: grid;
		gap: var(--space-3);
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
		color: var(--muted-foreground);
	}

	.summary {
		margin: 0;
		font-size: var(--text-md);
		line-height: 1.55;
		color: var(--foreground);
	}

	.note-group {
		display: grid;
		gap: var(--space-1);
	}

	.points {
		padding-left: var(--space-4);
		list-style: disc;
		color: var(--foreground);
		font-size: var(--text-base);
		line-height: 1.5;
	}

	.points.questions {
		color: var(--muted-foreground);
	}

	@media (max-width: 880px) {
		.stats,
		.ratio {
			grid-template-columns: 1fr;
			gap: var(--space-3);
		}
	}
</style>
