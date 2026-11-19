<script lang="ts">
	/**
	 * Email's first page (#348): every email at a glance, as cards. Every
	 * week: the weekly what's on, where it stands, when it next goes and the
	 * last one sent. One-off: each email written here, drafts and sent, with
	 * Promote… and New email. A card opens its email.
	 */
	import { Badge, Button, EmptyState, Skeleton } from "../ui";
	import { Icon } from "../app/shell";
	import { navigate } from "../app/nav";
	import type { OneOffSummary, WeeklyEmailStatus } from "./email-api";
	import { nextLine, runLine, sentLine, settingsLine, statusLine } from "./email-view";
	import { statusBadge, writePath } from "./one-off-view";
	import PromoteDialog from "./PromoteDialog.svelte";

	let {
		status,
		emails,
		loading = false,
		error = "",
		onretry,
	}: {
		status: WeeklyEmailStatus | null;
		emails: OneOffSummary[];
		loading?: boolean;
		error?: string;
		onretry: () => void;
	} = $props();

	let promoting = $state(false);

	const weekly = $derived(status ? statusLine(status) : null);
	const lastSent = $derived(status?.history.find((run) => run.status === "sent") || null);

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

	/** Drafts first (what's being worked on), then the rest; newest first within each. */
	const ordered = $derived(
		[...emails].sort(
			(a, b) =>
				Number(b.status === "draft") - Number(a.status === "draft") ||
				String(b.updatedAt).localeCompare(String(a.updatedAt)),
		),
	);
</script>

<div class="overview">
	<section class="group" aria-labelledby="every-week">
		<header class="group-head">
			<div>
				<h2 id="every-week">Every week</h2>
				<p>Goes out by itself, built from What's on.</p>
			</div>
		</header>
		<div class="cards">
			<button type="button" class="card" onclick={() => navigate("/email/week")}>
				<span class="card-top">
					<span class="card-icon"><Icon name="calendar" size={18} /></span>
					{#if weekly}<Badge tone={weekly.tone} label={weekly.label} />{/if}
				</span>
				<span class="card-title">The weekly what's on</span>
				{#if status}
					<span class="card-line">{settingsLine(status.settings)}</span>
					<span class="card-line">Next: {nextLine(status)}</span>
					{#if lastSent}<span class="card-line muted">Last sent: {runLine(lastSent).detail}</span>{/if}
				{:else}
					<span class="card-line muted">Loading…</span>
				{/if}
				<span class="card-go">This week's email <Icon name="chevron-right" size={14} /></span>
			</button>
		</div>
	</section>

	<section class="group" aria-labelledby="one-off">
		<header class="group-head">
			<div>
				<h2 id="one-off">One-off</h2>
				<p>Written here: a promotion from a template, or your own.</p>
			</div>
			<div class="actions">
				<Button type="button" size="sm" variant="outline" onclick={() => (promoting = true)}>
					{#snippet icon()}<Icon name="send" size={14} />{/snippet}
					Promote…
				</Button>
				<Button type="button" size="sm" onclick={() => navigate(writePath("new"))}>
					{#snippet icon()}<Icon name="plus" size={14} />{/snippet}
					New email
				</Button>
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
		{:else if !emails.length}
			<EmptyState icon="send" title="No one-off emails yet" text="Promote a pop-up kitchen, or write your own: a picture, a few words, a button." />
		{:else}
			<div class="cards">
				{#each ordered as email (email.id)}
					{@const badge = statusBadge(email.status)}
					<button type="button" class="card" onclick={() => navigate(writePath(email.id))}>
						<span class="card-top">
							<span class="card-icon"><Icon name="send" size={18} /></span>
							<Badge tone={badge.tone} label={badge.label} />
						</span>
						<span class="card-title">{email.subject || "(No subject)"}</span>
						{#if email.previewText}<span class="card-line">{email.previewText}</span>{/if}
						<span class="card-line muted">{oneOffLine(email)}</span>
					</button>
				{/each}
			</div>
		{/if}
	</section>
</div>

<PromoteDialog open={promoting} onclose={() => (promoting = false)} />

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
	.actions {
		display: flex;
		gap: var(--space-2);
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
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--space-2);
	}
	.card-icon {
		display: grid;
		place-items: center;
		width: 2rem;
		height: 2rem;
		border-radius: var(--radius-md);
		background: var(--muted);
		color: var(--muted-foreground);
	}
	.card-title {
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
