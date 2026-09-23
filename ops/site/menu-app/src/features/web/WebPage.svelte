<script lang="ts">
	import { onMount } from "svelte";
	import { fly } from "svelte/transition";
	import { Icon } from "../../shell";
	import { BusyOverlay, Button, Card, Dialog, PageHeader } from "../../ui";
	import {
		getWebStatus,
		type WebStatus,
	} from "../../lib/api";
	import { beginSitePublish } from "../../lib/site-publish";
	import SitePublishMonitor from "./SitePublishMonitor.svelte";
	import { loginNext } from "../../lib/nav";
	import { toast } from "../../lib/toast.svelte";
	import { easeOut, flyMs } from "../../lib/motion";
	import {
		buildSyncMetrics,
		formatWhen,
		healthLabel,
		healthTone,
		shortCommit,
		siteHost,
		type MetricTone,
	} from "../../lib/web-metrics";

	let status = $state<WebStatus | null>(null);
	let loaded = $state(false);
	let loadError = $state("");
	let promoting = $state(false);
	let confirmTarget = $state<"staging" | "production" | null>(null);

	const staging = $derived(status?.environments.staging ?? null);
	const production = $derived(status?.environments.production ?? null);
	const syncMetrics = $derived(
		staging && production ? buildSyncMetrics(staging, production) : [],
	);
	const prodTone = $derived(healthTone(production));
	const stagingTone = $derived(healthTone(staging));

	function toneIcon(tone: MetricTone): string {
		if (tone === "up") return "check";
		if (tone === "down") return "x-circle";
		if (tone === "warn") return "alert";
		return "help";
	}

	async function load() {
		try {
			status = await getWebStatus();
			loadError = "";
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Failed to load website status.";
			if (message.startsWith("auth:")) {
				window.location.href = `/api/auth/login?next=${encodeURIComponent(loginNext("/web"))}`;
				return;
			}
			loadError = message;
		} finally {
			loaded = true;
		}
	}

	onMount(() => {
		void load();
	});

	async function promote() {
		if (promoting || !confirmTarget) return;
		const target = confirmTarget;
		promoting = true;
		try {
			const result = await beginSitePublish(target);
			confirmTarget = null;
			if (result.status === "in_progress") {
				toast.ok("A site publish is already running.");
			} else if (target === "staging") {
				toast.ok("Staging site publish started.");
			} else {
				toast.ok("Production publish started. Staging is copying onto the live site.");
			}
			await load();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Could not promote.");
		} finally {
			promoting = false;
		}
	}
</script>

