<script lang="ts">
	/**
	 * Weekly email: the "what's on" email that goes to the mailing list, in
	 * three tabs. This week: the email as it would go out, where it stands,
	 * the send buttons and a test to yourself. Sent: every email sent, with
	 * Mailchimp's numbers. Settings: the schedule. Everyone signed in can look
	 * and test; admins change the schedule and send. Only production ops
	 * reaches the list.
	 */
	import { onMount } from "svelte";
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
	import SentEmails from "./SentEmails.svelte";

	let { me, view = "week" }: { me: AuthMe; view?: "week" | "sent" | "settings" } = $props();

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
	}

	onMount(() => {
		void loadStatus();
		if (view === "week") void loadPreview();
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

<div class="page scrollbar-fade" class:fill={view === "sent"}>
	<PageHeader title="Weekly email" tabs={{ items: navTabs("email"), value: view }}>
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
	{:else if view === "settings"}
		<div class="narrow">
			<EmailSchedule {status} onsaved={(settings) => { if (status) status = { ...status, settings }; void loadStatus(); }} />
		</div>
	{:else}
		<div class="layout" data-env={me.siteEnv}>
			<EmailPreview {email} {problem} {loading} />
			<EmailStatus {status} hasEmail={Boolean(email)} onchange={(next) => (status = { ...next, me: status?.me ?? next.me })} />
		</div>
	{/if}
</div>

<style>
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
