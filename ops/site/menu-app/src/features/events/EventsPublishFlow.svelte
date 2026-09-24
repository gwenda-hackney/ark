<script lang="ts">
	import { Button } from "../../ui";
	import type { OpsEvent } from "../../lib/api";
	import {
		bulkPublishLead,
		bulkPublishProgress,
		eventsNeedingLive,
		eventsNeedingPreview,
		liveWorkCopy,
		previewWorkCopy,
	} from "../../lib/event-publish-queue";
	import { sitePublishHref } from "../../lib/site-publish-status";

	export type PublishBatch = {
		target: "staging" | "production";
		index: number;
		total: number;
		name: string;
	};

	let {
		events = [],
		batch = null,
		error = "",
		warnings = [],
		onPreview,
		onLive,
	}: {
		events?: OpsEvent[];
		batch?: PublishBatch | null;
		error?: string;
		warnings?: string[];
		onPreview: (republish: boolean) => void;
		onLive: () => void;
	} = $props();

	const previewPending = $derived(eventsNeedingPreview(events));
	const livePending = $derived(eventsNeedingLive(events));
	const previewCurrent = $derived(events.length > 0 && previewPending.length === 0);
	const liveCurrent = $derived(previewCurrent && livePending.length === 0);
	const stagingHref = sitePublishHref("staging");
	const liveHref = sitePublishHref("production");
	const runningPreview = $derived(batch?.target === "staging");
	const runningLive = $derived(batch?.target === "production");

	const shownPreview = $derived(previewPending.slice(0, 8));
	const hiddenPreview = $derived(previewPending.length - shownPreview.length);
	const shownLive = $derived(livePending.slice(0, 8));
	const hiddenLive = $derived(livePending.length - shownLive.length);
</script>

