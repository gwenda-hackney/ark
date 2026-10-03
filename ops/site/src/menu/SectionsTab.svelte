<script lang="ts">
	import { Icon } from "../app/shell";
	import { onMount } from "svelte";
	import { fly } from "svelte/transition";
	import { Button, EmptyState, Skeleton } from "../ui";
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

<!-- Configuration › Menu sections. -->
<div class="tab">
	<p class="lead">Chapters and groups on the guest menu, in the order guests see them. The print menu uses the same tree.</p>
	{#if error}
		<EmptyState tone="error" title="Could not load sections" text={error}>
			{#snippet action()}
				<Button variant="outline" size="sm" onclick={() => void load()}>{#snippet icon()}<Icon name="refresh" size={14} />{/snippet}Try again</Button>
			{/snippet}
		</EmptyState>
	{:else if loading}
		<Skeleton rows={6} lines={1} label="Loading sections…" />
	{:else}
		<div in:fly={{ y: 10, duration: flyMs, easing: easeOut }}>
			<SectionsPanel {sections} busy={false} {onchanged} />
		</div>
	{/if}
</div>

<style>
	.tab {
		display: grid;
		gap: var(--space-4);
	}

	.lead {
		margin: 0;
		max-width: 65ch;
		font-size: var(--text-sm);
		color: var(--fg-muted);
	}
</style>
