<script lang="ts">
	import { Button } from "../../ui";
	import { formatAbv } from "../../lib/abv";
	import {
		formatMl,
		type AnalyzeNote,
		type KindMl,
		type KindMlKey,
		type RecipeAnalysis,
		type RecipeFlag,
	} from "../../lib/analyze";
	import {
		formatPourPercent,
		marginTone,
		serveVerdict,
		type ServePourReading,
	} from "../../lib/cost";
	import { formatGbp, hasRecipe } from "../../lib/types";
	import { Icon } from "../../shell";
	import PourSettingsDialog from "./PourSettingsDialog.svelte";
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

	let settingsOpen = $state(false);

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

	function missingLabel(kind: string | null): string {
		switch (kind) {
			case "unlinked":
				return "not linked to stock";
			case "no-price":
				return "no trade price";
			case "no-volume":
				return "no pour volume";
			default:
				return "";
		}
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
	const methodMessage = $derived(
		analysis?.flags.find((flag) => flag.id === "method-unknown")?.message ||
			"Method is missing. Set shake, stir, or built to estimate dilution. Until then volume is the spec only.",
	);
	const visibleFlags = $derived(
		(analysis?.flags || []).filter((flag) => {
			if (flag.id === "method-unknown" && analysis?.volumeMl != null) {
				return false;
			}
			return true;
		}),
	);
	const critical = $derived(
		visibleFlags.filter((flag) => flag.severity === "critical"),
	);
	const warnings = $derived(
		visibleFlags.filter((flag) => flag.severity === "warning"),
	);
	const notes = $derived(
		visibleFlags.filter((flag) => flag.severity === "note"),
	);
	const price = $derived(analysis?.price);
	const serves = $derived(price?.serves || []);
	const unpricedLines = $derived(
		(price?.lines || []).filter((line) => line.estimated || line.missing),
	);
	const lineCostTitle = $derived(
		unpricedLines.length
			? "Missing prices"
			: isCocktail
				? "Ingredient costs"
				: "Serve cost",
	);
	const lineCostLead = $derived.by(() => {
		if (!price?.lines.length) return "";
		if (price.drinkCost == null) {
			return "Drink cost cannot be read until these lines have a supplier trade price. Open a line to add one.";
		}
		if (price.missingLines > 0) {
			return `Partial cost ${formatGbp(price.drinkCost)}. Open the lines that still need a trade price or pour volume.`;
		}
		if (price.hasEstimates) {
			return "Stand-in pack costs. Open a line and set a trade price to lock drink cost and pour cost.";
		}
		return "";
	});

	function serveTone(serve: ServePourReading) {
		return marginTone(serve.margin, serve.pourCost, price?.targetPourCost);
	}

	function flagClass(flag: RecipeFlag): string {
		const parts = ["flag", flag.severity];
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
		<header class="toolbar">
			<p class="kicker">{isCocktail ? "Spec numbers" : "Price analysis"}</p>
			<Button
				variant="ghost"
				size="sm"
				type="button"
				aria-label="Pour cost settings"
				title="Pour targets"
				onclick={() => (settingsOpen = true)}
			>
				{#snippet icon()}
					<Icon name="settings" size={15} />
				{/snippet}
			</Button>
		</header>

		{#if analysis.volumeMl != null}
			<section class="stats" aria-label="Spec numbers">
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
			</section>

			{#if isCocktail}
			<section class="block">
				<p class="section-title">Dilution</p>
				{#if !methodMissing && analysis.inGlassMl != null}
					<p class="body">
						About {formatMl(analysis.inGlassMl)} ml{#if analysis.inGlassAbv != null}
							{" "}at {abvLabel(analysis.inGlassAbv)}{/if}
						after a {analysis.dilution.method} ({analysis.dilution.confidence} confidence).
					</p>
				{:else}
					<p class="gap warning">
						<span class="gap-icon" aria-hidden="true">
							<Icon name="alert" size={16} />
						</span>
						<span>{methodMessage}</span>
					</p>
				{/if}
				{#if analysis.glassware.name && analysis.glassware.capacityMl}
					<p class="muted">
						{analysis.glassware.name}
						{" "}· {formatMl(analysis.glassware.capacityMl)} ml glass{#if analysis.glassware.fill != null}
							{" "}· {Math.round(analysis.glassware.fill * 100)}% full{/if}
					</p>
				{/if}
			</section>
			{/if}
		{/if}

			{#if price}
				<section class="block">
					<p class="section-title">Price</p>
					<div class="stats">
						<div class="stat">
							<p class="stat-value">
								{price.complete && price.drinkCost != null
									? formatGbp(price.drinkCost)
									: "n/a"}
							</p>
							<p class="stat-label">
								{price.hasEstimates ? "Drink cost (est.)" : "Drink cost"}
							</p>
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
								{price.actualPrice != null ? formatGbp(price.actualPrice) : "n/a"}
							</p>
							<p class="stat-label">{serves[0]?.label || "Menu price"}</p>
						</div>
					</div>
					{#if price.drinkCost != null && price.complete && serves.length}
						<div
							class="stats reading"
							class:pair={serves.length > 1}
							aria-label="Pour cost by serve"
						>
							{#each serves as serve (serve.key)}
								{@const tone = serveTone(serve)}
								{@const verdict = serveVerdict(serve, price.complete)}
								<div class="stat">
									<p
										class="stat-value"
										class:up={tone === "up"}
										class:down={tone === "down"}
										class:loss={tone === "loss"}
									>
										{serve.pourCost != null
											? formatPourPercent(serve.pourCost)
											: "n/a"}
									</p>
									<p class="stat-label">
										{serve.label} pour
									</p>
									{#if verdict && serve.pourCost != null}
										<p
											class="serve-verdict"
											class:ok={verdict.tone === "ok"}
											class:low={verdict.tone === "low"}
											class:loss={verdict.tone === "loss"}
											class:muted={verdict.tone === "muted"}
										>
											{verdict.headline}
											{#if serve.suggestedPrice != null && verdict.tone !== "ok"}
												{" "}· {formatGbp(serve.suggestedPrice)}
											{/if}
										</p>
									{/if}
								</div>
							{/each}
						</div>
					{:else if !price.lines.length}
						<p class="muted">
							{isCocktail
								? "Add recipe lines on the Recipe tab to cost this drink."
								: "Link stock on the Serve tab to cost this drink."}
						</p>
					{/if}
					{#if price.lines.length}
						<div class="work-block">
							<p class="section-title">{lineCostTitle}</p>
							{#if lineCostLead}
								<p class="body">{lineCostLead}</p>
							{/if}
							<ul class="work">
								{#each price.lines as line, i (`${line.name}-${i}`)}
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
												{#if line.estimated}
													{" "}· estimate{#if line.variable}{" "}(moves around){/if}
												{:else if line.assumedSize}
													{" "}(assumed bottle)
												{/if}
											{:else if line.estimated && line.packPrice != null}
												{" "}· estimate {formatGbp(line.packPrice)} each
												{#if line.variable}{" "}(moves around){/if}
											{:else if missingLabel(line.missing)}
												{" "}· {missingLabel(line.missing)}
											{/if}
										</p>
									</li>
								{/each}
							</ul>
						</div>
					{/if}
				</section>
			{/if}

			{#if isCocktail && analysis.volumeMl != null && analysis.ratio}
				<section class="block">
					<p class="section-title">Balance</p>
					<div class="ratio">
						<div>
							<p class="stat-value">{formatMl(analysis.ratio.spirit)}</p>
							<p class="stat-label">Spirit</p>
						</div>
						<div>
							<p class="stat-value">{formatMl(analysis.ratio.citrus)}</p>
							<p class="stat-label">Citrus</p>
						</div>
						<div>
							<p class="stat-value">{formatMl(analysis.ratio.sweet)}</p>
							<p class="stat-label">Sweet</p>
						</div>
					</div>
					{#if kinds.length}
						<ul class="kinds">
							{#each kinds as row (row.key)}
								<li>
									<span class="kind-label">{row.label}</span>
									<span class="kind-bar" aria-hidden="true">
										<span style:width={`${Math.max(row.share * 100, 3)}%`}></span>
									</span>
									<span class="kind-ml">{formatMl(row.ml)} ml</span>
								</li>
							{/each}
						</ul>
					{/if}
				</section>
			{/if}

			{#if isCocktail && analysis.peers.n >= 2}
				<section class="block">
					<p class="section-title">House</p>
					<p class="body">
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
				</section>
			{/if}

		{#if critical.length}
			<section class="block">
				<p class="section-title">Critical</p>
				<ul class="flags">
					{#each critical as flag (flag.id)}
						<li class={flagClass(flag)}>
							<span class="gap-icon" aria-hidden="true">
								<Icon name="alert" size={16} />
							</span>
							{@render flagCopy(flag)}
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if warnings.length}
			<section class="block">
				<p class="section-title">Warnings</p>
				<ul class="flags">
					{#each warnings as flag (flag.id)}
						<li class={flagClass(flag)}>
							{#if flag.kind === "missing"}
								<span class="gap-icon" aria-hidden="true">
									<Icon name="alert" size={16} />
								</span>
							{/if}
							{@render flagCopy(flag)}
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if notes.length}
			<section class="block">
				<p class="section-title">Notes</p>
				<ul class="flags quiet">
					{#each notes as flag (flag.id)}
						<li class={flagClass(flag)}>
							{@render flagCopy(flag)}
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		<section class="block note-block">
			<div class="section-head">
				<p class="section-title">AI analysis</p>
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
						<p class="stale-label">Spec changed since this analysis.</p>
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
							: "Link stock on the Serve tab and set a price before asking for a reading."}
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

<PourSettingsDialog open={settingsOpen} onclose={() => (settingsOpen = false)} />

<style>
	.page {
		display: grid;
		gap: 1.35rem;
		padding-bottom: 0.5rem;
	}

	.toolbar {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.kicker {
		flex: 1;
		min-width: 0;
		margin: 0;
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--primary);
	}

	.stats,
	.ratio {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.75rem 1rem;
	}

	.stats.reading {
		padding-top: 0.75rem;
		border-top: 1px solid var(--border);
	}

	.stats.reading.pair {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.serve-verdict {
		margin: 0.25rem 0 0;
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

	.work-block {
		display: grid;
		gap: 0.55rem;
		margin-top: 0.35rem;
		padding-top: 1rem;
		border-top: 1px solid var(--border);
	}

	.stat-value {
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(1.35rem, 2.4vw, 1.75rem);
		font-weight: 600;
		letter-spacing: -0.02em;
		line-height: 1.15;
		color: var(--foreground);
		font-variant-numeric: tabular-nums;
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
		font-weight: 650;
	}

	.stat-value.muted {
		color: var(--muted-foreground);
	}

	.stat-label {
		margin: 0.2rem 0 0;
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--muted-foreground);
	}

	.block {
		display: grid;
		gap: 0.55rem;
	}

	.section-title {
		display: flex;
		align-items: center;
		gap: 0.75rem;
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

	.section-head {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.section-head .section-title {
		flex: 1;
		min-width: 0;
	}

	.gap,
	.flags li.gap,
	.flags li.warning,
	.flags li.critical {
		display: flex;
		align-items: flex-start;
		gap: 0.45rem;
		margin: 0;
		font-size: var(--text);
		line-height: 1.45;
		color: var(--foreground);
	}

	.gap-icon {
		display: flex;
		flex: none;
		margin-top: 0.12rem;
		color: var(--warning);
	}

	.gap.warning,
	.gap.critical,
	.flags li.warning,
	.flags li.critical {
		color: var(--destructive);
	}

	.flags li.critical {
		font-weight: 600;
	}

	.gap.warning .gap-icon,
	.gap.critical .gap-icon,
	.flags li.warning .gap-icon,
	.flags li.critical .gap-icon {
		color: var(--destructive);
	}

	.body {
		margin: 0;
		font-size: var(--text);
		line-height: 1.5;
		color: var(--foreground);
	}

	.muted {
		margin: 0;
		font-size: var(--text);
		line-height: 1.5;
		color: var(--muted-foreground);
	}

	.kinds,
	.peers,
	.flags,
	.points {
		display: grid;
		gap: 0.35rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.kinds li,
	.peers li {
		display: grid;
		grid-template-columns: 5.5rem minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.55rem;
		font-size: var(--text-sm);
	}

	.peers li {
		grid-template-columns: minmax(0, 1fr) auto;
	}

	.work {
		display: grid;
		gap: 0.55rem;
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
		gap: 0.75rem;
		font-size: var(--text);
		color: var(--foreground);
	}

	.work-cost {
		font-variant-numeric: tabular-nums;
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

	.flags li {
		margin: 0;
		font-size: var(--text);
		line-height: 1.45;
		color: var(--muted-foreground);
	}

	.flags.quiet {
		margin-top: 0.15rem;
	}

	.error {
		margin: 0;
		font-size: var(--text);
		line-height: 1.45;
		color: var(--destructive);
	}

	.note-block .note {
		display: grid;
		gap: 0.75rem;
	}

	.note.stale {
		opacity: 0.72;
	}

	.stale-label {
		margin: 0;
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--primary);
	}

	.summary {
		margin: 0;
		font-size: var(--text-md);
		line-height: 1.55;
		color: var(--foreground);
	}

	.note-group {
		display: grid;
		gap: 0.3rem;
	}

	.points {
		padding-left: 1.1rem;
		list-style: disc;
		color: var(--foreground);
		font-size: var(--text);
		line-height: 1.5;
	}

	.points.questions {
		color: var(--muted-foreground);
	}

	@media (max-width: 880px) {
		.stats,
		.ratio {
			grid-template-columns: 1fr;
			gap: 0.85rem;
		}
	}
</style>
