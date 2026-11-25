<script lang="ts">
	/**
	 * Email's first page (#348): every email at a glance, as a list with its picture.
	 * Scheduled: the monthly what's on (where it stands, when it next goes, the
	 * last one sent) and any one-off set to go. One-off: the rest written
	 * here, drafts and sent
	 * (Promote… and New email are in the page's header). A row opens its email.
	 */
	import { Button, EmptyState, Skeleton } from "../ui";
	import { Icon } from "../app/shell";
	import EmailListGrid, { type EmailListRow } from "./EmailListGrid.svelte";
	import type { GridGroup } from "../ui/grid";
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

	/** A one-off email as a row of the list. */
	function oneOffRow(email: OneOffSummary): EmailListRow {
		const badge = statusBadge(email.status);
		const foot = oneOffFooter(email);
		const name = emailName(email) || "No name yet";
		return {
			id: String(email.id),
			href: writePath(email.id),
			photo: oneOffPicture(email),
			name,
			subject: email.subject && email.subject !== name ? email.subject : "",
			status: badge.label,
			tone: badge.tone,
			when: `${foot.label}: ${foot.value || "–"}`,
		};
	}

	/** Scheduled: the monthly what's on first, then one-offs set to go. */
	const scheduledRows = $derived<EmailListRow[]>([
		{
			id: "monthly",
			href: "/email/monthly",
			photo: weeklyPicture,
			name: "Monthly what's on",
			subject: status ? `Next: ${nextLine(status)}` : "Loading…",
			status: weekly?.label || "",
			tone: weekly?.tone || "neutral",
			when: `Last sent: ${lastSent ? sentLine(lastSent.sentAt) : "Not yet"}`,
		},
		...scheduled.map(oneOffRow),
	]);
	const oneOffRows = $derived(ordered.map(oneOffRow));
	const groups = $derived<GridGroup<EmailListRow>[]>([
		{ key: "scheduled", title: "Scheduled", note: "They go out by themselves: the monthly what's on, and any email set to go.", rows: scheduledRows },
		{ key: "one-off", title: "Manually sent", note: "You send them when you're ready: a promotion from a template, or your own.", rows: oneOffRows },
	]);
</script>

<!-- One table, grouped like Enquiries; it fills the page and scrolls inside (ListPage). -->
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
{/if}
<EmailListGrid {groups} scrollKey="email-list" />
