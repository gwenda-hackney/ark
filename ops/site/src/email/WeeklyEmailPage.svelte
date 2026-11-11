<script lang="ts">
	/**
	 * Weekly email: the "what's on" email that goes to the mailing list. Shows
	 * this week's as it would go out; everyone signed in can look.
	 */
	import { onMount } from "svelte";
	import { Icon } from "../app/shell";
	import { Button, PageHeader } from "../ui";
	import type { AuthMe } from "../app/api";
	import { getWeeklyEmailPreview, type WeeklyEmailPreview } from "./email-api";
	import EmailPreview from "./EmailPreview.svelte";

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

	onMount(() => void loadPreview());
</script>

<div class="page scrollbar-fade">
	<PageHeader title="Weekly email" subtitle="What's on this week, sent to the mailing list.">
		{#snippet actions()}
			<Button variant="outline" size="sm" data-compact disabled={loading} onclick={() => void loadPreview()}>
				{#snippet icon()}
					<Icon name="refresh" size={16} />
				{/snippet}
				Refresh
			</Button>
		{/snippet}
	</PageHeader>

	<div class="layout" data-env={me.siteEnv}>
		<EmailPreview {email} {problem} {loading} />
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
		gap: var(--space-4);
		align-items: start;
	}
</style>
