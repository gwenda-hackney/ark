<script lang="ts">
	/**
	 * Dashboard: what to do first, then tonight, the site, errors, applications,
	 * website updates and drinks. Three sources load side by side (the dashboard
	 * summary, Sentry, and the menu for drinks) and each card shows its own
	 * loading and error state, so one failure never blanks the page.
	 */
	import { onMount } from "svelte";
	import { Badge, PageHeader } from "../ui";
	import Icon from "../app/shell/Icon.svelte";
	import * as api from "../app/api";
	import { pourSettings } from "../config/settings.svelte";
	import type { InventoryItem } from "../inventory/types";
	import type { MenuSection } from "../menu/types";
	import DashCard from "./DashCard.svelte";
	import type { DashboardData, HealthSite, WebsiteErrors } from "./dashboard-data";
	import {
		SENTRY_ISSUES_URL,
		agendaDate,
		applicationsSummary,
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
		siteSummary,
		summarizeDrinks,
		type Tone,
	} from "./dashboard";

	type Load<T> = { state: "loading" } | { state: "error"; error: string } | { state: "ready"; data: T };

	let dashboard = $state<Load<DashboardData>>({ state: "loading" });
	let errors = $state<Load<WebsiteErrors>>({ state: "loading" });
	let drinks = $state<Load<{ sections: MenuSection[]; inventory: InventoryItem[] }>>({ state: "loading" });
	let now = $state(Date.now());

	function failMessage(err: unknown, fallback: string): string {
		// Signed out is handled once in api.ts (the splash, then the gate).
		const message = err instanceof Error ? err.message : fallback;
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

	type Tile = {
		key: string;
		label: string;
		/** Phones: fits half the screen. */
		short: string;
		icon: string;
		href: string;
		external?: boolean;
		state: "loading" | "ready";
		value: string;
		sub: string;
		tone: Tone;
	};

	const tiles = $derived.by((): Tile[] => {
		const site = health?.production ?? null;
		const siteState = siteHealthState(site);
		const checks = site?.checks || [];
		const passing = checks.filter((check) => check.ok).length;
		const live = pending?.production;
		const waiting = waitingEvents.length + (live?.count || 0);
		return [
			{
				key: "site",
				label: "Website",
				short: "Website",
				icon: "web",
				href: "/web",
				state: healthCard.state === "loading" ? "loading" : "ready",
				value: healthCard.state === "error" ? "—" : siteState.label,
				sub:
					healthCard.state === "error"
						? "Could not check"
						: checks.length
							? `${passing} of ${checks.length} checks OK`
							: "No results yet",
				tone: healthCard.state === "error" ? "muted" : siteState.tone,
			},
			{
				key: "errors",
				label: "Errors, 24h",
				short: "Errors, 24h",
				icon: "alert",
				href: SENTRY_ISSUES_URL,
				external: true,
				state: errors.state === "loading" ? "loading" : "ready",
				value: errorData?.configured ? (errorData.capped ? `${errorData.total}+` : String(errorData.total)) : "—",
				sub:
					errors.state === "error"
						? "Could not read Sentry"
						: !errorData?.configured
							? "Not set up"
							: errorData.newCount
								? `${errorData.newCount} new`
								: "Nothing new",
				tone: errorData?.configured ? (errorData.newCount ? "danger" : errorData.total ? "warning" : "success") : "muted",
			},
			{
				key: "waiting",
				label: "Waiting for the website",
				short: "To publish",
				icon: "upload",
				href: "/web",
				state: pendingCard.state === "loading" || eventsCard.state === "loading" ? "loading" : "ready",
				value: pendingCard.state === "error" ? "—" : String(waiting),
				sub: live?.failed
					? "Last update failed"
					: live?.updating
						? "Updating now"
						: waiting
							? "Use Update website"
							: "Up to date",
				tone: live?.failed ? "danger" : waiting ? "warning" : "success",
			},
			{
				key: "applications",
				label: "Applications to review",
				short: "To review",
				icon: "forms",
				href: "/forms",
				state: formsCard.state === "loading" ? "loading" : "ready",
				value: formsCard.state === "error" ? "—" : String(applications.count),
				sub:
					formsCard.state === "error"
						? "Could not load"
						: applications.count
							? `Oldest sent ${applications.oldest}`
							: "None waiting",
				tone: formsCard.state === "error" ? "muted" : applications.count ? "warning" : "success",
			},
		];
	});

	/** Attention items, plus the featured artist running out (not counted by needsAttention). */
	const attentionItems = $derived(
		artistEnding
			? [
					...attention.items,
					{
						key: "artist",
						count: 1,
						label: `featured artist ends this month, nobody next`,
						href: "/artists",
						tone: "warning" as Tone,
					},
				]
			: attention.items,
	);

	function siteName(site: HealthSite): string {
		return site.id === "production" ? "Website" : "Preview site";
	}
</script>

<div class="dash scrollbar-fade">
	<PageHeader title="Dashboard" />

	{#if attentionItems.length}
		<section class="attention" aria-labelledby="attention-title">
			<h2 id="attention-title" class="attention-label">
				Needs attention <span class="attention-total tnum">{attentionItems.length}</span>
			</h2>
			<ul class="attention-list">
				{#each attentionItems as item (item.key)}
					<li>
						<a
							class="attention-item {item.tone}"
							href={item.href}
							target={item.external ? "_blank" : undefined}
							rel={item.external ? "noreferrer" : undefined}
						>
							<span class="attention-icon" aria-hidden="true"><Icon name="alert" size={14} /></span>
							<span class="attention-text"><strong class="tnum">{item.count}</strong> {item.label}</span>
							<Icon name={item.external ? "external-link" : "chevron-right"} size={14} />
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{:else if !attentionLoading && attention.allClear}
		<p class="all-clear">
			<Icon name="check" size={16} />
			<span><strong>All clear.</strong> {attention.allClearText}.</span>
			{#if lastChecked}<span class="checked tnum">Checked {lastChecked}</span>{/if}
		</p>
	{:else if !attentionLoading && attention.unknown.length}
		<p class="attention-unknown">Could not check {attention.unknown.join(", ")}.</p>
	{/if}

	<div class="board">
		<ul class="tiles" aria-label="At a glance">
			{#each tiles as tile (tile.key)}
				<li>
					<a
						class="tile {tile.tone}"
						href={tile.href}
						target={tile.external ? "_blank" : undefined}
						rel={tile.external ? "noreferrer" : undefined}
						aria-busy={tile.state === "loading"}
					>
						<span class="tile-label">
							<span class="tile-icon"><Icon name={tile.icon} size={14} /></span>
							<span class="long">{tile.label}</span>
							<span class="short">{tile.short}</span>
						</span>
						{#if tile.state === "loading"}
							<span class="skel tile-skel" aria-hidden="true"></span>
							<span class="sr-only">Loading…</span>
						{:else}
							<span class="tile-value tnum">{tile.value}</span>
							<span class="tile-sub"><span class="dot" aria-hidden="true"></span>{tile.sub}</span>
						{/if}
					</a>
				</li>
			{/each}
		</ul>

		<div class="cell week">
			<DashCard
				id="tonight"
				title="This week"
				state={eventsCard.state === "ready" && !nightGroups.length ? "clear" : eventsCard.state}
				error={eventsCard.error}
				clearText="Nothing on in the next 7 days."
				href="/events/schedule"
				linkLabel="Schedule"
				skeletonRows={4}
				onretry={loadDashboard}
			>
				{#snippet meta()}{plural(events?.nights.length || 0, "night")}{/snippet}
				<ol class="agenda">
					{#each nightGroups as group (group.date)}
						{@const when = agendaDate(group.date, events?.today || group.date)}
						<li class="agenda-day" class:tonight={group.tonight}>
							<div class="date" aria-label={group.label}>
								<span class="weekday">{when.weekday}</span>
								<span class="daynum tnum">{when.day}</span>
								<span class="month">{when.month}</span>
								{#if when.relative}<span class="relative">{when.relative}</span>{/if}
							</div>
							<ul class="rows">
								{#each group.nights as night (night.eventId + night.date)}
									{@const status = nightStatus(night, jobs)}
									<li class="row night">
										<span class="what">
											<a class="name" href={nightHref(night)}>{night.title}</a>
											<span class="sub">
												<span class="tnum">{nightTime(night)}</span>{#if night.artist}&nbsp;· {night.artist}{/if}
											</span>
											{#if night.calendarBehind}
												<span class="sub warn-text">Calendar not up to date</span>
											{/if}
										</span>
										<Badge tone={status.tone} label={status.label} title={status.title} />
									</li>
								{/each}
							</ul>
						</li>
					{/each}
				</ol>
			</DashCard>

		</div>

		<div class="cell side">
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
				<ul class="sites">
					{#each healthSites as site (site.id)}
						{@const summary = siteSummary(site)}
						<li class="site {summary.tone}">
							<span class="site-mark" aria-hidden="true">
								<Icon name={summary.tone === "success" ? "check" : "alert"} size={16} />
							</span>
							<span class="site-text">
								<span class="site-line">
									<span class="site-name">{siteName(site)}</span>
									<span class="site-state">{summary.label}</span>
								</span>
								<span class="site-detail">{summary.detail}</span>
								{#each summary.failing as failure (failure)}
									<span class="site-fail">{failure}</span>
								{/each}
								{#if site.consecutiveFails > 1}
									<span class="site-fail">{plural(site.consecutiveFails, "failed check")} in a row</span>
								{/if}
							</span>
						</li>
					{/each}
				</ul>
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

		</div>

		<div class="cell third">
			{#if errorData && !errorData.configured}
				<DashCard
					id="errors"
					title="Website errors"
					state="clear"
					clearIcon="settings"
					clearTone="muted"
					clearText="Not set up yet. Add a read-only Sentry token as SENTRY_READ_TOKEN to see errors here."
				/>
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
									{#if issue.isNew}<Badge tone="danger" label="New" />{/if}
									<span class="count tnum" title="Times in 24 hours">{issue.count}×</span>
								</li>
							{/each}
						</ul>
					{/if}
				</DashCard>
			{/if}

		</div>
		<div class="cell third">
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

		</div>
		<div class="cell third">
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

		</div>
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
		padding: var(--space-3) var(--space-3) var(--space-3) var(--space-5);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--panel-bg);
	}

	.attention-label {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin: 0 0 var(--space-2);
		padding-top: var(--space-1);
		font-family: var(--font);
		font-size: var(--text-base);
		font-weight: 600;
	}

	.attention-total {
		font-size: var(--text-sm);
		font-weight: 400;
		color: var(--fg-muted);
	}

	/* One row per thing to do, two columns when there's room. */
	.attention-list {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 22rem), 1fr));
		gap: var(--space-1) var(--space-4);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.attention-item {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-height: 2.5rem;
		padding: 0 var(--space-2) 0 0;
		border-radius: var(--radius-md);
		color: var(--fg-muted);
		font-size: var(--text-base);
		text-decoration: none;
	}

	.attention-item:hover {
		color: var(--fg);
	}

	.attention-item:hover .attention-text {
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	.attention-icon {
		display: inline-grid;
		place-items: center;
		flex-shrink: 0;
		width: 1.75rem;
		height: 1.75rem;
		border-radius: var(--radius-md);
		background: var(--surface-3);
	}

	.attention-item.warning .attention-icon {
		background: var(--warning-wash);
		color: var(--warning);
	}

	.attention-item.danger .attention-icon {
		background: var(--danger-wash);
		color: var(--danger);
	}

	.attention-text {
		flex: 1;
		min-width: 0;
		color: var(--fg);
	}

	.attention-text strong {
		font-weight: 600;
	}

	.all-clear {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin: 0 0 var(--space-4);
		color: var(--success);
		font-size: var(--text-sm);
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
		margin: 0 0 var(--space-4);
		font-size: var(--text-sm);
		color: var(--fg-muted);
	}

	/* ─── Board ───────────────────────────────────────────────────────────
	   One 12-column grid so every edge lines up: four tiles of 3, the week
	   (8) beside health and updates (4), then three cards of 4. Rows stretch,
	   so cards side by side are always the same height. */

	.board {
		display: grid;
		grid-template-columns: repeat(12, minmax(0, 1fr));
		gap: var(--space-4);
	}

	.tiles {
		grid-column: 1 / -1;
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: var(--space-4);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.cell {
		min-width: 0;
	}

	.week {
		grid-column: span 8;
	}

	.side {
		grid-column: span 4;
		display: grid;
		grid-template-rows: auto 1fr;
		gap: var(--space-4);
	}

	.third {
		grid-column: span 4;
	}

	/* Tiles */

	.tile {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		height: 100%;
		padding: var(--space-4) var(--space-5);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--panel-bg);
		color: var(--fg);
		text-decoration: none;
		transition: border-color 120ms ease, background-color 120ms ease;
	}

	.tile:hover {
		border-color: var(--border-strong);
		background: var(--surface-2);
	}

	.tile-label {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-sm);
		color: var(--fg-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.tile-label .short {
		display: none;
	}

	.tile-icon {
		display: inline-grid;
		place-items: center;
		flex-shrink: 0;
		width: 1.5rem;
		height: 1.5rem;
		border-radius: var(--radius-sm);
		background: var(--surface-3);
		color: var(--fg-muted);
	}

	.tile-value {
		margin-top: var(--space-2);
		font-size: var(--text-2xl);
		font-weight: 600;
		line-height: 1.1;
		letter-spacing: -0.02em;
	}

	.tile-sub {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-xs);
		color: var(--fg-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.dot {
		flex-shrink: 0;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--fg-subtle);
	}

	.tile.success .dot {
		background: var(--success);
	}

	.tile.warning .dot {
		background: var(--warning);
	}

	.tile.danger .dot {
		background: var(--danger);
	}

	.tile.warning .tile-value {
		color: var(--warning);
	}

	.tile.danger .tile-value {
		color: var(--danger);
	}

	.tile.danger {
		border-color: var(--danger-border);
	}

	.tile-skel {
		height: 2rem;
		width: 40%;
		margin-top: var(--space-2);
	}

	@media (max-width: 1200px) {
		.board {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.tiles {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.week,
		.side {
			grid-column: 1 / -1;
		}

		.side {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			grid-template-rows: auto;
		}

		.third {
			grid-column: span 1;
		}

		.third:last-child {
			grid-column: 1 / -1;
		}
	}

	@media (max-width: 900px) {
		.board {
			grid-template-columns: minmax(0, 1fr);
			gap: var(--space-3);
		}

		.tiles {
			gap: var(--space-3);
		}

		.side {
			grid-template-columns: minmax(0, 1fr);
			gap: var(--space-3);
		}

		.third,
		.third:last-child {
			grid-column: auto;
		}

		.tile {
			padding: var(--space-3) var(--space-4);
		}

		.tile-value {
			font-size: var(--text-xl);
			margin-top: var(--space-1);
		}

		.tile-label {
			font-size: var(--text-xs);
		}

		.tile-label .long {
			display: none;
		}

		.tile-label .short {
			display: inline;
		}

		.attention {
			padding-left: var(--space-4);
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

	/* Agenda: a date block on the left, that day's nights beside it. */
	.agenda {
		display: grid;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.agenda-day {
		display: grid;
		grid-template-columns: 4.5rem minmax(0, 1fr);
		gap: var(--space-4);
		padding-block: var(--space-3);
		border-top: 1px solid var(--border);
	}

	.agenda-day:first-child {
		border-top: 0;
		padding-top: 0;
	}

	.date {
		display: grid;
		justify-items: center;
		align-content: start;
		padding-block: var(--space-2);
		border-radius: var(--radius-md);
		background: var(--surface-2);
		line-height: 1.1;
	}

	.weekday,
	.month {
		font-size: var(--text-2xs);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--fg-muted);
	}

	.relative {
		margin-top: var(--space-1);
		font-size: var(--text-2xs);
		font-weight: 600;
		color: var(--primary);
	}

	.daynum {
		margin-block: 2px;
		font-size: var(--text-lg);
		font-weight: 600;
		color: var(--fg);
	}

	.agenda-day.tonight .date {
		background: var(--primary-wash, var(--surface-3));
	}

	.agenda .rows {
		align-content: start;
	}

	.agenda .night {
		min-height: 3rem;
	}

	/* Health: one row per site, the state in words, failures spelled out. */
	.sites {
		display: grid;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.site {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
		padding-block: var(--space-3);
		border-top: 1px solid var(--border);
	}

	.site:first-child {
		border-top: 0;
		padding-top: 0;
	}

	.site-mark {
		display: inline-grid;
		place-items: center;
		flex-shrink: 0;
		width: 2rem;
		height: 2rem;
		border-radius: 50%;
		background: var(--surface-3);
		color: var(--fg-muted);
	}

	.site.success .site-mark {
		background: var(--success-wash);
		color: var(--success);
	}

	.site.danger .site-mark {
		background: var(--danger-wash);
		color: var(--danger);
	}

	.site-text {
		display: grid;
		gap: 2px;
		min-width: 0;
	}

	.site-line {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
	}

	.site-name {
		font-size: var(--text-base);
		font-weight: 500;
	}

	.site-state {
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--fg-muted);
	}

	.site.success .site-state {
		color: var(--success);
	}

	.site.danger .site-state {
		color: var(--danger);
	}

	.site-detail {
		font-size: var(--text-sm);
		color: var(--fg-muted);
	}

	.site-fail {
		font-size: var(--text-sm);
		color: var(--danger);
	}

	@media (max-width: 900px) {
		.row {
			min-height: 44px;
		}

		.agenda-day {
			grid-template-columns: 3.75rem minmax(0, 1fr);
			gap: var(--space-3);
		}
	}
</style>
