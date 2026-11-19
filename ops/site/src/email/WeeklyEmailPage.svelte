<script lang="ts">
	/**
	 * Email: what goes to the mailing list, in two tabs. Emails: every email
	 * as cards, the monthly what's on and the one-offs (EmailOverview); a
	 * card opens its email over them, the monthly one in MonthlyEmailEditor
	 * (this month's email, its buttons, its schedule), a one-off in
	 * OneOffEmailEditor (#348). Sent: every email sent, with Mailchimp's
	 * numbers. Everyone signed in can look and test; admins change the
	 * schedule and send. Only production ops reaches the list.
	 */

	import { onMount } from "svelte";
	import { Icon } from "../app/shell";
	import { navTabs } from "../app/nav-routes";
	import { Button, PageHeader } from "../ui";
	import type { AuthMe } from "../app/api";
	import { getWeeklyEmailStatus, type WeeklyEmailStatus } from "./email-api";
	import MonthlyEmailEditor from "./MonthlyEmailEditor.svelte";
	import OneOffEmailEditor from "./OneOffEmailEditor.svelte";
	import EmailOverview from "./EmailOverview.svelte";
	import PromoteDialog from "./PromoteDialog.svelte";
	import { writePath } from "./one-off-view";
	import { listOneOffEmails, type EmailFrame, type OneOffSummary } from "./email-api";
	import { navigate, parseShellPath } from "../app/nav";
	import SentEmails from "./SentEmails.svelte";

	let {
		me,
		path = "/email",
		view = "emails",
	}: { me: AuthMe; path?: string; view?: "emails" | "monthly" | "write" | "sent" } = $props();

	/** The cards' page, with an email open over it or not. */
	const onCards = $derived(view === "emails" || view === "write" || view === "monthly");

	// Write: the list, and an email open over it.
	const route = $derived(parseShellPath(path));
	const editing = $derived((view === "write" && Boolean(route.isNew || route.slug)) || view === "monthly");
	let promoting = $state(false);
	let oneOffs = $state<OneOffSummary[]>([]);
	let oneOffFrame = $state<EmailFrame | null>(null);
	let oneOffsLoading = $state(false);
	let oneOffsError = $state("");
	async function loadOneOffs() {
		oneOffsLoading = true;
		try {
			const data = await listOneOffEmails();
			oneOffs = data.emails;
			oneOffFrame = data.frame;
			oneOffsError = "";
		} catch (err) {
			oneOffsError = err instanceof Error ? err.message : "Could not load the emails.";
		} finally {
			oneOffsLoading = false;
		}
	}
	$effect(() => {
		if (onCards) void loadOneOffs();
	});

	let status = $state<WeeklyEmailStatus | null>(null);
	let statusError = $state("");

	async function loadStatus() {
		try {
			status = await getWeeklyEmailStatus();
			statusError = "";
		} catch (err) {
			statusError = err instanceof Error ? err.message : "Could not load the status.";
		}
	}

	let sentKey = $state(0);
	function refresh() {
		void loadStatus();
		if (view === "sent") sentKey += 1;
		if (onCards) void loadOneOffs();
	}

	onMount(() => {
		void loadStatus();
	});
	// While this month's is on its way (or due any minute), keep the status fresh.
	const moving = $derived(
		Boolean(status?.access.audience && status.settings.sending) &&
			(status?.current?.status === "preparing" ||
				status?.current?.status === "sending" ||
				(!status?.current && status?.schedule.state === "due")),
	);
	$effect(() => {
		if (!moving) return;
		const timer = setInterval(() => void loadStatus(), 20_000);
		return () => clearInterval(timer);
	});
</script>

<div class="root">
<div class="page scrollbar-fade" class:fill={view === "sent"} class:parked={editing} inert={editing}>
	<PageHeader title="Email" tabs={{ items: navTabs("email"), value: view === "sent" ? "sent" : "emails" }}>
		{#snippet actions()}
			{#if onCards}
				<Button variant="outline" size="sm" data-compact onclick={() => (promoting = true)}>
					{#snippet icon()}<Icon name="send" size={16} />{/snippet}
					Promote…
				</Button>
				<Button size="sm" data-compact onclick={() => navigate(writePath("new"))}>
					{#snippet icon()}<Icon name="plus" size={16} />{/snippet}
					New email
				</Button>
			{/if}
			<Button variant="outline" size="sm" data-compact onclick={refresh}>
				{#snippet icon()}
					<Icon name="refresh" size={16} />
				{/snippet}
				Refresh
			</Button>
		{/snippet}
	</PageHeader>

	{#if statusError}<p class="error" role="alert">{statusError}</p>{/if}

	{#if view === "sent"}
		{#key sentKey}
			<SentEmails available={status ? status.access.mailchimp : null} />
		{/key}
	{:else}
		<EmailOverview {status} frame={oneOffFrame} emails={oneOffs} loading={oneOffsLoading} error={oneOffsError} onretry={() => void loadOneOffs()} />
	{/if}
</div>
<PromoteDialog open={promoting} onclose={() => (promoting = false)} />
{#if onCards}
	<!-- Always mounted with the cards: each comes forward over them when its email opens (EditorShell). -->
	<OneOffEmailEditor {path} {me} open={view === "write" && editing} onchanged={() => void loadOneOffs()} />
	<MonthlyEmailEditor
		open={view === "monthly"}
		{me}
		{status}
		onstatus={(next) => (status = next)}
		onreload={() => void loadStatus()}
	/>
{/if}
</div>

<style>
	.root {
		position: relative;
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		height: 100%;
		overflow: hidden;
	}
	.page {
		transition:
			transform 440ms var(--ease),
			opacity 440ms var(--ease);
	}
	.page.parked {
		pointer-events: none;
		transform: scale(0.97);
		opacity: 0.35;
	}
	@media (prefers-reduced-motion: reduce) {
		.page {
			transition: none;
		}
	}
	.page {
		position: relative;
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: var(--page-gutter);
	}
	.page.fill {
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
	.error {
		margin: 0;
		color: var(--destructive);
		font-size: var(--text-sm);
	}
</style>
