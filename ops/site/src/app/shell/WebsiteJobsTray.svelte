<script lang="ts">
	/**
	 * Saved events catching up with the calendar and website, from anywhere
	 * in ops. A pill in the corner while anything is waiting, stuck, or just
	 * finished; it opens a drawer with the list and "Try again".
	 */
	import { Button, PageDrawer } from "../../ui";
	import { eventItemPath, navigate } from "../nav";
	import { toast } from "../../ui/toast.svelte";
	import { getWebsiteJobsState, retryWebsiteJob } from "../../events/website-jobs.svelte";
	import Icon from "./Icon.svelte";

	/** Phones have no top bar: float the pill at the top of the screen. */
	let { floating = false }: { floating?: boolean } = $props();

	const jobs = getWebsiteJobsState();
	let open = $state(false);
	let retrying = $state("");
	/** "Done" stays in the pill for a short while after the last job finishes. */
	let doneUntil = $state(0);
	let now = $state(Date.now());

	const waiting = $derived(jobs.jobs.filter((job) => job.state === "waiting"));
	const stuck = $derived(jobs.jobs.filter((job) => job.state === "failed"));
	/** Saved here but not in the server list yet. */
	const justSaved = $derived(
		jobs.queued.filter((id) => !jobs.jobs.some((job) => job.eventId === id)),
	);
	const busyCount = $derived(waiting.length + justSaved.length);

	let lastBusy = 0;
	$effect(() => {
		const count = busyCount;
		if (lastBusy && !count && !stuck.length) {
			doneUntil = Date.now() + 8000;
			setTimeout(() => (now = Date.now()), 8100);
		}
		lastBusy = count;
	});

	const tone = $derived(
		stuck.length ? "stuck" : busyCount || jobs.running ? "busy" : doneUntil > now ? "done" : "",
	);
	const label = $derived(
		tone === "stuck"
			? stuck.length === 1
				? "1 needs a look"
				: `${stuck.length} need a look`
			: tone === "busy"
				? busyCount > 1
					? `Getting ${busyCount} ready…`
					: "Getting it ready…"
				: "All saved",
	);

	function nameFor(id: string) {
		return jobs.recent.find((row) => row.eventId === id)?.name || "Just saved";
	}

	function clock(iso: string) {
		return new Date(iso).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" });
	}

	function openEvent(id: string) {
		open = false;
		navigate(eventItemPath(id));
	}

	async function retry(id: string) {
		if (retrying) return;
		retrying = id;
		try {
			await retryWebsiteJob(id);
			toast.ok("Trying again. It carries on in the background.");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "It still didn't work.");
		} finally {
			retrying = "";
		}
	}
</script>

{#if tone || open}
	<button
		type="button"
		class="pill {tone}"
		class:floating
		aria-haspopup="dialog"
		aria-label="{label}. Show what's being saved."
		onclick={() => (open = true)}
	>
		{#if tone === "stuck"}
			<Icon name="alert" size={15} />
		{:else if tone === "done"}
			<Icon name="check" size={15} />
		{:else}
			<span class="spin"><Icon name="refresh" size={15} /></span>
		{/if}
		<span>{label}</span>
	</button>
{/if}

<PageDrawer {open} onclose={() => (open = false)} title="Saving to the website">
	<p class="intro">
		After you save, the calendar and the website copy catch up here. It takes a minute or
		two. You can keep working.
	</p>

	{#if stuck.length}
		<h3>Needs a look</h3>
		<ul>
			{#each stuck as job (job.eventId)}
				<li class="stuck">
					<button type="button" class="name" onclick={() => openEvent(job.eventId)}>{job.name}</button>
					<p class="why">{job.error || "Something went wrong."}</p>
					<Button
						variant="outline"
						size="sm"
						busy={retrying === job.eventId}
						disabled={Boolean(retrying)}
						onclick={() => void retry(job.eventId)}
					>
						Try again
					</Button>
				</li>
			{/each}
		</ul>
	{/if}

	{#if busyCount}
		<h3>Getting ready</h3>
		<ul>
			{#each waiting as job (job.eventId)}
				<li>
					<span class="spin" aria-hidden="true"><Icon name="refresh" size={14} /></span>
					<button type="button" class="name" onclick={() => openEvent(job.eventId)}>{job.name}</button>
				</li>
			{/each}
			{#each justSaved as id (id)}
				<li>
					<span class="spin" aria-hidden="true"><Icon name="refresh" size={14} /></span>
					<button type="button" class="name" onclick={() => openEvent(id)}>{nameFor(id)}</button>
				</li>
			{/each}
		</ul>
	{/if}

	{#if !stuck.length && !busyCount}
		<p class="empty">Nothing waiting. Everything you've saved is ready.</p>
	{/if}

	{#if jobs.recent.length}
		<h3>Done</h3>
		<ul>
			{#each jobs.recent as row (row.eventId + row.at)}
				<li class="done">
					<Icon name="check" size={14} />
					<button type="button" class="name" onclick={() => openEvent(row.eventId)}>{row.name}</button>
					<span class="at">{clock(row.at)}</span>
				</li>
			{/each}
		</ul>
	{/if}
</PageDrawer>

<style>
	.pill {
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		height: 1.75rem;
		padding: 0 var(--space-3);
		/* One hairline, no shadow: a border plus a shadow ring read as two edges. */
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-pill);
		background: var(--surface-1);
		color: var(--foreground);
		font: inherit;
		font-size: var(--text-sm);
		cursor: pointer;
	}

	.pill:hover {
		background: var(--surface-3);
	}

	.pill:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
		border-radius: var(--radius-pill);
	}

	.pill.floating {
		position: fixed;
		top: calc(0.5rem + env(safe-area-inset-top, 0px));
		left: 50%;
		z-index: 40;
		transform: translateX(-50%);
		background: var(--surface-2);
	}

	/* Below the dev/local banner rather than over its text (#32). */
	:global(body:has(.env-banner)) .pill.floating {
		top: calc(2.25rem + env(safe-area-inset-top, 0px));
	}

	/* Phones: above the bottom bar, clear of the tab strip and page actions. */
	:global(body:has(.shell.has-tabs)) .pill.floating {
		top: auto;
		bottom: calc(var(--bottom-nav-h) + 0.75rem);
	}

	.pill.stuck {
		border-color: color-mix(in srgb, var(--destructive) 45%, transparent);
		color: var(--destructive);
	}

	.pill.done {
		color: var(--muted-foreground);
	}

	.spin {
		display: inline-flex;
		animation: spin 1.2s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.spin {
			animation: none;
		}
	}

	.intro,
	.empty {
		margin: 0 0 var(--space-4);
		color: var(--muted-foreground);
		font-size: var(--text-sm);
	}

	h3 {
		margin: var(--space-5) 0 var(--space-2);
		font-size: var(--text-2xs);
		font-weight: 600;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--muted-foreground);
	}

	ul {
		display: grid;
		gap: var(--space-1);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-2);
		padding: var(--space-2) 0;
		border-bottom: 1px solid var(--border);
	}

	li.stuck {
		align-items: flex-start;
	}

	.name {
		flex: 1 1 auto;
		min-width: 0;
		padding: 0;
		border: 0;
		background: none;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.name:hover {
		text-decoration: underline;
	}

	.why {
		flex: 1 1 100%;
		margin: 0;
		color: var(--destructive);
		font-size: var(--text-sm);
	}

	.done {
		color: var(--muted-foreground);
	}

	.at {
		font-size: var(--text-sm);
		font-variant-numeric: tabular-nums;
		font-feature-settings: var(--font-features-num);
	}
</style>
