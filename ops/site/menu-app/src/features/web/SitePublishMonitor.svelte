<script lang="ts">
	import { onMount } from "svelte";
	import {
		readSitePublish,
		refreshSitePublish,
		SITE_PUBLISH_EVENT,
		sitePublishHref,
		sitePublishPhaseLabel,
		type SitePublishRun,
	} from "../../lib/site-publish";

	let run = $state<SitePublishRun | null>(readSitePublish());
	let error = $state("");

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
</script>

{#if run || error}
	<section class="site-publish" aria-live="polite">
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
		padding: 0.85rem 1rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}

	.status,
	.links,
	.error {
		margin: 0;
		font-size: var(--text-sm);
		line-height: 1.45;
	}

	.links {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		color: var(--muted-foreground);
	}

	.status.done {
		color: var(--up);
	}

	.status.failed,
	.error {
		color: var(--destructive);
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
