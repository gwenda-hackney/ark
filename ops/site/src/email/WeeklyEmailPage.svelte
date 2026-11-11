<script lang="ts">
	/**
	 * Weekly email: the "what's on" email that goes to the mailing list. This
	 * week's as it would go out, a test to yourself, where it stands and what's
	 * been sent, and its schedule. Everyone signed in can look and test; admins
	 * change the schedule and send. Only production ops reaches the list.
	 */
	import { onMount } from "svelte";
	import { Icon } from "../app/shell";
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
	import TestSend from "./TestSend.svelte";

	let { me }: { me: AuthMe } = $props();

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

	function refresh() {
		void loadPreview();
		void loadStatus();
	}

	onMount(refresh);

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

<div class="page scrollbar-fade">
	<PageHeader title="Weekly email" subtitle="What's on this week, sent to the mailing list.">
		{#snippet actions()}
			<Button variant="outline" size="sm" data-compact disabled={loading} onclick={refresh}>
				{#snippet icon()}
					<Icon name="refresh" size={16} />
				{/snippet}
				Refresh
			</Button>
		{/snippet}
	</PageHeader>

	<div class="layout" data-env={me.siteEnv}>
		<EmailPreview {email} {problem} {loading} />
		<div class="side">
			{#if statusError}<p class="error" role="alert">{statusError}</p>{/if}
			<EmailStatus {status} onchange={(next) => (status = { ...next, me: status?.me ?? next.me })} />
			<TestSend {status} hasEmail={Boolean(email)} />
			<EmailSchedule {status} onsaved={(settings) => { if (status) status = { ...status, settings }; void loadStatus(); }} />
		</div>
	</div>
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
	.side {
		display: grid;
		gap: var(--space-4);
		min-width: 0;
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
