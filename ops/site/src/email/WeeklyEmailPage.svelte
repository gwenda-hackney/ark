<script lang="ts">
	/**
	 * Email: what goes to the mailing list, in four tabs. Overview: every
	 * email as cards, the weekly one and the one-offs (EmailOverview). This week: the
	 * weekly "what's on" email as it would go out, where it stands, the send
	 * buttons and a test to yourself. Write (#348): one-off emails, a list,
	 * and the editor that comes forward over it. Sent: every email sent, with
	 * Mailchimp's numbers. Settings: the weekly email's schedule. Everyone signed in can look
	 * and test; admins change the schedule and send. Only production ops
	 * reaches the list.
	 */
	import { onMount, untrack } from "svelte";
	import { Icon } from "../app/shell";
	import { navTabs } from "../app/nav-routes";
	import { Button, PageHeader } from "../ui";
	import type { AuthMe } from "../app/api";
	import {
		getWeeklyEmailPreview,
		getWeeklyEmailStatus,
		type WeeklyEmailPreview,
		type WeeklyEmailStatus,
	} from "./email-api";
	import EmailPreview from "./EmailPreview.svelte";
	import EmailSchedule from "./EmailSchedule.svelte";
	import EmailStatus from "./EmailStatus.svelte";
	import OneOffEmailEditor from "./OneOffEmailEditor.svelte";
	import EmailOverview from "./EmailOverview.svelte";
	import { listOneOffEmails, type OneOffSummary } from "./email-api";
	import { parseShellPath } from "../app/nav";
	import SentEmails from "./SentEmails.svelte";
	import { contentsLine, shortDay } from "./email-view";

	let {
		me,
		path = "/email",
		view = "week",
	}: { me: AuthMe; path?: string; view?: "overview" | "week" | "write" | "sent" | "settings" } = $props();

	// Write: the list, and an email open over it.
	const route = $derived(parseShellPath(path));
	const editing = $derived(view === "write" && Boolean(route.isNew || route.slug));
	let oneOffs = $state<OneOffSummary[]>([]);
	let oneOffsLoading = $state(false);
	let oneOffsError = $state("");
	async function loadOneOffs() {
		oneOffsLoading = true;
		try {
			oneOffs = (await listOneOffEmails()).emails;
			oneOffsError = "";
		} catch (err) {
			oneOffsError = err instanceof Error ? err.message : "Could not load the emails.";
		} finally {
			oneOffsLoading = false;
		}
	}
	$effect(() => {
		if (view === "write" || view === "overview") void loadOneOffs();
	});

	let email = $state<WeeklyEmailPreview | null>(null);
	let problem = $state("");
	let loading = $state(false);

	async function loadPreview() {
		loading = true;
		try {
			const data = await getWeeklyEmailPreview();
			email = data.email;
			problem = data.problem;
		} catch (err) {
			problem = err instanceof Error ? err.message : "Could not load the email.";
		} finally {
			loading = false;
		}
	}

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
		if (view === "week") void loadPreview();
		if (view === "sent") sentKey += 1;
		if (view === "write" || view === "overview") void loadOneOffs();
	}

	onMount(() => {
		void loadStatus();
	});
	// This week's email loads the first time its tab shows, whichever tab the page opened on.
	$effect(() => {
		if (view === "week" && untrack(() => !email && !problem && !loading)) void loadPreview();
	});

	// While this week's is on its way (or due any minute), keep the status fresh.
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
	<PageHeader title="Email" tabs={{ items: navTabs("email"), value: view === "write" ? "overview" : view }}>
		{#snippet actions()}
			<Button variant="outline" size="sm" data-compact disabled={loading} onclick={refresh}>
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
	{:else if view === "write" || view === "overview"}
		<EmailOverview {status} emails={oneOffs} loading={oneOffsLoading} error={oneOffsError} onretry={() => void loadOneOffs()} />
	{:else if view === "settings"}
		<div class="narrow">
			<EmailSchedule {status} onsaved={(settings) => { if (status) status = { ...status, settings }; void loadStatus(); }} />
		</div>
	{:else}
		<div class="layout" data-env={me.siteEnv}>
			<EmailPreview
				{email}
				{problem}
				{loading}
				title="This week's email"
				subtitle={email
					? `${shortDay(email.today)} – ${shortDay(email.week.end)} · ${contentsLine(email)}`
					: problem
						? "Couldn't be built just now."
						: "Building it from the website…"}
				warning={email?.empty ? email.emptyReason : ""}
				note={`From the live website, as it would go now · links to ${email?.origin || "the website"} · Gmail's fonts (Apple Mail shows the website's)`}
			/>
			<EmailStatus {status} hasEmail={Boolean(email)} onchange={(next) => (status = { ...next, me: status?.me ?? next.me })} />
		</div>
	{/if}
</div>
{#if view === "write" || view === "overview"}
	<!-- Always mounted on Write: it comes forward over the list when an email opens (EditorShell). -->
	<OneOffEmailEditor {path} {me} open={editing} onchanged={() => void loadOneOffs()} />
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
	.layout {
		display: grid;
		grid-template-columns: minmax(0, 3fr) minmax(18rem, 2fr);
		gap: var(--space-4);
		align-items: start;
	}
	.page.fill {
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
	.narrow {
		max-width: 40rem;
	}
	.error {
		margin: 0;
		color: var(--destructive);
		font-size: var(--text-sm);
	}
	@media (max-width: 60rem) {
		.layout {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
