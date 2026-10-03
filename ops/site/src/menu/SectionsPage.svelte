<script lang="ts">
	import { onMount } from "svelte";
	import { fly } from "svelte/transition";
	import { Button, Card, EmptyState, PageHeader, Skeleton } from "../ui";
	import * as api from "../app/api";
	import { toast } from "../ui/toast.svelte";
	import { easeOut, flyMs } from "../ui/motion";
	import type { MenuSection } from "./types";
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

<div class="page scrollbar-fade">
	<PageHeader
		title="Sections"
		subtitle="Chapters and groups on the guest menu. Same tree as the print menu."
	/>

	{#if error}
		<EmptyState tone="error" title="Could not load sections" text={error}>
			{#snippet action()}
				<Button variant="outline" size="sm" onclick={() => void load()}>Try again</Button>
			{/snippet}
		</EmptyState>
	{:else if loading}
		<Skeleton rows={6} lines={1} label="Loading sections…" />
	{:else}
		<div
			class="stack"
			in:fly={{ y: 10, duration: flyMs, easing: easeOut }}
		>
			<Card>
				<SectionsPanel {sections} busy={false} {onchanged} />
			</Card>
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

	.stack {
		display: grid;
		gap: var(--space-6);
		max-width: 40rem;
		align-content: start;
	}
</style>
