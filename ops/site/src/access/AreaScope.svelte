<script lang="ts">
	/**
	 * A page's area of ops (#375): the buttons and grids inside read it
	 * (scopeEditReason) to stay disabled where the person can only look. A
	 * page they have no access to (an address typed or shared) says so
	 * instead; the menu doesn't offer it.
	 */
	import type { Snippet } from "svelte";
	import { EmptyState } from "../ui";
	import { canSee, seeReason, setAreaScope } from "./access.svelte";

	let { area, children }: { area: string | undefined; children: Snippet } = $props();

	setAreaScope(() => area);
</script>

{#if canSee(area)}
	{@render children()}
{:else}
	<div class="no-access">
		<EmptyState title="No access" text={seeReason(area)} />
	</div>
{/if}

<style>
	.no-access {
		padding: var(--space-8) var(--page-gutter);
	}
</style>
