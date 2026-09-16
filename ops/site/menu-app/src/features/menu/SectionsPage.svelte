<script lang="ts">
	import { onMount } from "svelte";
	import { BusyOverlay, Card, PageHeader } from "../../ui";
	import * as api from "../../lib/api";
	import { loginNext } from "../../lib/nav";
	import { toast } from "../../lib/toast.svelte";
	import type { MenuSection } from "../../lib/types";
	import SectionsPanel from "./SectionsPanel.svelte";

	let sections = $state<MenuSection[]>([]);
	let loading = $state(true);
	let error = $state("");

	async function refresh() {
		const data = await api.getMenu();
		sections = data.sections || [];
	}

	async function load() {
		try {
			loading = true;
			error = "";
			await refresh();
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Could not load sections.";
			if (message.startsWith("auth:")) {
				window.location.href = `/api/auth/login?next=${encodeURIComponent(loginNext("/sections"))}`;
				return;
			}
			error = message;
		} finally {
			loading = false;
		}
	}

	async function onchanged() {
		try {
			await refresh();
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Could not reload sections.",
			);
		}
	}

	onMount(() => {
		void load();
	});
</script>

<div class="page">
	<PageHeader
		title="Sections"
		subtitle="Chapters and groups drinks belong to. Same tree as the print menu."
	/>

	{#if error}
		<p class="error">{error}</p>
	{:else}
		<div class="stack">
			<Card>
				<SectionsPanel {sections} busy={loading} {onchanged} />
			</Card>
		</div>
	{/if}
	<BusyOverlay active={loading} label="Loading…" />
</div>

<style>
	.page {
		position: relative;
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: var(--page-gutter);
	}

	.stack {
		display: grid;
		gap: var(--gap-lg);
		max-width: 40rem;
		align-content: start;
	}

	.error {
		margin: 0;
		color: var(--destructive, #c97a7a);
		font-size: var(--text-sm);
	}
</style>
