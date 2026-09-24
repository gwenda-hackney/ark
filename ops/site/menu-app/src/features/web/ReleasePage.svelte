<script lang="ts">
	/**
	 * Website release: every published document that differs between staging
	 * and the live site. Publishing copies the chosen ones (and anything they
	 * need) to production, then rebuilds the live site.
	 */
	import { onMount } from "svelte";
	import { fly } from "svelte/transition";
	import { Icon } from "../../shell";
	import { BusyOverlay, Button, Dialog, PageHeader, SearchField } from "../../ui";
	import {
		getReleaseDiff,
		getWebStatus,
		publishRelease,
		type ReleaseDiff,
		type ReleaseEntry,
		type WebStatus,
	} from "../../lib/api";
	import { loginNext } from "../../lib/nav";
	import { easeOut, flyMs } from "../../lib/motion";
	import { toast } from "../../lib/toast.svelte";
	import { writeSitePublish } from "../../lib/site-publish";
	import { shortCommit } from "../../lib/web-metrics";
	import {
		changeLabel,
		countLabel,
		fieldSummary,
		filterEntries,
		groupEntries,
		includedWith,
	} from "../../lib/release-view";
	import SitePublishMonitor from "./SitePublishMonitor.svelte";

	let diff = $state<ReleaseDiff | null>(null);
	let web = $state<WebStatus | null>(null);
	let loading = $state(true);
	let loadError = $state("");
	let query = $state(
		typeof window === "undefined"
			? ""
			: new URLSearchParams(window.location.search).get("q") || "",
	);
	let selected = $state<Set<string>>(new Set());
	let open = $state<Set<string>>(new Set());
	let confirm = $state<"all" | "selected" | null>(null);
	let publishing = $state(false);
	let warnings = $state<string[]>([]);

	const entries = $derived(diff?.entries ?? []);
	const visible = $derived(filterEntries(entries, query));
	const groups = $derived(groupEntries(visible));
	const extra = $derived(includedWith(entries, selected));
	const selectedCount = $derived(selected.size + extra.length);
	const local = $derived(Boolean(diff?.local));
	const stagingCode = $derived(web?.environments.staging.code.commit ?? null);
	const liveCode = $derived(web?.environments.production.code.commit ?? null);
	const codeDiffers = $derived(Boolean(stagingCode && liveCode && stagingCode !== liveCode));

	async function load() {
		loading = true;
		try {
			const [nextDiff, nextWeb] = await Promise.all([
				getReleaseDiff(),
				getWebStatus().catch(() => null),
			]);
			diff = nextDiff;
			web = nextWeb;
			loadError = "";
			const ids = new Set(nextDiff.entries.map((entry) => entry.id));
			selected = new Set([...selected].filter((id) => ids.has(id)));
		} catch (err) {
			const message = err instanceof Error ? err.message : "Could not compare staging and live.";
			if (message.startsWith("auth:")) {
				window.location.href = `/api/auth/login?next=${encodeURIComponent(loginNext("/web/release"))}`;
				return;
			}
			loadError = message;
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		void load();
	});

	function toggle(set: Set<string>, id: string): Set<string> {
		const next = new Set(set);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		return next;
	}

	function toggleGroup(list: ReleaseEntry[]) {
		const all = list.every((entry) => selected.has(entry.id));
		const next = new Set(selected);
		for (const entry of list) {
			if (all) next.delete(entry.id);
			else next.add(entry.id);
		}
		selected = next;
	}

	async function publish() {
		if (!confirm || publishing) return;
		const ids = confirm === "selected" ? [...selected] : null;
		publishing = true;
		warnings = [];
		try {
			const result = await publishRelease(ids);
			confirm = null;
			selected = new Set();
			warnings = result.warnings;
			if (result.deploy?.runId) {
				writeSitePublish({
					target: "production",
					runId: result.deploy.runId,
					runUrl: result.deploy.runUrl || "",
					status: result.deploy.alreadyRunning ? "in_progress" : "queued",
					conclusion: null,
					completed: false,
				});
			}
			const count = result.written.length + result.deleted.length;
			toast.ok(
				`Published ${countLabel(count)}. What's on is live now; the rest of the site rebuilds in a few minutes.`,
			);
			await load();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Could not publish.");
		} finally {
			publishing = false;
		}
	}
</script>