<p class="lead">
	{#if batch}
		{bulkPublishProgress(batch.target, batch.index, batch.total, batch.name)}
	{:else}
		{bulkPublishLead(events)}
	{/if}
</p>

<ol class="publish-flow">
	<li
		class="publish-step"
		class:done={previewCurrent}
		class:active={!previewCurrent}
		class:busy={runningPreview}
	>
		<span class="step-mark" aria-hidden="true">
			{#if previewCurrent}
				✓
			{:else if runningPreview}
				{batch?.index}
			{:else}
				1
			{/if}
		</span>
		<div class="step-body">
			<h3 class="step-title">Update preview</h3>
			<p class="step-copy">{previewWorkCopy(events)}</p>
			{#if shownPreview.length && !runningPreview}
				<ul class="names">
					{#each shownPreview as event (event.id)}
						<li>{event.name || "Untitled"}</li>
					{/each}
				</ul>
				{#if hiddenPreview}
					<p class="more">and {hiddenPreview} more</p>
				{/if}
			{/if}
			<Button
				type="button"
				variant={previewCurrent ? "outline" : "primary"}
				size="sm"
				busy={runningPreview}
				disabled={Boolean(batch) || !events.length}
				onclick={() => onPreview(previewCurrent)}
			>
				{#if runningPreview}
					Updating…
				{:else if previewCurrent}
					Republish preview
				{:else}
					Update preview
				{/if}
			</Button>
		</div>
	</li>
	<li class="publish-step" class:done={previewCurrent} class:locked={!previewCurrent}>
		<span class="step-mark" aria-hidden="true">
			{#if previewCurrent}✓{:else}2{/if}
		</span>
		<div class="step-body">
			<h3 class="step-title">Check What's on</h3>
			<p class="step-copy">
				{#if previewCurrent}
					Open What's on and refresh. Flyers, copy, and times come from this preview.
				{:else}
					Available after every preview is current.
				{/if}
			</p>
			{#if previewCurrent}
				<a class="step-link" href={stagingHref} target="_blank" rel="noreferrer">
					Open staging What's on
				</a>
			{/if}
		</div>
	</li>
	<li
		class="publish-step"
		class:done={liveCurrent}
		class:active={previewCurrent && !liveCurrent}
		class:locked={!previewCurrent}
		class:busy={runningLive}
	>
		<span class="step-mark" aria-hidden="true">
			{#if liveCurrent}
				✓
			{:else if runningLive}
				{batch?.index}
			{:else}
				3
			{/if}
		</span>
		<div class="step-body">
			<h3 class="step-title">Push live</h3>
			<p class="step-copy">{liveWorkCopy(events)}</p>
			{#if previewCurrent && shownLive.length && !runningLive}
				<ul class="names">
					{#each shownLive as event (event.id)}
						<li>{event.name || "Untitled"}</li>
					{/each}
				</ul>
				{#if hiddenLive}
					<p class="more">and {hiddenLive} more</p>
				{/if}
			{/if}
			{#if previewCurrent && !liveCurrent}
				<Button
					type="button"
					variant="primary"
					size="sm"
					busy={runningLive}
					disabled={Boolean(batch)}
					onclick={onLive}
				>
					{runningLive ? "Pushing…" : "Push live"}
				</Button>
			{:else if liveCurrent}
				<a class="step-link" href={liveHref} target="_blank" rel="noreferrer">
					Open live What's on
				</a>
			{/if}
		</div>
	</li>
</ol>

{#if warnings.length}
	<ul class="warnings">
		{#each warnings as warning (warning)}
			<li>{warning}</li>
		{/each}
	</ul>
{/if}
{#if error}<p class="error">{error}</p>{/if}

<style>
	.lead,
	.step-copy,
	.more,
	.error {
		margin: 0;
		font-size: var(--text-sm);
		line-height: 1.45;
	}

	.lead,
	.step-copy,
	.more {
		color: var(--muted-foreground);
	}

	.lead {
		margin-bottom: 0.85rem;
		color: var(--foreground);
	}

	.publish-flow {
		list-style: none;
		display: grid;
		gap: 0;
		margin: 0;
		padding: 0;
	}

	.publish-step {
		display: grid;
		grid-template-columns: 1.75rem minmax(0, 1fr);
		gap: 0.85rem;
		align-items: start;
		padding: 1rem 0;
		border-top: 1px solid var(--border);
	}

	.publish-step:first-child {
		border-top: 0;
		padding-top: 0.15rem;
	}

	.publish-step.locked {
		opacity: 0.45;
	}

	.publish-step.busy .step-mark {
		color: var(--primary);
	}

	.step-mark {
		display: grid;
		place-items: center;
		width: 1.75rem;
		height: 1.75rem;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: var(--surface);
		color: var(--muted-foreground);
		font-size: var(--text-xs);
		font-weight: 700;
		line-height: 1;
	}

	.publish-step.done .step-mark {
		border-color: color-mix(in srgb, #6aab7a 55%, var(--border));
		background: color-mix(in srgb, #6aab7a 18%, var(--surface));
		color: #8fce9c;
	}

	.publish-step.active:not(.done) .step-mark {
		border-color: var(--primary);
		color: var(--primary);
	}

	.step-body {
		display: grid;
		gap: 0.45rem;
		justify-items: start;
		padding-top: 0.15rem;
	}

	.step-title {
		margin: 0;
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.names {
		margin: 0;
		padding: 0;
		list-style: none;
		color: var(--foreground);
		font-size: var(--text-sm);
	}

	.step-link {
		color: var(--primary);
		font-size: var(--text-sm);
		font-weight: 600;
		text-decoration: none;
	}

	.step-link:hover {
		text-decoration: underline;
	}

	.warnings {
		margin: 0.85rem 0 0;
		padding-left: 1.1rem;
		color: var(--muted-foreground);
		font-size: var(--text-sm);
	}

	.error {
		margin-top: 0.85rem;
		color: var(--destructive);
	}
</style>