<div class="page scrollbar-fade">
	<PageHeader
		title="Web"
		subtitle="Publish to staging, review, then promote to production."
	>
		{#snippet actions()}
			<Button
				variant="outline"
				size="sm"
				disabled={!loaded || promoting}
				onclick={() => void load()}
			>
				Refresh
			</Button>
			<Button
				variant="outline"
				size="sm"
				disabled={!loaded || !status || promoting}
				onclick={() => {
					confirmTarget = "staging";
				}}
			>
				Publish staging site
			</Button>
			<Button
				variant="primary"
				size="sm"
				disabled={!loaded || !status || promoting}
				onclick={() => {
					confirmTarget = "production";
				}}
			>
				Promote to production
			</Button>
		{/snippet}
	</PageHeader>

	{#if loadError}
		<p class="error">{loadError}</p>
	{:else if status && staging && production}
		<div class="ready" in:fly={{ y: 10, duration: flyMs, easing: easeOut }}>
			<SitePublishMonitor />
			<Card title="Sync" subtitle="Staging against production.">
				<ul class="rows">
					{#each syncMetrics as metric (metric.label)}
						<li class="row" title={metric.title}>
							<span class="label">{metric.label}</span>
							<span class="value {metric.tone}">{metric.value}</span>
							<span class="mark {metric.tone}" aria-hidden="true">
								<Icon name={toneIcon(metric.tone)} size={16} />
							</span>
						</li>
					{/each}
					<li class="row">
						<span class="label">Health</span>
						<span class="value {prodTone}">
							{healthLabel(production)}
							<span class="meta">· {formatWhen(production.health.lastCheckedAt)}</span>
						</span>
						<span class="mark {prodTone}" aria-hidden="true">
							<Icon name={toneIcon(prodTone)} size={16} />
						</span>
					</li>
				</ul>
				{#if production.health.lastError}
					<p class="note down">{production.health.lastError}</p>
				{/if}
			</Card>

			<Card title="Sites" subtitle="What each environment is running.">
				<table class="compare">
					<thead>
						<tr>
							<th></th>
							<th>Staging</th>
							<th>Production</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<th scope="row">Site</th>
							<td>
								{#if staging.siteUrl}
									<a href={staging.siteUrl} target="_blank" rel="noreferrer">
										{siteHost(staging.siteUrl)}
										<Icon name="external-link" size={12} />
									</a>
								{:else}
									—
								{/if}
							</td>
							<td>
								{#if production.siteUrl}
									<a href={production.siteUrl} target="_blank" rel="noreferrer">
										{siteHost(production.siteUrl)}
										<Icon name="external-link" size={12} />
									</a>
								{:else}
									—
								{/if}
							</td>
						</tr>
						<tr>
							<th scope="row">Branch</th>
							<td class="mono">{staging.git}</td>
							<td class="mono">{production.git}</td>
						</tr>
						<tr>
							<th scope="row">Code</th>
							<td class="mono">{shortCommit(staging.code.commit)}</td>
							<td class="mono">{shortCommit(production.code.commit)}</td>
						</tr>
						<tr>
							<th scope="row">Docs</th>
							<td class="tnum">{staging.content.count}</td>
							<td class="tnum">{production.content.count}</td>
						</tr>
						<tr>
							<th scope="row">Updated</th>
							<td>{formatWhen(staging.content.updatedAt)}</td>
							<td>{formatWhen(production.content.updatedAt)}</td>
						</tr>
						<tr>
							<th scope="row">Health</th>
							<td>
								<span class="inline {stagingTone}">
									<Icon name={toneIcon(stagingTone)} size={14} />
									{healthLabel(staging)}
								</span>
							</td>
							<td>
								<span class="inline {prodTone}">
									<Icon name={toneIcon(prodTone)} size={14} />
									{healthLabel(production)}
								</span>
							</td>
						</tr>
					</tbody>
				</table>
				{#if staging.code.error || staging.content.error || production.code.error || production.content.error}
					<p class="note down">
						{staging.code.error ||
							staging.content.error ||
							production.code.error ||
							production.content.error}
					</p>
				{/if}
			</Card>
		</div>
	{/if}
	<BusyOverlay active={!loaded && !loadError} label="Loading…" />
</div>

<Dialog
	open={Boolean(confirmTarget)}
	title={confirmTarget === "staging"
		? "Publish the staging site"
		: "Promote staging to production"}
	onclose={() => {
		if (!promoting) confirmTarget = null;
	}}
>
	{#if confirmTarget === "staging"}
		<p>
			Rebuilds every page on the preview site from published documents. This takes a few
			minutes. Event previews already show on What's on without this rebuild. Progress stays
			on this page.
		</p>
	{:else}
		<p>Copies staging onto production and rebuilds gwenda.co.uk.</p>
	{/if}
	{#snippet footer()}
		<Button
			variant="outline"
			size="sm"
			disabled={promoting}
			onclick={() => {
				confirmTarget = null;
			}}
		>
			Cancel
		</Button>
		<Button
			variant="primary"
			size="sm"
			busy={promoting}
			disabled={promoting}
			onclick={() => void promote()}
		>
			{promoting
				? "Promoting…"
				: confirmTarget === "staging"
					? "Publish staging site"
					: "Promote to production"}
		</Button>
	{/snippet}
</Dialog>

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
		max-width: 52rem;
	}

	.error {
		margin: 0;
		color: var(--destructive);
	}

	.rows {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
	}

	.row {
		display: grid;
		grid-template-columns: 8.5rem minmax(0, 1fr) 1.25rem;
		align-items: center;
		gap: 0.75rem;
		padding: 0.55rem 0;
		border-bottom: 1px solid var(--border);
		font-size: var(--text-sm);
	}

	.row:last-child {
		border-bottom: 0;
		padding-bottom: 0;
	}

	.row:first-child {
		padding-top: 0;
	}

	.label {
		color: var(--muted-foreground);
		font-weight: 500;
	}

	.value {
		min-width: 0;
		font-weight: 600;
		letter-spacing: -0.01em;
	}

	.value .meta {
		font-weight: 500;
		color: var(--muted-foreground);
	}

	.mark {
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	.value.up,
	.mark.up,
	.inline.up {
		color: var(--up);
	}

	.value.warn,
	.mark.warn,
	.inline.warn {
		color: var(--primary);
	}

	.value.down,
	.mark.down,
	.inline.down,
	.note.down {
		color: var(--down);
	}

	.value.muted,
	.mark.muted,
	.inline.muted {
		color: var(--muted-foreground);
	}

	.inline {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		font-weight: 600;
	}

	.compare {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--text-sm);
	}

	.compare th,
	.compare td {
		padding: 0.5rem 0.65rem;
		text-align: left;
		vertical-align: top;
		border-bottom: 1px solid var(--border);
	}

	.compare thead th {
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--muted-foreground);
	}

	.compare tbody th {
		width: 5.5rem;
		padding-left: 0;
		font-weight: 500;
		color: var(--muted-foreground);
	}

	.compare tbody td:last-child {
		padding-right: 0;
	}

	.compare tbody tr:last-child th,
	.compare tbody tr:last-child td {
		border-bottom: 0;
	}

	.compare a {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		color: inherit;
		text-decoration: none;
		word-break: break-all;
	}

	.compare a:hover {
		color: var(--primary);
	}

	.mono {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}

	.note {
		margin: 0.75rem 0 0;
		font-size: var(--text-sm);
		line-height: 1.45;
		color: var(--muted-foreground);
	}

	@media (max-width: 640px) {
		.row {
			grid-template-columns: 1fr auto;
			grid-template-areas:
				"label mark"
				"value mark";
			gap: 0.15rem 0.75rem;
		}

		.label {
			grid-area: label;
		}

		.value {
			grid-area: value;
		}

		.mark {
			grid-area: mark;
			align-self: center;
		}

		.compare thead th:nth-child(2),
		.compare thead th:nth-child(3),
		.compare td {
			font-size: var(--text-xs);
		}
	}
</style>
