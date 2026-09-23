<script lang="ts">
	import { onMount } from "svelte";
	import { Button } from "../../ui";
	import { toast } from "../../lib/toast.svelte";
	import {
		beginSitePublish,
		readSitePublish,
		refreshSitePublish,
		SITE_PUBLISH_EVENT,
		sitePublishHref,
		sitePublishPhaseLabel,
		type SitePublishRun,
	} from "../../lib/site-publish";

	let { showStart = false }: { showStart?: boolean } = $props();

	let run = $state<SitePublishRun | null>(readSitePublish());
	let starting = $state(false);
	let error = $state("");

	const busy = $derived(Boolean(run && !run.completed) || starting);
	const label = $derived(run ? sitePublishPhaseLabel(run) : "");
	const failed = $derived(
		Boolean(run?.completed && run.conclusion !== "success" && run.conclusion !== "cancelled"),
	);

	async function poll() {
		const current = readSitePublish();
		run = current;
		if (!current || current.completed) return;
		try {
			run = await refreshSitePublish(current);
			error = "";
		} catch (err) {
			error = err instanceof Error ? err.message : "Could not read the site publish.";
		}
	}

	onMount(() => {
		const sync = () => {
			run = readSitePublish();
		};
		window.addEventListener(SITE_PUBLISH_EVENT, sync);
		const timer = window.setInterval(() => {
			void poll();
		}, 4000);
		void poll();
		return () => {
			window.removeEventListener(SITE_PUBLISH_EVENT, sync);
			window.clearInterval(timer);
		};
	});

	async function start() {
		if (busy) return;
		starting = true;
		error = "";
		try {
			run = await beginSitePublish("staging");
			toast.ok("Staging site publish started.");
		} catch (err) {
			const message = err instanceof Error ? err.message : "Could not publish the site.";
			error = message;
			toast.error(message);
		} finally {
			starting = false;
		}
	}
</script>

{#if showStart || run || error}
	<section class="site-publish" class:banner={!showStart} aria-live="polite">
		{#if showStart}
			<h3 class="title">Publish the staging site</h3>
			<p class="copy">
				The diary updates from the preview without this. Publishing the site rebuilds every
				page and takes a few minutes. New series pages need that rebuild.
			</p>
			<Button
				type="button"
				size="sm"
				variant="outline"
				busy={starting}
				disabled={busy}
				onclick={() => void start()}
			>
				{starting ? "Starting…" : busy ? "Publishing the site…" : "Publish staging site"}
			</Button>
		{/if}
		{#if label}
			<p class="status" class:failed class:done={run?.completed && run.conclusion === "success"}>
				{label}
			</p>
		{/if}
		{#if run && (run.runUrl || (run.completed && run.conclusion === "success"))}
			<p class="links">
				{#if run.runUrl}
					<a href={run.runUrl} target="_blank" rel="noreferrer">Build log</a>
				{/if}
				{#if run.completed && run.conclusion === "success"}
					<a href={sitePublishHref(run.target)} target="_blank" rel="noreferrer">Open What's on</a>
				{/if}
			</p>
		{/if}
		{#if error}<p class="error">{error}</p>{/if}
	</section>
{/if}

<style>
	.site-publish {
		display: grid;
		gap: 0.45rem;
		justify-items: start;
		margin-top: 1.25rem;
		padding-top: 1rem;
		border-top: 1px solid var(--border);
	}

	.site-publish.banner {
		margin-top: 0;
		margin-bottom: 0.25rem;
		padding: 0.85rem 1rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}

	.title {
		margin: 0;
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.copy,
	.status,
	.links,
	.error {
		margin: 0;
		font-size: var(--text-sm);
		line-height: 1.45;
	}

	.copy,
	.links {
		color: var(--muted-foreground);
	}

	.status.done {
		color: var(--up);
	}

	.status.failed,
	.error {
		color: var(--destructive);
	}

	.links {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
	}

	.links a {
		color: var(--primary);
		font-weight: 600;
		text-decoration: none;
	}

	.links a:hover {
		text-decoration: underline;
	}
</style>
