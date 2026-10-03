<script lang="ts">
	/**
	 * Dashboard: what to do first, then tonight, the site, errors, applications,
	 * website updates and drinks. Three sources load side by side (the dashboard
	 * summary, Sentry, and the menu for drinks) and each card shows its own
	 * loading and error state, so one failure never blanks the page.
	 */
	import { onMount } from "svelte";
	import { PageHeader } from "../ui";
	import Icon from "../app/shell/Icon.svelte";
	import * as api from "../app/api";
	import { loginNext } from "../app/nav";
	import { pourSettings } from "../config/settings.svelte";
	import type { InventoryItem } from "../inventory/types";
	import type { MenuSection } from "../menu/types";
	import DashCard from "./DashCard.svelte";
	import type { DashboardData, HealthSite, WebsiteErrors } from "./dashboard-data";
	import {
		SENTRY_ISSUES_URL,
		applicationsSummary,
		checkDetail,
		clockTime,
		drinkReason,
		featuredArtistEnding,
		groupNights,
		marginLine,
		menuItemsFromSections,
		needsAttention,
		nightHref,
		nightStatus,
		nightTime,
		plural,
		relativeTime,
		siteHealthState,
		summarizeDrinks,
	} from "./dashboard";

	type Load<T> = { state: "loading" } | { state: "error"; error: string } | { state: "ready"; data: T };

	let dashboard = $state<Load<DashboardData>>({ state: "loading" });
	let errors = $state<Load<WebsiteErrors>>({ state: "loading" });
	let drinks = $state<Load<{ sections: MenuSection[]; inventory: InventoryItem[] }>>({ state: "loading" });
	let now = $state(Date.now());

	function failMessage(err: unknown, fallback: string): string {
		const message = err instanceof Error ? err.message : fallback;
		if (message.startsWith("auth:")) {
			window.location.href = `/api/auth/login?next=${encodeURIComponent(loginNext("/"))}`;
		}
		return message || fallback;
	}

	async function loadDashboard() {
		dashboard = { state: "loading" };
		try {
			dashboard = { state: "ready", data: await api.getDashboard() };
			now = Date.now();
		} catch (err) {
			dashboard = { state: "error", error: failMessage(err, "Could not load the dashboard.") };
		}
	}

	async function loadErrors() {
		errors = { state: "loading" };
		try {
			errors = { state: "ready", data: await api.getWebsiteErrors() };
		} catch (err) {
			failMessage(err, "");
			// The server's message for a Sentry failure is generic; say what failed.
			errors = { state: "error", error: "Could not read errors from Sentry." };
		}
	}

	async function loadDrinks() {
		drinks = { state: "loading" };
		try {
			const [menu, stock] = await Promise.all([api.getMenu(), api.getInventory(false)]);
			drinks = { state: "ready", data: { sections: menu.sections || [], inventory: stock.items || [] } };
		} catch (err) {
			drinks = { state: "error", error: failMessage(err, "Could not load the menu.") };
		}
	}

	onMount(() => {
		void loadDashboard();
		void loadErrors();
		void loadDrinks();
	});

	const data = $derived(dashboard.state === "ready" ? dashboard.data : null);
	const errorData = $derived(errors.state === "ready" ? errors.data : null);

	/** A card's state from the whole summary and its own section. */
	function sectionState(key: keyof Omit<DashboardData, "ok" | "checkedAt">) {
		if (dashboard.state === "loading") return { state: "loading" as const, error: "" };
		if (dashboard.state === "error") return { state: "error" as const, error: dashboard.error };
		const section = dashboard.data[key];
		return section.ok ? { state: "ready" as const, error: "" } : { state: "error" as const, error: section.error };
	}

	const attention = $derived(
		needsAttention(data, errorData, { errorsFailed: errors.state === "error" }),
	);
	const attentionLoading = $derived(dashboard.state === "loading" || errors.state === "loading");

	const events = $derived(data?.events.ok ? data.events.data : null);
	const jobs = $derived(data?.jobs.ok ? data.jobs.data.jobs : null);
	const nightGroups = $derived(events ? groupNights(events.nights, events.today) : []);
	const eventsCard = $derived(sectionState("events"));

	const health = $derived(data?.health.ok ? data.health.data : null);
	const healthCard = $derived(sectionState("health"));

	const applications = $derived(applicationsSummary(data?.forms.ok ? data.forms.data : null, now));
	const formsCard = $derived(sectionState("forms"));

	const pending = $derived(data?.pending.ok ? data.pending.data : null);
	const pendingCard = $derived(sectionState("pending"));
	const failedJobs = $derived((jobs || []).filter((job) => job.state === "failed"));
	const waitingEvents = $derived(events?.waitingForUpdate || []);
	const websiteQuiet = $derived(
		Boolean(pending) &&
			!pending!.production.count &&
			!pending!.production.failed &&
			!pending!.production.updating &&
			!failedJobs.length &&
			!waitingEvents.length,
	);

	const artistEnding = $derived(
		featuredArtistEnding(data?.artists.ok ? data.artists.data : null, new Date(now)),
	);

	const drinkSummary = $derived(
		drinks.state === "ready" && pourSettings.loaded
			? summarizeDrinks(menuItemsFromSections(drinks.data.sections), drinks.data.inventory, pourSettings.targets)
			: null,
	);
	const margin = $derived(drinkSummary ? marginLine(drinkSummary) : null);
	const drinksState = $derived.by(() => {
		if (drinks.state === "error") return "error" as const;
		if (!drinkSummary) return "loading" as const;
		if (!drinkSummary.rows.length) return "clear" as const;
		return "ready" as const;
	});

	const healthSites = $derived(
		health ? ([health.production, health.preview].filter(Boolean) as HealthSite[]) : [],
	);
	const lastChecked = $derived.by(() => {
		const times = healthSites.map((site) => Number(site.lastCheckedAt) || Date.parse(String(site.lastCheckedAt)));
		const latest = Math.max(...times.filter(Number.isFinite), 0);
		return latest ? clockTime(latest) : data ? clockTime(data.checkedAt) : "";
	});

	function siteName(site: HealthSite): string {
		return site.id === "production" ? "Website" : "Preview";
	}
