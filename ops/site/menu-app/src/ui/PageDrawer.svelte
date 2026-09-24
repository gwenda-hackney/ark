<script lang="ts">
	/**
	 * Page-sized overlay. Desktop: right-hand drawer, same chrome as Help.
	 * Mobile (shell breakpoint): the panel covers the page.
	 * Use this for workflows and reference pages. Keep short confirms in Dialog.
	 */
	import type { Snippet } from "svelte";
	import { Icon } from "../shell";
	import Button from "./Button.svelte";
	import SidePanel from "./SidePanel.svelte";

	let {
		open = false,
		onclose,
		title,
		closeLabel = "Close",
		width = "min(26rem, 100%)",
		children,
	}: {
		open?: boolean;
		onclose: () => void;
		title: string;
		closeLabel?: string;
		width?: string;
		children: Snippet;
	} = $props();
</script>

<SidePanel {open} {onclose} ariaLabel={title} {width}>
	<div class="page">
		<header class="head">
			<h2>{title}</h2>
			<Button
				variant="ghost"
				size="sm"
				type="button"
				aria-label={closeLabel}
				onclick={onclose}
			>
				{#snippet icon()}
					<Icon name="close" size={16} />
				{/snippet}
			</Button>
		</header>
		<div class="body scrollbar-fade">
			{@render children()}
		</div>
	</div>
</SidePanel>

<style>
	.page {
		display: flex;
		flex-direction: column;
		flex: 1;
		height: 100%;
		min-height: 0;
	}

	.head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.85rem var(--card-pad) 0.75rem;
		border-bottom: 1px solid var(--border);
	}

	.head h2 {
		margin: 0;
		font-size: 1.05rem;
		letter-spacing: 0.02em;
	}

	.body {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 0.85rem var(--card-pad) 1.25rem;
	}
</style>
