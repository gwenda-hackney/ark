<script lang="ts">
	/**
	 * Website, for editors: is gwenda.co.uk up to date, and what is about to
	 * change. Plain words only; developer tools live on their own admin page.
	 *
	 *  1. The website: up to date, updating, or "N changes will appear at 3:40".
	 *     It updates by itself once edits go quiet; "Update website now" skips the wait.
	 *  2. Not on the website yet: events whose saved version isn't on the website
	 *     (from ops' own status), plus anything else that differs (menu, Studio
	 *     edits, removed events). Put one, or all, on the website.
	 *  The preview site is a developer concern: only admins see its line.
	 */
	import { onDestroy, onMount } from "svelte";
	import { fly } from "svelte/transition";
	import { Icon } from "../../shell";
	import { BusyOverlay, Button, Dialog, PageHeader } from "../../ui";
	import {
		getEvents,
		getMe,
		getReleaseDiff,
		publishRelease,
		putEventOnWebsite,
		updateSiteNow,
		type OpsEvent,
		type ReleaseEntry,
		type SitePendingItem,
		type SiteStatus,
	} from "../../lib/api";
	import { loginNext, navigate } from "../../lib/nav";
	import { easeOut, flyMs } from "../../lib/motion";
	import { toast } from "../../lib/toast.svelte";
	import { getSitePendingState, refreshSitePending } from "../../lib/site-pending.svelte";

	/** Editors think in events, so events come from ops, not from document diffs. */
	type Waiting =
		| { key: string; kind: "event"; label: string; change: "added" | "changed"; event: OpsEvent }
		| { key: string; kind: "doc"; label: string; change: "added" | "changed" | "removed"; entry: ReleaseEntry };

	let unpublished = $state<Waiting[]>([]);
	let loaded = $state(false);
	let loadError = $state("");
	let local = $state(false);
	let isAdmin = $state(false);
	let working = $state("");
	let confirmAll = $state(false);
	let timer: ReturnType<typeof setInterval> | null = null;

	const pendingState = $derived(getSitePendingState());
	const live = $derived(pendingState.production);
	const preview = $derived(pendingState.staging);

	function clock(iso: string | null): string {
		if (!iso) return "";
		return new Date(iso).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" });
	}

	function when(iso: string | null): string {
		if (!iso) return "";
		const date = new Date(iso);
		const today = new Date();
		const sameDay = date.toDateString() === today.toDateString();
		return sameDay
			? `today at ${clock(iso)}`
			: date.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
	}

	function changeWord(change: string): string {
		if (change === "added") return "New";
		if (change === "removed") return "Removed";
		return "Changed";
	}

	function itemLabel(item: SitePendingItem): string {
		return item.kind === "artist" ? `Artist: ${item.label}` : item.label;
	}

	function changes(count: number): string {
		return count === 1 ? "1 change" : `${count} changes`;
	}

	type Tone = "ok" | "waiting" | "updating" | "failed" | "unknown";

	function statusOf(site: SiteStatus | null): { tone: Tone; title: string; note: string } {
		if (!site) return { tone: "unknown", title: "Checking the website…", note: "" };
		if (site.needsHelp) {
			return {
				tone: "failed",
				title: "The website didn't update",
				note: "We tried twice. Press Try again. If it still doesn't work, tell Dan.",
			};
		}
		if (site.failed && !site.updating) {
			return {
				tone: "failed",
				title: "The website didn't update",
				note: `We'll try again by itself${site.autoUpdateAt ? ` at about ${clock(site.autoUpdateAt)}` : " soon"}.`,
			};
		}
		if (site.updating) {
			return {
				tone: "updating",
				title: "The website is updating",
				note: "This usually takes about a minute. You can keep working.",
			};
		}
		if (!site.known) {
			return {
				tone: "unknown",
				title: "Not tracked yet",
				note: "Changes are tracked from the next website update.",
			};
		}
		if (site.items.length) {
			return {
				tone: "waiting",
				title: `${changes(site.items.length)} will appear on the website${site.autoUpdateAt ? ` at about ${clock(site.autoUpdateAt)}` : " soon"}`,
				note: "The What's on list already shows them. Event and artist pages update then.",
			};
		}
		return {
			tone: "ok",
			title: "The website is up to date",
			note: site.builtAt ? `Last updated ${when(site.builtAt)}.` : "",
		};
	}

	const liveStatus = $derived(statusOf(live));
	const previewStatus = $derived(statusOf(preview));

	const EVENT_TYPES = new Set(["event", "eventSeries"]);

	async function loadUnpublished() {
		try {
			const [diff, eventList] = await Promise.all([getReleaseDiff(), getEvents()]);
			const events: Waiting[] = (eventList.events || [])
				.filter((event) => event.publish.live !== "current")
				.map((event) => ({
					key: `event:${event.id}`,
					kind: "event",
					label: event.name || "Untitled event",
					change: event.publish.live === "unpublished" ? "added" : "changed",
					event,
				}));
			// Event documents are covered by their event, except ones still on the
			// website for events that no longer exist in ops.
			const docs: Waiting[] = diff.entries
				.filter((entry) => !EVENT_TYPES.has(entry.type) || entry.change === "removed")
				.map((entry) => ({ key: `doc:${entry.id}`, kind: "doc", label: entry.label, change: entry.change, entry }));
			unpublished = [...events, ...docs];
			local = diff.local;
			loadError = "";
		} catch (err) {
			const message = err instanceof Error ? err.message : "Could not check the website.";
			if (message.startsWith("auth:")) {
				window.location.href = `/api/auth/login?next=${encodeURIComponent(loginNext("/web"))}`;
				return;
			}
			loadError = message;
		} finally {
			loaded = true;
		}
	}

	async function refreshAll() {
		await Promise.all([loadUnpublished(), refreshSitePending()]);
	}

	onMount(() => {
		void refreshAll();
		getMe()
			.then((me) => (isAdmin = Boolean(me.isAdmin)))
			.catch(() => undefined);
		// Faster while this page is open, so "updating" turns into "up to date".
		timer = setInterval(() => void refreshSitePending(), 15_000);
	});

	onDestroy(() => {
		if (timer) clearInterval(timer);
	});

	async function updateNow(site: "production" | "staging") {
		if (working) return;
		working = `update-${site}`;
		try {
			await updateSiteNow(site);
			await refreshSitePending();
			toast.ok(site === "production" ? "Updating the website now." : "Updating the preview site now.");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Could not start the update.");
		} finally {
			working = "";
		}
	}

	async function putOne(item: Waiting) {
		if (item.kind === "event") {
			const result = await putEventOnWebsite(item.event.id);
			for (const warning of result.warnings) toast.info(warning);
		} else {
			const result = await publishRelease([item.entry.id]);
			for (const warning of result.warnings) toast.info(warning);
		}
	}

	async function putOnWebsite(items: Waiting[], all: boolean) {
		if (working) return;
		working = all ? "put-all" : `put-${items[0]?.key}`;
		try {
			for (const item of items) await putOne(item);
			confirmAll = false;
			toast.ok(
				all
					? "Everything is on the website. Pages update in a few minutes."
					: "On the website. Its page updates in a few minutes.",
			);
			await refreshAll();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Could not put that on the website.");
			await refreshAll();
		} finally {
			working = "";
		}
	}
