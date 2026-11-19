<script lang="ts">
	/**
	 * Email's first page (#348): every email at a glance, as cards.
	 * Scheduled: the weekly what's on (where it stands, when it next goes, the
	 * last one sent) and any one-off set to go. One-off: the rest written
	 * here, drafts and sent
	 * (Promote… and New email are in the page's header). A card opens its email.
	 */
	import { Badge, Button, EmptyState, Skeleton } from "../ui";
	import { Icon } from "../app/shell";
	import { navigate } from "../app/nav";
	import { getWeeklyEmailPreview, type EmailFrame, type OneOffSummary, type WeeklyEmailStatus } from "./email-api";
	import { leadPicture, nextLine, runLine, sentLine, settingsLine, statusLine } from "./email-view";
	import { sectionImageUrl } from "../../../../shared/email/sections.js";
	import { emailName, statusBadge, writePath } from "./one-off-view";

	let {
		status,
		frame,
		emails,
		loading = false,
		error = "",
		onretry,
	}: {
		status: WeeklyEmailStatus | null;
		/** Where the one-off emails are drawn from (their website and pictures), for their little previews. */
		frame: EmailFrame | null;
		emails: OneOffSummary[];
		loading?: boolean;
		error?: string;
		onretry: () => void;
	} = $props();


	const weekly = $derived(status ? statusLine(status) : null);
	const lastSent = $derived(status?.history.find((run) => run.status === "sent") || null);

	/** This week's lead picture, from the email as it would go, for its card. */
	let weeklyPicture = $state("");
	$effect(() => {
		void getWeeklyEmailPreview()
			.then((data) => (weeklyPicture = leadPicture(data.email?.html || "")))
			.catch(() => (weeklyPicture = ""));
	});

	/** A one-off email's lead picture: its first Image section's, small. */
	function oneOffPicture(email: OneOffSummary): string {
		const first = email.sections.find((section) => section.kind === "image" && section.assetId);
		if (!first || first.kind !== "image" || !frame) return "";
		const url = sectionImageUrl(first.assetId, frame.images);
		return url ? `${url}${url.includes("?") ? "&" : "?"}w=160&h=160&fit=crop` : "";
	}

	/** What a one-off card says under its subject. */
	function oneOffLine(email: OneOffSummary): string {
		if (email.status === "sent") {
			return [`Sent ${sentLine(email.sentAt)}`, email.recipients ? `${email.recipients.toLocaleString("en-GB")} people` : ""]
				.filter(Boolean)
				.join(" · ");
		}
		if (email.status === "scheduled" && email.scheduledFor) return `Goes ${sentLine(email.scheduledFor)}`;
		if (email.status === "failed") return email.reason || "Didn't send";
		const parts = email.sectionCount === 1 ? "1 section" : `${email.sectionCount} sections`;
		return `Changed ${sentLine(email.updatedAt)} · ${parts}`;
	}

	/** One-offs set to go: under Scheduled, soonest first. */
	const scheduled = $derived(
		emails
			.filter((email) => email.status === "scheduled")
			.sort((a, b) => String(a.scheduledFor).localeCompare(String(b.scheduledFor))),
	);

	/** The other one-offs: drafts first (what's being worked on), then the rest; newest first within each. */
	const ordered = $derived(
		emails.filter((email) => email.status !== "scheduled").sort(
			(a, b) =>
				Number(b.status === "draft") - Number(a.status === "draft") ||
				String(b.updatedAt).localeCompare(String(a.updatedAt)),
		),
	);
</script>

