<script lang="ts">
	/**
	 * What a list shows when there is nothing in it: an icon, a short title,
	 * one line on what to do, and an optional action.
	 */
	import type { Snippet } from "svelte";
	import Icon from "../app/shell/Icon.svelte";

	let {
		icon = "inbox",
		title,
		text = "",
		tone = "default",
		action,
	}: {
		/** An Icon name. */
		icon?: string;
		title: string;
		text?: string;
		/** `error` for a failed load: same layout, danger colour. */
		tone?: "default" | "error";
		action?: Snippet;
	} = $props();
</script>

<div class="empty {tone}" role={tone === "error" ? "alert" : undefined}>
	<span class="mark" aria-hidden="true"><Icon name={tone === "error" ? "alert" : icon} size={20} /></span>
	<p class="title">{title}</p>
	{#if text}<p class="text">{text}</p>{/if}
	{#if action}<div class="action">{@render action()}</div>{/if}
</div>

<style>
	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-1);
		padding: var(--space-10) var(--space-4);
		text-align: center;
	}

	.mark {
		display: grid;
		place-items: center;
		width: 2.5rem;
		height: 2.5rem;
		margin-bottom: var(--space-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface-1);
		color: var(--fg-muted);
	}

	.title {
		font-size: var(--text-md);
		line-height: var(--leading-md);
		font-weight: 500;
		color: var(--fg);
	}

	.text {
		max-width: 28rem;
		font-size: var(--text-sm);
		line-height: var(--leading-sm);
		color: var(--fg-muted);
	}

	.action {
		margin-top: var(--space-3);
	}

	.error .mark {
		border-color: var(--danger-border);
		background: var(--danger-wash);
		color: var(--danger);
	}

	@media (max-width: 900px) {
		.empty {
			padding-block: var(--space-8);
		}

		.title {
			font-size: var(--text-base);
			line-height: var(--leading-base);
		}
	}
</style>
