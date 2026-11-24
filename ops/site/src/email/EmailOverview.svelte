<script lang="ts">
	/**
	 * Email's first page (#348): every email at a glance, as cards.
	 * Scheduled: the monthly what's on (where it stands, when it next goes, the
	 * last one sent) and any one-off set to go. One-off: the rest written
	 * here, drafts and sent
	 * (Promote… and New email are in the page's header). A card opens its email.
	 */
	import { Badge, Button, EmptyState, Skeleton } from "../ui";
	import { Icon } from "../app/shell";
	import { navigate } from "../app/nav";
	import { getWeeklyEmailPreview, type EmailFrame, type OneOffSummary, type WeeklyEmailStatus } from "./email-api";
	import { leadPicture, nextLine, sentLine, statusLine } from "./email-view";
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

	/** This month's lead picture, from the email as it would go, for its card. */
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

	/** A one-off card's footer: when it last went, goes, or was edited. */
	function oneOffFooter(email: OneOffSummary): { label: string; value: string } {
		if (email.status === "sent") return { label: "Last sent", value: sentLine(email.sentAt) };
		if (email.status === "scheduled" && email.scheduledFor) return { label: "Goes", value: sentLine(email.scheduledFor) };
		if (email.status === "failed") return { label: "Didn't send", value: email.reason || "" };
		return { label: "Last edited", value: sentLine(email.updatedAt) };
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
				<p>They go out by themselves: the monthly what's on, and any email set to go.</p>
			</div>
		</header>
		<div class="cards">
			<button type="button" class="card" onclick={() => navigate("/email/monthly")}>
				<span class="card-top">
					{#if weeklyPicture}
						<img class="card-picture" src={weeklyPicture} alt="" loading="lazy" />
					{:else}
						<span class="card-icon"><Icon name="calendar" size={20} /></span>
					{/if}
					{#if weekly}<Badge tone={weekly.tone} label={weekly.label} />{/if}
				</span>
				<span class="card-name">Monthly what's on</span>
				<span class="card-sub">{status ? `Next: ${nextLine(status)}` : "Loading…"}</span>
				{@render footer("Last sent", lastSent ? sentLine(lastSent.sentAt) : "Not yet")}
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
			<EmptyState icon="send" title="No one-off emails yet" text="Promote a night or a pop-up kitchen, or write your own: a picture, a few words, a button." />
		{:else}
			<div class="cards">
				{#each ordered as email (email.id)}
					{@render oneOffCard(email)}
				{/each}
			</div>
		{/if}
	</section>
</div>

{#snippet footer(label: string, value: string)}
	<span class="card-gap"></span>
	<span class="card-foot"><span class="card-foot-label">{label}:</span> {value || "–"}</span>
{/snippet}

{#snippet oneOffCard(email: OneOffSummary)}
	{@const badge = statusBadge(email.status)}
	{@const picture = oneOffPicture(email)}
	{@const foot = oneOffFooter(email)}
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
		{#if email.subject && email.subject !== emailName(email)}<span class="card-sub">{email.subject}</span>{/if}
		{@render footer(foot.label, foot.value)}
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
	/* A column, its footer at the bottom: side by side, the footers line up */
	.card {
		display: flex;
		flex-direction: column;
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
	/* Its name, in the page titles' face and the gold: what it is, at a glance */
	.card-name {
		font-family: var(--font-display);
		font-size: var(--text-xl);
		font-weight: 600;
		line-height: 1.1;
		color: var(--primary);
	}
	/* One quiet line under it: the subject the list sees */
	.card-sub {
		font-size: var(--text-sm);
		line-height: 1.4;
		color: var(--foreground);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	/* When it last went or was edited, at the foot of every card alike */
	/* Takes up what's left, at least a little: the footer goes to the bottom */
	.card-gap {
		flex: 1;
		min-height: var(--space-2);
	}
	.card-foot {
		padding-top: var(--space-3);
		border-top: 1px solid var(--border);
		font-size: var(--text-xs);
		color: var(--muted-foreground);
	}
	.card-foot-label {
		font-weight: 600;
	}
</style>