</script>

<div class="page scrollbar-fade">
	<PageHeader title="Website" subtitle="What gwenda.co.uk shows, and what is about to change.">
		{#snippet actions()}
			{#if isAdmin}
				<Button variant="ghost" size="sm" onclick={() => navigate("/web/dev")}>Developer tools</Button>
			{/if}
		{/snippet}
	</PageHeader>

	{#if loadError}
		<p class="error">{loadError}</p>
	{:else if loaded}
		<div class="ready" in:fly={{ y: 10, duration: flyMs, easing: easeOut }}>
			{#if local}
				<p class="banner">
					<Icon name="lock" size={16} />
					<span>This is the test copy of ops. It can't change the website.</span>
				</p>
			{/if}

			<!-- 1. The website -->
			<section class="status {liveStatus.tone}" aria-live="polite">
				<span class="status-icon" aria-hidden="true">
					<Icon
						name={liveStatus.tone === "ok"
							? "check"
							: liveStatus.tone === "failed"
								? "alert"
								: liveStatus.tone === "updating"
									? "refresh"
									: "web"}
						size={24}
					/>
				</span>
				<div class="status-copy">
					<h2>{liveStatus.title}</h2>
					{#if liveStatus.note}<p>{liveStatus.note}</p>{/if}
					<a class="site-link" href="https://gwenda.co.uk" target="_blank" rel="noreferrer">
						Open gwenda.co.uk <Icon name="external-link" size={12} />
					</a>
				</div>
				{#if !local && live && (live.items.length || live.failed || !live.known) && !live.updating}
					<Button
						variant={liveStatus.tone === "failed" ? "primary" : "outline"}
						busy={working === "update-production"}
						disabled={Boolean(working)}
						onclick={() => void updateNow("production")}
					>
						{liveStatus.tone === "failed" ? "Try again" : "Update website now"}
					</Button>
				{/if}
			</section>

			{#if live?.items.length}
				<ul class="list">
					{#each live.items as item (item.kind + item.id)}
						<li>
							<span class="word {item.change}">{changeWord(item.change)}</span>
							<span class="name">{itemLabel(item)}</span>
						</li>
					{/each}
				</ul>
			{/if}

			<!-- 2. Saved but not on the website -->
			<section class="card" aria-labelledby="unpublished-title">
				<header class="card-head">
					<h2 id="unpublished-title">Not on the website yet</h2>
					{#if unpublished.length && !local}
						<Button variant="primary" size="sm" disabled={Boolean(working)} onclick={() => (confirmAll = true)}>
							Put all on the website
						</Button>
					{/if}
				</header>
				{#if !unpublished.length}
					<p class="muted">Nothing. Everything you've saved is on the website.</p>
				{:else}
					<p class="muted">
						You've saved these, but the website doesn't show them yet. Put them on one at a time, or
						all together.
					</p>
					<ul class="list">
						{#each unpublished as item (item.key)}
							<li>
								<span class="word {item.change}">
									{item.change === "removed" ? "Remove" : changeWord(item.change)}
								</span>
								<span class="name">{item.label}</span>
								{#if !local}
									<Button
										variant="outline"
										size="sm"
										busy={working === `put-${item.key}`}
										disabled={Boolean(working)}
										onclick={() => void putOnWebsite([item], false)}
									>
										{item.change === "removed" ? "Take off website" : "Put on website"}
									</Button>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
			</section>

			<!-- Preview site: developers only -->
			{#if isAdmin}
			<section class="preview" aria-label="Preview site">
				<span class="dot {previewStatus.tone}" aria-hidden="true"></span>
				<p>
					<strong>Preview site:</strong>
					{previewStatus.tone === "ok"
						? "up to date."
						: previewStatus.tone === "updating"
							? "updating."
							: previewStatus.tone === "failed"
								? "didn't update."
								: preview?.items.length
									? `${changes(preview.items.length)} will show there${preview.autoUpdateAt ? ` at about ${clock(preview.autoUpdateAt)}` : " soon"}.`
									: "checking…"}
					<a href="https://gwenda-staging.pages.dev" target="_blank" rel="noreferrer">Open preview site</a>
				</p>
				{#if !local && preview && (preview.items.length || preview.failed) && !preview.updating}
					<button
						type="button"
						class="link"
						disabled={Boolean(working)}
						onclick={() => void updateNow("staging")}
					>
						Update it now
					</button>
				{/if}
			</section>
			{/if}
		</div>
	{/if}

	<Dialog
		open={confirmAll}
		title="Put everything on the website?"
		onclose={() => {
			if (!working) confirmAll = false;
		}}
	>
		<p class="dialog-copy">
			{changes(unpublished.length)} will change the website for everyone. The What's on list
			updates straight away; event pages follow in a few minutes.
		</p>
		<ul class="dialog-list">
			{#each unpublished.slice(0, 8) as item (item.key)}
				<li>{item.change === "removed" ? "Remove" : changeWord(item.change)}: {item.label}</li>
			{/each}
			{#if unpublished.length > 8}<li>and {unpublished.length - 8} more</li>{/if}
		</ul>
		{#snippet footer()}
			<Button variant="outline" size="sm" disabled={Boolean(working)} onclick={() => (confirmAll = false)}>
				Cancel
			</Button>
			<Button variant="primary" size="sm" busy={working === "put-all"} onclick={() => void putOnWebsite(unpublished, true)}>
				Put on website
			</Button>
		{/snippet}
	</Dialog>
	<BusyOverlay active={!loaded} label="Checking the website…" />
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
		max-width: 44rem;
	}

	.error {
		margin: 0;
		color: var(--destructive);
	}

	.muted {
		margin: 0;
		color: var(--muted-foreground);
		font-size: var(--text-sm);
		line-height: 1.5;
	}

	.banner {
		display: flex;
		gap: 0.6rem;
		align-items: center;
		margin: 0;
		padding: 0.75rem 0.9rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--primary-wash);
		font-size: var(--text-sm);
	}

	/* The website: one big, calm status */
	.status {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 1rem 1.25rem;
		padding: 1.25rem 1.35rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-xl);
		background: var(--card);
	}

	.status-icon {
		display: grid;
		place-items: center;
		width: 3rem;
		height: 3rem;
		border-radius: 50%;
		background: var(--muted);
		color: var(--muted-foreground);
	}

	.status.ok .status-icon {
		background: color-mix(in srgb, var(--up) 16%, transparent);
		color: var(--up);
	}

	.status.waiting,
	.status.updating {
		border-color: color-mix(in srgb, var(--primary) 40%, var(--border));
	}

	.status.waiting .status-icon,
	.status.updating .status-icon {
		background: var(--primary-wash);
		color: var(--primary);
	}

	.status.updating .status-icon :global(svg) {
		animation: spin 1.4s linear infinite;
	}

	.status.failed {
		border-color: color-mix(in srgb, var(--destructive) 55%, var(--border));
	}

	.status.failed .status-icon {
		background: var(--destructive-wash);
		color: var(--destructive);
	}

	.status-copy {
		display: grid;
		flex: 1 1 16rem;
		gap: 0.3rem;
		min-width: 0;
	}

	.status-copy h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.35rem;
		font-weight: 600;
		line-height: 1.25;
	}

	.status-copy p {
		margin: 0;
		color: var(--muted-foreground);
		line-height: 1.45;
	}

	.site-link {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		width: fit-content;
		color: var(--primary);
		font-size: var(--text-sm);
		font-weight: 600;
		text-decoration: none;
	}

	/* Lists of changes */
	.card {
		display: grid;
		gap: 0.75rem;
		padding: 1.1rem 1.2rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--card);
	}

	.card-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem 1rem;
	}

	.card-head h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: var(--text-md);
		font-weight: 600;
	}

	.list {
		display: grid;
		gap: 0;
		margin: 0;
		padding: 0;
		list-style: none;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--background);
	}

	.list li {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		min-height: 3rem;
		padding: 0.5rem 0.9rem;
	}

	.list li + li {
		border-top: 1px solid var(--border);
	}

	.word {
		flex-shrink: 0;
		width: 4.5rem;
		font-size: var(--text-xs);
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--primary);
	}

	.word.added {
		color: var(--up);
	}

	.word.removed {
		color: var(--destructive);
	}

	.name {
		flex: 1;
		min-width: 0;
		font-size: 1rem;
		overflow-wrap: anywhere;
	}

	/* Preview site: one quiet line */
	.preview {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem 0.75rem;
		color: var(--muted-foreground);
		font-size: var(--text-sm);
	}

	.preview p {
		margin: 0;
	}

	.preview a,
	.link {
		color: var(--primary);
		font-weight: 600;
	}

	.link {
		padding: 0;
		border: 0;
		background: none;
		font: inherit;
		font-size: var(--text-sm);
		cursor: pointer;
	}

	.dot {
		width: 0.6rem;
		height: 0.6rem;
		border-radius: 50%;
		background: var(--muted-foreground);
	}

	.dot.ok {
		background: var(--up);
	}

	.dot.waiting,
	.dot.updating {
		background: var(--primary);
	}

	.dot.failed {
		background: var(--destructive);
	}

	.dialog-copy {
		margin: 0;
		line-height: 1.5;
	}

	.dialog-list {
		margin: 0.75rem 0 0;
		padding-left: 1.1rem;
		line-height: 1.6;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.status.updating .status-icon :global(svg) {
			animation: none;
		}
	}

	@media (max-width: 640px) {
		.list li {
			flex-wrap: wrap;
		}
	}
</style>
