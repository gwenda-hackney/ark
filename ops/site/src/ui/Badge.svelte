<script lang="ts">
	/**
	 * Small status label: a wash of the tone with a matching border. Use it for
	 * states (Live, Approved, Match), never for actions.
	 */
	import type { Snippet } from "svelte";
	import { toBadgeTone, type BadgeTone } from "./badge";

	let {
		tone = "neutral",
		label = "",
		title,
		children,
	}: {
		/** One of the five tones, or an older alias such as "muted" or "live". */
		tone?: BadgeTone | string;
		label?: string;
		title?: string;
		children?: Snippet;
	} = $props();

	const resolved = $derived(toBadgeTone(tone));
</script>

<span class="badge {resolved}" {title}>
	<span class="text">{#if children}{@render children()}{:else}{label}{/if}</span>
</span>

<style>
	/* Flex-centred in a 24px box. At line height 1 Inter centres its capitals,
	   which reads low for mostly lowercase words; centring on the lowercase
	   height reads high. Half a pixel up sits between the two, the same in
	   every browser (no text-box). */
	.badge {
		display: inline-flex;
		align-items: center;
		flex-shrink: 0;
		max-width: 100%;
		height: 1.5rem;
		padding: 0 0.625rem;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-sm);
		background: var(--surface-2);
		color: var(--fg-muted);
		font-size: var(--text-xs);
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		vertical-align: middle;
	}

	/* Ellipsis needs a block inside the flex box. Clip sideways only, so
	   descenders (the tail of "p" in "Up") still show under the trimmed box. */
	.text {
		min-width: 0;
		line-height: 1;
		transform: translateY(-0.5px);
		overflow-x: clip;
		overflow-y: visible;
		text-overflow: ellipsis;
	}

	.success {
		border-color: var(--success-border);
		background: var(--success-wash);
		color: var(--success);
	}

	.warning {
		border-color: var(--warning-border);
		background: var(--warning-wash);
		color: var(--warning);
	}

	.danger {
		border-color: var(--danger-border);
		background: var(--danger-wash);
		color: var(--danger);
	}

	.info {
		border-color: var(--info-border);
		background: var(--info-wash);
		color: var(--info);
	}
</style>