<div class="page scrollbar-fade">
	<PageHeader
		title="Release"
		subtitle="Staging against the live site. Publish what is ready."
	>
		{#snippet actions()}
			<SearchField
				bind:value={query}
				placeholder="Filter changes"
				ariaLabel="Filter changes"
				count={query ? visible.length : undefined}
			/>
			<Button variant="outline" size="sm" disabled={loading} onclick={() => void load()}>
				{#snippet icon()}
					<Icon name="refresh" size={16} />
				{/snippet}
				Refresh
			</Button>
			{#if !local}
				{#if selected.size}
					<Button
						variant="primary"
						size="sm"
						disabled={loading || publishing}
						onclick={() => (confirm = "selected")}
					>
						Publish {countLabel(selectedCount)}
					</Button>
				{:else}
					<Button
						variant="primary"
						size="sm"
						disabled={loading || publishing || !entries.length}
						onclick={() => (confirm = "all")}
					>
						Publish all
					</Button>
				{/if}
			{/if}
		{/snippet}
	</PageHeader>

	{#if loadError}
		<p class="error">{loadError}</p>
	{:else if diff}
		<div class="ready" in:fly={{ y: 10, duration: flyMs, easing: easeOut }}>
			{#if local}
				<p class="banner">
					<Icon name="lock" size={16} />
					<span>
						Local ops shows this for reference only. Your local edits are drafts that only the local
						site shows; they are not below and cannot be published from here.
					</span>
				</p>
			{/if}
			<SitePublishMonitor />

			<section class="summary" aria-label="Summary">
				<div class="stat">
					<span class="stat-value">{diff.counts.added}</span>
					<span class="stat-label">new</span>
				</div>
				<div class="stat">
					<span class="stat-value">{diff.counts.changed}</span>
					<span class="stat-label">changed</span>
				</div>
				<div class="stat">
					<span class="stat-value">{diff.counts.removed}</span>
					<span class="stat-label">removed</span>
				</div>
				<p class="code" class:ahead={codeDiffers}>
					{#if stagingCode && liveCode}
						{#if codeDiffers}
							Code differs: staging runs {shortCommit(stagingCode)}, live runs {shortCommit(liveCode)}.
							Code ships when the release branch moves, not from here.
						{:else}
							Code matches ({shortCommit(liveCode)}).
						{/if}
					{:else}
						Code version unknown.
					{/if}
				</p>
			</section>

			{#if warnings.length}
				<ul class="warnings">
					{#each warnings as warning (warning)}
						<li>{warning}</li>
					{/each}
				</ul>
			{/if}

			{#if !entries.length}
				<div class="empty">
					<Icon name="check" size={20} />
					<p>Staging matches the live site. Nothing to publish.</p>
				</div>
			{:else if !visible.length}
				<p class="muted">Nothing matches that filter.</p>
			{:else}
				{#each groups as group (group.type)}
					{@const allOn = group.entries.every((entry) => selected.has(entry.id))}
					<section class="group" aria-label={group.label}>
						<header class="group-head">
							{#if !local}
								<input
									type="checkbox"
									checked={allOn}
									aria-label={`Select all ${group.label}`}
									onchange={() => toggleGroup(group.entries)}
								/>
							{/if}
							<h2>{group.label}</h2>
							<span class="count">{group.entries.length}</span>
						</header>
						<ul class="entries">
							{#each group.entries as entry (entry.id)}
								{@const expanded = open.has(entry.id)}
								{@const pulled = !selected.has(entry.id) && extra.some((row) => row.id === entry.id)}
								<li class="entry" class:on={selected.has(entry.id) || pulled}>
									<div class="entry-row">
										{#if !local}
											<input
												type="checkbox"
												checked={selected.has(entry.id) || pulled}
												disabled={pulled}
												title={pulled ? "Published with a change you picked that needs it." : undefined}
												aria-label={`Select ${entry.label}`}
												onchange={() => (selected = toggle(selected, entry.id))}
											/>
										{/if}
										<span class="badge {entry.change}">{changeLabel(entry.change)}</span>
										<button
											type="button"
											class="entry-main"
											aria-expanded={expanded}
											disabled={!entry.fields.length}
											onclick={() => (open = toggle(open, entry.id))}
										>
											<span class="entry-label">{entry.label}</span>
											<span class="entry-fields">
												{pulled ? "Needed by your selection" : fieldSummary(entry)}
											</span>
											{#if entry.fields.length}
												<Icon name={expanded ? "chevron-up" : "chevron-down"} size={16} />
											{/if}
										</button>
									</div>
									{#if expanded}
										<div class="fields">
											<table>
												<thead>
													<tr>
														<th scope="col">Field</th>
														<th scope="col">Live</th>
														<th scope="col">Staging</th>
													</tr>
												</thead>
												<tbody>
													{#each entry.fields as field (field.key)}
														<tr>
															<th scope="row">{field.label}</th>
															<td class="old">
																{field.detailOnly ? "Details differ" : field.production}
															</td>
															<td class="new">
																{field.detailOnly ? "(crop, formatting or order)" : field.staging}
															</td>
														</tr>
													{/each}
												</tbody>
											</table>
										</div>
									{/if}
								</li>
							{/each}
						</ul>
					</section>
				{/each}
			{/if}
		</div>
	{/if}

	<Dialog
		open={confirm !== null}
		title="Publish to gwenda.co.uk?"
		onclose={() => {
			if (!publishing) confirm = null;
		}}
	>
		<p class="dialog-copy">
			{#if confirm === "all"}
				Every change below ({countLabel(entries.length)}) goes live.
			{:else}
				{countLabel(selectedCount)} go live{extra.length
					? `, including ${extra.length} that your selection needs`
					: ""}.
			{/if}
			What's on updates straight away. Series, night and menu pages update when the live site
			finishes rebuilding, in a few minutes.
		</p>
		{#snippet footer()}
			<Button variant="outline" size="sm" disabled={publishing} onclick={() => (confirm = null)}>
				Cancel
			</Button>
			<Button variant="primary" size="sm" busy={publishing} onclick={() => void publish()}>
				{publishing ? "Publishing…" : "Publish"}
			</Button>
		{/snippet}
	</Dialog>
	<BusyOverlay active={loading && !diff} label="Comparing staging and live…" />
</div>

<style>
	.page {
		position: relative;
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: var(--page-gutter);
	}

	.ready {
		display: flex;
		flex-direction: column;
		gap: var(--gap);
		max-width: 60rem;
	}

	.error {
		margin: 0;
		color: var(--destructive);
	}

	.muted {
		margin: 0;
		color: var(--muted-foreground);
		font-size: var(--text-sm);
	}

	.banner {
		display: flex;
		gap: 0.6rem;
		align-items: flex-start;
		margin: 0;
		padding: 0.75rem 0.9rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--primary-wash);
		font-size: var(--text-sm);
		line-height: 1.45;
	}

	.summary {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.5rem 1.5rem;
		padding: 0.9rem 1rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--card);
	}

	.stat {
		display: flex;
		align-items: baseline;
		gap: 0.35rem;
	}

	.stat-value {
		font-family: var(--font-display);
		font-size: 1.5rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}

	.stat-label {
		color: var(--muted-foreground);
		font-size: var(--text-sm);
	}

	.code {
		flex: 1 1 18rem;
		margin: 0;
		color: var(--muted-foreground);
		font-size: var(--text-sm);
		text-align: right;
	}

	.code.ahead {
		color: var(--primary);
	}

	.warnings {
		margin: 0;
		padding-left: 1.1rem;
		color: var(--destructive);
		font-size: var(--text-sm);
	}

	.empty {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 1.25rem 1rem;
		border: 1px dashed var(--border);
		border-radius: var(--radius-lg);
		color: var(--up);
	}

	.empty p {
		margin: 0;
		color: var(--foreground);
	}

	.group {
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--card);
		overflow: hidden;
	}

	.group-head {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.65rem 1rem;
		border-bottom: 1px solid var(--border);
	}

	.group-head h2 {
		margin: 0;
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--muted-foreground);
	}

	.count {
		margin-left: auto;
		color: var(--muted-foreground);
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
	}

	.entries {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.entry + .entry {
		border-top: 1px solid var(--border);
	}

	.entry.on {
		background: var(--primary-wash);
	}

	.entry-row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.5rem 1rem;
		min-width: 0;
	}

	input[type="checkbox"] {
		flex-shrink: 0;
		width: 1rem;
		height: 1rem;
		accent-color: var(--primary);
	}

	.badge {
		flex-shrink: 0;
		width: 4.75rem;
		padding: 0.15rem 0;
		border-radius: var(--radius-pill);
		font-size: var(--text-xs);
		font-weight: 700;
		letter-spacing: 0.04em;
		text-align: center;
		text-transform: uppercase;
	}

	.badge.added {
		color: var(--up);
		background: color-mix(in srgb, var(--up) 14%, transparent);
	}

	.badge.changed {
		color: var(--primary);
		background: var(--primary-wash);
	}

	.badge.removed {
		color: var(--destructive);
		background: var(--destructive-wash);
	}

	.entry-main {
		display: flex;
		flex: 1;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.1rem 0.75rem;
		min-width: 0;
		padding: 0.25rem 0;
		border: 0;
		background: transparent;
		color: var(--foreground);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.entry-main:disabled {
		cursor: default;
	}

	.entry-main :global(svg) {
		margin-left: auto;
		color: var(--muted-foreground);
	}

	.entry-label {
		min-width: 0;
		font-weight: 500;
		overflow-wrap: anywhere;
	}

	.entry-fields {
		color: var(--muted-foreground);
		font-size: var(--text-sm);
	}

	.fields {
		padding: 0 1rem 0.75rem;
		overflow-x: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--text-sm);
	}

	th,
	td {
		padding: 0.45rem 0.6rem;
		text-align: left;
		vertical-align: top;
		border-bottom: 1px solid var(--border);
		overflow-wrap: anywhere;
	}

	thead th {
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--muted-foreground);
	}

	tbody th {
		width: 9rem;
		font-weight: 500;
		color: var(--muted-foreground);
	}

	td.old {
		color: var(--muted-foreground);
		text-decoration: line-through;
		text-decoration-color: color-mix(in srgb, var(--destructive) 55%, transparent);
	}

	td.new {
		color: var(--foreground);
	}

	.dialog-copy {
		margin: 0;
		line-height: 1.5;
	}

	@media (max-width: 640px) {
		.code {
			text-align: left;
		}

		.badge {
			width: auto;
			padding: 0.15rem 0.45rem;
		}
	}
</style>