<div class="overview">
	<section class="group" aria-labelledby="scheduled">
		<header class="group-head">
			<div>
				<h2 id="scheduled">Scheduled</h2>
				<p>They go out by themselves: the weekly what's on, and any email set to go.</p>
			</div>
		</header>
		<div class="cards">
			<button type="button" class="card" onclick={() => navigate("/email/week")}>
				<span class="card-top">
					{#if weeklyPicture}
						<img class="card-picture" src={weeklyPicture} alt="" loading="lazy" />
					{:else}
						<span class="card-icon"><Icon name="calendar" size={20} /></span>
					{/if}
					{#if weekly}<Badge tone={weekly.tone} label={weekly.label} />{/if}
				</span>
				<span class="card-name">Weekly what's on</span>
				{#if status}
					<span class="card-line">{settingsLine(status.settings)}</span>
					<span class="card-line">Next: {nextLine(status)}</span>
					{#if lastSent}<span class="card-line muted">Last sent: {runLine(lastSent).detail}</span>{/if}
				{:else}
					<span class="card-line muted">Loading…</span>
				{/if}
				<span class="card-go">This week's email <Icon name="chevron-right" size={14} /></span>
			</button>
			{#each scheduled as email (email.id)}
				{@render oneOffCard(email)}
			{/each}
		</div>
	</section>

	<section class="group" aria-labelledby="one-off">
		<header class="group-head">
			<div>
				<h2 id="one-off">One-off</h2>
				<p>Written here: a promotion from a template, or your own.</p>
			</div>
		</header>
		{#if error}
			<EmptyState tone="error" title="Couldn't load the emails" text={error}>
				{#snippet action()}
					<Button variant="outline" size="sm" onclick={onretry}>{#snippet icon()}<Icon name="refresh" size={14} />{/snippet}Try again</Button>
				{/snippet}
			</EmptyState>
		{:else if loading && !emails.length}
			<Skeleton rows={2} lines={2} label="Loading emails…" />
		{:else if !ordered.length}
			<EmptyState icon="send" title="No one-off emails yet" text="Promote a pop-up kitchen, or write your own: a picture, a few words, a button." />
		{:else}
			<div class="cards">
				{#each ordered as email (email.id)}
					{@render oneOffCard(email)}
				{/each}
			</div>
		{/if}
	</section>
</div>

{#snippet oneOffCard(email: OneOffSummary)}
	{@const badge = statusBadge(email.status)}
	{@const picture = oneOffPicture(email)}
	<button type="button" class="card" onclick={() => navigate(writePath(email.id))}>
		<span class="card-top">
			{#if picture}
				<img class="card-picture" src={picture} alt="" loading="lazy" />
			{:else}
				<span class="card-icon"><Icon name="send" size={20} /></span>
			{/if}
			<Badge tone={badge.tone} label={badge.label} />
		</span>
		<span class="card-name">{emailName(email) || "No name yet"}</span>
		{#if email.subject && email.subject !== emailName(email)}<span class="card-subject">{email.subject}</span>{/if}
		{#if email.previewText}<span class="card-line">{email.previewText}</span>{/if}
		<span class="card-line muted">{oneOffLine(email)}</span>
	</button>
{/snippet}


<style>
	.overview {
		display: grid;
		gap: var(--space-6);
		align-content: start;
	}
	.group {
		display: grid;
		gap: var(--space-3);
	}
	.group-head {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: var(--space-3);
		flex-wrap: wrap;
	}
	.group-head h2 {
		margin: 0;
		font-size: var(--text-lg);
		font-weight: 600;
	}
	.group-head p {
		margin: 0.125rem 0 0;
		color: var(--muted-foreground);
		font-size: var(--text-sm);
	}
	.cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 18rem), 1fr));
		gap: var(--space-3);
	}
	.card {
		display: grid;
		align-content: start;
		gap: var(--space-1);
		padding: var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--card);
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
		transition:
			border-color 150ms var(--ease),
			background 150ms var(--ease);
	}
	.card:hover,
	.card:focus-visible {
		border-color: var(--ring);
		background: var(--accent);
	}
	.card-top {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		margin-bottom: var(--space-2);
	}
	/* The email's lead picture, small: enough to tell them apart */
	.card-picture,
	.card-icon {
		width: 4rem;
		height: 4rem;
		border-radius: var(--radius-md);
	}
	.card-picture {
		object-fit: cover;
		background: var(--muted);
	}
	.card-icon {
		display: grid;
		place-items: center;
		background: var(--muted);
		color: var(--muted-foreground);
	}
	/* Its name, in the page titles' face: what it is, at a glance */
	.card-name {
		font-family: var(--font-display);
		font-size: var(--text-xl);
		font-weight: 600;
		line-height: 1.1;
	}
	.card-subject {
		font-weight: 600;
		line-height: 1.3;
	}
	.card-line {
		font-size: var(--text-sm);
		line-height: 1.4;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.muted {
		color: var(--muted-foreground);
	}
	.card-go {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		margin-top: var(--space-2);
		color: var(--primary);
		font-size: var(--text-sm);
		font-weight: 500;
	}
</style>