</script>

<div class="dash scrollbar-fade">
	<PageHeader title="Dashboard" />

	<section class="attention" aria-labelledby="attention-title" aria-busy={attentionLoading}>
		<h2 id="attention-title" class="sr-only">Needs attention</h2>
		{#if attention.items.length}
			<p class="attention-label">Needs attention</p>
			<ul class="attention-list">
				{#each attention.items as item (item.key)}
					<li>
						<a
							class="attention-item {item.tone}"
							href={item.href}
							target={item.external ? "_blank" : undefined}
							rel={item.external ? "noreferrer" : undefined}
						>
							<span class="attention-count tnum">{item.count}</span>
							<span>{item.label}</span>
							<Icon name={item.external ? "external-link" : "chevron-right"} size={14} />
						</a>
					</li>
				{/each}
			</ul>
		{:else if attentionLoading}
			<div class="attention-loading" aria-hidden="true"><span class="skel"></span></div>
			<span class="sr-only">Checking what needs attention…</span>
		{:else if attention.allClear}
			<p class="all-clear">
				<Icon name="check" size={16} />
				<span><strong>All clear.</strong> {attention.allClearText}.</span>
				{#if lastChecked}<span class="checked tnum">Checked {lastChecked}</span>{/if}
			</p>
		{:else}
			<p class="attention-unknown">
				Nothing waiting that we could check. Could not check {attention.unknown.join(", ")}.
			</p>
		{/if}
	</section>

	<div class="grid">
		<DashCard
			id="tonight"
			title="Tonight and the next 7 days"
			wide
			state={eventsCard.state === "ready" && !nightGroups.length ? "clear" : eventsCard.state}
			error={eventsCard.error}
			clearText="Nothing on in the next 7 days."
			href="/events/schedule"
			linkLabel="Schedule"
			skeletonRows={4}
			onretry={loadDashboard}
		>
			{#snippet meta()}{plural(events?.nights.length || 0, "night")}{/snippet}
			<div class="days">
				{#each nightGroups as group (group.date)}
					<div class="day" class:tonight={group.tonight}>
						<h3 class="day-label">{group.label}</h3>
						<ul class="rows">
							{#each group.nights as night (night.eventId + night.date)}
								{@const status = nightStatus(night, jobs)}
								<li class="row night">
									<span class="time tnum">{nightTime(night)}</span>
									<span class="what">
										<a class="name" href={nightHref(night)}>{night.title}</a>
										{#if night.artist}<span class="sub">{night.artist}</span>{/if}
										{#if night.calendarBehind}
											<span class="sub warn-text">Calendar not up to date</span>
										{/if}
									</span>
									<span class="badge {status.tone}">{status.label}</span>
								</li>
							{/each}
						</ul>
					</div>
				{/each}
			</div>
		</DashCard>

		<DashCard
			id="health"
			title="Site health"
			state={healthCard.state}
			error={healthCard.error}
			href="/web"
			linkLabel="Website"
			skeletonRows={4}
			onretry={loadDashboard}
		>
			{#snippet meta()}{#if lastChecked}Checked {lastChecked}{/if}{/snippet}
			{#if !healthSites.length}
				<p class="note">The site monitor has no results yet.</p>
			{/if}
			{#each healthSites as site (site.id)}
				{@const state = siteHealthState(site)}
				<div class="site">
					<div class="site-head">
						<span class="site-name">{siteName(site)}</span>
						<span class="badge {state.tone}">{state.label}</span>
					</div>
					{#if site.checks.length}
						<ul class="rows checks">
							{#each site.checks as check (check.name)}
								<li class="row check">
									<span class="check-name">{check.name}</span>
									<span class="badge {check.ok ? 'success' : 'danger'}" title={checkDetail(check)}>
										{check.ok ? "OK" : checkDetail(check)}
									</span>
								</li>
							{/each}
						</ul>
					{/if}
					{#if site.consecutiveFails}
						<p class="note danger-text">{plural(site.consecutiveFails, "failed check")} in a row.</p>
					{/if}
				</div>
			{/each}
		</DashCard>

		{#if errorData && !errorData.configured}
			<DashCard id="errors" title="Website errors" state="ready">
				{#snippet meta()}Not set up{/snippet}
				<p class="note">
					Add a read-only Sentry token as <code>SENTRY_READ_TOKEN</code> to see errors here.
				</p>
			</DashCard>
		{:else}
			<DashCard
				id="errors"
				title="Website errors"
				state={errors.state === "ready" && errorData?.configured && !errorData.total ? "clear" : errors.state}
				error={errors.state === "error" ? errors.error : ""}
				clearText="No errors in the last 24 hours."
				href={SENTRY_ISSUES_URL}
				linkLabel="Sentry"
				external
				onretry={loadErrors}
			>
				{#snippet meta()}
					{#if errorData?.configured}{errorData.capped ? `${errorData.total}+` : errorData.total} in 24h{/if}
				{/snippet}
				{#if errorData?.configured}
					<ul class="rows">
						{#each errorData.issues as issue (issue.id)}
							<li class="row issue">
								<span class="what">
									<a class="name" href={issue.link} target="_blank" rel="noreferrer">{issue.title}</a>
									<span class="sub">
										{issue.project}{#if issue.lastSeen}, last seen {relativeTime(issue.lastSeen, now)}{/if}
									</span>
								</span>
								{#if issue.isNew}<span class="badge danger">New</span>{/if}
								<span class="count tnum" title="Times in 24 hours">{issue.count}×</span>
							</li>
						{/each}
					</ul>
				{/if}
			</DashCard>
		{/if}

		<DashCard
			id="applications"
			title="Play applications"
			state={formsCard.state === "ready" && !applications.count ? "clear" : formsCard.state}
			error={formsCard.error}
			clearText={applications.emailFailed
				? `No applications waiting. ${plural(applications.emailFailed, "submission")} with an email that did not go out.`
				: "No applications waiting."}
			href="/forms"
			linkLabel="Applications"
			onretry={loadDashboard}
		>
			{#snippet meta()}{applications.count} to review{/snippet}
			<p class="lead">
				{plural(applications.count, "application")} to review{#if applications.oldest}, the oldest sent {applications.oldest}{/if}.
			</p>
			<ul class="rows">
				{#each applications.rows as row (row.id)}
					<li class="row">
						<a class="name" href="/forms/{encodeURIComponent(row.id)}">{row.name || row.email}</a>
						<span class="sub tnum">{row.age}</span>
					</li>
				{/each}
			</ul>
			{#if applications.count > applications.rows.length}
				<p class="note">{applications.count - applications.rows.length} more on Applications.</p>
			{/if}
			{#if applications.emailFailed}
				<p class="note warn-text">
					{plural(applications.emailFailed, "submission")} with an email that did not go out.
				</p>
			{/if}
		</DashCard>

		<DashCard
			id="updates"
			title="Website updates"
			state={pendingCard.state === "ready" && websiteQuiet ? "clear" : pendingCard.state}
			error={pendingCard.error}
			clearText="The website is up to date."
			href="/web"
			linkLabel="Website"
			onretry={loadDashboard}
		>
			{#if pending}
				{@const live = pending.production}
				{#if live.failed}
					<p class="lead danger-text">
						The last website update failed{#if live.lastError}: {live.lastError}{/if}.
						{#if live.runUrl}
							<a class="inline" href={live.runUrl} target="_blank" rel="noreferrer">See what happened</a>
						{/if}
					</p>
				{/if}
				{#if live.updating}
					<p class="lead">Updating the website now.</p>
				{/if}
				{#if live.count}
					<p class="lead">
						{plural(live.count, "change")} waiting for the website{#if live.autoUpdateAt && !live.updating && !live.failed}, updating
							by itself around {clockTime(live.autoUpdateAt)}{/if}.
					</p>
					<ul class="rows">
						{#each live.items as item (item.label + item.change)}
							<li class="row"><span class="name plain">{item.label}</span><span class="sub">{item.change}</span></li>
						{/each}
					</ul>
				{/if}
				{#if waitingEvents.length}
					<p class="lead">{plural(waitingEvents.length, "event")} waiting for Update website.</p>
					<ul class="rows">
						{#each waitingEvents.slice(0, 5) as event (event.id)}
							<li class="row">
								<a class="name" href="/events/{encodeURIComponent(event.id)}">{event.name}</a>
								<span class="sub">{event.change === "added" ? "New" : "Changed"}</span>
							</li>
						{/each}
					</ul>
				{/if}
				{#if failedJobs.length}
					<p class="lead danger-text">{plural(failedJobs.length, "event")} not ready for the website.</p>
					<ul class="rows">
						{#each failedJobs.slice(0, 5) as job (job.eventId)}
							<li class="row">
								<span class="what">
									<a class="name" href="/events/{encodeURIComponent(job.eventId)}">{job.name}</a>
									{#if job.error}<span class="sub">{job.error}</span>{/if}
								</span>
							</li>
						{/each}
					</ul>
				{/if}
			{/if}
		</DashCard>

		<DashCard
			id="drinks"
			title="Drinks with problems"
			state={drinksState}
			error={drinks.state === "error" ? drinks.error : ""}
			clearText={drinkSummary?.warningOnly
				? `No drinks with critical problems. ${plural(drinkSummary.warningOnly, "drink")} with warnings.`
				: "No drinks with problems."}
			href="/menu"
			linkLabel="Menu items"
			onretry={loadDrinks}
		>
			{#snippet meta()}
				{#if drinkSummary}{drinkSummary.critical} critical · {drinkSummary.atLoss} at a loss{/if}
			{/snippet}
			{#if drinkSummary}
				<ul class="rows">
					{#each drinkSummary.rows as row (row.id)}
						<li class="row">
							<a class="name" href={row.href}>{row.name}</a>
							<span class="sub {row.atLoss ? 'danger-text' : ''}">{drinkReason(row)}</span>
						</li>
					{/each}
				</ul>
				{#if drinkSummary.more}
					<p class="note">{drinkSummary.more} more with problems.</p>
				{/if}
				{#if drinkSummary.warningOnly}
					<a class="inline" href="/menu">+{plural(drinkSummary.warningOnly, "drink")} with warnings</a>
				{/if}
				{#if margin}
					<p class="note {margin.tone === 'warning' ? 'warn-text' : ''}">{margin.text}</p>
				{/if}
			{/if}
		</DashCard>

		{#if artistEnding}
			<DashCard id="artist" title="Featured artist" state="ready" href="/artists" linkLabel="Featured artist">
				<p class="lead">{artistEnding}'s time on the wall ends this month and nobody is lined up next.</p>
			</DashCard>
		{/if}
	</div>
</div>

<style>
	.dash {
		position: relative;
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: var(--page-gutter);
	}

	/* ─── Needs attention ─────────────────────────────────────────────── */

	.attention {
		margin-bottom: var(--space-4);
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface-1);
	}

	.attention-label {
		margin: 0 0 var(--space-2);
		font-size: var(--text-2xs);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--fg-muted);
	}

	.attention-list {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.attention-item {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-height: var(--control-h);
		padding: 0 var(--space-3);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		color: var(--fg);
		font-size: var(--text-base);
		text-decoration: none;
	}

	.attention-item:hover {
		background: var(--surface-3);
	}

	.attention-item.danger {
		border-color: var(--danger-border);
		background: var(--danger-wash);
	}

	.attention-item.warning {
		border-color: var(--warning-border);
		background: var(--warning-wash);
	}

	.attention-count {
		font-weight: 600;
	}

	.attention-item.danger .attention-count {
		color: var(--danger);
	}

	.attention-item.warning .attention-count {
		color: var(--warning);
	}

	.all-clear {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin: 0;
		color: var(--success);
		font-size: var(--text-base);
	}

	.all-clear strong {
		font-weight: 600;
	}

	.all-clear span:not(.checked) {
		color: var(--fg);
	}

	.checked {
		margin-left: auto;
		font-size: var(--text-sm);
		color: var(--fg-muted);
	}

	.attention-unknown {
		margin: 0;
		font-size: var(--text-base);
		color: var(--fg-muted);
	}

	.attention-loading .skel {
		height: 1.25rem;
		width: 60%;
	}

	/* ─── Grid ────────────────────────────────────────────────────────── */

	.grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		grid-auto-flow: row dense;
		align-items: start;
		gap: var(--space-4);
	}

	@media (max-width: 1200px) {
		.grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 900px) {
		.grid {
			grid-template-columns: minmax(0, 1fr);
			grid-auto-flow: row;
		}

		.attention-item {
			min-height: 44px;
		}
	}

	/* ─── Card content ────────────────────────────────────────────────── */

	.rows {
		display: grid;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		min-height: 2.5rem;
		padding-block: var(--space-1);
		border-top: 1px solid var(--border);
		min-width: 0;
	}

	.row:first-child {
		border-top: 0;
	}

	.what {
		display: grid;
		flex: 1;
		min-width: 0;
	}

	.name {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: var(--text-base);
		font-weight: 500;
		color: var(--fg);
		text-decoration: none;
	}

	a.name:hover {
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	.name.plain {
		font-weight: 400;
	}

	.sub {
		font-size: var(--text-sm);
		color: var(--fg-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		flex-shrink: 0;
		max-width: 60%;
	}

	.what .sub {
		max-width: none;
	}

	.lead {
		margin: 0 0 var(--space-2);
		font-size: var(--text-base);
		color: var(--fg);
	}

	.lead + .rows {
		margin-bottom: var(--space-3);
	}

	.note {
		margin: var(--space-2) 0 0;
		font-size: var(--text-sm);
		color: var(--fg-muted);
	}

	.note code {
		font-family: var(--font-mono);
		font-size: 0.92em;
		color: var(--fg);
	}

	.inline {
		display: inline-block;
		margin-top: var(--space-2);
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--fg);
		text-underline-offset: 3px;
	}

	.danger-text {
		color: var(--danger);
	}

	.warn-text {
		color: var(--warning);
	}

	.badge {
		flex-shrink: 0;
		padding: 0.125rem var(--space-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		font-size: var(--text-xs);
		font-weight: 500;
		line-height: 1.33;
		color: var(--fg-muted);
		white-space: nowrap;
		max-width: 12rem;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.badge.success {
		border-color: var(--success-border);
		background: var(--success-wash);
		color: var(--success);
	}

	.badge.warning {
		border-color: var(--warning-border);
		background: var(--warning-wash);
		color: var(--warning);
	}

	.badge.danger {
		border-color: var(--danger-border);
		background: var(--danger-wash);
		color: var(--danger);
	}

	.count {
		flex-shrink: 0;
		font-size: var(--text-sm);
		color: var(--fg-muted);
	}

	a:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
		border-radius: var(--radius-sm);
	}

	/* Tonight */

	.days {
		display: grid;
		gap: var(--space-4);
	}

	.day-label {
		margin: 0 0 var(--space-1);
		font-size: var(--text-2xs);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--fg-muted);
	}

	.day.tonight .day-label {
		color: var(--fg);
	}

	.night .time {
		flex: 0 0 6.5rem;
		font-size: var(--text-sm);
		color: var(--fg-muted);
	}

	/* Health */

	.site + .site {
		margin-top: var(--space-4);
	}

	.site-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		margin-bottom: var(--space-1);
	}

	.site-name {
		font-size: var(--text-base);
		font-weight: 500;
	}

	.check {
		min-height: 2rem;
	}

	.check-name {
		font-size: var(--text-sm);
		color: var(--fg-muted);
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	@media (max-width: 900px) {
		.row {
			min-height: 44px;
		}

		.night {
			flex-wrap: wrap;
		}

		.night .time {
			flex-basis: 100%;
		}
	}
</style>
